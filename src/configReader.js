/**
 * What is left of config.json handling.
 *
 * Running a config file directly was removed in 1.1.0: the settings pane holds
 * the solver options now. A config file is still read in one place, "Import
 * from config.json", which finds it, checks it against the schema and hands it
 * to configToSettings. Everything here serves that, or the custom arguments the
 * pane accepts.
 */
const { dirname, join } = require("path");
const fs = require("fs");
const vscode = require("vscode");
const Ajv = require("ajv").default;

/**
 * Looks for the config file next to the given file and then in each directory
 * above it, so one config can serve a whole project instead of having to sit in
 * every folder that happens to hold a logic program.
 * @param {String} startDirectory Where to start looking
 * @param {String} configName The file name from the setting
 * @returns {String | undefined} The path of the first config found
 */
function findConfig(startDirectory, configName) {
    // A name with a separator is a path the user chose deliberately, so it is
    // taken as given rather than searched for
    const name = configName.replace(/^(\.\.(\/|\\|$))+/, "");
    if (name.includes("/") || name.includes("\\")) {
        const direct = join(startDirectory, name);
        return fs.existsSync(direct) ? direct : undefined;
    }

    let directory = startDirectory;
    for (;;) {
        const candidate = join(directory, name);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = dirname(directory);
        if (parent === directory) {
            return undefined;
        }
        directory = parent;
    }
}

/**
 * Turns Ajv's error objects into lines a human can act on.
 *
 * Ajv reports an object per problem, so interpolating the array straight into a
 * message produced "[object Object]" and told the user nothing. Each error names
 * the offending field by JSON path, so the line points at what to edit.
 * @param {Array} errors Ajv error objects
 * @returns {String[]} One readable line per problem
 */
function formatSchemaErrors(errors) {
    return (errors ?? []).map((error) => {
        // instancePath is "" for problems with the config object itself
        const field = error.instancePath ? error.instancePath.replace(/^\//, "").replace(/\//g, ".") : "(root)";
        // For a missing property Ajv names it in params rather than in the path
        const missing = error.params?.missingProperty;
        const where = missing ? (error.instancePath ? `${field}.${missing}` : missing) : field;
        const allowed = error.params?.allowedValues ? ` (allowed: ${error.params.allowedValues.join(", ")})` : "";
        return `${where}: ${error.message}${allowed}`;
    });
}

/**
 * Checks a parsed config against the schema.
 * @param {Object} config The parsed config
 * @param {String} contextAbsolutePath Where schema.json lives
 * @returns {String[]} One readable problem per mistake, empty when it is fine
 */
function validateConfigObject(config, contextAbsolutePath) {
    // allErrors reports every problem at once instead of stopping at the first,
    // so a config with several mistakes does not need several attempts to fix
    const ajv = new Ajv({ allErrors: true });
    const schema = require(join(contextAbsolutePath, `schema.json`));
    const validate = ajv.compile(schema);
    return validate(config) ? [] : formatSchemaErrors(validate.errors);
}

/**
 * Clingo options that customArgs must not set with either solver, because the
 * extension already controls them and clingo rejects or breaks on a second
 * occurrence:
 *   models/n     - the extension passes the model count separately
 *   version/help - make clingo print and exit without ever solving
 * Listed by option name, so both "--outf=2" and "--outf 2" are caught.
 */
const RESERVED_ARGS = new Set(["models", "n", "version", "help", "h"]);

/**
 * Reserved by the bundled solver alone.
 *
 * It exists only to hand back the JSON that `--outf=2` produces and parses
 * whatever comes back, so a second output format breaks the run outright. Your
 * own clingo is free to print in whatever format it is asked for: the panel
 * reads the JSON when it gets it and shows the text as it came when it does not,
 * which is the whole point of running your own binary.
 */
const WASM_RESERVED_ARGS = new Set(["outf", "text"]);

/**
 * Options that ask clingo for output of the user's choosing rather than ours,
 * which is the signal to stop asking for JSON and show what clingo produced.
 */
const OUTPUT_FORMAT_ARGS = new Set(["outf", "text", "pre"]);

/**
 * Whether these arguments already settle what clingo prints.
 * @param {String[]} [args]
 * @returns {Boolean}
 */
function choosesOutputFormat(args) {
    return (args ?? []).some((arg) => OUTPUT_FORMAT_ARGS.has(optionName(arg)));
}

/**
 * Extracts the option name from a token such as "--outf=2", "--outf 2" or "-n 3".
 * Returns undefined for anything that is not an option.
 * @param {String} token
 * @returns {String | undefined}
 */
function optionName(token) {
    const match = token.match(/^--?([A-Za-z][\w-]*)/);
    return match?.[1];
}

/**
 * Splits the free-text customArgs string into single clingo arguments, dropping
 * any that would collide with the options the extension sets itself. Without
 * this, a stray "--outf=n" makes clingo fail with an opaque "multiple
 * occurrences" error that gives the user no hint that their setting caused it.
 * @param {String} [customArgs] The raw string
 * @param {Object} [options]
 * @param {Boolean} [options.quiet] Skips the warning about dropped arguments.
 *        The settings pane rebuilds the arguments after every keystroke to
 *        preview them, and a notification per keystroke would bury the panel.
 * @param {String} [options.backend] "wasm" or "path". Your own clingo accepts
 *        arguments the bundled one cannot survive.
 * @returns {String[]}
 */
function readCustomArgs(customArgs, { quiet = false, backend = "wasm" } = {}) {
    const reservedHere = backend === "path" ? RESERVED_ARGS : new Set([...RESERVED_ARGS, ...WASM_RESERVED_ARGS]);
    if (customArgs == undefined) {
        // no custom args
        return [];
    }

    // split custom args into seperate tokens
    const tokens = customArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const result = [];
    // process tokens as possible pairs
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.startsWith("-") && i + 1 < tokens.length) {
            if (tokens[i + 1].startsWith("-")) {
                // next token is another flag, so current token is standalone
                result.push(token);
                continue;
            }
            let next = tokens[i + 1];
            result.push(`${token} ${next}`);
            i++;
        } else {
            // no possible pair remaining
            result.push(token);
        }
    }

    const reserved = result.filter((arg) => reservedHere.has(optionName(arg)));
    if (reserved.length && !quiet) {
        vscode.window.showWarningMessage(
            `Ignoring ${reserved.length} custom argument(s) reserved by this extension: ${reserved.join(", ")}`
        );
    }
    return result.filter((arg) => !reservedHere.has(optionName(arg)));
}

// optionName and formatSchemaErrors are exported for their own tests: both hold
// enough logic to be worth checking directly rather than through a caller
module.exports = {
    readCustomArgs,
    choosesOutputFormat,
    formatSchemaErrors,
    validateConfigObject,
    findConfig,
    optionName,
};

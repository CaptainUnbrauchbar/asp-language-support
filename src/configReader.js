/**
 * What is left of config.json handling.
 *
 * Running a config file directly was removed in 1.1.0: the settings pane holds
 */
const { dirname, join } = require("path");
const fs = require("fs");
const vscode = require("vscode");
const Ajv = require("ajv").default;

const RESERVED_ARGS = new Set(["models", "n", "version", "help", "h"]);
const WASM_RESERVED_ARGS = new Set(["outf", "text"]);
const OUTPUT_FORMAT_ARGS = new Set(["outf", "text", "pre"]);

/**
 * Looks for the config file next to the given file and then in each directory
 * above it, so one config can serve a whole project.
 * @param {String} startDirectory Where to start looking
 * @param {String} configName The file name from the setting
 * @returns {String | undefined} The path of the first config found
 */
function findConfig(startDirectory, configName) {
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
 * Turns Ajv's error objects into lines a human can read
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
    // allErrors so a config with several mistakes does not need several attempts
    const ajv = new Ajv({ allErrors: true });
    const schema = require(join(contextAbsolutePath, `schema.json`));
    const validate = ajv.compile(schema);
    return validate(config) ? [] : formatSchemaErrors(validate.errors);
}

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
 * @param {String} [customArgs] The raw string
 * @param {Object} [options]
 * @param {Boolean} [options.quiet] Skips the warning about dropped arguments,
 *        for the settings pane, which rebuilds the arguments on every keystroke.
 * @param {String} [options.backend] "wasm" or "path". Your own clingo accepts
 *        arguments the bundled one cannot survive.
 * @returns {String[]}
 */
function readCustomArgs(customArgs, { quiet = false, backend = "wasm" } = {}) {
    const reservedHere = backend === "path" ? RESERVED_ARGS : new Set([...RESERVED_ARGS, ...WASM_RESERVED_ARGS]);
    if (customArgs == undefined) {
        return [];
    }

    const tokens = customArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const result = [];
    // A flag followed by a value belongs together as one argument
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.startsWith("-") && i + 1 < tokens.length) {
            if (tokens[i + 1].startsWith("-")) {
                result.push(token);
                continue;
            }
            let next = tokens[i + 1];
            result.push(`${token} ${next}`);
            i++;
        } else {
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

module.exports = {
    readCustomArgs,
    choosesOutputFormat,
    formatSchemaErrors,
    validateConfigObject,
    findConfig,
    optionName,
};

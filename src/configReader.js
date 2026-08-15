const { basename, dirname, join } = require("path");
const fs = require("fs");
const vscode = require("vscode");
const Ajv = require("ajv").default;
var jsonConfig;

/**
 * Reads the configuration file and returns the arguments for Clingo.
 * @param {String} setConfig The configuration file name.
 * @param {Boolean} turnMessagesOff Reference whether to show messages or not.
 * @param {String} contextAbsolutePath The absolute path to the context.
 */
function readConfig(setConfig, turnMessagesOff, contextAbsolutePath) {
    let args = [];
    const pathToConfig = join(dirname(vscode.window.activeTextEditor.document.fileName), setConfig.replace(/^(..(\/|\|$))+/, ""));
    if (setConfig.match(/json$/i)) {
        jsonConfig = JSON.parse(fs.readFileSync(pathToConfig).toString());

        validateConfigSchema(contextAbsolutePath, pathToConfig);

        args.push(...readParallelMode());
        args.push(...readVerboseMode());
        args.push(...readTimeLimit());
        args.push(...readSolveLimit());
        args.push(...readStats());
        args.push(...readPreProcessor());
        args.push(...readModels());
        args.push(...readCustomArgs());
        args.push(...readFiles());
        args.push(...readConstants());

        if (!turnMessagesOff) {
            vscode.window.showInformationMessage(
                `Running with ${jsonConfig.name} ${jsonConfig.version} by ${jsonConfig.author}:\n ${args.join(
                    " "
                )}    (this message can be turned off in options)`
            );
        }
    } else {
        vscode.window.showInformationMessage(`Invalid config file ${pathToConfig}`);
    }

    return args;
}

function readConstants() {
    if (jsonConfig.args.constants != undefined) {
        return jsonConfig.args.constants.map((constant) => `--const ${constant}`);
    } else {
        return [];
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
 * @param {string} contextAbsolutePath
 * @param {string} pathToConfig
 */
function validateConfigSchema(contextAbsolutePath, pathToConfig) {
    // allErrors reports every problem at once instead of stopping at the first,
    // so a config with several mistakes does not need several runs to fix
    const ajv = new Ajv({ allErrors: true });
    const schema = require(join(contextAbsolutePath, `schema.json`));
    const validate = ajv.compile(schema);
    const valid = validate(jsonConfig);
    if (valid) {
        return;
    }

    const problems = formatSchemaErrors(validate.errors);
    const fileName = basename(pathToConfig);
    vscode.window
        .showWarningMessage(
            `${fileName} has ${problems.length} problem(s): ${problems.join("; ")}`,
            "Open Config"
        )
        .then((choice) => {
            if (choice === "Open Config") {
                vscode.window.showTextDocument(vscode.Uri.file(pathToConfig));
            }
        });
}

function readFiles() {
    if (jsonConfig.additionalFiles != undefined) {
        const fileList = jsonConfig.additionalFiles.map(
            (file) => `"${join(dirname(vscode.window.activeTextEditor.document.fileName), file.replace(/^(..(\/|\|$))+/, ""))}"`
        );
        return fileList;
    } else {
        return [];
    }
}

function readParallelMode() {
    if (jsonConfig.args.parallelMode && jsonConfig.args.parallelMode.useParallelMode) {
        const mode = jsonConfig.args.parallelMode.mode === undefined ? "compete" : jsonConfig.args.parallelMode.mode;
        return [`--parallel-mode ${jsonConfig.args.parallelMode.threads},${mode}`];
    } else {
        return [];
    }
}

function readVerboseMode() {
    if (jsonConfig.args.verboseMode != undefined) {
        return [`--verbose=${jsonConfig.args.verboseMode}`];
    } else {
        return [];
    }
}

function readTimeLimit() {
    if (jsonConfig.args.timeLimit != undefined) {
        const timeLimit = jsonConfig.args.timeLimit;
        return [`--time-limit=${timeLimit}`];
    } else {
        return [];
    }
}

function readSolveLimit() {
    if (jsonConfig.args.solveLimits != undefined) {
        const conflicts = jsonConfig.args.solveLimits.conflicts;
        const restarts = jsonConfig.args.solveLimits.restarts;
        return [`--solve-limit=${conflicts},${restarts}`];
    } else {
        return [];
    }
}

function readStats() {
    if (jsonConfig.args.stats != undefined) {
        return [`--stats=${jsonConfig.args.stats}`];
    } else {
        return [];
    }
}

function readPreProcessor() {
    if (jsonConfig.args.preProcessor) {
        return [`--pre`];
    } else {
        return [];
    }
}

function readModels() {
    if (jsonConfig.args.models != undefined) {
        return [`--models ${jsonConfig.args.models}`];
    } else {
        return [];
    }
}

/**
 * Clingo options that customArgs must not set, because the extension already
 * controls them and clingo rejects or breaks on a second occurrence:
 *   outf   - the extension passes --outf=2 to get the JSON it parses
 *   models - the extension passes the model count separately
 *   text   - overrides the JSON output the same way --outf does
 *   version/help - make clingo print and exit without ever solving
 * Listed by option name, so both "--outf=2" and "--outf 2" are caught.
 */
const RESERVED_ARGS = new Set(["outf", "models", "n", "text", "version", "help", "h"]);

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
 * occurrences" error that gives the user no hint that their config caused it.
 * @param {String} [customArgs] The raw string, defaulting to the one in the loaded config
 * @returns {String[]}
 */
function readCustomArgs(customArgs = jsonConfig?.args?.customArgs) {
    if (customArgs != undefined) {
        const str = customArgs;
        // split custom args into seperate tokens
        const tokens = str.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
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

        const reserved = result.filter((arg) => RESERVED_ARGS.has(optionName(arg)));
        if (reserved.length) {
            vscode.window.showWarningMessage(
                `Ignoring ${reserved.length} custom argument(s) reserved by this extension: ${reserved.join(", ")}`
            );
        }
        return result.filter((arg) => !RESERVED_ARGS.has(optionName(arg)));
    } else {
        // no custom args
        return [];
    }
}

module.exports = {
    readConfig,
    readCustomArgs,
    formatSchemaErrors,
    optionName,
    RESERVED_ARGS,
    jsonConfig,
};

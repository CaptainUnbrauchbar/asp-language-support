const { dirname, join } = require("path");
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
 * @param {string} contextAbsolutePath
 * @param {string} pathToConfig
 */
function validateConfigSchema(contextAbsolutePath, pathToConfig) {
    const ajv = new Ajv();
    const schema = require(join(contextAbsolutePath, `schema.json`));
    const validate = ajv.compile(schema);
    const valid = validate(jsonConfig);
    if (!valid) vscode.window.showInformationMessage(`Config file ${pathToConfig} is not as expected: ${validate.errors}`);
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

function readCustomArgs() {
    if (jsonConfig.args.customArgs != undefined) {
        const str = jsonConfig.args.customArgs;
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
        return result;
    } else {
        // no custom args
        return [];
    }
}

module.exports = {
    readConfig,
    jsonConfig,
};

const { dirname,join } = require('path');
const fs = require('fs');
const vscode = require('vscode');
const Ajv = require("ajv").default
var jsonConfig;

/**
 * @param {string} setConfig
 * @param {boolean} turnMessagesOff
 * @param {string} contextAbsolutePath
 */
function readConfig(setConfig, turnMessagesOff, contextAbsolutePath) {
    let args = "";
    const pathToConfig = join(dirname(vscode.window.activeTextEditor.document.fileName), setConfig);
    if (setConfig.match(/json$/i)) {
            jsonConfig = JSON.parse(fs.readFileSync(pathToConfig).toString());

            validateConfigSchema(contextAbsolutePath,pathToConfig);

            args += readFiles();
            args += readParallelMode();
            args += readOutputFormat();
            args += readVerboseMode();
            args += readTimeLimit();
            args += readSolveLimit();
            args += readStats();
            args += readPreProcessor();
            args += readModels();
            args += readCustomArgs();

            if (!turnMessagesOff) {
                vscode.window.showInformationMessage(`Running with ${jsonConfig.name} ${jsonConfig.version} by ${jsonConfig.author}:\n ${args}    (this message can be turned off in options)`);
            }
    } else {
        vscode.window.showInformationMessage(`Invalid config file ${pathToConfig}`);
    }

    return args;
}

/**
 * @param {string} contextAbsolutePath
 * @param {string} pathToConfig
 */
function validateConfigSchema(contextAbsolutePath,pathToConfig) {
    const ajv = new Ajv();
    const schema = require(join(contextAbsolutePath, `schema.json`));
    const validate = ajv.compile(schema);
    const valid = validate(jsonConfig);
    if (!valid) vscode.window.showInformationMessage(`Config file ${pathToConfig} is not as expected: ${validate.errors}`);
}

function readFiles() {
    if (jsonConfig.additionalFiles != undefined) {
        const fileList = jsonConfig.additionalFiles.map(file => 
            `"${join(dirname(vscode.window.activeTextEditor.document.fileName), file)}"`
        );
        return ` ${fileList.join(' ')}`
    } else {
        return ``;
    }
}

function readParallelMode() {
    if (jsonConfig.args.parallelMode && jsonConfig.args.parallelMode.useParallelMode) {
        const mode = jsonConfig.args.parallelMode.mode === undefined ? "compete" : jsonConfig.args.parallelMode.mode;
        return ` --parallel-mode ${jsonConfig.args.parallelMode.threads},${mode}`;
    } else {
        return ``;
    }
}

function readOutputFormat() {
    if (jsonConfig.args.outputFormat != undefined) {
        return ` --outf=${jsonConfig.args.outputFormat}`;
    } else {
        return ``;
    }
}

function readVerboseMode() {
    if (jsonConfig.args.verboseMode != undefined) {
        return ` --verbose=${jsonConfig.args.verboseMode}`;
    } else {
        return ``;
    }
}

function readTimeLimit() {
    if (jsonConfig.args.timeLimit != undefined) {
        const timeLimit = jsonConfig.args.timeLimit;
        return ` --time-limit=${timeLimit}`;
    } else {
        return ``;
    }
}

function readSolveLimit() {
    if (jsonConfig.args.solveLimits != undefined) {
        const conflicts = jsonConfig.args.solveLimits.conflicts;
        const restarts = jsonConfig.args.solveLimits.restarts;
        return ` --solve-limit=${conflicts},${restarts}`;
    } else {
        return ``;
    }
}

function readStats() {
    if (jsonConfig.args.stats != undefined) {
        return ` --stats=${jsonConfig.args.stats}`;
    } else {
        return ``;
    }
}

function readPreProcessor() {
    if (jsonConfig.args.preProcessor) {
        return ` --pre`;
    } else {
        return ``;
    }
}

function readModels() {
    if (jsonConfig.args.models != undefined) {
        return ` --models ${jsonConfig.args.models}`;
    } else {
        return ``;
    }
}

function readCustomArgs() {
    if (jsonConfig.args.customArgs != undefined) {
        return ` ${jsonConfig.args.customArgs}`;
    } else {
        return ``;
    }
}

module.exports = {
    readConfig,
    jsonConfig
}

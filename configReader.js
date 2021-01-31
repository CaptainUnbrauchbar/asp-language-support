const { dirname } = require('path');
const vscode = require('vscode');
var jsonConfig;

/**
 * @param {string} setConfig
 */
function readConfig(setConfig) {
    let args = "";

    const pathToConfig = `${dirname(vscode.window.activeTextEditor.document.fileName)}\\${setConfig}`;
    if (setConfig.match(/json$/i)) {
            jsonConfig = require(pathToConfig);
            args += readParallelMode();
            vscode.window.showInformationMessage(args);
    } else {
        vscode.window.showInformationMessage(`Could not find config file ${pathToConfig}`);
    }

    return args;
}

function readParallelMode() {
    if (jsonConfig.parallelMode && jsonConfig.parallelMode.useParallelMode) {
        const mode = jsonConfig.parallelMode.mode == null ? "compete" : jsonConfig.parallelMode.mode;
        return `--parallel-mode ${jsonConfig.parallelMode.threads},${mode}`;
    } else {
        return ``;
    }
}

module.exports = {
    readConfig
}
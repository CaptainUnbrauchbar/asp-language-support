const vscode = require("vscode");
const which = require("which");
const { dirname, join } = require("path");
const fs = require("fs");
const { readConfig } = require("./configReader.js");
const { spawn } = require("child_process");
const { WebviewProvider } = require("./webviewProvider.js");
const { runClingoWasmForFileWithProgress } = require("./runClingoWasmForFileWithProgress.js");
const { runClingoPathForFileWithProgress } = require("./runClingoPathForFileWithProgress.js");
const clingo = require("clingo-wasm");

//E_SAT       = 10, !< At least one model was found.
//E_EXHAUST   = 20, !< Search-space was completely examined.
//E_SAT & E_EXHAUST = 30
const CLINGO_SUCCESS_CODES = [10, 20, 30];

/**
 * Main program. Activates the extension.
 * @param {vscode.ExtensionContext} context Context of VSCode
 */
function activate(context) {
    ////////////////////////////////////////////
    /// Code to run when extension activates ///
    ////////////////////////////////////////////

    var turnMessagesOff = vscode.workspace.getConfiguration("aspLanguage").get("turnMessagesOff");
    var usePathClingo = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo");
    var setConfig = vscode.workspace.getConfiguration("aspLanguage").get("setConfig");
    var path;

    const provider = new WebviewProvider(context.extensionUri);
    if (usePathClingo) {
        usePath();
    }

    /**
     * Function to run Clingo with WASM for a given file path and options. Acts as wrapper for runClingoWasmForFileWithProgress located in runClingoWasmForFileWithProgress.js
     * This is needed so runClingoWasmForFileWithProgress can be tested with Jest.
     * @param {String} filePath
     * @param {Number} models
     * @param {String[]} options
     * @returns {Promise<clingo.ClingoResult | clingo.ClingoError>} The result of the Clingo run.
     */
    async function runClingoWasmForFile(filePath, models = undefined, options = undefined) {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: "WASM Clingo is running",
            },
            async (progress) => await runClingoWasmForFileWithProgress(vscode, progress, filePath, models, options)
        );
    }

    /**
     * Function to run Clingo with the path to the executable. It spawns a new process and runs Clingo with the given arguments.
     * This is needed so runClingoPathForFileWithProgress can be tested with Jest but testing is currently only performed locally as this would require putting a binary into the repository.
     * @param {String} filePath
     * @param {Number} models
     * @param {String[]} options
     * @returns {Promise<any>} Clingo result as JSON Object [code, output, errorOutput]
     */
    async function runClingoPathForFile(filePath, models = undefined, options = undefined) {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: "Path Clingo is running",
            },
            async (progress) => await runClingoPathForFileWithProgress(vscode, progress, path, filePath, models, options)
        );
    }

    /**
     * Function to format the result of Clingo WASM. It formats the result into a more readable format.
     * @param {any} result
     * @returns {Object} The formatted result readable by the output interface.
     */
    function formatWasmResult(result) {
        return {
            solver: result?.Solver,
            models: `${result?.Models.Number} (${result?.Models.More})`,
            calls: result?.Calls,
            time: {
                total: result?.Time.Total,
                solve: result?.Time.Solve,
                model: result?.Time.Model,
            },
            answers: result?.Call.flatMap((call) => call.Witnesses.map((witness) => witness.Value.join(", "))),
            result: result?.Result,
        };
    }

    /**
     * Function to check if the path to Clingo is set in the configuration. If not, it uses the bundled version of Clingo.
     * Also checks if clingo exists on path.
     * Sets the variable "path" to the path of the clingo executable if usePathClingo is set to true.
     */
    function usePath() {
        if (!usePathClingo && !turnMessagesOff) {
            vscode.window.showInformationMessage("Using bundled version of Clingo! (this message can be turned off in options)");
            return;
        }
        try {
            path = which.sync("clingo");
            if (!turnMessagesOff) {
                vscode.window.showInformationMessage(
                    'Using your own version of Clingo: "' + path + '" (this message can be turned off in options)'
                );
            }
        } catch {
            vscode.window.showErrorMessage(
                "Clingo was not found on your PATH. Disable the 'usePathClingo' option to use the bundled version of Clingo"
            );
        }
    }

    /**
     * Wrapper function for runClingoWasmForFile. It runs Clingo with the given file path and models and fetches config options first.
     * It formats the result and posts it to the active webview panel.
     * @param {Number} models The number of models to run.
     * @param {Boolean} useConfig If true, it uses the config file to run Clingo.
     */
    async function runBundledClingo(models, useConfig = false) {
        let additionalArgs = [];
        let cfgFile = [];
        // Process config information
        if (useConfig) {
            cfgFile = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath(""));
            models = cfgFile.find((arg) => arg.startsWith("--models")).split(" ")[1];
            additionalArgs = cfgFile.filter((arg) => !arg.startsWith("--models"));
        }

        const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, models, additionalArgs);

        const answers = formatWasmResult(clingoResult);

        provider._view?.webview.postMessage({
            type: "updateOutput",
            answers,
            useConfig,
            cfgFile,
        });
    }

    /**
     * Function to run Clingo with the path to the executable. It spawns a new process and runs Clingo with the given arguments.
     * The results are posted to an active webview panel.
     * @param {Number} models The number of models to run.
     * @param {Boolean} useConfig If true, it uses the config file to run Clingo.
     */
    async function runPathClingo(models, useConfig = false) {
        let additionalArgs = [];
        // Process config information
        if (useConfig) {
            const cfgFile = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath(""));
            models = cfgFile.find((arg) => arg.startsWith("--models")).split(" ")[1];
            additionalArgs = cfgFile.filter((arg) => !arg.startsWith("--models"));
        }

        const clingoResult = await runClingoPathForFile(vscode.window.activeTextEditor.document.fileName, models, additionalArgs);

        if (CLINGO_SUCCESS_CODES.includes(clingoResult.code)) {
            provider._view?.webview.postMessage({
                type: "updateOutputString",
                answers: clingoResult.output,
            });
        } else {
            vscode.window.showErrorMessage(`Clingo process exited with code ${clingoResult.code}: ${clingoResult.errorOutput}`);
        }
    }

    /**
     * Function to run Clingo with the given models. It checks if the user has selected a valid file and runs Clingo with the given models.
     * @param {Number} models The number of models to run.
     * @param {Boolean} useConfig If true, it uses the config file to run Clingo.
     * @returns
     */
    async function runClingoCommand(models, useConfig = false) {
        if (vscode.window.activeTextEditor.document.languageId !== "asp") {
            vscode.window.showErrorMessage("No active text editor found. Please open a file to run Clingo on.");
            return;
        }
        if (usePathClingo) {
            await runPathClingo(models, useConfig);
        } else {
            await runBundledClingo(models, useConfig);
        }
    }

    ////////////////////////////////////////////////////////////////////////////////
    /// VSCode Extension Setup below (Commands, Subscriptions and Configuration) ///
    ////////////////////////////////////////////////////////////////////////////////

    // Register computeAllSetsCommand command for the extension
    const computeAllSetsCommand = vscode.commands.registerCommand("answer-set-programming-language-support.runinterminalall", async () => {
        // Focus ASP Tab for easier access to output
        vscode.commands.executeCommand("workbench.view.extension.aspContainer");
        // Run WASM Clingo
        await runClingoCommand(0, false);
    });

    // Register computeSingleSetCommand command for the extension
    const computeSingleSetCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.runinterminalsingle",
        async () => {
            // Focus ASP Tab for easier access to output
            vscode.commands.executeCommand("workbench.view.extension.aspContainer");
            // Run WASM Clingo
            await runClingoCommand(1, false);
        }
    );

    // Register computeConfigCommand command for the extension
    const computeConfigCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.runinterminalconfig",
        async function () {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("No active text editor found. Please open a file to run Clingo on.");
                return;
            }

            // Focus ASP Tab for easier access to output
            vscode.commands.executeCommand("workbench.view.extension.aspContainer");

            // Create configPath and sanitize it
            const configPath = join(dirname(vscode.window.activeTextEditor.document.fileName), setConfig.replace(/^(..(\/|\|$))+/, ""));

            // Check if config exists, otherwise ask user if they wants to create a new one
            if (fs.existsSync(configPath)) {
                // Run WASM Clingo with config file (bool operator)
                runClingoCommand(0, true);
            } else {
                const chosenOption = Promise.resolve(
                    vscode.window.showInformationMessage(
                        `Could not find config File ${setConfig} in working directory. Do you want to create a new config?`,
                        "Yes",
                        "No"
                    )
                );
                chosenOption.then(function (value) {
                    if (value === "Yes") {
                        vscode.commands.executeCommand("answer-set-programming-language-support.initClingoConfig");
                        vscode.window.showInformationMessage(`Config config.json created in working directory!`);
                    }
                });
            }
        }
    );

    // Register initClingoConfig command for the extension to create a new config file for the user
    const initClingoConfig = vscode.commands.registerCommand("answer-set-programming-language-support.initClingoConfig", function () {
        const sampleConfig = fs.readFileSync(join(context.asAbsolutePath(""), `sampleConfig.json`));
        fs.writeFileSync(join(dirname(vscode.window.activeTextEditor.document.fileName), `config.json`), sampleConfig);
        // Update the configuration to use the new config file
        vscode.workspace.getConfiguration("aspLanguage").update("setConfig", "config.json");
    });

    context.subscriptions.push(vscode.window.registerWebviewViewProvider(provider.viewType, provider));
    context.subscriptions.push(computeAllSetsCommand);
    context.subscriptions.push(computeSingleSetCommand);
    context.subscriptions.push(computeConfigCommand);
    context.subscriptions.push(initClingoConfig);

    //Listeners for Configuration Options, updates the variables if the user changes them in the settings
    vscode.workspace.onDidChangeConfiguration((event) => {
        const confTurnMessagesOff = event.affectsConfiguration("aspLanguage.turnMessagesOff");
        const confUsePathClingo = event.affectsConfiguration("aspLanguage.usePathClingo");
        const confSetConfig = event.affectsConfiguration("aspLanguage.setConfig");

        if (confTurnMessagesOff) {
            turnMessagesOff = vscode.workspace.getConfiguration("aspLanguage").get("turnMessagesOff");
        }
        if (confUsePathClingo) {
            usePathClingo = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo");
            usePath();

            // Refresh the webview HTML
            if (provider._view) {
                provider._view.webview.html = provider._getHtmlForWebview(provider._view.webview);
            }
        }
        if (confSetConfig) {
            setConfig = vscode.workspace.getConfiguration("aspLanguage").get("setConfig");
        }
    });
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate,
};

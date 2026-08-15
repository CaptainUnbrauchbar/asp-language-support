const vscode = require("vscode");
const which = require("which");
const { dirname, join } = require("path");
const fs = require("fs");
const { readConfig } = require("./configReader.js");
const { WebviewProvider } = require("./webviewProvider.js");
const { runClingoWasmForFileWithProgress } = require("./runClingoWasmForFileWithProgress.js");
const { runClingoPathForFileWithProgress } = require("./runClingoPathForFileWithProgress.js");
const { abortClingo } = require("./clingoWasm.js");
const { formatWasmResult, extractAnswers } = require("./formatWasmResult.js");
const { ClingoStatusBar, parseClingoVersion, shouldShowStatusBar } = require("./statusBar.js");

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
    var clingoRunning = false;

    const provider = new WebviewProvider(context.extensionUri);
    const statusBar = new ClingoStatusBar(vscode);

    // Register the listeners before the first check, so an editor that becomes
    // active while activation is still running cannot slip past unnoticed
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBarVisibility));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(updateStatusBarVisibility));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(updateStatusBarVisibility));

    usePath();
    updateStatusBarVisibility();

    /**
     * The status bar item only makes sense while an ASP file is open.
     */
    function updateStatusBarVisibility() {
        statusBar.setVisible(shouldShowStatusBar(vscode.window.activeTextEditor, vscode.workspace.textDocuments));
    }

    /**
     * Tracks whether a solve is in flight, both to reject overlapping runs and to
     * drive the "aspLanguage.clingoRunning" context key that shows the stop button.
     * @param {Boolean} running
     */
    function setClingoRunning(running) {
        clingoRunning = running;
        statusBar.setRunning(running);
        vscode.commands.executeCommand("setContext", "aspLanguage.clingoRunning", running);
    }

    /**
     * Function to run Clingo with WASM for a given file path and options. Acts as wrapper for runClingoWasmForFileWithProgress located in runClingoWasmForFileWithProgress.js
     * This is needed so runClingoWasmForFileWithProgress can be tested with Jest.
     * The progress notification is cancellable: cancelling terminates the solver worker.
     * @param {String} filePath
     * @param {Number} models
     * @param {String[]} options
     * @returns {Promise<import("clingo-wasm").ClingoResult | null>} The result of the Clingo run, or null if it failed or was cancelled.
     */
    async function runClingoWasmForFile(filePath, models = undefined, options = undefined) {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "WASM Clingo is running",
                cancellable: true,
            },
            async (progress, token) => await runClingoWasmForFileWithProgress(vscode, progress, filePath, models, options, token)
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
     * Function to check if the path to Clingo is set in the configuration. If not, it uses the bundled version of Clingo.
     * Also checks if clingo exists on path.
     * Sets the variable "path" to the path of the clingo executable if usePathClingo is set to true.
     * Which solver ends up being used is reported by the status bar item rather
     * than by a notification on every activation.
     */
    function usePath() {
        if (!usePathClingo) {
            path = undefined;
            statusBar.setSolver("wasm");
            return;
        }
        try {
            path = which.sync("clingo");
            statusBar.setSolver("path");
        } catch {
            path = undefined;
            statusBar.setSolver("missing");
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
            // "models" is optional in the config schema, so keep the caller's value when it is absent
            models = cfgFile.find((arg) => arg.startsWith("--models"))?.split(" ")[1] ?? models;
            additionalArgs = cfgFile.filter((arg) => !arg.startsWith("--models"));
        }

        const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, models, additionalArgs);

        // Cancelled or failed runs have already been reported to the user, and
        // carry no answers for the webview to render
        if (!clingoResult) {
            return;
        }

        const answers = formatWasmResult(clingoResult);

        // Clingo only reports its version as part of a result
        statusBar.setVersion(parseClingoVersion(clingoResult.Solver));

        // The webview only receives the first MAX_RENDERED_ANSWERS, so keep the
        // complete list here for copying
        provider.setAnswers(extractAnswers(clingoResult));

        provider.post({
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
            // "models" is optional in the config schema, so keep the caller's value when it is absent
            models = cfgFile.find((arg) => arg.startsWith("--models"))?.split(" ")[1] ?? models;
            additionalArgs = cfgFile.filter((arg) => !arg.startsWith("--models"));
        }

        const clingoResult = await runClingoPathForFile(vscode.window.activeTextEditor.document.fileName, models, additionalArgs);

        if (CLINGO_SUCCESS_CODES.includes(clingoResult.code)) {
            // The binary prints its version on the first line of its output
            statusBar.setVersion(parseClingoVersion(clingoResult.output));

            provider.post({
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
        if (vscode.window.activeTextEditor?.document.languageId !== "asp") {
            vscode.window.showErrorMessage("No active text editor found. Please open a file to run Clingo on.");
            return;
        }
        if (clingoRunning) {
            vscode.window.showWarningMessage("Clingo is already running. Stop the current run before starting a new one.");
            return;
        }

        setClingoRunning(true);
        try {
            if (usePathClingo) {
                await runPathClingo(models, useConfig);
            } else {
                await runBundledClingo(models, useConfig);
            }
        } finally {
            setClingoRunning(false);
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

    // Register stopClingo command, which aborts a solve that is stuck or taking too long.
    // Before clingo-wasm 0.6.0 this was impossible and an endless loop meant restarting VSCode.
    const stopClingoCommand = vscode.commands.registerCommand("answer-set-programming-language-support.stopclingo", async () => {
        if (!clingoRunning) {
            vscode.window.showInformationMessage("Clingo is not running.");
            return;
        }
        if (usePathClingo) {
            vscode.window.showInformationMessage("Use the prompt shown by the running process to stop your own version of Clingo.");
            return;
        }
        await abortClingo();
    });

    // Register initClingoConfig command for the extension to create a new config file for the user
    const initClingoConfig = vscode.commands.registerCommand("answer-set-programming-language-support.initClingoConfig", function () {
        const sampleConfig = fs.readFileSync(join(context.asAbsolutePath(""), `sampleConfig.json`));
        fs.writeFileSync(join(dirname(vscode.window.activeTextEditor.document.fileName), `config.json`), sampleConfig);
        // Update the configuration to use the new config file
        vscode.workspace.getConfiguration("aspLanguage").update("setConfig", "config.json");
    });

    // Keep the results when the panel is hidden, otherwise switching to the
    // terminal and back throws them away and the program has to be solved again
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(provider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        })
    );
    context.subscriptions.push(computeAllSetsCommand);
    context.subscriptions.push(computeSingleSetCommand);
    context.subscriptions.push(computeConfigCommand);
    context.subscriptions.push(stopClingoCommand);
    context.subscriptions.push(initClingoConfig);
    context.subscriptions.push(statusBar);

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
async function deactivate() {
    // Tear down the solver worker so an in-flight run cannot outlive the extension
    await abortClingo();
}

module.exports = {
    activate,
    deactivate,
};

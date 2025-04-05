const vscode = require("vscode");
const which = require("which");
const { dirname, join } = require("path");
const fs = require("fs");
const { readConfig } = require("./configReader.js");
const { spawn } = require("child_process");
const { WebviewProvider } = require("./webviewProvider.js");
const { runClingoWasmForFileWithProgress } = require("./runClingoWasmForFileWithProgress.js");

//E_SAT       = 10, !< At least one model was found.
//E_EXHAUST   = 20, !< Search-space was completely examined.
//E_SAT & E_EXHAUST = 30
const CLINGO_SUCCESS_CODES = [10, 20, 30];

/**
 * @param {vscode.ExtensionContext} context Context of VSCode
 */
function activate(context) {
    const provider = new WebviewProvider(context.extensionUri);

    async function runClingoWasmForFile(filePath, models = undefined, options = undefined) {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: "Clingo is running",
            },
            async (progress) => await runClingoWasmForFileWithProgress(vscode, progress, filePath, models, options)
        );
    }

    function formatWasmResult(result) {
        return {
            solver: result.Solver,
            models: `${result.Models.Number} (${result.Models.More})`,
            calls: result.Calls,
            time: {
                total: result.Time.Total,
                solve: result.Time.Solve,
                model: result.Time.Model,
            },
            answers: result.Call.flatMap((call) => call.Witnesses.map((witness) => witness.Value.join(", "))),
            result: result.Result,
        };
    }

    //Function to set path to system PATH if configuration option aspLanguage.usePathClingo is enabled
    function usePath() {
        if (!usePathClingo && !turnMessagesOff) {
            vscode.window.showInformationMessage(
                "Using bundled version of Clingo!    (this message can be turned off in options)"
            );
            return;
        }

        try {
            path = which.sync("clingo");
            if (!turnMessagesOff) {
                vscode.window.showInformationMessage(
                    'Using your own version of Clingo: "' + path + '"    (this message can be turned off in options)'
                );
            }
        } catch {
            vscode.window.showErrorMessage(
                "Clingo was not found on your PATH. Disable the 'usePathClingo' option to use the bundled version of Clingo"
            );
        }
    }

    var newTerminal = vscode.workspace.getConfiguration("aspLanguage").get("terminalMode");
    var turnMessagesOff = vscode.workspace.getConfiguration("aspLanguage").get("turnMessagesOff");
    var usePathClingo = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo");
    var additionalArgs = vscode.workspace.getConfiguration("aspLanguage").get("additionalArgs");
    var setConfig = vscode.workspace.getConfiguration("aspLanguage").get("setConfig");
    var path;
    var terminalType = vscode.workspace.getConfiguration("terminal").get("integrated.defaultProfile.windows");

    //double if to prevent unnecessary info messages
    if (usePathClingo) {
        usePath();
    }

    function getPath() {
        if (terminalType === "Git Bash") {
            return `"${path}"`;
        } else {
            return `${path}`;
        }
    }

    function runPathClingo(models) {
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: "Clingo is running",
            },
            (progress) => {
                return new Promise((resolve, reject) => {
                    progress.report({
                        increment: 0,
                        message: "Starting Clingo...",
                    });

                    const command = getPath();
                    const args = [`"${vscode.window.activeTextEditor.document.fileName}"`, `${models}`];
                    const process = spawn(command, args, { shell: true });

                    let output = "";
                    let errorOutput = "";
                    let processTerminated = false; // Track if the process was terminated

                    // Capture stdout
                    process.stdout.on("data", (data) => {
                        output += data.toString();
                    });

                    // Capture stderr
                    process.stderr.on("data", (data) => {
                        errorOutput += data.toString();
                    });

                    // Show a popup after 5 seconds asking if the user wants to terminate the process
                    const timeout = setTimeout(() => {
                        if (!processTerminated) {
                            vscode.window
                                .showWarningMessage(
                                    "Clingo is taking longer than expected. Do you want to terminate the process?",
                                    "Yes",
                                    "No"
                                )
                                .then((choice) => {
                                    if (choice === "Yes") {
                                        process.kill(); // Terminate the process
                                        processTerminated = true;
                                        vscode.window.showInformationMessage("Clingo process terminated.");
                                        reject(new Error("Clingo process was terminated by the user."));
                                    }
                                });
                        }
                    }, 5000); // 5-second delay

                    // Handle process close
                    process.on("close", (code) => {
                        clearTimeout(timeout); // Clear the timeout if the process finishes
                        if (processTerminated) {
                            return; // Skip further processing if the process was terminated
                        }

                        if (CLINGO_SUCCESS_CODES.includes(code)) {
                            progress.report({
                                increment: 100,
                                message: "Clingo finished successfully!",
                            });
                            provider._view?.webview.postMessage({
                                type: "updateOutputString",
                                answers: output,
                            });
                            resolve();
                        } else {
                            vscode.window.showErrorMessage(`Clingo process exited with code ${code}: ${errorOutput}`);
                            reject(new Error(`Clingo process exited with code ${code}`));
                        }
                    });
                });
            }
        );
    }

    async function runBundledClingo(models) {
        const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, models);
        const answers = formatWasmResult(clingoResult);
        provider._view?.webview.postMessage({
            type: "updateOutput",
            answers,
        });
    }

    async function runClingoCommand(models) {
        if (!vscode.window.activeTextEditor) {
            vscode.window.showErrorMessage("No active text editor found. Please open a file to run Clingo on.");
            return;
        }

        if (usePathClingo) {
            runPathClingo(models);
        } else {
            await runBundledClingo(models);
        }
    }

    const computeAllSetsCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.runinterminalall",
        async () => runClingoCommand(0)
    );

    const computeSingleSetCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.runinterminalsingle",
        async () => runClingoCommand(1)
    );

    const computeConfigCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.runinterminalconfig",
        async function () {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showErrorMessage("No active text editor found. Please open a file to run Clingo on.");
                return;
            }

            const configPath = join(
                dirname(vscode.window.activeTextEditor.document.fileName),
                setConfig.replace(/^(..(\/|\|$))+/, "")
            );
            if (fs.existsSync(configPath)) {
                if (usePathClingo) {
                    additionalArgs = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath(""));

                    const command = getPath();
                    const args = [`"${vscode.window.activeTextEditor.document.fileName}"`, ...additionalArgs];
                    const process = spawn(command, args, { shell: true });

                    let output = "";
                    let errorOutput = "";

                    process.stdout.on("data", (data) => {
                        output += data.toString();
                    });

                    process.stderr.on("data", (data) => {
                        errorOutput += data.toString();
                    });

                    process.on("close", (code) => {
                        if (CLINGO_SUCCESS_CODES.includes(code)) {
                            provider._view?.webview.postMessage({
                                type: "updateOutputString",
                                answers: output,
                            });
                        } else {
                            vscode.window.showErrorMessage(`Clingo process exited with code ${code}: ${errorOutput}`);
                        }
                    });
                } else {
                    const cfgFile = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath(""));
                    const models = cfgFile.find((arg) => arg.startsWith("--models")).split(" ")[1];
                    additionalArgs = cfgFile.filter((arg) => !arg.startsWith("--models"));

                    const clingoResult = await runClingoWasmForFile(
                        vscode.window.activeTextEditor.document.fileName,
                        parseInt(models),
                        additionalArgs
                    );
                    const answers = formatWasmResult(clingoResult);
                    provider._view?.webview.postMessage({
                        type: "updateOutput",
                        answers,
                        cfgFile,
                    });
                }
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

    const initClingoConfig = vscode.commands.registerCommand(
        "answer-set-programming-language-support.initClingoConfig",
        function () {
            const sampleConfig = fs.readFileSync(join(context.asAbsolutePath(""), `sampleConfig.json`));
            fs.writeFileSync(
                join(dirname(vscode.window.activeTextEditor.document.fileName), `config.json`),
                sampleConfig
            );

            vscode.workspace.getConfiguration("aspLanguage").update("setConfig", "config.json");
        }
    );

    context.subscriptions.push(vscode.window.registerWebviewViewProvider(provider.viewType, provider));
    context.subscriptions.push(computeAllSetsCommand);
    context.subscriptions.push(computeSingleSetCommand);
    context.subscriptions.push(computeConfigCommand);
    context.subscriptions.push(initClingoConfig);

    //Listeners for Configuration Options
    vscode.workspace.onDidChangeConfiguration((event) => {
        const confTurnMessagesOff = event.affectsConfiguration("aspLanguage.turnMessagesOff");
        const confUsePathClingo = event.affectsConfiguration("aspLanguage.usePathClingo");
        const confSetConfig = event.affectsConfiguration("aspLanguage.setConfig");
        const confTerminalProfile = event.affectsConfiguration("terminal.integrated.defaultProfile.windows");

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
        if (confTerminalProfile) {
            terminalType = vscode.workspace.getConfiguration("terminal").get("integrated.defaultProfile.windows");
        }
    });
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate,
};

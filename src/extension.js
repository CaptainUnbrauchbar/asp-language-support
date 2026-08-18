const vscode = require("vscode");
const which = require("which");
const { basename, dirname, join } = require("path");
const fs = require("fs");
const { findConfig, validateConfigObject, readCustomArgs, choosesOutputFormat } = require("./configReader.js");
const { WebviewProvider } = require("./webviewProvider.js");
const { runClingoWasmForFileWithProgress } = require("./runClingoWasmForFileWithProgress.js");
const { runClingoPathForFileWithProgress, stopClingoProcess } = require("./runClingoPathForFileWithProgress.js");
const { abortClingo, threadsAvailable } = require("./clingoWasm.js");
const { formatWasmResult, parseClingoOutput, extractAnswers, partialResultFromModels } = require("./formatWasmResult.js");
const { ClingoStatusBar, parseClingoVersion, shouldShowStatusBar } = require("./statusBar.js");
const { formatClingoCommand } = require("./clingoCommand.js");
const { resolveIncludes } = require("./resolveIncludes.js");
const { workspaceRootFor } = require("./workspaceRoot.js");
const { showReleaseNote, RELEASE_NOTE_KEY } = require("./releaseNote.js");
const {
    DEFAULT_SETTINGS,
    describeFields,
    normalizeSettings,
    settingsToArgs,
    configToSettings,
    settingsToConfig,
} = require("./solverSettings.js");

/** Where the panel's solver settings are kept, per workspace. */
const SETTINGS_KEY = "aspLanguage.solverSettings";

/** Used when the setConfig setting names no file, as the sample config does. */
const DEFAULT_CONFIG_NAME = "config.json";

/**
 * How much text the panel is given for output it cannot take apart into answers.
 * Enough to read a result by eye, far short of what freezes a webview laying it
 * out in one box.
 */
const MAX_RAW_OUTPUT_CHARS = 200000;

/**
 * Exit codes that are not a failure, measured against the bundled clingo:
 *   0  no search was performed, which is how --pre and friends finish
 *   10 at least one model was found
 *   20 the search space was examined completely
 *   30 both of the above, the ordinary end of a satisfiable run
 */
const CLINGO_SUCCESS_CODES = [0, 10, 20, 30];

/** What the failing exit codes mean, where the number alone says nothing. */
const CLINGO_EXIT_REASONS = Object.freeze({
    1: "bad argument or interrupted",
    33: "out of memory",
    128: "clingo did not run",
});

/**
 * Explains a run that failed, in the terms clingo left behind.
 * @param {{code: Number, signal?: String, errorOutput?: String, output?: String}} result
 * @returns {String}
 */
function clingoFailureMessage({ code, signal, errorOutput, output }) {
    const named = CLINGO_EXIT_REASONS[code];
    const ending = signal ? `was stopped by ${signal}` : `exited with code ${code}${named ? ` (${named})` : ""}`;
    const detail = String(errorOutput || output || "").trim();
    return detail ? `Clingo ${ending}: ${detail}` : `Clingo ${ending} and reported nothing.`;
}

/**
 * Main program. Activates the extension.
 * @param {vscode.ExtensionContext} context Context of VSCode
 */
function activate(context) {
    let usePathClingo = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo");
    let setConfig = vscode.workspace.getConfiguration("aspLanguage").get("setConfig");
    let path;
    let clingoRunning = false;
    let releaseNotePending = false;

    /** Which solver the settings apply to, since not every option works on both. */
    const currentBackend = () => (usePathClingo ? "path" : "wasm");

    const settingsStore = {
        read: () => normalizeSettings(context.workspaceState.get(SETTINGS_KEY)),
        save: async (settings) => await context.workspaceState.update(SETTINGS_KEY, normalizeSettings(settings)),
        reset: async () => await context.workspaceState.update(SETTINGS_KEY, { ...DEFAULT_SETTINGS }),
        describe: () => ({
            fields: describeFields(currentBackend(), threadsAvailable()),
            settings: settingsStore.read(),
            backend: currentBackend(),
            scope: 'Used by "Compute all/first Answer Sets" in this workspace.',
        }),
        /** Fills the pane from an existing config.json so nobody has to retype it. */
        importFromConfig: async () => {
            const editor = vscode.window.activeTextEditor;
            const configPath = editor && setConfig ? findConfig(dirname(editor.document.fileName), setConfig) : undefined;
            if (!configPath) {
                vscode.window.showErrorMessage(
                    setConfig
                        ? `Could not find ${setConfig} next to the file or in any folder above it.`
                        : "Set a config file name in the aspLanguage.setConfig setting first."
                );
                return;
            }
            try {
                const parsed = JSON.parse(fs.readFileSync(configPath).toString());
                // Whatever is valid is still imported: refusing the lot over one
                // bad key would help nobody
                const problems = validateConfigObject(parsed, context.asAbsolutePath(""));
                if (problems.length) {
                    vscode.window.showWarningMessage(
                        `${basename(configPath)} has ${problems.length} problem(s), importing the rest: ${problems.join("; ")}`
                    );
                }
                await context.workspaceState.update(SETTINGS_KEY, configToSettings(parsed));
            } catch (error) {
                vscode.window.showErrorMessage(`Could not read ${basename(configPath)}: ${error.message}`);
            }
        },
        /**
         * Writes the pane's settings out as a config.json
         */
        exportToConfig: async () => {
            const editor = vscode.window.activeTextEditor;
            const directory = editor ? dirname(editor.document.fileName) : vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!directory) {
                vscode.window.showErrorMessage("Open a logic program first: the config is written next to it.");
                return;
            }

            const name = setConfig || DEFAULT_CONFIG_NAME;
            const existing = findConfig(directory, name);
            const target = existing ?? join(directory, name);
            if (existing) {
                const overwrite = await vscode.window.showWarningMessage(
                    `Overwrite ${basename(existing)} with the current solver settings?`,
                    { modal: true, detail: existing },
                    "Overwrite"
                );
                if (overwrite !== "Overwrite") {
                    return;
                }
            }

            try {
                fs.writeFileSync(target, `${JSON.stringify(settingsToConfig(settingsStore.read()), undefined, 4)}\n`);
                // A config the extension cannot find again is not much of an
                // export, so point the setting at it when it names nothing yet
                if (!setConfig) {
                    await vscode.workspace.getConfiguration("aspLanguage").update("setConfig", name);
                }
                // Opened rather than merely written: seeing the file is how you
                // check what you are passing on
                await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(target)));
            } catch (error) {
                vscode.window.showErrorMessage(`Could not write ${basename(target)}: ${error.message}`);
            }
        },
    };

    const provider = new WebviewProvider(context.extensionUri, settingsStore);
    const statusBar = new ClingoStatusBar(vscode);

    context.globalState.setKeysForSync([RELEASE_NOTE_KEY]);
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(onAspFilesChanged));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(onAspFilesChanged));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(onAspFilesChanged));

    usePath();
    onAspFilesChanged();

    /**
     * The status bar item only makes sense while an ASP file is open, and the
     * release note waits for one too: the extension can activate before any
     * editor is ready, and a dialog over an empty window explains nothing.
     */
    function onAspFilesChanged() {
        const hasAspFile = shouldShowStatusBar(vscode.window.activeTextEditor, vscode.workspace.textDocuments);
        statusBar.setVisible(hasAspFile);

        if (hasAspFile && !releaseNotePending) {
            releaseNotePending = true;
            // Awaiting would hold up whichever event brought us here
            showReleaseNote(vscode, context.globalState, { extensionUri: context.extensionUri }).finally(() => {
                releaseNotePending = false;
            });
        }
    }

    /**
     * @param {Boolean} running
     */
    function setClingoRunning(running) {
        clingoRunning = running;
        statusBar.setRunning(running);
        vscode.commands.executeCommand("setContext", "aspLanguage.clingoRunning", running);
    }

    /**
     * Wraps runClingoWasmForFileWithProgress in a cancellable progress
     * notification. Kept apart so that module can be tested with Jest.
     * @param {String} filePath
     * @param {Number} models
     * @param {String[]} options
     * @returns {Promise<import("clingo-wasm").ClingoResult | null>} null if the run failed or was cancelled
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
     * @param {String} filePath
     * @param {Number} models
     * @param {String[]} options
     * @returns {Promise<any>} Clingo result as JSON Object [code, output, errorOutput]
     */
    async function runClingoPathForFile(filePath, models = undefined, options = undefined) {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Path Clingo is running",
                cancellable: true,
            },
            async (progress, token) => await runClingoPathForFileWithProgress(vscode, progress, path, filePath, models, options, token)
        );
    }

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
     * The clingo arguments the settings pane asks for.
     *
     * @param {Boolean} quiet Suppresses the warnings about arguments that were
     *        dropped or matched nothing
     * @returns {String[]}
     */
    function solverArgsFromSettings(quiet = false) {
        const editor = vscode.window.activeTextEditor;
        const base =
            (editor && vscode.workspace.getWorkspaceFolder?.(editor.document.uri)?.uri.fsPath) ??
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
            (editor && dirname(editor.document.fileName));

        if (!base) {
            return [];
        }

        const readArgs = (value) => readCustomArgs(value, { quiet, backend: currentBackend() });
        const { args, unmatched } = settingsToArgs(settingsStore.read(), base, readArgs, currentBackend());
        if (!quiet) {
            for (const pattern of unmatched) {
                vscode.window.showWarningMessage(`No file matches "${pattern}" in the workspace.`);
            }
        }
        return args;
    }

    /**
     * Every file that makes up the program, for the command line to name
     * @param {String} file
     * @returns {String[]}
     */
    function programFilesFor(file) {
        try {
            const resolved = resolveIncludes(
                file,
                (path) => fs.readFileSync(path, "utf8"),
                workspaceRootFor(vscode, file)
            );
            return resolved.files.length ? resolved.files : [file];
        } catch {
            // Unsaved or unreadable. The file on its own still says more than nothing.
            return [file];
        }
    }

    /**
     * Solves with the bundled solver and posts the result to the panel.
     * @param {Number} models The number of models to run.
     */
    async function runBundledClingo(models) {
        const clingoResult = await runClingoWasmForFile(
            vscode.window.activeTextEditor.document.fileName,
            models,
            solverArgsFromSettings()
        );

        if (!clingoResult) {
            return;
        }

        const answers = formatWasmResult(clingoResult);

        // Clingo only reports its version as part of a result
        statusBar.setVersion(parseClingoVersion(clingoResult.Solver));
        provider.setAnswers(extractAnswers(clingoResult));

        provider.post({
            type: "updateOutput",
            answers,
        });
        provider.sendSettings();
    }

    /**
     * Solves by spawning the clingo binary and posts the result to the panel.
     * @param {Number} models The number of models to run.
     */
    async function runPathClingo(models) {
        const filePath = vscode.window.activeTextEditor.document.fileName;
        const options = pathRunOptions(solverArgsFromSettings());
        const clingoResult = await runClingoPathForFile(filePath, models, options);
        if (!clingoResult.stopped && !CLINGO_SUCCESS_CODES.includes(clingoResult.code)) {
            vscode.window.showErrorMessage(clingoFailureMessage(clingoResult));
            return;
        }

        const command = formatClingoCommand({ programs: programFilesFor(filePath), models, options, backend: "path" });
        const parsed = parseClingoOutput(clingoResult.output, clingoResult.errorOutput);

        if (!parsed) {
            const witnesses = clingoResult.witnesses ?? [];
            if (witnesses.length) {
                const total = clingoResult.totalWitnesses ?? witnesses.length;
                const partial = partialResultFromModels(witnesses, total, clingoResult.seconds, { reason: "cancelled" }, command);
                provider.setAnswers(witnesses);
                provider.post({ type: "updateOutput", answers: formatWasmResult(partial) });
                return;
            }

            statusBar.setVersion(parseClingoVersion(clingoResult.output));
            provider.post({
                type: "updateOutputString",
                answers: cappedOutput(clingoResult.output) || (clingoResult.stopped ? "Clingo was stopped before it printed anything." : ""),
                command,
            });
            return;
        }

        parsed.Command = command;
        statusBar.setVersion(parseClingoVersion(parsed.Solver));
        provider.setAnswers(extractAnswers(parsed));
        provider.post({ type: "updateOutput", answers: formatWasmResult(parsed) });
    }

    /**
     * What your own clingo is actually spawned with.
     * @param {String[]} options
     * @returns {String[]}
     */
    function pathRunOptions(options) {
        return choosesOutputFormat(options) ? options : [`--outf=${settingsStore.read().outputFormat}`, ...options];
    }

    /**
     * Trims text that is only ever going to be read from the top
     * @param {String} output
     * @returns {String}
     */
    function cappedOutput(output) {
        const text = String(output ?? "");
        if (text.length <= MAX_RAW_OUTPUT_CHARS) {
            return text;
        }
        const kept = text.slice(0, MAX_RAW_OUTPUT_CHARS);
        return `${kept}\n\n... output truncated after ${MAX_RAW_OUTPUT_CHARS.toLocaleString()} characters of ${text.length.toLocaleString()}.`;
    }

    async function runClingoCommand(models) {
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
                await runPathClingo(models);
            } else {
                await runBundledClingo(models);
            }
        } finally {
            setClingoRunning(false);
        }
    }

    const computeAllSetsCommand = vscode.commands.registerCommand("answer-set-programming-language-support.runinterminalall", async () => {
        vscode.commands.executeCommand("workbench.view.extension.aspContainer");
        await runClingoCommand(settingsStore.read().models);
    });

    const computeSingleSetCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.runinterminalsingle",
        async () => {
            vscode.commands.executeCommand("workbench.view.extension.aspContainer");
            await runClingoCommand(1);
        }
    );

    const stopClingoCommand = vscode.commands.registerCommand("answer-set-programming-language-support.stopclingo", async () => {
        if (!clingoRunning) {
            // The status bar already shows that nothing is running
            return;
        }
        if (usePathClingo) {
            stopClingoProcess();
            return;
        }
        await abortClingo();
    });

    // Opens the solver settings pane
    const toggleSettingsCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.togglesettings",
        async () => {
            await vscode.commands.executeCommand("workbench.view.extension.aspContainer");
            provider.sendCommand({ type: "toggleSettings" });
        }
    );

    // Brings the one-time notice back on demand
    const showReleaseNotesCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.showreleasenotes",
        async () => await showReleaseNote(vscode, context.globalState, { force: true, extensionUri: context.extensionUri })
    );

    const initClingoConfig = vscode.commands.registerCommand("answer-set-programming-language-support.initClingoConfig", function () {
        const sampleConfig = fs.readFileSync(join(context.asAbsolutePath(""), `sampleConfig.json`));
        fs.writeFileSync(join(dirname(vscode.window.activeTextEditor.document.fileName), DEFAULT_CONFIG_NAME), sampleConfig);
        vscode.workspace.getConfiguration("aspLanguage").update("setConfig", DEFAULT_CONFIG_NAME);
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
    context.subscriptions.push(stopClingoCommand);
    context.subscriptions.push(toggleSettingsCommand);
    context.subscriptions.push(showReleaseNotesCommand);
    context.subscriptions.push(initClingoConfig);
    context.subscriptions.push(statusBar);

    vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("aspLanguage.usePathClingo")) {
            usePathClingo = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo");
            usePath();

            // Rebuild the webview HTML
            if (provider._view) {
                provider._view.webview.html = provider._getHtmlForWebview(provider._view.webview);
            }
        }
        if (event.affectsConfiguration("aspLanguage.setConfig")) {
            setConfig = vscode.workspace.getConfiguration("aspLanguage").get("setConfig");
        }
    });
}

/**
 * Neither solver may outlive the extension, the worker is torn down
 */
async function deactivate() {
    stopClingoProcess();
    await abortClingo();
}

module.exports = {
    activate,
    deactivate,
};

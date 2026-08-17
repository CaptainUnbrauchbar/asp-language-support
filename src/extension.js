const vscode = require("vscode");
const which = require("which");
const { basename, dirname, join } = require("path");
const fs = require("fs");
const { findConfig, validateConfigObject } = require("./configReader.js");
const { WebviewProvider } = require("./webviewProvider.js");
const { runClingoWasmForFileWithProgress } = require("./runClingoWasmForFileWithProgress.js");
const { runClingoPathForFileWithProgress, stopClingoProcess } = require("./runClingoPathForFileWithProgress.js");
const { abortClingo, threadsAvailable } = require("./clingoWasm.js");
const { formatWasmResult, parseClingoOutput, extractAnswers, partialResultFromModels } = require("./formatWasmResult.js");
const { ClingoStatusBar, parseClingoVersion, shouldShowStatusBar } = require("./statusBar.js");
const { formatClingoCommand } = require("./clingoCommand.js");
const { resolveIncludes } = require("./resolveIncludes.js");
const { showReleaseNote, RELEASE_NOTE_KEY } = require("./releaseNote.js");
const { readCustomArgs, choosesOutputFormat } = require("./configReader.js");
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
 * settingsToArgs quotes file paths for the command line they end up on. Declared
 * out here rather than inside activate(), where anything read before its own
 * declaration has run is a ReferenceError waiting for the right editor to be open.
 */
const unquote = (value) => String(value).replace(/^"|"$/g, "");

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

    var usePathClingo = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo");
    var setConfig = vscode.workspace.getConfiguration("aspLanguage").get("setConfig");
    var path;
    var clingoRunning = false;
    /**
     * Guards against a second dialog while the first is still waiting. Declared
     * up here with the rest of the state because onAspFilesChanged runs during
     * activation, before the body below it has been evaluated.
     */
    var releaseNotePending = false;

    /**
     * The solver settings edited in the panel. They live in workspace state
     * rather than in a file, so the common case needs no config at all; a project
     * that wants its options committed can still use config.json.
     */
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
            command: previewCommand(),
        }),
        /** Just the command line, for redrawing the preview without the pane. */
        previewCommand,
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
                // Importing is the only thing that reads a config file now, so
                // it is where the schema has to be checked. Whatever is valid is
                // still imported: refusing the lot over one bad key would help
                // nobody.
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
         * Writes the pane's settings out as a config.json, which is the other
         * half of importing one: it is how a set of options gets handed to
         * somebody else, or committed alongside a program.
         *
         * It writes the very file importing would read, rather than asking where
         * to put it, so the two are one thing in two directions: export, hand the
         * file over, import. Overwriting is confirmed first, since that file may
         * be the config someone else wrote.
         */
        exportToConfig: async () => {
            const editor = vscode.window.activeTextEditor;
            const directory = editor ? dirname(editor.document.fileName) : vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!directory) {
                vscode.window.showErrorMessage("Open a logic program first: the config is written next to it.");
                return;
            }

            const name = setConfig || DEFAULT_CONFIG_NAME;
            // The same lookup importing uses, so an existing config is updated
            // where it lies rather than shadowed by a second one further down
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
                // export, so point the setting at it when it names nothing yet.
                // An existing choice is left alone.
                if (!setConfig) {
                    await vscode.workspace.getConfiguration("aspLanguage").update("setConfig", name);
                }
                // Opened rather than merely written: the point of the file is to
                // be passed on, and seeing it is how you check what you are
                // passing on
                await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(target)));
            } catch (error) {
                vscode.window.showErrorMessage(`Could not write ${basename(target)}: ${error.message}`);
            }
        },
    };

    const provider = new WebviewProvider(context.extensionUri, settingsStore);
    const statusBar = new ClingoStatusBar(vscode);

    // The note is about the release, not about the machine, so Settings Sync
    // carries the flag and it does not reappear on a second computer
    context.globalState.setKeysForSync([RELEASE_NOTE_KEY]);

    // Register the listeners before the first check, so an editor that becomes
    // active while activation is still running cannot slip past unnoticed
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
                // A notification rather than the status bar, and cancellable, so
                // your own clingo can be stopped the same way the bundled one is
                location: vscode.ProgressLocation.Notification,
                title: "Path Clingo is running",
                cancellable: true,
            },
            async (progress, token) => await runClingoPathForFileWithProgress(vscode, progress, path, filePath, models, options, token)
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
     * The clingo arguments the settings pane asks for.
     *
     * additionalFiles are resolved against the workspace folder when there is
     * one, since the settings belong to the workspace rather than to whichever
     * file happens to be open.
     *
     * @param {Boolean} quiet Suppresses the warnings about arguments that were
     *        dropped or matched nothing. The pane's live preview builds the same
     *        arguments after every keystroke, where a notification per stroke
     *        would be unusable; a real run still reports them.
     * @returns {String[]}
     */
    function solverArgsFromSettings(quiet = false) {
        const editor = vscode.window.activeTextEditor;
        const base =
            (editor && vscode.workspace.getWorkspaceFolder?.(editor.document.uri)?.uri.fsPath) ??
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
            (editor && dirname(editor.document.fileName));

        // Nothing to resolve extra files against, which only happens while
        // previewing with no file open
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
     * The command the settings as they stand would produce, for the pane to show
     * before anything is run.
     *
     * It describes "Compute all Answer Sets", the run the model limit applies to.
     * The file is whichever ASP file is open, or a stand in, since the settings
     * belong to the workspace rather than to one program.
     * @returns {String}
     */
    function previewCommand() {
        const editor = vscode.window.activeTextEditor;
        const openFile = editor?.document.languageId === "asp" ? editor.document.fileName : "program.lp";
        const backend = currentBackend();
        const args = solverArgsFromSettings(true);

        // The bundled solver is handed extra files as part of the program rather
        // than as arguments, which is the split its runner makes too. Doing the
        // same here keeps the preview and the line a run reports identical.
        const extraFiles = backend === "wasm" ? args.filter((arg) => !arg.startsWith("-")).map(unquote) : [];
        const options = backend === "wasm" ? args.filter((arg) => arg.startsWith("-")) : pathRunOptions(args);
        const programs = [openFile, ...extraFiles].flatMap((file) => contributingFiles(file, backend));

        return formatClingoCommand({
            // One file reached two ways is still one file on the line
            programs: [...new Set(programs)],
            models: settingsStore.read().models,
            options,
            backend,
        });
    }

    /**
     * Every file that would end up in the program, for the preview to name.
     *
     * Your own clingo reads `#include` itself, so the one file it is given is
     * the whole story there. The bundled solver has no filesystem to read from,
     * so the extension inlines the includes before the run and a line naming
     * only the file that was opened would hide the rules doing the work.
     * @param {String} file
     * @param {String} backend
     * @returns {String[]}
     */
    function contributingFiles(file, backend) {
        if (backend !== "wasm") {
            return [file];
        }
        try {
            const resolved = resolveIncludes(file, (path) => fs.readFileSync(path, "utf8"));
            return resolved.files.length ? resolved.files : [file];
        } catch {
            // Unsaved, unreadable, or the stand in name used when nothing is
            // open. The file on its own still says more than nothing.
            return [file];
        }
    }

    /**
     * Wrapper function for runClingoWasmForFile. It runs Clingo with the given file path and models,
     * using the options from the settings pane.
     * It formats the result and posts it to the active webview panel.
     * @param {Number} models The number of models to run.
     */
    async function runBundledClingo(models) {
        const clingoResult = await runClingoWasmForFile(
            vscode.window.activeTextEditor.document.fileName,
            models,
            solverArgsFromSettings()
        );

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
        });

        // A run is the only thing that can discover the solver has no thread
        // support, so refresh the pane in case that just changed
        provider.sendSettings();
    }

    /**
     * Function to run Clingo with the path to the executable. It spawns a new process and runs Clingo with the given arguments.
     * The results are posted to an active webview panel.
     * @param {Number} models The number of models to run.
     */
    async function runPathClingo(models) {
        const filePath = vscode.window.activeTextEditor.document.fileName;
        const options = pathRunOptions(solverArgsFromSettings());
        const clingoResult = await runClingoPathForFile(filePath, models, options);

        // A run that was stopped is an outcome rather than a failure, the same
        // as with the bundled solver: whatever clingo printed before it went is
        // worth more than a complaint about the exit code of a process the user
        // ended on purpose.
        if (!clingoResult.stopped && !CLINGO_SUCCESS_CODES.includes(clingoResult.code)) {
            vscode.window.showErrorMessage(`Clingo process exited with code ${clingoResult.code}: ${clingoResult.errorOutput}`);
            return;
        }

        // Your own clingo is spawned with exactly these, so the line the panel
        // shows is the one that ran
        const command = formatClingoCommand({ programs: [filePath], models, options, backend: "path" });
        const parsed = parseClingoOutput(clingoResult.output, clingoResult.errorOutput);

        if (!parsed) {
            // A stopped run leaves its JSON cut off wherever clingo was when it
            // ended, so it will not parse as a whole. The answers it had already
            // written are complete though, and are worth as much here as they
            // are when the bundled solver is stopped.
            const witnesses = clingoResult.witnesses ?? [];
            if (witnesses.length) {
                const total = clingoResult.totalWitnesses ?? witnesses.length;
                const partial = partialResultFromModels(witnesses, total, clingoResult.seconds, { reason: "cancelled" }, command);
                provider.setAnswers(witnesses);
                provider.post({ type: "updateOutput", answers: formatWasmResult(partial) });
                return;
            }

            // Output in a format the user asked for is theirs to read, not ours
            // to take apart, so it is shown as it came
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
        // The webview only receives the first MAX_RENDERED_ANSWERS, so keep the
        // complete list here for copying
        provider.setAnswers(extractAnswers(parsed));
        provider.post({ type: "updateOutput", answers: formatWasmResult(parsed) });
    }

    /**
     * What your own clingo is actually spawned with.
     *
     * The output format comes from the settings pane, which defaults to clingo's
     * JSON: that is the only output answers can be read out of, so it is what
     * gets a run from PATH the whole panel rather than a wall of text. Any other
     * choice is honoured and its output shown as clingo printed it.
     *
     * A custom argument naming a format wins outright. Adding ours alongside it
     * would hand clingo two, which it refuses with "multiple occurrences".
     * @param {String[]} options
     * @returns {String[]}
     */
    function pathRunOptions(options) {
        return choosesOutputFormat(options) ? options : [`--outf=${settingsStore.read().outputFormat}`, ...options];
    }

    /**
     * Trims text that is only ever going to be read from the top.
     *
     * Clingo asked for a format of its own can print without limit, and the
     * whole of it used to be sent to the panel and put in a single box. A run
     * with a million answers froze the window for as long as it took to lay that
     * out, which is not a price anybody agreed to pay for scrolling to line four.
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

    /**
     * Function to run Clingo with the given models. It checks if the user has selected a valid file and runs Clingo with the given models.
     * @param {Number} models The number of models to run.
     * @returns
     */
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

    ////////////////////////////////////////////////////////////////////////////////
    /// VSCode Extension Setup below (Commands, Subscriptions and Configuration) ///
    ////////////////////////////////////////////////////////////////////////////////

    // Register computeAllSetsCommand command for the extension
    const computeAllSetsCommand = vscode.commands.registerCommand("answer-set-programming-language-support.runinterminalall", async () => {
        // Focus ASP Tab for easier access to output
        vscode.commands.executeCommand("workbench.view.extension.aspContainer");
        // "all" is what the command asks for, and the settings pane may cap it,
        // the same way the time and solve limits cut a search short. Its default
        // of 0 is clingo's "every answer set", so this asks for all by default.
        await runClingoCommand(settingsStore.read().models);
    });

    // Register computeSingleSetCommand command for the extension
    const computeSingleSetCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.runinterminalsingle",
        async () => {
            // Focus ASP Tab for easier access to output
            vscode.commands.executeCommand("workbench.view.extension.aspContainer");
            // Run WASM Clingo
            await runClingoCommand(1);
        }
    );

    // Register stopClingo command, which aborts a solve that is stuck or taking too long.
    // Before clingo-wasm 0.6.0 this was impossible and an endless loop meant restarting VSCode.
    const stopClingoCommand = vscode.commands.registerCommand("answer-set-programming-language-support.stopclingo", async () => {
        if (!clingoRunning) {
            // The status bar already shows that nothing is running
            return;
        }
        if (usePathClingo) {
            // Your own clingo is a process this extension spawned and holds on
            // to, so it can be stopped like any other run rather than being left
            // to the user to hunt down
            stopClingoProcess();
            return;
        }
        await abortClingo();
    });

    // Register togglesettings command, which opens the solver settings pane in
    // the panel. The gear lives in the panel's own title bar next to the run
    // buttons, so it is reachable without scrolling the results.
    const toggleSettingsCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.togglesettings",
        async () => {
            await vscode.commands.executeCommand("workbench.view.extension.aspContainer");
            provider.sendCommand({ type: "toggleSettings" });
        }
    );

    // Register showReleaseNotes, which brings the one-time notice back on demand.
    // Without it the only way to see it again is to clear extension state, which
    // has no user interface at all.
    const showReleaseNotesCommand = vscode.commands.registerCommand(
        "answer-set-programming-language-support.showreleasenotes",
        async () => await showReleaseNote(vscode, context.globalState, { force: true, extensionUri: context.extensionUri })
    );

    // Register initClingoConfig command for the extension to create a new config file for the user
    const initClingoConfig = vscode.commands.registerCommand("answer-set-programming-language-support.initClingoConfig", function () {
        const sampleConfig = fs.readFileSync(join(context.asAbsolutePath(""), `sampleConfig.json`));
        fs.writeFileSync(join(dirname(vscode.window.activeTextEditor.document.fileName), DEFAULT_CONFIG_NAME), sampleConfig);
        // Update the configuration to use the new config file
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

    //Listeners for Configuration Options, updates the variables if the user changes them in the settings
    vscode.workspace.onDidChangeConfiguration((event) => {
        const confUsePathClingo = event.affectsConfiguration("aspLanguage.usePathClingo");
        const confSetConfig = event.affectsConfiguration("aspLanguage.setConfig");

        if (confUsePathClingo) {
            usePathClingo = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo");
            usePath();

            // Refresh the webview HTML. The rebuilt view asks for the settings
            // again on its own, which is what re-marks the options that only one
            // of the two solvers can honour.
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
    // Neither solver may outlive the extension. The worker is torn down, and a
    // clingo from PATH is a real process that would otherwise go on searching
    // after the window that started it has closed, with nothing left to stop it.
    stopClingoProcess();
    await abortClingo();
}

module.exports = {
    activate,
    deactivate,
};

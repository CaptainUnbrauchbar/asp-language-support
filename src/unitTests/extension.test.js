// @ts-nocheck
// Activation had no test at all, which let a variable be read during activation
// before its declaration had run: the release note only touches it when an ASP
// file is already open, so an empty window never hit it.
const disposable = () => ({ dispose: jest.fn() });

/** Collects the listeners activate() registers, so a test can fire them. */
const listeners = { activeEditor: [], openDocument: [], closeDocument: [], configuration: [] };

/**
 * The aspLanguage settings, so a test can both set and observe them. Written out
 * as literals: jest only lets a mock factory reach an outer constant that is one.
 */
const configuration = { usePathClingo: false, setConfig: "" };

jest.mock(
    "vscode",
    () => ({
        StatusBarAlignment: { Right: 2 },
        // The status bar reaches for this when clingo is missing from PATH,
        // which is what switching to your own solver does on a machine without one
        ThemeColor: function (id) {
            this.id = id;
        },
        Uri: { file: (p) => ({ fsPath: p }) },
        ProgressLocation: { Notification: 15, Window: 10 },
        window: {
            activeTextEditor: undefined,
            createStatusBarItem: jest.fn(() => ({ show: jest.fn(), hide: jest.fn(), dispose: jest.fn() })),
            showInformationMessage: jest.fn(async () => undefined),
            showErrorMessage: jest.fn(),
            showWarningMessage: jest.fn(),
            showTextDocument: jest.fn(async () => {}),
            registerWebviewViewProvider: jest.fn(disposable),
            // Runs the task it is given, the way the real one does, so a command
            // under test actually reaches the solver behind it
            withProgress: jest.fn(async (_options, task) => await task({ report: jest.fn() }, { onCancellationRequested: jest.fn() })),
            onDidChangeActiveTextEditor: jest.fn((fn) => (listeners.activeEditor.push(fn), disposable())),
        },
        workspace: {
            textDocuments: [],
            workspaceFolders: [],
            openTextDocument: jest.fn(async (uri) => uri),
            getConfiguration: jest.fn(() => ({
                get: (key) => configuration[key],
                update: jest.fn(async (key, value) => {
                    configuration[key] = value;
                }),
            })),
            getWorkspaceFolder: jest.fn(),
            onDidOpenTextDocument: jest.fn((fn) => (listeners.openDocument.push(fn), disposable())),
            onDidCloseTextDocument: jest.fn((fn) => (listeners.closeDocument.push(fn), disposable())),
            onDidChangeConfiguration: jest.fn((fn) => (listeners.configuration.push(fn), disposable())),
        },
        commands: { registerCommand: jest.fn(disposable), executeCommand: jest.fn(async () => {}) },
    }),
    { virtual: true }
);

// Your own clingo cannot be run here: the repository ships no binary, and one
// on the developer's PATH would make the suite depend on which version it is.
// The process is stubbed so everything around it is still tested.
jest.mock("../runClingoPathForFileWithProgress.js", () => ({
    runClingoPathForFileWithProgress: jest.fn(async () => ({ code: 10, output: "", errorOutput: "" })),
}));
jest.mock("which", () => ({ sync: () => "/usr/bin/clingo" }));

const vscode = require("vscode");
const { activate } = require("../extension.js");
const { runClingoPathForFileWithProgress } = require("../runClingoPathForFileWithProgress.js");
const { RELEASE_NOTE_KEY, RELEASE_VERSION } = require("../releaseNote.js");

/** A stand-in for the ExtensionContext activate() is handed. */
function fakeContext(globals = {}, workspace = undefined) {
    const globalStore = { ...globals };
    return {
        subscriptions: [],
        extensionUri: { fsPath: "/ext" },
        asAbsolutePath: (p) => p,
        globalState: {
            get: (key) => globalStore[key],
            update: jest.fn(async (key, value) => {
                globalStore[key] = value;
            }),
            setKeysForSync: jest.fn(),
        },
        workspaceState: { get: jest.fn(() => workspace), update: jest.fn(async () => {}) },
        peekGlobals: () => globalStore,
    };
}

/** An open ASP document, which is what both the status bar and the note wait for. */
const aspDocument = { languageId: "asp", fileName: "program.lp" };

describe("activate", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.values(listeners).forEach((list) => (list.length = 0));
        vscode.window.activeTextEditor = undefined;
        vscode.workspace.textDocuments = [];
    });

    it("activates on an empty window without showing anything", async () => {
        const context = fakeContext();

        expect(() => activate(context)).not.toThrow();
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it("survives activating with an ASP file already open", async () => {
        // The order activation really happens in when VSCode restores a session
        vscode.workspace.textDocuments = [aspDocument];
        vscode.window.activeTextEditor = { document: aspDocument };

        expect(() => activate(fakeContext())).not.toThrow();
    });

    it("shows the release note once an ASP file is open", async () => {
        vscode.workspace.textDocuments = [aspDocument];
        vscode.window.activeTextEditor = { document: aspDocument };
        const context = fakeContext();

        activate(context);
        await Promise.resolve();
        await Promise.resolve();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(context.peekGlobals()[RELEASE_NOTE_KEY]).toEqual(RELEASE_VERSION);
    });

    it("does not show it to someone who has already dismissed it", async () => {
        vscode.workspace.textDocuments = [aspDocument];
        vscode.window.activeTextEditor = { document: aspDocument };

        activate(fakeContext({ [RELEASE_NOTE_KEY]: RELEASE_VERSION }));
        await Promise.resolve();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it("shows it when an ASP file is opened later, and only once", async () => {
        const context = fakeContext();
        activate(context);
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();

        // The user opens their first .lp file
        vscode.workspace.textDocuments = [aspDocument];
        vscode.window.activeTextEditor = { document: aspDocument };
        listeners.openDocument.forEach((fn) => fn(aspDocument));
        await Promise.resolve();
        await Promise.resolve();

        // and keeps switching between files afterwards
        listeners.activeEditor.forEach((fn) => fn({ document: aspDocument }));
        await Promise.resolve();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it("asks for the note to follow the user across machines", () => {
        const context = fakeContext();
        activate(context);

        expect(context.globalState.setKeysForSync).toHaveBeenCalledWith([RELEASE_NOTE_KEY]);
    });
});

describe("exporting the solver settings", () => {
    const fs = require("fs");
    const { join } = require("path");
    const { configToSettings, normalizeSettings } = require("../solverSettings.js");

    /** The settings pane's own store, which activate() hands to the panel. */
    function storeFrom(context) {
        activate(context);
        // registerWebviewViewProvider(viewType, provider, options)
        return vscode.window.registerWebviewViewProvider.mock.calls[0][1]._settingsStore;
    }

    const tuned = { timeLimit: 45, models: 3, constants: "n=7" };
    const program = { languageId: "asp", fileName: join("/work", "program.lp") };

    /** Where a config written next to that program lands. */
    const configIn = (name) => join("/work", name);

    beforeEach(() => {
        jest.clearAllMocks();
        Object.values(listeners).forEach((list) => (list.length = 0));
        configuration.usePathClingo = false;
        configuration.setConfig = "";
        vscode.window.activeTextEditor = { document: program };
        vscode.workspace.textDocuments = [program];
        jest.spyOn(fs, "writeFileSync").mockImplementation(() => {});
        // Nothing on disk unless a test says otherwise, which is also what makes
        // findConfig stop looking rather than walking real directories
        jest.spyOn(fs, "existsSync").mockReturnValue(false);
    });

    afterEach(() => jest.restoreAllMocks());

    it("writes the file importing would read, next to the program", async () => {
        await storeFrom(fakeContext()).exportToConfig();

        expect(fs.writeFileSync.mock.calls[0][0]).toEqual(configIn("config.json"));
    });

    it("uses the name the setConfig setting looks for", async () => {
        // Importing finds the config by that name, so exporting under any other
        // would write a file the extension then ignores
        configuration.setConfig = "solver.json";

        await storeFrom(fakeContext()).exportToConfig();

        expect(fs.writeFileSync.mock.calls[0][0]).toEqual(configIn("solver.json"));
    });

    it("points setConfig at the file when it named none", async () => {
        await storeFrom(fakeContext()).exportToConfig();

        expect(configuration.setConfig).toEqual("config.json");
    });

    it("leaves a name the user already chose alone", async () => {
        configuration.setConfig = "solver.json";

        await storeFrom(fakeContext()).exportToConfig();

        expect(configuration.setConfig).toEqual("solver.json");
    });

    it("asks before overwriting a config that is already there", async () => {
        fs.existsSync.mockReturnValue(true);
        vscode.window.showWarningMessage.mockResolvedValue(undefined);

        await storeFrom(fakeContext()).exportToConfig();

        // Declining has to leave the existing file exactly as it was
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining("Overwrite"),
            expect.objectContaining({ modal: true }),
            "Overwrite"
        );
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("overwrites once that is confirmed", async () => {
        fs.existsSync.mockReturnValue(true);
        vscode.window.showWarningMessage.mockResolvedValue("Overwrite");

        await storeFrom(fakeContext()).exportToConfig();

        expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("does not ask when there is nothing to overwrite", async () => {
        await storeFrom(fakeContext()).exportToConfig();

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("writes a file that imports back into the same settings", async () => {
        await storeFrom(fakeContext({}, tuned)).exportToConfig();

        const contents = fs.writeFileSync.mock.calls[0][1];
        // Written as JSON someone can read and edit, not as one long line
        expect(contents).toContain("\n");
        expect(configToSettings(JSON.parse(contents))).toEqual(normalizeSettings(tuned));
    });

    it("shows the file it wrote, since the point of it is being passed on", async () => {
        await storeFrom(fakeContext()).exportToConfig();

        expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith({ fsPath: configIn("config.json") });
        expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it("says so rather than failing silently when the file cannot be written", async () => {
        fs.writeFileSync.mockImplementation(() => {
            throw new Error("EACCES");
        });

        await storeFrom(fakeContext()).exportToConfig();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("config.json"));
        expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it("says where it would write when nothing is open to write beside", async () => {
        vscode.window.activeTextEditor = undefined;
        vscode.workspace.textDocuments = [];

        await storeFrom(fakeContext()).exportToConfig();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Open a logic program"));
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
});

describe("running your own clingo from PATH", () => {
    const { join } = require("path");
    const program = { languageId: "asp", fileName: join(__dirname, "..", "testFiles", "ex01.lp"), uri: {} };

    /** What `clingo --outf=2` prints: the same JSON the bundled solver returns. */
    const reply = JSON.stringify({
        Solver: "clingo version 5.7.1",
        Input: ["ex01.lp"],
        Call: [{ Witnesses: [{ Value: ["a"] }, { Value: ["b"] }] }],
        Result: "SATISFIABLE",
        Models: { Number: 2, More: "no" },
        Calls: 1,
        Time: { Total: 0.02, Solve: 0.01, Model: 0 },
    });

    /** Activates, runs "Compute all Answer Sets", and hands back what the panel got. */
    async function runAndCapture(context = fakeContext()) {
        activate(context);
        const provider = vscode.window.registerWebviewViewProvider.mock.calls[0][1];
        const run = vscode.commands.registerCommand.mock.calls.find((call) => call[0].endsWith(".runinterminalall"))[1];
        await run();
        return { provider, posted: provider._lastMessage };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        Object.values(listeners).forEach((list) => (list.length = 0));
        configuration.usePathClingo = true;
        configuration.setConfig = "";
        vscode.window.activeTextEditor = { document: program };
        vscode.workspace.textDocuments = [program];
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 10, output: reply, errorOutput: "" });
    });

    afterEach(() => {
        configuration.usePathClingo = false;
    });

    it("asks it for the same JSON the bundled solver returns", () => {
        // Without this the panel has nothing to render and falls back to text
        return runAndCapture().then(() => {
            expect(runClingoPathForFileWithProgress.mock.calls[0][5]).toContain("--outf=2");
        });
    });

    it("renders the answers into the panel instead of a wall of text", async () => {
        const { posted } = await runAndCapture();

        expect(posted.type).toEqual("updateOutput");
        expect(posted.answers.answers).toEqual([["a"], ["b"]]);
        expect(posted.answers.result).toEqual("SATISFIABLE");
    });

    it("keeps every answer for copying, not only the rendered ones", async () => {
        const { provider } = await runAndCapture();

        expect(provider._answers).toEqual([["a"], ["b"]]);
    });

    it("reports the version out of the reply rather than a banner it no longer prints", async () => {
        await runAndCapture();

        expect(vscode.window.createStatusBarItem.mock.results[0].value.text).toContain("5.7.1");
    });

    it("shows the line it was really spawned with", async () => {
        const { posted } = await runAndCapture();

        expect(posted.answers.command).toContain("--outf=2");
        expect(posted.answers.command).toContain("ex01.lp");
    });

    it("names the files an #include pulled in, the same as the bundled solver", async () => {
        // The rules that did the work came from those files whichever solver ran,
        // and a line naming only the file that was open hides where they came
        // from, which is the question the line is read to answer
        const withInclude = { languageId: "asp", fileName: join(__dirname, "..", "testFiles", "withInclude.lp"), uri: {} };
        vscode.window.activeTextEditor = { document: withInclude };
        vscode.workspace.textDocuments = [withInclude];

        const { posted } = await runAndCapture();

        expect(posted.answers.command).toEqual("clingo withInclude.lp ex01.lp 0 --outf=2");
    });

    it("carries clingo's warnings across from stderr", async () => {
        runClingoPathForFileWithProgress.mockResolvedValue({
            code: 10,
            output: reply,
            errorOutput: "info: atom does not occur in any rule head",
        });

        const { posted } = await runAndCapture();

        expect(posted.answers.warnings).toEqual(["info: atom does not occur in any rule head"]);
    });

    it("shows the text as it came when a custom argument picked the format", async () => {
        // Choosing the output format is much of why somebody runs their own
        // binary, so it is honoured rather than taken apart
        runClingoPathForFileWithProgress.mockResolvedValue({
            code: 10,
            output: "Answer: 1\na b\nSATISFIABLE",
            errorOutput: "",
        });

        const { posted } = await runAndCapture(fakeContext({}, { customArgs: "--text" }));

        expect(runClingoPathForFileWithProgress.mock.calls[0][5]).not.toContain("--outf=2");
        expect(posted.type).toEqual("updateOutputString");
        expect(posted.answers).toContain("SATISFIABLE");
    });

    it("falls back to the text rather than failing when the reply cannot be read", async () => {
        // Whatever clingo prints, the user still gets to see it
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 10, output: "not json at all", errorOutput: "" });

        const { posted } = await runAndCapture();

        expect(posted.type).toEqual("updateOutputString");
        expect(posted.answers).toEqual("not json at all");
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it("asks for the output format chosen in the settings pane", async () => {
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 10, output: "Answer: 1\na b\n", errorOutput: "" });

        await runAndCapture(fakeContext({}, { outputFormat: "0" }));

        expect(runClingoPathForFileWithProgress.mock.calls[0][5]).toContain("--outf=0");
        expect(runClingoPathForFileWithProgress.mock.calls[0][5]).not.toContain("--outf=2");
    });

    it("shows what clingo printed when another format was chosen", async () => {
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 10, output: "Answer: 1\na b\nSATISFIABLE", errorOutput: "" });

        const { posted } = await runAndCapture(fakeContext({}, { outputFormat: "0" }));

        expect(posted.type).toEqual("updateOutputString");
        expect(posted.answers).toContain("SATISFIABLE");
    });

    it("lets a custom argument override the chosen format rather than sending two", async () => {
        // clingo refuses a second occurrence with "multiple occurrences: 'outf'"
        await runAndCapture(fakeContext({}, { outputFormat: "2", customArgs: "--outf=1" }));

        const sent = runClingoPathForFileWithProgress.mock.calls[0][5];
        expect(sent.filter((argument) => argument.startsWith("--outf"))).toEqual(["--outf=1"]);
    });

    it("still reports a run that failed outright", async () => {
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 65, output: "", errorOutput: "syntax error" });

        await runAndCapture();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("syntax error"));
    });
});

describe("how a run from PATH ends", () => {
    const { join } = require("path");
    const program = { languageId: "asp", fileName: join(__dirname, "..", "testFiles", "ex01.lp"), uri: {} };

    async function runAndCapture(context = fakeContext()) {
        activate(context);
        const provider = vscode.window.registerWebviewViewProvider.mock.calls[0][1];
        const run = vscode.commands.registerCommand.mock.calls.find((call) => call[0].endsWith(".runinterminalall"))[1];
        await run();
        return { provider, posted: provider._lastMessage };
    }

    const failureMessage = () => vscode.window.showErrorMessage.mock.calls[0]?.[0];

    beforeEach(() => {
        jest.clearAllMocks();
        Object.values(listeners).forEach((list) => (list.length = 0));
        configuration.usePathClingo = true;
        configuration.setConfig = "";
        vscode.window.activeTextEditor = { document: program };
        vscode.workspace.textDocuments = [program];
    });

    afterEach(() => {
        configuration.usePathClingo = false;
    });

    it("treats a run that performed no search as the success it is", async () => {
        // Which is how "Preprocess only" finishes: clingo exits 0 having printed
        // the program in aspif rather than solving it. Calling that a failure
        // put an error on screen with nothing after the colon.
        runClingoPathForFileWithProgress.mockResolvedValue({
            code: 0,
            output: "asp 1 0 0\n1 0 1 1 0 0\n0\n",
            errorOutput: "",
        });

        const { posted } = await runAndCapture(fakeContext({}, { preProcessor: true }));

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(posted.type).toEqual("updateOutputString");
        expect(posted.answers).toContain("asp 1 0 0");
    });

    it("names what an exit code means where the number says nothing", async () => {
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 33, output: "", errorOutput: "" });

        await runAndCapture();

        expect(failureMessage()).toContain("out of memory");
    });

    it("says a solver was stopped by a signal rather than blaming a missing code", async () => {
        // A process killed by one reports no exit code at all, and "exited with
        // code null" of a solver that crashed helps nobody
        runClingoPathForFileWithProgress.mockResolvedValue({ code: null, signal: "SIGSEGV", output: "", errorOutput: "" });

        await runAndCapture();

        expect(failureMessage()).toContain("SIGSEGV");
        expect(failureMessage()).not.toContain("null");
    });

    it("stops rather than trailing off when clingo explained nothing", async () => {
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 65, output: "", errorOutput: "" });

        await runAndCapture();

        expect(failureMessage()).not.toMatch(/:\s*$/);
        expect(failureMessage()).toContain("reported nothing");
    });

    it("reads the diagnostics off stdout when that is where clingo put them", async () => {
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 65, output: "*** ERROR: unexpected end of file", errorOutput: "" });

        await runAndCapture();

        expect(failureMessage()).toContain("unexpected end of file");
    });

    it("prefers what clingo wrote to stderr when it wrote to both", async () => {
        runClingoPathForFileWithProgress.mockResolvedValue({ code: 65, output: "some models", errorOutput: "the real problem" });

        await runAndCapture();

        expect(failureMessage()).toContain("the real problem");
    });
});


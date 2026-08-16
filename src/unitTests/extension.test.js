// @ts-nocheck
// Activation had no test at all, which let a variable be read during activation
// before its declaration had run: the release note only touches it when an ASP
// file is already open, so an empty window never hit it.
const disposable = () => ({ dispose: jest.fn() });

/** Collects the listeners activate() registers, so a test can fire them. */
const listeners = { activeEditor: [], openDocument: [], closeDocument: [], configuration: [] };

jest.mock(
    "vscode",
    () => ({
        StatusBarAlignment: { Right: 2 },
        Uri: { file: (p) => ({ fsPath: p }) },
        ProgressLocation: { Notification: 15, Window: 10 },
        window: {
            activeTextEditor: undefined,
            createStatusBarItem: jest.fn(() => ({ show: jest.fn(), hide: jest.fn(), dispose: jest.fn() })),
            showInformationMessage: jest.fn(async () => undefined),
            showErrorMessage: jest.fn(),
            showWarningMessage: jest.fn(),
            registerWebviewViewProvider: jest.fn(disposable),
            withProgress: jest.fn(),
            onDidChangeActiveTextEditor: jest.fn((fn) => (listeners.activeEditor.push(fn), disposable())),
        },
        workspace: {
            textDocuments: [],
            workspaceFolders: [],
            getConfiguration: jest.fn(() => ({ get: jest.fn(() => undefined), update: jest.fn() })),
            getWorkspaceFolder: jest.fn(),
            onDidOpenTextDocument: jest.fn((fn) => (listeners.openDocument.push(fn), disposable())),
            onDidCloseTextDocument: jest.fn((fn) => (listeners.closeDocument.push(fn), disposable())),
            onDidChangeConfiguration: jest.fn((fn) => (listeners.configuration.push(fn), disposable())),
        },
        commands: { registerCommand: jest.fn(disposable), executeCommand: jest.fn(async () => {}) },
    }),
    { virtual: true }
);

const vscode = require("vscode");
const { activate } = require("../extension.js");
const { RELEASE_NOTE_KEY, RELEASE_VERSION } = require("../releaseNote.js");

/** A stand-in for the ExtensionContext activate() is handed. */
function fakeContext(globals = {}) {
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
        workspaceState: { get: jest.fn(), update: jest.fn(async () => {}) },
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

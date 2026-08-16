// @ts-nocheck
// webviewProvider pulls in vscode, which only exists inside a running extension host
jest.mock(
    "vscode",
    () => ({
        Uri: { joinPath: (...parts) => ({ path: parts.join("/") }) },
        SnippetString: function (value) {
            this.value = value;
        },
        env: { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } },
        window: { showInformationMessage: jest.fn(), activeTextEditor: undefined },
        workspace: { getConfiguration: () => ({ get: () => false }) },
    }),
    { virtual: true }
);

const vscode = require("vscode");
const { WebviewProvider } = require("../webviewProvider.js");

/** Stands in for a WebviewView, capturing what the extension sends and posts back. */
function fakeView() {
    const view = {
        onDidDispose: (handler) => {
            view.dispose = handler;
        },
        webview: {
            options: {},
            html: "",
            cspSource: "vscode-webview://test",
            asWebviewUri: (uri) => `vscode-resource://${uri.path}`,
            postMessage: jest.fn(),
            onDidReceiveMessage: (handler) => {
                view.handler = handler;
            },
        },
    };
    return view;
}

const RESULT_MESSAGE = { type: "updateOutput", answers: { totalAnswers: 2 } };

describe("WebviewProvider", () => {
    let provider;

    beforeEach(() => {
        jest.clearAllMocks();
        provider = new WebviewProvider({ path: "/ext" });
    });

    it("renders the welcome screen into a resolved view", () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});

        expect(view.webview.html).toContain("Welcome to Clingo!");
        expect(view.webview.options.enableScripts).toBe(true);
    });

    it("listens for messages before the HTML loads, so 'ready' cannot be missed", () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});

        // the handler has to exist by the time the html is assigned
        expect(typeof view.handler).toBe("function");
        expect(view.webview.html).not.toEqual("");
    });

    it("restores the results into a webview rebuilt after moving the panel", async () => {
        const first = fakeView();
        provider.resolveWebviewView(first, {}, {});
        provider.post(RESULT_MESSAGE);
        expect(first.webview.postMessage).toHaveBeenCalledWith(RESULT_MESSAGE);

        // Moving the panel disposes that webview and resolves a brand new one,
        // which starts on the welcome screen until it asks for the last payload
        first.dispose();
        const moved = fakeView();
        provider.resolveWebviewView(moved, {}, {});
        expect(moved.webview.postMessage).not.toHaveBeenCalled();

        await moved.handler({ type: "ready", hasState: false });

        expect(moved.webview.postMessage).toHaveBeenCalledWith(RESULT_MESSAGE);
    });

    it("leaves a webview that restored its own state alone", async () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});
        provider.post(RESULT_MESSAGE);
        view.webview.postMessage.mockClear();

        // Resending here would wipe the filter the webview just restored
        await view.handler({ type: "ready", hasState: true });

        expect(view.webview.postMessage).not.toHaveBeenCalled();
    });

    it("stops posting into a webview that was disposed", () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});
        view.dispose();

        provider.post(RESULT_MESSAGE);

        expect(view.webview.postMessage).not.toHaveBeenCalled();
        // the payload is still remembered for whichever view comes next
        expect(provider._lastMessage).toEqual(RESULT_MESSAGE);
    });

    it("has nothing to restore before anything has been solved", async () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});

        await view.handler({ type: "ready", hasState: false });

        expect(view.webview.postMessage).not.toHaveBeenCalled();
    });

    it("does not bring a cleared panel back when the view is rebuilt", async () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});
        provider.post(RESULT_MESSAGE);
        await view.handler({ type: "clearOutput" });

        const moved = fakeView();
        provider.resolveWebviewView(moved, {}, {});
        await moved.handler({ type: "ready", hasState: false });

        expect(moved.webview.postMessage).not.toHaveBeenCalled();
    });

    it("copies a single answer through the VSCode clipboard", async () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});
        provider.setAnswers([["a", "b"], ["c"]]);

        await view.handler({ type: "copyAnswer", index: 1 });

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("c");
    });

    it("copies every answer, including ones the webview never received", async () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});
        provider.setAnswers([["a"], ["b"], ["c"]]);

        await view.handler({ type: "copyAll" });

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("a\nb\nc");
    });

    it("copies only the filtered answers when asked", async () => {
        const view = fakeView();
        provider.resolveWebviewView(view, {}, {});
        provider.setAnswers([["a"], ["b"], ["c"]]);

        await view.handler({ type: "copyFiltered", indices: [0, 2] });

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("a\nc");
    });
});

describe("the settings pane", () => {
    // The clipboard mock is shared with the block above, so without this a
    // "copied nothing" assertion would see the copies those tests made
    beforeEach(() => jest.clearAllMocks());

    /** Stands in for the store activate() builds around workspace state. */
    function fakeStore() {
        return {
            save: jest.fn(async () => {}),
            reset: jest.fn(async () => {}),
            importFromConfig: jest.fn(async () => {}),
            exportToConfig: jest.fn(async () => {}),
            previewCommand: jest.fn(() => "clingo --outf=2 program.lp 0"),
            describe: () => ({ fields: [], settings: {}, backend: "wasm", scope: "", command: "clingo --outf=2 program.lp 0" }),
        };
    }

    /** @returns {{view: Object, store: Object}} */
    function paneWithStore() {
        const store = fakeStore();
        const view = fakeView();
        new WebviewProvider({ path: "/ext" }, store).resolveWebviewView(view, {}, {});
        return { view, store };
    }

    it("offers importing and exporting side by side", () => {
        const view = fakeView();
        new WebviewProvider({ path: "/ext" }, fakeStore()).resolveWebviewView(view, {}, {});

        // A config file is only worth keeping if it can be produced as well as
        // read: exporting is how a set of options gets handed to someone else
        expect(view.webview.html).toContain("Import from config.json");
        expect(view.webview.html).toContain("Export to config.json");
    });

    it("hands each pane action to the store", async () => {
        const { view, store } = paneWithStore();

        await view.handler({ type: "importConfig" });
        await view.handler({ type: "exportConfig" });
        await view.handler({ type: "resetSettings" });

        expect(store.importFromConfig).toHaveBeenCalledTimes(1);
        expect(store.exportToConfig).toHaveBeenCalledTimes(1);
        expect(store.reset).toHaveBeenCalledTimes(1);
    });

    it("sends the settings back after the ones that change them", async () => {
        const { view, store } = paneWithStore();
        view.webview.postMessage.mockClear();

        await view.handler({ type: "importConfig" });
        const afterImport = view.webview.postMessage.mock.calls.length;
        await view.handler({ type: "exportConfig" });

        // Importing replaces the settings, so the pane has to be redrawn;
        // exporting only reads them, and redrawing would be noise
        expect(afterImport).toBeGreaterThan(0);
        expect(view.webview.postMessage).toHaveBeenCalledTimes(afterImport);
        expect(store.exportToConfig).toHaveBeenCalled();
    });

    it("survives a pane action with no store behind it", async () => {
        const view = fakeView();
        new WebviewProvider({ path: "/ext" }).resolveWebviewView(view, {}, {});

        await expect(view.handler({ type: "exportConfig" })).resolves.not.toThrow();
        await expect(view.handler({ type: "saveSettings", settings: {} })).resolves.not.toThrow();
    });

    it("shows what a run would invoke, and keeps it current as fields are edited", () => {
        const view = fakeView();
        new WebviewProvider({ path: "/ext" }, fakeStore()).resolveWebviewView(view, {}, {});

        expect(view.webview.html).toContain("settings-command");
        expect(view.webview.html).toContain("will run");
    });

    it("refreshes only the preview after an edit, never the fields", async () => {
        const { view, store } = paneWithStore();
        view.webview.postMessage.mockClear();

        await view.handler({ type: "saveSettings", settings: { timeLimit: 30 } });

        // Resending the settings would rebuild the very field being typed into
        expect(store.save).toHaveBeenCalledWith({ timeLimit: 30 });
        expect(view.webview.postMessage).toHaveBeenCalledTimes(1);
        expect(view.webview.postMessage).toHaveBeenCalledWith({
            type: "commandPreview",
            command: "clingo --outf=2 program.lp 0",
        });
    });

    it("copies a command line through VSCode rather than the webview clipboard", async () => {
        const { view } = paneWithStore();

        await view.handler({ type: "copyText", text: "clingo --outf=2 program.lp 0" });

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("clingo --outf=2 program.lp 0");
    });

    it("copies nothing when there is no command to copy", async () => {
        const { view } = paneWithStore();

        await view.handler({ type: "copyText", text: "" });

        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });
});

// @ts-nocheck
const { ClingoStatusBar, parseClingoVersion, shouldShowStatusBar } = require("../statusBar.js");

/** Stands in for the bits of the vscode module the status bar touches. */
function fakeVscode() {
    return {
        StatusBarAlignment: { Right: 2 },
        ThemeColor: function (id) {
            this.id = id;
        },
        window: { createStatusBarItem: jest.fn() },
    };
}

function fakeItem() {
    return { text: "", tooltip: "", command: undefined, backgroundColor: undefined, show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
}

describe("parseClingoVersion", () => {
    it("reads the version out of a WASM result's Solver field", () => {
        expect(parseClingoVersion("clingo version 5.8.1")).toEqual("5.8.1");
    });

    it("reads the version out of the binary's stdout", () => {
        expect(parseClingoVersion("clingo version 5.7.1\nReading from sudoku.lp\nSolving...")).toEqual("5.7.1");
    });

    it("returns undefined when there is no version to find", () => {
        expect(parseClingoVersion("Answer: 1\na b")).toBeUndefined();
        expect(parseClingoVersion(undefined)).toBeUndefined();
        expect(parseClingoVersion(null)).toBeUndefined();
    });
});

describe("shouldShowStatusBar", () => {
    const aspDoc = { languageId: "asp" };
    const otherDoc = { languageId: "javascript" };

    it("shows while an ASP file is the active editor", () => {
        expect(shouldShowStatusBar({ document: aspDoc }, [aspDoc])).toBe(true);
    });

    it("shows when the ASP file is open but not yet the active editor", () => {
        // This is the state during activation: the extension is started by
        // opening an ASP file, but activeTextEditor is not set yet
        expect(shouldShowStatusBar(undefined, [aspDoc])).toBe(true);
    });

    it("stays visible while an ASP file is open behind another editor", () => {
        expect(shouldShowStatusBar({ document: otherDoc }, [otherDoc, aspDoc])).toBe(true);
    });

    it("hides when no ASP file is open at all", () => {
        expect(shouldShowStatusBar(undefined, [])).toBe(false);
        expect(shouldShowStatusBar({ document: otherDoc }, [otherDoc])).toBe(false);
    });

    it("survives being called with nothing", () => {
        expect(shouldShowStatusBar(undefined)).toBe(false);
        expect(shouldShowStatusBar(null, [])).toBe(false);
    });
});

describe("ClingoStatusBar", () => {
    let item;
    let bar;

    beforeEach(() => {
        item = fakeItem();
        bar = new ClingoStatusBar(fakeVscode(), item);
    });

    it("shows the bundled solver and offers to run", () => {
        expect(item.text).toEqual("$(play) Clingo: WASM");
        expect(item.command).toEqual("answer-set-programming-language-support.runinterminalall");
        expect(item.backgroundColor).toBeUndefined();
    });

    it("adds the version once a run has reported one", () => {
        bar.setVersion("5.8.1");
        expect(item.text).toEqual("$(play) Clingo: WASM 5.8.1");
    });

    it("shows a spinner and offers to stop while solving", () => {
        bar.setVersion("5.8.1");
        bar.setRunning(true);

        expect(item.text).toEqual("$(sync~spin) Clingo: solving...");
        expect(item.command).toEqual("answer-set-programming-language-support.stopclingo");

        bar.setRunning(false);
        expect(item.text).toEqual("$(play) Clingo: WASM 5.8.1");
    });

    it("distinguishes the solver from PATH", () => {
        bar.setSolver("path");
        bar.setVersion("5.7.1");
        expect(item.text).toEqual("$(play) Clingo: PATH 5.7.1");
    });

    it("drops a version that belonged to the other solver", () => {
        bar.setVersion("5.8.1");
        bar.setSolver("path");
        expect(item.text).toEqual("$(play) Clingo: PATH");
    });

    it("warns when clingo is missing from PATH and links to the setting", () => {
        bar.setSolver("missing");

        expect(item.text).toEqual("$(error) Clingo: not found");
        expect(item.command.command).toEqual("workbench.action.openSettings");
        expect(item.command.arguments).toEqual(["aspLanguage.usePathClingo"]);
        expect(item.backgroundColor.id).toEqual("statusBarItem.warningBackground");
    });

    it("only shows itself while an ASP file is open", () => {
        bar.setVisible(true);
        expect(item.show).toHaveBeenCalled();

        bar.setVisible(false);
        expect(item.hide).toHaveBeenCalled();
    });
});

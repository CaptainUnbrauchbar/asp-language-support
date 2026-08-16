/**
 * @jest-environment jsdom
 */
// @ts-nocheck
jest.mock("vscode", () => require("./panelHarness.js").vscodeStub(), { virtual: true });

const { loadPanel, fixture, grownTo } = require("./panelHarness.js");
const { formatWasmResult } = require("../formatWasmResult.js");

/** The payload the extension posts after a run. */
const resultOf = (name) => formatWasmResult(fixture(name));

/** @param {Object} panel @param {String} name */
function show(panel, name) {
    panel.send({ type: "updateOutput", answers: resultOf(name) });
}

describe("the panel on load", () => {
    it("announces itself, so the extension can replay the last run", () => {
        const panel = loadPanel();

        expect(panel.posted).toContainEqual({ type: "ready", hasState: false });
    });

    it("starts on the welcome screen with the toolbar out of the way", () => {
        const panel = loadPanel();

        expect(panel.header().hidden).toBe(true);
        expect(panel.one(".welcome-box").value).toContain("Welcome to Clingo!");
        expect(panel.answers()).toHaveLength(0);
    });
});

describe("a result", () => {
    let panel;

    beforeEach(() => {
        panel = loadPanel();
        show(panel, "subsets3");
    });

    it("brings out the toolbar and renders every answer", () => {
        expect(panel.header().hidden).toBe(false);
        expect(panel.answers()).toHaveLength(8);
    });

    it("replaces the welcome screen", () => {
        expect(panel.all(".welcome-box")).toHaveLength(0);
    });

    it("reports the outcome as a badge rather than burying it in text", () => {
        const badge = panel.one(".result-badge");

        expect(badge.textContent).toEqual("SAT");
        expect(badge.className).toContain("result-sat");
        expect(badge.querySelector(".codicon-pass")).not.toBeNull();
    });

    it("emphasises the numbers over their units", () => {
        expect(panel.all(".stat-value").map((e) => e.textContent)).toContain("8");
        expect(panel.all(".stat-unit").map((e) => e.textContent)).toContain("models");
    });

    it("keeps the figures that do not fit in the tooltip", () => {
        expect(panel.strip().title).toContain("Calls:");
        expect(panel.strip().title).toContain("Result: SATISFIABLE");
    });

    it("sizes answers to their content instead of a fixed height", () => {
        // These were eight line textareas, so a one atom answer wasted most of
        // the panel and a long one scrolled inside a box of its own
        expect(panel.answers()[0].tagName).toEqual("DIV");
        expect(panel.answers()[0].style.height).toEqual("");
    });

    it("labels each answer with its place and size", () => {
        expect(panel.labels()[3].textContent).toEqual("Answer 4/8 (2 atoms)");
    });

    it("says nothing about how much is shown when everything is", () => {
        expect(panel.all(".shown-chip")).toHaveLength(0);
    });
});

describe("an unsatisfiable run", () => {
    let panel;

    beforeEach(() => {
        panel = loadPanel();
        show(panel, "unsatisfiable");
    });

    it("renders no answers at all, not a phantom empty one", () => {
        expect(panel.answers()).toHaveLength(0);
    });

    it("says so in a callout with an icon", () => {
        const callout = panel.callouts()[0];

        expect(callout.className).toContain("callout-info");
        expect(callout.querySelector(".codicon-circle-slash")).not.toBeNull();
    });

    it("turns the badge red", () => {
        expect(panel.one(".result-badge").className).toContain("result-unsat");
    });
});

describe("clingo's own messages", () => {
    it("are shown rather than discarded", () => {
        const panel = loadPanel();
        show(panel, "withWarning");

        const warning = panel.callouts().find((c) => c.className.includes("callout-warning"));

        expect(warning).toBeDefined();
        expect(warning.querySelector(".codicon-warning")).not.toBeNull();
        expect(warning.textContent).toContain("does not occur");
    });
});

describe("copying", () => {
    it("asks the extension rather than the webview clipboard", () => {
        // The webview's own navigator.clipboard fails silently in a panel
        const panel = loadPanel();
        show(panel, "subsets3");
        panel.posted.length = 0;

        panel.all(".answer-header .icon-button")[2].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(panel.posted[0]).toEqual({ type: "copyAnswer", index: 2 });
    });

    it("confirms on the button itself, where you are already looking", async () => {
        const panel = loadPanel();
        show(panel, "subsets3");
        const button = panel.all(".answer-header .icon-button")[0];

        button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        expect(button.querySelector(".codicon").className).toContain("codicon-check");

        await new Promise((resolve) => setTimeout(resolve, 1400));
        expect(button.querySelector(".codicon").className).toEqual("codicon codicon-copy");
    }, 10000);
});

describe("the overflow menu", () => {
    let panel;

    beforeEach(() => {
        panel = loadPanel();
        show(panel, "subsets3");
    });

    it("starts closed and opens with its tools", () => {
        expect(panel.one(".menu").hidden).toBe(true);

        panel.click(".more-button");

        expect(panel.one(".menu").hidden).toBe(false);
        expect(panel.menuButtons()).toHaveLength(3);
    });

    it("offers copying the matches only once something has matched", () => {
        panel.click(".more-button");

        expect(panel.menuButtons()[1].disabled).toBe(true);
    });

    it("closes when you click away from it", () => {
        panel.click(".more-button");

        document.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(panel.one(".menu").hidden).toBe(true);
    });
});

describe("clearing the output", () => {
    let panel;

    beforeEach(() => {
        panel = loadPanel();
        show(panel, "subsets3");
        panel.posted.length = 0;
        panel.click(".more-button");
        panel.menuButtons()[2].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    it("returns to the welcome screen instead of leaving the panel blank", () => {
        // An empty panel says nothing about what to do next, which is the whole
        // job of the welcome text
        expect(panel.all(".welcome-box")).toHaveLength(1);
        expect(panel.one(".welcome-box").value).toContain("Welcome to Clingo!");
    });

    it("leaves no answers behind and puts the toolbar away", () => {
        expect(panel.answers()).toHaveLength(0);
        expect(panel.header().hidden).toBe(true);
    });

    it("tells the extension to forget the run as well", () => {
        // Otherwise moving the panel brings the cleared result back to life
        expect(panel.posted).toContainEqual({ type: "clearOutput" });
    });

    it("does not stop the next run from rendering", () => {
        show(panel, "subsets3");

        expect(panel.all(".welcome-box")).toHaveLength(0);
        expect(panel.answers()).toHaveLength(8);
    });
});

describe("a result larger than the panel renders", () => {
    let panel;

    beforeEach(() => {
        panel = loadPanel();
        panel.send({ type: "updateOutput", answers: formatWasmResult(grownTo(fixture("subsets3"), 1024)) });
    });

    it("stops at 500 rather than locking up the panel", () => {
        expect(panel.answers()).toHaveLength(500);
    });

    it("says that is what it did", () => {
        expect(panel.one(".shown-chip").textContent).toEqual("first 500 of 1024");
        expect(panel.strip().title).toContain("Only the first 500 of 1024");
    });
});

describe("raw output from your own clingo", () => {
    let panel;

    beforeEach(() => {
        panel = loadPanel();
        show(panel, "subsets3");
        panel.send({ type: "updateOutputString", answers: "clingo version 5.7.1\nAnswer: 1\na b\nSATISFIABLE" });
    });

    it("replaces the panel rather than one answer of the run before it", () => {
        expect(panel.output().querySelectorAll("textarea")).toHaveLength(1);
        expect(panel.answers()).toHaveLength(0);
    });

    it("puts away the actions that only make sense for parsed answers", () => {
        expect(panel.header().hidden).toBe(true);
        expect(panel.one(".copy-all").disabled).toBe(true);
    });

    it("shows the command it was spawned with when there is one", () => {
        panel.send({ type: "updateOutputString", answers: "SATISFIABLE", command: "clingo program.lp 0 --stats=2" });

        expect(panel.one(".command-details").textContent).toContain("clingo program.lp 0 --stats=2");
    });
});

describe("moving the panel to another position", () => {
    // VSCode does not merely hide the view, it disposes the webview and builds a
    // new one, so retainContextWhenHidden cannot help. The panel restores itself
    // from the state VSCode kept, which works even if the extension is not listening.
    it("restores the answers, the filter and the highlighting", async () => {
        const before = loadPanel();
        show(before, "subsets3");
        await before.filter("b");
        const rendered = before.answers().length;
        expect(before.savedState().kind).toEqual("result");

        const rebuilt = loadPanel({ state: before.savedState() });

        expect(rebuilt.answers()).toHaveLength(rendered);
        expect(rebuilt.filterBox().value).toEqual("b");
        expect(rebuilt.all(".match").length).toBeGreaterThan(0);
    });

    it("tells the extension it already has state, so its replay is skipped", async () => {
        const before = loadPanel();
        show(before, "subsets3");

        const rebuilt = loadPanel({ state: before.savedState() });

        expect(rebuilt.posted).toContainEqual({ type: "ready", hasState: true });
    });

    it("stays empty when the run was cleared before the move", () => {
        const before = loadPanel();
        show(before, "subsets3");
        before.click(".more-button");
        before.menuButtons()[2].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        const rebuilt = loadPanel({ state: before.savedState() });

        expect(rebuilt.answers()).toHaveLength(0);
        expect(rebuilt.all(".welcome-box")).toHaveLength(1);
    });
});

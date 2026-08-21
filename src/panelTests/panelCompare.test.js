/**
 * @jest-environment jsdom
 */
// @ts-nocheck
jest.mock("vscode", () => require("./panelHarness.js").vscodeStub(), { virtual: true });

const { loadPanel, fixture } = require("./panelHarness.js");
const { formatWasmResult } = require("../formatWasmResult.js");

/**
 * Four answers from "core. 1 { a; b; only } 2. :- only, a. :- only, b."
 * "core" holds in all of them, "only" appears in exactly one, a and b vary:
 * one of each kind the comparison has to tell apart.
 */
function panelWithComparableAnswers() {
    const panel = loadPanel();
    panel.send({ type: "updateOutput", answers: formatWasmResult(fixture("compare")) });
    return panel;
}

describe("comparing answer sets", () => {
    let panel;

    beforeEach(() => {
        panel = panelWithComparableAnswers();
    });

    it("classifies nothing until asked to", () => {
        expect(panel.one(".compare-button").disabled).toBe(false);
        expect(panel.all(".atom-common")).toHaveLength(0);
    });

    it("dims the atom every answer agrees on", () => {
        panel.click(".compare-button");

        const common = panel.all(".atom-common");
        expect(common).toHaveLength(panel.answers().length);
        expect(common.every((atom) => atom.textContent === "core")).toBe(true);
    });

    it("marks an atom that occurs in a single answer", () => {
        panel.click(".compare-button");

        const unique = panel.all(".atom-unique");
        expect(unique).toHaveLength(1);
        expect(unique[0].textContent).toEqual("only");
    });

    it("marks the atoms that actually tell the answers apart", () => {
        panel.click(".compare-button");

        const varying = panel.all(".atom-varying");
        expect(varying.length).toBeGreaterThan(0);
        expect(varying.every((atom) => ["a", "b"].includes(atom.textContent))).toBe(true);
    });

    it("reads as pressed while it is on", () => {
        panel.click(".compare-button");

        expect(panel.one(".compare-button").getAttribute("aria-pressed")).toEqual("true");
    });

    it("says what it found, since dimming alone does not explain itself", () => {
        panel.click(".compare-button");

        const hint = panel.callouts().find((c) => c.textContent.includes("Comparing answers"));
        expect(hint).toBeDefined();
        expect(hint.textContent).toMatch(/1 atom\(s\) shared by all \d+ answers/);
    });

    it("clears the classification when switched off", () => {
        panel.click(".compare-button");
        panel.click(".compare-button");

        expect(panel.all(".atom-common")).toHaveLength(0);
        expect(panel.one(".compare-button").getAttribute("aria-pressed")).toEqual("false");
    });

    it("has nothing to do with one answer, and says so by being unavailable", () => {
        const single = loadPanel();
        single.send({ type: "updateOutput", answers: formatWasmResult(fixture("single")) });

        expect(single.answers()).toHaveLength(1);
        expect(single.one(".compare-button").disabled).toBe(true);
    });
});

describe("comparing while filtering", () => {
    // The two answer different questions and have to cooperate rather than one
    // undoing the other
    it("survives a filter being applied", async () => {
        const panel = panelWithComparableAnswers();
        panel.click(".compare-button");

        await panel.filter("o");

        expect(panel.all(".atom-unique")).toHaveLength(1);
        expect(panel.all(".match").length).toBeGreaterThan(0);
    });

    it("goes back to comparing everything once the filter is cleared", async () => {
        const panel = panelWithComparableAnswers();
        panel.click(".compare-button");
        await panel.filter("o");

        await panel.filter("");

        expect(panel.all(".atom-common")).toHaveLength(panel.answers().length);
    });
});

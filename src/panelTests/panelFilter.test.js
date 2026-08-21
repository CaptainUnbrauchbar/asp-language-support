/**
 * @jest-environment jsdom
 */
// @ts-nocheck
jest.mock("vscode", () => require("./panelHarness.js").vscodeStub(), { virtual: true });

const { loadPanel, fixture } = require("./panelHarness.js");
const { formatWasmResult } = require("../formatWasmResult.js");

/** Eight answers over three atoms, four of which contain "a". */
function panelWithSubsets() {
    const panel = loadPanel();
    panel.send({ type: "updateOutput", answers: formatWasmResult(fixture("subsets3")) });
    return panel;
}

describe("filtering", () => {
    let panel;

    beforeEach(async () => {
        panel = panelWithSubsets();
        await panel.filter("a");
    });

    it("narrows the list to the answers that contain a match", () => {
        expect(panel.answers()).toHaveLength(4);
    });

    it("shows a matching answer in full", () => {
        // An answer set means nothing atom by atom, so a match brings its whole
        // answer with it rather than a trimmed version of it
        expect(panel.labels().every((label) => !label.textContent.includes(" of "))).toBe(true);
    });

    it("keeps the atoms that sit around the match", () => {
        // {a} {a,b} {a,c} {a,b,c} is eight atoms, which only add up if the
        // atoms that did not match came along with the ones that did
        expect(panel.atoms()).toHaveLength(8);
        expect(panel.atoms().some((atom) => atom.textContent !== "a")).toBe(true);
    });

    it("marks the matching part inside each atom", () => {
        const marks = panel.all(".match");

        expect(marks.length).toBeGreaterThan(0);
        expect(marks.every((mark) => mark.textContent === "a")).toBe(true);
    });

    it("does not change the text it marks, only what is drawn behind it", () => {
        // Weight and padding both widen the run they apply to, which reflows
        // every atom after it: the answers shuffled sideways on each keystroke,
        // exactly while they were being read
        const rule = require("fs")
            .readFileSync(require("path").join(__dirname, "..", "..", "media", "main.css"), "utf8")
            .match(/\.match \{[^}]*\}/)[0];

        expect(rule).not.toMatch(/font-weight/);
        expect(rule).not.toMatch(/padding/);
        expect(rule).not.toMatch(/margin/);
        expect(rule).not.toMatch(/border(?!-radius)/);
    });

    it("says how much of the result is on screen, and that the rest is hidden", () => {
        expect(panel.one(".shown-chip").textContent).toEqual("4 of 8 match (filtered)");
    });

    it("explains itself when nothing matches", async () => {
        await panel.filter("zzz");

        expect(panel.answers()).toHaveLength(0);
        expect(panel.callouts()[0].textContent).toContain("zzz");
    });
});

describe("the count of what is on screen", () => {
    // It comes and goes as you type and as the mode is switched. Anything ahead
    // of it in the strip gets shoved sideways every time it does, which made the
    // whole header jump while filtering.
    it("sits at the end of the strip, behind the figures every run has", async () => {
        const panel = panelWithSubsets();
        await panel.filter("a");

        const strip = [...panel.strip().children].map((child) => child.className);

        expect(strip[strip.length - 1]).toEqual("shown-chip");
        expect(strip[0]).toContain("result-badge");
    });

    it("leaves the figures before it exactly where they were", async () => {
        const panel = panelWithSubsets();
        const before = [...panel.strip().children].map((child) => child.textContent);

        await panel.filter("a");
        const after = [...panel.strip().children].map((child) => child.textContent);

        expect(after.slice(0, before.length)).toEqual(before);
    });

    it("stays put when the filter mode is switched too", async () => {
        const panel = panelWithSubsets();
        await panel.filter("a");
        const before = [...panel.strip().children].map((child) => child.textContent);

        panel.click(".filter-mode");
        const after = [...panel.strip().children].map((child) => child.textContent);

        expect(after).toHaveLength(before.length);
        expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    });
});

describe("highlighting instead of filtering", () => {
    let panel;

    beforeEach(async () => {
        panel = panelWithSubsets();
        await panel.filter("a");
        panel.click(".filter-mode");
    });

    it("starts out filtering, which is the better default for finding something", () => {
        const fresh = panelWithSubsets();

        expect(fresh.one(".filter-mode").getAttribute("aria-pressed")).toEqual("true");
    });

    it("keeps every answer on screen", () => {
        expect(panel.answers()).toHaveLength(8);
        expect(panel.one(".filter-mode").getAttribute("aria-pressed")).toEqual("false");
    });

    it("still marks the matches", () => {
        expect(panel.all(".match").length).toBeGreaterThan(0);
    });

    it("marks which answers matched, since they are no longer alone on screen", () => {
        expect(panel.all(".has-match")).toHaveLength(4);
    });

    it("counts the answers that matched rather than the ones shown", () => {
        expect(panel.one(".shown-chip").textContent).toEqual("4 of 8 match (highlighted)");
    });

    it("keeps the count meaning the same thing in both modes", () => {
        // Both modes count the answers that matched, so only the word naming the
        // mode changes: switching does not silently change what is counted
        const highlighting = panel.one(".shown-chip").textContent;
        panel.click(".filter-mode");
        const filtering = panel.one(".shown-chip").textContent;

        expect(highlighting).toEqual("4 of 8 match (highlighted)");
        expect(filtering).toEqual("4 of 8 match (filtered)");
        expect(filtering.startsWith("4 of 8 match")).toBe(true);
    });

    it("says what the box now does", () => {
        expect(panel.filterBox().placeholder).toEqual("Highlight atoms");
    });

    it("means the matches when copying the matched answers", async () => {
        panel.click(".more-button");
        panel.posted.length = 0;

        panel.menuButtons()[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(panel.posted[0].type).toEqual("copyFiltered");
        expect(panel.posted[0].indices).toHaveLength(4);
    });

    it("leaves every answer alone when nothing matches, and says so", async () => {
        await panel.filter("zzz");

        expect(panel.answers()).toHaveLength(8);
        expect(panel.callouts().some((c) => c.textContent.includes("Every answer is shown unchanged"))).toBe(true);
    });

    it("hides them again on switching back, and drops the marking", () => {
        panel.click(".filter-mode");

        expect(panel.answers()).toHaveLength(4);
        // Filtering makes the margin marker redundant: everything left matched
        expect(panel.all(".has-match")).toHaveLength(0);
    });
});

/**
 * @jest-environment jsdom
 */
// @ts-nocheck
jest.mock("vscode", () => require("./panelHarness.js").vscodeStub(), { virtual: true });

const { loadPanel, fixture } = require("./panelHarness.js");
const { formatWasmResult, partialResultFromModels } = require("../formatWasmResult.js");

/** A run that asked for statistics, from a program with real search in it. */
function panelWithStatistics() {
    const panel = loadPanel();
    panel.send({ type: "updateOutput", answers: formatWasmResult(fixture("withStatistics")) });
    return panel;
}

describe("solver statistics", () => {
    let panel;

    beforeEach(() => {
        panel = panelWithStatistics();
    });

    it("appear when the run asked for them", () => {
        expect(panel.all(".stats-details")).toHaveLength(1);
    });

    it("stay collapsed behind a summary that counts them", () => {
        const summary = panel.one(".stats-details summary");

        expect(summary.textContent).toMatch(/^Solver statistics \(\d+\)$/);
        expect(Number(summary.textContent.match(/\((\d+)\)/)[1])).toEqual(panel.all(".stats-value").length);
    });

    it("pair every name with a figure", () => {
        expect(panel.all(".stats-key").length).toBeGreaterThan(0);
        expect(panel.all(".stats-key")).toHaveLength(panel.all(".stats-value").length);
    });

    it("are grouped under their section", () => {
        const groups = panel.all(".stats-group-name").map((element) => element.textContent);

        expect(groups).toContain("LP");
        expect(groups).toContain("Problem");
    });

    it("do not repeat the section a figure already sits under", () => {
        expect(panel.all(".stats-key").every((key) => !key.textContent.startsWith("LP /"))).toBe(true);
    });

    it("never render a figure as [object Object]", () => {
        // Clingo reports the lemma types as an array of objects, which used to be
        // stringified straight into the panel
        expect(panel.all(".stats-value").every((value) => !value.textContent.includes("[object"))).toBe(true);
    });

    it("name an array entry by what it describes", () => {
        const lemmas = panel.all(".stats-key").map((key) => key.textContent).filter((key) => key.includes("Lemma"));

        expect(lemmas).toContain("Lemma / Type / Short / Sum");
        // The field that named the entry is already in the path above it
        expect(lemmas.every((key) => !key.endsWith("Short / Type"))).toBe(true);
    });

    it("are absent from a run that did not ask for them", () => {
        const plain = loadPanel();
        plain.send({ type: "updateOutput", answers: formatWasmResult(fixture("subsets2")) });

        expect(plain.all(".stats-details")).toHaveLength(0);
    });
});

describe("the command line a run reports", () => {
    const ranWith = "clingo --outf=2 --stats=2 program.lp lib.lp 0";

    /** @param {String} [command] */
    function panelWithCommand(command) {
        const panel = loadPanel();
        panel.send({ type: "updateOutput", answers: { ...formatWasmResult(fixture("subsets2")), command } });
        return panel;
    }

    it("is absent from a result that carries none", () => {
        expect(panelWithCommand(undefined).all(".command-details")).toHaveLength(0);
    });

    it("stays collapsed behind a summary, like the statistics", () => {
        const panel = panelWithCommand(ranWith);

        expect(panel.all(".command-details")).toHaveLength(1);
        expect(panel.one(".command-details summary").textContent).toEqual("Command line");
    });

    it("shows the line verbatim", () => {
        expect(panelWithCommand(ranWith).text(".command-line")).toEqual(ranWith);
    });

    it("can be copied through the extension", () => {
        const panel = panelWithCommand(ranWith);
        panel.posted.length = 0;

        panel.click(".command-copy");

        expect(panel.posted[0]).toEqual({ type: "copyText", text: ranWith });
    });
});

describe("a run that did not finish", () => {
    /** @param {Object} stoppedBy */
    function panelWithPartial(stoppedBy) {
        const panel = loadPanel();
        // Two answers kept out of the five the search had found
        panel.send({
            type: "updateOutput",
            answers: formatWasmResult(partialResultFromModels([["a"], ["a", "b"]], 5, 3, stoppedBy)),
        });
        return panel;
    }

    it("still shows the answers it found before the time limit stopped it", () => {
        const panel = panelWithPartial({ reason: "time-limit", seconds: 3 });

        expect(panel.answers()).toHaveLength(2);
    });

    it("names the limit rather than listing what might have done it", () => {
        const panel = panelWithPartial({ reason: "time-limit", seconds: 3 });

        expect(panel.callouts()[0].textContent).toContain("Stopped after 3s");
        expect(panel.callouts()[0].textContent).toContain("first 2 of the 5 answers");
    });

    it("reads as unfinished rather than as satisfiable", () => {
        const panel = panelWithPartial({ reason: "time-limit", seconds: 3 });

        expect(panel.one(".result-badge").textContent).toEqual("UNKNOWN");
    });

    it("leaves out the solver, which a terminated run never reported", () => {
        const panel = panelWithPartial({ reason: "time-limit", seconds: 3 });

        expect(panel.all(".stat")).toHaveLength(2);
    });

    it("keeps the answers when you stopped it yourself", () => {
        const panel = panelWithPartial({ reason: "cancelled" });

        expect(panel.answers()).toHaveLength(2);
    });

    it("does not blame a limit for a run you stopped yourself", () => {
        const panel = panelWithPartial({ reason: "cancelled" });

        expect(panel.callouts()[0].textContent).toContain("stopped manually");
        expect(panel.callouts()[0].textContent).not.toContain("time limit");
    });
});

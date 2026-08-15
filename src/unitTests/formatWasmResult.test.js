// @ts-nocheck
const { formatWasmResult, extractAnswers, MAX_RENDERED_ANSWERS } = require("../formatWasmResult.js");
const { loadClingo } = require("../clingoWasm.js");

/** Runs a program through the real solver, so the fixtures cannot drift from clingo. */
async function solve(program, models = 0) {
    const clingo = await loadClingo();
    return clingo.run(program, models);
}

describe("extractAnswers", () => {
    it("returns one entry per answer set", async () => {
        const answers = extractAnswers(await solve("{a;b}."));

        expect(answers).toHaveLength(4);
        expect(answers.map((atoms) => atoms.join(" ")).sort()).toEqual(["", "a", "a b", "b"]);
    });

    it("returns nothing for an unsatisfiable program", async () => {
        const result = await solve("a. :- a.");

        // The call carries no "Witnesses" at all, which used to produce [undefined]
        // and made the panel render a phantom "Answer 1/1"
        expect(result.Result).toEqual("UNSATISFIABLE");
        expect(extractAnswers(result)).toEqual([]);
    });

    it("survives a missing or empty result", () => {
        expect(extractAnswers(null)).toEqual([]);
        expect(extractAnswers(undefined)).toEqual([]);
        expect(extractAnswers({})).toEqual([]);
    });
});

describe("formatWasmResult", () => {
    it("reports an unsatisfiable run with no answers", async () => {
        const formatted = formatWasmResult(await solve("a. :- a."));

        expect(formatted.result).toEqual("UNSATISFIABLE");
        expect(formatted.answers).toEqual([]);
        expect(formatted.totalAnswers).toEqual(0);
        expect(formatted.truncated).toBe(false);
    });

    it("passes small results through untruncated", async () => {
        const formatted = formatWasmResult(await solve("{a;b;c}."));

        expect(formatted.totalAnswers).toEqual(8);
        expect(formatted.answers).toHaveLength(8);
        expect(formatted.truncated).toBe(false);
        expect(formatted.result).toEqual("SATISFIABLE");
    });

    it("caps how many answer sets reach the webview but reports the true total", async () => {
        // 2^10 = 1024 answer sets, comfortably over the cap
        const formatted = formatWasmResult(await solve("{a;b;c;d;e;f;g;h;i;j}."));

        expect(formatted.totalAnswers).toEqual(1024);
        expect(formatted.answers).toHaveLength(MAX_RENDERED_ANSWERS);
        expect(formatted.truncated).toBe(true);
    });

    it("keeps real clingo warnings and drops the empty placeholder", async () => {
        const clean = formatWasmResult(await solve("{a;b}."));
        expect(clean.warnings).toEqual([]);

        // "b" never occurs in a rule head, which clingo warns about
        const warned = formatWasmResult(await solve("a :- b."));
        expect(warned.warnings.length).toBeGreaterThan(0);
        expect(warned.warnings.join(" ")).toContain("atom does not occur in any rule head");
    });
});

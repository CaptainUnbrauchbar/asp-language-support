// @ts-nocheck
const { formatWasmResult, extractAnswers, partialResultFromModels, MAX_RENDERED_ANSWERS } = require("../formatWasmResult.js");
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

    it("passes the solver statistics on when a run asked for them", async () => {
        const withoutStats = formatWasmResult(await solve("{a;b}."));
        expect(withoutStats.stats).toBeUndefined();

        const clingo = await loadClingo();
        const withStats = formatWasmResult(await clingo.run("{a;b}.", 0, ["--stats=2"]));

        // Which figures clingo reports is its business, so this only checks that
        // they arrive and are something the panel can walk
        expect(withStats.stats).toBeDefined();
        expect(Object.keys(withStats.stats).length).toBeGreaterThan(0);
    });
});

describe("partialResultFromModels", () => {
    it("rebuilds a clingo shaped result from the models a stopped run had found", () => {
        const partial = partialResultFromModels([["a"], ["a", "b"]], 7, 3.0004, { reason: "time-limit", seconds: 3 });

        expect(partial.Result).toEqual("UNKNOWN");
        expect(extractAnswers(partial)).toEqual([["a"], ["a", "b"]]);
        // The count is what was found, which can exceed what was kept
        expect(partial.Models).toEqual({ Number: 7, More: "yes" });
        expect(partial.Time.Total).toEqual(3);
        expect(partial.StoppedBy).toEqual({ reason: "time-limit", seconds: 3, kept: 2 });
    });

    it("says who stopped the run, since the panel words those differently", () => {
        const byUser = partialResultFromModels([["a"]], 1, 2, { reason: "cancelled" });

        expect(byUser.StoppedBy).toEqual({ reason: "cancelled", kept: 1 });
        expect(byUser.StoppedBy.seconds).toBeUndefined();
    });

    it("formats into a payload the panel can render", () => {
        const formatted = formatWasmResult(partialResultFromModels([["a"]], 1, 1, { reason: "time-limit", seconds: 1 }));

        expect(formatted.result).toEqual("UNKNOWN");
        expect(formatted.answers).toEqual([["a"]]);
        expect(formatted.stoppedBy.reason).toEqual("time-limit");
        // A terminated run never reported its version, and the panel leaves the
        // solver out of the stat strip rather than showing an empty one
        expect(formatted.solver).toBeUndefined();
    });

    it("survives a run that was stopped before it found anything", () => {
        const formatted = formatWasmResult(partialResultFromModels([], 0, 5, { reason: "cancelled" }));

        expect(formatted.totalAnswers).toEqual(0);
        expect(formatted.answers).toEqual([]);
        expect(formatted.modelsNumber).toEqual(0);
    });

    it("carries the command through, since a stopped run is one worth inspecting", () => {
        // Being stopped is exactly when you go looking for which limit was set
        const command = "clingo --outf=2 --time-limit=1 program.lp 0";
        const partial = partialResultFromModels([["a"]], 1, 1, { reason: "time-limit", seconds: 1 }, command);

        expect(partial.Command).toEqual(command);
        expect(formatWasmResult(partial).command).toEqual(command);
    });
});

describe("parseClingoOutput", () => {
    const { parseClingoOutput } = require("../formatWasmResult.js");

    /** What `clingo --outf=2 program.lp 0` writes to stdout. */
    const reply = {
        Solver: "clingo version 5.7.1",
        Input: ["program.lp"],
        Call: [{ Witnesses: [{ Value: ["a"] }, { Value: ["b"] }] }],
        Result: "SATISFIABLE",
        Models: { Number: 2, More: "no" },
        Calls: 1,
        Time: { Total: 0.01, Solve: 0.001, Model: 0, Unsat: 0, CPU: 0.01 },
    };

    it("reads what your own clingo prints, which is the same JSON", () => {
        // Both are the same clingo asked the same way, so one reader serves both
        const parsed = parseClingoOutput(JSON.stringify(reply));

        expect(parsed.Result).toEqual("SATISFIABLE");
        expect(extractAnswers(parsed)).toEqual([["a"], ["b"]]);
    });

    it("hands the panel everything it renders for the bundled solver", () => {
        const formatted = formatWasmResult(parseClingoOutput(JSON.stringify(reply)));

        expect(formatted.totalAnswers).toEqual(2);
        expect(formatted.solver).toEqual("clingo version 5.7.1");
        expect(formatted.time.total).toEqual(0.01);
    });

    it("drops the program clingo echoes back, which the editor already has", () => {
        expect(parseClingoOutput(JSON.stringify(reply)).Input).toBeUndefined();
    });

    it("takes the warnings off stderr, where clingo puts them", () => {
        const parsed = parseClingoOutput(JSON.stringify(reply), "info: atom does not occur\n\nwarning: something else");

        expect(parsed.Warnings).toEqual(["info: atom does not occur", "warning: something else"]);
    });

    it("reports no warnings rather than one empty one", () => {
        expect(parseClingoOutput(JSON.stringify(reply), "").Warnings).toEqual([]);
        expect(formatWasmResult(parseClingoOutput(JSON.stringify(reply))).warnings).toEqual([]);
    });

    it("finds the reply behind anything printed in front of it", () => {
        expect(parseClingoOutput(`clingo version 5.7.1\n${JSON.stringify(reply)}`).Result).toEqual("SATISFIABLE");
    });

    it("gives up on output that is not the JSON we asked for", () => {
        // Which is what custom arguments choosing another format produce, and
        // the caller then shows the text as it came
        expect(parseClingoOutput("Answer: 1\na b\nSATISFIABLE")).toBeUndefined();
        expect(parseClingoOutput("")).toBeUndefined();
        expect(parseClingoOutput(undefined)).toBeUndefined();
        // aspif, which --pre emits
        expect(parseClingoOutput("asp 1 0 0\n1 0 1 1 0 0\n0")).toBeUndefined();
    });

    it("gives up on JSON that is not a clingo result", () => {
        expect(parseClingoOutput('{"something": "else"}')).toBeUndefined();
        expect(parseClingoOutput("[1, 2, 3]")).toBeUndefined();
    });
});

describe("the command a result carries", () => {
    it("reaches the panel from a finished run", () => {
        const command = "clingo --outf=2 --stats=2 program.lp 0";

        expect(formatWasmResult({ Models: {}, Time: {}, Command: command }).command).toEqual(command);
    });

    it("is simply absent from a result that has none", () => {
        expect(formatWasmResult({ Models: {}, Time: {} }).command).toBeUndefined();
    });
});

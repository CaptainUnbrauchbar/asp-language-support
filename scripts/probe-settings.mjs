/**
 * Checks which solver settings the bundled WASM clingo actually honours.
 *
 * Not every clingo option survives the trip through WebAssembly, and the ones
 * that do not are accepted and then quietly ignored rather than rejected, so
 * nothing short of running them says which is which. This records what each
 * option really does and fails when that changes, which is what makes a
 * clingo-wasm upgrade safe to take: run it after every bump.
 *
 *   npm run probe:settings
 *
 * Each case runs in its own process. A shared clingo module carries state
 * between runs and made an earlier version of this report results that could
 * not be reproduced, so isolation here is not an optimisation to remove.
 *
 * Note that "additionalFiles" is deliberately absent: the extension inlines
 * those files into the program itself before clingo ever sees them, so it is
 * covered by the unit tests rather than by anything observable here.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = new URL("../", import.meta.url);

/** Pigeonhole. Unsatisfiable, and slow enough that a limit has something to cut. */
const HARD = `p(1..11). h(1..10).
1 { in(P,H) : h(H) } 1 :- p(P).
:- in(P1,H), in(P2,H), P1 < P2.`;
const CHOICE = "{ x(1..4) }.";

/**
 * What we currently believe about each option:
 *   honoured    - clingo does what the option asks
 *   ignored     - accepted and silently does nothing
 *   unsupported - rejected outright, or unusable through this API
 */
const CASES = [
    {
        label: "Time limit",
        program: HARD,
        options: ["--time-limit=3"],
        expect: "ignored",
        note: "the extension enforces it by stopping the worker instead",
        // Honoured would mean finishing near the limit rather than near the
        // time the unrestricted run takes
        observe: (run, context) => (run.wall < context.baseline.wall / 2 ? "honoured" : "ignored"),
    },
    {
        label: "Conflict limit",
        program: HARD,
        options: ["--solve-limit=50,umax"],
        expect: "honoured",
        observe: (run) => (run.Result === "UNKNOWN" ? "honoured" : "ignored"),
    },
    {
        label: "Restart limit",
        program: HARD,
        options: ["--solve-limit=umax,1"],
        expect: "honoured",
        observe: (run) => (run.Result === "UNKNOWN" ? "honoured" : "ignored"),
    },
    {
        label: "Parallel solving",
        program: CHOICE,
        options: ["--parallel-mode 2,compete"],
        expect: "unsupported",
        note: "only the multithreaded build has it, which needs navigator.hardwareConcurrency",
        observe: (run) => (String(run.Error ?? "").includes("unknown option") ? "unsupported" : "honoured"),
    },
    {
        label: "Statistics level",
        program: CHOICE,
        options: ["--stats=2"],
        expect: "honoured",
        observe: (run) => (run.hasStats ? "honoured" : "ignored"),
    },
    {
        label: "Verbosity",
        program: CHOICE,
        options: ["--verbose=3"],
        expect: "ignored",
        note: "none of it reaches the JSON result",
        // Honoured would have to show up as something the plain run did not have
        observe: (run, context) => (JSON.stringify(run.keys) === JSON.stringify(context.plain.keys) ? "ignored" : "honoured"),
    },
    {
        label: "Preprocess only",
        program: CHOICE,
        options: ["--pre"],
        expect: "unsupported",
        note: "emits aspif text, which is not the JSON this API parses",
        observe: (run) => (run.Result === "ERROR" ? "unsupported" : "honoured"),
    },
    {
        label: "Constants",
        program: "#const n=1. v(n).",
        options: ["--const n=3"],
        expect: "honoured",
        observe: (run) => (JSON.stringify(run.answers) === JSON.stringify([["v(3)"]]) ? "honoured" : "ignored"),
    },
    {
        label: "Custom arguments",
        program: "{a;b}. #minimize{1,a:a}.",
        options: ["--opt-strategy=usc"],
        expect: "honoured",
        observe: (run) => (run.Result === "OPTIMUM FOUND" ? "honoured" : "ignored"),
    },
];

/** Runs one case in a fresh process and returns what it observed. */
function runCase(spec) {
    const output = execFileSync(process.execPath, [SELF, "--case", JSON.stringify(spec)], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(output.trim().split("\n").pop());
}

/////////////////////////////////////////////
/// Child: one case, one clingo, one exit ///
/////////////////////////////////////////////

if (process.argv[2] === "--case") {
    const { program, options = [], models = 0, guardMs = 90000 } = JSON.parse(process.argv[3]);
    const clingo = await import(new URL("node_modules/clingo-wasm/dist/index.node.js", ROOT).href);

    // An option that hangs must not hang the report
    let guardFired = false;
    const guard = setTimeout(() => {
        guardFired = true;
        clingo.restart();
    }, guardMs);

    const started = Date.now();
    let result;
    try {
        result = await clingo.run(program, models, options);
    } catch (error) {
        result = { Result: "THREW", Error: String(error) };
    }
    clearTimeout(guard);

    console.log(
        JSON.stringify({
            wall: (Date.now() - started) / 1000,
            guardFired,
            Result: result?.Result,
            Error: result?.Error,
            keys: Object.keys(result ?? {}).sort(),
            hasStats: "Stats" in (result ?? {}),
            answers: result?.Call?.flatMap((call) => call.Witnesses?.map((witness) => witness.Value) ?? []) ?? [],
        })
    );
    process.exit(0);
}

////////////////////////////////////
/// Parent: drive and report     ///
////////////////////////////////////

console.log("Probing the bundled clingo, one process per case. The unrestricted run takes a while.\n");

const context = {
    baseline: runCase({ program: HARD }),
    plain: runCase({ program: CHOICE }),
};
console.log(`unrestricted reference run: ${context.baseline.wall}s, ${context.baseline.Result}\n`);

let changed = 0;
for (const testCase of CASES) {
    const run = runCase({ program: testCase.program, options: testCase.options });
    const observed = run.guardFired ? "hung" : testCase.observe(run, context);
    const agrees = observed === testCase.expect;
    if (!agrees) {
        changed++;
    }
    console.log(
        [
            agrees ? "  ok  " : "CHANGED",
            testCase.label.padEnd(18),
            observed.padEnd(12),
            `${String(run.wall).padStart(6)}s`,
            agrees ? (testCase.note ?? "") : `expected "${testCase.expect}"`,
        ].join("  ")
    );
}

if (changed) {
    console.log(`\n${changed} option(s) no longer behave as recorded. Update CASES here, and the`);
    console.log("backends markers in src/solverSettings.js, to match what clingo now does.");
    process.exit(1);
}
console.log("\nEvery option behaves as recorded.");

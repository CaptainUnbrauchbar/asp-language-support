/**
 * Regenerates the clingo results the panel tests render.
 *
 * Run with `npm run fixtures:panel`.
 *
 * The panel is judged on what it does with a real solver reply, so these are
 * recorded from one rather than written by hand: a field clingo renames or
 * restructures then shows up as a failing panel test instead of quietly
 * rendering nothing. Keeping them on disk rather than solving during the tests
 * makes those tests fast, deterministic and free of a WebAssembly solver in a
 * DOM environment, which is a fight with no prize.
 *
 * Re-run this after upgrading clingo-wasm and look at what changed in git.
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));

/** Every program the panel tests need a reply for, and why. */
const CASES = [
    { name: "subsets3", program: "{a;b;c}.", models: 0, why: "8 answers, the everyday case" },
    { name: "subsets2", program: "{a;b}.", models: 0, why: "4 answers, and no statistics" },
    { name: "unsatisfiable", program: "a. :- a.", models: 0, why: "no answers at all" },
    { name: "withWarning", program: "a :- b.", models: 0, why: "clingo has something to say" },
    {
        name: "compare",
        program: "core. 1 { a; b; only } 2. :- only, a. :- only, b.",
        models: 0,
        why: "one atom in every answer, one in a single answer, two that vary",
    },
    { name: "single", program: "a. b.", models: 0, why: "nothing to compare against" },
    // Deliberately absent: a result with more than the 500 answers the panel
    // renders. The smallest program that produces one gives 1024 answer sets and
    // a third of a megabyte of JSON, to test a count. The truncation test grows
    // that shape itself instead.
    {
        name: "withStatistics",
        program: "1 { x(1..6) } 3. :- x(1), x(2).",
        models: 0,
        options: ["--stats=2"],
        why: "real search, so the nested lemma figures are reported",
    },
];

const clingo = await import("clingo-wasm");
mkdirSync(here, { recursive: true });

for (const { name, program, models, options = [], why } of CASES) {
    const result = await clingo.run(program, models, options);
    writeFileSync(join(here, `${name}.json`), `${JSON.stringify({ program, options, why, result }, undefined, 4)}\n`);
    console.log(`${name}: ${result.Result}, ${result.Models?.Number} model(s)`);
}

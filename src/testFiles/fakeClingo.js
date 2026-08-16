/**
 * Stands in for the clingo binary so the PATH runner can be tested.
 *
 * The repository ships no solver executable, and using whichever clingo happens
 * to be on the developer's machine would tie the tests to that version. NodeJS
 * is already here and is a real process in every way that matters to this
 * runner: it is spawned, it writes to both streams, it exits with a code, and it
 * can refuse to stop.
 *
 * The mode is read from the arguments the runner passes through, so the tests
 * drive it exactly as clingo would be driven: node plays clingo, this file plays
 * the logic program it was handed, and the options follow as they always do.
 */
const fs = require("fs");

const args = process.argv.slice(2);
const valueOf = (name) => {
    const found = args.find((arg) => arg.startsWith(`${name}=`));
    return found ? found.slice(name.length + 1) : undefined;
};

const mode = valueOf("--fake") ?? "json";

/** A reply in the shape clingo produces with --outf=2. */
const reply = {
    Solver: "clingo version 5.7.1",
    Input: ["program.lp"],
    Call: [{ Witnesses: [{ Value: ["a"] }, { Value: ["b"] }] }],
    Result: "SATISFIABLE",
    Models: { Number: 2, More: "no" },
    Calls: 1,
    Time: { Total: 0.01, Solve: 0.001, Model: 0 },
};

if (mode === "json") {
    process.stdout.write(JSON.stringify(reply));
    process.exit(10);
} else if (mode === "text") {
    process.stdout.write("Answer: 1\na b\nSATISFIABLE\n");
    process.exit(10);
} else if (mode === "fail") {
    process.stderr.write("syntax error, unexpected EOF\n");
    process.exit(1);
} else if (mode === "args") {
    // Echoes the program it was pointed at and everything after it, so the tests
    // can see that each argument arrived whole rather than re-split by a shell
    process.stdout.write(JSON.stringify({ program: process.argv[1], args }));
    process.exit(10);
} else if (mode === "stream") {
    // Writes answers one at a time the way clingo does with --outf=2, and never
    // finishes, so a test can watch the count climb and then stop it mid search
    const beat = valueOf("--beat");
    let written = 0;
    process.stdout.write('{"Solver":"clingo version 5.7.1","Call":[{"Witnesses":[');
    setInterval(() => {
        process.stdout.write(`${written ? "," : ""}{"Value":["a(${written})"]}`);
        written++;
        if (beat) {
            fs.writeFileSync(beat, String(written));
        }
    }, 20);
} else if (mode === "hang") {
    // A search that never ends. It touches a file as it goes, so a test can tell
    // whether it is still running after the extension claims to have stopped it,
    // which no amount of checking the parent process would reveal.
    const beat = valueOf("--beat");
    process.stdout.write("Solving...\n");
    setInterval(() => {
        if (beat) {
            fs.writeFileSync(beat, String(Date.now()));
        }
    }, 50);
} else if (mode === "stubborn") {
    // Declines to stop when asked politely, the way a solver busy in a search
    // can. Only the signal it cannot catch ends it.
    process.on("SIGTERM", () => {});
    process.on("SIGINT", () => {});
    const beat = valueOf("--beat");
    setInterval(() => {
        if (beat) {
            fs.writeFileSync(beat, String(Date.now()));
        }
    }, 50);
}

// @ts-nocheck
/**
 * The PATH runner had no tests at all, on the grounds that testing it would mean
 * putting a solver binary in the repository. It does not: NodeJS is a real
 * process in every way this module cares about, and src/testFiles/fakeClingo.js
 * plays the part. That gap is why a stopped run could go on searching in the
 * background for a whole release without anything noticing.
 */
const fs = require("fs");
const os = require("os");
const { join } = require("path");
const { runClingoPathForFileWithProgress, stopClingoProcess, isClingoProcessRunning } = require("../runClingoPathForFileWithProgress.js");

const FAKE_CLINGO = join(__dirname, "..", "testFiles", "fakeClingo.js");

/**
 * node plays clingo and the stand-in plays the program it was handed, which is
 * exactly the shape of a real run: the executable, the file, the model count,
 * then the options.
 */
function run(options = [], { token, program = FAKE_CLINGO, progress = { report: jest.fn() } } = {}) {
    return runClingoPathForFileWithProgress(
        { window: { showWarningMessage: jest.fn() } },
        progress,
        process.execPath,
        program,
        0,
        options,
        token
    );
}

/** A cancellation token whose cancellation a test decides. */
function fakeToken() {
    const listeners = [];
    return {
        onCancellationRequested: (listener) => {
            listeners.push(listener);
            return { dispose: jest.fn() };
        },
        cancel: () => listeners.forEach((listener) => listener()),
    };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("running clingo from PATH", () => {
    it("collects what it printed and the code it exited with", async () => {
        const result = await run(["--fake=json"]);

        expect(result.code).toEqual(10);
        expect(JSON.parse(result.output).Result).toEqual("SATISFIABLE");
        expect(result.stopped).toBe(false);
    });

    it("collects what it wrote to stderr as well", async () => {
        const result = await run(["--fake=fail"]);

        expect(result.code).toEqual(1);
        expect(result.errorOutput).toContain("syntax error");
    });

    it("hands clingo the file, then the model count, then the options", async () => {
        const seen = JSON.parse((await run(["--fake=args"])).output);

        expect(seen.program).toEqual(FAKE_CLINGO);
        // clingo takes the count as a bare positional argument, not an option
        expect(seen.args[0]).toEqual("0");
        expect(seen.args).toContain("--fake=args");
    });

    it("passes a path with spaces in it as one argument", async () => {
        // It used to go through a shell, which re-parsed the command line and
        // split such a path in half unless it was quoted by hand
        const spaced = join(fs.mkdtempSync(join(os.tmpdir(), "clingo-space-")), "a program with spaces.js");
        fs.copyFileSync(FAKE_CLINGO, spaced);

        const seen = JSON.parse((await run(["--fake=args"], { program: spaced })).output);

        expect(seen.program).toEqual(spaced);
    });

    it("resolves rather than hanging when clingo cannot be started", async () => {
        // A promise that never settles leaves the extension believing a run is
        // in flight, which refuses every later one until VSCode is restarted
        const result = await runClingoPathForFileWithProgress(
            { window: {} },
            { report: jest.fn() },
            join(__dirname, "no-such-clingo-anywhere"),
            FAKE_CLINGO,
            0,
            []
        );

        expect(result.code).toEqual(-1);
        expect(result.errorOutput).not.toEqual("");
    });

    it("holds on to nothing once a run has finished", async () => {
        await run(["--fake=json"]);

        expect(isClingoProcessRunning()).toBe(false);
        expect(stopClingoProcess()).toBe(false);
    });

    it("reports the zero of a run that performed no search", async () => {
        // "Preprocess only" ends this way, and it is not a failure
        const result = await run(["--fake=pre"]);

        expect(result.code).toEqual(0);
        expect(result.output).toContain("asp 1 0 0");
        expect(result.stopped).toBe(false);
    });

    it("reports a failure that explained nothing, without inventing a reason", async () => {
        const result = await run(["--fake=quiet-failure"]);

        expect(result.code).toEqual(65);
        expect(result.errorOutput).toEqual("");
    });

    it("says which signal ended a process that was killed", async () => {
        // A process killed by a signal reports no exit code at all
        const running = run(["--fake=hang", `--beat=${join(os.tmpdir(), "unused-beat")}`]);
        await wait(300);
        stopClingoProcess();
        const result = await running;

        // Killed one way or the other: a code or a signal, never neither
        expect(result.code !== null || result.signal !== null).toBe(true);
    }, 15000);

    it("reads the answers of a finished run without being asked twice", async () => {
        const result = await run(["--fake=json"]);

        expect(result.witnesses).toEqual([["a"], ["b"]]);
        expect(result.totalWitnesses).toEqual(2);
    });
});

describe("reporting progress while clingo searches", () => {
    let beat;

    beforeEach(() => {
        beat = join(fs.mkdtempSync(join(os.tmpdir(), "clingo-progress-")), "beat");
    });

    it("counts the models as they arrive, not only at the end", async () => {
        // A long run used to show a spinner and no news, which is exactly when
        // you want to know whether it is getting anywhere
        const progress = { report: jest.fn() };
        const running = run(["--fake=stream", `--beat=${beat}`], { progress });

        for (let attempt = 0; attempt < 100 && !fs.existsSync(beat); attempt++) {
            await wait(50);
        }
        await wait(500);
        stopClingoProcess();
        await running;

        const counted = progress.report.mock.calls.map(([update]) => update.message).filter((message) => /model\(s\) found/.test(message));
        expect(counted.length).toBeGreaterThan(0);
        expect(counted[counted.length - 1]).toMatch(/Solving\.\.\. \d+ model\(s\) found/);
    }, 15000);

    it("says nothing about models for output it cannot read them from", async () => {
        // Asking clingo for its own text format is allowed, and guessing at a
        // count from it would be worse than saying nothing
        const progress = { report: jest.fn() };
        await run(["--fake=text"], { progress });

        const messages = progress.report.mock.calls.map(([update]) => update.message);
        expect(messages.some((message) => /model\(s\) found/.test(message))).toBe(false);
    });
});

describe("stopping clingo from PATH", () => {
    /** Where the stand-in records that it is still going. */
    let beat;

    beforeEach(() => {
        beat = join(fs.mkdtempSync(join(os.tmpdir(), "clingo-stop-")), "beat");
    });

    /** Whether the process is still doing work, which its parent cannot tell us. */
    async function stillRunning() {
        const before = fs.existsSync(beat) ? fs.readFileSync(beat, "utf8") : "";
        await wait(400);
        const after = fs.existsSync(beat) ? fs.readFileSync(beat, "utf8") : "";
        return before !== after;
    }

    /** Waits until it is definitely working, rather than guessing how long it takes to start. */
    async function waitUntilWorking() {
        for (let attempt = 0; attempt < 100 && !fs.existsSync(beat); attempt++) {
            await wait(50);
        }
        expect(fs.existsSync(beat)).toBe(true);
    }

    it("actually stops the search, not just the thing that started it", async () => {
        // Spawning through a shell put cmd.exe between the extension and clingo,
        // so killing the child killed the shell and left clingo running with
        // nothing holding on to it. This is that bug.
        const running = run(["--fake=hang", `--beat=${beat}`]);
        await waitUntilWorking();
        expect(await stillRunning()).toBe(true);

        expect(stopClingoProcess()).toBe(true);
        const result = await running;

        expect(result.stopped).toBe(true);
        expect(await stillRunning()).toBe(false);
    }, 15000);

    it("ends one that declines to stop when asked politely", async () => {
        // A solver deep in a search can ignore SIGTERM, so it is followed up
        const running = run(["--fake=stubborn", `--beat=${beat}`]);
        await waitUntilWorking();

        stopClingoProcess();
        const result = await running;

        expect(result.stopped).toBe(true);
        expect(await stillRunning()).toBe(false);
    }, 15000);

    it("stops on the Cancel button of the progress notification too", async () => {
        const token = fakeToken();
        const running = run(["--fake=hang", `--beat=${beat}`], { token });
        await waitUntilWorking();

        token.cancel();
        const result = await running;

        expect(result.stopped).toBe(true);
        expect(await stillRunning()).toBe(false);
    }, 15000);

    it("keeps whatever it had printed before it was stopped", async () => {
        const running = run(["--fake=hang", `--beat=${beat}`]);
        await waitUntilWorking();

        stopClingoProcess();
        const result = await running;

        expect(result.output).toContain("Solving...");
    }, 15000);

    it("hands back the answers it found, already read", async () => {
        // Otherwise the output has to be scanned a second time to find out what
        // a stopped run managed, and the whole of it kept to do so
        const running = run(["--fake=stream", `--beat=${beat}`]);
        await waitUntilWorking();
        await wait(300);

        stopClingoProcess();
        const result = await running;

        expect(result.witnesses.length).toBeGreaterThan(0);
        expect(result.witnesses[0]).toEqual(["a(0)"]);
        expect(result.totalWitnesses).toEqual(result.witnesses.length);
        expect(result.seconds).toBeGreaterThan(0);
    }, 15000);

    it("has nothing to stop before a run and after it", async () => {
        expect(stopClingoProcess()).toBe(false);

        const running = run(["--fake=hang", `--beat=${beat}`]);
        await waitUntilWorking();
        expect(isClingoProcessRunning()).toBe(true);

        stopClingoProcess();
        await running;

        expect(isClingoProcessRunning()).toBe(false);
    }, 15000);
});

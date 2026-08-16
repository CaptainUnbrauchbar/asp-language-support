// @ts-nocheck
const { DEFAULT_SETTINGS, SETTING_FIELDS, normalizeSettings, settingsToArgs, configToSettings } = require("../solverSettings.js");

/** Ignores the filesystem, so these tests only judge the argument building. */
const noFiles = "/nowhere";
const keepArgs = (value) => (value ? String(value).split(/\s+/).filter(Boolean) : []);

/** The options of a run, without the resolved file paths. */
function optionsFor(settings) {
    return settingsToArgs(settings, noFiles, keepArgs).args.filter((arg) => arg.startsWith("-"));
}

describe("normalizeSettings", () => {
    it("fills in everything that is missing", () => {
        expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    });

    it("coerces values that arrived as the wrong type", () => {
        const settings = normalizeSettings({ timeLimit: "12", preProcessor: "yes", constants: 5 });

        expect(settings.timeLimit).toBe(12);
        expect(settings.preProcessor).toBe(true);
        expect(settings.constants).toBe("5");
    });

    it("refuses a nonsense choice and a negative number", () => {
        const settings = normalizeSettings({ parallelMode: "race", timeLimit: -10, parallelThreads: 0 });

        expect(settings.parallelMode).toBe("compete");
        expect(settings.timeLimit).toBe(0);
        // threads has a minimum of one
        expect(settings.parallelThreads).toBe(1);
    });

    it("describes every field it can store", () => {
        const described = SETTING_FIELDS.map((field) => field.key).sort();
        expect(described).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    });
});

describe("settingsToArgs", () => {
    it("passes nothing on for the defaults", () => {
        expect(optionsFor(DEFAULT_SETTINGS)).toEqual([]);
    });

    it("only sets the limits that are actually limited", () => {
        expect(optionsFor({ timeLimit: 30 })).toEqual(["--time-limit=30"]);
        expect(optionsFor({ solveLimitConflicts: 100 })).toEqual(["--solve-limit=100,umax"]);
        expect(optionsFor({ solveLimitRestarts: 5 })).toEqual(["--solve-limit=umax,5"]);
    });

    it("never emits the zero clingo reads as 'stop immediately'", () => {
        expect(optionsFor({ solveLimitConflicts: 0, solveLimitRestarts: 0 })).toEqual([]);
    });

    it("only asks for threads when parallel solving is switched on", () => {
        expect(optionsFor({ parallelThreads: 4, parallelMode: "split" })).toEqual([]);
        expect(optionsFor({ parallelEnabled: true, parallelThreads: 4, parallelMode: "split" })).toEqual([
            "--parallel-mode 4,split",
        ]);
    });

    it("turns the constants field into one option each", () => {
        expect(optionsFor({ constants: "n=3, k=2" })).toEqual(["--const n=3", "--const k=2"]);
        expect(optionsFor({ constants: "  " })).toEqual([]);
    });

    it("hands custom arguments through the filter it is given", () => {
        const dropEverything = settingsToArgs({ customArgs: "--outf=n" }, noFiles, () => []);
        expect(dropEverything.args).toEqual([]);

        const keepThem = settingsToArgs({ customArgs: "--opt-strategy=usc" }, noFiles, keepArgs);
        expect(keepThem.args).toEqual(["--opt-strategy=usc"]);
    });

    it("reports patterns that matched nothing", () => {
        const { unmatched } = settingsToArgs({ additionalFiles: "nothing/*.lp" }, noFiles, keepArgs);
        expect(unmatched).toEqual(["nothing/*.lp"]);
    });
});

describe("settings the solver cannot honour", () => {
    /** The options of a run against a named solver. */
    const optionsOn = (settings, backend) =>
        settingsToArgs(settings, noFiles, keepArgs, backend).args.filter((arg) => arg.startsWith("-"));

    it("leaves out what the bundled solver would only ignore", () => {
        // The wasm build discards clingo's verbose output and cannot return the
        // aspif text the preprocessor produces, so sending either is pointless
        expect(optionsOn({ verbose: 3, preProcessor: true }, "wasm")).toEqual([]);
    });

    it("still sends them to your own clingo, where they work", () => {
        expect(optionsOn({ verbose: 3, preProcessor: true }, "path")).toEqual(["--verbose=3", "--pre"]);
    });

    it("sends the options both solvers honour either way", () => {
        const both = { stats: 2, constants: "n=3", solveLimitConflicts: 10 };
        expect(optionsOn(both, "wasm")).toEqual(optionsOn(both, "path"));
        expect(optionsOn(both, "wasm")).toEqual(["--solve-limit=10,umax", "--stats=2", "--const n=3"]);
    });

    it("keeps sending the time limit to the bundled solver, which enforces it itself", () => {
        // It travels with the run because that is where the extension's own
        // timer reads it from, even though clingo ignores it there
        expect(optionsOn({ timeLimit: 5 }, "wasm")).toEqual(["--time-limit=5"]);
    });

    it("agrees with the fields about which solver each option needs", () => {
        SETTING_FIELDS.forEach((field) => {
            if (field.backends) {
                // A field that limits itself owes the user a reason
                expect(field.unsupportedNote).toBeTruthy();
                expect(field.backends.every((backend) => ["wasm", "path"].includes(backend))).toBe(true);
            }
        });
    });
});

describe("configToSettings", () => {
    it("carries an existing config across", () => {
        const settings = configToSettings({
            name: "Old",
            additionalFiles: ["lib.lp", "instances/*.lp"],
            args: {
                timeLimit: 60,
                solveLimit: { conflicts: 10, restarts: 0 },
                parallelMode: { useParallelMode: true, threads: 4, mode: "split" },
                stats: 1,
                verboseMode: 2,
                preProcessor: true,
                constants: ["n=3"],
                customArgs: "--opt-strategy=usc",
            },
        });

        expect(settings).toMatchObject({
            timeLimit: 60,
            solveLimitConflicts: 10,
            solveLimitRestarts: 0,
            parallelEnabled: true,
            parallelThreads: 4,
            parallelMode: "split",
            stats: 1,
            verbose: 2,
            preProcessor: true,
            constants: "n=3",
            additionalFiles: "lib.lp, instances/*.lp",
            customArgs: "--opt-strategy=usc",
        });
    });

    it("produces usable settings from a nearly empty config", () => {
        expect(configToSettings({})).toEqual(DEFAULT_SETTINGS);
        expect(configToSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    });

    it("round trips into the same arguments the config would have produced", () => {
        const settings = configToSettings({ args: { timeLimit: 60, constants: ["n=3"] } });

        expect(optionsFor(settings)).toEqual(["--time-limit=60", "--const n=3"]);
    });
});

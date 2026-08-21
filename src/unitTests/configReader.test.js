// @ts-nocheck
// configReader pulls in vscode, which only exists inside a running extension host
jest.mock(
    "vscode",
    () => ({ window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() } }),
    { virtual: true }
);

const vscode = require("vscode");
const Ajv = require("ajv").default;
const { readCustomArgs, optionName, formatSchemaErrors, validateConfigObject, findConfig } = require("../configReader.js");
const schema = require("../../schema.json");

/** Validates against the real schema, so the tests cannot drift from it. */
function problemsFor(config) {
    const validate = new Ajv({ allErrors: true }).compile(schema);
    validate(config);
    return formatSchemaErrors(validate.errors);
}

const validConfig = { name: "Test", version: "1.0.0", author: "Someone", args: {} };

describe("optionName", () => {
    it.each([
        ["--outf=2", "outf"],
        ["--outf 2", "outf"],
        ["-n 3", "n"],
        ["--parallel-mode 2,compete", "parallel-mode"],
        ["--version", "version"],
        ["notAnOption", undefined],
        ["", undefined],
    ])("reads the option name of %s", (token, expected) => {
        expect(optionName(token)).toBe(expected);
    });
});

describe("readCustomArgs", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("keeps arguments the extension does not control", () => {
        expect(readCustomArgs("--const a=3 -c x=3 --stats=1 -q")).toEqual(["--const a=3", "-c x=3", "--stats=1", "-q"]);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it.each([
        ["--outf=n", "outf in = form"],
        ["--outf n", "outf in space form"],
        ["--models 3", "models long form"],
        ["-n 3", "models short form"],
        ["--text", "text output"],
        ["--version", "version"],
        ["--help", "help long form"],
        ["-h", "help short form"],
    ])("drops the reserved argument %s (%s)", (arg) => {
        expect(readCustomArgs(arg)).toEqual([]);
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it("drops only the reserved arguments and keeps the rest", () => {
        // the config that made clingo fail with "multiple occurrences: 'outf'"
        const result = readCustomArgs("--version --const a=3 --outf=n -c x=3");

        expect(result).toEqual(["--const a=3", "-c x=3"]);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            "Ignoring 2 custom argument(s) reserved by this extension: --version, --outf=n"
        );
    });

    it("returns nothing when customArgs is absent or empty", () => {
        expect(readCustomArgs(undefined)).toEqual([]);
        expect(readCustomArgs("")).toEqual([]);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it("keeps quiet when asked to, since the pane previews on every keystroke", () => {
        expect(readCustomArgs("--version", { quiet: true })).toEqual([]);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });
});

describe("readCustomArgs for your own clingo", () => {
    beforeEach(() => jest.clearAllMocks());

    it.each(["--outf=1", "--outf 1", "--text"])("lets it print in the format you asked for: %s", (arg) => {
        // The bundled solver only exists to hand back the JSON of --outf=2 and
        // parses whatever comes back, so a second format breaks the run. A binary
        // has no such problem, and choosing the format is much of why you run one.
        expect(readCustomArgs(arg, { backend: "path" })).toEqual([arg]);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();

        expect(readCustomArgs(arg, { backend: "wasm" })).toEqual([]);
    });

    it("still refuses what breaks either solver", () => {
        // The count is passed separately, and these two print and exit without
        // ever solving
        for (const arg of ["--models 3", "-n 3", "--version", "--help"]) {
            expect(readCustomArgs(arg, { backend: "path" })).toEqual([]);
        }
    });
});

describe("choosesOutputFormat", () => {
    const { choosesOutputFormat } = require("../configReader.js");

    it.each([["--outf=1"], ["--outf 1"], ["--text"], ["--pre"]])("recognises %s as picking a format", (arg) => {
        expect(choosesOutputFormat([arg])).toBe(true);
    });

    it("leaves ordinary options to be run with the JSON output we ask for", () => {
        expect(choosesOutputFormat(["--stats=2", "--const n=3", "--parallel-mode 4,split"])).toBe(false);
        expect(choosesOutputFormat([])).toBe(false);
        expect(choosesOutputFormat(undefined)).toBe(false);
    });
});

describe("formatSchemaErrors", () => {
    it("treats the metadata fields as optional", () => {
        // name/author/version describe the config, they do not configure anything,
        // so listing two files should not require inventing a version number
        expect(problemsFor({ additionalFiles: ["lib.lp"], args: {} })).toEqual([]);
    });

    it("catches a misspelled key instead of ignoring it", () => {
        // "solveLimits" silently did nothing for as long as it was accepted
        const problems = problemsFor({ ...validConfig, args: { solveLimits: { conflicts: 0 } } });

        expect(problems).toEqual(["args: must NOT have additional properties"]);
    });

    it("names the field by path when a value has the wrong type", () => {
        expect(problemsFor({ ...validConfig, args: { models: "many" } })).toEqual(["args.models: must be integer"]);
    });

    it("lists the allowed values for an invalid choice", () => {
        const problems = problemsFor({
            ...validConfig,
            args: { parallelMode: { useParallelMode: true, mode: "race", threads: 2 } },
        });

        expect(problems).toEqual([
            "args.parallelMode.mode: must be equal to one of the allowed values (allowed: compete, split)",
        ]);
    });

    it("reports every problem at once rather than stopping at the first", () => {
        const problems = problemsFor({ name: "Test", args: { models: "many", timeLimit: true, stats: "lots" } });

        expect(problems).toHaveLength(3);
        expect(problems).toEqual(
            expect.arrayContaining([
                "args.models: must be integer",
                "args.timeLimit: must be integer",
                "args.stats: must be integer",
            ])
        );
    });

    it("produces nothing for a valid config and survives no errors", () => {
        expect(problemsFor(validConfig)).toEqual([]);
        expect(formatSchemaErrors(null)).toEqual([]);
        expect(formatSchemaErrors(undefined)).toEqual([]);
    });
});

describe("validateConfigObject", () => {
    // The extension folder is the repository root when running from a checkout
    const root = require("path").join(__dirname, "..", "..");

    it("accepts the sample config the extension writes", () => {
        expect(validateConfigObject(require("../../sampleConfig.json"), root)).toEqual([]);
    });

    it("accepts a config that sets almost nothing", () => {
        expect(validateConfigObject({}, root)).toEqual([]);
        expect(validateConfigObject({ args: { timeLimit: 30 } }, root)).toEqual([]);
    });

    it("names every problem rather than stopping at the first", () => {
        const problems = validateConfigObject({ args: { timeLimit: "soon", stats: "lots" }, nonsense: true }, root);

        expect(problems.length).toBeGreaterThanOrEqual(3);
        expect(problems.join(" ")).toContain("args.timeLimit");
        expect(problems.join(" ")).toContain("args.stats");
    });

    it("still accepts the models key older configs carry", () => {
        expect(validateConfigObject({ args: { models: 0 } }, root)).toEqual([]);
    });

    it("accepts what the settings pane exports", () => {
        // Exporting writes a file meant to be imported again, on this machine or
        // someone else's, so it has to satisfy the same schema importing checks
        const { settingsToConfig, DEFAULT_SETTINGS } = require("../solverSettings.js");

        expect(validateConfigObject(settingsToConfig(DEFAULT_SETTINGS), root)).toEqual([]);
        expect(
            validateConfigObject(
                settingsToConfig({
                    ...DEFAULT_SETTINGS,
                    parallelEnabled: true,
                    parallelMode: "split",
                    constants: "n=3",
                    additionalFiles: "lib.lp",
                }),
                root
            )
        ).toEqual([]);
    });
});

describe("findConfig", () => {
    const fs = require("fs");
    const { join } = require("path");
    // resolve() so the drive letter matches what findConfig itself produces
    const BASE = require("path").resolve("/work");

    /** Only the listed absolute paths exist. */
    function onDisk(...paths) {
        const present = new Set(paths);
        jest.spyOn(fs, "existsSync").mockImplementation((path) => present.has(String(path)));
    }

    afterEach(() => jest.restoreAllMocks());

    it("finds a config sitting next to the file", () => {
        onDisk(join(BASE, "config.json"));

        expect(findConfig(BASE, "config.json")).toEqual(join(BASE, "config.json"));
    });

    it("keeps looking upwards so one config can serve a whole project", () => {
        onDisk(join(BASE, "config.json"));

        expect(findConfig(join(BASE, "a", "b"), "config.json")).toEqual(join(BASE, "config.json"));
    });

    it("takes a name carrying a path relative to the file", () => {
        onDisk(join(BASE, "conf", "solver.json"));

        expect(findConfig(BASE, "conf/solver.json")).toEqual(join(BASE, "conf", "solver.json"));
    });

    it.each([
        ["../../../etc/passwd"],
        // Stripping a leading "../" is not enough on its own
        ["conf/../../../etc/passwd"],
        [".."],
        ["."],
    ])("refuses %s, which points outside the project", (name) => {
        jest.spyOn(fs, "existsSync").mockReturnValue(true);

        expect(findConfig(BASE, name)).toBeUndefined();
    });

    it("gives up rather than walking forever when nothing is found", () => {
        onDisk();

        expect(findConfig(join(BASE, "a"), "config.json")).toBeUndefined();
    });
});

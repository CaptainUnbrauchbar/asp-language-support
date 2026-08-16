// @ts-nocheck
// configReader pulls in vscode, which only exists inside a running extension host
jest.mock(
    "vscode",
    () => ({ window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() } }),
    { virtual: true }
);

const vscode = require("vscode");
const Ajv = require("ajv").default;
const { readCustomArgs, readSolveLimit, optionName, formatSchemaErrors, validateConfigObject } = require("../configReader.js");
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

describe("readSolveLimit", () => {
    it.each([
        [{ conflicts: 0, restarts: 0 }, []],
        [{ conflicts: 100, restarts: 0 }, ["--solve-limit=100,umax"]],
        [{ conflicts: 0, restarts: 5 }, ["--solve-limit=umax,5"]],
        [{ conflicts: 10, restarts: 2 }, ["--solve-limit=10,2"]],
    ])("turns %j into %j", (solveLimit, expected) => {
        expect(readSolveLimit(solveLimit)).toEqual(expected);
    });

    it("passes nothing on when the config sets no solve limit", () => {
        expect(readSolveLimit(undefined)).toEqual([]);
    });

    it("never emits the zero clingo reads as 'stop immediately'", () => {
        // --solve-limit=0,0 halts before the first conflict and reports UNKNOWN,
        // which is not what a config full of zeros is asking for
        for (const limit of [{ conflicts: 0, restarts: 0 }, { conflicts: 0 }, { restarts: 0 }, {}]) {
            expect(readSolveLimit(limit).join(" ")).not.toContain("0");
        }
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
});

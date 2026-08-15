// @ts-nocheck
// configReader pulls in vscode, which only exists inside a running extension host
jest.mock(
    "vscode",
    () => ({ window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() } }),
    { virtual: true }
);

const vscode = require("vscode");
const Ajv = require("ajv").default;
const { readCustomArgs, optionName, formatSchemaErrors } = require("../configReader.js");
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
    it("names a missing top level property", () => {
        const { author, ...withoutAuthor } = validConfig;

        expect(problemsFor(withoutAuthor)).toEqual(["author: must have required property 'author'"]);
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
        const problems = problemsFor({ name: "Test", args: { models: "many", timeLimit: true } });

        // two missing properties plus two wrong types
        expect(problems).toHaveLength(4);
        expect(problems).toEqual(
            expect.arrayContaining([
                "version: must have required property 'version'",
                "author: must have required property 'author'",
                "args.models: must be integer",
                "args.timeLimit: must be integer",
            ])
        );
    });

    it("produces nothing for a valid config and survives no errors", () => {
        expect(problemsFor(validConfig)).toEqual([]);
        expect(formatSchemaErrors(null)).toEqual([]);
        expect(formatSchemaErrors(undefined)).toEqual([]);
    });
});

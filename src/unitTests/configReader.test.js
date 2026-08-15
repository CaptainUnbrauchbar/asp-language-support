// @ts-nocheck
// configReader pulls in vscode, which only exists inside a running extension host
jest.mock(
    "vscode",
    () => ({ window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() } }),
    { virtual: true }
);

const vscode = require("vscode");
const { readCustomArgs, optionName } = require("../configReader.js");

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

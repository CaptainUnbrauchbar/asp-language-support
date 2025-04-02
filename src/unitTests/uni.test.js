// @ts-nocheck
const fs = require("fs");
const { runClingoWasmForFileWithProgress } = require("../runClingoWasmForFileWithProgress.js");

describe("runClingoWasmForFile", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should read a single ASP file and run Clingo WASM successfully", async () => {
        const filePath = "src/testFiles/sudokuComplete.lp";

        const result = await runClingoWasmForFileWithProgress(
            { window: jest.fn() },
            { report: jest.fn() },
            filePath,
            0
        );

        expect(result.Models.Number).toEqual(8);
    });

    it.each([
        ["src/testFiles/sudoku.lp", "src/testFiles/ex01.lp"],
        ["src/testFiles/ex01.lp", "src/testFiles/sudoku.lp"],
    ])("should read a two ASP file and run Clingo WASM successfully", async (first, second) => {
        const result = await runClingoWasmForFileWithProgress({ window: jest.fn() }, { report: jest.fn() }, first, 0, [
            second,
        ]);

        expect(result.Models.Number).toEqual(8);
    });
});

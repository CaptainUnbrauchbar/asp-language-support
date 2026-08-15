// @ts-nocheck
const fs = require("fs");
const { runClingoWasmForFileWithProgress } = require("../runClingoWasmForFileWithProgress.js");

/**
 * Minimal stand-in for a vscode CancellationToken that lets a test decide when
 * the cancellation fires.
 */
function fakeCancellationToken() {
    const listeners = [];
    return {
        onCancellationRequested: (listener) => {
            listeners.push(listener);
            return { dispose: jest.fn() };
        },
        cancel: () => listeners.forEach((listener) => listener()),
    };
}

describe("runClingoWasmForFile", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should read a single ASP file and run Clingo WASM successfully", async () => {
        const filePath = "src/testFiles/sudokuComplete.lp";

        const result = await runClingoWasmForFileWithProgress({ window: jest.fn() }, { report: jest.fn() }, filePath, 0);

        expect(result.Models.Number).toEqual(8);
    });

    it.each([
        ["src/testFiles/sudoku.lp", "src/testFiles/ex01.lp"],
        ["src/testFiles/ex01.lp", "src/testFiles/sudoku.lp"],
    ])("should read a two ASP file and run Clingo WASM successfully", async (first, second) => {
        const result = await runClingoWasmForFileWithProgress({ window: jest.fn() }, { report: jest.fn() }, first, 0, [second]);

        expect(result.Models.Number).toEqual(8);
    });

    it("should handle errors when reading the file", async () => {
        const filePath = "src/testFiles/nonExistentFile.lp";

        const result = await runClingoWasmForFileWithProgress(
            { window: { showErrorMessage: jest.fn() } },
            { report: jest.fn() },
            filePath,
            0
        );

        expect(result).toBe(null);
    });

    it("should handle errors when reading additional files", async () => {
        const filePath = "src/testFiles/sudokuComplete.lp";
        const additionalFilePath = "src/testFiles/nonExistentFile.lp";

        const result = await runClingoWasmForFileWithProgress(
            { window: { showErrorMessage: jest.fn() } },
            { report: jest.fn() },
            filePath,
            0,
            [additionalFilePath]
        );

        expect(result).toBe(null);
    });

    it("should handle errors when running Clingo WASM", async () => {
        const filePath = "src/testFiles/sudokuComplete.lp";

        const result = await runClingoWasmForFileWithProgress(
            { window: { showErrorMessage: jest.fn() } },
            { report: jest.fn() },
            "src/testFiles/exSyntaxError.lp",
            0
        );

        expect(result).toBe(null);
    });

    it("should abort a long running solve when the token is cancelled", async () => {
        const vscode = { window: { showErrorMessage: jest.fn(), showInformationMessage: jest.fn() } };
        const token = fakeCancellationToken();

        const pending = runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/longRunning.lp", 0, [], token);

        // Give clingo a moment to actually start solving before pulling the plug
        await new Promise((resolve) => setTimeout(resolve, 500));
        token.cancel();

        const result = await pending;

        expect(result).toBe(null);
        // Cancelling is the user's choice, so it must not be reported as an error
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Clingo run cancelled.");
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    }, 30000);

    it("should still solve after a run was cancelled", async () => {
        const vscode = { window: { showErrorMessage: jest.fn(), showInformationMessage: jest.fn() } };
        const token = fakeCancellationToken();

        const pending = runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/longRunning.lp", 0, [], token);
        await new Promise((resolve) => setTimeout(resolve, 500));
        token.cancel();
        await pending;

        // The aborted worker has to be replaced transparently by the next run
        const result = await runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/sudokuComplete.lp", 0);

        expect(result.Models.Number).toEqual(8);
    }, 30000);

    it("should solve even when the config asks for parallel solving", async () => {
        const vscode = { window: { showErrorMessage: jest.fn(), showInformationMessage: jest.fn(), showWarningMessage: jest.fn() } };

        // On the single threaded wasm build these options abort the run with
        // "unknown option", so they have to be dropped; where threads are
        // supported they are passed through. Either way solving must succeed.
        const result = await runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/sudokuComplete.lp", 0, [
            "--parallel-mode 2,compete",
        ]);

        expect(result).not.toBe(null);
        expect(result.Result).toEqual("SATISFIABLE");
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it("should report models to the progress reporter while solving", async () => {
        const progress = { report: jest.fn() };

        await runClingoWasmForFileWithProgress({ window: jest.fn() }, progress, "src/testFiles/sudokuComplete.lp", 0);

        const messages = progress.report.mock.calls.map((call) => call[0].message);
        expect(messages).toContain("Clingo finished successfully!");
    });
});

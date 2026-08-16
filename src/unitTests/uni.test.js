// @ts-nocheck
const fs = require("fs");
const { runClingoWasmForFileWithProgress } = require("../runClingoWasmForFileWithProgress.js");
const { MAX_PARTIAL_MODELS } = require("../formatWasmResult.js");

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
        // Cancelling is the user's choice: the status bar going idle says so, and
        // it must not be reported as an error or announced with a notification
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
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

    it("should return a cut short search instead of calling it an error", async () => {
        const vscode = { window: { showErrorMessage: jest.fn(), showInformationMessage: jest.fn(), showWarningMessage: jest.fn() } };

        // A solve limit of zero conflicts stops clingo before it finds anything,
        // which is reported as UNKNOWN with no Error field. That used to surface
        // as "Clingo WASM Error: Unknown error" and threw the result away.
        const result = await runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/sudokuComplete.lp", 0, [
            "--solve-limit=0,0",
        ]);

        expect(result).not.toBe(null);
        expect(result.Result).toEqual("UNKNOWN");
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

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

    it("should solve even when a config asks for options wasm cannot honour", async () => {
        const vscode = { window: { showErrorMessage: jest.fn(), showInformationMessage: jest.fn(), showWarningMessage: jest.fn() } };

        // --pre makes clingo emit aspif text rather than JSON, which used to
        // fail the whole run with "Clingo WASM Error: [object Object]"
        const result = await runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/sudokuComplete.lp", 0, [
            "--pre",
            "--verbose=3",
        ]);

        expect(result).not.toBe(null);
        expect(result.Result).toEqual("SATISFIABLE");
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        // Dropped silently would leave the user wondering why nothing changed
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it("should stop a run at the time limit that clingo itself ignores", async () => {
        const vscode = { window: { showErrorMessage: jest.fn(), showInformationMessage: jest.fn(), showWarningMessage: jest.fn() } };

        // The wasm build accepts --time-limit and then ignores it, because the
        // timer it relies on can never fire during a synchronous solve. This
        // file would otherwise run until it was cancelled by hand.
        const started = Date.now();
        const result = await runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/longRunning.lp", 0, [
            "--time-limit=1",
        ]);
        const elapsed = (Date.now() - started) / 1000;

        expect(result).not.toBe(null);
        expect(result.Result).toEqual("UNKNOWN");
        expect(result.StoppedBy).toMatchObject({ reason: "time-limit", seconds: 1 });
        expect(elapsed).toBeLessThan(15);
        // Stopping at the limit the user asked for is an outcome, not a failure
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    }, 30000);

    it("should keep the answers a run had already found when the time limit stops it", async () => {
        const vscode = { window: { showErrorMessage: jest.fn(), showInformationMessage: jest.fn(), showWarningMessage: jest.fn() } };

        // Terminating the worker throws clingo's own reply away, so the models
        // have to be collected as they stream in or the run reports nothing
        const result = await runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/manyModels.lp", 0, [
            "--time-limit=1",
        ]);

        const witnesses = result.Call[0].Witnesses;
        expect(result.Models.Number).toBeGreaterThan(0);
        expect(witnesses.length).toBeGreaterThan(0);
        expect(witnesses[0].Value).toBeDefined();
        // Kept models are capped so a fast program cannot fill memory while the
        // limit counts down, but the count still reports everything found
        expect(witnesses.length).toBeLessThanOrEqual(MAX_PARTIAL_MODELS);
        expect(result.Models.Number).toBeGreaterThanOrEqual(witnesses.length);
    }, 30000);

    it("should leave a run that finishes inside its time limit alone", async () => {
        const vscode = { window: { showErrorMessage: jest.fn(), showInformationMessage: jest.fn(), showWarningMessage: jest.fn() } };

        const result = await runClingoWasmForFileWithProgress(vscode, { report: jest.fn() }, "src/testFiles/sudokuComplete.lp", 0, [
            "--time-limit=30",
        ]);

        // Clingo's own answer, not a synthesised one: the option is removed
        // before the run, so it can never be rejected as unknown either
        expect(result.Result).toEqual("SATISFIABLE");
        expect(result.Models.Number).toEqual(8);
        expect(result.StoppedBy).toBeUndefined();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    }, 30000);

    it("should report models to the progress reporter while solving", async () => {
        const progress = { report: jest.fn() };

        await runClingoWasmForFileWithProgress({ window: jest.fn() }, progress, "src/testFiles/sudokuComplete.lp", 0);

        const messages = progress.report.mock.calls.map((call) => call[0].message);
        expect(messages).toContain("Clingo finished successfully!");
    });
});

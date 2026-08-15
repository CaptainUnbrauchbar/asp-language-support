const fs = require("fs");
const { loadClingo, abortClingo, isAbortResult } = require("./clingoWasm.js");

/** How often at most to push a model count into the progress UI, in ms. */
const PROGRESS_THROTTLE_MS = 100;

/** Clingo options that only exist in the multi threaded wasm build. */
const THREAD_ARGS = /^(-t\b|--parallel-mode\b)/;

/**
 * @param {*} vscode Reference to vscode module import (workaround so we can test it)
 * @param {*} progress Reference to the progress object from vscode
 * @param {String} filePath Path to the ASP file to be read
 * @param {Number} models Number of models
 * @param {String[]} options Array of options to be passed to Clingo
 * @param {*} token Optional vscode CancellationToken used to abort the run
 * @returns {Promise<import("clingo-wasm").ClingoResult | null>} Clingo result, or null if the run failed or was cancelled
 */
async function runClingoWasmForFileWithProgress(vscode, progress, filePath, models = undefined, options = undefined, token = undefined) {
    progress.report({
        message: "Starting Clingo...",
    });

    let fileContent;

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`File not found: ${filePath}`);
        return null;
    }

    fileContent = await fs.promises.readFile(filePath, "utf8");

    const additionalFiles = options?.filter((arg) => arg && !arg.startsWith("-")).map((filePath) => filePath.replace(/"/g, ""));

    if (additionalFiles?.length) {
        for (const additionalFilePath of additionalFiles) {
            if (!fs.existsSync(additionalFilePath)) {
                vscode.window.showErrorMessage(`File not found: ${additionalFilePath}`);
                return null;
            }
            const additionalContent = await fs.promises.readFile(additionalFilePath, "utf8");
            if (additionalContent.trim()) {
                fileContent += `\n${additionalContent}`;
            }
        }
    }

    // Filter options for Clingo
    let clingoOptions = options?.filter((arg) => arg.startsWith("-"));

    progress.report({
        message: "Running Clingo WASM...",
    });

    const clingo = await loadClingo();

    // clingo-wasm only loads the multi threaded build where the environment
    // supports it. On the single threaded one the threading options do not
    // merely have no effect, they abort the run with "unknown option", so drop
    // them rather than let a config option break solving outright.
    if (clingoOptions?.length && !clingo.supportsThreads()) {
        const threadArgs = clingoOptions.filter((arg) => THREAD_ARGS.test(arg));
        if (threadArgs.length) {
            clingoOptions = clingoOptions.filter((arg) => !THREAD_ARGS.test(arg));
            vscode.window.showWarningMessage(
                `Parallel solving is not available in this VSCode version, ignoring: ${threadArgs.join(", ")}`
            );
        }
    }

    // Reading the files above is async, so the run can already be cancelled by
    // the time we get here. Starting it anyway would ignore the cancellation.
    if (token?.isCancellationRequested) {
        vscode.window.showInformationMessage("Clingo run cancelled.");
        return null;
    }

    // Cancelling terminates the worker clingo solves in, which resolves the
    // pending run below with an abort result instead of leaving it hanging.
    let cancelled = false;
    const cancelListener = token?.onCancellationRequested(() => {
        cancelled = true;
        progress.report({ message: "Stopping Clingo..." });
        abortClingo();
    });

    // Report models as the solver finds them, so long runs show real progress
    // instead of a spinner that never moves. Throttled so that programs with
    // very many models do not flood the UI.
    let modelsFound = 0;
    let lastReport = 0;
    const onModel = () => {
        modelsFound++;
        const now = Date.now();
        if (now - lastReport < PROGRESS_THROTTLE_MS) {
            return;
        }
        lastReport = now;
        progress.report({ message: `Solving... ${modelsFound} model(s) found` });
    };

    /** @type {import("clingo-wasm").ClingoResult | import("clingo-wasm").ClingoError} */
    let wasmResult;
    try {
        wasmResult = await clingo.run(fileContent, models, clingoOptions, onModel);
    } finally {
        cancelListener?.dispose();
    }

    // A cancelled run is the user's decision, not a failure to report as one
    if (cancelled || isAbortResult(wasmResult)) {
        vscode.window.showInformationMessage("Clingo run cancelled.");
        return null;
    }

    progress.report({
        message: "Clingo finished successfully!",
    });

    // Validate the result
    if (["ERROR", "UNKNOWN"].includes(wasmResult.Result)) {
        if ("Error" in wasmResult) {
            vscode.window.showErrorMessage(`Clingo WASM Error: ${wasmResult.Error}`);
        } else {
            vscode.window.showErrorMessage(`Clingo WASM Error: Unknown error`);
        }
        return null;
    } else {
        return wasmResult;
    }
}

module.exports = { runClingoWasmForFileWithProgress };

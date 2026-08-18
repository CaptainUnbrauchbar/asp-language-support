const fs = require("fs");
const { loadClingo, abortClingo, isAbortResult, noteThreadSupport, isThreadOptionRejected } = require("./clingoWasm.js");
const { resolveIncludes, mapMessagePositions } = require("./resolveIncludes.js");
const { partialResultFromModels, MAX_PARTIAL_MODELS } = require("./formatWasmResult.js");
const { formatClingoCommand } = require("./clingoCommand.js");

/** How often at most to push a model count into the progress UI, in ms. */
const PROGRESS_THROTTLE_MS = 100;
const THREAD_ARGS = /^(-t\b|--parallel-mode\b)/;
const TIME_LIMIT_ARG = /^--time-limit[=\s]+(\d+)/;
const UNSUPPORTED_ARGS = [
    { pattern: /^--pre\b/, reason: "the preprocessor emits aspif text, which the bundled solver cannot return" },
    { pattern: /^(--verbose\b|-V\b)/, reason: "the bundled solver never carries clingo's verbose output" },
];

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

    if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`File not found: ${filePath}`);
        return null;
    }

    const resolved = resolveIncludes(filePath, (path) => fs.readFileSync(path, "utf8"));
    if (resolved.errors.length) {
        vscode.window.showErrorMessage(`Included file not found: ${resolved.errors.join(", ")}`);
        return null;
    }

    let fileContent = resolved.program;
    let lineMap = resolved.lineMap;

    // Every file that ends up in the program, entry point first. 
    // The visual command line is built from this rather than from what the run was handed
    const programFiles = [...resolved.files];

    const additionalFiles = options?.filter((arg) => arg && !arg.startsWith("-")).map((filePath) => filePath.replace(/"/g, ""));

    if (additionalFiles?.length) {
        for (const additionalFilePath of additionalFiles) {
            if (!fs.existsSync(additionalFilePath)) {
                vscode.window.showErrorMessage(`File not found: ${additionalFilePath}`);
                return null;
            }
            // Additional files can pull in their own includes as well
            const extra = resolveIncludes(additionalFilePath, (path) => fs.readFileSync(path, "utf8"));
            if (extra.errors.length) {
                vscode.window.showErrorMessage(`Included file not found: ${extra.errors.join(", ")}`);
                return null;
            }
            if (extra.program.trim()) {
                fileContent += `\n${extra.program}`;
                lineMap = [...lineMap, { file: additionalFilePath, line: 0 }, ...extra.lineMap];
                programFiles.push(...extra.files);
            }
        }
    }

    let clingoOptions = options?.filter((arg) => arg.startsWith("-"));

    progress.report({
        message: "Running Clingo WASM...",
    });

    const clingo = await loadClingo();
    const threadArgs = clingoOptions?.filter((arg) => THREAD_ARGS.test(arg)) ?? [];

    if (clingoOptions?.length) {
        const rejected = UNSUPPORTED_ARGS.filter(({ pattern }) => clingoOptions.some((arg) => pattern.test(arg)));
        if (rejected.length) {
            clingoOptions = clingoOptions.filter((arg) => !rejected.some(({ pattern }) => pattern.test(arg)));
            vscode.window.showWarningMessage(
                `Ignoring options the bundled solver cannot honour: ${rejected.map(({ reason }) => reason).join("; ")}. ` +
                    "Enable the usePathClingo setting to run them with your own clingo."
            );
        }
    }

    // clingo's --time-limit is built on an OS timer that has to fire while the
    // search runs. Under wasm the whole solve is one synchronous call that never
    // yields to the event loop, so that timer never fires and the option is
    // accepted and then silently ignored. Enforce it here instead, using the
    // same worker termination the stop button uses.
    const timeLimitArg = clingoOptions?.find((arg) => TIME_LIMIT_ARG.test(arg));
    const timeLimitSeconds = timeLimitArg ? Number(timeLimitArg.match(TIME_LIMIT_ARG)[1]) : 0;
    if (timeLimitArg) {
        clingoOptions = clingoOptions.filter((arg) => arg !== timeLimitArg);
    }

    if (token?.isCancellationRequested) {
        vscode.window.showInformationMessage("Clingo run cancelled.");
        return null;
    }

    let cancelled = false;
    const cancelListener = token?.onCancellationRequested(() => {
        cancelled = true;
        progress.report({ message: "Stopping Clingo..." });
        abortClingo();
    });

    let modelsFound = 0;
    let lastReport = 0;

    /** @type {String[][]} */
    const streamedModels = [];
    const onModel = (witness) => {
        modelsFound++;
        if (streamedModels.length < MAX_PARTIAL_MODELS && witness?.Value) {
            streamedModels.push(witness.Value);
        }
        const now = Date.now();
        if (now - lastReport < PROGRESS_THROTTLE_MS) {
            return;
        }
        lastReport = now;
        progress.report({ message: `Solving... ${modelsFound} model(s) found` });
    };

    let timedOut = false;
    const timeLimitTimer =
        timeLimitSeconds > 0
            ? setTimeout(() => {
                  timedOut = true;
                  progress.report({ message: `Time limit of ${timeLimitSeconds}s reached, stopping Clingo...` });
                  abortClingo();
              }, timeLimitSeconds * 1000)
            : undefined;

    const startedAt = Date.now();
    /** @type {import("clingo-wasm").ClingoResult | import("clingo-wasm").ClingoError} */
    let wasmResult;
    try {
        wasmResult = await clingo.run(fileContent, models, clingoOptions, onModel);
        if (threadArgs.length && isThreadOptionRejected(wasmResult)) {
            noteThreadSupport(false);
            vscode.window.showWarningMessage(
                `Parallel solving is not available with the bundled solver here, ignoring: ${threadArgs.join(", ")}. ` +
                    "Enable the usePathClingo setting to solve in parallel with your own clingo."
            );
            clingoOptions = clingoOptions.filter((arg) => !THREAD_ARGS.test(arg));
            modelsFound = 0;
            streamedModels.length = 0;
            wasmResult = await clingo.run(fileContent, models, clingoOptions, onModel);
        } else if (threadArgs.length && wasmResult?.Result !== "ERROR") {
            noteThreadSupport(true);
        }
    } finally {
        cancelListener?.dispose();
        clearTimeout(timeLimitTimer);
    }

    const command = formatClingoCommand({
        // A file reached through several routes is still one file on the line
        programs: [...new Set(programFiles)],
        models,
        options: clingoOptions ?? [],
        backend: "wasm",
    });

    // A run that was stopped, by the user or by their time limit, is an outcome
    // rather than a failure
    const stoppedByUser = cancelled || (!timedOut && isAbortResult(wasmResult));
    if (stoppedByUser || timedOut) {
        const stopped = stoppedByUser ? { reason: "cancelled" } : { reason: "time-limit", seconds: timeLimitSeconds };
        return partialResultFromModels(streamedModels, modelsFound, (Date.now() - startedAt) / 1000, stopped, command);
    }

    progress.report({
        message: "Clingo finished successfully!",
    });

    // Only ERROR means the run failed. UNKNOWN is a normal outcome
    if (wasmResult.Result === "ERROR") {
        const detail = "Error" in wasmResult ? mapMessagePositions(wasmResult.Error, lineMap) : "the solver reported no details";
        vscode.window.showErrorMessage(`Clingo WASM Error: ${detail}`);
        return null;
    }

    if (wasmResult.Warnings?.length) {
        wasmResult.Warnings = wasmResult.Warnings.map((warning) => mapMessagePositions(warning, lineMap));
    }
    wasmResult.Command = command;
    return wasmResult;
}

module.exports = { runClingoWasmForFileWithProgress };

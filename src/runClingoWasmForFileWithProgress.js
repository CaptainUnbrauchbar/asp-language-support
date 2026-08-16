const fs = require("fs");
const { loadClingo, abortClingo, isAbortResult } = require("./clingoWasm.js");
const { resolveIncludes, mapMessagePositions } = require("./resolveIncludes.js");
const { partialResultFromModels, MAX_PARTIAL_MODELS } = require("./formatWasmResult.js");

/** How often at most to push a model count into the progress UI, in ms. */
const PROGRESS_THROTTLE_MS = 100;

/** Clingo options that only exist in the multi threaded wasm build. */
const THREAD_ARGS = /^(-t\b|--parallel-mode\b)/;

/**
 * Clingo's own time limit, which the wasm build accepts and then ignores.
 * Matches both the "--time-limit=30" the extension produces and the spaced form.
 */
const TIME_LIMIT_ARG = /^--time-limit[=\s]+(\d+)/;

/**
 * Options the bundled solver cannot honour, and why.
 *
 * The settings pane keeps these out of a run in the first place, but a
 * config.json can still ask for them, and one of them fails the whole run
 * rather than being ignored. Dropping them with a word about it beats
 * reporting an error the user cannot act on.
 */
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

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`File not found: ${filePath}`);
        return null;
    }

    // Everything the program is made of: the file itself with its #include
    // directives inlined, followed by any files the config adds
    const resolved = resolveIncludes(filePath, (path) => fs.readFileSync(path, "utf8"));
    if (resolved.errors.length) {
        vscode.window.showErrorMessage(`Included file not found: ${resolved.errors.join(", ")}`);
        return null;
    }

    let fileContent = resolved.program;
    let lineMap = resolved.lineMap;

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
    // yields to the event loop, so that timer never gets to fire and the option
    // is accepted and then silently ignored. Enforce it here instead, using the
    // same worker termination the stop button uses. Reading the limit off the
    // arguments covers the settings pane and config.json in one place.
    const timeLimitArg = clingoOptions?.find((arg) => TIME_LIMIT_ARG.test(arg));
    const timeLimitSeconds = timeLimitArg ? Number(timeLimitArg.match(TIME_LIMIT_ARG)[1]) : 0;
    if (timeLimitArg) {
        clingoOptions = clingoOptions.filter((arg) => arg !== timeLimitArg);
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
    // Terminating the worker throws away clingo's own reply, so the models are
    // kept here as they stream in. Without them a run stopped by the time limit
    // would report nothing at all, even though the answers had already arrived.
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

    // Fires only where clingo's own limit could not: the worker is terminated,
    // which resolves the pending run below with an abort result
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
    } finally {
        cancelListener?.dispose();
        clearTimeout(timeLimitTimer);
    }

    // A cancelled run is the user's decision. The status bar going back to idle
    // says so, and a notification would only be in the way. Checked before the
    // time limit so that stopping a run yourself is never reported as a timeout.
    if (cancelled) {
        return null;
    }

    // The run was stopped by the limit the user asked for, which is an outcome
    // rather than a failure, so hand back what the search had already found
    if (timedOut) {
        return partialResultFromModels(streamedModels, modelsFound, (Date.now() - startedAt) / 1000, timeLimitSeconds);
    }

    if (isAbortResult(wasmResult)) {
        return null;
    }

    progress.report({
        message: "Clingo finished successfully!",
    });

    // Only ERROR means the run failed. UNKNOWN is a normal outcome: the search
    // was cut short, by a solve or time limit for instance, so whatever models
    // were found are still worth showing and the panel says the run is partial.
    if (wasmResult.Result === "ERROR") {
        // Clingo counts lines in the single program it was handed, so point
        // the position back at the file the line really came from
        const detail = "Error" in wasmResult ? mapMessagePositions(wasmResult.Error, lineMap) : "the solver reported no details";
        vscode.window.showErrorMessage(`Clingo WASM Error: ${detail}`);
        return null;
    }

    if (wasmResult.Warnings?.length) {
        wasmResult.Warnings = wasmResult.Warnings.map((warning) => mapMessagePositions(warning, lineMap));
    }
    return wasmResult;
}

module.exports = { runClingoWasmForFileWithProgress };

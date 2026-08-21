/**
 * Runs your own clingo from PATH.
 *
 * The process is spawned directly rather than through a shell: with a shell in
 * between, killing the child kills the shell and leaves clingo running with
 * nothing holding on to it, which is how stopped runs used to survive the stop
 * button and even the window closing. Spawning directly also passes the
 * arguments verbatim, so a file path with spaces needs no quoting.
 */
const { spawn } = require("child_process");
const { createWitnessScan } = require("./clingoWitnesses.js");
const { MAX_PARTIAL_MODELS } = require("./formatWasmResult.js");

/** How often at most to push a model count into the progress UI, in ms. */
const PROGRESS_THROTTLE_MS = 100;

/**
 * @type {{child: import("child_process").ChildProcess, stop: () => Boolean} | undefined}
 */
let current;

/**
 * How long a stopped process is given to exit on its own before it is killed
 */
const KILL_GRACE_MS = 2000;

/**
 * @returns {Boolean} Whether there was a run to stop
 */
function stopClingoProcess() {
    return current ? current.stop() : false;
}

/** Whether a clingo process from PATH is running right now. */
function isClingoProcessRunning() {
    return current !== undefined;
}

/**
 * @param {*} vscode Reference to vscode module import (workaround so we can test it)
 * @param {*} progress Reference to the progress object from vscode
 * @param {String} clingoPath Path of the clingo executable
 * @param {String} filePath Path to the ASP file to be read
 * @param {Number} models Number of models
 * @param {String[]} options Array of options to be passed to Clingo
 * @param {*} token Optional vscode CancellationToken used to stop the run
 * @returns {Promise<{code: Number, signal: String | null, output: String, errorOutput: String,
 *          stopped: Boolean, seconds: Number, witnesses: String[][], totalWitnesses: Number}>}
 *          Always resolves: a run that failed to start or was stopped is an
 *          outcome the caller reports, and a promise that never settled would
 *          leave the extension believing a solve is still in flight.
 */
async function runClingoPathForFileWithProgress(
    vscode,
    progress,
    clingoPath,
    filePath,
    models = undefined,
    options = undefined,
    token = undefined
) {
    return new Promise((resolve) => {
        progress.report({ increment: 0, message: "Starting Clingo..." });

        // clingo takes the model count as a bare positional argument
        const args = [filePath, String(models ?? 0), ...(options ?? [])];
        // A stopped run never gets to report its own timing
        const startedAt = Date.now();
        // shell: false is the default and is spelled out because it is what makes
        // the arguments safe: with a shell in between, a file name holding "&&" or
        // "$(...)" would be read as a command rather than passed along. clingoPath
        // itself is what which.sync found on PATH, never a value from a config file.
        // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
        const child = spawn(clingoPath, args, { shell: false });

        let output = "";
        let errorOutput = "";
        let stopped = false;
        let killTimer;
        let cancelListener;

        const stop = () => {
            if (stopped) {
                return true;
            }
            stopped = true;
            progress.report({ message: "Stopping Clingo..." });
            child.kill();
            // Followed up with a signal it cannot decline, in case it does
            killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
            return true;
        };

        current = { child, stop };

        /** Settles the run once, whichever way it ended. */
        const finish = (result) => {
            clearTimeout(killTimer);
            cancelListener?.dispose();
            if (current?.child === child) {
                current = undefined;
            }
            resolve({
                ...result,
                seconds: (Date.now() - startedAt) / 1000,
                witnesses: scan.witnesses,
                totalWitnesses: scan.total,
            });
        };

        cancelListener = token?.onCancellationRequested(() => stop());

        // clingo writes each answer as it finds it, so reading stdout as it
        // arrives reports progress while the search is still going
        let lastReport = 0;
        const scan = createWitnessScan({
            limit: MAX_PARTIAL_MODELS,
            onWitness: (count) => {
                const now = Date.now();
                if (now - lastReport < PROGRESS_THROTTLE_MS) {
                    return;
                }
                lastReport = now;
                progress.report({ message: `Solving... ${count} model(s) found` });
            },
        });

        child.stdout.on("data", (data) => {
            const chunk = data.toString();
            output += chunk;
            scan.feed(chunk);
        });
        child.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        // Fires when the executable cannot be started at all
        child.on("error", (error) => {
            finish({ code: -1, output, errorOutput: errorOutput || String(error?.message ?? error), stopped });
        });

        child.on("close", (code, signal) => {
            progress.report({ increment: 100, message: stopped ? "Clingo stopped." : "Clingo finished." });
            finish({ code, signal, output, errorOutput, stopped });
        });
    });
}

module.exports = { runClingoPathForFileWithProgress, stopClingoProcess, isClingoProcessRunning };

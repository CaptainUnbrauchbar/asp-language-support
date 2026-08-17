const { spawn } = require("child_process");
const { createWitnessScan } = require("./clingoWitnesses.js");
const { MAX_PARTIAL_MODELS } = require("./formatWasmResult.js");

/** How often at most to push a model count into the progress UI, in ms. */
const PROGRESS_THROTTLE_MS = 100;

/**
 * Runs your own clingo from PATH.
 *
 * The process is spawned directly rather than through a shell. Going through one
 * puts cmd.exe (or sh) between the extension and clingo: killing the child then
 * kills the shell and leaves clingo running with nothing holding on to it, which
 * is how stopped runs were surviving the stop button, the panel and even the
 * window closing, burning a core in the background with no way to find them
 * short of the task manager. Spawned directly, the process this module holds is
 * clingo itself, so stopping it stops the search.
 *
 * Not using a shell also means the arguments are passed verbatim instead of
 * being concatenated into a command line and parsed again, so a file path with
 * spaces in it needs no quoting and cannot be split in half.
 */

/**
 * The run in flight, so that the stop command has something to stop. Only one
 * run happens at a time: starting a second is refused while the first is going.
 * @type {{child: import("child_process").ChildProcess, stop: () => Boolean} | undefined}
 */
let current;

/**
 * How long a stopped process is given to exit on its own before it is killed
 * outright. SIGTERM is a request, and a solver deep in a search can be slow to
 * notice it or decline entirely.
 */
const KILL_GRACE_MS = 2000;

/**
 * Stops the running clingo, if there is one.
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
 *          Always resolves. A run that failed to start or was stopped is an
 *          outcome the caller reports, and a promise that never settled would
 *          leave the extension believing a solve is still in flight and refuse
 *          every later one.
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
        // A stopped run never gets to report its own timing, so the panel takes
        // it from here instead of showing nothing
        const startedAt = Date.now();
        const child = spawn(clingoPath, args);

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
            // The answers are handed over already read, so a stopped run does
            // not have to be scanned a second time to find what it managed
            resolve({
                ...result,
                seconds: (Date.now() - startedAt) / 1000,
                witnesses: scan.witnesses,
                totalWitnesses: scan.total,
            });
        };

        // The Cancel button on the progress notification. The stop command, its
        // keybinding and the status bar go through stopClingoProcess instead,
        // which is the same stop by another door.
        cancelListener = token?.onCancellationRequested(() => stop());

        // clingo writes each answer as it finds it, so reading stdout as it
        // arrives says how the search is going while it is still going. Waiting
        // for the process to end would leave a long run showing a spinner and no
        // news, which is exactly when you want to know whether to keep waiting.
        let lastReport = 0;
        const scan = createWitnessScan({
            limit: MAX_PARTIAL_MODELS,
            onWitness: (count) => {
                const now = Date.now();
                // Reporting per answer floods the UI on a program that finds
                // thousands a second, and the count is unreadable at that rate
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

        // Fires when the executable cannot be started at all, which used to
        // leave the promise hanging forever
        child.on("error", (error) => {
            finish({ code: -1, output, errorOutput: errorOutput || String(error?.message ?? error), stopped });
        });

        // "close" rather than "exit": it fires once the output streams have
        // ended too, so nothing clingo printed on its way out is missed. The
        // signal is carried along because a process killed by one reports no
        // exit code at all, and a solver that crashed should say so rather than
        // being reported as having exited with code null.
        child.on("close", (code, signal) => {
            progress.report({ increment: 100, message: stopped ? "Clingo stopped." : "Clingo finished." });
            finish({ code, signal, output, errorOutput, stopped });
        });
    });
}

module.exports = { runClingoPathForFileWithProgress, stopClingoProcess, isClingoProcessRunning };

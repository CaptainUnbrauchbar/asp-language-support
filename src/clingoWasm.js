/**
 * Access to the clingo-wasm package.
 *
 * Since 0.6.0 clingo-wasm is ESM-only, so this CommonJS extension cannot
 * `require()` it and has to go through a dynamic `import()` instead. The import
 * is memoized and lazy: the ~2.6 MB wasm binary is only loaded the first time
 * the user actually solves something, which keeps activation cheap.
 */

/** @typedef {import("clingo-wasm").ClingoResult} ClingoResult */
/** @typedef {import("clingo-wasm").ClingoError} ClingoError */

/** @type {Promise<typeof import("clingo-wasm")> | undefined} */
let clingoPromise;

/**
 * Loads clingo-wasm, reusing the module (and its worker) across calls.
 * @returns {Promise<typeof import("clingo-wasm")>}
 */
function loadClingo() {
    if (!clingoPromise) {
        clingoPromise = import("clingo-wasm");
    }
    return clingoPromise;
}

/**
 * Aborts the solve that is currently running.
 *
 * clingo-wasm runs the solver in a worker, and `restart()` terminates that
 * worker: the pending run resolves with an error result instead of spinning
 * forever, and the next run transparently gets a fresh worker. Before 0.6.0
 * there was no way to interrupt a run, so an endless loop meant restarting
 * VSCode.
 *
 * Does nothing if clingo was never loaded, so calling this while idle is safe.
 */
async function abortClingo() {
    if (!clingoPromise) {
        return;
    }
    const clingo = await loadClingo();
    await clingo.restart();
}

/** The error clingo-wasm reports for a run that `restart()` cut short. */
const ABORT_ERROR = "Aborted by restart().";

/**
 * Whether a result is the error that an abort produces rather than a genuine
 * solver failure. Used to tell the user their run was cancelled instead of
 * showing them an error they did not cause.
 * @param {ClingoResult | ClingoError | null} result
 * @returns {Boolean}
 */
function isAbortResult(result) {
    return result?.Result === "ERROR" && result?.Error === ABORT_ERROR;
}

module.exports = { loadClingo, abortClingo, isAbortResult };

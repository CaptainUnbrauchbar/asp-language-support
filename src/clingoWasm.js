/**
 * Access to the clingo-wasm package.
 *
 * clingo-wasm is ESM-only since 0.6.0, so this CommonJS extension reaches it
 * through a dynamic `import()`. Memoized and lazy: the ~2.6 MB wasm binary is
 * only loaded the first time something is actually solved.
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
 * Whether parallel solving works, as observed rather than predicted.
 */
let threadsWork = true;

/** @returns {Boolean} */
function threadsAvailable() {
    return threadsWork;
}

/**
 * Records what a run carrying the parallel options actually did.
 * @param {Boolean} available
 */
function noteThreadSupport(available) {
    threadsWork = available;
}

/** How clingo refuses a threading option when built without thread support. */
const UNKNOWN_THREAD_OPTION = /unknown option: '(t|parallel-mode)'/;

/**
 * Whether a result is clingo rejecting a threading option, as opposed to any
 * other failure.
 * @param {ClingoResult | ClingoError | null} result
 * @returns {Boolean}
 */
function isThreadOptionRejected(result) {
    return result?.Result === "ERROR" && UNKNOWN_THREAD_OPTION.test(String(result?.Error ?? ""));
}

/**
 * Aborts the solve that is currently running.
 *
 * `restart()` terminates the worker clingo solves in: the pending run resolves
 * with an error result instead of spinning forever, and the next run gets a
 * fresh worker. Does nothing if clingo was never loaded, so calling this while
 * idle is safe.
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
 * Whether a result is the error an abort produces rather than a genuine solver
 * failure, so a cancelled run is not reported as one the user caused.
 * @param {ClingoResult | ClingoError | null} result
 * @returns {Boolean}
 */
function isAbortResult(result) {
    return result?.Result === "ERROR" && result?.Error === ABORT_ERROR;
}

module.exports = { loadClingo, abortClingo, isAbortResult, threadsAvailable, noteThreadSupport, isThreadOptionRejected };

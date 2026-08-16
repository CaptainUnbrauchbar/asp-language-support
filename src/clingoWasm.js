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
 * Whether parallel solving works, as observed rather than predicted.
 *
 * clingo-wasm exports supportsThreads(), but it answers for whichever context
 * calls it, and the extension host is not the context that matters. VSCode's
 * host has no `navigator` global, while the worker thread clingo actually runs
 * in does, so asking on the host reports false and would switch off a feature
 * that works perfectly well. Rather than guess, the options are sent and
 * clingo's own answer is remembered: where the threaded build did not load, it
 * refuses them as unknown options while parsing, before any solving starts.
 *
 * Starts out assuming they work, which is the case in VSCode, so nothing is
 * disabled until a run has actually shown otherwise.
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

module.exports = { loadClingo, abortClingo, isAbortResult, threadsAvailable, noteThreadSupport, isThreadOptionRejected };

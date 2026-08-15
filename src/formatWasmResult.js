/**
 * Turns a raw clingo-wasm result into the payload the output panel renders.
 * Kept out of extension.js so it can be tested with Jest.
 */

/**
 * How many answer sets are handed to the webview. Rendering one element per
 * answer is fine for a handful but locks up the panel for a program with
 * millions of models, so the rest stays in the extension, where "copy all"
 * can still reach it.
 */
const MAX_RENDERED_ANSWERS = 500;

/**
 * Collects the answer sets of a run as a list of atom lists.
 * Calls that produced no model carry no "Witnesses" at all, which is the normal
 * shape for an UNSATISFIABLE run and used to yield a phantom empty answer.
 * @param {any} result
 * @returns {String[][]} One entry per answer set, each a list of atoms
 */
function extractAnswers(result) {
    return result?.Call?.flatMap((call) => call.Witnesses?.map((witness) => witness.Value) ?? []) ?? [];
}

/**
 * Formats the result into the shape the output interface expects.
 * @param {any} result
 * @returns {Object} The formatted result readable by the output interface.
 */
function formatWasmResult(result) {
    const answers = extractAnswers(result);
    return {
        solver: result?.Solver,
        models: `${result?.Models.Number} (${result?.Models.More})`,
        // Kept apart as well so the compact stat strip can render them itself.
        // "More" is "yes" when clingo stopped before enumerating everything.
        modelsNumber: result?.Models?.Number,
        modelsMore: result?.Models?.More === "yes",
        calls: result?.Calls,
        time: {
            total: result?.Time.Total,
            solve: result?.Time.Solve,
            model: result?.Time.Model,
        },
        answers: answers.slice(0, MAX_RENDERED_ANSWERS),
        totalAnswers: answers.length,
        truncated: answers.length > MAX_RENDERED_ANSWERS,
        // Clingo reports a single empty string when there is nothing to warn about
        warnings: (result?.Warnings ?? []).filter((warning) => warning.trim()),
        result: result?.Result,
    };
}

module.exports = { formatWasmResult, extractAnswers, MAX_RENDERED_ANSWERS };

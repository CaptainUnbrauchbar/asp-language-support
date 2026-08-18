/**
 * Turns a raw clingo-wasm result into the payload the output panel renders.
 * Kept out of extension.js so it can be tested with Jest.
 */

const MAX_RENDERED_ANSWERS = 500;
const MAX_PARTIAL_MODELS = 1000;

/**
 * Builds a clingo shaped result out of the models a stopped run had already streamed.
 * @param {String[][]} models The answer sets seen before the run was stopped
 * @param {Number} totalModels How many were found, which can exceed those kept
 * @param {Number} seconds How long the run lasted
 * @param {{reason: String, seconds?: Number}} stopped What stopped it
 * @param {String} [command] The clingo invocation
 * @returns {Object}
 */
function partialResultFromModels(models, totalModels, seconds, stopped, command = undefined) {
    return {
        Result: "UNKNOWN",
        Command: command,
        Call: [{ Witnesses: models.map((Value) => ({ Value })) }],
        Models: { Number: totalModels, More: "yes" },
        Calls: 1,
        Time: { Total: Number(seconds.toFixed(3)), Solve: Number(seconds.toFixed(3)), Model: 0 },
        Warnings: [],
        // Lets the panel name the limit that stopped the search
        StoppedBy: { ...stopped, kept: models.length },
    };
}

/**
 * The reply your own clingo prints, in the shape the bundled solver returns.
 * @param {String} output What clingo wrote to stdout
 * @param {String} [messages] What it wrote to stderr, which is where warnings go
 * @returns {Object | undefined} undefined when the output is not that JSON,
 *          which is what custom arguments asking for another format produce.
 *          The caller then shows the text as it came.
 */
function parseClingoOutput(output, messages = "") {
    const text = String(output ?? "").trim();
    const json = text.startsWith("{") ? text : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);

    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch {
        return undefined;
    }
    // Valid JSON that is not a clingo result is still not something to render
    if (!parsed || typeof parsed !== "object" || !parsed.Result) {
        return undefined;
    }

    delete parsed.Input;
    parsed.Warnings = String(messages ?? "")
        .split("\n\n")
        .filter((entry) => entry.trim());
    return parsed;
}

/**
 * Collects the answer sets of a run as a list of atom lists
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
        warnings: (result?.Warnings ?? []).filter((warning) => warning.trim()),
        result: result?.Result,
        stats: result?.Stats,
        stoppedBy: result?.StoppedBy,
        command: result?.Command,
    };
}

module.exports = {
    formatWasmResult,
    parseClingoOutput,
    extractAnswers,
    partialResultFromModels,
    MAX_RENDERED_ANSWERS,
    MAX_PARTIAL_MODELS,
};

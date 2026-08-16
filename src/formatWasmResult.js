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
 * How many streamed models to keep for a run that is stopped early. A program
 * that produces models faster than the user can read them should not be able to
 * fill memory while the time limit counts down.
 */
const MAX_PARTIAL_MODELS = 1000;

/**
 * Builds a clingo shaped result out of the models a stopped run had already
 * streamed.
 *
 * Stopping a run means terminating the worker, which discards clingo's own
 * reply along with it. The models had already arrived one by one though, so
 * they are reassembled here into the same shape the rest of the pipeline reads,
 * with the UNKNOWN result that clingo itself uses for a search cut short.
 *
 * @param {String[][]} models The answer sets seen before the run was stopped
 * @param {Number} totalModels How many were found, which can exceed those kept
 * @param {Number} seconds How long the run lasted
 * @param {{reason: String, seconds?: Number}} stopped What stopped it
 * @param {String} [command] The clingo invocation, which is worth showing for a
 *        run that was stopped just as much as for one that finished
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
        // Lets the panel say what stopped the search instead of listing the
        // possibilities
        StoppedBy: { ...stopped, kept: models.length },
    };
}

/**
 * The reply your own clingo prints, in the shape the bundled solver returns.
 *
 * They are the same clingo. clingo-wasm runs it with `--outf=2` and parses the
 * JSON it writes to stdout, which is exactly what the binary prints when asked
 * the same way, so reading that reply rather than dumping it into a textarea
 * gives a run from PATH the whole panel: answers, filtering, comparing,
 * statistics and all.
 *
 * @param {String} output What clingo wrote to stdout
 * @param {String} [messages] What it wrote to stderr, which is where warnings go
 * @returns {Object | undefined} undefined when the output is not that JSON,
 *          which is what custom arguments asking for another format produce.
 *          The caller then shows the text as it came, rather than complaining
 *          about a format the user chose on purpose.
 */
function parseClingoOutput(output, messages = "") {
    const text = String(output ?? "").trim();
    // Normally the JSON is all there is, but a banner in front of it should not
    // cost the reader the entire panel
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

    // The program echoed back at us, which the editor already has open
    delete parsed.Input;
    // Warnings travel on stderr rather than in the JSON, the same way the
    // bundled solver collects them
    parsed.Warnings = String(messages ?? "")
        .split("\n\n")
        .filter((entry) => entry.trim());
    return parsed;
}

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
        // Only present when the run asked for statistics. Passed through as
        // clingo reported it, since the panel renders whatever it is given
        // rather than a fixed set of figures.
        stats: result?.Stats,
        // Set when the extension stopped the run itself, so the panel can say
        // which limit did it
        stoppedBy: result?.StoppedBy,
        // What clingo was invoked with, so the options a run used can be read
        // back rather than reconstructed from the settings pane
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

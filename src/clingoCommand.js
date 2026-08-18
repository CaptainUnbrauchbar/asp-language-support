/**
 * Renders the clingo command line a run amounts to, so the panel can show what
 * clingo was actually asked. Shared by both runners and by the settings pane's
 * preview so all three word it the same way.
 */
const { basename } = require("path");

/** Only the file name: the line is read for its options, not to find the file. */
function programName(path) {
    const name = basename(String(path).replace(/^"|"$/g, ""));
    return /\s/.test(name) ? `"${name}"` : name;
}

/**
 * @param {Object} run
 * @param {String[]} [run.programs] The files that make up the program
 * @param {Number} [run.models] The model count, which clingo takes as a bare
 *        positional argument rather than as an option. 0 means all of them
 * @param {String[]} [run.options] The options as handed to clingo
 * @param {String} [run.backend] "wasm" or "path"
 * @returns {String}
 */
function formatClingoCommand({ programs = [], models = 0, options = [], backend = "wasm" } = {}) {
    const files = (programs ?? []).filter(Boolean).map(programName);
    const count = String(models ?? 0);
    const given = (options ?? []).filter(Boolean);

    const parts = backend === "path" ? ["clingo", ...files, count, ...given] : ["clingo", "--outf=2", ...given, ...files, count];
    return parts.join(" ");
}

module.exports = { formatClingoCommand };

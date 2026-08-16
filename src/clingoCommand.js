/**
 * The clingo command line a run amounts to.
 *
 * Solver options reach a run from three directions now: the fields in the
 * settings pane, the constants and extra files it resolves, and whatever was
 * typed into custom arguments. When a run does something unexpected the first
 * question is what clingo was actually asked, and the panel had nowhere to look
 * once the old config listing went away.
 *
 * Written here rather than in either runner so both solvers, and the pane's
 * preview of a run that has not happened yet, all say it the same way.
 */
const { basename } = require("path");

/**
 * A program as it appears on the line. Only the file name is shown: the full
 * path is usually far longer than the rest of the command put together, and the
 * line is read to see the options rather than to find the file.
 * @param {String} path
 * @returns {String}
 */
function programName(path) {
    const name = basename(String(path).replace(/^"|"$/g, ""));
    return /\s/.test(name) ? `"${name}"` : name;
}

/**
 * Renders the invocation of a run.
 *
 * The two solvers are genuinely invoked differently, so neither is described in
 * the other's terms. The bundled one is handed the program as text along with
 * `--outf=2 <options> <models>`, which is where its leading `--outf=2` comes
 * from; the binary is spawned with the file and the model count ahead of the
 * options. Options are emitted as they were given, since they are already in the
 * form clingo receives them.
 *
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

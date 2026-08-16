const { resolvePatterns } = require("./filePatterns.js");

/**
 * The solver options the panel's settings pane edits.
 *
 * These do the same job as a config.json but are kept per workspace and edited
 * in the panel, so the common case needs no file at all. A project that already
 * has a config.json is not stranded: "Import from config.json" reads it through
 * configToSettings below, which is the only thing that reads one now, and
 * "Export to config.json" writes one back out through settingsToConfig, which
 * is the only thing that writes one.
 */

/** Everything off or unlimited, which is what plain clingo does. */
const DEFAULT_SETTINGS = Object.freeze({
    models: 0,
    timeLimit: 0,
    solveLimitConflicts: 0,
    solveLimitRestarts: 0,
    parallelEnabled: false,
    // Two threads measured within noise of one on a hard instance, while four
    // cut the same search by roughly a third, so the default has to be worth
    // switching on for
    parallelThreads: 4,
    parallelMode: "compete",
    stats: 0,
    verbose: 0,
    preProcessor: false,
    constants: "",
    additionalFiles: "",
    customArgs: "",
});

/** The solvers a setting can apply to, for fields that do not restrict themselves. */
const ALL_BACKENDS = Object.freeze(["wasm", "path"]);

/**
 * The fields the panel renders, in order. The panel builds its rows from this,
 * so a new option only has to be described here and handled in settingsToArgs.
 *
 * A field may name the `backends` it works with. Not every clingo option
 * survives the trip through WebAssembly, and an option the solver quietly
 * ignores is worse than one that is not offered: the pane greys those rows out
 * and says why, and settingsToArgs leaves them out of the run.
 */
const SETTING_FIELDS = [
    {
        key: "models",
        label: "Model limit",
        description:
            "How many answers to compute at most, clingo's model count. 0 means all of them. " +
            '"Compute the first Answer Set" always returns one regardless of this setting.',
        type: "number",
        min: 0,
    },
    {
        key: "timeLimit",
        label: "Time limit",
        description: "Seconds before the search is stopped. 0 means no limit.",
        type: "number",
        min: 0,
    },
    {
        key: "solveLimitConflicts",
        label: "Conflict limit",
        description: "Stop after this many conflicts. 0 means no limit.",
        type: "number",
        min: 0,
    },
    {
        key: "solveLimitRestarts",
        label: "Restart limit",
        description: "Stop after this many restarts. 0 means no limit.",
        type: "number",
        min: 0,
    },
    {
        key: "parallelEnabled",
        label: "Parallel solving",
        description: "Search with several threads. Only pays off on programs that take seconds to solve, not milliseconds.",
        type: "boolean",
        requiresThreads: true,
    },
    {
        key: "parallelThreads",
        label: "Threads",
        description: "How many threads to search with. Two rarely makes a visible difference; four or more does.",
        type: "number",
        min: 1,
        dependsOn: "parallelEnabled",
        requiresThreads: true,
    },
    {
        key: "parallelMode",
        label: "Thread mode",
        description: "compete: every thread races to find one answer. split: they divide the search up, which suits enumerating many answers.",
        type: "select",
        options: ["compete", "split"],
        dependsOn: "parallelEnabled",
        requiresThreads: true,
    },
    {
        key: "constants",
        label: "Constants",
        description: "Values for #const, comma separated, e.g. n=3, k=2. Can be used insteard of a #const directive in the program itself.",
        type: "text",
        placeholder: "n=3, k=2",
    },
    {
        key: "additionalFiles",
        label: "Additional files",
        description: "Extra files to solve with, comma separated. Globs allowed. Prefer '#include \"{filename}\"' inside the program itself.",
        type: "text",
        placeholder: "lib.lp, instances/*.lp",
    },
    {
        key: "stats",
        label: "Statistics level",
        description: "How much solver statistics clingo reports. 0 is off.",
        type: "number",
        min: 0,
        max: 2,
    },
    {
        key: "verbose",
        label: "Verbosity",
        description: "How much detail clingo prints. 0 is off.",
        type: "number",
        min: 0,
        max: 3,
        backends: ["path"],
        unsupportedNote: "The bundled solver reports its results as JSON and never carries this output, so it only has an effect with your own clingo from PATH.",
    },
    {
        key: "preProcessor",
        label: "Preprocess only",
        description: "Run clingo's preprocessor instead of solving.",
        type: "boolean",
        backends: ["path"],
        unsupportedNote: "The preprocessor emits aspif text rather than the JSON the bundled solver returns, so it only works with your own clingo from PATH.",
    },
    {
        key: "customArgs",
        label: "Custom arguments",
        description:
            "Passed to clingo as written. The model count, --version and --help are ignored, since the extension sets them itself. " +
            "Asking your own clingo for another output format with --outf, --text or --pre works, and its output is then shown as clingo printed it.",
        type: "text",
        placeholder: "--opt-strategy=usc",
    },
];

/**
 * Fills in anything missing and coerces the types, so a stored object from an
 * older version, or a hand edited one, cannot break a run.
 * @param {Object} raw
 * @returns {Object}
 */
function normalizeSettings(raw) {
    const settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    for (const field of SETTING_FIELDS) {
        const value = settings[field.key];
        if (field.type === "number") {
            const asNumber = Number(value);
            settings[field.key] = Number.isFinite(asNumber) ? Math.max(field.min ?? 0, Math.trunc(asNumber)) : DEFAULT_SETTINGS[field.key];
        } else if (field.type === "boolean") {
            settings[field.key] = !!value;
        } else if (field.type === "select") {
            settings[field.key] = field.options.includes(value) ? value : DEFAULT_SETTINGS[field.key];
        } else {
            settings[field.key] = String(value ?? "");
        }
    }
    return settings;
}

/** Splits a comma or newline separated field into trimmed entries. */
function splitList(value) {
    return String(value ?? "")
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

/**
 * Whether a setting does anything on the given solver.
 * @param {String} key
 * @param {String} backend "wasm" or "path"
 * @returns {Boolean}
 */
function supportsField(key, backend) {
    const field = SETTING_FIELDS.find((entry) => entry.key === key);
    return (field?.backends ?? ALL_BACKENDS).includes(backend);
}

/**
 * Said once a run has shown that the bundled solver was built without threads.
 *
 * This is never assumed from the VSCode version. Parallel solving does work
 * with the bundled solver in VSCode, so the note only appears where clingo has
 * actually refused the options.
 */
const NO_THREADS_NOTE =
    "The bundled solver here was built without thread support and refused clingo's parallel options. " +
    "Use your own clingo from PATH if you need parallel solving.";

/**
 * The fields with a reason attached to each one the current setup cannot
 * honour, so the panel only has to render what it is given.
 *
 * Doing it here rather than in the panel keeps one description of what works
 * where, and makes it testable without a webview.
 *
 * @param {String} backend "wasm" or "path"
 * @param {Boolean} threads Whether the multithreaded solver is available
 * @returns {Object[]}
 */
function describeFields(backend, threads) {
    return SETTING_FIELDS.map((field) => {
        let unavailable;
        if (field.backends && !field.backends.includes(backend)) {
            unavailable = field.unsupportedNote;
        } else if (field.requiresThreads && backend === "wasm" && !threads) {
            unavailable = NO_THREADS_NOTE;
        }
        return unavailable ? { ...field, unavailable } : field;
    });
}

/**
 * Turns the settings into clingo arguments: options start with a dash, file
 * paths are quoted. The runner tells the two apart by that leading dash.
 *
 * Options the chosen solver cannot honour are left out entirely rather than
 * passed on to be ignored, so what the panel shows is what clingo was asked for.
 *
 * @param {Object} raw The stored settings
 * @param {String} baseDirectory Where additionalFiles are resolved from
 * @param {(value: String) => String[]} filterCustomArgs Drops arguments the extension controls
 * @param {String} backend Which solver the arguments are for, "wasm" or "path"
 * @returns {{args: String[], unmatched: String[]}}
 */
function settingsToArgs(raw, baseDirectory, filterCustomArgs = () => [], backend = "wasm") {
    const settings = normalizeSettings(raw);
    const emit = (key) => supportsField(key, backend);
    /** @type {String[]} */
    const args = [];

    // "models" is deliberately absent: clingo takes the model count as a bare
    // positional argument, not as an option, and both solvers are handed it
    // separately. Emitting --models here would give clingo two of them.

    // The bundled solver accepts --time-limit and then ignores it, so the run is
    // stopped from the extension instead. The option still travels with the run,
    // which is where that timer reads it from.
    if (settings.timeLimit > 0) {
        args.push(`--time-limit=${settings.timeLimit}`);
    }
    // 0 means no limit here; clingo would read it as "stop before the first
    // conflict", which ends the search immediately
    if (settings.solveLimitConflicts > 0 || settings.solveLimitRestarts > 0) {
        const conflicts = settings.solveLimitConflicts > 0 ? settings.solveLimitConflicts : "umax";
        const restarts = settings.solveLimitRestarts > 0 ? settings.solveLimitRestarts : "umax";
        args.push(`--solve-limit=${conflicts},${restarts}`);
    }
    if (settings.parallelEnabled) {
        args.push(`--parallel-mode ${settings.parallelThreads},${settings.parallelMode}`);
    }
    if (settings.stats > 0 && emit("stats")) {
        args.push(`--stats=${settings.stats}`);
    }
    if (settings.verbose > 0 && emit("verbose")) {
        args.push(`--verbose=${settings.verbose}`);
    }
    if (settings.preProcessor && emit("preProcessor")) {
        args.push("--pre");
    }
    args.push(...splitList(settings.constants).map((constant) => `--const ${constant}`));
    args.push(...filterCustomArgs(settings.customArgs));

    const { files, unmatched } = resolvePatterns(baseDirectory, splitList(settings.additionalFiles));
    args.push(...files.map((file) => `"${file}"`));

    return { args, unmatched };
}

/**
 * Converts an existing config.json into settings, so a project that already has
 * one can move to the panel without retyping everything.
 * @param {Object} config Parsed config.json
 * @returns {Object}
 */
function configToSettings(config) {
    const args = config?.args ?? {};
    return normalizeSettings({
        models: args.models,
        timeLimit: args.timeLimit,
        solveLimitConflicts: args.solveLimit?.conflicts,
        solveLimitRestarts: args.solveLimit?.restarts,
        parallelEnabled: !!args.parallelMode?.useParallelMode,
        parallelThreads: args.parallelMode?.threads,
        parallelMode: args.parallelMode?.mode,
        stats: args.stats,
        verbose: args.verboseMode,
        preProcessor: args.preProcessor,
        constants: (args.constants ?? []).join(", "),
        additionalFiles: (config?.additionalFiles ?? []).join(", "),
        customArgs: args.customArgs,
    });
}

/** Written into an exported file, so it explains itself to whoever receives it. */
const EXPORT_DESCRIPTION =
    "Clingo solver options exported from the ASP panel's settings pane. " +
    "Bring them in with 'Import from config.json' in that pane, which is what runs them.";

/**
 * Turns the panel's settings back into a config.json object.
 *
 * The inverse of configToSettings, and what config.json is still for: handing
 * your solver options to somebody else. Every option is written out, including
 * the ones left at their default, so the file states what a run will do instead
 * of leaving the reader to remember which defaults were in force.
 *
 * @param {Object} raw The stored settings
 * @returns {Object} A config object that validates against schema.json
 */
function settingsToConfig(raw) {
    const settings = normalizeSettings(raw);
    return {
        description: EXPORT_DESCRIPTION,
        additionalFiles: splitList(settings.additionalFiles),
        args: {
            models: settings.models,
            timeLimit: settings.timeLimit,
            solveLimit: {
                conflicts: settings.solveLimitConflicts,
                restarts: settings.solveLimitRestarts,
            },
            // All three are written whether or not parallel solving is on: the
            // schema requires them together, and a file missing them would not
            // import on the other end
            parallelMode: {
                useParallelMode: settings.parallelEnabled,
                threads: settings.parallelThreads,
                mode: settings.parallelMode,
            },
            stats: settings.stats,
            verboseMode: settings.verbose,
            preProcessor: settings.preProcessor,
            constants: splitList(settings.constants),
            customArgs: settings.customArgs,
        },
    };
}

module.exports = {
    DEFAULT_SETTINGS,
    SETTING_FIELDS,
    NO_THREADS_NOTE,
    EXPORT_DESCRIPTION,
    describeFields,
    normalizeSettings,
    settingsToArgs,
    configToSettings,
    settingsToConfig,
};

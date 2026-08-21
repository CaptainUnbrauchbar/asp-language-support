const { resolvePatterns } = require("./filePatterns.js");

/**
 * The solver options the panel's settings pane edits.
 *
 * They do the same job as a config.json but are kept per workspace, so the
 * common case needs no file at all. configToSettings and settingsToConfig below
 * are the only things that still read and write one.
 */

/** Everything off or unlimited, which is what plain clingo does. */
const DEFAULT_SETTINGS = Object.freeze({
    models: 0,
    timeLimit: 0,
    solveLimitConflicts: 0,
    solveLimitRestarts: 0,
    parallelEnabled: false,
    parallelThreads: 4,
    parallelMode: "compete",
    stats: 0,
    verbose: 0,
    outputFormat: "2",
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
        description: "Values for #const, comma separated, e.g. n=3, k=2. Can be used instead of a #const directive in the program itself.",
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
        key: "outputFormat",
        label: "Output format",
        description:
            "Which of clingo's output formats to ask for. JSON is default because it is the only one directly usable by this extension: " +
            "Live model count tracking during computation, answer formatting, search/filter, comparing answer sets, statistics and copy buttons all only work on JSON output. " +
            "Choose another and the panel shows plain unformatted clingo output.",
        type: "select",
        options: [
            { value: "0", label: "0 - default text" },
            { value: "1", label: "1 - competition" },
            { value: "2", label: "2 - JSON (recommended)" },
            { value: "3", label: "3 - no output" },
        ],
        backends: ["path"],
        unsupportedNote:
            "The bundled solver exists to hand back the JSON of --outf=2 and parses whatever comes back, so a second format would break the run. " +
            "Your own clingo from PATH can print in any of clingo's formats.",
    },
    {
        key: "customArgs",
        label: "Custom arguments",
        description:
            "Passed to clingo as written. The model count, --version and --help are ignored, since the extension sets them itself. " +
            "Some arguments are reserved because they are used elsewhere and will be ignored with a notification.",
        type: "text",
        placeholder: "--opt-strategy=usc",
    },
];

/**
 * @param {Object} field
 * @returns {String[]}
 */
function optionValues(field) {
    return (field.options ?? []).map((option) => (typeof option === "string" ? option : option.value));
}

/**
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
            // Compared as a string so a config that writes the output format as
            // the number it looks like is still understood
            const asText = value === undefined || value === null ? "" : String(value);
            settings[field.key] = optionValues(field).includes(asText) ? asText : DEFAULT_SETTINGS[field.key];
        } else {
            settings[field.key] = String(value ?? "");
        }
    }
    return settings;
}

function splitList(value) {
    return String(value ?? "")
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

/**
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
 * Turns the settings into clingo arguments
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

    // "models" and "outputFormat" are deliberately absent: clingo takes the
    // model count as a bare positional argument and the bundled solver supplies
    // its own --outf=2, so emitting either here would hand clingo two.
    //
    // --time-limit does travel with the run even though the bundled solver
    // ignores it: that is where the extension's own timer reads it from.
    if (settings.timeLimit > 0) {
        args.push(`--time-limit=${settings.timeLimit}`);
    }
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
        outputFormat: args.outputFormat,
        preProcessor: args.preProcessor,
        constants: (args.constants ?? []).join(", "),
        additionalFiles: (config?.additionalFiles ?? []).join(", "),
        customArgs: args.customArgs,
    });
}

const EXPORT_DESCRIPTION =
    "Clingo solver options exported from the ASP panel's settings pane. " +
    "Bring them in with 'Import from config.json' in that pane, which is what runs them.";

/**
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
            parallelMode: {
                useParallelMode: settings.parallelEnabled,
                threads: settings.parallelThreads,
                mode: settings.parallelMode,
            },
            stats: settings.stats,
            verboseMode: settings.verbose,
            outputFormat: Number(settings.outputFormat),
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
    describeFields,
    normalizeSettings,
    optionValues,
    settingsToArgs,
    configToSettings,
    settingsToConfig,
};

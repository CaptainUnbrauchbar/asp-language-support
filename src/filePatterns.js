/**
 * Resolving lists of files that may contain globs. Shared by the JSON config and
 * by the settings pane so both understand exactly the same patterns.
 */
const fs = require("fs");
const { isAbsolute, join, relative, resolve } = require("path");

/** Characters that turn an entry into a pattern rather than a plain path. */
const GLOB_CHARACTERS = /[*?]/;

/** Windows reaches the same file through several spellings, so compare loosely. */
const IGNORE_CASE = process.platform === "win32";

/**
 * @param {String} a
 * @param {String} b
 * @returns {Boolean}
 */
function sameCharacter(a, b) {
    return IGNORE_CASE ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Matches one path segment against one pattern segment, where `*` stands for any
 * run of characters and `?` for exactly one.
 *
 * Written as a scan with a single backtracking point rather than as a regular
 * expression: a pattern such as `*a*a*a*a*b.lp` compiles to a regex that takes
 * exponential time on a name that almost matches, which is enough to wedge the
 * extension host, and patterns arrive from a config file in the workspace.
 * @param {String} pattern
 * @param {String} name
 * @returns {Boolean}
 */
function matchSegment(pattern, name) {
    let patternIndex = 0;
    let nameIndex = 0;
    // Where the most recent `*` sat, and how much of the name it had swallowed
    let starIndex = -1;
    let starNameIndex = 0;

    while (nameIndex < name.length) {
        const char = pattern[patternIndex];
        if (patternIndex < pattern.length && (char === "?" || sameCharacter(char, name[nameIndex]))) {
            patternIndex++;
            nameIndex++;
        } else if (patternIndex < pattern.length && char === "*") {
            starIndex = patternIndex++;
            starNameIndex = nameIndex;
        } else if (starIndex !== -1) {
            // Only ever reconsider the last `*`, which is what keeps this linear
            patternIndex = starIndex + 1;
            nameIndex = ++starNameIndex;
        } else {
            return false;
        }
    }

    while (pattern[patternIndex] === "*") {
        patternIndex++;
    }
    return patternIndex === pattern.length;
}

/**
 * @param {String} pattern Always written with forward slashes
 * @param {String} path A path relative to the base directory, forward slashes
 * @returns {Boolean}
 */
function matchesGlob(pattern, path) {
    const patternSegments = pattern.split("/");
    const pathSegments = path.split("/");

    // reachable[i] is true when the pattern consumed so far covers the first i
    // path segments. Carrying every position forward means `**` costs nothing
    // extra instead of forcing the search to retry each split in turn.
    let reachable = new Array(pathSegments.length + 1).fill(false);
    reachable[0] = true;

    for (const segment of patternSegments) {
        const next = new Array(pathSegments.length + 1).fill(false);
        if (segment === "**") {
            // "**" spans any number of directories, including none
            let open = false;
            for (let i = 0; i < next.length; i++) {
                open = open || reachable[i];
                next[i] = open;
            }
        } else {
            for (let i = 0; i < pathSegments.length; i++) {
                if (reachable[i] && matchSegment(segment, pathSegments[i])) {
                    next[i + 1] = true;
                }
            }
        }
        reachable = next;
    }
    return reachable[pathSegments.length];
}

/**
 * @param {String} directory
 * @param {String} prefix
 * @returns {String[]}
 */
function listFilesBelow(directory, prefix = "") {
    /** @type {String[]} */
    const found = [];
    let entries;
    try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
        return found;
    }
    for (const entry of entries) {
        // Nothing worth including ever lives in these, and walking them is slow
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) {
                continue;
            }
            found.push(...listFilesBelow(join(directory, entry.name), `${prefix}${entry.name}/`));
        } else {
            found.push(`${prefix}${entry.name}`);
        }
    }
    return found;
}

/**
 * Resolves an entry against the base directory, refusing anything that lands
 * outside it. Additional files are documented as living in the workspace, and a
 * config file travels with the project it belongs to, so a `../../..` entry is
 * someone else's file rather than the user's.
 * @param {String} baseDirectory
 * @param {String} entry
 * @returns {String | undefined} The absolute path, or undefined if it escapes
 */
function resolveInside(baseDirectory, entry) {
    const absolute = resolve(baseDirectory, entry);
    const inside = relative(baseDirectory, absolute);
    return inside && !inside.startsWith("..") && !isAbsolute(inside) ? absolute : undefined;
}

/**
 * Turns a list of paths and globs into absolute paths below `baseDirectory`.
 * @param {String} baseDirectory
 * @param {String[]} entries
 * @returns {{files: String[], unmatched: String[]}}
 */
function resolvePatterns(baseDirectory, entries) {
    /** @type {String[]} */
    const files = [];
    /** @type {String[]} */
    const unmatched = [];
    /** @type {String[] | undefined} Walked at most once, and only if a glob asks */
    let listing;

    for (const entry of entries) {
        const cleaned = entry.replace(/\\/g, "/").trim();
        if (!cleaned) {
            continue;
        }
        if (!GLOB_CHARACTERS.test(cleaned)) {
            const file = resolveInside(baseDirectory, cleaned);
            if (file) {
                files.push(file);
            } else {
                unmatched.push(entry);
            }
            continue;
        }

        listing ??= listFilesBelow(baseDirectory);
        const matches = listing
            .filter((relativePath) => matchesGlob(cleaned, relativePath))
            .sort()
            .map((relativePath) => join(baseDirectory, relativePath));

        if (!matches.length) {
            unmatched.push(entry);
        }
        files.push(...matches);
    }
    return { files, unmatched };
}

module.exports = { resolvePatterns, resolveInside, matchesGlob };

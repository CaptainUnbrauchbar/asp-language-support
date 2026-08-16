const fs = require("fs");
const { join } = require("path");

/**
 * Resolving lists of files that may contain globs. Shared by the JSON config and
 * by the settings pane so both understand exactly the same patterns.
 */

/** Characters that turn an entry into a pattern rather than a plain path. */
const GLOB_CHARACTERS = /[*?]/;

/**
 * Translates a glob into a regular expression matching a path relative to the
 * base directory. Supports "**" for any depth, "*" within one segment and "?".
 * @param {String} pattern Always written with forward slashes
 * @returns {RegExp}
 */
function globToRegExp(pattern) {
    let source = "";
    for (let index = 0; index < pattern.length; index++) {
        const char = pattern[index];
        if (char === "*") {
            if (pattern[index + 1] === "*") {
                // "**/" spans any number of directories, including none
                index++;
                if (pattern[index + 1] === "/") {
                    index++;
                }
                source += "(?:.*/)?";
            } else {
                source += "[^/]*";
            }
        } else if (char === "?") {
            source += "[^/]";
        } else {
            source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        }
    }
    return new RegExp(`^${source}$`, process.platform === "win32" ? "i" : "");
}

/**
 * Every file under `directory`, as paths relative to it and using forward
 * slashes so one pattern behaves the same on every platform.
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

    for (const entry of entries) {
        const cleaned = entry.replace(/\\/g, "/").trim();
        if (!cleaned) {
            continue;
        }
        if (!GLOB_CHARACTERS.test(cleaned)) {
            files.push(join(baseDirectory, cleaned));
            continue;
        }

        const matcher = globToRegExp(cleaned);
        const matches = listFilesBelow(baseDirectory)
            .filter((relativePath) => matcher.test(relativePath))
            .sort()
            .map((relativePath) => join(baseDirectory, relativePath));

        if (!matches.length) {
            unmatched.push(entry);
        }
        files.push(...matches);
    }
    return { files, unmatched };
}

// globToRegExp, listFilesBelow and GLOB_CHARACTERS are how resolvePatterns works
// rather than what it offers, so they stay inside this module
module.exports = { resolvePatterns };

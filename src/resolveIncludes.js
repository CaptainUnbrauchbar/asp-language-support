const { dirname, isAbsolute, join, relative, resolve, sep } = require("path");

/**
 * Inlines `#include "other.lp".` directives so a program spread over several
 * files can be handed to the WASM solver as a single string.
 *
 * Clingo itself understands `#include`, but the WASM build has no filesystem to
 * read from, so a program that runs fine against a Clingo from PATH fails with
 * "file could not be opened" when solved with the bundled one. Resolving the
 * directives here makes both behave the same, and means composing files needs no
 * extension specific configuration at all.
 *
 * `#include <incmode>` and friends are left untouched: those are built into
 * Clingo and resolve without a filesystem.
 */

/** A quoted include, which is the only form that needs a file to exist. */
const FILE_INCLUDE = /^\s*#include\s+"([^"]+)"\s*\.\s*$/;

/**
 * Paths are compared case insensitively on Windows so that the same file
 * reached through different spellings is still only included once.
 * @param {String} path
 */
function identityOf(path) {
    const absolute = resolve(path);
    return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

/**
 * How a file should be named in messages: relative to the program's entry
 * point, which is short but still tells two same named files apart.
 * @param {String} path
 * @param {String} entryDirectory
 */
function displayNameOf(path, entryDirectory) {
    const name = relative(entryDirectory, path);
    return !name || name.startsWith("..") ? path : name.split(sep).join("/");
}

/**
 * @typedef {Object} ResolvedProgram
 * @property {String} program The whole program with every include inlined
 * @property {{file: String, line: Number}[]} lineMap One entry per line of `program`
 * @property {String[]} files Every file that contributed, entry point first
 * @property {String[]} errors Includes that could not be read
 */

/**
 * @param {String} entryPath Absolute path of the file being solved
 * @param {(path: String) => String} readFile Reads a file, throws if it cannot
 * @returns {ResolvedProgram}
 */
function resolveIncludes(entryPath, readFile) {
    const entryDirectory = dirname(resolve(entryPath));
    /** @type {String[]} */
    const lines = [];
    /** @type {{file: String, line: Number}[]} */
    const lineMap = [];
    /** @type {String[]} */
    const files = [];
    /** @type {String[]} */
    const errors = [];
    const included = new Set();

    /**
     * @param {String} path
     * @param {String[]} stack Files currently being inlined, to catch cycles
     */
    function inline(path, stack) {
        const identity = identityOf(path);
        // Including the same file twice would duplicate its rules, and a cycle
        // would never terminate; both are answered by including it only once
        if (included.has(identity)) {
            return;
        }
        included.add(identity);

        let content;
        try {
            content = readFile(path);
        } catch {
            errors.push(displayNameOf(path, entryDirectory));
            return;
        }
        files.push(path);

        const display = displayNameOf(path, entryDirectory);
        content.split(/\r?\n/).forEach((line, index) => {
            const include = line.match(FILE_INCLUDE);
            if (include) {
                const target = isAbsolute(include[1]) ? include[1] : join(dirname(path), include[1]);
                inline(target, [...stack, identity]);
                return;
            }
            lines.push(line);
            lineMap.push({ file: display, line: index + 1 });
        });
    }

    inline(resolve(entryPath), []);

    return { program: lines.join("\n"), lineMap, files, errors };
}

/**
 * Rewrites the positions in a Clingo message so they point at the file the line
 * actually came from. Clingo sees one program read from stdin and reports
 * "-:12:3-5", which after inlining refers to a line the user never wrote.
 * @param {String} text
 * @param {{file: String, line: Number}[]} lineMap
 * @returns {String}
 */
function mapMessagePositions(text, lineMap) {
    return String(text ?? "").replace(/(^|\s)-:(\d+):/g, (whole, lead, line) => {
        const origin = lineMap[Number(line) - 1];
        return origin ? `${lead}${origin.file}:${origin.line}:` : whole;
    });
}

module.exports = { resolveIncludes, mapMessagePositions };

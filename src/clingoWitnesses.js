/**
 * Pulls the answer sets out of the JSON clingo streams with `--outf=2`.
 *
 * A run that is stopped leaves that JSON cut off wherever clingo happened to be
 * when the process ended, so it cannot be parsed as a whole and the answers
 * found before the stop used to be shown as a wall of raw text, or lost. The
 * answers themselves are complete though: clingo writes each one as it finds it,
 * and only the last can be half written.
 *
 * The scan tracks strings and their escapes, and the stack of containers with
 * the key each was entered under. An answer is any object that is a direct
 * element of an array behind a "Witnesses" key. Structural characters are only
 * read outside of strings, so an atom containing a brace or a quote cannot
 * confuse it, and nothing is assumed about how the JSON is laid out.
 */

/**
 * @typedef {Object} ExtractedWitnesses
 * @property {String[][]} witnesses The answer sets kept, each a list of atoms
 * @property {Number} total How many complete answers the output held, which can
 *           exceed the ones kept
 */

/**
 * A scan that can be fed clingo's output a chunk at a time.
 *
 * Reading it as it arrives rather than at the end is what lets a run from PATH
 * report how many answers it has found while it is still searching, the same as
 * the bundled solver does, instead of showing a spinner and no news for minutes.
 *
 * @param {Object} [options]
 * @param {Number} [options.limit] How many answers to keep. A program that
 *        produces them faster than anyone can read should not be able to fill
 *        memory, and the panel renders far fewer than this anyway.
 * @param {(count: Number) => void} [options.onWitness] Called with the running
 *        count as each answer completes.
 * @returns {{feed: (chunk: String) => void, witnesses: String[][], total: Number}}
 *          witnesses and total are read after feeding, or at any point during it
 */
function createWitnessScan({ limit = Infinity, onWitness } = {}) {
    /** @type {String[][]} */
    const witnesses = [];

    /** @type {{container: String, key: String | undefined}[]} */
    const stack = [];
    let pendingKey;
    let inString = false;
    let escaped = false;
    let string = "";
    /** Stack depth at which the answer being captured started, 0 when none is. */
    let captureDepth = 0;
    let buffer = "";

    const scan = {
        witnesses,
        total: 0,
        feed(chunk) {
            for (const char of String(chunk ?? "")) {
                if (captureDepth > 0) {
                    buffer += char;
                }

                if (inString) {
                    if (escaped) {
                        escaped = false;
                    } else if (char === "\\") {
                        escaped = true;
                    } else if (char === '"') {
                        inString = false;
                    } else {
                        string += char;
                    }
                    continue;
                }

                switch (char) {
                    case '"':
                        inString = true;
                        string = "";
                        break;
                    case ":":
                        pendingKey = string;
                        break;
                    case "{":
                    case "[": {
                        const parent = stack[stack.length - 1];
                        stack.push({ container: char, key: parent?.container === "{" ? pendingKey : undefined });
                        if (char === "{" && captureDepth === 0 && parent?.container === "[" && parent.key === "Witnesses") {
                            captureDepth = stack.length;
                            buffer = char;
                        }
                        break;
                    }
                    case "}":
                    case "]":
                        if (captureDepth === stack.length) {
                            // Complete, so it parses. A half written one never
                            // gets here, which is what makes a stopped run readable.
                            const value = JSON.parse(buffer).Value;
                            if (Array.isArray(value)) {
                                scan.total++;
                                if (witnesses.length < limit) {
                                    witnesses.push(value);
                                }
                                onWitness?.(scan.total);
                            }
                            captureDepth = 0;
                        }
                        stack.pop();
                        break;
                }
            }
        },
    };
    return scan;
}

/**
 * The answer sets in output that has already been collected in full.
 * @param {String} text What clingo wrote to stdout, whole or cut off
 * @param {Number} [limit] How many answers to keep
 * @returns {ExtractedWitnesses}
 */
function extractWitnesses(text, limit = Infinity) {
    const scan = createWitnessScan({ limit });
    scan.feed(text);
    return { witnesses: scan.witnesses, total: scan.total };
}

module.exports = { createWitnessScan, extractWitnesses };

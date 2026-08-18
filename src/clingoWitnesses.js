/**
 * Pulls the answer sets out of the JSON clingo streams with `--outf=2`.
 */

/**
 * @typedef {Object} ExtractedWitnesses
 * @property {String[][]} witnesses The answer sets kept, each a list of atoms
 * @property {Number} total How many complete answers the output held, which can
 *           exceed the ones kept
 */

/**
 * A scan that can be fed clingo's output a chunk at a time, which is what lets
 * a run from PATH report its model count while it is still searching.
 *
 * @param {Object} [options]
 * @param {Number} [options.limit] How many answers to keep, so a program that
 *        produces them faster than anyone can read cannot fill memory.
 * @param {(count: Number) => void} [options.onWitness] Called with the running
 *        count as each answer completes.
 * @returns {{feed: (chunk: String) => void, witnesses: String[][], total: Number}}
 *          witnesses and total are read after feeding, or at any point during it
 */
function createWitnessScan({ limit = Infinity, onWitness } = {}) {
    /** @type {String[][]} */
    const witnesses = [];

    /** Containers currently open, each with the key it was entered under. @type {{container: String, key: String | undefined}[]} */
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
                        // An answer is an object directly inside a "Witnesses" array
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

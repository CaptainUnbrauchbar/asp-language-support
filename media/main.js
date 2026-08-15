// Script file to be included in the webview

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const outputContainer = document.querySelector(".output-container");
    const toolbar = document.querySelector(".toolbar");
    const filterBox = document.querySelector(".filter-box");
    const copyAllButton = document.querySelector(".copy-all");
    const summary = document.querySelector(".summary");

    /** How long to wait after a keystroke before re-rendering, in ms. */
    const FILTER_DEBOUNCE_MS = 120;

    /** The last result received, kept so filtering can re-render without solving again. */
    let lastResult = null;
    let filterTimer;

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "updateOutput") {
            lastResult = message.answers;
            lastResult.useConfig = message.useConfig;
            lastResult.cfgFile = message.cfgFile;
            filterBox.value = "";
            toolbar.hidden = false;
            render();
        }
        if (message.type === "updateOutputString") {
            lastResult = null;
            toolbar.hidden = true;
            showRawOutput(message.answers);
        }
    });

    filterBox.addEventListener("input", () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(render, FILTER_DEBOUNCE_MS);
    });

    copyAllButton.addEventListener("click", () => {
        vscode.postMessage({ type: "copyAll" });
    });

    /**
     * Creates a readonly textarea holding the given text.
     * @param {string} className
     * @param {string} text
     * @param {string} height
     */
    function makeBox(className, text, height) {
        const box = document.createElement("textarea");
        box.className = className;
        box.readOnly = true;
        box.value = text;
        box.style.height = height;
        return box;
    }

    /**
     * Renders the raw text output produced by the Clingo binary from PATH.
     * Rebuilds the container instead of reusing whatever ".output-box" happens
     * to be first, which would otherwise overwrite an answer of a previous run.
     * @param {string} text
     */
    function showRawOutput(text) {
        outputContainer.innerHTML = "";
        const box = makeBox("output-box", text, "20em");
        outputContainer.appendChild(box);
        box.scrollTop = box.scrollHeight;
    }

    /**
     * Applies the current filter to the answer sets. An answer keeps only the
     * atoms that match, and answers left with nothing are dropped, so the same
     * box works for "which answers mention this" and "show me these atoms".
     * @param {string} query
     */
    function applyFilter(query) {
        if (!query) {
            return lastResult.answers.map((atoms, index) => ({ index, atoms }));
        }
        const needle = query.toLowerCase();
        return lastResult.answers
            .map((atoms, index) => ({ index, atoms: atoms.filter((atom) => atom.toLowerCase().includes(needle)) }))
            .filter((entry) => entry.atoms.length > 0);
    }

    /**
     * Builds the summary line describing how much of the result is on screen.
     * @param {number} shown
     * @param {string} query
     */
    function summarise(shown, query) {
        const total = lastResult.totalAnswers;
        const loaded = lastResult.answers.length;
        if (query) {
            return `Showing ${shown} of ${loaded} answer set(s)` + (lastResult.truncated ? ` (${total} found in total)` : "");
        }
        if (lastResult.truncated) {
            return `Showing the first ${loaded} of ${total} answer sets - use "Copy all" to get every one`;
        }
        return `${total} answer set(s)`;
    }

    function render() {
        if (!lastResult) {
            return;
        }
        const query = filterBox.value.trim();
        const entries = applyFilter(query);

        outputContainer.innerHTML = ""; // Clear previous content
        summary.textContent = summarise(entries.length, query);

        // Create a container for metadata and config boxes
        const infoContainer = document.createElement("div");
        infoContainer.className = "info-container"; // Flex container for metadata and config boxes

        infoContainer.appendChild(
            makeBox(
                "info-box",
                `Solver: ${lastResult.solver}
Models: ${lastResult.models}
Calls: ${lastResult.calls}
Time: Total: ${lastResult.time.total}s, Solve: ${lastResult.time.solve}s, Model: ${lastResult.time.model}s
Result: ${lastResult.result}`,
                "10em"
            )
        );

        if (lastResult.useConfig) {
            infoContainer.appendChild(makeBox("info-box", `Config Options:\n${lastResult.cfgFile.join("\n")}`, "10em"));
        }

        outputContainer.appendChild(infoContainer);

        // Clingo's warnings and info messages point at real problems in the
        // program, so show them rather than dropping them on the floor
        if (lastResult.warnings && lastResult.warnings.length) {
            outputContainer.appendChild(makeBox("warning-box", `Clingo messages:\n${lastResult.warnings.join("\n")}`, "6em"));
        }

        if (lastResult.totalAnswers === 0) {
            const note = document.createElement("p");
            note.className = "empty-note";
            note.textContent =
                lastResult.result === "UNSATISFIABLE"
                    ? "No answer sets: the program is unsatisfiable."
                    : "No answer sets were produced.";
            outputContainer.appendChild(note);
            return;
        }

        if (entries.length === 0) {
            const note = document.createElement("p");
            note.className = "empty-note";
            note.textContent = `No atom matches "${query}".`;
            outputContainer.appendChild(note);
            return;
        }

        // Loop through the answers and create output boxes
        entries.forEach((entry) => {
            const answerContainer = document.createElement("div");
            answerContainer.className = "answer-container";

            const total = lastResult.answers[entry.index].length;
            // While filtering, entry.atoms holds only the matches, so say so
            // rather than making the answer look shorter than it is
            const atomCount = entry.atoms.length === total ? `${total} atoms` : `${entry.atoms.length} of ${total} atoms`;

            const labelBox = document.createElement("button");
            labelBox.className = "answer-label-box";
            labelBox.textContent = `Answer ${entry.index + 1}/${lastResult.totalAnswers} (${atomCount}) - click to copy`;
            labelBox.addEventListener("click", () => {
                // Copying goes through the extension, which holds every answer
                // set and has a clipboard API that actually works in a webview
                vscode.postMessage({ type: "copyAnswer", index: entry.index });
            });
            answerContainer.appendChild(labelBox);

            answerContainer.appendChild(makeBox("output-box", entry.atoms.join(", "), "8em"));
            outputContainer.appendChild(answerContainer);
        });
    }
})();

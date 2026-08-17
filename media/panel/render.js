/**
 * What goes on screen, and in what order. The one script that reads the panel's
 * state rather than being handed it; it knows where each piece belongs, not how
 * the others build it.
 */
(function () {
    const panel = window.AspPanel;
    const { vscode, el, state } = panel;

    /** Keeps the toggle, its wording and the placeholder saying the same thing. */
    function applyFilterMode() {
        el.filterModeButton.setAttribute("aria-pressed", String(state.hideUnmatched));
        el.filterModeButton.title = state.hideUnmatched
            ? "Hiding answers without a matching atom. Click to keep them and only highlight."
            : "Highlighting only. Click to hide answers without matching atoms.";
        el.filterModeButton.setAttribute("aria-label", state.hideUnmatched ? "Hide answers without a match" : "Only highlight matches");
        el.filterBox.placeholder = state.hideUnmatched ? "Filter atoms" : "Highlight atoms";
    }

    // The gear lives in VSCode's own title bar, so nothing here has to stay
    // reachable when the panel is empty
    function updateControls() {
        const hasResult = !!state.lastResult;
        el.header.hidden = !hasResult;
        el.copyAllButton.disabled = !hasResult;
        el.filterBox.disabled = !hasResult;
        el.filterModeButton.disabled = !hasResult;
        el.compareButton.disabled = !hasResult || !panel.answers.canCompare(state.lastResult);
        if (!hasResult) {
            state.compareMode = false;
            el.compareButton.setAttribute("aria-pressed", "false");
            el.statStrip.innerHTML = "";
            el.statStrip.title = "";
        }
    }

    function showWelcome() {
        el.outputContainer.innerHTML = "";
        el.outputContainer.classList.remove("raw-output");
        if (el.welcomeBox) {
            el.outputContainer.appendChild(el.welcomeBox);
        }
    }

    function showRawOutput(text, command) {
        el.outputContainer.innerHTML = "";
        el.outputContainer.classList.add("raw-output");
        if (command) {
            el.outputContainer.appendChild(panel.dom.makeCommandSection(command));
        }
        const box = panel.dom.makeBox("output-box", text);
        el.outputContainer.appendChild(box);
        box.scrollTop = box.scrollHeight;
        vscode.setState({ kind: "raw", text, command });
    }

    function persist() {
        if (state.lastResult) {
            vscode.setState({
                kind: "result",
                result: state.lastResult,
                filter: el.filterBox.value,
                compare: state.compareMode,
                hideUnmatched: state.hideUnmatched,
            });
        } else {
            vscode.setState(undefined);
        }
    }

    function render() {
        const result = state.lastResult;
        if (!result) {
            return;
        }
        const query = el.filterBox.value.trim();
        // Which answers matched decides both what is shown and what is marked,
        // so it is settled before anything is built from it
        state.matchIndices = panel.answers.findMatches(result.answers, query);
        const matches = new Set(state.matchIndices);
        const entries = panel.answers.applyFilter(result, query, matches, state.hideUnmatched);
        updateControls();

        // Comparing a single answer against nothing would just dim everything
        if (!panel.answers.canCompare(result)) {
            state.compareMode = false;
        }
        el.compareButton.disabled = !panel.answers.canCompare(result);
        el.compareButton.setAttribute("aria-pressed", String(state.compareMode));
        const classify = state.compareMode ? panel.answers.buildComparison(result.answers) : undefined;

        persist();

        el.outputContainer.innerHTML = "";
        // Answers scroll with the page rather than inside one fixed height box
        el.outputContainer.classList.remove("raw-output");
        panel.stats.renderStats(result, {
            shown: entries.length,
            query,
            matchCount: state.matchIndices.length,
            hideUnmatched: state.hideUnmatched,
        });

        if (result.warnings && result.warnings.length) {
            el.outputContainer.appendChild(panel.dom.makeCallout("warning", "warning", "Clingo messages", result.warnings.join("\n")));
        }

        if (result.stats) {
            el.outputContainer.appendChild(panel.stats.makeStatsSection(result.stats));
        }

        if (result.command) {
            el.outputContainer.appendChild(panel.dom.makeCommandSection(result.command));
        }

        // The answers below, if any, are only the ones found before the stop
        if (result.result === "UNKNOWN") {
            el.outputContainer.appendChild(panel.answers.makeStoppedCallout(result));
        }

        if (result.totalAnswers === 0) {
            el.outputContainer.appendChild(
                result.result === "UNSATISFIABLE"
                    ? panel.dom.makeCallout("info", "circle-slash", "No answer sets", "The program is unsatisfiable.")
                    : panel.dom.makeCallout("info", "info", "No answer sets", "The run produced no models.")
            );
            return;
        }

        if (entries.length === 0) {
            el.outputContainer.appendChild(panel.dom.makeCallout("info", "search", "No matches", `No atom matches "${query}".`));
            return;
        }

        // While only highlighting, nothing marks a failed search on its own:
        // the answers look exactly as they did before
        if (query && !state.hideUnmatched && state.matchIndices.length === 0) {
            el.outputContainer.appendChild(
                panel.dom.makeCallout("info", "search", "No matches", `No atom matches "${query}". Every answer is shown unchanged.`)
            );
        }

        if (classify) {
            el.outputContainer.appendChild(panel.answers.makeCompareHint(panel.answers.countOccurrences(result.answers), result));
        }

        entries.forEach((entry) => {
            // Only worth marking where the answers that did not match are still
            // on screen; while filtering, every answer shown is a match already
            const marked = !!(query && !state.hideUnmatched && matches.has(entry.index));
            el.outputContainer.appendChild(
                panel.answers.makeAnswerCard(entry, { totalAnswers: result.totalAnswers, query, classify, marked })
            );
        });
    }

    panel.render = { applyFilterMode, updateControls, showWelcome, showRawOutput, render };
})();

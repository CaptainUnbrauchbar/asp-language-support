// Script file to be included in the webview

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const outputContainer = document.querySelector(".output-container");
    const header = document.querySelector(".panel-header");
    const filterBox = document.querySelector(".filter-box");
    const copyAllButton = document.querySelector(".copy-all");
    const moreButton = document.querySelector(".more-button");
    const menu = document.querySelector(".menu");
    const statStrip = document.querySelector(".stat-strip");

    /** How long to wait after a keystroke before re-rendering, in ms. */
    const FILTER_DEBOUNCE_MS = 120;

    /** The last result received, kept so filtering can re-render without solving again. */
    let lastResult = null;
    /** Indices of the answers currently on screen, for the filtered copy action. */
    let visibleIndices = [];
    let filterTimer;

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "updateOutput") {
            lastResult = message.answers;
            lastResult.useConfig = message.useConfig;
            lastResult.cfgFile = message.cfgFile;
            filterBox.value = "";
            header.hidden = false;
            render();
        }
        if (message.type === "updateOutputString") {
            lastResult = null;
            header.hidden = true;
            closeMenu();
            showRawOutput(message.answers);
        }
    });

    filterBox.addEventListener("input", () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(render, FILTER_DEBOUNCE_MS);
    });

    copyAllButton.addEventListener("click", () => {
        vscode.postMessage({ type: "copyAll" });
        const icon = copyAllButton.children[0];
        if (icon) {
            flashCopied(icon);
        }
    });

    ///////////////////////////
    /// Overflow menu       ///
    ///////////////////////////

    /**
     * The actions offered by the "..." button. Adding a tool here is all it
     * takes for it to appear in the menu.
     */
    const MENU_ACTIONS = [
        {
            label: "Copy all answer sets",
            icon: "copy",
            enabled: () => !!lastResult?.totalAnswers,
            run: () => vscode.postMessage({ type: "copyAll" }),
        },
        {
            label: "Copy filtered answer sets",
            icon: "filter",
            enabled: () => !!filterBox.value.trim() && visibleIndices.length > 0,
            run: () => vscode.postMessage({ type: "copyFiltered", indices: visibleIndices }),
        },
        {
            label: "Clear output",
            icon: "clear-all",
            enabled: () => !!lastResult,
            run: () => {
                lastResult = null;
                visibleIndices = [];
                header.hidden = true;
                outputContainer.innerHTML = "";
                vscode.setState(undefined);
                vscode.postMessage({ type: "clearOutput" });
            },
        },
    ];

    function closeMenu() {
        menu.hidden = true;
        moreButton.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
        menu.innerHTML = "";
        MENU_ACTIONS.forEach((action) => {
            const item = document.createElement("li");
            item.className = "menu-item";
            item.setAttribute("role", "menuitem");

            const button = document.createElement("button");
            button.className = "menu-button";
            button.disabled = !action.enabled();

            const icon = document.createElement("i");
            icon.className = `codicon codicon-${action.icon}`;
            button.appendChild(icon);

            const label = document.createElement("span");
            label.textContent = action.label;
            button.appendChild(label);

            button.addEventListener("click", () => {
                closeMenu();
                action.run();
            });
            item.appendChild(button);
            menu.appendChild(item);
        });
        menu.hidden = false;
        moreButton.setAttribute("aria-expanded", "true");
    }

    moreButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (menu.hidden) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    // Clicking anywhere else, or pressing Escape, dismisses the menu
    document.addEventListener("click", () => closeMenu());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });
    menu.addEventListener("click", (event) => event.stopPropagation());

    ///////////////////////////
    /// Rendering           ///
    ///////////////////////////

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
        vscode.setState({ kind: "raw", text });
    }

    /**
     * Saves what is on screen. VSCode hands this back through getState() when it
     * rebuilds the view, which is what happens when the panel is dragged to
     * another position, so the panel can restore itself without the extension.
     */
    function persist() {
        if (lastResult) {
            vscode.setState({ kind: "result", result: lastResult, filter: filterBox.value });
        } else {
            vscode.setState(undefined);
        }
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
     * Shortens "SATISFIABLE" and friends for the compact strip, and picks the
     * icon and colour class that go with the outcome.
     * @param {string} result
     */
    function resultBadgeInfo(result) {
        if (result === "SATISFIABLE") {
            return { label: "SAT", icon: "pass", tone: "sat" };
        }
        if (result === "UNSATISFIABLE") {
            return { label: "UNSAT", icon: "error", tone: "unsat" };
        }
        return { label: result ?? "?", icon: "warning", tone: "unknown" };
    }

    /**
     * Builds one "<icon> <value> <unit>" statistic. The value keeps the full
     * foreground colour while the unit stays muted, so the numbers read first.
     * @param {string} icon Codicon name
     * @param {string} value
     * @param {string} unit
     */
    function makeStat(icon, value, unit) {
        const stat = document.createElement("span");
        stat.className = "stat";

        const glyph = document.createElement("i");
        glyph.className = `codicon codicon-${icon}`;
        stat.appendChild(glyph);

        const strong = document.createElement("span");
        strong.className = "stat-value";
        strong.textContent = value;
        stat.appendChild(strong);

        if (unit) {
            const muted = document.createElement("span");
            muted.className = "stat-unit";
            muted.textContent = unit;
            stat.appendChild(muted);
        }
        return stat;
    }

    /**
     * Builds the one line of statistics that replaces the old metadata box.
     * The parts that do not fit on one line stay available as a tooltip.
     * @param {number} shown
     * @param {string} query
     */
    function renderStats(shown, query) {
        statStrip.innerHTML = "";

        // A count of what is on screen only means something when the list is
        // actually shorter than the result, so it stays out of the way otherwise
        if (query) {
            const chip = document.createElement("span");
            chip.className = "shown-chip";
            chip.textContent = `${shown} of ${lastResult.answers.length}`;
            statStrip.appendChild(chip);
        } else if (lastResult.truncated) {
            const chip = document.createElement("span");
            chip.className = "shown-chip";
            chip.textContent = `first ${lastResult.answers.length} of ${lastResult.totalAnswers}`;
            statStrip.appendChild(chip);
        }

        const outcome = resultBadgeInfo(lastResult.result);
        const badge = document.createElement("span");
        badge.className = `result-badge result-${outcome.tone}`;
        const badgeIcon = document.createElement("i");
        badgeIcon.className = `codicon codicon-${outcome.icon}`;
        badge.appendChild(badgeIcon);
        const badgeText = document.createElement("span");
        badgeText.textContent = outcome.label;
        badge.appendChild(badgeText);
        statStrip.appendChild(badge);

        statStrip.appendChild(
            makeStat("list-ordered", `${lastResult.modelsNumber}${lastResult.modelsMore ? "+" : ""}`, "models")
        );
        statStrip.appendChild(makeStat("watch", `${lastResult.time.total}`, "s"));
        statStrip.appendChild(
            makeStat("server-process", String(lastResult.solver ?? "").replace(/^clingo version /i, "clingo "), "")
        );
        statStrip.title = [
            `Result: ${lastResult.result}`,
            `Models: ${lastResult.models}`,
            `Calls: ${lastResult.calls}`,
            `Time: total ${lastResult.time.total}s, solve ${lastResult.time.solve}s, model ${lastResult.time.model}s`,
            `Solver: ${lastResult.solver}`,
            lastResult.truncated ? `Only the first ${lastResult.answers.length} of ${lastResult.totalAnswers} answer sets are rendered` : "",
        ]
            .filter(Boolean)
            .join("\n");
    }

    /**
     * Appends `text` to `parent`, wrapping every occurrence of the query so the
     * reader can see which part of an atom actually matched.
     * @param {*} parent
     * @param {string} text
     * @param {string} query
     */
    function appendHighlighted(parent, text, query) {
        if (!query) {
            parent.appendChild(document.createTextNode(text));
            return;
        }
        const haystack = text.toLowerCase();
        const needle = query.toLowerCase();
        let cursor = 0;
        let hit = haystack.indexOf(needle);
        while (hit !== -1) {
            if (hit > cursor) {
                parent.appendChild(document.createTextNode(text.slice(cursor, hit)));
            }
            const mark = document.createElement("mark");
            mark.className = "match";
            mark.textContent = text.slice(hit, hit + needle.length);
            parent.appendChild(mark);
            cursor = hit + needle.length;
            hit = haystack.indexOf(needle, cursor);
        }
        if (cursor < text.length) {
            parent.appendChild(document.createTextNode(text.slice(cursor)));
        }
    }

    /**
     * The atoms of one answer. A block element rather than a textarea, so the
     * box grows with its content instead of always being eight lines tall, and
     * so matches can be highlighted.
     * @param {string[]} atoms
     * @param {string} query
     */
    function makeAtomList(atoms, query) {
        const list = document.createElement("div");
        list.className = "atom-list";
        atoms.forEach((atom, index) => {
            if (index > 0) {
                list.appendChild(document.createTextNode(", "));
            }
            appendHighlighted(list, atom, query);
        });
        return list;
    }

    /**
     * A bordered note with an icon, used for clingo's messages and for runs that
     * produced nothing.
     * @param {string} tone "warning" or "info"
     * @param {string} icon Codicon name
     * @param {string} title
     * @param {string} body
     */
    function makeCallout(tone, icon, title, body) {
        const callout = document.createElement("div");
        callout.className = `callout callout-${tone}`;

        const glyph = document.createElement("i");
        glyph.className = `codicon codicon-${icon}`;
        callout.appendChild(glyph);

        const content = document.createElement("div");
        content.className = "callout-body";
        const heading = document.createElement("strong");
        heading.textContent = title;
        content.appendChild(heading);
        if (body) {
            const detail = document.createElement("pre");
            detail.textContent = body;
            content.appendChild(detail);
        }
        callout.appendChild(content);
        return callout;
    }

    /**
     * Briefly turns a copy button into a checkmark, because the confirmation
     * notification is easy to miss and is silenced by turnMessagesOff.
     * @param {*} icon The codicon element inside the button
     */
    function flashCopied(icon) {
        icon.className = "codicon codicon-check copied";
        setTimeout(() => {
            icon.className = "codicon codicon-copy";
        }, 1200);
    }

    function render() {
        if (!lastResult) {
            return;
        }
        const query = filterBox.value.trim();
        const entries = applyFilter(query);
        visibleIndices = entries.map((entry) => entry.index);
        persist();

        outputContainer.innerHTML = ""; // Clear previous content
        renderStats(entries.length, query);

        // The config the run used is only interesting on demand, so it collapses
        if (lastResult.useConfig) {
            const details = document.createElement("details");
            details.className = "config-details";
            const summaryLine = document.createElement("summary");
            summaryLine.textContent = `Config options (${lastResult.cfgFile.length})`;
            details.appendChild(summaryLine);
            const pre = document.createElement("pre");
            pre.textContent = lastResult.cfgFile.join("\n");
            details.appendChild(pre);
            outputContainer.appendChild(details);
        }

        // Clingo's warnings and info messages point at real problems in the
        // program, so show them rather than dropping them on the floor
        if (lastResult.warnings && lastResult.warnings.length) {
            outputContainer.appendChild(makeCallout("warning", "warning", "Clingo messages", lastResult.warnings.join("\n")));
        }

        if (lastResult.totalAnswers === 0) {
            outputContainer.appendChild(
                lastResult.result === "UNSATISFIABLE"
                    ? makeCallout("info", "circle-slash", "No answer sets", "The program is unsatisfiable.")
                    : makeCallout("info", "info", "No answer sets", "The run produced no models.")
            );
            return;
        }

        if (entries.length === 0) {
            outputContainer.appendChild(makeCallout("info", "search", "No matches", `No atom matches "${query}".`));
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

            const answerHeader = document.createElement("div");
            answerHeader.className = "answer-header";

            const label = document.createElement("span");
            label.className = "answer-label";
            label.textContent = `Answer ${entry.index + 1}/${lastResult.totalAnswers} (${atomCount})`;
            answerHeader.appendChild(label);

            const copyButton = document.createElement("button");
            copyButton.className = "icon-button";
            copyButton.title = `Copy answer ${entry.index + 1}`;
            copyButton.setAttribute("aria-label", `Copy answer ${entry.index + 1}`);
            const copyIcon = document.createElement("i");
            copyIcon.className = "codicon codicon-copy";
            copyButton.appendChild(copyIcon);
            copyButton.addEventListener("click", () => {
                // Copying goes through the extension, which holds every answer
                // set and has a clipboard API that actually works in a webview
                vscode.postMessage({ type: "copyAnswer", index: entry.index });
                flashCopied(copyIcon);
            });
            answerHeader.appendChild(copyButton);

            answerContainer.appendChild(answerHeader);
            answerContainer.appendChild(makeAtomList(entry.atoms, query));
            outputContainer.appendChild(answerContainer);
        });
    }

    // Moving the panel to another position disposes this webview and builds a
    // new one on the welcome screen. Restore what was on display from the state
    // VSCode kept for us, which works even if the extension is not listening.
    const saved = vscode.getState();
    if (saved?.kind === "result") {
        lastResult = saved.result;
        filterBox.value = saved.filter ?? "";
        header.hidden = false;
        render();
    } else if (saved?.kind === "raw") {
        showRawOutput(saved.text);
    }

    // Announce that the script is running. The extension only replays its last
    // payload when this webview had nothing of its own, so a restored filter
    // does not get thrown away.
    vscode.postMessage({ type: "ready", hasState: !!saved });
})();

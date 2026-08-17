// Script file to be included in the webview

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const outputContainer = document.querySelector(".output-container");
    /**
     * The welcome screen the panel is built with. Held on to rather than
     * rebuilt, since only the extension knows which solver it names, so
     * clearing the output can put the panel back exactly as it started.
     */
    const welcomeBox = outputContainer.children[0];
    const header = document.querySelector(".panel-header");
    const filterBox = document.querySelector(".filter-box");
    const filterModeButton = document.querySelector(".filter-mode");
    const copyAllButton = document.querySelector(".copy-all");
    const compareButton = document.querySelector(".compare-button");
    const settingsPane = document.querySelector(".settings-pane");
    const settingsBody = document.querySelector(".settings-body");
    const settingsScope = document.querySelector(".settings-scope");
    const settingsImport = document.querySelector(".settings-import");
    const settingsExport = document.querySelector(".settings-export");
    const settingsReset = document.querySelector(".settings-reset");
    const settingsClose = document.querySelector(".settings-close");
    const moreButton = document.querySelector(".more-button");
    const menu = document.querySelector(".menu");
    const statStrip = document.querySelector(".stat-strip");

    /** How long to wait after a keystroke before re-rendering, in ms. */
    const FILTER_DEBOUNCE_MS = 120;

    /** The last result received, kept so filtering can re-render without solving again. */
    let lastResult = null;
    /** Indices of the answers containing a match, for copying and for marking. */
    let matchIndices = [];
    /**
     * Whether a filter removes what does not match, or only marks what does.
     * Narrowing the list is the better default for finding something, but it
     * hides where a match sits among the other answers, which is what you want
     * when comparing them.
     */
    let hideUnmatched = true;
    /** Whether answers are being compared against each other. */
    let compareMode = false;
    let filterTimer;

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "updateOutput") {
            lastResult = message.answers;
            filterBox.value = "";
            header.hidden = false;
            render();
        }
        if (message.type === "updateOutputString") {
            lastResult = null;
            closeMenu();
            showRawOutput(message.answers, message.command);
            updateControls();
        }
        if (message.type === "toggleSettings") {
            toggleSettings(!settingsOpen);
        }
        if (message.type === "updateSettings") {
            settingFields = message.fields ?? settingFields;
            settings = message.settings ?? {};
            settingsScope.textContent = message.scope ?? "";
            if (settingsOpen) {
                renderSettings();
            }
        }
    });

    filterBox.addEventListener("input", () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(render, FILTER_DEBOUNCE_MS);
    });

    compareButton.addEventListener("click", () => {
        compareMode = !compareMode;
        render();
    });

    filterModeButton.addEventListener("click", () => {
        hideUnmatched = !hideUnmatched;
        applyFilterMode();
        render();
    });

    /** Keeps the toggle, its wording and the placeholder saying the same thing. */
    function applyFilterMode() {
        filterModeButton.setAttribute("aria-pressed", String(hideUnmatched));
        filterModeButton.title = hideUnmatched
            ? "Hiding answers without a matching atom. Click to keep them and only highlight."
            : "Highlighting only. Click to hide answers without matching atoms.";
        filterModeButton.setAttribute("aria-label", hideUnmatched ? "Hide answers without a match" : "Only highlight matches");
        filterBox.placeholder = hideUnmatched ? "Filter atoms" : "Highlight atoms";
    }

    // Stated once here rather than trusted to match what the HTML happens to say
    applyFilterMode();

    ///////////////////////////
    /// Solver settings     ///
    ///////////////////////////

    /** The fields to render, sent by the extension so both sides agree on them. */
    let settingFields = [];
    /** The current values. */
    let settings = {};
    let settingsOpen = false;
    let saveTimer;

    /** Sends the edited settings back, debounced so typing does not spam the host. */
    function saveSettings() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => vscode.postMessage({ type: "saveSettings", settings }), 200);
    }

    /**
     * Builds one labelled row. The control is chosen from the field's type, so
     * adding an option to SETTING_FIELDS is enough to make it appear here.
     * @param {Object} field
     */
    function makeSettingRow(field) {
        const row = document.createElement("div");
        row.className = "setting-row";
        if (field.dependsOn && !settings[field.dependsOn]) {
            row.classList.add("setting-disabled");
        }

        // Not every clingo option survives the trip through WebAssembly, and the
        // multithreaded solver needs a new enough VSCode. The extension works
        // out what the current setup cannot honour and attaches the reason, so
        // an option never has to look functional while doing nothing.
        const unsupported = !!field.unavailable;
        if (unsupported) {
            row.classList.add("setting-unavailable");
        }

        const text = document.createElement("div");
        text.className = "setting-text";
        const label = document.createElement("label");
        label.className = "setting-label";
        label.textContent = field.label;
        text.appendChild(label);
        const description = document.createElement("span");
        description.className = "setting-description";
        description.textContent = field.description;
        text.appendChild(description);
        if (unsupported) {
            const note = document.createElement("span");
            note.className = "setting-note";
            const noteIcon = document.createElement("i");
            noteIcon.className = "codicon codicon-info";
            noteIcon.setAttribute("aria-hidden", "true");
            note.appendChild(noteIcon);
            const noteText = document.createElement("span");
            noteText.textContent = field.unavailable;
            note.appendChild(noteText);
            text.appendChild(note);
        }
        row.appendChild(text);

        let control;
        if (field.type === "boolean") {
            control = document.createElement("input");
            control.type = "checkbox";
            control.className = "setting-checkbox";
            control.checked = !!settings[field.key];
            control.addEventListener("change", () => {
                settings[field.key] = control.checked;
                saveSettings();
                // other rows may depend on this one
                renderSettings();
            });
        } else if (field.type === "select") {
            control = document.createElement("select");
            control.className = "setting-select";
            field.options.forEach((option) => {
                // An option is a plain string where the value reads well on its
                // own, and a {value, label} pair where it does not: "1" says
                // nothing about clingo's competition output format
                const value = typeof option === "string" ? option : option.value;
                const item = document.createElement("option");
                item.value = value;
                item.textContent = typeof option === "string" ? option : option.label;
                if (String(settings[field.key]) === value) {
                    item.selected = true;
                }
                control.appendChild(item);
            });
            control.addEventListener("change", () => {
                settings[field.key] = control.value;
                saveSettings();
            });
        } else {
            control = document.createElement("input");
            control.className = "setting-input";
            control.type = field.type === "number" ? "number" : "text";
            if (field.min !== undefined) {
                control.min = String(field.min);
            }
            if (field.max !== undefined) {
                control.max = String(field.max);
            }
            if (field.placeholder) {
                control.placeholder = field.placeholder;
            }
            control.value = String(settings[field.key] ?? "");
            control.addEventListener("input", () => {
                settings[field.key] = field.type === "number" ? Number(control.value) : control.value;
                saveSettings();
            });
        }

        label.setAttribute("for", `setting-${field.key}`);
        control.id = `setting-${field.key}`;
        if (unsupported || (field.dependsOn && !settings[field.dependsOn])) {
            control.disabled = true;
        }

        // The control sits in a fixed width holder rather than being sized
        // itself: vscode.css styles `input:not([type=checkbox])` with width:100%
        // at a specificity a plain class cannot beat, which collapsed the label
        // column to nothing
        const holder = document.createElement("div");
        holder.className = "setting-control";
        holder.appendChild(control);
        row.appendChild(holder);
        return row;
    }

    function renderSettings() {
        settingsBody.innerHTML = "";
        settingFields.forEach((field) => settingsBody.appendChild(makeSettingRow(field)));
    }

    /**
     * The gear lives in the panel's own title bar, so opening and closing the
     * pane arrives as a message rather than as a click in here.
     * @param {Boolean} open
     */
    function toggleSettings(open) {
        settingsOpen = open;
        settingsPane.hidden = !open;
        if (open) {
            renderSettings();
        }
    }

    settingsClose.addEventListener("click", () => toggleSettings(false));
    settingsImport.addEventListener("click", () => vscode.postMessage({ type: "importConfig" }));
    settingsExport.addEventListener("click", () => vscode.postMessage({ type: "exportConfig" }));
    settingsReset.addEventListener("click", () => vscode.postMessage({ type: "resetSettings" }));

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
            label: "Copy matching answer sets",
            icon: "filter",
            enabled: () => !!filterBox.value.trim() && matchIndices.length > 0,
            // The answers that matched, not the ones on screen: while only
            // highlighting, everything is on screen and that would copy the lot
            run: () => vscode.postMessage({ type: "copyFiltered", indices: matchIndices }),
        },
        {
            label: "Clear output",
            icon: "clear-all",
            enabled: () => !!lastResult,
            run: () => {
                lastResult = null;
                matchIndices = [];
                filterBox.value = "";
                showWelcome();
                updateControls();
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
     * Shows the toolbar only while there are results to act on, and enables the
     * controls that need them. The gear lives in VSCode's own title bar, so
     * nothing here has to stay reachable when the panel is empty.
     */
    function updateControls() {
        const hasResult = !!lastResult;
        header.hidden = !hasResult;
        copyAllButton.disabled = !hasResult;
        filterBox.disabled = !hasResult;
        filterModeButton.disabled = !hasResult;
        compareButton.disabled = !hasResult || !canCompare();
        if (!hasResult) {
            compareMode = false;
            compareButton.setAttribute("aria-pressed", "false");
            statStrip.innerHTML = "";
            statStrip.title = "";
        }
    }

    /**
     * Puts the panel back to the screen it started on. An empty panel says
     * nothing about what to do next, which is the whole job of the welcome text.
     */
    function showWelcome() {
        outputContainer.innerHTML = "";
        outputContainer.classList.remove("raw-output");
        if (welcomeBox) {
            outputContainer.appendChild(welcomeBox);
        }
    }

    /**
     * Creates a readonly textarea holding the given text.
     * @param {string} className
     * @param {string} text
     * @param {string} [height] Left off for boxes the stylesheet sizes itself
     */
    function makeBox(className, text, height) {
        const box = document.createElement("textarea");
        box.className = className;
        box.readOnly = true;
        box.value = text;
        if (height) {
            box.style.height = height;
        }
        return box;
    }

    /**
     * Renders the raw text output produced by the Clingo binary from PATH.
     * Rebuilds the container instead of reusing whatever ".output-box" happens
     * to be first, which would otherwise overwrite an answer of a previous run.
     * @param {string} text
     * @param {string} [command] What clingo was invoked with, when it is known
     */
    function showRawOutput(text, command) {
        outputContainer.innerHTML = "";
        // Text clingo printed is all there is to look at, so it gets the whole
        // panel and follows it when the panel is resized. No height is set here:
        // the stylesheet sizes it against the panel, which a number in here
        // could only guess at.
        outputContainer.classList.add("raw-output");
        if (command) {
            outputContainer.appendChild(makeCommandSection(command));
        }
        const box = makeBox("output-box", text);
        outputContainer.appendChild(box);
        box.scrollTop = box.scrollHeight;
        vscode.setState({ kind: "raw", text, command });
    }

    /**
     * Saves what is on screen. VSCode hands this back through getState() when it
     * rebuilds the view, which is what happens when the panel is dragged to
     * another position, so the panel can restore itself without the extension.
     */
    function persist() {
        if (lastResult) {
            vscode.setState({
                kind: "result",
                result: lastResult,
                filter: filterBox.value,
                compare: compareMode,
                hideUnmatched,
            });
        } else {
            vscode.setState(undefined);
        }
    }

    /**
     * Explains what the comparison did, including the fact that it can only look
     * at the answers this panel actually received.
     * @param {{counts: Map<string, number>, total: number}} tally
     */
    function makeCompareHint(tally) {
        let shared = 0;
        let unique = 0;
        tally.counts.forEach((seen) => {
            if (seen >= tally.total) {
                shared++;
            } else if (seen === 1) {
                unique++;
            }
        });

        const sentences = [
            `${shared} atom(s) shared by all ${tally.total} answers are dimmed.`,
            `${unique} appear in only one answer (highlighted green).`,
        ];
        if (lastResult.truncated) {
            sentences.push(`Only the first ${lastResult.answers.length} of ${lastResult.totalAnswers} answers were compared.`);
        }
        return makeCallout("info", "git-compare", "Comparing answers", sentences.join(" "));
    }

    /** Every answer, untouched. */
    function allEntries() {
        return lastResult.answers.map((atoms, index) => ({ index, atoms }));
    }

    /**
     * Applies the current filter to the answer sets.
     *
     * Both modes show an answer in full: an answer set means nothing atom by
     * atom, so hiding the atoms around a match would misrepresent it. The modes
     * differ only in what happens to the answers with no match at all, which
     * filtering drops and highlighting keeps.
     * @param {string} query
     * @param {Set<number>} matches Indices of the answers containing a match
     */
    function applyFilter(query, matches) {
        if (!query || !hideUnmatched) {
            return allEntries();
        }
        return allEntries().filter((entry) => matches.has(entry.index));
    }

    /**
     * The answers containing a match, whichever mode is on. Copying and the
     * counter both mean this, not whatever happens to be rendered.
     * @param {string} query
     */
    function findMatches(query) {
        if (!query) {
            return lastResult.answers.map((_, index) => index);
        }
        const needle = query.toLowerCase();
        return lastResult.answers
            .map((atoms, index) => ({ atoms, index }))
            .filter(({ atoms }) => atoms.some((atom) => atom.toLowerCase().includes(needle)))
            .map(({ index }) => index);
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
        // A run stopped from outside clingo never got to report its version,
        // so the solver only appears when it is actually known
        const solverLabel = String(lastResult.solver ?? "").replace(/^clingo version /i, "clingo ");
        if (solverLabel) {
            statStrip.appendChild(makeStat("server-process", solverLabel, ""));
        }

        // Last, after the figures that are there for every run. The chip comes
        // and goes as you type and as the filter mode is switched, and anything
        // ahead of it would be shoved sideways each time it did.
        if (query) {
            const chip = document.createElement("span");
            chip.className = "shown-chip";
            // Both modes count the answers that matched; what differs is whether
            // the rest are still on screen. Saying "match" either way means the
            // number keeps its meaning when the mode is switched, and only the
            // word after it changes.
            chip.textContent = hideUnmatched
                ? `${shown} of ${lastResult.answers.length} match (filtered)`
                : `${matchIndices.length} of ${lastResult.answers.length} match (highlighted)`;
            statStrip.appendChild(chip);
        } else if (lastResult.truncated) {
            const chip = document.createElement("span");
            chip.className = "shown-chip";
            chip.textContent = `first ${lastResult.answers.length} of ${lastResult.totalAnswers}`;
            statStrip.appendChild(chip);
        }

        statStrip.title = [
            `Result: ${lastResult.result}`,
            `Models: ${lastResult.models}`,
            `Calls: ${lastResult.calls}`,
            `Time: total ${lastResult.time.total}s, solve ${lastResult.time.solve}s, model ${lastResult.time.model}s`,
            lastResult.solver ? `Solver: ${lastResult.solver}` : "",
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
     * Counts how many answer sets each atom occurs in.
     *
     * That count is what separates the answers: an atom in every one of them is
     * part of the shared core and says nothing about a particular answer, while
     * an atom in exactly one is the reason that answer exists at all.
     * @returns {{counts: Map<string, number>, total: number}}
     */
    function countOccurrences() {
        const counts = new Map();
        lastResult.answers.forEach((atoms) => {
            // a Set so an atom repeated inside one answer still counts once
            new Set(atoms).forEach((atom) => counts.set(atom, (counts.get(atom) ?? 0) + 1));
        });
        return { counts, total: lastResult.answers.length };
    }

    /**
     * Builds the function that labels an atom as shared, varying or unique.
     * Returns undefined when there is nothing to compare.
     * @returns {undefined | ((atom: string) => string)}
     */
    function buildComparison() {
        if (!compareMode || !canCompare()) {
            return undefined;
        }
        const { counts, total } = countOccurrences();
        return (atom) => {
            const seen = counts.get(atom) ?? 0;
            if (seen >= total) {
                return "atom-common";
            }
            return seen === 1 ? "atom-unique" : "atom-varying";
        };
    }

    /** Comparing needs at least two answers to compare. */
    function canCompare() {
        return (lastResult?.answers?.length ?? 0) > 1;
    }

    /**
     * The atoms of one answer. A block element rather than a textarea, so the
     * box grows with its content instead of always being eight lines tall, and
     * so matches can be highlighted.
     * @param {string[]} atoms
     * @param {string} query
     * @param {undefined | ((atom: string) => string)} classify
     */
    function makeAtomList(atoms, query, classify) {
        const list = document.createElement("div");
        list.className = "atom-list";
        atoms.forEach((atom, index) => {
            if (index > 0) {
                list.appendChild(document.createTextNode(", "));
            }
            const span = document.createElement("span");
            span.className = classify ? `atom ${classify(atom)}` : "atom";
            appendHighlighted(span, atom, query);
            list.appendChild(span);
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
     * Whether a value is something to walk into rather than a figure to print.
     * An array of plain numbers reads better on one line than split across
     * rows, but an array of objects has to be walked or it prints as
     * "[object Object]", which is what clingo's lemma types used to do.
     * @param {*} value
     */
    function isStatsBranch(value) {
        if (!value || typeof value !== "object") {
            return false;
        }
        return !Array.isArray(value) || value.some((entry) => entry && typeof entry === "object");
    }

    /**
     * The field an array entry names itself with, if it has one. Clingo labels
     * these with what they describe, such as the "Short" and "Conflict" lemma
     * types, which is worth far more than the position.
     * @param {*} entry
     */
    function statsLabelKey(entry) {
        if (!entry || typeof entry !== "object") {
            return undefined;
        }
        return ["Type", "Name"].find((key) => entry[key] !== undefined && typeof entry[key] !== "object");
    }

    /**
     * Names an array entry, which has no key of its own.
     * @param {*} entry
     * @param {number} index
     */
    function statsEntryLabel(entry, index) {
        const key = statsLabelKey(entry);
        return key ? String(entry[key]) : `#${index + 1}`;
    }

    /**
     * Flattens clingo's nested statistics into "Rules / Choice / Final" rows.
     *
     * Which figures clingo reports depends on the statistics level and on what
     * it had to do, so nothing here assumes a fixed set: whatever arrives is
     * walked and shown.
     * @param {Object} value
     * @param {string} prefix
     * @param {Array<[string, string]>} rows
     * @param {string | undefined} skipKey A field already used as this object's name
     */
    function flattenStats(value, prefix, rows, skipKey) {
        const entries = Array.isArray(value)
            ? value.map((entry, index) => [statsEntryLabel(entry, index), entry, statsLabelKey(entry)])
            : Object.keys(value)
                  .filter((key) => key !== skipKey)
                  .map((key) => [key, value[key]]);

        entries.forEach(([key, entry, named]) => {
            const path = prefix ? `${prefix} / ${key}` : key;
            if (isStatsBranch(entry)) {
                // Whatever named the entry is already in the path above it, so
                // it does not need a row of its own saying "Type: Short"
                flattenStats(entry, path, rows, named);
            } else {
                rows.push([path, Array.isArray(entry) ? entry.join(", ") : String(entry)]);
            }
        });
        return rows;
    }

    /**
     * Splits the statistics into their top level sections, so a figure sits
     * under a heading instead of repeating the section name on every line.
     * @param {Object} stats
     * @returns {Array<{name: string, rows: Array<[string, string]>}>}
     */
    function groupStats(stats) {
        const groups = [];
        const loose = [];
        Object.keys(stats).forEach((key) => {
            const entry = stats[key];
            if (isStatsBranch(entry)) {
                groups.push({ name: key, rows: flattenStats(entry, "", []) });
            } else {
                loose.push([key, Array.isArray(entry) ? entry.join(", ") : String(entry)]);
            }
        });
        // Anything clingo reported at the top level has no section to sit under
        if (loose.length) {
            groups.unshift({ name: "", rows: loose });
        }
        return groups;
    }

    /**
     * The solver statistics, collapsed like the config options: they are only
     * interesting when you went looking for them.
     * @param {Object} stats
     */
    function makeStatsSection(stats) {
        const groups = groupStats(stats);
        const total = groups.reduce((count, group) => count + group.rows.length, 0);

        const details = document.createElement("details");
        details.className = "stats-details";

        const summaryLine = document.createElement("summary");
        summaryLine.textContent = `Solver statistics (${total})`;
        details.appendChild(summaryLine);

        // Sections flow into as many columns as the panel is wide, so each
        // figure stays next to its name instead of being flung to the far edge
        // of a very wide panel
        const table = document.createElement("div");
        table.className = "stats-table";
        groups.forEach((group) => {
            const section = document.createElement("div");
            section.className = "stats-group";

            if (group.name) {
                const heading = document.createElement("div");
                heading.className = "stats-group-name";
                heading.textContent = group.name;
                section.appendChild(heading);
            }

            group.rows.forEach(([path, value]) => {
                const row = document.createElement("div");
                row.className = "stats-row";

                const name = document.createElement("span");
                name.className = "stats-key";
                name.textContent = path;
                row.appendChild(name);

                const number = document.createElement("span");
                number.className = "stats-value";
                number.textContent = value;
                row.appendChild(number);

                section.appendChild(row);
            });
            table.appendChild(section);
        });
        details.appendChild(table);
        return details;
    }

    /**
     * What clingo was invoked with, collapsed like the statistics: it is only
     * interesting once a run has surprised you.
     *
     * Reported by the run itself rather than rebuilt from the settings, so
     * options the solver turned out not to support are already gone from it.
     * @param {String} command
     */
    function makeCommandSection(command) {
        const details = document.createElement("details");
        details.className = "command-details";

        const summaryLine = document.createElement("summary");
        summaryLine.textContent = "Command line";
        summaryLine.title = "The exact command clingo was invoked with (argument --outf=2 is always used for correct solver output formatting)";
        details.appendChild(summaryLine);

        const row = document.createElement("div");
        row.className = "command-row";

        const line = document.createElement("code");
        line.className = "command-line";
        line.textContent = command;
        row.appendChild(line);

        const copy = document.createElement("button");
        copy.className = "icon-button command-copy";
        copy.title = "Copy command line";
        copy.setAttribute("aria-label", "Copy command line");
        const icon = document.createElement("i");
        icon.className = "codicon codicon-copy";
        icon.setAttribute("aria-hidden", "true");
        copy.appendChild(icon);
        copy.addEventListener("click", () => {
            vscode.postMessage({ type: "copyText", text: command });
            flashCopied(icon);
        });
        row.appendChild(copy);

        details.appendChild(row);
        return details;
    }

    /**
     * Explains a search that did not finish. When the extension stopped it
     * itself it can name the limit, instead of listing what might have done it.
     */
    function makeStoppedCallout() {
        const stopped = lastResult.stoppedBy;
        if (stopped?.reason === "time-limit" || stopped?.reason === "cancelled") {
            const kept =
                lastResult.totalAnswers < lastResult.modelsNumber
                    ? ` The first ${lastResult.totalAnswers} of the ${lastResult.modelsNumber} answers found are kept.`
                    : "";
            return stopped.reason === "cancelled"
                ? makeCallout(
                      "warning",
                      "debug-stop",
                      "Stopped",
                      `Search was stopped manually, displaying partial result.${kept}`
                  )
                : makeCallout(
                      "warning",
                      "watch",
                      `Stopped after ${stopped.seconds}s`,
                      `Search was stopped by time limit, displaying partial result.${kept}`
                  );
        }
        return makeCallout(
            "warning",
            "warning",
            "Search stopped early",
            "Clingo did not finish, answers may be incomplete. Check any solve limits in settings."
        );
    }

    /**
     * Briefly turns a copy button into a checkmark. Copying used to confirm
     * with a notification, which is easy to miss and interrupts what you were
     * doing; saying so on the button itself is where you are already looking.
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
        // Which answers matched decides both what is shown and what is marked,
        // so it is settled before anything is built from it
        matchIndices = findMatches(query);
        const matches = new Set(matchIndices);
        const entries = applyFilter(query, matches);
        updateControls();

        // Comparing a single answer against nothing would just dim everything
        if (!canCompare()) {
            compareMode = false;
        }
        compareButton.disabled = !canCompare();
        compareButton.setAttribute("aria-pressed", String(compareMode));
        const classify = buildComparison();

        persist();

        outputContainer.innerHTML = ""; // Clear previous content
        // Answers scroll with the page rather than inside one fixed height box
        outputContainer.classList.remove("raw-output");
        renderStats(entries.length, query);

        // Clingo's warnings and info messages point at real problems in the
        // program, so show them rather than dropping them on the floor
        if (lastResult.warnings && lastResult.warnings.length) {
            outputContainer.appendChild(makeCallout("warning", "warning", "Clingo messages", lastResult.warnings.join("\n")));
        }

        // Statistics only arrive when the run asked for them
        if (lastResult.stats) {
            outputContainer.appendChild(makeStatsSection(lastResult.stats));
        }

        if (lastResult.command) {
            outputContainer.appendChild(makeCommandSection(lastResult.command));
        }

        // A cut short search is worth saying out loud: the answers below, if any,
        // are only the ones found before the limit stopped the solver
        if (lastResult.result === "UNKNOWN") {
            outputContainer.appendChild(makeStoppedCallout());
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

        // While only highlighting there is nothing to notice when nothing
        // matched, since the answers look exactly as they did before
        if (query && !hideUnmatched && matchIndices.length === 0) {
            outputContainer.appendChild(
                makeCallout("info", "search", "No matches", `No atom matches "${query}". Every answer is shown unchanged.`)
            );
        }

        if (classify) {
            outputContainer.appendChild(makeCompareHint(countOccurrences()));
        }

        // Loop through the answers and create output boxes
        entries.forEach((entry) => {
            const answerContainer = document.createElement("div");
            // Only worth marking where the answers that did not match are still
            // on screen; while filtering, every answer shown is a match already
            const marked = query && !hideUnmatched && matches.has(entry.index);
            answerContainer.className = marked ? "answer-container has-match" : "answer-container";

            // Answers are always shown whole, so this is simply their size
            const atomCount = `${entry.atoms.length} atoms`;

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
            answerContainer.appendChild(makeAtomList(entry.atoms, query, classify));
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
        compareMode = !!saved.compare;
        hideUnmatched = saved.hideUnmatched !== false;
        applyFilterMode();
        header.hidden = false;
        render();
    } else if (saved?.kind === "raw") {
        showRawOutput(saved.text, saved.command);
    }

    // Announce that the script is running. The extension only replays its last
    // payload when this webview had nothing of its own, so a restored filter
    // does not get thrown away.
    vscode.postMessage({ type: "ready", hasState: !!saved });
})();

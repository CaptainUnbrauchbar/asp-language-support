/** The stat strip along the top of the panel, and clingo's own solver statistics. */
(function () {
    const panel = window.AspPanel;

    function resultBadgeInfo(result) {
        if (result === "SATISFIABLE") {
            return { label: "SAT", icon: "pass", tone: "sat" };
        }
        if (result === "UNSATISFIABLE") {
            return { label: "UNSAT", icon: "error", tone: "unsat" };
        }
        return { label: result ?? "UNKNOWN", icon: "warning", tone: "unknown" };
    }

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

    /** `shown` is how many answers are rendered, `matchCount` how many matched. */
    function renderStats(result, { shown, query, matchCount, hideUnmatched }) {
        const { statStrip } = panel.el;
        statStrip.innerHTML = "";

        const outcome = resultBadgeInfo(result.result);
        const badge = document.createElement("span");
        badge.className = `result-badge result-${outcome.tone}`;
        const badgeIcon = document.createElement("i");
        badgeIcon.className = `codicon codicon-${outcome.icon}`;
        badge.appendChild(badgeIcon);
        const badgeText = document.createElement("span");
        badgeText.textContent = outcome.label;
        badge.appendChild(badgeText);
        statStrip.appendChild(badge);

        statStrip.appendChild(makeStat("list-ordered", `${result.modelsNumber}${result.modelsMore ? "+" : ""}`, "models"));
        statStrip.appendChild(makeStat("watch", `${result.time.total}`, "s"));
        
        // format clingo version correctly
        const solverLabel = String(result.solver ?? "").replace(/^clingo version /i, "clingo ");
        if (solverLabel) {
            statStrip.appendChild(makeStat("server-process", solverLabel, ""));
        }

        if (query) {
            const chip = document.createElement("span");
            chip.className = "shown-chip";
            chip.textContent = hideUnmatched
                ? `${shown} of ${result.answers.length} match (filtered)`
                : `${matchCount} of ${result.answers.length} match (highlighted)`;
            statStrip.appendChild(chip);
        } else if (result.truncated) {
            const chip = document.createElement("span");
            chip.className = "shown-chip";
            chip.textContent = `first ${result.answers.length} of ${result.totalAnswers}`;
            statStrip.appendChild(chip);
        }

        statStrip.title = [
            `Result: ${result.result}`,
            `Models: ${result.models}`,
            `Calls: ${result.calls}`,
            `Time: total ${result.time.total}s, solve ${result.time.solve}s, model ${result.time.model}s`,
            result.solver ? `Solver: ${result.solver}` : "",
            result.truncated ? `Only the first ${result.answers.length} of ${result.totalAnswers} answer sets are rendered` : "",
        ]
            .filter(Boolean)
            .join("\n");
    }

    function isStatsBranch(value) {
        if (!value || typeof value !== "object") {
            return false;
        }
        return !Array.isArray(value) || value.some((entry) => entry && typeof entry === "object");
    }

    function statsLabelKey(entry) {
        if (!entry || typeof entry !== "object") {
            return undefined;
        }
        return ["Type", "Name"].find((key) => entry[key] !== undefined && typeof entry[key] !== "object");
    }

    function statsEntryLabel(entry, index) {
        const key = statsLabelKey(entry);
        return key ? String(entry[key]) : `#${index + 1}`;
    }

    function flattenStats(value, prefix, rows, skipKey) {
        const entries = Array.isArray(value)
            ? value.map((entry, index) => [statsEntryLabel(entry, index), entry, statsLabelKey(entry)])
            : Object.keys(value)
                  .filter((key) => key !== skipKey)
                  .map((key) => [key, value[key]]);

        entries.forEach(([key, entry, named]) => {
            const path = prefix ? `${prefix} / ${key}` : key;
            if (isStatsBranch(entry)) {
                flattenStats(entry, path, rows, named);
            } else {
                rows.push([path, Array.isArray(entry) ? entry.join(", ") : String(entry)]);
            }
        });
        return rows;
    }

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
        if (loose.length) {
            groups.unshift({ name: "", rows: loose });
        }
        return groups;
    }

    function makeStatsSection(stats) {
        const groups = groupStats(stats);
        const total = groups.reduce((count, group) => count + group.rows.length, 0);

        const details = document.createElement("details");
        details.className = "stats-details";

        const summaryLine = document.createElement("summary");
        summaryLine.textContent = `Solver statistics (${total})`;
        details.appendChild(summaryLine);

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

    panel.stats = { renderStats, makeStatsSection };
})();

/** Filtering, comparing and rendering the answer sets. All handed a result rather than reading one. */
(function () {
    const panel = window.AspPanel;
    const { vscode } = panel;

    function allEntries(result) {
        return result.answers.map((atoms, index) => ({ index, atoms }));
    }

    function applyFilter(result, query, matches, hideUnmatched) {
        if (!query || !hideUnmatched) {
            return allEntries(result);
        }
        return allEntries(result).filter((entry) => matches.has(entry.index));
    }

    /** @returns {Number[]} Indices of the answers containing the query. */
    function findMatches(answers, query) {
        if (!query) {
            return answers.map((_, index) => index);
        }
        const needle = query.toLowerCase();
        return answers
            .map((atoms, index) => ({ atoms, index }))
            .filter(({ atoms }) => atoms.some((atom) => atom.toLowerCase().includes(needle)))
            .map(({ index }) => index);
    }

    function countOccurrences(answers) {
        const counts = new Map();
        answers.forEach((atoms) => {
            // a Set so an atom repeated inside one answer still counts once
            new Set(atoms).forEach((atom) => counts.set(atom, (counts.get(atom) ?? 0) + 1));
        });
        return { counts, total: answers.length };
    }

    function canCompare(result) {
        return (result?.answers?.length ?? 0) > 1;
    }

    /** @returns {(atom: String) => String} The class to give an atom. */
    function buildComparison(answers) {
        const { counts, total } = countOccurrences(answers);
        return (atom) => {
            const seen = counts.get(atom) ?? 0;
            if (seen >= total) {
                return "atom-common";
            }
            return seen === 1 ? "atom-unique" : "atom-varying";
        };
    }

    function makeCompareHint(tally, result) {
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
        if (result.truncated) {
            sentences.push(`Only the first ${result.answers.length} of ${result.totalAnswers} answers were compared.`);
        }
        return panel.dom.makeCallout("info", "git-compare", "Comparing answers", sentences.join(" "));
    }

    function makeAtomList(atoms, query, classify) {
        const list = document.createElement("div");
        list.className = "atom-list";
        atoms.forEach((atom, index) => {
            if (index > 0) {
                list.appendChild(document.createTextNode(", "));
            }
            const span = document.createElement("span");
            span.className = classify ? `atom ${classify(atom)}` : "atom";
            panel.dom.appendHighlighted(span, atom, query);
            list.appendChild(span);
        });
        return list;
    }

    function makeAnswerCard(entry, { totalAnswers, query, classify, marked }) {
        const answerContainer = document.createElement("div");
        answerContainer.className = marked ? "answer-container has-match" : "answer-container";

        const atomCount = `${entry.atoms.length} atoms`;

        const answerHeader = document.createElement("div");
        answerHeader.className = "answer-header";

        const label = document.createElement("span");
        label.className = "answer-label";
        label.textContent = `Answer ${entry.index + 1}/${totalAnswers} (${atomCount})`;
        answerHeader.appendChild(label);

        const copyButton = document.createElement("button");
        copyButton.className = "icon-button";
        copyButton.title = `Copy answer ${entry.index + 1}`;
        copyButton.setAttribute("aria-label", `Copy answer ${entry.index + 1}`);
        const copyIcon = document.createElement("i");
        copyIcon.className = "codicon codicon-copy";
        copyButton.appendChild(copyIcon);
        copyButton.addEventListener("click", () => {
            // Copying goes through the extension, which holds every answer set
            // and has a clipboard API that actually works in a webview
            vscode.postMessage({ type: "copyAnswer", index: entry.index });
            panel.dom.flashCopied(copyIcon);
        });
        answerHeader.appendChild(copyButton);

        answerContainer.appendChild(answerHeader);
        answerContainer.appendChild(makeAtomList(entry.atoms, query, classify));
        return answerContainer;
    }

    // Where the extension stopped the run itself it can name the limit, instead
    // of listing what might have done it
    function makeStoppedCallout(result) {
        const stopped = result.stoppedBy;
        if (stopped?.reason === "time-limit" || stopped?.reason === "cancelled") {
            const kept =
                result.totalAnswers < result.modelsNumber
                    ? ` The first ${result.totalAnswers} of the ${result.modelsNumber} answers found are kept.`
                    : "";
            return stopped.reason === "cancelled"
                ? panel.dom.makeCallout("warning", "debug-stop", "Stopped", `Search was stopped manually, displaying partial result.${kept}`)
                : panel.dom.makeCallout(
                      "warning",
                      "watch",
                      `Stopped after ${stopped.seconds}s`,
                      `Search was stopped by time limit, displaying partial result.${kept}`
                  );
        }
        return panel.dom.makeCallout(
            "warning",
            "warning",
            "Search stopped early",
            "Clingo did not finish, answers may be incomplete. Check any solve limits in settings."
        );
    }

    panel.answers = {
        applyFilter,
        findMatches,
        countOccurrences,
        canCompare,
        buildComparison,
        makeCompareHint,
        makeAnswerCard,
        makeStoppedCallout,
    };
})();

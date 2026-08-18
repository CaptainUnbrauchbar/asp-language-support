/** Shared DOM builders. Nothing here reads the panel's state. */
(function () {
    const panel = window.AspPanel;
    const { vscode } = panel;

    function makeBox(className, text) {
        const box = document.createElement("textarea");
        box.className = className;
        box.readOnly = true;
        box.value = text;
        return box;
    }

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

    // Confirms on the button itself: a notification is easy to miss
    function flashCopied(icon) {
        icon.className = "codicon codicon-check copied";
        setTimeout(() => {
            icon.className = "codicon codicon-copy";
        }, 1200);
    }

    // Reported by the run itself rather than rebuilt from the settings, so
    // options the solver refused are already gone from it
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

    panel.dom = { makeBox, makeCallout, appendHighlighted, flashCopied, makeCommandSection };
})();

// Runs within the webview itself and cannot access the main VS Code APIs.
//
// The panel lives in media/panel/, which loads first and leaves everything on
// the AspPanel object this file drives; see panel/core.js. What is left here is
// the wiring: the extension's messages, the toolbar, and the state restore.
(function () {
    const panel = window.AspPanel;
    const { vscode, el, state } = panel;

    window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "updateOutput") {
            state.lastResult = message.answers;
            el.filterBox.value = "";
            el.header.hidden = false;
            panel.render.render();
        }
        if (message.type === "updateOutputString") {
            state.lastResult = null;
            panel.menu.close();
            panel.render.showRawOutput(message.answers, message.command);
            panel.render.updateControls();
        }
        if (message.type === "toggleSettings") {
            panel.settings.toggle(!panel.settings.isOpen());
        }
        if (message.type === "updateSettings") {
            panel.settings.update(message);
        }
    });

    let filterTimer;
    el.filterBox.addEventListener("input", () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(panel.render.render, panel.FILTER_DEBOUNCE_MS);
    });

    el.compareButton.addEventListener("click", () => {
        state.compareMode = !state.compareMode;
        panel.render.render();
    });

    el.filterModeButton.addEventListener("click", () => {
        state.hideUnmatched = !state.hideUnmatched;
        panel.render.applyFilterMode();
        panel.render.render();
    });

    el.copyAllButton.addEventListener("click", () => {
        vscode.postMessage({ type: "copyAll" });
        const icon = el.copyAllButton.children[0];
        if (icon) {
            panel.dom.flashCopied(icon);
        }
    });

    panel.render.applyFilterMode();

    // Moving the panel disposes this webview and builds a new one on the welcome
    // screen. Restoring from the state VSCode kept works even if the extension
    // is not listening.
    const saved = vscode.getState();
    if (saved?.kind === "result") {
        state.lastResult = saved.result;
        el.filterBox.value = saved.filter ?? "";
        state.compareMode = !!saved.compare;
        state.hideUnmatched = saved.hideUnmatched !== false;
        panel.render.applyFilterMode();
        el.header.hidden = false;
        panel.render.render();
    } else if (saved?.kind === "raw") {
        panel.render.showRawOutput(saved.text, saved.command);
    }

    // The extension only replays its last payload when this webview had nothing
    // of its own, so a restored filter does not get thrown away
    vscode.postMessage({ type: "ready", hasState: !!saved });
})();

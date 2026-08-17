/**
 * The panel's scripts meet on a single AspPanel object rather than going through
 * a bundler. This file builds it and has to load first; the others extend it.
 * The load order lives in PANEL_SCRIPTS in src/webviewProvider.js.
 *
 * Reach another script through AspPanel at call time, never by destructuring it
 * while loading: only what this file puts on the object is there yet.
 */
(function () {
    // Replaced rather than extended, so a panel never starts out holding what
    // the last one left behind. The panel tests re-run these scripts per test.
    const panel = {};
    window.AspPanel = panel;

    // Throws on a second call, so it happens here and nowhere else
    panel.vscode = acquireVsCodeApi();

    panel.FILTER_DEBOUNCE_MS = 100;

    function selectOrThrow(selector) {
        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Required element not found: ${selector}`);
        }
        return element;
    }

    const outputContainer = selectOrThrow(".output-container");

    panel.el = {
        outputContainer,
        welcomeBox: outputContainer.children[0],
        header: selectOrThrow(".panel-header"),
        filterBox: selectOrThrow(".filter-box"),
        filterModeButton: selectOrThrow(".filter-mode"),
        copyAllButton: selectOrThrow(".copy-all"),
        compareButton: selectOrThrow(".compare-button"),
        settingsPane: selectOrThrow(".settings-pane"),
        settingsBody: selectOrThrow(".settings-body"),
        settingsScope: selectOrThrow(".settings-scope"),
        settingsImport: selectOrThrow(".settings-import"),
        settingsExport: selectOrThrow(".settings-export"),
        settingsReset: selectOrThrow(".settings-reset"),
        settingsClose: selectOrThrow(".settings-close"),
        moreButton: selectOrThrow(".more-button"),
        menu: selectOrThrow(".menu"),
        statStrip: selectOrThrow(".stat-strip"),
    };

    // Only render.js, menu.js and main.js write to this. Everything else is
    // handed what it renders, so it can be read without tracking what has run.
    panel.state = {
        lastResult: null,
        matchIndices: [],
        /** Whether a filter removes what does not match, or only marks what does. */
        hideUnmatched: true,
        compareMode: false,
    };
})();

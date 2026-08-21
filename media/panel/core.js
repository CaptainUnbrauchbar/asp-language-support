/**
 * The panel's scripts meet on a single AspPanel object rather than going through
 * a bundler. This file builds it and has to load first; the others extend it.
 * The load order lives in PANEL_SCRIPTS in src/webviewProvider.js.
 */
(function () {
    // panel replaced rather than extended
    const panel = {};
    window.AspPanel = panel;

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

    panel.state = {
        lastResult: null,
        matchIndices: [],
        hideUnmatched: true,
        compareMode: false,
    };
})();

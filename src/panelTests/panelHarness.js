/**
 * Runs the output panel's own script against a real DOM.
 *
 * media/main.js is the largest single piece of this extension and the only one
 * that never sees a Jest process: it lives in a webview, talks to the extension
 * over postMessage, and is loaded by VSCode rather than by require. That left
 * filtering, comparing, the statistics, the settings pane and every callout with
 * no test at all.
 *
 * The panel is loaded here exactly as VSCode loads it: the markup comes from
 * WebviewProvider rather than being copied into a fixture, so a control that is
 * renamed in the HTML fails these tests instead of quietly going missing, and
 * the script is the real file rather than a testable extract of it.
 *
 * Results are recorded clingo output from fixtures/, not a hand written shape.
 * See fixtures/generate.mjs.
 */
const { readFileSync } = require("fs");
const { join } = require("path");

/**
 * Stands in for the vscode module while the panel's HTML is built.
 *
 * A test file passes this to jest.mock, which cannot reach out to a helper for
 * anything but a require call, hence a function rather than a plain object.
 */
function vscodeStub() {
    return {
        Uri: { joinPath: (...parts) => ({ path: parts.map((part) => part.path ?? part).join("/") }) },
        window: { activeTextEditor: undefined },
        workspace: { getConfiguration: () => ({ get: () => false }) },
    };
}

/** A recorded clingo reply, as the solver produced it. @param {String} name */
function fixture(name) {
    return JSON.parse(readFileSync(join(__dirname, "fixtures", `${name}.json`), "utf8")).result;
}

/**
 * Grows a recorded result to a given number of answer sets.
 *
 * Only for the truncation rule, which is about how many answers there are and
 * not about what is in them. The smallest real program with more than the 500
 * the panel renders produces a third of a megabyte of JSON.
 * @param {Object} result A clingo result to take the shape from
 * @param {Number} total How many witnesses it should end up with
 */
function grownTo(result, total) {
    const witnesses = Array.from({ length: total }, (_, index) => ({ Value: [`a(${index})`] }));
    return { ...result, Call: [{ Witnesses: witnesses }], Models: { ...result.Models, Number: total } };
}

/**
 * Loads a fresh panel into the document.
 *
 * Every test gets its own: main.js keeps the last result, the filter mode and
 * the comparison in module state, so a shared panel would let one test decide
 * what the next one starts from.
 *
 * @returns {Object} Handles onto the panel: the messages it posted back, the
 *          state VSCode would have kept for it, and query helpers
 */
function loadPanel({ state = undefined } = {}) {
    // Required through the registry so the vscode mock a test installed applies
    const { WebviewProvider, PANEL_SCRIPTS } = require("../webviewProvider.js");

    /** @type {Object[]} */
    const posted = [];
    let webviewState = state;

    // Only the body: the harness supplies the document
    const html = new WebviewProvider({ path: "/ext" })._getHtmlForWebview({
        asWebviewUri: (uri) => `vscode-resource:${uri.path}`,
        cspSource: "vscode-webview://test",
    });
    document.body.innerHTML = html.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
    // The stylesheet is not loaded, so the [hidden] rules that main.js relies on
    // being able to flip have to start from the state the HTML declares
    document.body.querySelectorAll("[hidden]").forEach((element) => (element.hidden = true));

    // VSCode hands this back when it rebuilds the view, which is what makes a
    // panel survive being dragged to another position
    global.acquireVsCodeApi = () => ({
        postMessage: (message) => posted.push(message),
        setState: (value) => (webviewState = value),
        getState: () => webviewState,
    });

    // The same scripts the HTML above loads, in the same order, so the panel is
    // assembled here exactly as VSCode assembles it. Resetting the registry
    // first re-runs all of them, which is what gives each test a fresh panel.
    jest.resetModules();
    PANEL_SCRIPTS.forEach((name) => require(`../../media/${name}`));

    const one = (selector) => document.querySelector(selector);
    const all = (selector) => [...document.querySelectorAll(selector)];

    return {
        posted,
        /** What VSCode would have stored for a rebuild of this view. */
        savedState: () => webviewState,
        /** Delivers a message from the extension. */
        send: (message) => window.dispatchEvent(Object.assign(new window.Event("message"), { data: message })),
        one,
        all,
        /** Text of the first match, or "" so a missing element reads as empty. */
        text: (selector) => one(selector)?.textContent ?? "",
        header: () => one(".panel-header"),
        strip: () => one(".stat-strip"),
        output: () => one(".output-container"),
        filterBox: () => one(".filter-box"),
        answers: () => all(".atom-list"),
        atoms: () => all(".atom"),
        labels: () => all(".answer-label"),
        callouts: () => all("[class^='callout callout-']"),
        settingRows: () => all(".setting-row"),
        menuButtons: () => all(".menu-button"),
        /** Types into the filter box and waits out its debounce. */
        filter: async (query) => {
            const box = one(".filter-box");
            box.value = query;
            box.dispatchEvent(new window.Event("input"));
            await new Promise((resolve) => setTimeout(resolve, 200));
        },
        click: (selector) => one(selector).dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    };
}

module.exports = { loadPanel, vscodeStub, fixture, grownTo };

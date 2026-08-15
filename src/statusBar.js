/**
 * The Clingo status bar item.
 *
 * Which solver is in use is standing information, so it belongs in the status
 * bar rather than in a notification that pops up on every activation and has to
 * be silenced with a setting.
 */

/**
 * Reads the version out of anything clingo prints it into: the "Solver" field
 * of a WASM result, or the first line of the binary's own output.
 * @param {String} text
 * @returns {String | undefined} e.g. "5.8.1"
 */
function parseClingoVersion(text) {
    return String(text ?? "").match(/clingo version (\d[\w.+-]*)/i)?.[1];
}

/**
 * Whether the status bar item belongs on screen.
 *
 * This deliberately looks at every open document rather than only the active
 * editor. The extension is activated by opening an ASP file, and at that moment
 * window.activeTextEditor is usually not set yet while the editor is still being
 * restored, so relying on it alone leaves the item hidden until the user happens
 * to switch editors.
 * @param {*} activeEditor vscode.window.activeTextEditor
 * @param {Array} documents vscode.workspace.textDocuments
 * @returns {Boolean}
 */
function shouldShowStatusBar(activeEditor, documents = []) {
    return activeEditor?.document?.languageId === "asp" || documents.some((document) => document.languageId === "asp");
}

class ClingoStatusBar {
    /**
     * @param {*} vscode Reference to the vscode module (injected so this can be tested)
     * @param {*} item Optional pre-made status bar item, only used by tests
     */
    constructor(vscode, item = undefined) {
        this._vscode = vscode;
        this._item = item ?? vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        /** @type {"wasm" | "path" | "missing"} */
        this._solver = "wasm";
        this._version = undefined;
        this._running = false;
        this._visible = false;
        this._render();
    }

    /**
     * @param {"wasm" | "path" | "missing"} solver
     */
    setSolver(solver) {
        if (this._solver !== solver) {
            // the version belongs to the solver that reported it
            this._version = undefined;
        }
        this._solver = solver;
        this._render();
    }

    /**
     * Clingo only reports its version as part of a run, so the label starts out
     * generic and gets more precise once something has been solved.
     * @param {String | undefined} version
     */
    setVersion(version) {
        if (version && this._version !== version) {
            this._version = version;
            this._render();
        }
    }

    /** @param {Boolean} running */
    setRunning(running) {
        this._running = running;
        this._render();
    }

    /**
     * The item is only relevant while an ASP file is open.
     * @param {Boolean} visible
     */
    setVisible(visible) {
        this._visible = visible;
        if (visible) {
            this._item.show();
        } else {
            this._item.hide();
        }
    }

    /** The label describing the solver, e.g. "WASM 5.8.1". */
    _solverLabel() {
        const name = this._solver === "path" ? "PATH" : "WASM";
        return this._version ? `${name} ${this._version}` : name;
    }

    _render() {
        const item = this._item;

        if (this._running) {
            item.text = "$(sync~spin) Clingo: solving...";
            item.tooltip = "Clingo is solving - click to stop";
            item.command = "answer-set-programming-language-support.stopclingo";
            item.backgroundColor = undefined;
            return;
        }

        if (this._solver === "missing") {
            item.text = "$(error) Clingo: not found";
            item.tooltip = "Clingo was not found on your PATH - click to change the setting";
            item.command = {
                command: "workbench.action.openSettings",
                title: "Open settings",
                arguments: ["aspLanguage.usePathClingo"],
            };
            item.backgroundColor = new this._vscode.ThemeColor("statusBarItem.warningBackground");
            return;
        }

        item.text = `$(play) Clingo: ${this._solverLabel()}`;
        item.tooltip =
            this._solver === "path"
                ? "Using your own Clingo from PATH - click to compute all answer sets"
                : "Using the bundled WASM Clingo - click to compute all answer sets";
        item.command = "answer-set-programming-language-support.runinterminalall";
        item.backgroundColor = undefined;
    }

    dispose() {
        this._item.dispose();
    }
}

module.exports = { ClingoStatusBar, parseClingoVersion, shouldShowStatusBar };

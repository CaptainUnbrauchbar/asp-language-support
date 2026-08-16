const vscode = require("vscode");
const crypto = require("crypto");

/**
 * WebviewProvider class to manage the webview for the ASP extension.
 */
class WebviewProvider {
    /**
     * @param {*} _extensionUri
     * @param {*} settingsStore Optional hooks for the solver settings pane
     */
    constructor(_extensionUri, settingsStore = undefined) {
        this._extensionUri = _extensionUri;
        /** Every answer set of the last run, including those the webview did not receive. @type {String[][]} */
        this._answers = [];
        /** The last payload sent to the webview, replayed whenever a new webview appears. */
        this._lastMessage = undefined;
        /** Supplies and persists the settings the panel edits. */
        this._settingsStore = settingsStore;
    }

    /**
     * Sends a one-off instruction to the panel without remembering it, so it is
     * not replayed when the view is later rebuilt.
     * @param {Object} message
     */
    sendCommand(message) {
        this._view?.webview.postMessage(message);
    }

    /** Pushes the current solver settings into the panel. */
    sendSettings() {
        if (this._settingsStore && this._view) {
            this._view.webview.postMessage({ type: "updateSettings", ...this._settingsStore.describe() });
        }
    }

    get viewType() {
        return "ASP.aspView";
    }

    /**
     * Sends a payload to the webview and remembers it.
     *
     * Dragging the panel to another position does not merely hide the view, it
     * disposes the webview and builds a fresh one, so retainContextWhenHidden
     * cannot help there. Keeping the last payload here lets the new webview ask
     * for it as soon as its script is running, instead of coming up empty.
     * @param {Object} message
     */
    post(message) {
        this._lastMessage = message;
        this._view?.webview.postMessage(message);
    }

    /**
     * Stores the complete result of a run so that copying can offer every answer
     * set, not just the ones small enough to render.
     * @param {String[][]} answers
     */
    setAnswers(answers) {
        this._answers = answers;
    }

    /**
     * Copies text through the VSCode clipboard API. The webview's own
     * navigator.clipboard is unreliable there and fails without telling anyone.
     * The copy buttons confirm with a checkmark of their own, so this stays quiet.
     * @param {String} text
     */
    async _copy(text) {
        await vscode.env.clipboard.writeText(text);
    }

    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        // Registered before the HTML is set, so the webview's "ready" message
        // cannot arrive before anything is listening for it
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "ready": {
                    // The settings pane is part of the panel's furniture, so it is
                    // filled in whether or not there are results to restore
                    this.sendSettings();
                    // A freshly built webview starts on the welcome screen, so give
                    // it back whatever was on display before it was recreated. When
                    // it restored itself from its own state there is nothing to do,
                    // and resending would only discard the filter it just restored.
                    if (!data.hasState && this._lastMessage) {
                        webviewView.webview.postMessage(this._lastMessage);
                    }
                    break;
                }
                case "saveSettings": {
                    await this._settingsStore?.save(data.settings);
                    break;
                }
                case "resetSettings": {
                    await this._settingsStore?.reset();
                    this.sendSettings();
                    break;
                }
                case "importConfig": {
                    await this._settingsStore?.importFromConfig();
                    this.sendSettings();
                    break;
                }
                case "colorSelected": {
                    vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
                    break;
                }
                case "copyAnswer": {
                    const answer = this._answers[data.index];
                    if (answer) {
                        await this._copy(answer.join(", "));
                    }
                    break;
                }
                case "copyAll": {
                    if (this._answers.length) {
                        await this._copy(this._answers.map((atoms) => atoms.join(", ")).join("\n"));
                    }
                    break;
                }
                case "copyFiltered": {
                    const selected = (data.indices ?? []).map((index) => this._answers[index]).filter(Boolean);
                    if (selected.length) {
                        await this._copy(selected.map((atoms) => atoms.join(", ")).join("\n"));
                    }
                    break;
                }
                case "clearOutput": {
                    this.setAnswers([]);
                    // Also forget the payload, so a cleared panel does not come
                    // back to life when the view is moved
                    this._lastMessage = undefined;
                    break;
                }
            }
        });

        // Moving the panel disposes this view. Without dropping the reference the
        // extension keeps posting results into a webview nobody can see any more.
        webviewView.onDidDispose?.(() => {
            if (this._view === webviewView) {
                this._view = undefined;
            }
        });

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    /**
     * Returns the HTML content for the webview.
     * @param {*} webview Reference to the webview object
     * @returns
     */
    _getHtmlForWebview(webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "main.js"));
        // Do the same for the stylesheet.
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css"));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "main.css"));
        // Codicons are already a dependency of this extension and give the panel
        // the same icons VSCode uses everywhere else
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "node_modules", "@vscode", "codicons", "dist", "codicon.css")
        );
        const clingoSolver = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo")
            ? "your own version of Clingo from PATH"
            : "the bundled WASM Clingo Solver";
        // Use a nonce to only allow a specific script to be run.
        const nonce = this._getNonce();
        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${codiconUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<title>ASP Output</title>
			</head>
			<body>
            <header class="panel-header" hidden>
                <span class="stat-strip" role="status" aria-live="polite"></span>
                <button class="icon-button compare-button" title="Compare answer sets" aria-label="Compare answer sets" aria-pressed="false">
                    <i class="codicon codicon-git-compare" aria-hidden="true"></i>
                </button>
                <div class="filter-field">
                    <i class="codicon codicon-search" aria-hidden="true"></i>
                    <input class="filter-box" type="search" placeholder="Filter atoms" aria-label="Filter atoms">
                    <button class="icon-button filter-mode" title="Hiding answers without a match. Click to keep them and only highlight." aria-label="Hide answers without a match" aria-pressed="true">
                        <i class="codicon codicon-filter" aria-hidden="true"></i>
                    </button>
                </div>
                <button class="icon-button copy-all" title="Copy all answer sets" aria-label="Copy all answer sets">
                    <i class="codicon codicon-copy" aria-hidden="true"></i>
                </button>
                <div class="menu-anchor">
                    <button class="icon-button more-button" title="More actions" aria-label="More actions" aria-haspopup="true" aria-expanded="false">
                        <i class="codicon codicon-ellipsis" aria-hidden="true"></i>
                    </button>
                    <ul class="menu" role="menu" hidden></ul>
                </div>
            </header>
            <section class="settings-pane" hidden aria-label="Solver settings">
                <div class="settings-intro">
                    <strong>Solver settings</strong>
                    <span class="settings-scope"></span>
                </div>
                <div class="settings-body"></div>
                <div class="settings-actions">
                    <button class="settings-close settings-primary">Done</button>
                    <button class="settings-import">Import from config.json</button>
                    <button class="settings-reset">Reset to defaults</button>
                </div>
            </section>
            <div class="output-container">
                <textarea class="output-box welcome-box" rows="10" readonly>
Welcome to Clingo!
Using ${clingoSolver}.

> Use the buttons in the top right to compute all sets, a single set or a config file.
> Click the copy icon next to an answer to copy it to the clipboard.
> Once you have results, use the filter box to narrow them down.</textarea>
            </div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }

    _getNonce() {
        return crypto.randomBytes(32).toString("base64");
    }
}

exports.WebviewProvider = WebviewProvider;

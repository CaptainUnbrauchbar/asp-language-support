const vscode = require("vscode");
const crypto = require("crypto");

/**
 * The panel's scripts, relative to media/ and in the order they have to load.
 */
const PANEL_SCRIPTS = [
    "panel/core.js",
    "panel/dom.js",
    "panel/stats.js",
    "panel/answers.js",
    "panel/settings.js",
    "panel/menu.js",
    "panel/render.js",
    "main.js",
];

class WebviewProvider {
    /**
     * @param {*} _extensionUri
     * @param {*} settingsStore Optional hooks for the solver settings pane
     */
    constructor(_extensionUri, settingsStore = undefined) {
        this._extensionUri = _extensionUri;
        /** @type {String[][]} */
        this._answers = [];
        this._lastMessage = undefined;
        this._settingsStore = settingsStore;
    }

    /**
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
     * @param {Object} message
     */
    post(message) {
        this._lastMessage = message;
        this._view?.webview.postMessage(message);
    }

    /**
     * Stores the complete result of a run so that copying can offer every answer set
     * @param {String[][]} answers
     */
    setAnswers(answers) {
        this._answers = answers;
    }

    /**
     * Copies text through the VSCode clipboard API
     * @param {String} text
     */
    async _copy(text) {
        await vscode.env.clipboard.writeText(text);
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "ready": {
                    this.sendSettings();
                    // A freshly built webview should always start on the welcome screen
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
                case "exportConfig": {
                    await this._settingsStore?.exportToConfig();
                    break;
                }
                case "copyAnswer": {
                    const answer = this._answers[data.index];
                    if (answer) {
                        await this._copy(answer.join(", "));
                    }
                    break;
                }
                case "copyText": {
                    if (data.text) {
                        await this._copy(data.text);
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
                    this._lastMessage = undefined;
                    break;
                }
            }
        });


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
     * @returns {String}
     */
    _getHtmlForWebview(webview) {
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css"));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "main.css"));
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "node_modules", "@vscode", "codicons", "dist", "codicon.css")
        );
        const clingoSolver = vscode.workspace.getConfiguration("aspLanguage").get("usePathClingo")
            ? "your own version of Clingo from PATH"
            : "the bundled WASM Clingo Solver";
        const nonce = this._getNonce();
        // One tag per panel script, in load order
        const scriptTags = PANEL_SCRIPTS.map((name) => {
            const uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", ...name.split("/")));
            return `<script nonce="${nonce}" src="${uri}"></script>`;
        }).join("\n\t\t\t");
        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!-- Styles only from the extension directory, scripts only with the nonce above -->
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
                    <button class="settings-export">Export to config.json</button>
                    <button class="settings-reset">Reset to defaults</button>
                </div>
            </section>
            <div class="output-container">
                <textarea class="output-box welcome-box" rows="10" readonly>
Welcome to Clingo!
Using ${clingoSolver}.

> Use the buttons in the top right to compute all answer sets or just the first one.
> The gear next to them holds the solver settings: limits, constants, extra files and more.
> Click the copy icon next to an answer to copy it to the clipboard.
> Once you have results, use the filter box to narrow them down.</textarea>
            </div>
			${scriptTags}
			</body>
			</html>`;
    }

    _getNonce() {
        return crypto.randomBytes(32).toString("base64");
    }
}

exports.WebviewProvider = WebviewProvider;
exports.PANEL_SCRIPTS = PANEL_SCRIPTS;

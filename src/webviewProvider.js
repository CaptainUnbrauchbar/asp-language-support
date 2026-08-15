const vscode = require("vscode");
const crypto = require("crypto");

/**
 * WebviewProvider class to manage the webview for the ASP extension.
 */
class WebviewProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        /** Every answer set of the last run, including those the webview did not receive. @type {String[][]} */
        this._answers = [];
    }

    get viewType() {
        return "ASP.aspView";
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
     * @param {String} text
     * @param {String} description What was copied, for the confirmation message
     */
    async _copy(text, description) {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(`Copied ${description} to the clipboard.`);
    }

    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "colorSelected": {
                    vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
                    break;
                }
                case "copyAnswer": {
                    const answer = this._answers[data.index];
                    if (answer) {
                        await this._copy(answer.join(", "), `answer ${data.index + 1}`);
                    }
                    break;
                }
                case "copyAll": {
                    if (this._answers.length) {
                        await this._copy(
                            this._answers.map((atoms) => atoms.join(", ")).join("\n"),
                            `all ${this._answers.length} answer sets`
                        );
                    }
                    break;
                }
            }
        });
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
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<title>ASP Output</title>
			</head>
			<body>
            <div class="toolbar" hidden>
                <input class="filter-box" type="search" placeholder="Filter atoms, e.g. sudoku(1," aria-label="Filter atoms">
                <button class="copy-all" title="Copy every answer set">Copy all</button>
                <span class="summary" role="status" aria-live="polite"></span>
            </div>
            <div class="output-container">
                <textarea class="output-box" readonly>
Welcome to Clingo!
Using ${clingoSolver}.

> Use the buttons in the top right to compute all sets, a single set or a config file.
> Click the button above each answer to copy its content to the clipboard.
> Once you have results, use the filter box to narrow them down.
                </textarea>
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

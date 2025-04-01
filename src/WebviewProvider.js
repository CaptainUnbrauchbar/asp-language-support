const vscode = require("vscode");
const crypto = require("crypto");

class WebviewProvider {
  constructor(_extensionUri) {
    this._extensionUri = _extensionUri;
  }

  get viewType() {
    return "ASP.aspView";
  }

  resolveWebviewView(webviewView, _context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "colorSelected": {
          vscode.window.activeTextEditor?.insertSnippet(
            new vscode.SnippetString(`#${data.value}`)
          );
          break;
        }
      }
    });
  }

  _getHtmlForWebview(webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );
    // Do the same for the stylesheet.
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.css")
    );
    const clingoSolver = vscode.workspace
      .getConfiguration("aspLanguage")
      .get("usePathClingo")
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

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<title>ASP Output</title>
			</head>
			<body>
            <div class="output-container">
                <textarea class="output-box" readonly>
Welcome to Clingo!
Using ${clingoSolver}.

> Use the buttons in the top right to compute all sets, a single set or a config file.
> Click the button above each answer to copy its content to the clipboard.
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

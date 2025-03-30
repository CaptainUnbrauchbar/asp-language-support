const vscode = require('vscode');
const which = require('which');
const { dirname,join } = require('path');
const fs = require('fs');
const { readConfig } = require('./configReader.js');
const clingo = require('clingo-wasm');

class WebviewProvider {

	constructor(_extensionUri) {
		this._extensionUri = _extensionUri;
	}
	resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'colorSelected':
                    {
                        vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
                        break;
                    }
            }
        });
    }
	_getHtmlForWebview(webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        // Do the same for the stylesheet.
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();
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
					<textarea class="output-box" readonly></textarea>
				</div>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}

WebviewProvider.viewType = 'ASP.aspView';

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * @param {vscode.ExtensionContext} context Context of VSCode
 */
function activate(context) {

	const provider = new WebviewProvider(context.extensionUri);

	async function runClingoWasmForFile(filePath, models = undefined, options = undefined) {
		try {
			// Validate the file path
			if (!fs.existsSync(filePath)) {
				vscode.window.showErrorMessage(`File not found: ${filePath}`);
				return null;
			}

			// Read the main file content
			let fileContent = fs.readFileSync(filePath, 'utf8');
			if (!fileContent.trim()) {
				vscode.window.showErrorMessage(`File is empty: ${filePath}`);
				return null;
			}

			// Read and merge contents of additional files
			const additionalFiles = options?.filter(arg => arg && !arg.startsWith("--"))
				.map(filePath => filePath.replace(/"/g, ''));

			if (additionalFiles?.length) {
				additionalFiles.forEach(additionalFilePath => {
					if (fs.existsSync(additionalFilePath)) {
						const additionalContent = fs.readFileSync(additionalFilePath, 'utf8');
						if (additionalContent.trim()) {
							fileContent += `\n${additionalContent}`;
						} else {
							vscode.window.showWarningMessage(`Additional file is empty: ${additionalFilePath}`);
						}
					} else {
						vscode.window.showWarningMessage(`Additional file not found: ${additionalFilePath}`);
					}
				});
			}

			// Filter options for Clingo
			const clingoOptions = options?.filter(arg => arg.startsWith("--")) ?? [];

			// Run Clingo WASM
			const wasmResult = await clingo.run(fileContent, models, clingoOptions);

			// Validate the result
			if (!wasmResult || typeof wasmResult !== 'object') {
				vscode.window.showErrorMessage(`Invalid result from Clingo WASM.`);
				return null;
			}

			return wasmResult;
		} catch (error) {
			// Log and display errors
			console.error(`Error in runClingoWasmForFile: ${error.message}`, error);
			vscode.window.showErrorMessage(`Error reading file or running Clingo WASM: ${error.message}`);
			return null;
		}
	}

	function printWasmResult(result) {
		return ` 
	Solver: ${result.Solver}
	Models: ${result.Models.Number} (${result.Models.More})
	Calls: ${result.Calls}
	
	Answers:
	${result.Call.flatMap(call => 
		call.Witnesses.map((witness, wIndex) => 
			`Answer ${wIndex + 1}:\n${witness.Value.join(', ')}`
		)
	).join('\n\n')}
	
	Result: ${result.Result}
	Time (Total/Solve/Model): ${result.Time.Total}s / ${result.Time.Solve}s / ${result.Time.Model}s
	`;
	}

	function formatWasmResult(result) {
		return {
			solver: result.Solver,
			models: `${result.Models.Number} (${result.Models.More})`,
			calls: result.Calls,
			time: {
				total: result.Time.Total,
				solve: result.Time.Solve,
				model: result.Time.Model
			},
			answers: result.Call.flatMap(call =>
				call.Witnesses.map(witness => witness.Value.join(', '))
			),
			result: result.Result
		};
	}

	//Function to set path to system PATH if configuration option aspLanguage.usePathClingo is enabled
	function usePath() {
		if (usePathClingo) {
			try {
				path = which.sync("clingo");
				if (!turnMessagesOff) {
					vscode.window.showInformationMessage("Using your own version of Clingo: \"" + path + "\"    (this message can be turned off in options)");
				}
			} catch (e) {
				vscode.window.showErrorMessage("Clingo was not found on your PATH. Disable the 'usePathClingo' option to use the bundled version of Clingo");
			}
		}
		else {
			if (!turnMessagesOff) {
				vscode.window.showInformationMessage("Using bundled version of Clingo!    (this message can be turned off in options)");
			}
		}
	}

	var terminal = vscode.window.createTerminal("ASP Terminal " + (vscode.window).terminals.length);
	var newTerminal = vscode.workspace.getConfiguration('aspLanguage').get("terminalMode");
	var turnMessagesOff = vscode.workspace.getConfiguration('aspLanguage').get("turnMessagesOff");
	var usePathClingo = vscode.workspace.getConfiguration('aspLanguage').get("usePathClingo");
	var additionalArgs = vscode.workspace.getConfiguration('aspLanguage').get("additionalArgs");
	var setConfig = vscode.workspace.getConfiguration('aspLanguage').get("setConfig");
	var path;
	var terminalType = vscode.workspace.getConfiguration('terminal').get("integrated.defaultProfile.windows");

	//double if to prevent unnecessary info messages
	if (usePathClingo) {
		usePath()
	}

	function createTerminal() {
		if (newTerminal || ((vscode.window).terminals.filter(terminal=>terminal.name === "ASP Terminal").length === 0)) {
			terminal = vscode.window.createTerminal("ASP Terminal");
		}
	} 

	function getPath() {
		if (terminalType === "Git Bash") {
			return `"${path}"`
		} 
		else {
			return `${path}`
		}
	}

	const computeAllSetsCommand = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalall', async function () {
		if (usePathClingo) {
			createTerminal();
			terminal.show();
			terminal.sendText(`${getPath()} "${vscode.window.activeTextEditor.document.fileName}" 0`);
		} else {
			const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, 0);
			const answers = formatWasmResult(clingoResult);
			provider._view?.webview.postMessage({ type: 'updateOutput', answers });
		}
	});

	const computeSingleSetCommand = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalsingle', async function () {
		if (usePathClingo) {
			createTerminal();
			terminal.show();
			terminal.sendText(`${getPath()} "${vscode.window.activeTextEditor.document.fileName}" 1`);
		} else {
			const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, 1);
			const answers = formatWasmResult(clingoResult);
			provider._view?.webview.postMessage({ type: 'updateOutput', answers });
		}
	});

	const computeConfigCommand = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalconfig', async function () {
		createTerminal();

		if (fs.existsSync(join(dirname(vscode.window.activeTextEditor.document.fileName), setConfig))) {
			if (usePathClingo) {
				createTerminal();
				additionalArgs = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath("")).join(" ");

				terminal.show();
				terminal.sendText(`${getPath()} "${vscode.window.activeTextEditor.document.fileName}" ${additionalArgs}`);
			} else {
				createTerminal();
				
				additionalArgs = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath(""));
				const models = additionalArgs.find(arg => arg.startsWith("--models")).split(" ")[1]
				additionalArgs = additionalArgs.filter(arg => !arg.startsWith("--models"))

				const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, parseInt(models), additionalArgs);
				const answers = formatWasmResult(clingoResult);
				provider._view?.webview.postMessage({ type: 'updateOutput', answers });
			}
		}
		else {
			const chosenOption = Promise.resolve(vscode.window.showInformationMessage(`Could not find config File ${setConfig} in working directory. Do you want to create a new config?`,"Yes","No"));
			chosenOption.then(function(value) {
				if (value === "Yes") {
					vscode.commands.executeCommand("answer-set-programming-language-support.initClingoConfig");
					vscode.window.showInformationMessage(`Config config.json created in working directory!`);
				}
			});
		}
	});

	const initClingoConfig = vscode.commands.registerCommand('answer-set-programming-language-support.initClingoConfig', function () {
		createTerminal();

		const sampleConfig = fs.readFileSync(join(context.asAbsolutePath(""), `sampleConfig.json`));
		fs.writeFileSync(join(dirname(vscode.window.activeTextEditor.document.fileName), `config.json`), sampleConfig);
		
		vscode.workspace.getConfiguration('aspLanguage').update("setConfig", "config.json");
	});

	context.subscriptions.push(vscode.window.registerWebviewViewProvider(WebviewProvider.viewType, provider));
	context.subscriptions.push(computeAllSetsCommand);
	context.subscriptions.push(computeSingleSetCommand);
	context.subscriptions.push(computeConfigCommand);
	context.subscriptions.push(initClingoConfig);

	//Listeners for Configuration Options 
	vscode.workspace.onDidChangeConfiguration(event => {
        const confTerminalMode = event.affectsConfiguration("aspLanguage.terminalMode");
		const confTurnMessagesOff = event.affectsConfiguration("aspLanguage.turnMessagesOff");
		const confUsePathClingo = event.affectsConfiguration("aspLanguage.usePathClingo");
		const confSetConfig = event.affectsConfiguration("aspLanguage.setConfig");
		const confTerminalProfile = event.affectsConfiguration("terminal.integrated.defaultProfile.windows");

        if (confTerminalMode) {
			newTerminal = vscode.workspace.getConfiguration('aspLanguage').get("terminalMode");
        } 
		if (confTurnMessagesOff) {
			turnMessagesOff = vscode.workspace.getConfiguration('aspLanguage').get("turnMessagesOff");
        }
		if (confUsePathClingo) {
			usePathClingo = vscode.workspace.getConfiguration('aspLanguage').get("usePathClingo");
			usePath()
        }
		if (confSetConfig) {
			setConfig = vscode.workspace.getConfiguration('aspLanguage').get("setConfig");
        }
		if (confTerminalProfile) {
			terminalType = vscode.workspace.getConfiguration('terminal').get("integrated.defaultProfile.windows");
        }

	})
}

// this method is called when your extension is deactivated
function deactivate() {

}

module.exports = {
	activate,
	deactivate
}

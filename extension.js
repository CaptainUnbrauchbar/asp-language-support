const vscode = require('vscode');
const which = require('which');
const { dirname, join } = require('path');
const fs = require('fs');
const { readConfig } = require('./configReader.js');
const clingo = require('clingo-wasm');
const { spawn } = require('child_process');
const crypto = require("crypto");

//E_SAT       = 10, !< At least one model was found.
//E_EXHAUST   = 20, !< Search-space was completely examined. 
//E_SAT & E_EXHASUT = 30
const CLINGO_SUCCESS_CODES = [10, 20, 30];

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
		const clingoSolver = vscode.workspace.getConfiguration('aspLanguage').get("usePathClingo") ? "your own version of Clingo from PATH" : "the bundled WASM Clingo Solver";
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
}

WebviewProvider.viewType = 'ASP.aspView';

function getNonce() {
	return crypto.randomBytes(32).toString("base64");
}

/**
 * @param {vscode.ExtensionContext} context Context of VSCode
 */
function activate(context) {

	const provider = new WebviewProvider(context.extensionUri);

	async function runClingoWasmForFile(filePath, models = undefined, options = undefined) {
		return await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: "Clingo is running",
		}, async (progress) => {

			progress.report({ increment: 0, message: "Starting Clingo..." });

			let fileContent;
			fileContent = await fs.promises.readFile(filePath, 'utf8');

			const additionalFiles = options?.filter(arg => arg && !arg.startsWith("--"))
				.map(filePath => filePath.replace(/"/g, ''));

			if (additionalFiles?.length) {
				for (const additionalFilePath of additionalFiles) {
					await fs.promises.access(additionalFilePath);
					const additionalContent = await fs.promises.readFile(additionalFilePath, 'utf8');
					if (additionalContent.trim()) {
						fileContent += `\n${additionalContent}`;
					} else {
						vscode.window.showWarningMessage(`Additional file is empty: ${additionalFilePath}`);
					}
				}
			}

			// Filter options for Clingo
			const clingoOptions = options?.filter(arg => arg.startsWith("--"));

			// Remove all sections starting with % and ending with \r\n
			fileContent = fileContent.replace(/%.*?\r\n/g, '');

			progress.report({ increment: 50, message: "Running Clingo WASM..." });

			// Run Clingo WASM with timeout
			const wasmResult = await clingo.run(fileContent, models, clingoOptions);

			progress.report({ increment: 100, message: "Clingo finished successfully!" });
			// Validate the result
			if (wasmResult.Result === "ERROR") {
				vscode.window.showErrorMessage(`Clingo WASM Error: ${wasmResult.Error}`);
				return null;
			} else {
				return wasmResult;
			}
		});
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
		if (newTerminal || ((vscode.window).terminals.filter(terminal => terminal.name === "ASP Terminal").length === 0)) {
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
		if (!vscode.window.activeTextEditor) {
			vscode.window.showErrorMessage("No active text editor found. Please open a file to run Clingo on.");
		} else {
			if (usePathClingo) {
				const command = getPath();
				const args = [`"${vscode.window.activeTextEditor.document.fileName}"`, "0"];
				const process = spawn(command, args, { shell: true });

				let output = '';
				let errorOutput = '';

				process.stdout.on('data', (data) => {
					output += data.toString();
				});

				process.stderr.on('data', (data) => {
					errorOutput += data.toString();
				});

				process.on('close', (code) => {
					if (CLINGO_SUCCESS_CODES.includes(code)) {
						provider._view?.webview.postMessage({ type: 'updateOutputString', answers: output });
					} else {
						vscode.window.showErrorMessage(`Clingo process exited with code ${code}: ${errorOutput}`);
					}
				});
			} else {
				const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, 0);
				const answers = formatWasmResult(clingoResult);
				provider._view?.webview.postMessage({ type: 'updateOutput', answers });
			}
		}
	});

	const computeSingleSetCommand = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalsingle', async function () {
		if (!vscode.window.activeTextEditor) {
			vscode.window.showErrorMessage("No active text editor found. Please open a file to run Clingo on.");
		} else {
			if (usePathClingo) {
				const command = getPath();
				const args = [`"${vscode.window.activeTextEditor.document.fileName}"`, "1"];
				const process = spawn(command, args, { shell: true });

				let output = '';
				let errorOutput = '';

				process.stdout.on('data', (data) => {
					output += data.toString();
				});

				process.stderr.on('data', (data) => {
					errorOutput += data.toString();
				});

				process.on('close', (code) => {
					if (CLINGO_SUCCESS_CODES.includes(code)) {
						provider._view?.webview.postMessage({ type: 'updateOutputString', answers: output });
					} else {
						vscode.window.showErrorMessage(`Clingo process exited with code ${code}: ${errorOutput}`);
					}
				});
			} else {
				const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, 1);
				const answers = formatWasmResult(clingoResult);
				provider._view?.webview.postMessage({ type: 'updateOutput', answers });
			}
		}
	});

	const computeConfigCommand = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalconfig', async function () {
		if (!vscode.window.activeTextEditor) {
			vscode.window.showErrorMessage("No active text editor found. Please open a file to run Clingo on.");
		} else {
			if (fs.existsSync(join(dirname(vscode.window.activeTextEditor.document.fileName), setConfig))) {
				if (usePathClingo) {
					additionalArgs = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath(""));

					const command = getPath();
					const args = [`"${vscode.window.activeTextEditor.document.fileName}"`, ...additionalArgs];
					const process = spawn(command, args, { shell: true });

					let output = '';
					let errorOutput = '';

					process.stdout.on('data', (data) => {
						output += data.toString();
					});

					process.stderr.on('data', (data) => {
						errorOutput += data.toString();
					});

					process.on('close', (code) => {
						if (CLINGO_SUCCESS_CODES.includes(code)) {
							provider._view?.webview.postMessage({ type: 'updateOutputString', answers: output });
						} else {
							vscode.window.showErrorMessage(`Clingo process exited with code ${code}: ${errorOutput}`);
						}
					});
				} else {
					const cfgFile = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath(""));
					const models = cfgFile.find(arg => arg.startsWith("--models")).split(" ")[1];
					additionalArgs = cfgFile.filter(arg => !arg.startsWith("--models"));

					const clingoResult = await runClingoWasmForFile(vscode.window.activeTextEditor.document.fileName, parseInt(models), additionalArgs);
					const answers = formatWasmResult(clingoResult);
					provider._view?.webview.postMessage({ type: 'updateOutput', answers, cfgFile });
				}
			} else {
				const chosenOption = Promise.resolve(vscode.window.showInformationMessage(`Could not find config File ${setConfig} in working directory. Do you want to create a new config?`, "Yes", "No"));
				chosenOption.then(function (value) {
					if (value === "Yes") {
						vscode.commands.executeCommand("answer-set-programming-language-support.initClingoConfig");
						vscode.window.showInformationMessage(`Config config.json created in working directory!`);
					}
				});
			}
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

			// Refresh the webview HTML
			if (provider._view) {
				provider._view.webview.html = provider._getHtmlForWebview(provider._view.webview);
			}
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

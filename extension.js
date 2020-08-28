// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

function detectOS() {
	switch (process.platform) {
		case "darwin": return "MacOS";
		case "win32": return "Windows";
		default: return "Linux";
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	//console.log('Congratulations, your extension "answer-set-programming-language-support" is now active!');
	var terminal = vscode.window.createTerminal("ASP Terminal " + (vscode.window).terminals.length);
	var os = vscode.workspace.getConfiguration('aspLanguage').get("selectOperatingSystem");
	var newTerminal = vscode.workspace.getConfiguration('aspLanguage').get("terminalMode");
	var n = (vscode.window).terminals.length;

	if (os === "auto" || os === "Auto") {
		os = detectOS();
	}

	if (os == "windows" || os == "Windows") {
		var path = context.asAbsolutePath("clingo_win.exe");
	}
	else if (os == "macOS" || os == "MacOS") {
		var path = context.asAbsolutePath("clingo_mac");
	}
	else if (os == "linux" || os == "Linux") {
		var path = context.asAbsolutePath("clingo_linux");
	}

	let disposable = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalall', function () {
		var newTerminal = vscode.workspace.getConfiguration('aspLanguage').get("terminalMode");
		if (newTerminal == true) {
			n = (vscode.window).terminals.length + 1;
			terminal = vscode.window.createTerminal("ASP Terminal");

		}
		if ((vscode.window).terminals.length === 0) {
			n = (vscode.window).terminals.length + 1;
			terminal = vscode.window.createTerminal("ASP Terminal");

		}
		//vscode.window.showInformationMessage("Running in Terminal " + n + " ...");
		terminal.show();
		terminal.sendText(path + " " + vscode.window.activeTextEditor.document.fileName + " 0");
	});

	let disposable2 = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalsingle', function () {
		var newTerminal = vscode.workspace.getConfiguration('aspLanguage').get("terminalMode");
		if (newTerminal == true) {
			n = (vscode.window).terminals.length + 1;

			terminal = vscode.window.createTerminal("ASP Terminal");

		}
		if ((vscode.window).terminals.length === 0) {
			n = (vscode.window).terminals.length + 1;
			terminal = vscode.window.createTerminal("ASP Terminal");
			
		}
		//vscode.window.showInformationMessage("Running in Terminal " + n + " ...");
		terminal.show();
		terminal.sendText(path + " " + vscode.window.activeTextEditor.document.fileName);
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(disposable2);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}

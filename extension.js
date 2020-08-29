// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const which = require('which');

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
	
	// Function to set path to clingo executeable (called every time config is changed)
	function getNewPath() {
		if (os === "auto" || os === "Auto") {
			os = detectOS();
		}
		if (os == "windows" || os == "Windows") {
			path = context.asAbsolutePath("clingo_win.exe");
		}
		else if (os == "macOS" || os == "MacOS") {
			path = context.asAbsolutePath("clingo_mac");
		}
		else if (os == "linux" || os == "Linux") {
			path = context.asAbsolutePath("clingo_linux");
		}
	}

	//Function to set path to system PATH if configuration option aspLanguage.usePathClingo is enabled
	function usePath() {
		if (usePathClingo) {
			try {
				path = which.sync("clingo");
				if (!turnMessagesOff) {
					vscode.window.showInformationMessage("Using your own version of Clingo: \"" + path + "\"   (this message can be turned off in options)");
				}
			} catch (e) {
				vscode.window.showErrorMessage("Clingo was not found on your PATH. Disable the 'usePathClingo' option to use the bundled version of Clingo");
			}
		}
		else {
			getNewPath()
			if (!turnMessagesOff) {
				vscode.window.showInformationMessage("Using bundled version of Clingo!   (this message can be turned off in options)");
			}
		}
	}

	//console.log('Congratulations, your extension "answer-set-programming-language-support" is now active!');
	var terminal = vscode.window.createTerminal("ASP Terminal " + (vscode.window).terminals.length);
	var os = vscode.workspace.getConfiguration('aspLanguage').get("selectOperatingSystem");
	var newTerminal = vscode.workspace.getConfiguration('aspLanguage').get("terminalMode");
	var turnMessagesOff = vscode.workspace.getConfiguration('aspLanguage').get("turnMessagesOff");
	var usePathClingo = vscode.workspace.getConfiguration('aspLanguage').get("usePathClingo");

	var path;
	var n = (vscode.window).terminals.length;

	getNewPath()

	//double if to prevent unnecessary info messages
	if (usePathClingo) {
		usePath()
	}

	let disposable = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalall', function () {
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

	//Listeners for Configuration Options 
	vscode.workspace.onDidChangeConfiguration(event => {
        let affected = event.affectsConfiguration("aspLanguage.selectOperatingSystem");
        if (affected) {
			os = vscode.workspace.getConfiguration('aspLanguage').get("selectOperatingSystem");
			getNewPath()
        }
	})

	vscode.workspace.onDidChangeConfiguration(event => {
        let affected = event.affectsConfiguration("aspLanguage.terminalMode");
        if (affected) {
			newTerminal = vscode.workspace.getConfiguration('aspLanguage').get("terminalMode");
        }
	})

	vscode.workspace.onDidChangeConfiguration(event => {
        let affected = event.affectsConfiguration("aspLanguage.turnMessagesOff");
        if (affected) {
			turnMessagesOff = vscode.workspace.getConfiguration('aspLanguage').get("turnMessagesOff");
        }
	})
	
	vscode.workspace.onDidChangeConfiguration(event => {
        let affected = event.affectsConfiguration("aspLanguage.usePathClingo");
        if (affected) {
			usePathClingo = vscode.workspace.getConfiguration('aspLanguage').get("usePathClingo");
			usePath()
        }
    })

}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {

}

module.exports = {
	activate,
	deactivate
}

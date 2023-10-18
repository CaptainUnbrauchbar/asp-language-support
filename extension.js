const vscode = require('vscode');
const which = require('which');
const { dirname } = require('path');
const fs = require('fs');
const { readConfig } = require('./configReader.js');

/**
 * Auto detecs the users operating System
 * @returns String with name of Operating System
 */
function detectOS() {
	switch (process.platform) {
		case "darwin": return "MacOS";
		case "win32": return "Windows";
		default: return "Linux";
	}
}

/**
 * @param {vscode.ExtensionContext} context Context of VSCode
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
					vscode.window.showInformationMessage("Using your own version of Clingo: \"" + path + "\"    (this message can be turned off in options)");
				}
			} catch (e) {
				vscode.window.showErrorMessage("Clingo was not found on your PATH. Disable the 'usePathClingo' option to use the bundled version of Clingo");
			}
		}
		else {
			getNewPath()
			if (!turnMessagesOff) {
				vscode.window.showInformationMessage("Using bundled version of Clingo!    (this message can be turned off in options)");
			}
		}
	}

	//console.log('Congratulations, your extension "answer-set-programming-language-support" is now active!');
	var terminal = vscode.window.createTerminal("ASP Terminal " + (vscode.window).terminals.length);
	var os = vscode.workspace.getConfiguration('aspLanguage').get("selectOperatingSystem");
	var newTerminal = vscode.workspace.getConfiguration('aspLanguage').get("terminalMode");
	var turnMessagesOff = vscode.workspace.getConfiguration('aspLanguage').get("turnMessagesOff");
	var usePathClingo = vscode.workspace.getConfiguration('aspLanguage').get("usePathClingo");
	var additionalArgs = vscode.workspace.getConfiguration('aspLanguage').get("additionalArgs");
	var setConfig = vscode.workspace.getConfiguration('aspLanguage').get("setConfig");
	var path;
	var terminalType = vscode.workspace.getConfiguration('terminal').get("integrated.defaultProfile.windows");

	getNewPath();

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

	const computeAllSetsCommand = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalall', function () {
		createTerminal();

		terminal.show();
		terminal.sendText(`${getPath()} "${vscode.window.activeTextEditor.document.fileName}" 0`);
	});

	const computeSingleSetCommand = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalsingle', function () {
		createTerminal();

		terminal.show();
		terminal.sendText(`${getPath()} "${vscode.window.activeTextEditor.document.fileName}"`);
	});

	const computeConfigCommand = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalconfig', function () {
		createTerminal();

		if (fs.existsSync(`${dirname(vscode.window.activeTextEditor.document.fileName)}/${setConfig}`)) {
			additionalArgs = readConfig(setConfig, turnMessagesOff, context.asAbsolutePath(""));

			terminal.show();
			terminal.sendText(`${getPath()} "${vscode.window.activeTextEditor.document.fileName}" ${additionalArgs}`);
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

		const sampleConfig = fs.readFileSync(`${context.asAbsolutePath("")}/sampleConfig.json`);
		fs.writeFileSync(`${dirname(vscode.window.activeTextEditor.document.fileName)}/config.json`, sampleConfig);
		
		vscode.workspace.getConfiguration('aspLanguage').update("setConfig", "config.json");
	});

	context.subscriptions.push(computeAllSetsCommand);
	context.subscriptions.push(computeSingleSetCommand);
	context.subscriptions.push(computeConfigCommand);
	context.subscriptions.push(initClingoConfig);

	//Listeners for Configuration Options 
	vscode.workspace.onDidChangeConfiguration(event => {
		const confOperatingSystem = event.affectsConfiguration("aspLanguage.selectOperatingSystem");
        const confTerminalMode = event.affectsConfiguration("aspLanguage.terminalMode");
		const confTurnMessagesOff = event.affectsConfiguration("aspLanguage.turnMessagesOff");
		const confUsePathClingo = event.affectsConfiguration("aspLanguage.usePathClingo");
		const confSetConfig = event.affectsConfiguration("aspLanguage.setConfig");
		const confTerminalProfile = event.affectsConfiguration("terminal.integrated.defaultProfile.windows");

		if (confOperatingSystem) {
			os = vscode.workspace.getConfiguration('aspLanguage').get("selectOperatingSystem");
			getNewPath()
        }
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

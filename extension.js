// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

const vscode = require('vscode');
const which = require('which');
const { fstat, readFile, readFileSync } = require('fs');
const path = require('path');
const cp = require('child_process');

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
			clingPath = context.asAbsolutePath("clingo_win.exe");
		}
		else if (os == "macOS" || os == "MacOS") {
			clingPath = context.asAbsolutePath("clingo_mac");
		}
		else if (os == "linux" || os == "Linux") {
			clingPath = context.asAbsolutePath("clingo_linux");
		}
	}

	//Function to set path to system PATH if configuration option aspLanguage.usePathClingo is enabled
	function usePath() {
		if (usePathClingo) {
			try {
				clingPath = which.sync("clingo");
				if (!turnMessagesOff) {
					vscode.window.showInformationMessage("Using your own version of Clingo: \"" + clingPath + "\"   (this message can be turned off in options)");
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

	var clingPath;
	var n = (vscode.window).terminals.length;

	getNewPath()

	//double if to prevent unnecessary info messages
	if (usePathClingo) {
		usePath()
	}

	let sidepanelDisp = vscode.commands.registerCommand('answer-set-programming-language-support.interactiveWindow', function () {

		const panel = vscode.window.createWebviewPanel(
			'aspPanel',
			'ASP Interactive Window',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'assets'))]
			}
		);

		//console.log(vscode.Uri.file(path.join(context.extensionPath, 'assets','bootstrap','css','bootstrap.min.css')))

		//const filePath = vscode.Uri.file(path.join(context.extensionPath, 'assets', 'index.html')) ;
		//panel.webview.html = readFileSync(filePath.fsPath,'utf8');
		panel.webview.html = getWebviewContent(panel)

		
	});

	let execSingleDisp = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalall', function () {
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
		terminal.sendText(clingPath + " " + vscode.window.activeTextEditor.document.fileName + " 0");
	});

	let execAllDisp = vscode.commands.registerCommand('answer-set-programming-language-support.runinterminalsingle', function () {
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
		terminal.sendText(clingPath + " " + vscode.window.activeTextEditor.document.fileName);
	});
	
	//Disposables
	context.subscriptions.push(execSingleDisp);
	context.subscriptions.push(execAllDisp);
	context.subscriptions.push(sidepanelDisp);

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

	function getClingoOut() {

		var clingoOut;
		var clingoCmd = clingPath + " " + vscode.window.activeTextEditor.document.fileName + " 0";

		var child = cp.spawn(clingoCmd);

		child.stdout.on('data', function (data) {
			console.log('stdout: ' + data);
		});

		child.stderr.on('data', function (data) {
			console.log('stderr: ' + data);
		});
		  
		child.on('close', function (code) {
			console.log('child process exited with code ' + code);
		});
		

		console.log(clingoOut)
	}


	function getWebviewContent(panel) {

		const btsTrap = vscode.Uri.file(path.join(context.extensionPath, '/assets/bootstrap/css/bootstrap.min.css')).with({ scheme: 'vscode-resource' })
		const footer = vscode.Uri.file(path.join(context.extensionPath, '/assets/css/Footer-Dark.css')).with({ scheme: 'vscode-resource' })
		const styles = vscode.Uri.file(path.join(context.extensionPath, '/assets/css/styles.css')).with({ scheme: 'vscode-resource' })

		const sc1 = vscode.Uri.file(path.join(context.extensionPath, '/assets/js/jquery.min.js')).with({ scheme: 'vscode-resource' })
		const sc2 = vscode.Uri.file(path.join(context.extensionPath, '/assets/bootstrap/js/bootstrap.min.js')).with({ scheme: 'vscode-resource' })

		return `<!DOCTYPE html>
		<html>
		
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0, shrink-to-fit=no">
			<title>ASP Interactive Window (Backup 1598794006429)</title>
			<link rel="stylesheet" type="text/css" href="${btsTrap}">
			<link rel="stylesheet" type="text/css" href="${footer}">
			<link rel="stylesheet" type="text/css" href="${styles}">
		</head>
		
		<body style="background-color: rgb(31,31,31);color: rgb(255,255,255);">
			<h1 style="position: fixed;top: 15px;left: 40px;color: rgb(255,255,255);font-size: 32px;width: 350;min-width: 350;max-width: 350;">ASP Interactive Window</h1>
			<div style="background-color: #1e4d67;height: 68px;min-height: 68px;max-height: 68px;"></div><button class="btn btn-primary" type="button" style="position: fixed;top: 80px;left: 40px;width: 70px;min-width: 70px;max-width: 70px;">Union</button><button class="btn btn-primary" type="button" style="position: fixed;top: 15px;left: 400px;width: 82px;min-width: 82px;max-width: 82px;">Run File</button>
			<button
				class="btn btn-primary" type="button" style="position: fixed;top: 130px;left: 40px;width: 70px;min-width: 70px;max-width: 70px;">NYI</button><button class="btn btn-primary" type="button" style="position: fixed;top: 180px;left: 40px;width: 70px;min-width: 70px;max-width: 70px;">NYI<br></button>
				<div style="width: 110px;min-width: 110px;max-width: 110px;height: 173px;min-height: 412px;max-height: 165px;background-color: #343434;"></div><code id="clingoOutput" style="position: fixed;top: 80px;left: 150px;width: 650px;min-width: 650px;max-width: 650px;color: rgb(45,175,231);">sudoku(2,3,3)&nbsp;sudoku(3,3,8)&nbsp;sudoku(4,3,1)&nbsp;sudoku(5,3,4)&nbsp;sudoku(6,3,6)&nbsp;sudoku(7,3,5)&nbsp;sudoku(8,3,9)&nbsp;sudoku(9,3,2)&nbsp;sudoku(1,4,5)&nbsp;sudoku(2,4,7)&nbsp;sudoku(3,4,2)&nbsp;sudoku(4,4,8)&nbsp;sudoku(5,4,1)&nbsp;sudoku(6,4,3)&nbsp;sudoku(7,4,9)&nbsp;sudoku(8,4,6)&nbsp;sudoku(9,4,4)&nbsp;sudoku(1,5,4)&nbsp;sudoku(2,5,1)&nbsp;sudoku(3,5,3)&nbsp;sudoku(4,5,9)&nbsp;sudoku(5,5,6)&nbsp;sudoku(6,5,2)&nbsp;sudoku(7,5,7)&nbsp;sudoku(8,5,5)&nbsp;sudoku(9,5,8)&nbsp;sudoku(1,6,9)&nbsp;sudoku(2,6,8)&nbsp;sudoku(3,6,6)&nbsp;sudoku(4,6,5)&nbsp;sudoku(5,6,7)&nbsp;sudoku(6,6,4)&nbsp;sudoku(7,6,2)&nbsp;sudoku(8,6,1)&nbsp;sudoku(9,6,3)&nbsp;sudoku(1,7,2)&nbsp;sudoku(2,7,5)&nbsp;sudoku(3,7,1)&nbsp;sudoku(4,7,6)&nbsp;sudoku(5,7,3)&nbsp;sudoku(6,7,8)&nbsp;sudoku(7,7,4)&nbsp;sudoku(8,7,7)&nbsp;sudoku(9,7,9)&nbsp;sudoku(1,8,8)&nbsp;sudoku(2,8,6)&nbsp;sudoku(3,8,4)&nbsp;sudoku(4,8,2)&nbsp;sudoku(5,8,9)&nbsp;sudoku(6,8,7)&nbsp;sudoku(7,8,1)&nbsp;sudoku(8,8,3)&nbsp;sudoku(9,8,5)&nbsp;sudoku(1,9,3)&nbsp;sudoku(2,9,9)&nbsp;sudoku(3,9,7)&nbsp;sudoku(4,9,4)&nbsp;sudoku(5,9,5)&nbsp;sudoku(6,9,1)&nbsp;sudoku(7,9,8)&nbsp;sudoku(8,9,2)&nbsp;sudoku(1,1,6)&nbsp;sudoku(2,1,4)&nbsp;sudoku(3,1,5)&nbsp;sudoku(4,1,7)&nbsp;sudoku(5,1,2)&nbsp;sudoku(6,1,9)&nbsp;sudoku(7,1,3)&nbsp;sudoku(8,1,8)&nbsp;sudoku(9,1,1)&nbsp;sudoku(1,2,1)&nbsp;sudoku(2,2,2)&nbsp;sudoku(3,2,9)&nbsp;sudoku(4,2,3)&nbsp;sudoku(5,2,8)&nbsp;sudoku(6,2,5)&nbsp;sudoku(7,2,6)&nbsp;sudoku(8,2,4)&nbsp;sudoku(9,2,7)&nbsp;sudoku(1,3,7)&nbsp;sudoku(9,9,6)<br><br></code>
				<script> 
					
				</script>
		</body>
		
		</html>`
	}

}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
	/*
	document.getElementById("clingoOutput").innerHTML = "${ClStdOut}"
	*/
}

module.exports = {
	activate,
	deactivate
}


/*

class CustomSidePanel {

console.log(clingoOutput)
		cp.exec(clingoOutput, {maxBuffer: 1024 * 500}, (err, stdout, stderr) => {
			console.log(stdout);
		});


}

`<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>ASP Interactive Window</title>
	
			<meta http-equiv="Content-Security-Policy"
				content="default-src 'none';
					img-src https:;
					script-src 'unsafe-eval' 'unsafe-inline' vscode-resource:;
					style-src vscode-resource: 'unsafe-inline';">
					<style>

						.grid-container {
							display: grid;
							grid-template-columns: 1fr 1fr 1fr 1fr;
							grid-template-rows: 1fr 1fr 1fr;
							gap: 1px 1px;
							grid-template-areas: "Buttons Buttons Buttons Buttons" "Controls Output Output Output" "Controls Output Output Output";
						}
						
						.Buttons { 
							grid-area: Buttons; 
							justify-self: start;

						}
						
						.Controls { 
							grid-area: Controls; 
							justify-self: start;

						}
						
						.Output { 
							grid-area: Output; 
							justify-self: start;

						}



						.blueButton {
							background-color:#599bb3;
							border:1px solid #302e30;
							display:inline-block;
							cursor:pointer;
							color:#f0f0f0;
							font-family:Arial;
							font-size:14px;
							font-weight:bold;
							padding:8px 22px;
							text-decoration:none;
						}
						.blueButton:hover {
							background-color:#408c99;
						}
						.blueButton:active {
							position:relative;
							top:1px;
						}

						.label {
							color: white;
							padding: 8px;
							font-family: Arial;
						  }
						.success {background-color: #4CAF50;}
						.info {background-color: #2196F3;}
						.warning {background-color: #ff9800;}
						.danger {background-color: #f44336;}
						.other {background-color: #e7e7e7; color: black;}
					
						
					</style>
		</head>
		<body>
			<div id="root"></div>
			<h2>ASP Interactive Window</h2>
	
			<div class="grid-container">
				<div class="Buttons">
					<button id="BttnRun" class="blueButton">Run</button>
				</div>
				<div class="Controls">
					<span id="Label1" class="label other">other</span>
				</div>
				<div class="Output">
					<span id="Label2" class="label success">success</span>	  
				</div>
			</div>

			<script>
				document.getElementById('BttnRun').onclick = function () {
				document.getElementById("Label2").value = "Output from console";
				};
			</script>
		</body>
		</html>`

*/
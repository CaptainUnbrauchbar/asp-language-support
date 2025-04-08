const fs = require("fs");
const spawn = require("child_process").spawn;

/**
 * @param {*} vscode Reference to vscode module import (workaround so we can test it)
 * @param {*} progress Reference to the progress object from vscode
 * @param {String} filePath Path to the ASP file to be read
 * @param {Number} models Number of models
 * @param {String[]} options Array of options to be passed to Clingo
 * @returns {Promise<any>} Clingo result or null if file not found
 */

async function runClingoPathForFileWithProgress(vscode, progress, clingoPath, filePath, models = undefined, options = undefined) {
    return new Promise((resolve, reject) => {
        progress.report({
            increment: 0,
            message: "Starting Clingo...",
        });

        let args = [];
        if (options) {
            args = [`"${vscode.window.activeTextEditor.document.fileName}"`, `${models}`, ...options];
        } else {
            args = [`"${vscode.window.activeTextEditor.document.fileName}"`, `${models}`];
        }

        const process = spawn(`"${clingoPath}"`, args, { shell: true });

        let output = "";
        let errorOutput = "";
        let processTerminated = false; // Track if the process was terminated

        // Capture stdout
        process.stdout.on("data", (data) => {
            output += data.toString();
        });

        // Capture stderr
        process.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        // Show a popup after 5 seconds asking if the user wants to terminate the process
        const timeout = setTimeout(() => {
            if (!processTerminated) {
                vscode.window
                    .showWarningMessage("Clingo is taking longer than expected. Do you want to terminate the process?", "Yes", "No")
                    .then((choice) => {
                        if (choice === "Yes") {
                            process.kill(); // Terminate the process
                            processTerminated = true;
                            vscode.window.showInformationMessage("Clingo process terminated.");
                            reject(new Error("Clingo process was terminated by the user."));
                        }
                    });
            }
        }, 5000); // 5-second delay

        progress.report({
            increment: 100,
            message: "Clingo finished successfully!",
        });

        // Handle process close
        process.on("close", (code) => {
            clearTimeout(timeout); // Clear the timeout if the process finishes
            if (processTerminated) {
                reject(); // Skip further processing if the process was terminated
            }
            resolve({ code, output, errorOutput });
        });
    });
}

module.exports = { runClingoPathForFileWithProgress };

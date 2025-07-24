const fs = require("fs");
const clingo = require("clingo-wasm");
//import { run, terminate } from "clingo-wasm";

/**
 * @param {*} vscode Reference to vscode module import (workaround so we can test it)
 * @param {*} progress Reference to the progress object from vscode
 * @param {String} filePath Path to the ASP file to be read
 * @param {Number} models Number of models
 * @param {String[]} options Array of options to be passed to Clingo
 * @returns {Promise<clingo.ClingoResult | clingo.ClingoError | null>} Clingo result or null if file not found
 */
async function runClingoWasmForFileWithProgress(vscode, progress, filePath, models = undefined, options = undefined) {
    progress.report({
        increment: 0,
        message: "Starting Clingo...",
    });

    let fileContent;

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`File not found: ${filePath}`);
        return null;
    }

    fileContent = await fs.promises.readFile(filePath, "utf8");

    const additionalFiles = options?.filter((arg) => arg && !arg.startsWith("--")).map((filePath) => filePath.replace(/"/g, ""));

    if (additionalFiles?.length) {
        for (const additionalFilePath of additionalFiles) {
            if (!fs.existsSync(additionalFilePath)) {
                vscode.window.showErrorMessage(`File not found: ${filePath}`);
                return null;
            }
            const additionalContent = await fs.promises.readFile(additionalFilePath, "utf8");
            if (additionalContent.trim()) {
                fileContent += `\n${additionalContent}`;
            }
        }
    }

    // Filter options for Clingo
    const clingoOptions = options?.filter((arg) => arg.startsWith("--"));

    // Remove all sections starting with % and ending with \r\n
    //fileContent = fileContent.replace(/%.*?\r\n/g, "");

    progress.report({
        increment: 50,
        message: "Running Clingo WASM...",
    });

    setTimeout(() => {
        clingo.terminate();
    }, 2000);

    // Run Clingo WASM with timeout
    const wasmResult = await clingo.run(fileContent, models, clingoOptions);

    progress.report({
        increment: 100,
        message: "Clingo finished successfully!",
    });

    // Validate the result
    if (["ERROR", "UNSATISFIABLE", "UNKNOWN"].includes(wasmResult.Result)) {
        if ("Error" in wasmResult) {
            vscode.window.showErrorMessage(`Clingo WASM Error: ${wasmResult.Error}`);
        } else {
            vscode.window.showErrorMessage(`Clingo WASM Error: Unknown error`);
        }
        return null;
    } else {
        return wasmResult;
    }
}

module.exports = { runClingoWasmForFileWithProgress };

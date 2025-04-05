const fs = require("fs");
const clingo = require("clingo-wasm");

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

    const additionalFiles = options
        ?.filter((arg) => arg && !arg.startsWith("--"))
        .map((filePath) => filePath.replace(/"/g, ""));

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
    fileContent = fileContent.replace(/%.*?\r\n/g, "");

    progress.report({
        increment: 50,
        message: "Running Clingo WASM...",
    });

    // Run Clingo WASM with timeout
    const wasmResult = await clingo.run(fileContent, models, clingoOptions);

    progress.report({
        increment: 100,
        message: "Clingo finished successfully!",
    });

    // Validate the result
    if (["ERROR", "UNSATISFIABLE", "UNKNOWN"].includes(wasmResult.Result)) {
        vscode.window.showErrorMessage(`Clingo WASM Error: ${wasmResult.Error}`);
        return wasmResult;
    } else {
        return wasmResult;
    }
}

module.exports = { runClingoWasmForFileWithProgress };

/**
 * How far an `#include` is allowed to reach.
 */
const { dirname } = require("path");

/**
 * The workspace folder a file belongs to, which is the boundary includes are
 * confined to. Falls back to the folder the file itself sits in, so a `.lp`
 * opened on its own, outside any workspace, still solves together with the
 * files next to it.
 * @param {*} vscode Reference to the vscode module (passed so it can be tested)
 * @param {String} filePath
 * @returns {String}
 */
function workspaceRootFor(vscode, filePath) {
    try {
        const uri = vscode?.Uri?.file?.(filePath);
        const folder = uri && vscode?.workspace?.getWorkspaceFolder?.(uri);
        if (folder?.uri?.fsPath) {
            return folder.uri.fsPath;
        }
    } catch {
        // No workspace, a file outside every folder, or a stubbed vscode in tests
    }
    return dirname(filePath);
}

module.exports = { workspaceRootFor };

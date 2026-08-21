/**
 * The one-time notice shown after an update.
 *
 * vscode is passed in rather than required, so this can be tested without an
 * extension host.
 */

/** Remembers which note has been seen. Global, so it does not repeat per workspace. */
const RELEASE_NOTE_KEY = "aspLanguage.releaseNoteSeen";
const RELEASE_VERSION = "1.1.0";
const MESSAGE =
    "Clingo for VSCode 1.1.0 — solver options have moved into the ASP panel, behind the gear in its toolbar. " +
    "config.json is no longer run directly; import it instead.";

const WHATS_NEW = "What's New";
const OPEN_SETTINGS = "Open Solver Settings";
const NOTES_FILE = "RELEASE-NOTES.md";

/**
 * Shows the notice unless it has already been seen.
 * @param {*} vscode The vscode module
 * @param {{get: Function, update: Function}} globalState context.globalState
 * @param {{force?: Boolean, extensionUri?: any}} options force ignores the
 *        stored flag, for the command; extensionUri locates the notes page
 * @returns {Promise<Boolean>} Whether the notice was shown this time
 */
async function showReleaseNote(vscode, globalState, options = {}) {
    const { force = false, extensionUri } = options;
    if (!force && globalState.get(RELEASE_NOTE_KEY) === RELEASE_VERSION) {
        return false;
    }

    const choice = await vscode.window.showInformationMessage(MESSAGE, WHATS_NEW, OPEN_SETTINGS);
    await globalState.update(RELEASE_NOTE_KEY, RELEASE_VERSION);

    if (choice === WHATS_NEW && extensionUri) {
        await vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.joinPath(extensionUri, NOTES_FILE));
    }
    if (choice === OPEN_SETTINGS) {
        await vscode.commands.executeCommand("answer-set-programming-language-support.togglesettings");
    }
    return true;
}

module.exports = { showReleaseNote, RELEASE_NOTE_KEY, RELEASE_VERSION, MESSAGE, WHATS_NEW, OPEN_SETTINGS, NOTES_FILE };

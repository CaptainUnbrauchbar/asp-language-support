/**
 * The one-time notice shown after an update.
 *
 * 1.1.0 moves solver options out of config.json and into the panel, which is a
 * change a user would otherwise discover by finding a button missing. Worth
 * saying once, in the corner of the window, and never again.
 *
 * vscode is passed in rather than required, so the whole thing can be tested
 * without an extension host.
 */

/** Remembers which note has been seen. Global, so it does not repeat per workspace. */
const RELEASE_NOTE_KEY = "aspLanguage.releaseNoteSeen";

/** Bumping this is what makes the next release show its own note. */
const RELEASE_VERSION = "1.1.0";

/**
 * A notification is one run of plain text with no heading and no structure, so
 * it carries only the two facts that cannot wait, and hands the rest to a page
 * that can actually be laid out.
 */
const MESSAGE =
    "Clingo for VSCode 1.1.0 — solver options have moved into the ASP panel, behind the gear in its toolbar. " +
    "config.json is no longer run directly; import it instead.";

/** Opens the formatted notes, which is where the headings and lists live. */
const WHATS_NEW = "What's New";

/** Goes straight to what the notice is about. */
const OPEN_SETTINGS = "Open Solver Settings";

/** The page the "What's New" button renders, shipped with the extension. */
const NOTES_FILE = "RELEASE-NOTES.md";

/**
 * Shows the notice unless it has been seen, and remembers that it has.
 *
 * An ordinary notification, so it sits in the corner of the window and can be
 * ignored, rather than a modal dialog standing between the user and the file
 * they opened. Carrying an action button also stops VSCode from hiding it after
 * a few seconds, so it waits to be read.
 *
 * The promise only settles once the notification is dismissed or acted on, so
 * closing VSCode with it still on screen leaves it unseen and it comes back.
 * That is the right way round: it should survive being missed, not being read.
 *
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

    // Recorded however it was dismissed, so it cannot come back a second time
    await globalState.update(RELEASE_NOTE_KEY, RELEASE_VERSION);

    if (choice === WHATS_NEW && extensionUri) {
        // Markdown preview rather than a webview of our own: it already renders
        // headings, lists and links the way the rest of VSCode does
        await vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.joinPath(extensionUri, NOTES_FILE));
    }
    if (choice === OPEN_SETTINGS) {
        await vscode.commands.executeCommand("answer-set-programming-language-support.togglesettings");
    }
    return true;
}

module.exports = { showReleaseNote, RELEASE_NOTE_KEY, RELEASE_VERSION, MESSAGE, WHATS_NEW, OPEN_SETTINGS, NOTES_FILE };

// @ts-nocheck
const { showReleaseNote, RELEASE_NOTE_KEY, RELEASE_VERSION, MESSAGE, WHATS_NEW, OPEN_SETTINGS, NOTES_FILE } = require("../releaseNote.js");

/** A memento that behaves like context.globalState. */
function fakeGlobalState(initial = {}) {
    const store = { ...initial };
    return {
        get: (key) => store[key],
        update: jest.fn(async (key, value) => {
            store[key] = value;
        }),
        peek: () => store,
    };
}

/** @param {String | undefined} choice What the user clicks */
function fakeVscode(choice = undefined) {
    return {
        window: { showInformationMessage: jest.fn(async () => choice) },
        commands: { executeCommand: jest.fn(async () => {}) },
        Uri: { joinPath: (base, ...parts) => ({ path: [base.path, ...parts].join("/") }) },
    };
}

const extensionUri = { path: "/ext" };

describe("showReleaseNote", () => {
    it("shows the note to someone who has not seen it", async () => {
        const vscode = fakeVscode();
        const state = fakeGlobalState();

        expect(await showReleaseNote(vscode, state)).toBe(true);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it("never shows it a second time", async () => {
        const vscode = fakeVscode();
        const state = fakeGlobalState();

        await showReleaseNote(vscode, state);
        const shownAgain = await showReleaseNote(vscode, state);

        expect(shownAgain).toBe(false);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(state.peek()[RELEASE_NOTE_KEY]).toEqual(RELEASE_VERSION);
    });

    it("remembers it however the dialog was dismissed", async () => {
        // Dismissing with Escape or the close button resolves with undefined,
        // which still has to count as seen or the note returns forever
        for (const choice of [undefined, OPEN_SETTINGS]) {
            const state = fakeGlobalState();
            await showReleaseNote(fakeVscode(choice), state);
            expect(state.update).toHaveBeenCalledWith(RELEASE_NOTE_KEY, RELEASE_VERSION);
        }
    });

    it("opens the settings pane only when asked to", async () => {
        const accepted = fakeVscode(OPEN_SETTINGS);
        await showReleaseNote(accepted, fakeGlobalState());
        expect(accepted.commands.executeCommand).toHaveBeenCalledWith(
            "answer-set-programming-language-support.togglesettings"
        );

        const dismissed = fakeVscode(undefined);
        await showReleaseNote(dismissed, fakeGlobalState());
        expect(dismissed.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("shows it on demand even to someone who dismissed it", async () => {
        const vscode = fakeVscode();
        const state = fakeGlobalState({ [RELEASE_NOTE_KEY]: RELEASE_VERSION });

        expect(await showReleaseNote(vscode, state, { force: true })).toBe(true);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it("shows it again once a later release bumps the version", async () => {
        const vscode = fakeVscode();
        // Someone who saw the note from an earlier release
        const state = fakeGlobalState({ [RELEASE_NOTE_KEY]: "1.0.0" });

        expect(await showReleaseNote(vscode, state)).toBe(true);
    });

    it("is an ordinary notification, not a dialog in the way", async () => {
        const vscode = fakeVscode();
        await showReleaseNote(vscode, fakeGlobalState());

        const [message, ...items] = vscode.window.showInformationMessage.mock.calls[0];
        expect(message).toEqual(MESSAGE);
        // A second argument that is an options object would make it modal
        expect(typeof items[0]).toEqual("string");
        expect(items).toEqual([WHATS_NEW, OPEN_SETTINGS]);
    });

    it("carries an action, which is what keeps it from hiding itself", async () => {
        // VSCode dismisses a plain information message after a few seconds, and
        // one that is never seen would be marked as seen anyway
        const vscode = fakeVscode();
        await showReleaseNote(vscode, fakeGlobalState());

        expect(vscode.window.showInformationMessage.mock.calls[0].length).toBeGreaterThan(1);
    });

    it("says the two things that cannot wait", () => {
        // A notification has no heading and no structure, so it carries only
        // what a 1.1.0 user must not miss; the page behind it does the rest
        expect(MESSAGE).toContain("1.1.0");
        expect(MESSAGE).toContain("config.json is no longer run directly");
        expect(MESSAGE).toContain("gear");
        // Short enough that VSCode shows it without collapsing it
        expect(MESSAGE.length).toBeLessThan(200);
        expect(MESSAGE).not.toContain("\n");
    });

    it("opens the notes page when asked for what is new", async () => {
        const vscode = fakeVscode(WHATS_NEW);
        await showReleaseNote(vscode, fakeGlobalState(), { extensionUri });

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            "markdown.showPreview",
            expect.objectContaining({ path: `/ext/${NOTES_FILE}` })
        );
    });

    it("does not try to open a page it was given no path to", async () => {
        const vscode = fakeVscode(WHATS_NEW);
        await showReleaseNote(vscode, fakeGlobalState());

        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
});

describe("the release notes page", () => {
    const notes = require("fs").readFileSync(require("path").join(__dirname, "..", "..", NOTES_FILE), "utf8");

    it("ships with the extension, since the button opens it from there", () => {
        const ignore = require("fs").readFileSync(require("path").join(__dirname, "..", "..", ".vscodeignore"), "utf8");
        expect(ignore).not.toMatch(/^\*?\*?\.md/m);
        expect(ignore).not.toContain(NOTES_FILE);
    });

    it("leads with a heading and the change that breaks habits", () => {
        expect(notes).toMatch(/^# Clingo for VSCode 1\.1\.0/);
        expect(notes).toContain("no longer run directly");
        expect(notes).toContain("Import from config.json");
    });

    it("covers what the notification had no room for", () => {
        for (const topic of ["Stop a running solve", "time limit", "Filter and compare", "#include"]) {
            expect(notes).toContain(topic);
        }
    });
});

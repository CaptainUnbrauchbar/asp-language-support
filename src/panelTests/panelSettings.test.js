/**
 * @jest-environment jsdom
 */
// @ts-nocheck
jest.mock("vscode", () => require("./panelHarness.js").vscodeStub(), { virtual: true });

const { loadPanel, fixture } = require("./panelHarness.js");
const { formatWasmResult } = require("../formatWasmResult.js");

/**
 * The fields the extension describes. Written out here rather than imported from
 * solverSettings so the panel is judged on rendering what it is handed, which is
 * all it ever knows about them.
 */
const FIELDS = [
    { key: "timeLimit", label: "Time limit", description: "seconds", type: "number", min: 0 },
    { key: "parallelEnabled", label: "Parallel solving", description: "threads", type: "boolean" },
    { key: "parallelThreads", label: "Threads", description: "count", type: "number", min: 1, dependsOn: "parallelEnabled" },
    {
        key: "parallelMode",
        label: "Thread mode",
        description: "how",
        type: "select",
        options: ["compete", "split"],
        dependsOn: "parallelEnabled",
    },
    { key: "constants", label: "Constants", description: "list", type: "text" },
    { key: "verbose", label: "Verbosity", description: "detail", type: "number", min: 0 },
];

/** What the bundled solver cannot honour, with the reason the extension attaches. */
const AS_WASM = FIELDS.map((field) =>
    field.key === "verbose" ? { ...field, unavailable: "Only works with your own clingo." } : field
);

const VALUES = { timeLimit: 0, parallelEnabled: false, parallelThreads: 4, parallelMode: "compete", constants: "", verbose: 0 };

/** A panel with settings delivered and the pane open. */
function panelWithSettings({ fields = AS_WASM, command = undefined, open = true } = {}) {
    const panel = loadPanel();
    panel.send({ type: "updateSettings", fields, settings: { ...VALUES }, scope: "this workspace", command });
    if (open) {
        panel.send({ type: "toggleSettings" });
    }
    return panel;
}

describe("the settings pane", () => {
    it("starts closed and says which runs it applies to", () => {
        const panel = panelWithSettings({ open: false });

        expect(panel.one(".settings-pane").hidden).toBe(true);
        expect(panel.text(".settings-scope")).toEqual("this workspace");
    });

    it("opens with a row per field", () => {
        const panel = panelWithSettings();

        expect(panel.one(".settings-pane").hidden).toBe(false);
        expect(panel.settingRows()).toHaveLength(FIELDS.length);
    });

    it("holds each control in a fixed width box", () => {
        // vscode.css styles input:not([type=checkbox]) at a specificity a plain
        // class cannot beat, which collapsed the label column to nothing
        const panel = panelWithSettings();

        expect(panel.all(".setting-control")).toHaveLength(FIELDS.length);
    });

    it("disables the rows that depend on an option that is switched off", () => {
        const panel = panelWithSettings();

        expect(panel.settingRows()[2].className).toContain("setting-disabled");
    });

    it("does not drag the answer toolbar out with it", () => {
        const panel = panelWithSettings();

        expect(panel.header().hidden).toBe(true);
    });

    it("closes on Done, and the gear toggles it", () => {
        const panel = panelWithSettings();

        panel.click(".settings-close");
        expect(panel.one(".settings-pane").hidden).toBe(true);

        panel.send({ type: "toggleSettings" });
        expect(panel.one(".settings-pane").hidden).toBe(false);
        panel.send({ type: "toggleSettings" });
        expect(panel.one(".settings-pane").hidden).toBe(true);
    });
});

describe("a setting the current solver cannot honour", () => {
    it("is marked rather than left looking functional", () => {
        const panel = panelWithSettings();
        const row = panel.settingRows()[5];

        expect(row.className).toContain("setting-unavailable");
        expect(row.querySelectorAll(".setting-note")).toHaveLength(1);
        expect(row.textContent).toContain("Only works with your own clingo.");
    });

    it("cannot be edited into having an effect", () => {
        const panel = panelWithSettings();

        expect(panel.settingRows()[5].querySelector(".setting-control").children[0].disabled).toBe(true);
    });

    it("leaves the options that work everywhere untouched", () => {
        const panel = panelWithSettings();

        expect(panel.settingRows()[0].className).not.toContain("setting-unavailable");
        expect(panel.settingRows()[0].querySelectorAll(".setting-note")).toHaveLength(0);
    });

    it("becomes available again on switching to your own clingo", () => {
        const panel = panelWithSettings();

        panel.send({ type: "updateSettings", fields: FIELDS, settings: { ...VALUES }, scope: "this workspace" });

        const row = panel.settingRows()[5];
        expect(row.className).not.toContain("setting-unavailable");
        expect(row.querySelector(".setting-control").children[0].disabled).toBe(false);
    });
});

describe("editing the settings", () => {
    it("saves what was typed, once the typing stops", async () => {
        const panel = panelWithSettings();
        panel.posted.length = 0;

        const input = panel.all(".setting-input")[0];
        input.value = "30";
        input.dispatchEvent(new window.Event("input"));
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(panel.posted[0].type).toEqual("saveSettings");
        expect(panel.posted[0].settings.timeLimit).toEqual(30);
    });

    it("enables the rows below an option as soon as it is switched on", () => {
        const panel = panelWithSettings();

        const toggle = panel.all(".setting-checkbox")[0];
        toggle.checked = true;
        toggle.dispatchEvent(new window.Event("change"));

        expect(panel.settingRows()[2].className).not.toContain("setting-disabled");
    });
});

describe("the pane's actions", () => {
    it.each([
        [".settings-import", "importConfig"],
        [".settings-export", "exportConfig"],
        [".settings-reset", "resetSettings"],
    ])("%s asks the extension to %s", (selector, type) => {
        const panel = panelWithSettings();
        panel.posted.length = 0;

        panel.click(selector);

        expect(panel.posted[0]).toEqual({ type });
    });

    it("offers importing and exporting side by side", () => {
        // A config file is only worth keeping if it can be produced as well as read
        const panel = panelWithSettings();

        expect(panel.text(".settings-import")).toEqual("Import from config.json");
        expect(panel.text(".settings-export")).toEqual("Export to config.json");
    });
});

describe("a dropdown whose values need explaining", () => {
    /** How the extension describes clingo's output formats. */
    const OUTPUT_FORMAT = {
        key: "outputFormat",
        label: "Output format",
        description: "which format to ask for",
        type: "select",
        options: [
            { value: "0", label: "0 - default text" },
            { value: "1", label: "1 - competition" },
            { value: "2", label: "2 - JSON (recommended)" },
            { value: "3", label: "3 - no output" },
        ],
    };

    function paneWithFormats(selected = "2") {
        const panel = loadPanel();
        panel.send({
            type: "updateSettings",
            fields: [OUTPUT_FORMAT],
            settings: { outputFormat: selected },
            scope: "this workspace",
        });
        panel.send({ type: "toggleSettings" });
        return panel;
    }

    it("shows what each choice means rather than a bare number", () => {
        const panel = paneWithFormats();
        const options = [...panel.one(".setting-select").options];

        expect(options.map((option) => option.value)).toEqual(["0", "1", "2", "3"]);
        expect(options.map((option) => option.textContent)).toContain("2 - JSON (recommended)");
    });

    it("starts on the value it was given", () => {
        expect(paneWithFormats("2").one(".setting-select").value).toEqual("2");
        expect(paneWithFormats("0").one(".setting-select").value).toEqual("0");
    });

    it("saves the value, not the label", async () => {
        const panel = paneWithFormats();
        panel.posted.length = 0;

        const select = panel.one(".setting-select");
        select.value = "1";
        select.dispatchEvent(new window.Event("change"));
        // Saving is debounced, so that typing does not spam the extension
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(panel.posted[0].type).toEqual("saveSettings");
        expect(panel.posted[0].settings.outputFormat).toEqual("1");
    });

    it("still renders a dropdown whose values speak for themselves", () => {
        // Thread mode is compete or split, which need no gloss
        const panel = loadPanel();
        panel.send({
            type: "updateSettings",
            fields: [{ key: "parallelMode", label: "Thread mode", description: "how", type: "select", options: ["compete", "split"] }],
            settings: { parallelMode: "split" },
            scope: "",
        });
        panel.send({ type: "toggleSettings" });

        const options = [...panel.one(".setting-select").options];
        expect(options.map((option) => option.textContent)).toEqual(["compete", "split"]);
        expect(panel.one(".setting-select").value).toEqual("split");
    });
});

describe("the pane alongside a result", () => {
    it("does not disturb the answers behind it", () => {
        const panel = loadPanel();
        panel.send({ type: "updateOutput", answers: formatWasmResult(fixture("subsets2")) });
        panel.send({ type: "updateSettings", fields: AS_WASM, settings: { ...VALUES }, scope: "this workspace" });
        panel.send({ type: "toggleSettings" });

        expect(panel.answers()).toHaveLength(4);
        expect(panel.header().hidden).toBe(false);
    });
});

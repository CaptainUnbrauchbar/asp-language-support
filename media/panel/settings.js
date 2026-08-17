/**
 * The solver settings pane. The fields are not described here: the extension
 * sends them, so both sides agree on what exists and on which options the
 * current solver cannot honour.
 */
(function () {
    const panel = window.AspPanel;
    const { vscode, el } = panel;

    let settingFields = [];
    let settings = {};
    let settingsOpen = false;
    let saveTimer;

    /** Debounced so typing does not spam the host. */
    function saveSettings() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => vscode.postMessage({ type: "saveSettings", settings }), 200);
    }

    // The control is chosen from the field's type, so adding an option to
    // SETTING_FIELDS in src/solverSettings.js is enough to make it appear here
    function makeSettingRow(field) {
        const row = document.createElement("div");
        row.className = "setting-row";
        if (field.dependsOn && !settings[field.dependsOn]) {
            row.classList.add("setting-disabled");
        }

        const unsupported = !!field.unavailable;
        if (unsupported) {
            row.classList.add("setting-unavailable");
        }

        const text = document.createElement("div");
        text.className = "setting-text";
        const label = document.createElement("label");
        label.className = "setting-label";
        label.textContent = field.label;
        text.appendChild(label);
        const description = document.createElement("span");
        description.className = "setting-description";
        description.textContent = field.description;
        text.appendChild(description);
        if (unsupported) {
            const note = document.createElement("span");
            note.className = "setting-note";
            const noteIcon = document.createElement("i");
            noteIcon.className = "codicon codicon-info";
            noteIcon.setAttribute("aria-hidden", "true");
            note.appendChild(noteIcon);
            const noteText = document.createElement("span");
            noteText.textContent = field.unavailable;
            note.appendChild(noteText);
            text.appendChild(note);
        }
        row.appendChild(text);

        let control;
        if (field.type === "boolean") {
            control = document.createElement("input");
            control.type = "checkbox";
            control.className = "setting-checkbox";
            control.checked = !!settings[field.key];
            control.addEventListener("change", () => {
                settings[field.key] = control.checked;
                saveSettings();
                // other rows may depend on this one
                renderSettings();
            });
        } else if (field.type === "select") {
            control = document.createElement("select");
            control.className = "setting-select";
            field.options.forEach((option) => {
                const value = typeof option === "string" ? option : option.value;
                const item = document.createElement("option");
                item.value = value;
                item.textContent = typeof option === "string" ? option : option.label;
                if (String(settings[field.key]) === value) {
                    item.selected = true;
                }
                control.appendChild(item);
            });
            control.addEventListener("change", () => {
                settings[field.key] = control.value;
                saveSettings();
            });
        } else {
            control = document.createElement("input");
            control.className = "setting-input";
            control.type = field.type === "number" ? "number" : "text";
            if (field.min !== undefined) {
                control.min = String(field.min);
            }
            if (field.max !== undefined) {
                control.max = String(field.max);
            }
            if (field.placeholder) {
                control.placeholder = field.placeholder;
            }
            control.value = String(settings[field.key] ?? "");
            control.addEventListener("input", () => {
                settings[field.key] = field.type === "number" ? Number(control.value) : control.value;
                saveSettings();
            });
        }

        label.setAttribute("for", `setting-${field.key}`);
        control.id = `setting-${field.key}`;
        if (unsupported || (field.dependsOn && !settings[field.dependsOn])) {
            control.disabled = true;
        }

        const holder = document.createElement("div");
        holder.className = "setting-control";
        holder.appendChild(control);
        row.appendChild(holder);
        return row;
    }

    function renderSettings() {
        el.settingsBody.innerHTML = "";
        settingFields.forEach((field) => el.settingsBody.appendChild(makeSettingRow(field)));
    }

    // The gear lives in the panel's own title bar, so opening and closing
    // arrives as a message rather than as a click in here
    function toggle(open) {
        settingsOpen = open;
        el.settingsPane.hidden = !open;
        if (open) {
            renderSettings();
        }
    }

    function isOpen() {
        return settingsOpen;
    }

    // Redrawn only while the pane is open, since rebuilding a field under the
    // cursor would interrupt typing
    function update(message) {
        settingFields = message.fields ?? settingFields;
        settings = message.settings ?? {};
        el.settingsScope.textContent = message.scope ?? "";
        if (settingsOpen) {
            renderSettings();
        }
    }

    el.settingsClose.addEventListener("click", () => toggle(false));
    el.settingsImport.addEventListener("click", () => vscode.postMessage({ type: "importConfig" }));
    el.settingsExport.addEventListener("click", () => vscode.postMessage({ type: "exportConfig" }));
    el.settingsReset.addEventListener("click", () => vscode.postMessage({ type: "resetSettings" }));

    panel.settings = { toggle, isOpen, update };
})();

/** The overflow menu behind the "..." button. Adding to MENU_ACTIONS is all it takes. */
(function () {
    const panel = window.AspPanel;
    const { vscode, el, state } = panel;

    const MENU_ACTIONS = [
        {
            label: "Copy all answer sets",
            icon: "copy",
            enabled: () => !!state.lastResult?.totalAnswers,
            run: () => vscode.postMessage({ type: "copyAll" }),
        },
        {
            label: "Copy matching answer sets",
            icon: "filter",
            enabled: () => !!el.filterBox?.value.trim() && state.matchIndices.length > 0,
            // The answers that matched, not the ones on screen: while only
            // highlighting, everything is on screen and that would copy the lot
            run: () => vscode.postMessage({ type: "copyFiltered", indices: state.matchIndices }),
        },
        {
            label: "Clear output",
            icon: "clear-all",
            enabled: () => !!state.lastResult,
            run: () => {
                state.lastResult = null;
                state.matchIndices = [];
                el.filterBox.value = "";
                panel.render.showWelcome();
                panel.render.updateControls();
                vscode.setState(undefined);
                vscode.postMessage({ type: "clearOutput" });
            },
        },
    ];

    function close() {
        el.menu.hidden = true;
        el.moreButton.setAttribute("aria-expanded", "false");
    }

    function open() {
        el.menu.innerHTML = "";
        MENU_ACTIONS.forEach((action) => {
            const item = document.createElement("li");
            item.className = "menu-item";
            item.setAttribute("role", "menuitem");

            const button = document.createElement("button");
            button.className = "menu-button";
            button.disabled = !action.enabled();

            const icon = document.createElement("i");
            icon.className = `codicon codicon-${action.icon}`;
            button.appendChild(icon);

            const label = document.createElement("span");
            label.textContent = action.label;
            button.appendChild(label);

            button.addEventListener("click", () => {
                close();
                action.run();
            });
            item.appendChild(button);
            el.menu.appendChild(item);
        });
        el.menu.hidden = false;
        el.moreButton.setAttribute("aria-expanded", "true");
    }

    el.moreButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (el.menu.hidden) {
            open();
        } else {
            close();
        }
    });

    document.addEventListener("click", () => close());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            close();
        }
    });
    el.menu.addEventListener("click", (event) => event.stopPropagation());

    // Opening is the button's own job; only closing is asked for from outside
    panel.menu = { close };
})();

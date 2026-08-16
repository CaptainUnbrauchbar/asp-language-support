# Clingo for VSCode 1.1.0

**Solver options have moved into the ASP panel, and `config.json` is no longer run directly.**

---

## Where your settings went

Click the **gear** in the ASP panel's toolbar, next to the run buttons.

Everything a config file used to carry now lives there: the answer set limit, time limits, parallel solving, constants, extra files and any custom clingo arguments. They are kept per workspace, so the everyday case needs no file at all.

## What this means for `config.json`

Running a config file directly is gone, along with its toolbar button and `Ctrl+Shift+C`.

**Your existing config is not lost.** It stays supported as a way to carry options between people and projects:

-   **Import from config.json** in the settings pane copies one into your settings
-   `ASPLanguage: Initialize clingo config file in current working directory` still writes one out
-   `ASPLanguage: Set Config` still says which file to look for

Point `Set Config` at your file, open the settings pane, and press **Import from config.json** once. After that the panel is where your options live.

## Also new in this release

-   **Stop a running solve.** An endless loop no longer means restarting VSCode — use the stop button in the panel, `Ctrl+Shift+S`, or Cancel on the progress notification. Whatever answers were found are kept.
-   **A time limit that works.** Clingo's own is inert under WebAssembly; the extension now enforces it and keeps the answers found so far.
-   **Filter and compare answer sets.** Narrow results to the answers you want, or switch the toggle inside the filter box to highlight matches while keeping everything on screen. **Compare** dims what every answer agrees on so only the differences stand out.
-   **Solver statistics** in the panel, whenever the statistics level is above zero.
-   **A status bar item** showing which solver is in use and its clingo version. Click it to run, or to stop a run.
-   **Multiple files without configuration.** Write `#include "other.lp".` in your program — ordinary clingo syntax, resolved relative to the file it appears in.

## Requires VSCode 1.94 or newer

The bundled clingo is now an ESM-only package and needs a newer NodeJS than older VSCode versions ship.

---

The full list of changes is in the [changelog](https://github.com/CaptainUnbrauchbar/asp-language-support/blob/informaticup/CHANGELOG.md). You can reopen this page any time with **ASPLanguage: Show release notes**.

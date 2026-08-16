# Change Log

All notable changes to the "answer-set-programming-language-support" extension will be documented in this file.

## Future / Planned

If you want to contribute to the repository you are welcome to look at these planned features on your own fork :)

-   **QoL**: Adjust the webview UI colours so they work best with any selected colour theme
-   **Testing**: Add more Unit Tests
-   **Testing**: Find a way to do proper Integration Testing that works with CI/CD (currently only local and limited functionality because of the webview UI)
-   **Localization**: Look into localization need/techniques and translate text

## 1.1.0: Stoppable Solving and a Rebuilt Output Panel :octagonal_sign:

-   Updated [**WASM Clingo**](https://github.com/domoritz/clingo-wasm) from 0.3.2 to 0.6.0
-   **A running solve can now be stopped.** Clingo runs in a worker that can be terminated, so an endless loop no longer means restarting VSCode:
    -   the progress notification shown while solving has a **Cancel** button
    -   a new **Stop the running Clingo solver** command is available in the ASP panel toolbar and on `Ctrl+Shift+S` / `Cmd+Shift+S`
-   The progress notification now reports **how many models have been found so far** instead of an empty spinner
-   Starting a second run while one is still going is refused instead of silently queueing behind it
-   Cancelled runs are reported as cancelled rather than as a solver error
-   **Output panel improvements:**
    -   Added a **filter box** that narrows results down to the atoms you are looking for
    -   Very large results no longer freeze the panel: the first 500 answer sets are rendered and the true total is reported
    -   Added a **Copy all** button, which copies every answer set even when only the first 500 are shown
    -   Copying now goes through VSCode instead of the webview clipboard, which could fail silently
    -   Clingo warnings and info messages are now shown instead of being discarded
    -   Results are kept when the panel is hidden, instead of being lost when switching to the terminal
    -   Results, including the active filter, also survive **moving the panel** to another position, which rebuilds the view from scratch and previously emptied it for good
    -   Redesigned the header: it is now **sticky**, so the filter, the actions and the statistics stay reachable however far you scroll
    -   The run statistics moved into a single line in that header, replacing the large metadata box and freeing most of the panel for answers
    -   Actions now use VSCode's own icons and gained an **overflow menu** for further tools (copy filtered answer sets, clear output)
    -   The config options used for a run collapse into an expandable section instead of taking a permanent box
    -   The run result is now a **coloured badge** (green when satisfiable, red when not) and the other statistics gained icons, with the numbers emphasised over their units
    -   Answers size themselves to their content instead of always being eight lines tall, so far more fits on screen
    -   While filtering, the **matching part of each atom is highlighted**
    -   Copy buttons confirm with a checkmark in place, not only through a notification
    -   Clingo messages and empty results are shown as proper callouts with an icon and a coloured edge
    -   Added a **Compare answer sets** toggle that dims the atoms every answer agrees on and highlights what tells them apart, marking atoms that occur in only a single answer
-   **Added a status bar item** showing which solver is in use and its clingo version, with a spinner while solving. Click it to compute all answer sets, or to stop a running solve. It replaces the notifications that announced the solver on every activation
-   **Config file problems are now readable**: instead of `[object Object]`, each problem names the field and what is wrong with it (e.g. `args.models: must be integer`), all problems are reported at once rather than one per run, and the message offers to open the config file
-   Clarified the `Set Config` setting: the config file is looked up next to the .lp file you run, not in the workspace root
-   **Removed the `Compute Answer Sets (config.json)` command**, its toolbar button, context menu entry and `Ctrl+Shift+C` shortcut. The settings pane covers what it did, and an existing config file is still welcome: **Import from config.json** brings it into the pane, and `Initialize clingo config file` still writes one out
-   **A run you stop yourself now shows the answers it had already found**, the same as one stopped by the time limit, instead of discarding them along with the solver
-   **The filter box can highlight instead of filter.** The toggle inside the box switches between hiding the answers with no matching atom and keeping every answer with the matches marked, which is what you want when you care where a match sits among the others. Either way a matching answer is shown **in full**, since an answer set means nothing atom by atom. Answers containing a match are marked in the margin while highlighting, and `Copy matching answer sets` means the matches in both modes
-   `Clear output` now returns to the welcome screen instead of leaving the panel blank
-   Matched text is easier to pick out: it now uses the stronger of the editor's two find colours, in bold and outlined, rather than the faint wash used for inactive matches
-   **Added a solver settings pane to the ASP panel**, opened with the gear in the panel toolbar next to the run buttons. Time limits, parallel solving, constants, extra files and custom arguments are edited there and kept per workspace, so the everyday case needs no config file. The JSON config keeps working unchanged: `Compute Answer Sets (config.json)` still reads it, the command that creates one is still there, and **Import from config.json** copies an existing one into the pane
-   **The time limit now works with the bundled solver.** Clingo's own `--time-limit` relies on a timer that cannot fire during a WebAssembly solve, so it was accepted and then silently ignored. The extension enforces it itself, and a run it stops reports the answers found up to that point instead of nothing at all. This applies to the time limit in a config.json as well
-   **Settings the bundled solver cannot honour are now marked as such** in the pane, greyed out with the reason and left out of the run, instead of being offered and quietly ignored. They become available again with `Use PATH Clingo`. `Verbosity` and `Preprocess only` are affected: the WASM build never carries the first, and the second emits a format the extension cannot read back
-   **Parallel solving works with the bundled solver.** The extension used to ask clingo-wasm whether threads were available from the extension host, which answers for that process rather than for the worker clingo actually runs in, and reports no threads because VSCode gives the host no `navigator` global. The parallel options were being stripped from every run as a result. Whether they work is now settled by clingo itself: they are sent, and only if clingo refuses them are they dropped, with a warning saying so. The default thread count also went from 2 to 4, since two threads measured no faster than one, and `split` mode is now recommended for enumerating many answers
-   **Solver statistics are now shown**, in a collapsible section under the toolbar, whenever the statistics level is above zero. They were being requested from clingo and thrown away. The figures are grouped under their section and flow into as many columns as the panel is wide, so each number stays beside its name
-   Added `npm run probe:settings`, which runs every setting against the bundled solver and reports what it really does, so a clingo-wasm upgrade cannot quietly turn an option into a no-op. This settles the long standing "verify that all config.json parameters actually work" item: every one of them is now checked by that command
-   A config.json asking for `preProcessor` no longer fails the run with `Clingo WASM Error: [object Object]`; unsupported options are dropped with a warning that says why
-   **Composing a program out of several files no longer needs a config**: `#include "other.lp".` now works with the bundled solver, resolved recursively and relative to the including file, and error positions point back at the file the line really came from
-   Added an **Answer set limit** to the settings pane: how many answer sets to compute at most, `0` for all of them. It caps `Compute all Answer Sets`, the way the time and solve limits do, while `Compute the first Answer Set` still returns one
-   The sample config now shows every option the panel imports, at its default value. Importing a config validates it against the schema and says what is wrong with it, taking whatever is valid rather than refusing the file
-   **Config simplified**: `name`, `version` and `author` are no longer required, the config is found in any folder above the file as well, `additionalFiles` is resolved relative to the config and accepts globs like `instances/*.lp`, and unknown keys are now reported instead of silently ignored
-   Removed the `Turn Messages Off` setting: the extension is quiet by default and only speaks up for errors and problems that are not already visible in the status bar
-   Fixed `solveLimit` being ignored entirely, and `0` in it now means "no limit" as the sample config intends, rather than "stop before the first conflict"
-   A search cut short by a limit is reported as an incomplete result with whatever was found, instead of `Clingo WASM Error: Unknown error`
-   Fixed a crash when a config file did not set `models`
-   Fixed a crash in the output panel when a run produced no answers
-   Fixed an unsatisfiable run showing a phantom empty "Answer 1/1"
-   Fixed output from your own Clingo overwriting a single answer of a previous run instead of replacing the panel
-   **Requires VSCode 1.94 or newer** (was 1.63): clingo-wasm is now an ESM-only package and needs a newer NodeJS than older VSCode versions ship

## 1.0.0: Big Feature, Security and QoL Patch :fireworks:

-   Switched to [**WASM Clingo**](https://github.com/domoritz/clingo-wasm) as a bundled version and removed previously used binaries
-   Added a **User Interface** for using the extension in a seperate tab in the lower panel (next to the terminal)
-   Added various developer experience features like Unit Tests, a single Integration Test (sanity check), CI/CD to the repository
-   Assessed the repository with OpenSSF Scorecard, made contributing much easier, documented and refactored the entire codebase

## 0.7.1

-   Fixed a problem when reading config files on MacOS

## 0.7.0

-   Fixed issues [#9](https://github.com/CaptainUnbrauchbar/asp-language-support/issues/9) and [#10](https://github.com/CaptainUnbrauchbar/asp-language-support/issues/10)

## 0.4.3

-   Updates bundled Clingo version to [5.4.0](https://github.com/potassco/clingo/releases/tag/v5.4.0)

## 0.4.2

-   Made Usage more intuitive and optimizations

## 0.4.1

-   Bugfixes

## 0.4.0

-   Added Multi-File Support! (use with config file)
-   Added Option to use a configuration file for clingo arguments
-   Added VSCode command to create sample config file
-   Optimization
-   Big Thanks to Richard Hegewald ([richilino](https://github.com/richilino)) for contributing the new features and helping optimize the extension code!

## 0.3.0

-   Added 2 Configuration Options
-   Added PATH Clingo compatibility (please enable in options!)
-   Added Auto Detect OS option (enabled by default)
-   You don't have to restart VSCode anymore to apply changes in settings (such wow)
-   Big Thanks to Spencer Killen ([sjkillen](https://github.com/sjkillen)) for contributing **Auto Detect OS Feature** and **PATH compatibility** on GitHub!

### 0.2.9

-   Minor Fix

### 0.2.8

-   Added Option to create a new Terminal after every execution
-   Minor fixes
-   When you close all terminals running a file will now create a new one

### 0.2.7

-   Added ASP Language to Extension
-   (hopefully) fixed gif

### 0.2.6

-   Added gif and minor fix

### 0.2.4

-   License added

### 0.2.3

-   Readme fix

### 0.2.2

-   Small Hotfix for new Commands

## 0.2.0

-   Added "Compute first Answer Set" Option
-   Added "Compute all Answer Sets" Option

### 0.1.2

-   Small Hotfix

### 0.1.1

-   Small Hotfix

### 0.1.0

-   Small Hotfix

## 0.0.1

Initial release

-   Single file support

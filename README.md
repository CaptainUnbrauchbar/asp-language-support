[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/CaptainUnbrauchbar/asp-language-support/badge)](https://scorecard.dev/viewer/?uri=github.com/CaptainUnbrauchbar/asp-language-support)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/10389/badge)](https://www.bestpractices.dev/projects/10389)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.png)](/LICENSE.md)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.16755874.png)](https://doi.org/10.5281/zenodo.16755874)

# Answer Set Programming Language Support (for Clingo)

[![Version on Marketplace](https://vsmarketplacebadges.dev/version-short/ffrankreiter.answer-set-programming-language-support.png)](https://marketplace.visualstudio.com/items?itemName=ffrankreiter.answer-set-programming-language-support)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/ffrankreiter.answer-set-programming-language-support.png)](https://marketplace.visualstudio.com/items?itemName=ffrankreiter.answer-set-programming-language-support)
[![Rating](https://vsmarketplacebadges.dev/rating-short/ffrankreiter.answer-set-programming-language-support.png)](https://marketplace.visualstudio.com/items?itemName=ffrankreiter.answer-set-programming-language-support)

| [Potassco](https://potassco.org/) | [Potassco on Github](https://github.com/potassco) | [Clingo](https://potassco.org/clingo/) | [Get it on Open VSX Registry](https://open-vsx.org/extension/ffrankreiter/answer-set-programming-language-support)

This Extension uses Clingo Answer Set Solver (bundled), developed by Potassco (University of Potsdam).
With v1.1.0 a running solve can be stopped, the output panel was rebuilt, and solver options moved into the panel itself.

## Usage

<img src="https://github.com/CaptainUnbrauchbar/asp-language-support/raw/informaticup/media/usage-demo-v1_1_0.gif" height="500" alt="demo-gif"/>

Just right click anywhere on a logic program (.lp) file and select `Compute all Answer Sets` or `Compute the first Answer Set`.
This will display Clingo's results in a seperate ASP tab located in the panel. You can also use the buttons in the top right of this tab to run bundled or PATH clingo depending on your `ASPLanguage: Use PATH Clingo` setting.

If you want to add **additional startup arguments**, open the **solver settings** with the gear in the panel toolbar. The answer set limit, time limits, parallel solving, constants, extra files and any custom clingo arguments are set there, and apply to `Compute all Answer Sets` and `Compute the first Answer Set`.

<img src="https://github.com/CaptainUnbrauchbar/asp-language-support/raw/informaticup/media/config-demo-v1_1_0.gif" height="500" alt="demo-gif"/>

If you need to work with **multiple files**, write `#include "other.lp".` in your program. This is ordinary clingo syntax, is resolved relative to the file it appears in, and needs no configuration.

If you already keep a **config.json**, point `ASPLanguage: Set Config` at it and use **Import from config.json** in the settings pane to bring its options across. **Export to config.json**, next to it, does the reverse and writes your current settings out as a file to share or commit. The file is looked up next to your program and in any folder above it, and `ASPLanguage: Initialize clingo config file in current working directory` _(Press Ctrl+Shift+P)_ still writes a sample one. Running a config file directly was removed in 1.1.0; the settings pane covers it.
See the Clingo [Documentation](https://github.com/potassco/guide/releases/download/v2.2.0/guide.pdf) (PDF) for more details on the available arguments!

If you want to use your own Version of Clingo from PATH with this extension, please enable `ASPLanguage: Use PATH Clingo` option in your settings. It gets the same output panel as the bundled solver: the extension asks it for clingo's JSON output and renders the answers, filter, comparison and statistics from that. The **Output format** setting in the pane chooses which of clingo's formats to ask for, and defaults to JSON because it is the only one answers can be read out of. Pick another, or ask for one in your custom arguments with `--outf`, `--text` or `--pre`, and the panel shows what clingo printed instead.

## Customization

<img src="https://github.com/CaptainUnbrauchbar/asp-language-support/raw/informaticup/media/customization-demo-v1_1_0.gif" height="500" alt="customization-gif"/>

When using the bundled WASM Clingo (Choose in configuration `ASPLanguage: Use PATH Clingo`), you can easily move the panel to the sidebars or change the panel position depending on your preferences.
The layout will adjust accordingly!

## Requirements

For the extension to work properly, please install the Answer Set Programming syntax highlighter by abelcour (abelcour.asp-syntax-highlight)
[Answer Set Syntax Highlighter](https://marketplace.visualstudio.com/items?itemName=abelcour.asp-syntax-highlight)

## Extension Settings

This extension contributes the following settings:

-   `ASPLanguage: Use PATH Clingo`: Set this option if you would like to use the Clingo version from your PATH instead of the version included! (default: False)
-   `ASPLanguage: Set Config`: Name of a clingo config file, looked up next to the .lp file you run and in any folder above it (e.g. `config.json`, default: empty)

Everything else is set in the panel's own settings, see below.

Which solver is in use is shown in the status bar while an ASP file is open, together with the clingo version once you have run something. Click it to compute all answer sets, or to stop a run in progress.

## Extension Features

This extension contributes the following features:

-   `Compute all Answer Sets`: Get every answer set for the current logic program file, or as many as the answer set limit allows, with `Ctrl+Shift+A` / `Cmd+Shift+A`
-   `Compute the first Answer Set`: Get the first answer set for the current logic program file, with `Ctrl+Shift+X` / `Cmd+Shift+X`
-   `Solver settings`: Open the panel's solver settings with the gear in its toolbar
-   `Stop the running Clingo solver`: Stop a run that is taking too long, either with the **Cancel** button on the progress notification, the stop button in the ASP panel or `Ctrl+Shift+S` / `Cmd+Shift+S`
-   `ASPLanguage: Show release notes`: Show what changed in this version again, after the one-time notice has been dismissed

### Solver settings

Click the gear in the ASP panel's toolbar, next to the run buttons, to set how many answer sets to compute, time limits, parallel solving, constants, extra files and custom clingo arguments. The settings are kept per workspace and are used by `Compute all Answer Sets` and `Compute the first Answer Set`, so no config file is needed for the usual case.

Not every clingo option survives being compiled to WebAssembly. Settings the bundled solver cannot honour are greyed out and say which solver they need, rather than being offered and then quietly ignored — switch on `ASPLanguage: Use PATH Clingo` and they become available again.

Two settings work differently than you might expect. The **time limit** is enforced by the extension rather than by clingo, whose own is inert under WebAssembly: the run is stopped and the answers found up to that point are kept. **Parallel solving** does work with the bundled solver, but only pays off on programs that take seconds rather than milliseconds — use four threads or more, and `split` mode when enumerating many answers.

An existing JSON config is not lost: **Import from config.json** in the settings pane copies it into the panel, and **Export to config.json** writes the panel's current settings back out, which is how a set of options gets handed to somebody else or committed next to a program. Exporting writes the same file importing reads — the name `ASPLanguage: Set Config` looks for, next to the program you have open — and asks first if that file already exists. `ASPLanguage: Initialize clingo config file in current working directory` still creates a sample one to start from. Running a config file directly was removed in 1.1.0, so the pane is now the single place solver options live.

To solve several files together, prefer `#include "other.lp".` in the program itself: it is plain clingo syntax and needs no configuration at all.

### The ASP output panel

The panel header stays put while you scroll and holds everything you need for a result:

-   a **result badge** (green when satisfiable, red when not) next to the model count, solve time and clingo version
-   **Compare answer sets** dims the atoms that every answer agrees on and highlights what actually tells them apart, marking atoms that occur in only a single answer
-   a **filter box** that narrows results to the answers containing a matching atom, shown in full with the match highlighted. The toggle inside it switches to highlighting only, keeping every answer on screen so you can see where a match sits among the rest
-   **Copy** for a single answer or, from the `...` menu, for all of them or only the ones that matched the filter
-   large results stay responsive: the first 500 answer sets are rendered while the true total is reported, and `Copy all` still gives you every one
-   **solver statistics**, when the statistics level is set above zero, in a collapsible section under the toolbar
-   the **command line** the run used, in a collapsible section of its own. Options come from the pane, the custom arguments field and an imported config between them, so the one line saying what clingo was actually asked is worth having when a result surprises you

## Contributing

If you have any suggestions for a new feature or anything else please open an issue on GitHub: [ASP-LANGUAGE-SUPPORT](https://github.com/CaptainUnbrauchbar/asp-language-support/issues)
The repository is being actively maintained and pull requests are welcome anytime. If you don't receive feedback within 48h feel free to also email one of the codeowners!

View the [CONTRIBUTING.md](https://github.com/CaptainUnbrauchbar/asp-language-support/blob/informaticup/CONTRIBUTING.md) for more info on **Pull Requests**.

## Acknowledgements

[Clingo](https://potassco.org/clingo/) was developed by [Potassco](https://potassco.org/).
This extension uses Clingo compiled to WebAssembly by [Dominik Moritz](https://github.com/domoritz/clingo-wasm).

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
We added multi-file support with v0.4.0!

## Usage

<img src="https://github.com/CaptainUnbrauchbar/asp-language-support/raw/informaticup/media/usage-demo.gif" height="500" alt="demo-gif"/>

Just right click anywhere on a logic program (.lp) file and select `Compute all Answer Sets`, `Compute the first Answer Set` or `Compute Answer Sets (config.json)`.
This will display Clingo's results in a seperate ASP tab located in the panel. You can also use the buttons in the top right of this tab to run bundled or PATH clingo depending on your `ASPLanguage: Use PATH Clingo` setting.

If you want to add **additional startup arguments**, open the **solver settings** with the gear in the panel toolbar. Time limits, parallel solving, constants, extra files and any custom clingo arguments are set there, and apply to `Compute all Answer Sets` and `Compute the first Answer Set`.

If you need to work with **multiple files**, write `#include "other.lp".` in your program. This is ordinary clingo syntax, is resolved relative to the file it appears in, and needs no configuration.

A **config.json** is still fully supported for projects that prefer to commit their options: generate one with the `ASPLanguage: Initialize clingo config file in current working directory` command _(Press Ctrl+Shift+P)_, point `ASPLanguage: Set Config` at it, and run it with `Compute Answer Sets (config.json)`. The file is looked up next to your program and in any folder above it. **Import from config.json** in the settings pane copies an existing one into the panel.
See the Clingo [Documentation](https://github.com/potassco/guide/releases/download/v2.2.0/guide.pdf) (PDF) for more details on the available arguments!

If you want to use your own Version of Clingo from PATH with this extension, please enable `ASPLanguage: Use PATH Clingo` option in your settings.

## Customization

<img src="https://github.com/CaptainUnbrauchbar/asp-language-support/raw/informaticup/media/customization-demo.gif" height="500" alt="customization-gif"/>

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

-   `Compute all Answer Sets`: Get all answer sets for the current logic program file!
-   `Compute the first Answer Set`: Get the first answer set for the current logic program file!
-   `Compute Answer Sets (config.json)`: Compute answer sets using the clingo configuration from a config file
-   `Stop the running Clingo solver`: Stop a run that is taking too long, either with the **Cancel** button on the progress notification, the stop button in the ASP panel or `Ctrl+Shift+S` / `Cmd+Shift+S`

### Solver settings

Click the gear in the ASP panel's toolbar, next to the run buttons, to set time limits, parallel solving, constants, extra files and custom clingo arguments. The settings are kept per workspace and are used by `Compute all Answer Sets` and `Compute the first Answer Set`, so no config file is needed for the usual case.

Not every clingo option survives being compiled to WebAssembly. Settings the bundled solver cannot honour are greyed out and say which solver they need, rather than being offered and then quietly ignored — switch on `ASPLanguage: Use PATH Clingo` and they become available again. The **time limit** is the exception: clingo's own is inert under WebAssembly, so the extension enforces it by stopping the solver itself and keeping the answers found up to that point.

The JSON config still works exactly as before: `Compute Answer Sets (config.json)` keeps reading the file, and `ASPLanguage: Initialize clingo config file in current working directory` still creates one. If you already have a config, **Import from config.json** in the settings pane copies it into the panel for you.

To solve several files together, prefer `#include "other.lp".` in the program itself: it is plain clingo syntax and needs no configuration at all.

### The ASP output panel

The panel header stays put while you scroll and holds everything you need for a result:

-   a **result badge** (green when satisfiable, red when not) next to the model count, solve time and clingo version
-   **Compare answer sets** dims the atoms that every answer agrees on and highlights what actually tells them apart, marking atoms that occur in only a single answer
-   a **filter box** that narrows results to matching atoms and highlights what matched
-   **Copy** for a single answer or, from the `...` menu, for all or only the filtered ones
-   large results stay responsive: the first 500 answer sets are rendered while the true total is reported, and `Copy all` still gives you every one
-   **solver statistics**, when the statistics level is set above zero, in a collapsible section under the toolbar

## Contributing

If you have any suggestions for a new feature or anything else please open an issue on GitHub: [ASP-LANGUAGE-SUPPORT](https://github.com/CaptainUnbrauchbar/asp-language-support/issues)
The repository is being actively maintained and pull requests are welcome anytime. If you don't receive feedback within 48h feel free to also email one of the codeowners!

View the [CONTRIBUTING.md](https://github.com/CaptainUnbrauchbar/asp-language-support/blob/informaticup/CONTRIBUTING.md) for more info on **Pull Requests**.

## Acknowledgements

[Clingo](https://potassco.org/clingo/) was developed by [Potassco](https://potassco.org/).
This extension uses Clingo compiled to WebAssembly by [Dominik Moritz](https://github.com/domoritz/clingo-wasm).

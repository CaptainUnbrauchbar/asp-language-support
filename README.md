[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/CaptainUnbrauchbar/asp-language-support/badge)](https://scorecard.dev/viewer/?uri=github.com/CaptainUnbrauchbar/asp-language-support)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](/LICENSE.md)
[![Version on Marketplace](https://vsmarketplacebadges.dev/version-short/ffrankreiter.answer-set-programming-language-support.svg)](https://marketplace.visualstudio.com/items?itemName=ffrankreiter.answer-set-programming-language-support)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/ffrankreiter.answer-set-programming-language-support.svg)](https://marketplace.visualstudio.com/items?itemName=ffrankreiter.answer-set-programming-language-support)
[![Rating](https://vsmarketplacebadges.dev/rating-short/ffrankreiter.answer-set-programming-language-support.svg)](https://marketplace.visualstudio.com/items?itemName=ffrankreiter.answer-set-programming-language-support)


# Answer Set Programming Language Support (for Clingo)

| [Potassco](https://potassco.org/) | [Potassco on Github](https://github.com/potassco) | [Clingo](https://potassco.org/clingo/) |

This Extension uses Clingo Answer Set Solver (bundled), developed by Potassco (University of Potsdam).
We added multi-file support with v0.4.0!

## Usage

Just right click anywhere on a logic program (.lp) file and select `Compute all Answer Sets`, `Compute the first Answer Set` or `Compute Answer Sets (config.json)`.
This will display Clingo's results in a seperate ASP tab located in the panel. You can also use the buttons in the top right of this tab to run bundled or PATH clingo depending on your `ASPLanguage: Use PATH Clingo` setting.

If you want to add **additional startup arguments** you can use the `Compute Answer Sets (config.json)` option.
For this, you can generate a **sample config.json** file with the `ASPLanguage: Initialize clingo config file in current working directory` command _(Press Ctrl+Shift+P)_.

This will create a config file with all supported arguments/settings in your current working directory.
If you want to use your **own config file**, just change the config file name in the extension settings (`ASPLanguage: Set Config`).
Additionally you can use **arguments not directly supported** by the config.json by passing them in the **"customArgs" setting** as a string.

If you need to work with multiple files specify them in **additional files** in this config file using the relative path from the current working directory.
See the Clingo [Documentation](https://github.com/potassco/guide/releases/download/v2.2.0/guide.pdf) (PDF) for more details on the config settings!

If you want to use your own Version of Clingo from PATH with this extension, please enable `ASPLanguage: Use PATH Clingo` option in your settings.

## Requirements

For the extension to work properly, please install the Answer Set Programming syntax highlighter by abelcour (abelcour.asp-syntax-highlight)
[Answer Set Syntax Highlighter](https://marketplace.visualstudio.com/items?itemName=abelcour.asp-syntax-highlight)

## Extension Settings

This extension contributes the following settings:

- `ASPLanguage: Select Operating System`: Select your Operating System, so the currect clingo version is used! (default: Auto)
- `ASPLanguage: Terminal Mode`: Select if you want a new Terminal after every execution! (default: False)
- `ASPLanguage: Use PATH Clingo`: Set this option if you would like to use the Clingo version from your PATH instead of the version included! (default: False)
- `ASPLanguage: Turn Messages Off`: Set this option if you want to turn off all Messages (bottom right)! (default: False)
- `ASPLanguage: Set Config`: Set a .json file if you want to use a specific config file for clingo (default: empty)

## Extension Features

This extension contributes the following features:

- `Compute all Answer Sets`: Get all answer sets for the current logic program file!
- `Compute the first Answer Set`: Get the first answer set for the current logic program file!
- `Compute Answer Sets (config.json)`: Compute answer sets using the clingo configuration from a config file

## Contributing

If you have any suggestions for a new feature or anything else please open an issue on GitHub: [ASP-LANGUAGE-SUPPORT](https://github.com/CaptainUnbrauchbar/asp-language-support)
As this repository is actively being maintained Pull Requests are also welcome anytime, if you don't receive feedback within 48h feel free to also email one of the codeowners!

## Acknowledgements

[Clingo](https://potassco.org/clingo/) was developed by [Potassco](https://potassco.org/).
This extension uses Clingo compiled to WebAssembly by [Dominik Moritz](https://github.com/domoritz/clingo-wasm).

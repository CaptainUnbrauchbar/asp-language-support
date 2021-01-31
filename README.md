# Answer Set Programming Language Support (for Clingo)

## Features

[Potassco](https://potassco.org/) [Clingo](https://potassco.org/clingo/)

This Extension uses Clingo Answer Set Solver (bundled), developed by Potassco (University of Potsdam).
We added multi-file support with v0.4.0!

If you have any suggestions for a new feature or anything else please E-Mail me: frankreiter@uni-potsdam.de

## Usage

Just right click anywhere on a logic program (.lp) file and select "> Compute all Answer Sets" or "> Compute the first Answer Set".
A new Terminal will open with the results!

If you want to use your own Version of Clingo with this extension please enable **"Use PATH Clingo"** Option in settings!

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

- `> Compute all Answer Sets`: Get all answer sets for the current logic program file!
- `> Compute the first Answer Set`: Get the first answer set for the current logic program file!
- `> Compute Answer Sets (config.json)`: Compute answer sets using the clingo configuration from a config file

## 0.4.0

- Added Option to use a configuration file for clingo arguments
- Added VSCode command to create sample config file

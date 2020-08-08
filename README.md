# Answer Set Programming Language Support (for Clingo)

## Features

![Showcase](https://raw.githubusercontent.com/CaptainUnbrauchbar/asp-language-support/master/images/19286215.png)

[Potassco](https://potassco.org/)            [Clingo](https://potassco.org/clingo/)

This Extension uses Clingo Answer Set Solver, developed by Potassco (University of Potsdam).
Currently only single-file execution is supported. This will hopefully change in the future!

If you have any suggestions for a multi-file execution feature or anything else please E-Mail me: frankreiter@uni-potsdam.de

## Usage

Just right click anywhere on a logic program (.lp) file and select "> Compute all Answer Sets" or "> Compute the first Answer Set".
A new Terminal will open with the results!

## Requirements

For the extension to work properly, please install the Answer Set Programming syntax highlighter by abelcour (abelcour.asp-syntax-highlight)

[Answer Set Syntax Highlighter](https://marketplace.visualstudio.com/items?itemName=abelcour.asp-syntax-highlight)

## Extension Settings

This extension contributes the following settings:

* `ASPLanguage: Select Operating System`: Select your Operating System, so the currect clingo version is used!
* `ASPLanguage: Terminal Mode`: Select if you want a new Terminal after every execution!

## Extension Features

This extension contributes the following features:

* `> Compute all Answer Sets`: Get all answer sets for the current logic program file!
* `> Compute the first Answer Set`: Get the first answer set for the current logic program file!

### 0.2.8

- Added Option to create a new Terminal after every execution
- Minor fixes
- When you close all terminals running a file will now create a new one

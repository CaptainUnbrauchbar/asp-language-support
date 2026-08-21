# Change Log

All notable changes to the "answer-set-programming-language-support" extension will be documented in this file.

## Future / Planned

If you want to contribute to the repository you are welcome to look at these planned features on your own fork :)

-   **QoL**: Adjust the webview UI colours so they work best with any selected colour theme
-   **Testing**: Find a way to do proper Integration Testing that works with CI/CD (currently only local and limited functionality because of the webview UI)
-   **Localization**: Look into localization need/techniques and translate text

## 1.1.0: Stoppable Solving and a Rebuilt Output Panel :octagonal_sign:

-   **A running Clingo solve process can now be stopped**, from the progress notification, the panel toolbar or `Ctrl+Shift+S`, and it keeps the answers found so far. The notification now reports how many models have been found
-   **UI Overhaul**: Completely rebuilt the output panel to fit the VSCode Design Language, fully compatible with bundled and PATH clingo, use any version you want
-   Added a **Solver Settings Pane** to the ASP panel: answer set limit, time limits, parallel solving, constants, additional files and custom arguments, stored per workspace, so the everyday case needs no config file at all. A config.json can still be **imported and exported**; the `Compute Answer Sets (config.json)` command and its shortcut were removed
-   **Include additional files with `#include "other.lp".` without using the config**, resolved recursively and relative to the including file
-   Many fixes, including `solveLimit` being ignored, crashes on a missing `models` or an empty result, a phantom "Answer 1/1" on unsatisfiable runs, and unreadable config file validation errors
-   Updated [**WASM Clingo**](https://github.com/domoritz/clingo-wasm) from 0.3.2 to 0.6.0, which **requires VSCode 1.94 or newer** (was 1.63)

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

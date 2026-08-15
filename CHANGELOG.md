# Change Log

All notable changes to the "answer-set-programming-language-support" extension will be documented in this file.

## Future / Planned

If you want to contribute to the repository you are welcome to look at these planned features on your own fork :)

-   **QoL**: Adjust the webview UI colours so they work best with any selected colour theme
-   **Testing**: Add more Unit Tests
-   **Testing**: Find a way to do proper Integration Testing that works with CI/CD (currently only local and limited functionality because of the webview UI)
-   **Localization**: Look into localization need/techniques and translate text
-   **Bug**: Verify/Fix that all parameters in the ASP config.json created by this extension actually work properly and/or are still supported by clingo

## 1.1.0: Stoppable Solving :octagonal_sign:

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

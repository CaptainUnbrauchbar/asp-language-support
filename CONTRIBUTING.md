# Contributing to the Repository

To find features or bugs to work on, check the [CHANGELOG.md](https://github.com/CaptainUnbrauchbar/asp-language-support/blob/informaticup/CHANGELOG.md) **"Future / Planned"** section!

## DOs and DON'Ts

Please do:

-   DO follow our coding style and use the appropiate settings (tab width 4, print width 140)!
-   DO give priority to the style of the project (files, structure, folders) even if its differnt from current norms.
-   DO start a discussion/issue before working on a larger change/feature/bugfix so we can agree on a solution.
-   DO test your changes locally with the included Unit and Integration Tests.
-   DO have fun coding and contributing! 😸

Please do not:

-   DO NOT commit code that you didn't write.
-   DO NOT hesitate to ask questions about anything that is unclear, we love to help out!

## Coding Style

Please use JS Prettier to format your code, you can get the code formatter directly from the VSCode Marketplace: [Prettier - Code formatter](https://marketplace.visualstudio.com/items/?itemName=esbenp.prettier-vscode)

You can find the settings in the repository .vscode folder: [settings.json](https://github.com/CaptainUnbrauchbar/asp-language-support/blob/informaticup/.vscode/settings.json)

## Commit Messages

Feel free to use [Conventional Commits](https://marketplace.visualstudio.com/items/?itemName=vivaxy.vscode-conventional-commits) for your changes but this is not required. Keep them short and meaningful!

## Automated Code Review Assistance

We are using SEMGREP to highlight general and security issues in the repository code, feel free to integrate this in your workflow.

## Test Policy

Unit Tests are required for major features that contribute their own sections of code. In any other case feel free to open a discussion if it makes sense to introduce new tests.

`npm test` runs everything under `src/unitTests` and `src/panelTests`, and is what CI runs on every push.

### After changing the output panel

`src/panelTests` runs the panel's own script, `media/main.js`, against a real DOM under jsdom. The markup comes from `WebviewProvider` rather than from a copy, so renaming a control in the HTML fails these tests instead of quietly detaching it from its handler.

The results they render are recorded clingo output in `src/panelTests/fixtures`, not hand written shapes, so a field the solver renames shows up as a failing panel test. Regenerate them with `npm run fixtures:panel` after a `clingo-wasm` upgrade and read the diff. `npm run test:panel` runs only this folder.

### After changing the bundled solver

`npm run probe:settings` runs every solver setting against the bundled WASM clingo and reports which ones it honours, ignores, or rejects outright. Options that WebAssembly cannot support are accepted and then silently do nothing, so running them is the only way to tell them apart.

**Run it after every `clingo-wasm` upgrade.** It fails when an option stops behaving as recorded, which is the signal to update both the cases in `scripts/probe-settings.mjs` and the `backends` markers in `src/solverSettings.js`. It takes about a minute, mostly waiting for one deliberately slow instance, so it is not part of `npm test`.

## Thank You

For taking the time to improve our project and for your appreciation! :smile:

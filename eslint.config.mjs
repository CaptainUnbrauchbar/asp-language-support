import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * The extension is three kinds of JavaScript in one repository, and each one
 * only makes sense with its own globals: the extension host is CommonJS on
 * NodeJS, the panel in media/ is browser script loaded by a webview, and the
 * tests bring Jest or Mocha with them. Linting the lot as browser code reported
 * over a thousand undefined names that were all perfectly defined.
 */
export default defineConfig([
    // A whole downloaded VSCode lives here, with configs of its own that ESLint
    // tries to load and cannot resolve
    globalIgnores([".vscode-test/**"]),

    // The extension host
    {
        files: ["src/**/*.js", "*.js", ".vscode-test.js"],
        plugins: { js },
        extends: ["js/recommended"],
        languageOptions: { sourceType: "commonjs", globals: globals.node },
    },

    // Development tooling, run from a checkout
    {
        files: ["**/*.mjs"],
        plugins: { js },
        extends: ["js/recommended"],
        languageOptions: { sourceType: "module", globals: globals.node },
    },

    // The output panel, which runs inside the webview
    {
        files: ["media/**/*.js"],
        plugins: { js },
        extends: ["js/recommended"],
        languageOptions: {
            sourceType: "script",
            globals: { ...globals.browser, acquireVsCodeApi: "readonly" },
        },
    },

    // Jest suites, which are CommonJS on NodeJS like the code they exercise
    {
        files: ["src/unitTests/**/*.js", "src/panelTests/**/*.js"],
        languageOptions: { globals: { ...globals.node, ...globals.jest } },
    },

    // The panel suites additionally drive a jsdom document
    {
        files: ["src/panelTests/**/*.js"],
        languageOptions: { globals: globals.browser },
    },

    // The end to end suite runs in a real extension host, under Mocha's TDD interface
    {
        files: ["src/integrationTests/**/*.js"],
        languageOptions: { globals: { ...globals.node, ...globals.mocha } },
    },
]);

// @ts-nocheck
const fs = require("fs");
const { resolvePatterns, resolveInside, matchesGlob } = require("../filePatterns.js");

const BASE = process.platform === "win32" ? "C:\\work" : "/work";

/** Serves a flat workspace listing so the tests need nothing on disk. */
function workspace(names) {
    jest.spyOn(fs, "readdirSync").mockImplementation((directory) => {
        const prefix = String(directory).replace(/\\/g, "/").replace(BASE.replace(/\\/g, "/"), "").replace(/^\//, "");
        const here = new Map();
        for (const name of names) {
            const rest = prefix ? (name.startsWith(`${prefix}/`) ? name.slice(prefix.length + 1) : undefined) : name;
            if (rest === undefined) {
                continue;
            }
            const slash = rest.indexOf("/");
            if (slash === -1) {
                here.set(rest, false);
            } else {
                here.set(rest.slice(0, slash), true);
            }
        }
        return [...here].map(([name, isDirectory]) => ({ name, isDirectory: () => isDirectory }));
    });
}

afterEach(() => jest.restoreAllMocks());

describe("matchesGlob", () => {
    it.each([
        ["*.lp", "a.lp", true],
        ["*.lp", "sub/a.lp", false],
        ["instances/*.lp", "instances/a.lp", true],
        ["instances/*.lp", "instances/deep/a.lp", false],
        ["**/x.lp", "x.lp", true],
        ["**/x.lp", "a/b/x.lp", true],
        ["**/x.lp", "a/b/y.lp", false],
        ["src/**/x.lp", "src/x.lp", true],
        ["src/**/x.lp", "src/a/b/x.lp", true],
        ["?.lp", "a.lp", true],
        ["?.lp", "ab.lp", false],
        ["?.lp", "a/b.lp", false],
    ])("matches %s against %s", (pattern, path, expected) => {
        expect(matchesGlob(pattern, path)).toBe(expected);
    });

    it("treats regex punctuation in a pattern as ordinary characters", () => {
        expect(matchesGlob("a.b+c(1).lp", "a.b+c(1).lp")).toBe(true);
        expect(matchesGlob("a.b+c(1).lp", "aXbYcZ1Z.lp")).toBe(false);
    });

    it("answers a pattern built to backtrack without hanging", () => {
        // Compiled to a regular expression, this pattern needs exponential time on
        // a name that almost matches, which is enough to wedge the extension host.
        // Patterns arrive from a config file that travels with the workspace.
        const started = Date.now();

        expect(matchesGlob("*a*a*a*a*a*a*a*a*a*a*b.lp", `${"a".repeat(64)}c.lp`)).toBe(false);
        expect(matchesGlob("**/**/**/**/**/**/**/**/**/**/q.lp", `${"x/".repeat(64)}z.lp`)).toBe(false);

        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe("resolveInside", () => {
    it("resolves an entry below the base directory", () => {
        expect(resolveInside(BASE, "instances/a.lp")).toEqual(require("path").join(BASE, "instances", "a.lp"));
    });

    it.each(["../../../etc/passwd", "sub/../../../etc/passwd", "/etc/passwd", ".."])(
        "refuses %s, which leads out of the base directory",
        (entry) => {
            expect(resolveInside(BASE, entry)).toBeUndefined();
        }
    );
});

describe("resolvePatterns", () => {
    it("resolves a plain entry against the base directory", () => {
        workspace(["lib.lp"]);

        expect(resolvePatterns(BASE, ["lib.lp"]).files).toEqual([require("path").join(BASE, "lib.lp")]);
    });

    it("expands a glob to every file it matches, in a stable order", () => {
        workspace(["instances/b.lp", "instances/a.lp", "other.lp"]);

        const { files } = resolvePatterns(BASE, ["instances/*.lp"]);

        expect(files).toEqual([
            require("path").join(BASE, "instances", "a.lp"),
            require("path").join(BASE, "instances", "b.lp"),
        ]);
    });

    it("reports an entry that reaches outside the workspace instead of reading it", () => {
        workspace(["lib.lp"]);

        const { files, unmatched } = resolvePatterns(BASE, ["../../../etc/passwd"]);

        expect(files).toEqual([]);
        expect(unmatched).toEqual(["../../../etc/passwd"]);
    });

    it("still reports a pattern that matches nothing", () => {
        workspace(["lib.lp"]);

        expect(resolvePatterns(BASE, ["missing/*.lp"]).unmatched).toEqual(["missing/*.lp"]);
    });
});

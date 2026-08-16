// @ts-nocheck
const { resolveIncludes, mapMessagePositions } = require("../resolveIncludes.js");

/**
 * Serves a virtual project so the tests do not need fixtures on disk.
 * Keys are posix-ish paths; lookups are normalised the same way.
 * @param {Object} files
 */
function reader(files) {
    return (path) => {
        const key = path.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
        if (!(key in files)) {
            throw new Error(`ENOENT ${key}`);
        }
        return files[key];
    };
}

describe("resolveIncludes", () => {
    it("leaves a program without includes alone", () => {
        const result = resolveIncludes("/p/main.lp", reader({ "/p/main.lp": "a.\nb :- a." }));

        expect(result.program).toEqual("a.\nb :- a.");
        expect(result.errors).toEqual([]);
        expect(result.files).toHaveLength(1);
    });

    it("inlines a quoted include in place", () => {
        const result = resolveIncludes(
            "/p/main.lp",
            reader({ "/p/main.lp": 'before.\n#include "lib.lp".\nafter.', "/p/lib.lp": "shared." })
        );

        expect(result.program).toEqual("before.\nshared.\nafter.");
    });

    it("resolves nested includes relative to the file that asked for them", () => {
        const result = resolveIncludes(
            "/p/main.lp",
            reader({
                "/p/main.lp": '#include "sub/a.lp".',
                "/p/sub/a.lp": 'a.\n#include "b.lp".',
                "/p/sub/b.lp": "b.",
            })
        );

        expect(result.program).toEqual("a.\nb.");
    });

    it("includes a file shared by two parents only once", () => {
        const result = resolveIncludes(
            "/p/main.lp",
            reader({
                "/p/main.lp": '#include "a.lp".\n#include "b.lp".',
                "/p/a.lp": '#include "common.lp".\na.',
                "/p/b.lp": '#include "common.lp".\nb.',
                "/p/common.lp": "common.",
            })
        );

        // duplicating the shared rules would change the program
        expect(result.program).toEqual("common.\na.\nb.");
    });

    it("does not hang on a cycle", () => {
        const result = resolveIncludes(
            "/p/a.lp",
            reader({ "/p/a.lp": 'a.\n#include "b.lp".', "/p/b.lp": 'b.\n#include "a.lp".' })
        );

        expect(result.program).toEqual("a.\nb.");
    });

    it("leaves clingo's built-in includes for clingo to handle", () => {
        const result = resolveIncludes("/p/main.lp", reader({ "/p/main.lp": "#include <incmode>.\na." }));

        expect(result.program).toEqual("#include <incmode>.\na.");
    });

    it("reports an include that cannot be read instead of dropping it", () => {
        const result = resolveIncludes("/p/main.lp", reader({ "/p/main.lp": '#include "missing.lp".\na.' }));

        expect(result.errors).toEqual(["missing.lp"]);
    });

    it("maps every produced line back to the file it came from", () => {
        const result = resolveIncludes(
            "/p/main.lp",
            reader({ "/p/main.lp": 'x.\n#include "lib.lp".\ny.', "/p/lib.lp": "p.\nq." })
        );

        expect(result.program.split("\n")).toEqual(["x.", "p.", "q.", "y."]);
        expect(result.lineMap).toEqual([
            { file: "main.lp", line: 1 },
            { file: "lib.lp", line: 1 },
            { file: "lib.lp", line: 2 },
            { file: "main.lp", line: 3 },
        ]);
    });
});

describe("mapMessagePositions", () => {
    const lineMap = [
        { file: "main.lp", line: 1 },
        { file: "lib.lp", line: 7 },
        { file: "main.lp", line: 3 },
    ];

    it("rewrites a clingo position to the real file and line", () => {
        // clingo counts lines in the single program it was handed
        expect(mapMessagePositions("-:2:6-8: error: syntax error", lineMap)).toEqual("lib.lp:7:6-8: error: syntax error");
    });

    it("rewrites every position in a multi line message", () => {
        const mapped = mapMessagePositions("-:1:1-2: info: first\n-:3:4-5: info: second", lineMap);

        expect(mapped).toEqual("main.lp:1:1-2: info: first\nmain.lp:3:4-5: info: second");
    });

    it("leaves a position it cannot map untouched", () => {
        expect(mapMessagePositions("-:99:1-2: error: boom", lineMap)).toEqual("-:99:1-2: error: boom");
    });

    it("survives empty input", () => {
        expect(mapMessagePositions(undefined, lineMap)).toEqual("");
        expect(mapMessagePositions("no positions here", lineMap)).toEqual("no positions here");
    });
});

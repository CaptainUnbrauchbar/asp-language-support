// @ts-nocheck
const { join } = require("path");
const { formatClingoCommand } = require("../clingoCommand.js");

describe("formatClingoCommand", () => {
    it("renders the bundled solver the way clingo-wasm invokes it", () => {
        // clingo-wasm builds "--outf=2 <options> <models>" and hands the program
        // over as text, so the JSON flag leads and the count trails
        expect(
            formatClingoCommand({
                programs: ["program.lp"],
                models: 0,
                options: ["--time-limit=30", "--const n=3"],
                backend: "wasm",
            })
        ).toEqual("clingo --outf=2 --time-limit=30 --const n=3 program.lp 0");
    });

    it("renders your own clingo the way it is spawned", () => {
        // The binary is spawned with the file and the count ahead of the options,
        // and prints its own format rather than the JSON the bundled one returns
        expect(
            formatClingoCommand({
                programs: ["program.lp"],
                models: 1,
                options: ["--stats=2"],
                backend: "path",
            })
        ).toEqual("clingo program.lp 1 --stats=2");
    });

    it("shows the file name rather than the path it came from", () => {
        // A full path is routinely longer than everything else on the line, and
        // the line is read to see the options
        const command = formatClingoCommand({ programs: [join("/very/long/path", "program.lp")] });

        expect(command).toContain("program.lp");
        expect(command).not.toContain("long");
    });

    it("quotes a file name that would otherwise look like two", () => {
        expect(formatClingoCommand({ programs: ["my program.lp"] })).toContain('"my program.lp"');
    });

    it("leaves the options exactly as clingo was given them", () => {
        // "--const n=3" and "--parallel-mode 4,split" are single arguments that
        // happen to contain a space, so quoting them would change what they mean
        const command = formatClingoCommand({ options: ["--parallel-mode 4,split"], backend: "wasm" });

        expect(command).toContain("--parallel-mode 4,split");
        expect(command).not.toContain('"--parallel-mode');
    });

    it("lists every file that makes up the program", () => {
        const command = formatClingoCommand({ programs: ["program.lp", "lib.lp", "instance.lp"] });

        expect(command).toEqual("clingo --outf=2 program.lp lib.lp instance.lp 0");
    });

    it("says 0 for a run with no model limit, as clingo does", () => {
        expect(formatClingoCommand({ programs: ["a.lp"] })).toMatch(/ 0$/);
        expect(formatClingoCommand({ programs: ["a.lp"], models: 5 })).toMatch(/ 5$/);
    });

    it("produces something sensible when told nothing at all", () => {
        expect(formatClingoCommand()).toEqual("clingo --outf=2 0");
        expect(formatClingoCommand({ programs: undefined, options: undefined })).toEqual("clingo --outf=2 0");
    });
});

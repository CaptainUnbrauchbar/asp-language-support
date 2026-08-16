// @ts-nocheck
const { extractWitnesses } = require("../clingoWitnesses.js");

/** What clingo streams with --outf=2, built so a test can cut it anywhere. */
function reply(answers) {
    return JSON.stringify({
        Solver: "clingo version 5.7.1",
        Call: [{ Witnesses: answers.map((Value) => ({ Value })) }],
        Result: "SATISFIABLE",
        Models: { Number: answers.length, More: "no" },
    });
}

describe("extractWitnesses", () => {
    it("finds the answer sets in a complete reply", () => {
        const { witnesses, total } = extractWitnesses(reply([["a"], ["a", "b"]]));

        expect(witnesses).toEqual([["a"], ["a", "b"]]);
        expect(total).toEqual(2);
    });

    it("finds the ones already written when the output was cut off", () => {
        // Which is what a stopped run leaves behind: clingo writes each answer as
        // it finds it, so only the last can be half written
        const cut = reply([["a"], ["b"], ["c"]]).slice(0, -30);

        expect(extractWitnesses(cut).witnesses.length).toBeGreaterThan(0);
    });

    it("drops only the answer that was half written", () => {
        const whole = reply([["a"], ["b"]]);
        // Cut in the middle of the second answer
        const cut = whole.slice(0, whole.indexOf('{"Value":["b"]}') + 8);

        expect(extractWitnesses(cut).witnesses).toEqual([["a"]]);
    });

    it("is not confused by an atom containing brackets or quotes", () => {
        // Structural characters inside a string are text, not structure
        const answers = [['f("}",g)'], ["h([1,2])"]];

        expect(extractWitnesses(reply(answers)).witnesses).toEqual(answers);
    });

    it("keeps only as many as it is allowed, but counts them all", () => {
        // A program producing answers faster than anyone can read them should not
        // be able to fill memory on the way to a panel that renders far fewer
        const { witnesses, total } = extractWitnesses(reply([["a"], ["b"], ["c"], ["d"]]), 2);

        expect(witnesses).toEqual([["a"], ["b"]]);
        expect(total).toEqual(4);
    });

    it("finds nothing in output that holds no answers", () => {
        expect(extractWitnesses("Answer: 1\na b\nSATISFIABLE").witnesses).toEqual([]);
        expect(extractWitnesses("").witnesses).toEqual([]);
        expect(extractWitnesses(undefined).witnesses).toEqual([]);
        // An unsatisfiable run reports no witnesses at all
        expect(extractWitnesses(reply([])).witnesses).toEqual([]);
    });

    it("ignores objects that only look like answers", () => {
        // "Witnesses" is what makes one, not the shape
        const notAnswers = JSON.stringify({ Result: "SATISFIABLE", Other: [{ Value: ["a"] }] });

        expect(extractWitnesses(notAnswers).witnesses).toEqual([]);
    });
});

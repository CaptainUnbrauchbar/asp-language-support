const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const { loadClingo, threadsAvailable } = require('../../clingoWasm.js');

suite ('Extension Test Suite', () => {
    test('Extension is activated', async () => {
        const extension = vscode.extensions.getExtension('ffrankreiter.answer-set-programming-language-support');
        await extension.activate();
        assert.ok(extension);
    });

    // Only a real extension host can answer this. clingo-wasm's own
    // supportsThreads() reports false when called from the host, because VSCode
    // does not give that process a `navigator` global, but the worker clingo
    // runs in has one and loads the threaded build regardless. Trusting the
    // host's answer switched off parallel solving for everyone, so this pins
    // down what the solver really does with the options.
    test('the bundled solver accepts clingo parallel options', async () => {
        const clingo = await loadClingo();
        const result = await clingo.run('{ x(1..6) }.', 0, ['--parallel-mode 4,split', '--stats=2']);

        assert.strictEqual(result.Result, 'SATISFIABLE', `clingo said: ${result.Error}`);
        // Threads that really ran report themselves in the statistics
        assert.ok(result.Stats && 'Thread' in result.Stats, `no Thread section in ${Object.keys(result.Stats ?? {})}`);
    });

    // Whatever the answer above, the parallel options must never fail a run
    test('solves with the bundled solver when asked for threads', async () => {
        const { runClingoWasmForFileWithProgress } = require('../../runClingoWasmForFileWithProgress.js');
        const stub = { window: { showErrorMessage: () => {}, showWarningMessage: () => {}, showInformationMessage: () => {} } };

        const result = await runClingoWasmForFileWithProgress(
            stub,
            { report: () => {} },
            path.join(__dirname, '../../testFiles/sudokuComplete.lp'),
            0,
            ['--parallel-mode 2,compete']
        );

        assert.ok(result, 'the run produced no result');
        assert.strictEqual(result.Result, 'SATISFIABLE');
        // A run that succeeded with the options must not leave them marked off
        assert.strictEqual(threadsAvailable(), true);
    });
});

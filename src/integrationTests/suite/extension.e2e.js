const assert = require('assert');
const vscode = require('vscode');

suite ('Extension Test Suite', () => {
    test('Extension is activated', async () => {
        const extension = vscode.extensions.getExtension('ffrankreiter.answer-set-programming-language-support');
        await extension.activate();
        assert.ok(extension);
    });
});
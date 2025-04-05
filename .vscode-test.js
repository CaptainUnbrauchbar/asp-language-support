// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({ files: 'src/integrationTests/suite/*.e2e.js' });
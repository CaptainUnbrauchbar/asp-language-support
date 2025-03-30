// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data;

        if (message.type === 'updateOutput') {
            const outputContainer = document.querySelector('.output-container');
            outputContainer.innerHTML = ''; // Clear previous content

            const result = message.answers;
            const cfgFile = message.cfgFile;

            // Create a container for metadata and config boxes
            const infoContainer = document.createElement('div');
            infoContainer.className = 'info-container'; // Flex container for metadata and config boxes

            // Create a metadata output box
            const metadataBox = document.createElement('textarea');
            metadataBox.className = 'info-box'; // Reuse the same styling as other output boxes
            metadataBox.readOnly = true;
            metadataBox.value = `
Solver: ${result.solver}
Models: ${result.models}
Calls: ${result.calls}
Time: Total: ${result.time.total}s, Solve: ${result.time.solve}s, Model: ${result.time.model}s
Result: ${result.result}
            `.trim(); // Format metadata as text
            metadataBox.style.height = '10em';

            // Append the metadata box to the info container
            infoContainer.appendChild(metadataBox);

            if (cfgFile) {
                // Create a config file output box
                const configBox = document.createElement('textarea');
                configBox.className = 'info-box'; // Reuse the same styling
                configBox.readOnly = true;
                configBox.value = `Config Options:\n${cfgFile.join('\n')}`;
                configBox.style.height = '10em';

                // Append the config box to the info container
                infoContainer.appendChild(configBox);
            }
            
            // Append the info container to the output container
            outputContainer.appendChild(infoContainer);

            // Loop through the answers and create output boxes
            result.answers.forEach((answer, index) => {
                const answerContainer = document.createElement('div');
                answerContainer.className = 'answer-container';

                const labelBox = document.createElement('div');
                labelBox.className = 'answer-label-box';
                labelBox.textContent = `Answer ${index + 1}`;
                answerContainer.appendChild(labelBox);

                const outputBox = document.createElement('textarea');
                outputBox.className = 'output-box';
                outputBox.readOnly = true;
                outputBox.value = answer;
                outputBox.style.height = '10em';
                answerContainer.appendChild(outputBox);
                outputContainer.appendChild(answerContainer);
            });
        }
        if (message.type === 'updateOutputString') {
            updateOutputBox(message.answers);
        }
    });

    /**
     * Updates the output box with the given text.
     * @param {string} text
     */
    function updateOutputBox(text) {
        const outputBox = document.querySelector('.output-box');
        outputBox.value = text;
    }

}());



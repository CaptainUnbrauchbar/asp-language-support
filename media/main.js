//@ts-check

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
            metadataBox.style.height = `7em`; // Adjust height to fit content

            // Append the metadata box to the output container
            outputContainer.appendChild(metadataBox);

            // Loop through the answers and create output boxes
            result.answers.forEach((answer, index) => {
                // Create a container for each answer
                const answerContainer = document.createElement('div');
                answerContainer.className = 'answer-container';

                // Create a box for the answer label
                const labelBox = document.createElement('div');
                labelBox.className = 'answer-label-box';
                labelBox.textContent = `Answer ${index + 1}`;
                answerContainer.appendChild(labelBox);

                // Create the output box for the answer
                const outputBox = document.createElement('textarea');
                outputBox.className = 'output-box';
                outputBox.readOnly = true;
                outputBox.value = answer;
                outputBox.style.height = '8em';

                answerContainer.appendChild(outputBox);

                // Append the answer container to the output container
                outputContainer.appendChild(answerContainer);
            });
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



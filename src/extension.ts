// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const wait = async (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const waitForStableCharacterCount = async (timeout = 15000) => {
    const start = Date.now();
    let previousCharacterCount = -1;
    let stableForOneSecond = false;

    while (Date.now() - start < timeout) {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            throw new Error('No active editor found.');
        }

        // Get the current character count
        const currentCharacterCount = editor.document.getText().length;

        if (currentCharacterCount === previousCharacterCount) {
            // If the character count hasn't changed, wait another second
            if (stableForOneSecond) {
                return true; // No change for one second; return success
            }
            stableForOneSecond = true;
        } else {
            // Character count changed; reset the stable flag
            stableForOneSecond = false;
        }

        previousCharacterCount = currentCharacterCount;

        // Wait for 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Timeout: Character count did not stabilize within the given time.');
};


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gentestcopilot" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('gentestcopilot.helloWorld', async() => {
	    const filePath = vscode.Uri.file('/Users/schaller/code/sqs_manual_experiment/Jsoup/src/main/java/org/jsoup/nodes/TextNode.java');

	        const document = await vscode.workspace.openTextDocument(filePath);
	        await vscode.window.showTextDocument(document);
			// vscode.window.showInformationMessage('File opened');
			await vscode.commands.executeCommand('github.copilot.chat.generateTests');
			await waitForStableCharacterCount();
			await vscode.commands.executeCommand('workbench.action.files.save');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

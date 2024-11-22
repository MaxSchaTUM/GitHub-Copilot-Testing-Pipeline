// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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
			vscode.window.showInformationMessage('File opened');
			await vscode.commands.executeCommand('github.copilot.chat.generateTests');
			await vscode.commands.executeCommand('workbench.action.files.save');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

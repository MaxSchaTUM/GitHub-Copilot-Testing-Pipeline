import * as vscode from "vscode";

const waitForStableCharacterCount = async (timeout = 15000) => {
  const start = Date.now();
  let previousCharacterCount = -1;
  let stableForOneSecond = false;

  while (Date.now() - start < timeout) {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      throw new Error("No active editor found.");
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
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    "Timeout: Character count did not stabilize within the given time."
  );
};
const BASE_PATH = "/Users/schaller/code/automated-generation-copilot";
const PROJECT_PATH = `${BASE_PATH}/jsoup`;
const CLASSES_PATH = `${BASE_PATH}/classes.txt`;

export function activate(context: vscode.ExtensionContext) {
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "gentestcopilot.helloWorld",
    async () => {
      const classes = await vscode.workspace.openTextDocument(CLASSES_PATH);
      const classesContent = classes.getText();
      const classesArray = classesContent.split("\n");

      for (const currentClass of classesArray) {
      }

      //   const terminal = vscode.window.createTerminal();
      //   terminal.show();
      //   terminal.sendText(`cd ${projectPath}`);
      //   terminal.sendText("git checkout start");

      vscode.window.showInformationMessage("Checked out branch start");
      // const document = await vscode.workspace.openTextDocument(filePath);
      // await vscode.window.showTextDocument(document);
      // // vscode.window.showInformationMessage('File opened');
      // await vscode.commands.executeCommand('github.copilot.chat.generateTests');
      // await waitForStableCharacterCount();
      // await vscode.commands.executeCommand('workbench.action.files.save');
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

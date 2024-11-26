import * as vscode from "vscode";
const waitForStableCharacterCount = async (timeout = 30000) => {
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(
    "Timeout: Character count did not stabilize within the given time."
  );
};
const BASE_PATH = "/Users/schaller/code/automated-generation-copilot";
const PROJECT_PATH = `${BASE_PATH}/jsoup`;
const CLASSES_PATH = `${BASE_PATH}/classes.txt`; // contains list of relative path to classes within a project, one per line

export function activate(context: vscode.ExtensionContext) {
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "gentestcopilot.helloWorld",

    async () => {
      // TODO, for now assume i change projects manually
      // open project in vscode workspace
      //   vscode.workspace.updateWorkspaceFolders(0, 0, {
      //     uri: vscode.Uri.file(PROJECT_PATH),
      //   });
      // get classes
      const classes = await vscode.workspace.openTextDocument(CLASSES_PATH);
      const classesContent = classes.getText();
      const classesArray = classesContent.split("\n");
      classesArray.pop(); // remove last empty element
      // prep terminal
      const terminal = vscode.window.createTerminal();
      terminal.show();
      terminal.sendText(`cd ${PROJECT_PATH}`);
      terminal.sendText(`git checkout master`); // TODO or main?

      for (const currentClass of classesArray) {
        const className = currentClass.split("/").pop();
        // create new branch
        terminal.sendText(`git branch ${className}`, true);
        terminal.sendText(`git checkout ${className}`, true);
        // delete test class if it exists
        // we use a simple heuristic for the name for now
        const testClass = currentClass
          .replace("main", "test")
          .replace(".java", "Test.java");
        terminal.sendText(`rm -rf ${testClass}`);

        const document = await vscode.workspace.openTextDocument(
          PROJECT_PATH + "/" + currentClass
        );
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand(
          "github.copilot.chat.generateTests"
        );
        await waitForStableCharacterCount();
        await vscode.commands.executeCommand("workbench.action.files.save");

        // +++++
        // TODO test via mvn
        // +++++

        // cleanup / reset
        terminal.sendText(
          'git add . && git commit -m "Did everything"' // TODO split up into more commits on the way?
        );
        terminal.sendText("git checkout master");
      }
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

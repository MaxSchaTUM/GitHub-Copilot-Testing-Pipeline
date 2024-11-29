import util from "util";
import * as vscode from "vscode";
const exec = util.promisify(require("child_process").exec);
const fs = require("fs");

const waitForStableCharacterCount = async (timeout = 30000) => {
  const start = Date.now();
  let previousCharacterCount = -1;

  while (Date.now() - start < timeout) {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      throw new Error("No active editor found.");
    }

    // Get the current character count
    const currentCharacterCount = editor.document.getText().length;

    if (currentCharacterCount === previousCharacterCount) {
      return true; // No change for one second; return success
    }

    previousCharacterCount = currentCharacterCount;

    // Wait for X second before checking again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(
    "Timeout: Character count did not stabilize within the given time."
  );
};
const BASE_PATH = "/Users/schaller/code/sqs_manual_experiment";
const PROJECT_PATH = `${BASE_PATH}/Jsoup`;
const CLASSES_PATH = `${BASE_PATH}/allClassPaths.txt`; // contains list of relative path to classes within a project, one per line
const REPORTS_FOLDER = `${BASE_PATH}/testReports/Jsoup`;
const LOG_FILE = `${BASE_PATH}/log.txt`;
const outputLog = fs.createWriteStream(LOG_FILE);
const errorsLog = fs.createWriteStream(LOG_FILE);
const LOGGER = new console.Console(outputLog, errorsLog);

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
      await exec(`git checkout master`, { cwd: PROJECT_PATH });

      for (const currentClass of classesArray) {
        // write to log file prosessing current class
        LOGGER.log(`Processing ${currentClass}`);
        try {
          const className = currentClass.split("/").pop();
          if (!className) {
            console.log("no class name found");
            continue;
          }
          // create new branch
          await exec(`git branch -f ${className}`, { cwd: PROJECT_PATH });
          await exec(`git checkout ${className}`, { cwd: PROJECT_PATH });
          // delete test class if it exists
          // we use a simple heuristic for the name for now
          const testClass = currentClass
            .replace("main", "test")
            .replace(".java", "Test.java");
          await exec(`rm -rf ${testClass}`, { cwd: PROJECT_PATH });
          const cutDocument = await vscode.workspace.openTextDocument(
            PROJECT_PATH + "/" + currentClass
          );
          await vscode.window.showTextDocument(cutDocument);
          await vscode.commands.executeCommand(
            "github.copilot.chat.generateTests"
          );
          await waitForStableCharacterCount();
          await vscode.commands.executeCommand("workbench.action.files.save"); // triggers auto import

          const testDocument = vscode.window.activeTextEditor?.document;
          if (!testDocument) {
            console.log("no test document found");
            continue;
          }
          const linesOfTestDocument = testDocument.getText().split("\n");
          for (let i = 0; i < linesOfTestDocument.length; i++) {
            const line = linesOfTestDocument[i];
            if (line.includes("package")) {
              // delete package line at current line
              await vscode.window.activeTextEditor?.edit((editBuilder) => {
                editBuilder.delete(testDocument.lineAt(i).range);
              });
              // insert at top
              await vscode.window.activeTextEditor?.edit((editBuilder) => {
                editBuilder.insert(new vscode.Position(0, 0), line + "\n");
              });
              break;
            }
          }

          await vscode.commands.executeCommand("workbench.action.files.save"); // save again because package was relocated

          const testClassName = className.replace(".java", "Test.java");
          await exec(
            `mvn test -Dtest=${testClassName} > ${REPORTS_FOLDER}/${testClassName}.testResult.txt`,
            { cwd: PROJECT_PATH }
          );

          // TODO split up into more commits on the way?
          await exec('git add . && git commit -m "Did everything"', {
            cwd: PROJECT_PATH,
          });
          await exec("git checkout master", { cwd: PROJECT_PATH });
        } catch (error) {
          console.log(error);
          // write error to file with timestamp
          const date = new Date();
          const errorMessage = `${date.toISOString()} ${error}`;
          LOGGER.log(errorMessage);
          await exec("git checkout -f master", { cwd: PROJECT_PATH });
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

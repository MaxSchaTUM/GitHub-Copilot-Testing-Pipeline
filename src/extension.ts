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
const CLASSES_PATH = `${BASE_PATH}/gentestcopilot/allClassPaths.txt`; // contains list of relative path to classes within a project, one per line
const REPORTS_FOLDER = `${BASE_PATH}/testReports/Jsoup`;
const LOG_FILE = `${BASE_PATH}/log.txt`;
// Custom logger function
function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  // Append the log message to the file
  fs.appendFileSync(LOG_FILE, logMessage);
}

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

      for (const currentClass of classesArray) {
        // start from clean state
        await execl(`git checkout -f master`);
        // write to log file prosessing current class
        try {
          const className = currentClass.split("/").pop();
          if (!className) {
            logToFile(`No class name found, Skipping class ${currentClass}`);
            continue;
          }
          // create new branch
          await execl(`git branch -f ${className}`);
          await execl(`git checkout ${className}`);
          // delete test class if it exists
          // we use a simple heuristic for the name for now
          const testClass = currentClass
            .replace("main", "test")
            .replace(".java", "Test.java");
          await execl(`rm -rf ${testClass}`);
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
            logToFile(`No test document found, Skipping class ${currentClass}`);
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

          // not using execl because manual handling of stderr
          logToFile(`Compiling all tests and running new test`);
          const { stderr, stdout, error } = await exec(
            `mvn test -Dtest=${testClassName}`,
            {
              cwd: PROJECT_PATH,
            }
          );
          if (error) {
            // LOG error
            logToFile(`Error compiling or running test: ${error}`);
            // write to report file
            fs.writeFileSync(
              `${REPORTS_FOLDER}/${testClassName}.failure.txt`,
              stderr
            );
          } else {
            // LOG success
            logToFile(`Tests compiled and ran successfully`);
            // write stdout to file
            fs.writeFileSync(
              `${REPORTS_FOLDER}/${testClassName}.success.txt`,
              stdout
            );
          }

          // TODO split up into more commits on the way?
          await execl('git add . && git commit -m "Did everything"');
        } catch (error) {
          logToFile(`Error processing class ${currentClass}: ${error}`);
          logToFile(`skipping to next class`);
          continue;
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

// exec with logging
async function execl(command: string) {
  logToFile(`Executing command ${command}`);
  const { stderr, stdout, error } = await exec(command, { cwd: PROJECT_PATH });
  if (stdout) {
    logToFile(`stdout: ${stdout}`);
  }
  if (stderr) {
    logToFile(`stderr: ${stderr}`);
  }
  if (error) {
    throw error;
  }
}

import util from "util";
import * as vscode from "vscode";
const exec = util.promisify(require("child_process").exec);
const fs = require("fs");

const waitForStableCharacterCount = async (timeout = 60000) => {
  const start = Date.now();
  let previousCharacterCount = -1;

  while (Date.now() - start < timeout) {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      throw new Error("No active editor found.");
    }

    const currentCharacterCount = editor.document.getText().length;

    if (currentCharacterCount === previousCharacterCount) {
      return { timeout: false, finalCharacterCount: currentCharacterCount };
    }

    previousCharacterCount = currentCharacterCount;

    // Wait for X second before checking again
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  return { timeout: true, finalCharacterCount: previousCharacterCount }; // Timeout
};
const BASE_PATH = "/Users/schaller/code/sqs_manual_experiment";
const PROJECT_PATH = `${BASE_PATH}/jsoup`;
const CLASSES_PATH = `${BASE_PATH}/gentestcopilot/jsoup_classes_all.txt`; // contains list of relative path to classes within a project, one per line
const REPORTS_FOLDER = `${BASE_PATH}/testReports/jsoup`;
const LOG_FILE = `${BASE_PATH}/log.txt`;
const JAVA_IMPORTER_PATH = `${BASE_PATH}/javaimports-1.5-all-deps.jar`;

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

      logToFile(`Received ${classesArray.length} classes`);
      logToFile(`Classes: ${classesArray.join(", ")}`);

      for (const currentClass of classesArray) {
        // Discard any unsaved changes
        while (vscode.window.activeTextEditor) {
          await vscode.commands.executeCommand(
            "workbench.action.revertAndCloseActiveEditor"
          );
        }

        await execl(`git checkout -f base`);
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

          const { timeout, finalCharacterCount } =
            await waitForStableCharacterCount();

          await vscode.commands.executeCommand("workbench.action.files.save"); // should not trigger auto import!! this would make empty check invalid use third party tool later instead
          await execl('git add . && git commit -m "Generate tests"');

          if (timeout) {
            logToFile(`Generation for class ${currentClass} timed out`);
            await execl(
              `echo "timeout" > ${REPORTS_FOLDER}/${className}.report.txt`
            );
            continue;
          } else if (finalCharacterCount === 0) {
            logToFile(`Empty test file for class ${currentClass}`);
            await execl(
              `echo "empty" > ${REPORTS_FOLDER}/${className}.report.txt`
            );
            continue;
          }

          // relocate package
          // we close all active editors at beginning of loop but we open a new one for the cut and test class document, idk why ts is complaining
          // @ts-ignore
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
              // @ts-ignore same as above
              await vscode.window.activeTextEditor?.edit((editBuilder) => {
                editBuilder.delete(testDocument.lineAt(i).range);
              });
              // insert at top
              // @ts-ignore same as above
              await vscode.window.activeTextEditor?.edit((editBuilder) => {
                editBuilder.insert(new vscode.Position(0, 0), line + "\n");
              });
              break;
            }
          }
          await vscode.commands.executeCommand("workbench.action.files.save"); // save again because package was relocated

          await execl('git add . && git commit -m "Relocate package"');

          // add missing imports with third party library as vscode auto import requires manual input in case of ambiguity
          // no save should be necessary as tool writes to file directly
          await execl(`java -jar ${JAVA_IMPORTER_PATH} --replace ${testClass}`);

          await execl('git add . && git commit -m "Add missing imports"');

          const testClassName = className.replace(".java", "Test.java");

          try {
            await execl(
              `mvn test -Dtest=${testClassName} -e -X > ${REPORTS_FOLDER}/${className}.report.txt 2>&1`
            );
          } catch (error) {
            // TODO ignore for now. we expect compile and test run errors and this will make the mvn test command return with exit code != 0 which results in exec to throw
          }

          await execl('git add . && git commit -m "Did everything"');
        } catch (error) {
          logToFile(`Error processing class ${currentClass}: ${error}`);
          await execl('git add . && git commit -m "error"');
          logToFile(`skipping to next class`);
          continue;
        }
      }
      logToFile("Done processing all classes");
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

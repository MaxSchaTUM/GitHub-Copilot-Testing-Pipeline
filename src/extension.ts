import * as vscode from "vscode";
import { exec } from "child_process";
const fs = require("fs");

const waitForStableCharacterCount = async (timeout = 120000) => {
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
const BASE_PATH = "/Users/schaller/code/sqs";
const PROJECT_PATH = `${BASE_PATH}/jsoup`;
// TODO make this not hard coded but argument to extension
const USE_SMALL_TEST_SET = true;
let CLASSES_PATH: string;
if (USE_SMALL_TEST_SET) {
  CLASSES_PATH = `/Users/schaller/code/sqs/get_classes/jsoup_classes_small.txt`;
} else {
  CLASSES_PATH = `/Users/schaller/code/sqs/get_classes/jsoup_classes_all.txt`;
}
const JAVA_IMPORTER_PATH = `${BASE_PATH}/javaimports-1.5-all-deps.jar`;
const RUNS_FOLDER = "/Users/schaller/code/sqs/runs";
const NUMBER_OF_RUNS = 3; // set this manually to decide how many runs should be done for a given project for one time executing the extension
const LOG_FILE = `${BASE_PATH}/log.txt`; // one log for all runs

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
      logToFile(`Starting extension with ${NUMBER_OF_RUNS} runs`);

      const classes = await vscode.workspace.openTextDocument(CLASSES_PATH);
      const classesContent = classes.getText();
      const classesArray = classesContent.split("\n");

      logToFile(`Received ${classesArray.length} classes`);
      logToFile(`Classes: ${classesArray.join(", ")}`);

      const terminal = vscode.window.createTerminal("Log");
      terminal.show();
      terminal.sendText(`tail -f ${LOG_FILE}`);

      for (let i = 0; i < NUMBER_OF_RUNS; i++) {
        logToFile(`Starting run ${i + 1}`);
        const startTime = new Date();
        let currentRunFolder = `${RUNS_FOLDER}/${startTime.getTime()}`;
        // add project name as suffix to currentRunFolder
        currentRunFolder += `_${PROJECT_PATH.split("/").pop()}`;
        if (USE_SMALL_TEST_SET) {
          currentRunFolder += "_small";
        }
        fs.mkdirSync(currentRunFolder);
        const REPORTS_FOLDER = `${currentRunFolder}/reports`;
        fs.mkdirSync(REPORTS_FOLDER);
        for (const currentClass of classesArray) {
          try {
            // Discard any unsaved changes
            while (vscode.window.activeTextEditor) {
              await vscode.commands.executeCommand(
                "workbench.action.revertAndCloseActiveEditor"
              );
            }
            await execl(`git checkout base`);
            const className = currentClass.split("/").pop();
            if (!className) {
              logToFile(`No class name found, Skipping class ${currentClass}`);
              continue;
            }

            await execl(`git branch -D ${className}`); // from previous runs
            await execl(`git checkout -b ${className}`);
            // delete test class if it exists
            // we use a simple heuristic for the name for now
            const testClass = currentClass
              .replace("main", "test")
              .replace(".java", "Test.java");
            await execl(`rm ${testClass}`);
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

            const REPORT_FILE = `${currentRunFolder}/reports/${className}.report.txt`;

            if (timeout) {
              logToFile(`Generation for class ${currentClass} timed out`);
              await execl(`echo "timeout" > ${REPORT_FILE}`);
              continue;
            } else if (finalCharacterCount === 0) {
              logToFile(`Empty test file for class ${currentClass}`);
              await execl(`echo "empty" > ${REPORT_FILE}`);
              // sleep for one minute to avoid spamming the copilot api
              await new Promise((resolve) => setTimeout(resolve, 60000));
              continue;
            }

            // relocate package
            // we close all active editors at beginning of loop but we open a new one for the cut and test class document, idk why ts is complaining
            // @ts-ignore
            const testDocument = vscode.window.activeTextEditor?.document;
            if (!testDocument) {
              logToFile(
                `No test document found, Skipping class ${currentClass}`
              );
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
            await execl(
              `java -jar ${JAVA_IMPORTER_PATH} --replace ${testClass}`
            );
            await execl('git add . && git commit -m "Add missing imports"');

            const testClassName = className.replace(".java", "Test.java");

            await execl(
              `mvn clean test -Dtest=${testClassName} -e -X > ${REPORT_FILE} 2>&1`
            );
            // copy surfire xml report into reports folder
            await execl(
              `cp -r target/surefire-reports ${currentRunFolder}/reports/${className}-surefire-reports`
            );
          } catch (error) {
            logToFile(`Unexpected error for class ${currentClass}: ${error}`);
            logToFile(`skipping to next class`);
            continue;
          }
        }
        logToFile(`Done processing all classes for run ${i + 1}`);
        const endTime = new Date();
        logToFile(
          `Total time taken in minutes: ${Math.floor(
            (endTime.getTime() - startTime.getTime()) / 60000
          )}`
        );
        logToFile("Backing up .git folder");
        await execl(`cp -r ${PROJECT_PATH}/.git ${currentRunFolder}/.git`);
      }
      logToFile(`Done with all runs`);
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

// async exec with logging
async function execl(command: string) {
  logToFile(`Executing command ${command}`);
  return new Promise<void>((resolve) =>
    exec(command, { cwd: PROJECT_PATH }, (error, stdout, stderr) => {
      if (stdout) {
        logToFile(`stdout: ${stdout}`);
      }
      if (stderr) {
        logToFile(`stderr: ${stderr}`);
      }
      if (error) {
        logToFile(`exit code: ${error.code}`);
      }
      resolve();
    })
  );
}

import * as vscode from "vscode";
import { exec } from "child_process";
const fs = require("fs");
import * as path from "path";

const waitForStableCharacterCount = async (timeout = 120000) => {
  const start = Date.now();
  let previousCharacterCount = -1;

  while (Date.now() - start < timeout) {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      throw new Error("No active editor found.");
    }

    const text = editor.document.getText();

    const currentCharacterCount = text.length;

    if (
      currentCharacterCount === previousCharacterCount &&
      text.trim().slice(-1) === "}" // we assume copilot correctly closes class and if that is not the case yet the generation cannot be done so we wait
    ) {
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
      const terminal = vscode.window.createTerminal("Log");
      terminal.show();
      terminal.sendText(`tail -f ${LOG_FILE}`);
      logToFile(
        `Starting extension for project ${PROJECT_PATH} with ${NUMBER_OF_RUNS} runs`
      );

      const pairs = getClassTestPairs(PROJECT_PATH);
      if (USE_SMALL_TEST_SET) {
        logToFile(`Using small test set`);
        pairs.splice(2);
      }
      logToFile(`Received ${pairs.length} class pairs`);
      for (const pair of pairs) {
        logToFile(
          `Functional class: ${pair.functionalClassPath}, Test class: ${pair.testClassPath}`
        );
      }

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
        for (const pair of pairs) {
          try {
            // Discard any unsaved changes
            while (vscode.window.activeTextEditor) {
              await vscode.commands.executeCommand(
                "workbench.action.revertAndCloseActiveEditor"
              );
            }
            await execl(`git checkout base`);
            const className = pair.functionalClassPath.split("/").pop();
            if (!className) {
              logToFile(
                `No class name found, Skipping pair ${JSON.stringify(pair)}`
              );
              continue;
            }

            await execl(`git branch -D ${className}`); // from previous runs
            await execl(`git checkout -b ${className}`);
            // delete dev test if it exists
            await execl(`rm ${pair.testClassPath}`);
            const cutDocument = await vscode.workspace.openTextDocument(
              pair.functionalClassPath
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
              logToFile(
                `Generation for pair ${JSON.stringify(pair)} timed out`
              );
              await execl(`echo "timeout" > ${REPORT_FILE}`);
              // sleep for one minute to avoid spamming the copilot api
              await new Promise((resolve) => setTimeout(resolve, 60000));
              continue;
            } else if (finalCharacterCount === 0) {
              logToFile(`Empty test file for pair ${JSON.stringify(pair)}`);
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
                `No test document found, Skipping pair ${JSON.stringify(pair)}`
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

            const testDocumentPath = testDocument.fileName;

            // check if the test generated by copilot is at same place and same name as inital dev test
            // in case of no match we still continue but log message for manual debugging
            if (testDocumentPath !== pair.testClassPath) {
              logToFile(
                `Test class path ${testDocumentPath} does not match initial test class path ${pair.testClassPath}`
              );
            }

            await execl('git add . && git commit -m "Relocate package"');

            // add missing imports with third party library as vscode auto import requires manual input in case of ambiguity
            // no save should be necessary as tool writes to file directly
            await execl(
              `java -jar ${JAVA_IMPORTER_PATH} --replace ${pair.testClassPath}`
            );
            await execl('git add . && git commit -m "Add missing imports"');

            const testClassName = pair.testClassPath.split("/").pop();

            await execl(
              `mvn clean test -Dtest=${testClassName} -e -X > ${REPORT_FILE} 2>&1`
            );
            // copy surfire xml report into reports folder
            await execl(
              `cp -r target/surefire-reports ${currentRunFolder}/reports/${className}-surefire-reports`
            );
          } catch (error) {
            logToFile(
              `Unexpected error for pair ${JSON.stringify(pair)}: ${error}`
            );
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

/**
 * Recursively finds all *.java files under a given directory.
 * @param dirPath - The directory to search in.
 * @returns A list of absolute file paths for all .java files found.
 */
function findAllJavaFiles(dirPath: string): string[] {
  let javaFiles: string[] = [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Recurse into subdirectories
      javaFiles = javaFiles.concat(findAllJavaFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".java")) {
      javaFiles.push(entryPath);
    }
  }

  return javaFiles;
}

/**
 * Given the base path of the project, returns an array of pairs:
 *  { functionalClassPath, testClassPath }
 * for each functional class that has at least one corresponding test class.
 *
 * It supports multiple naming conventions:
 *   1. <BaseName>Test.java
 *   2. Test<BaseName>.java
 *   3. <BaseName>Tests.java
 *
 * @param projectBasePath - The absolute or relative path to the project root.
 * @returns An array of objects, each containing:
 *          { functionalClassPath: string, testClassPath: string }
 */
export function getClassTestPairs(projectBasePath: string): {
  functionalClassPath: string;
  testClassPath: string;
}[] {
  const mainJavaPath = path.join(projectBasePath, "src", "main", "java");
  const testJavaPath = path.join(projectBasePath, "src", "test", "java");

  // 1. Get all *.java files in src/main/java
  const functionalClasses = findAllJavaFiles(mainJavaPath);

  // Possible naming conventions for test classes
  const testNamingPatterns: Array<(baseName: string) => string> = [
    (baseName) => `${baseName}Test.java`,
    (baseName) => `Test${baseName}.java`,
    (baseName) => `${baseName}Tests.java`,
  ];

  const pairs: { functionalClassPath: string; testClassPath: string }[] = [];

  for (const functionalClass of functionalClasses) {
    // Example functional class path:
    // /project/src/main/java/com/example/Parser.java
    const relativePathFromMain = path.relative(mainJavaPath, functionalClass);
    const dirName = path.dirname(relativePathFromMain); // e.g. "com/example"
    const baseName = path.basename(relativePathFromMain, ".java"); // e.g. "Parser"

    // For each naming pattern, compute the potential test file path
    // If any exist, we record them.
    const testFileMatches: string[] = [];
    for (const pattern of testNamingPatterns) {
      const testFileName = pattern(baseName); // e.g. ParserTest.java
      const testFileFullPath = path.join(testJavaPath, dirName, testFileName);

      if (fs.existsSync(testFileFullPath)) {
        testFileMatches.push(testFileFullPath);
      }
    }

    // If we found any matching test files, store them
    // "Discard" the functional class only if no tests were found.
    if (testFileMatches.length > 0) {
      for (const matchPath of testFileMatches) {
        pairs.push({
          functionalClassPath: functionalClass,
          testClassPath: matchPath,
        });
      }
    }
  }

  return pairs;
}

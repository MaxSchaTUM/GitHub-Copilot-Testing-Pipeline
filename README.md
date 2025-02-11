# What is this extension for?

This extension can be used to automatically generate, compile and execute Java unit tests with GitHub Copilot. First you need a project to generate tests for. The script was made to compare Copilot with developer written test classes. For each developer test class inside the given project the script will do the following:

1. Delete the developer class
2. Regenerate a version with Copilot (note that all other developer test classes are kept and could be used for context by Copilot)
3. Compile and run the test class
4. Save the outputs
5. Repeat on a fresh branch for the rest of classes

Experiments can also be repeated multiple times automatically to improve reproducibility. The script will also save the generated test classes via git branches. 

# Setup

1. Clone project
2. Install dependencies with `npm install`
3. Download the `javaimports` dependency version 1.5 from here: https://github.com/nicolascouvrat/javaimports
4. Go to `extension.ts` and set the configuration variables marked with `+++++++ CONFIGURATION +++++++`
5. Make sure you have automatic imports on save deactivated inside VSCode as this may conflict with the extension. You can do this by going to settings and searching for `editor.codeActionsOnSave`. Make sure that `source.organizeImports` is not checked.
6. Start the debugging mode of the extension by opening the command palette with `Ctrl+Shift+P` and typing `Debug: Start Debugging`
7. A new window opens. Use this window to open the project for which you want to generate Copilot tests for. Usually Maven should take care of installing the project dependencies.
8. Inside the project you want to generate for, open the command palette again and execute the command `Generate Copilot Tests`
9. Test generation has now started. A terminal window should have opened and display the log information. Generation may take a long time (it took us about 30 minutes for 30 class pairs, larger projects may take longer). Do not interact with the window in which the generation is running. You can use other windows of VSCode in the meantime. 
10. When you want to stop generation, you can close the window or stop the debugging mode from the original window. This will not stop generation gracefully and may lead to partial results

# Known issues

- Only supports Maven
- If a timeout on Copilot side occurs the script waits in order to not spam the Copilot API. However, no retry mechanism is implemented yet.
- Configuration of parameters as to be done inside the script file as opposed to a configuration file
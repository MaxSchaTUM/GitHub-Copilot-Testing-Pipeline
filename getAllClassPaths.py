import os

def get_java_files(src_folder):
    java_files = []
    for root, _, files in os.walk(src_folder):
        for file in files:
            if file.endswith(".java"):
                # Get the relative path
                relative_path = os.path.relpath(os.path.join(root, file), start=src_folder)
                java_files.append(relative_path)
    return java_files

# only include CUT not test classes inside src/main/
src_folder = "/Users/schaller/code/sqs_manual_experiment/jsoup/src/main"
java_files = get_java_files(src_folder)
# filter out classes containing 'package-info' 
java_files = [java_file for java_file in java_files if "package-info" not in java_file]
# filter out classes in the examples folder
java_files = [java_file for java_file in java_files if "/example" not in java_file]
# now, prepend each name with src/main/ again to have correct relative path again
java_files = ["src/main/" + java_file for java_file in java_files]


fileToWriteTo = open("allClassPaths.txt", "w")
for java_file in java_files:
    fileToWriteTo.write(java_file + "\n")
fileToWriteTo.close()

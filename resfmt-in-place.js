#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get proper filename in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile = process.argv[2];
const useRescript10 = process.argv.includes("--rescript10");

// Validate input
if (!inputFile) {
  console.error("Usage: node resfmt-in-place.js filename.re [--rescript10]");
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`Error: File ${inputFile} not found`);
  process.exit(1);
}

if (!inputFile.endsWith(".re") && !inputFile.endsWith(".ml")) {
  console.error("Error: File must have .re or .ml extension");
  process.exit(1);
}

const SAFE_PREFIX = "BSas";
const SEQUENCE_LENGTH = 5;

const generateLetterSequence = (index) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXY"; // A-Y only, Z reserved for padding
  let result = "";

  // Convert to base-25
  do {
    index--; // Decrement to handle 0-based index
    result = alphabet[index % 25] + result;
    index = Math.floor(index / 25);
  } while (index > 0);

  return result.padEnd(SEQUENCE_LENGTH, "Z");
};

let sequenceCounter = 0;
let placeholderMap = new Map();

try {
  console.log("Installing rescript...");
  console.log(`Using rescript9...`);

  // Read and preprocess the file content
  let content = fs.readFileSync(inputFile, "utf8");

  console.log("Content read...");

  // Replace all @bs.as contents with safe placeholders
  content = content.replace(
    /(@bs\.as\s*["'])([^"']*)(['"])/g,
    (match, prefix, content, suffix) => {
      const placeholder = `${SAFE_PREFIX}${generateLetterSequence(
        ++sequenceCounter
      )}`;
      placeholderMap.set(placeholder, content);
      return `${prefix}${placeholder}${suffix}`;
    }
  );

  // Write back to original file
  fs.writeFileSync(inputFile, content);
  console.log("Preprocessed file saved with hyphen and space placeholders");

  // Run converter directly on the file
  execSync(`npx -y rescript@9 convert "${inputFile}"`, {
    timeout: 30000,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Clear the "Installing" message
  process.stdout.write("\x1b[1A\x1b[K");

  // Read the converted .res file
  const outputFile = inputFile.replace(/\.re$/, ".res");
  if (!fs.existsSync(outputFile)) {
    throw new Error(`Conversion failed: ${outputFile} was not created`);
  }

  let formattedContent = fs.readFileSync(outputFile, "utf8");
  console.log(`Read converted file: ${outputFile}`);

  // Restore original content using the placeholder map
  let restoredContent = formattedContent;
  for (const [placeholder, original] of placeholderMap.entries()) {
    restoredContent = restoredContent.replace(
      new RegExp(placeholder, "g"),
      original
    );
  }

  // For ReScript 10, remove extra escapes
  if (useRescript10) {
    // Simply remove one level of escaping from backslashes
    restoredContent = restoredContent.replace(/\\\\([^\\])/g, "\\$1");
  }

  // Write the restored content back
  fs.writeFileSync(outputFile, restoredContent);
  console.log("Restored hyphens and spaces in converted file");

  console.log(
    `[OK] ${path.basename(inputFile)} > ${path.basename(outputFile)}`
  );
} catch (error) {
  // Clear the "Installing" message
  process.stdout.write("\x1b[1A\x1b[K");

  if (error.code === "ETIMEDOUT") {
    console.error(
      "\x1b[31mError:\x1b[0m npx command timed out after 30 seconds. This may indicate a stuck prompt."
    );
  } else {
    console.error(
      "\x1b[31mError:\x1b[0m Failed to format file. This might be due to:"
    );
    console.error("  1. Invalid characters in the source file");
    console.error("  2. Syntax errors in the ReScript code");
    console.error("  3. Incompatible ReScript syntax version");
    console.error("\nError details:");
    console.error(error.stderr?.toString() || error.message);
  }
  process.exit(1);
}

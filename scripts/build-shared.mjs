import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const sourcePath = new URL("../shared/usage.js", import.meta.url);
const outputs = [
  new URL("../extension/usage-shared.js", import.meta.url),
  new URL("../vscode-extension/usage-shared.js", import.meta.url),
];
const source = await readFile(sourcePath, "utf8");
const generated = "// Generated from shared/usage.js by npm run build. Do not edit.\n" + source;

if (process.argv.includes("--check")) {
  let current = true;
  for (const output of outputs) {
    try {
      if ((await readFile(output, "utf8")) !== generated) current = false;
    } catch {
      current = false;
    }
  }
  if (!current) {
    console.error("Generated shared clients are stale. Run: npm run build");
    process.exitCode = 1;
  }
} else {
  await Promise.all(outputs.map((output) => writeFile(output, generated)));
  console.log("Updated shared browser and VS Code clients.");
}

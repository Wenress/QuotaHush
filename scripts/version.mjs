import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const versionFile = new URL("../VERSION", import.meta.url);
const jsonFiles = [
  new URL("../package.json", import.meta.url),
  new URL("../extension/manifest.json", import.meta.url),
  new URL("../vscode-extension/package.json", import.meta.url),
];
const pyprojectFile = new URL("../server/pyproject.toml", import.meta.url);
const lockFile = new URL("../server/uv.lock", import.meta.url);
const requested = process.argv[2];
const checking = requested === "--check";
const version = checking
  ? (await readFile(versionFile, "utf8")).trim()
  : requested;

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: node scripts/version.mjs <semver> | --check");
  process.exit(1);
}

const mismatches = [];
const jsonDocuments = await Promise.all(
  jsonFiles.map(async (file) => [file, JSON.parse(await readFile(file, "utf8"))]),
);
const pyproject = await readFile(pyprojectFile, "utf8");
const currentPythonVersion = pyproject.match(/^version = "([^"]+)"$/m)?.[1];
const lock = await readFile(lockFile, "utf8");
const lockPattern = /(\[\[package\]\]\r?\nname = "quotahush-server"\r?\nversion = ")[^"]+(")/;
const currentLockVersion = lock.match(lockPattern)?.[0].match(/version = "([^"]+)"/)?.[1];

if (!currentPythonVersion) {
  console.error("Could not find the project version in server/pyproject.toml");
  process.exit(1);
}
if (!currentLockVersion) {
  console.error("Could not find the project version in server/uv.lock");
  process.exit(1);
}

if (checking) {
  for (const [file, document] of jsonDocuments) {
    if (document.version !== version) mismatches.push(file.pathname);
  }
  if (currentPythonVersion !== version) mismatches.push(pyprojectFile.pathname);
  if (currentLockVersion !== version) mismatches.push(lockFile.pathname);
} else {
  await Promise.all([
    ...jsonDocuments.map(([file, document]) => {
      document.version = version;
      return writeFile(file, JSON.stringify(document, null, 2) + "\n");
    }),
    writeFile(
      pyprojectFile,
      pyproject.replace(/^version = "[^"]+"$/m, `version = "${version}"`),
    ),
    writeFile(
      lockFile,
      lock.replace(lockPattern, (_match, prefix, suffix) => `${prefix}${version}${suffix}`),
    ),
    writeFile(versionFile, version + "\n"),
  ]);
}

if (mismatches.length) {
  console.error(`Version ${version} is not synchronized in:\n${mismatches.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(checking ? `Version ${version} is synchronized.` : `Updated version to ${version}.`);
}

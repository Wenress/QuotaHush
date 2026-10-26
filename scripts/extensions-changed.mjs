import { execFileSync } from "node:child_process";
import process from "node:process";

// Prints "true" when the browser or VS Code extension sources differ from a
// previous release tag, so server-only releases do not resubmit unchanged
// extensions to the marketplaces. Version bumps and changelog edits are
// ignored because every release synchronizes them.
const previous = process.argv[2];
if (!previous) {
  console.error("Usage: node scripts/extensions-changed.mjs <previous-tag>");
  process.exit(1);
}

const roots = ["extension", "vscode-extension"];
const ignored = new Set(["vscode-extension/CHANGELOG.md"]);
const versioned = new Set(["extension/manifest.json", "vscode-extension/package.json"]);

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const files = (revision) =>
  git("ls-tree", "-r", "--name-only", revision, "--", ...roots)
    .split("\n")
    .filter((file) => file && !ignored.has(file));

function withoutVersion(revision, file) {
  const document = JSON.parse(git("show", `${revision}:${file}`));
  delete document.version;
  return JSON.stringify(document);
}

function changed() {
  const before = files(previous);
  const after = files("HEAD");
  if (before.length !== after.length || before.some((file, index) => file !== after[index])) {
    return true;
  }
  return after.some((file) =>
    versioned.has(file)
      ? withoutVersion(previous, file) !== withoutVersion("HEAD", file)
      : git("rev-parse", `${previous}:${file}`) !== git("rev-parse", `HEAD:${file}`),
  );
}

console.log(changed() ? "true" : "false");

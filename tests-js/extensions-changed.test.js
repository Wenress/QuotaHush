import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/extensions-changed.mjs", import.meta.url));

function createRepository() {
  const directory = mkdtempSync(path.join(tmpdir(), "quotahush-release-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  write("extension/manifest.json", JSON.stringify({ name: "x", version: "1.0.0" }));
  write("extension/popup.js", "one");
  write("vscode-extension/package.json", JSON.stringify({ name: "y", version: "1.0.0" }));
  write("vscode-extension/CHANGELOG.md", "# Changelog\n");
  write("server/version.py", "1.0.0");
  git("add", ".");
  git("commit", "-q", "-m", "release 1.0.0");
  git("tag", "v1.0.0");
  const commit = (message) => {
    git("add", ".");
    git("commit", "-q", "-m", message);
  };
  const changed = () =>
    execFileSync("node", [script, "v1.0.0"], { cwd: directory, encoding: "utf8" }).trim();
  return { directory, write, commit, changed };
}

test("server-only release with synchronized versions leaves extensions unchanged", () => {
  const repo = createRepository();
  try {
    repo.write("extension/manifest.json", JSON.stringify({ name: "x", version: "1.0.1" }));
    repo.write("vscode-extension/package.json", JSON.stringify({ name: "y", version: "1.0.1" }));
    repo.write("vscode-extension/CHANGELOG.md", "# Changelog\n\n## 1.0.1\n");
    repo.write("server/version.py", "1.0.1");
    repo.commit("release 1.0.1");
    assert.equal(repo.changed(), "false");
  } finally {
    rmSync(repo.directory, { recursive: true, force: true });
  }
});

test("detects changed extension source", () => {
  const repo = createRepository();
  try {
    repo.write("extension/popup.js", "two");
    repo.commit("change popup");
    assert.equal(repo.changed(), "true");
  } finally {
    rmSync(repo.directory, { recursive: true, force: true });
  }
});

test("detects non-version manifest changes and added files", () => {
  const repo = createRepository();
  try {
    repo.write("vscode-extension/package.json", JSON.stringify({ name: "y", version: "1.0.1", extra: 1 }));
    repo.commit("change manifest");
    assert.equal(repo.changed(), "true");
  } finally {
    rmSync(repo.directory, { recursive: true, force: true });
  }
  const added = createRepository();
  try {
    added.write("extension/new.js", "new");
    added.commit("add file");
    assert.equal(added.changed(), "true");
  } finally {
    rmSync(added.directory, { recursive: true, force: true });
  }
});

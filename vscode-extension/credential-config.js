"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const CREDENTIALS = [
  {
    key: "DEEPSEEK_API_KEY",
    label: "DeepSeek API key",
    detail: "Official API key used for the account balance.",
  },
  {
    key: "DEEPSEEK_PLATFORM_TOKEN",
    label: "DeepSeek Platform token",
    detail: "Optional dashboard session token used for usage history.",
  },
  {
    key: "ZAI_API_KEY",
    label: "Z.AI API key",
    detail: "API key used for active Usage Bundles.",
  },
];

function providerEnvPath(environment = process.env, home = os.homedir()) {
  if (environment.QUOTAHUSH_ENV_FILE) {
    return path.resolve(environment.QUOTAHUSH_ENV_FILE);
  }
  if (environment.LOCALAPPDATA) {
    return path.win32.join(environment.LOCALAPPDATA, "QuotaHush", ".var.env");
  }
  const configHome = environment.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(configHome, "quotahush", ".var.env");
}

function updateEnvText(source, key, value) {
  if (!CREDENTIALS.some((credential) => credential.key === key)) {
    throw new Error(`Unsupported QuotaHush credential: ${key}`);
  }
  if (/\r|\n/.test(value)) throw new Error("Credential values cannot contain new lines.");

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source ? source.split(/\r?\n/) : [
    "# QuotaHush provider credentials. Managed locally; never commit this file.",
    "",
  ];
  const pattern = new RegExp(`^\\s*${key}\\s*=`);
  let replaced = false;
  const updated = [];
  for (const line of lines) {
    if (!pattern.test(line)) {
      updated.push(line);
    } else if (!replaced) {
      updated.push(`${key}=${value}`);
      replaced = true;
    }
  }
  if (!replaced) {
    if (updated.length && updated.at(-1) !== "") updated.push("");
    updated.push(`${key}=${value}`);
  }
  while (updated.length > 1 && updated.at(-1) === "" && updated.at(-2) === "") {
    updated.pop();
  }
  return updated.join(newline).replace(new RegExp(`${newline}*$`), "") + newline;
}

async function writeCredential(key, value, envPath = providerEnvPath()) {
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  let source = "";
  try {
    source = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const temporary = `${envPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, updateEnvText(source, key, value), {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporary, envPath);
    if (process.platform !== "win32") await fs.chmod(envPath, 0o600);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return envPath;
}

module.exports = { CREDENTIALS, providerEnvPath, updateEnvText, writeCredential };

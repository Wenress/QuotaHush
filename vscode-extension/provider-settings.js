"use strict";

const PROVIDERS = ["claude", "codex", "deepseek", "zai"];
const NOT_DETECTED_ERRORS = new Set(["not_configured", "not_logged_in"]);

function normalizeProviderMode(value) {
  return ["auto", "enabled", "disabled"].includes(value) ? value : "auto";
}

function isProviderDetected(provider) {
  return Boolean(provider) && !NOT_DETECTED_ERRORS.has(provider.error);
}

function shouldShowProvider(mode, detected) {
  const normalized = normalizeProviderMode(mode);
  if (normalized === "disabled") return false;
  return normalized === "enabled" || detected;
}

module.exports = {
  PROVIDERS,
  isProviderDetected,
  normalizeProviderMode,
  shouldShowProvider,
};

const vscode = require("vscode");
const http = require("http");
const PROVIDER_ICONS = require("./provider-icons");
const { CREDENTIALS, writeCredential } = require("./credential-config");
const {
  PROVIDERS,
  isProviderDetected,
  shouldShowProvider,
} = require("./provider-settings");
const {
  codexCreditsLine,
  codexWindows,
  createRenderers,
  deepseekBalanceDetails,
  deepseekBalanceLine,
  deepseekSpendLine,
  escapeHtml,
  escapeMarkdown,
  fmtDuration,
  fmtCount,
  fmtCompactCount,
  fmtDateTime,
  fmtPercent,
  fmtResetAt,
  fmtCodexReset,
  claudeCreditsLine,
  zaiBundles,
  zaiCurrentBalance,
  zaiUsedPercent,
} = require("./usage-shared");

const SERVER_URL = "http://127.0.0.1:8765/usage";
const COMPANION_URL = "https://github.com/Wenress/QuotaHush/releases";
const POLL_MS = 60000;
const COLORS = { green: "#3fb950", yellow: "#d29922", red: "#f85149" };

let claudeItem;
let codexItem;
let deepseekItem;
let zaiItem;
let timer;
let refreshPromise;
let viewProvider;
const providerItems = {};
const detectedProviders = {
  claude: true,
  codex: true,
  deepseek: false,
  zai: false,
};

function providerMode(provider) {
  return vscode.workspace
    .getConfiguration("quotahush.providers")
    .get(provider, "auto");
}

function providerIsVisible(provider) {
  return shouldShowProvider(providerMode(provider), detectedProviders[provider]);
}

function applyProviderVisibility() {
  for (const provider of PROVIDERS) {
    if (!providerIsVisible(provider)) providerItems[provider]?.hide();
  }
}

function colorForPercent(percent) {
  if (percent == null || Number.isNaN(percent)) return undefined;
  if (percent < 30) return COLORS.green;
  if (percent < 80) return COLORS.yellow;
  return COLORS.red;
}

function fetchUsage() {
  return new Promise((resolve, reject) => {
    const request = http.get(SERVER_URL, { timeout: 20000 }, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`server returned ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
  });
}

function cacheAge(provider) {
  const cache = provider?._cache;
  if (!cache?.stale || !cache.fetched_at) return "";
  return fmtDuration((Date.now() - new Date(cache.fetched_at).getTime()) / 1000);
}

function providerHeading(provider, label) {
  return `<h2 class="provider-title">${PROVIDER_ICONS[provider]}<span>${escapeHtml(label)}</span></h2>`;
}

function cacheNotice(provider) {
  const age = cacheAge(provider);
  return age ? `<div class="stale">Cached data · ${age} old</div>` : "";
}

const { renderClaudeHtml, renderCodexHtml, renderDeepSeekHtml, renderZaiHtml } = createRenderers({
  providerHeading,
  cacheNotice,
});

function buildClaudeTooltip(claude, fetchedAt) {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown("**Claude Code**\n\n");
  if (!claude || claude.error) {
    markdown.appendMarkdown(`_${escapeMarkdown(claude?.message || claude?.error || "unavailable")}_\n\n`);
  } else {
    markdown.appendMarkdown(`Plan: ${escapeMarkdown(claude.plan_type || "unknown")}\n\n`);
    markdown.appendMarkdown(`Session (5h): **${fmtPercent(claude.five_hour.utilization)}%** — resets in ${fmtResetAt(claude.five_hour.resets_at)}\n\n`);
    markdown.appendMarkdown(`Weekly: **${fmtPercent(claude.seven_day.utilization)}%** — resets in ${fmtResetAt(claude.seven_day.resets_at)}\n\n`);
    const credits = claudeCreditsLine(claude);
    if (credits) markdown.appendMarkdown(`Credits: ${escapeMarkdown(credits)}\n\n`);
    const age = cacheAge(claude);
    if (age) markdown.appendMarkdown(`_Cached data · ${age} old_\n\n`);
  }
  markdown.appendMarkdown(`---\n\nUpdated ${new Date(fetchedAt).toLocaleTimeString()}`);
  return markdown;
}

function buildCodexTooltip(codex, fetchedAt) {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown("**Codex**\n\n");
  if (!codex || codex.error) {
    markdown.appendMarkdown(`_${escapeMarkdown(codex?.message || codex?.error || "unavailable")}_\n\n`);
  } else {
    const { session, weekly } = codexWindows(codex);
    markdown.appendMarkdown(`Plan: ${escapeMarkdown(codex.plan_type || "unknown")}\n\n`);
    if (session) markdown.appendMarkdown(`Session (5h): **${fmtPercent(session.used_percent)}%** — resets in ${fmtCodexReset(session)}\n\n`);
    if (weekly) markdown.appendMarkdown(`Weekly: **${fmtPercent(weekly.used_percent)}%** — resets in ${fmtCodexReset(weekly)}\n\n`);
    const credits = codexCreditsLine(codex);
    if (credits) markdown.appendMarkdown(`Credits: ${escapeMarkdown(credits)}\n\n`);
  }
  markdown.appendMarkdown(`---\n\nUpdated ${new Date(fetchedAt).toLocaleTimeString()}`);
  return markdown;
}

function buildDeepSeekTooltip(deepseek, fetchedAt) {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown("**DeepSeek API**\n\n");
  if (!deepseek || deepseek.error) {
    markdown.appendMarkdown(`_${escapeMarkdown(deepseek?.message || deepseek?.error || "unavailable")}_\n\n`);
  } else {
    if (deepseek.balance?.error) {
      markdown.appendMarkdown(`Balance: _${escapeMarkdown(deepseek.balance.message || deepseek.balance.error)}_\n\n`);
    } else {
      for (const { label, value } of deepseekBalanceDetails(deepseek)) {
        markdown.appendMarkdown(`${escapeMarkdown(label)}: **${escapeMarkdown(value)}**\n\n`);
      }
    }
    if (deepseek.usage?.error) {
      markdown.appendMarkdown(`Usage: _${escapeMarkdown(deepseek.usage.message || deepseek.usage.error)}_\n\n`);
    } else if (deepseek.usage?.today && deepseek.usage?.month) {
      markdown.appendMarkdown(`Today spend: **${escapeMarkdown(deepseekSpendLine(deepseek.usage.today.spend))}**\n\n`);
      markdown.appendMarkdown(`Today tokens: **${fmtCount(deepseek.usage.today.total_tokens)}** (${fmtCount(deepseek.usage.today.requests)} requests)\n\n`);
      markdown.appendMarkdown(`Month spend: **${escapeMarkdown(deepseekSpendLine(deepseek.usage.month.spend))}**\n\n`);
      markdown.appendMarkdown(`Month tokens: **${fmtCount(deepseek.usage.month.total_tokens)}** (${fmtCount(deepseek.usage.month.requests)} requests)\n\n`);
    }
    const age = cacheAge(deepseek);
    if (age) markdown.appendMarkdown(`_Cached data · ${age} old_\n\n`);
  }
  markdown.appendMarkdown(`---\n\nUpdated ${new Date(fetchedAt).toLocaleTimeString()}`);
  return markdown;
}

function buildZaiTooltip(zai, fetchedAt) {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown("**Z.AI**\n\n");
  if (!zai || zai.error) {
    markdown.appendMarkdown(`_${escapeMarkdown(zai?.message || zai?.error || "unavailable")}_\n\n`);
  } else {
    const bundles = zaiBundles(zai);
    if (!bundles.length) {
      markdown.appendMarkdown("_No active usage bundles._\n\n");
    }
    for (const bundle of bundles) {
      markdown.appendMarkdown(`**${escapeMarkdown(bundle.name || "Usage Bundle")}**\n\n`);
      markdown.appendMarkdown(`Current balance: **${fmtCount(bundle.current_balance)} tokens**\n\n`);
      markdown.appendMarkdown(`Expiration time: ${escapeMarkdown(fmtDateTime(bundle.expiration_time))}\n\n`);
      markdown.appendMarkdown(`Used: **${fmtPercent(bundle.used_percent)}%**\n\n`);
    }
    const age = cacheAge(zai);
    if (age) markdown.appendMarkdown(`_Cached data · ${age} old_\n\n`);
  }
  markdown.appendMarkdown(`---\n\nUpdated ${new Date(fetchedAt).toLocaleTimeString()}`);
  return markdown;
}

function updateStatusItems(data) {
  for (const provider of PROVIDERS) {
    detectedProviders[provider] = isProviderDetected(data[provider]);
    providerItems[provider].command = "quotahush.refresh";
  }

  const claudeError = data.claude?.error;
  const claudePercent = data.claude && !claudeError
    ? Math.round(data.claude.five_hour.utilization)
    : null;
  claudeItem.text = claudeError
    ? "$(warning) Claude"
    : `$(pulse) Claude ${claudePercent == null ? "—" : claudePercent + "%"}`;
  claudeItem.color = colorForPercent(claudePercent);
  claudeItem.tooltip = buildClaudeTooltip(data.claude, data.fetched_at);
  claudeItem.backgroundColor = claudeError
    ? new vscode.ThemeColor("statusBarItem.errorBackground")
    : undefined;
  if (providerIsVisible("claude")) claudeItem.show();
  else claudeItem.hide();

  const codexError = data.codex?.error;
  const limits = data.codex && !codexError ? codexWindows(data.codex) : {};
  const window = limits.session || limits.weekly;
  const codexPercent = window ? Math.round(window.used_percent) : null;
  codexItem.text = codexError
    ? "$(warning) Codex"
    : `$(pulse) Codex ${codexPercent == null ? "—" : codexPercent + "%"}`;
  codexItem.color = colorForPercent(codexPercent);
  codexItem.tooltip = buildCodexTooltip(data.codex, data.fetched_at);
  codexItem.backgroundColor = codexError
    ? new vscode.ThemeColor("statusBarItem.errorBackground")
    : undefined;
  if (providerIsVisible("codex")) codexItem.show();
  else codexItem.hide();

  if (!providerIsVisible("deepseek")) {
    deepseekItem.hide();
  } else {
    const deepseekError = data.deepseek?.error || data.deepseek?.balance?.error;
    const deepseekBalance = !deepseekError ? deepseekBalanceLine(data.deepseek) : "";
    deepseekItem.command = "quotahush.refresh";
    deepseekItem.text = deepseekError
      ? "$(warning) DeepSeek"
      : `$(pulse) DeepSeek ${deepseekBalance || "—"}`;
    deepseekItem.color = undefined;
    deepseekItem.tooltip = buildDeepSeekTooltip(data.deepseek, data.fetched_at);
    deepseekItem.backgroundColor = deepseekError
      ? new vscode.ThemeColor("statusBarItem.errorBackground")
      : undefined;
    deepseekItem.show();
  }

  if (!providerIsVisible("zai")) {
    zaiItem.hide();
  } else {
    const zaiError = data.zai?.error;
    const zaiBalance = !zaiError ? zaiCurrentBalance(data.zai) : null;
    const zaiPercent = !zaiError ? zaiUsedPercent(data.zai) : null;
    zaiItem.command = "quotahush.refresh";
    zaiItem.text = zaiError
      ? "$(warning) Z.AI"
      : `$(pulse) Z.AI ${zaiBalance == null ? "—" : fmtCompactCount(zaiBalance)}`;
    zaiItem.color = colorForPercent(zaiPercent);
    zaiItem.tooltip = buildZaiTooltip(data.zai, data.fetched_at);
    zaiItem.backgroundColor = zaiError
      ? new vscode.ThemeColor("statusBarItem.errorBackground")
      : undefined;
    zaiItem.show();
  }
}

function markOffline(error) {
  const message = new vscode.MarkdownString(
    `Can't reach QuotaHush Companion on 127.0.0.1:8765.\n\n` +
    `[Install or update QuotaHush Companion](${COMPANION_URL})\n\n${escapeMarkdown(error.message)}`,
  );
  for (const [provider, item, label] of [
    ["claude", claudeItem, "Claude"],
    ["codex", codexItem, "Codex"],
    ["deepseek", deepseekItem, "DeepSeek"],
    ["zai", zaiItem, "Z.AI"],
  ]) {
    if (!providerIsVisible(provider)) {
      item.hide();
      continue;
    }
    item.text = `$(warning) ${label} offline`;
    item.color = undefined;
    item.tooltip = message;
    item.command = "quotahush.installCompanion";
    item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    item.show();
  }
}

function webviewHtml(contentHtml, metaHtml) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 12px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  h2 { font-size: 11px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: var(--vscode-descriptionForeground); }
  h2:first-child { margin-top: 0; }
  h2.provider-title { display: flex; align-items: center; gap: 7px; }
  .provider-icon { width: 16px; height: 16px; flex: 0 0 16px; fill: currentColor; }
  .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .row.spaced { margin-top: 8px; }
  .spaced { margin-top: 10px; }
  .label { color: var(--vscode-descriptionForeground); }
  .value { font-variant-numeric: tabular-nums; }
  .credits { margin-top: 10px; padding: 8px 9px; border: 1px solid var(--vscode-widget-border, transparent); border-radius: 6px; background: var(--vscode-sideBarSectionHeader-background, rgba(127, 127, 127, .08)); }
  .credits-title { margin-bottom: 5px; font-weight: 600; }
  .credit-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 3px; }
  .credit-row .value { text-align: right; white-space: nowrap; }
  .credit-row .value.wrap { white-space: normal; }
  .credit-row.section-gap { margin-top: 8px; }
  .bundle-name { margin: 5px 0; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .bundle-name.section-gap { margin-top: 12px; }
  .bar { height: 6px; background: var(--vscode-scrollbarSlider-background); border-radius: 3px; overflow: hidden; margin: 4px 0 10px; }
  .bar-fill { height: 100%; background: var(--vscode-charts-blue, #4c9aff); }
  .bar-fill.warn { background: var(--vscode-charts-yellow, #d29922); }
  .bar-fill.crit { background: var(--vscode-charts-red, #f85149); }
  .error, .offline { color: var(--vscode-errorForeground); font-size: 12px; }
  .offline { line-height: 1.4; }
  .install-button { display: inline-block; margin-top: 12px; padding: 6px 9px; border-radius: 3px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); text-decoration: none; }
  .install-button:hover { background: var(--vscode-button-hoverBackground); }
  .stale { margin: -2px 0 8px; color: var(--vscode-charts-yellow, #d29922); font-size: 11px; }
  .meta { margin-top: 12px; font-size: 11px; color: var(--vscode-descriptionForeground); text-align: right; }
</style>
</head>
<body>
  <div id="content">${contentHtml}</div>
  <div class="meta">${metaHtml}</div>
</body>
</html>`;
}

class UsageViewProvider {
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: false };
    webviewView.webview.html = webviewHtml("Loading...", "");
    refreshAll();
  }

  render(data, error) {
    if (!this.view) return;
    if (error) {
      const offline = `<div class="offline">Can't reach QuotaHush Companion on 127.0.0.1:8765.<br><br>${escapeHtml(error.message)}<br><a class="install-button" href="${COMPANION_URL}">Get QuotaHush Companion</a></div>`;
      this.view.webview.html = webviewHtml(offline, "");
      return;
    }
    const body =
      (providerIsVisible("claude") ? renderClaudeHtml(data.claude) : "") +
      (providerIsVisible("codex") ? renderCodexHtml(data.codex) : "") +
      (providerIsVisible("deepseek") ? renderDeepSeekHtml(data.deepseek) : "") +
      (providerIsVisible("zai") ? renderZaiHtml(data.zai) : "");
    const meta = "Updated " + new Date(data.fetched_at).toLocaleTimeString();
    this.view.webview.html = webviewHtml(body, meta);
  }
}

function refreshAll() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const data = await fetchUsage();
      updateStatusItems(data);
      viewProvider?.render(data);
    } catch (error) {
      markOffline(error);
      viewProvider?.render(null, error);
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function configureCredential() {
  const credential = await vscode.window.showQuickPick(CREDENTIALS, {
    placeHolder: "Choose a QuotaHush credential",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!credential) return;

  const action = await vscode.window.showQuickPick(
    [
      { label: "Set or replace", value: "set", detail: `Save ${credential.label} locally` },
      { label: "Remove", value: "remove", detail: `Clear ${credential.label} from QuotaHush` },
    ],
    { placeHolder: credential.label },
  );
  if (!action) return;

  let value = "";
  if (action.value === "set") {
    const entered = await vscode.window.showInputBox({
      title: `QuotaHush: ${credential.label}`,
      prompt: credential.detail,
      password: true,
      ignoreFocusOut: true,
      validateInput: (candidate) => {
        if (!candidate.trim()) return "Enter a credential, or cancel to keep the current value.";
        if (/\r|\n/.test(candidate)) return "Credentials cannot contain new lines.";
        return undefined;
      },
    });
    if (entered == null) return;
    value = entered.trim();
  }

  try {
    await writeCredential(credential.key, value);
    const verb = action.value === "set" ? "saved" : "removed";
    vscode.window.showInformationMessage(`QuotaHush: ${credential.label} ${verb}.`);
    await refreshAll();
  } catch (error) {
    vscode.window.showErrorMessage(
      `QuotaHush could not update its local credential file: ${error.message}`,
    );
  }
}

function activate(context) {
  claudeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000000);
  claudeItem.command = "quotahush.refresh";
  claudeItem.text = "$(pulse) Claude";
  claudeItem.show();

  codexItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999999);
  codexItem.command = "quotahush.refresh";
  codexItem.text = "$(pulse) Codex";
  codexItem.show();

  deepseekItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999998);
  deepseekItem.command = "quotahush.refresh";
  deepseekItem.text = "$(pulse) DeepSeek";

  zaiItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999997);
  zaiItem.command = "quotahush.refresh";
  zaiItem.text = "$(pulse) Z.AI";

  Object.assign(providerItems, {
    claude: claudeItem,
    codex: codexItem,
    deepseek: deepseekItem,
    zai: zaiItem,
  });
  applyProviderVisibility();

  viewProvider = new UsageViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("quotahush.view", viewProvider),
    vscode.commands.registerCommand("quotahush.refresh", refreshAll),
    vscode.commands.registerCommand("quotahush.installCompanion", () =>
      vscode.env.openExternal(vscode.Uri.parse(COMPANION_URL)),
    ),
    vscode.commands.registerCommand("quotahush.configureProviders", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:wenress.quotahush-local quotahush.providers",
      ),
    ),
    vscode.commands.registerCommand("quotahush.configureCredentials", configureCredential),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("quotahush.providers")) return;
      applyProviderVisibility();
      refreshAll();
    }),
    claudeItem,
    codexItem,
    deepseekItem,
    zaiItem,
  );

  refreshAll();
  timer = setInterval(refreshAll, POLL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

function deactivate() {
  if (timer) clearInterval(timer);
}

module.exports = { activate, deactivate };

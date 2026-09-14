// Generated from shared/usage.js by npm run build. Do not edit.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QuotaHushShared = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeMarkdown(value) {
    return String(value ?? "").replace(/([\\`*_{}\[\]()<>#+\-.!|])/g, "\\$1");
  }

  function fmtPercent(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : "—";
  }

  function fmtDuration(seconds) {
    if (seconds == null || Number.isNaN(Number(seconds))) return "unknown";
    const safeSeconds = Math.max(0, Number(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function fmtResetAt(value) {
    if (!value) return "unknown";
    const resetMs = new Date(value).getTime();
    return Number.isNaN(resetMs) ? "unknown" : fmtDuration((resetMs - Date.now()) / 1000);
  }

  function fmtCodexReset(window) {
    if (!window) return "unknown";
    if (window.reset_at != null) {
      const numeric = Number(window.reset_at);
      const resetMs = Number.isFinite(numeric)
        ? numeric * 1000
        : new Date(window.reset_at).getTime();
      if (!Number.isNaN(resetMs)) return fmtDuration((resetMs - Date.now()) / 1000);
    }
    return fmtDuration(window.reset_after_seconds);
  }

  function moneyNumber(value, numericExponent = 0) {
    if (value == null) return null;
    if (typeof value === "object") {
      if (typeof value.amount_minor !== "number") return null;
      return value.amount_minor / 10 ** (value.exponent ?? 2);
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric / 10 ** numericExponent : null;
  }

  function fmtMoney(value, currency) {
    if (value == null) return null;
    if (typeof value === "object") {
      const amount = moneyNumber(value);
      if (amount == null) return null;
      const exponent = value.exponent ?? 2;
      return `${amount.toFixed(exponent)} ${value.currency || currency || ""}`.trim();
    }
    const numeric = moneyNumber(value);
    return numeric == null
      ? String(value)
      : `${numeric.toFixed(2)} ${currency || ""}`.trim();
  }

  function fmtCount(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric)
      : "—";
  }

  function fmtCompactCount(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(numeric)
      : "—";
  }

  function fmtDateTime(value) {
    if (!value) return "unknown";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "unknown" : parsed.toLocaleString();
  }

  function deepseekSpendLine(spend) {
    if (!Array.isArray(spend) || !spend.length) return "—";
    return spend
      .map(({ amount, currency }) => fmtMoney(amount, currency))
      .filter(Boolean)
      .join(" · ");
  }

  function deepseekBalanceDetails(deepseek) {
    const balance = deepseek?.balance;
    if (!balance || balance.error) return [];
    const infos = Array.isArray(balance.balance_infos) ? balance.balance_infos : [];
    const details = [];
    for (const info of infos) {
      const suffix = infos.length > 1 ? ` (${info.currency || ""})` : "";
      details.push({
        label: `Total${suffix}`,
        value: fmtMoney(info.total_balance, info.currency),
      });
      details.push({
        label: `Topped up${suffix}`,
        value: fmtMoney(info.topped_up_balance, info.currency),
      });
      details.push({
        label: `Granted${suffix}`,
        value: fmtMoney(info.granted_balance, info.currency),
      });
    }
    return details.filter(({ value }) => value != null);
  }

  function deepseekBalanceLine(deepseek) {
    return deepseekBalanceDetails(deepseek)
      .filter(({ label }) => label.startsWith("Total"))
      .map(({ value }) => value)
      .join(" · ");
  }

  function zaiBundles(zai) {
    return Array.isArray(zai?.usage_bundles) ? zai.usage_bundles : [];
  }

  function zaiCurrentBalance(zai) {
    const bundles = zaiBundles(zai);
    return bundles.length
      ? bundles.reduce((total, bundle) => total + (Number(bundle.current_balance) || 0), 0)
      : null;
  }

  function zaiUsedPercent(zai) {
    const bundles = zaiBundles(zai);
    const total = bundles.reduce((sum, bundle) => sum + (Number(bundle.total_tokens) || 0), 0);
    const balance = bundles.reduce((sum, bundle) => sum + (Number(bundle.current_balance) || 0), 0);
    return total > 0 ? Math.max(0, Math.min(100, (total - balance) * 100 / total)) : null;
  }

  function fmtCredits(value, numericExponent = 2) {
    const amount = moneyNumber(value, numericExponent);
    if (amount == null) return null;
    const exponent =
      typeof value === "object" ? value.exponent ?? 2 : numericExponent;
    return `${amount.toFixed(exponent)} credits`;
  }

  function claudeCreditDetails(claude) {
    const details = [];
    const extra = claude.extra_usage;
    if (extra) {
      if (!extra.is_enabled) {
        details.push({ label: "Extra usage", value: "Disabled" });
      } else {
        // Claude's API returns plain numeric extra-usage amounts in minor units.
        // `decimal_places` describes their scale (normally hundredths of a credit).
        const numericExponent = extra.decimal_places ?? 2;
        const used = fmtCredits(extra.used_credits, numericExponent) ?? "0 credits";
        const limit =
          extra.monthly_limit != null
            ? fmtCredits(extra.monthly_limit, numericExponent)
            : "no limit";
        details.push({ label: "Used", value: used });
        details.push({ label: "Monthly limit", value: limit });
        const usedAmount = moneyNumber(extra.used_credits, numericExponent);
        const limitAmount = moneyNumber(extra.monthly_limit, numericExponent);
        if (usedAmount != null && limitAmount != null) {
          const exponent =
            extra.monthly_limit?.exponent ??
            extra.used_credits?.exponent ??
            numericExponent;
          const available = {
            amount_minor: Math.round((limitAmount - usedAmount) * 10 ** exponent),
            exponent,
          };
          details.push({
            label: "Available",
            value: fmtCredits(available, numericExponent),
          });
        }
      }
    }
    const balance = claude.spend?.balance;
    if (balance != null) {
      const formatted = fmtCredits(balance, 2);
      if (formatted) details.push({ label: "Balance", value: formatted });
    }
    return details;
  }

  function claudeCreditsLine(claude) {
    return claudeCreditDetails(claude)
      .map(({ label, value }) => `${label} ${value}`)
      .join(" · ");
  }

  function codexCreditsLine(codex) {
    const credits = codex.credits;
    if (!credits) return "";
    if (credits.unlimited) return "Unlimited";
    if (!credits.has_credits) return "No credit balance";
    return `${credits.balance} credits`;
  }

  function codexWindows(codex) {
    const rateLimit = codex?.rate_limit || {};
    if (rateLimit.five_hour || rateLimit.seven_day) {
      return { session: rateLimit.five_hour, weekly: rateLimit.seven_day };
    }

    const primary = rateLimit.primary_window;
    const secondary = rateLimit.secondary_window;
    const windows = [primary, secondary].filter(Boolean);
    const duration = (window) =>
      window.limit_window_seconds ??
      (window.window_minutes != null ? window.window_minutes * 60 : null) ??
      (window.window_duration_mins != null ? window.window_duration_mins * 60 : null);
    const session = windows.find((window) => duration(window) === 5 * 60 * 60);
    const weekly = windows.find((window) => duration(window) === 7 * 24 * 60 * 60);
    if (session || weekly) return { session, weekly };
    return { session: primary, weekly: secondary };
  }

  function barHtml(value) {
    const numeric = Number(value);
    const percent = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
    const level = percent >= 90 ? "crit" : percent >= 70 ? "warn" : "";
    return `<div class="bar"><div class="bar-fill ${level}" style="width:${percent}%"></div></div>`;
  }

  function createRenderers({ providerHeading, cacheNotice }) {
    function renderClaudeHtml(claude) {
      if (!claude) return "";
      if (claude.error) {
        return `${providerHeading("claude", "Claude Code")}<div class="error">${escapeHtml(claude.message || claude.error)}</div>`;
      }
      const session = claude.five_hour;
      const weekly = claude.seven_day;
      const creditDetails = claudeCreditDetails(claude);
      const creditsHtml = creditDetails.length
        ? `<div class="credits spaced">
            <div class="credits-title">Credits</div>
            ${creditDetails
              .map(
                ({ label, value }) =>
                  `<div class="credit-row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`,
              )
              .join("")}
          </div>`
        : "";
      return `
        ${providerHeading("claude", `Claude Code (${claude.plan_type || "unknown plan"})`)}
        ${cacheNotice(claude)}
        <div class="row"><span class="label">Session (5h)</span><span class="value">${fmtPercent(session.utilization)}%</span></div>
        ${barHtml(session.utilization)}
        <div class="row"><span class="label">Resets</span><span class="value">${fmtResetAt(session.resets_at)}</span></div>
        <div class="row spaced"><span class="label">Weekly</span><span class="value">${fmtPercent(weekly.utilization)}%</span></div>
        ${barHtml(weekly.utilization)}
        <div class="row"><span class="label">Resets</span><span class="value">${fmtResetAt(weekly.resets_at)}</span></div>
        ${creditsHtml}
      `;
    }

    function renderCodexHtml(codex) {
      if (!codex) return "";
      if (codex.error) {
        return `${providerHeading("codex", "Codex")}<div class="error">${escapeHtml(codex.message || codex.error)}</div>`;
      }
      const { session, weekly } = codexWindows(codex);
      const credits = codexCreditsLine(codex);
      let html = providerHeading("codex", `Codex (${codex.plan_type || "unknown plan"})`);
      if (session) {
        html += `
          <div class="row"><span class="label">Session (5h)</span><span class="value">${fmtPercent(session.used_percent)}%</span></div>
          ${barHtml(session.used_percent)}
          <div class="row"><span class="label">Resets</span><span class="value">${fmtCodexReset(session)}</span></div>
        `;
      }
      if (weekly) {
        html += `
          <div class="row spaced"><span class="label">Weekly</span><span class="value">${fmtPercent(weekly.used_percent)}%</span></div>
          ${barHtml(weekly.used_percent)}
          <div class="row"><span class="label">Resets</span><span class="value">${fmtCodexReset(weekly)}</span></div>
        `;
      }
      if (credits) {
        html += `<div class="row spaced"><span class="label">Credits</span><span class="value">${escapeHtml(credits)}</span></div>`;
      }
      return html;
    }

    function renderDeepSeekHtml(deepseek) {
      if (!deepseek) return "";
      if (deepseek.error === "not_configured") return "";
      if (deepseek.error) {
        return `${providerHeading("deepseek", "DeepSeek")}<div class="error">${escapeHtml(deepseek.message || deepseek.error)}</div>`;
      }

      let html = providerHeading("deepseek", "DeepSeek API");
      html += cacheNotice(deepseek);
      const balance = deepseek.balance;
      if (balance?.error) {
        html += `<div class="error">Balance: ${escapeHtml(balance.message || balance.error)}</div>`;
      } else {
        const details = deepseekBalanceDetails(deepseek);
        if (details.length) {
          html += `<div class="credits">
            <div class="credits-title">Balance</div>
            ${details
              .map(
                ({ label, value }) =>
                  `<div class="credit-row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`,
              )
              .join("")}
          </div>`;
        }
      }

      const usage = deepseek.usage;
      if (usage?.error) {
        html += `<div class="stale spaced">Usage: ${escapeHtml(usage.message || usage.error)}</div>`;
        return html;
      }
      if (!usage?.today || !usage?.month) return html;

      html += `
        <div class="credits spaced">
          <div class="credits-title">Usage</div>
          <div class="credit-row"><span class="label">Today spend</span><span class="value">${escapeHtml(deepseekSpendLine(usage.today.spend))}</span></div>
          <div class="credit-row"><span class="label">Today tokens</span><span class="value">${fmtCount(usage.today.total_tokens)}</span></div>
          <div class="credit-row"><span class="label">Today requests</span><span class="value">${fmtCount(usage.today.requests)}</span></div>
          <div class="credit-row section-gap"><span class="label">Month spend</span><span class="value">${escapeHtml(deepseekSpendLine(usage.month.spend))}</span></div>
          <div class="credit-row"><span class="label">Month tokens</span><span class="value">${fmtCount(usage.month.total_tokens)}</span></div>
          <div class="credit-row"><span class="label">Month requests</span><span class="value">${fmtCount(usage.month.requests)}</span></div>
        </div>
      `;
      return html;
    }

    function renderZaiHtml(zai) {
      if (!zai) return "";
      if (zai.error === "not_configured") return "";
      if (zai.error) {
        return `${providerHeading("zai", "Z.AI")}<div class="error">${escapeHtml(zai.message || zai.error)}</div>`;
      }

      let html = providerHeading("zai", "Z.AI");
      html += cacheNotice(zai);
      const bundles = zaiBundles(zai);
      if (bundles.length) {
        html += `<div class="credits">
          <div class="credits-title">Usage Bundle${bundles.length > 1 ? "s" : ""}</div>
          ${bundles
            .map((bundle, index) => {
              const sectionClass = index ? " section-gap" : "";
              return `
                <div class="bundle-name${sectionClass}">${escapeHtml(bundle.name || "Usage Bundle")}</div>
                <div class="credit-row"><span class="label">Current balance</span><span class="value">${fmtCount(bundle.current_balance)} tokens</span></div>
                <div class="credit-row"><span class="label">Expiration time</span><span class="value wrap">${escapeHtml(fmtDateTime(bundle.expiration_time))}</span></div>
                <div class="row spaced"><span class="label">Used</span><span class="value">${fmtPercent(bundle.used_percent)}%</span></div>
                ${barHtml(bundle.used_percent)}
              `;
            })
            .join("")}
        </div>`;
      } else {
        html += `<div class="stale">No active usage bundles.</div>`;
      }

      // These blocks intentionally render only when future Z.AI endpoints
      // provide real data; null values do not produce placeholder sections.
      if (zai.coding_plan) {
        html += `<div class="row spaced"><span class="label">Coding Plan</span><span class="value">${escapeHtml(zai.coding_plan.name || zai.coding_plan.status || "Active")}</span></div>`;
      }
      if (zai.credits) {
        html += `<div class="row spaced"><span class="label">Credits</span><span class="value">${escapeHtml(zai.credits.balance ?? zai.credits)}</span></div>`;
      }
      return html;
    }

    return { renderClaudeHtml, renderCodexHtml, renderDeepSeekHtml, renderZaiHtml };
  }

  return {
    escapeHtml,
    escapeMarkdown,
    fmtPercent,
    fmtDuration,
    fmtResetAt,
    fmtCodexReset,
    fmtMoney,
    fmtCount,
    fmtCompactCount,
    fmtDateTime,
    deepseekSpendLine,
    deepseekBalanceDetails,
    deepseekBalanceLine,
    zaiBundles,
    zaiCurrentBalance,
    zaiUsedPercent,
    claudeCreditDetails,
    claudeCreditsLine,
    codexCreditsLine,
    codexWindows,
    barHtml,
    createRenderers,
  };
});

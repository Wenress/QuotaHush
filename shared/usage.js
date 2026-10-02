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

  function fmtLocalTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function fmtLocalDate(value) {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  function fmtResetMoment(resetMs, nowMs = Date.now(), includeDate = false) {
    const localTime = fmtLocalTime(resetMs);
    if (!localTime) return "unknown";
    const date = includeDate || resetMs - nowMs >= 86400000
      ? ` · ${fmtLocalDate(resetMs)}` : "";
    return `${fmtDuration((resetMs - nowMs) / 1000)}${date} at ${localTime}`;
  }

  function fmtResetAt(value, includeDate = false) {
    if (!value) return "unknown";
    const resetMs = new Date(value).getTime();
    return Number.isNaN(resetMs) ? "unknown" : fmtResetMoment(resetMs, Date.now(), includeDate);
  }

  function fmtCodexReset(window, includeDate = false) {
    if (!window) return "unknown";
    if (window.reset_at != null) {
      const numeric = Number(window.reset_at);
      const resetMs = Number.isFinite(numeric)
        ? numeric * 1000
        : new Date(window.reset_at).getTime();
      if (!Number.isNaN(resetMs)) return fmtResetMoment(resetMs, Date.now(), includeDate);
    }
    if (window.reset_after_seconds == null) return "unknown";
    const resetAfterSeconds = Number(window.reset_after_seconds);
    if (!Number.isFinite(resetAfterSeconds)) return "unknown";
    const nowMs = Date.now();
    return fmtResetMoment(nowMs + resetAfterSeconds * 1000, nowMs, includeDate);
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

  function finiteAmount(value) {
    if (value == null || typeof value === "boolean" || typeof value === "object" || String(value).trim() === "") return null;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  }

  function codexCreditDetails(codex) {
    const credits = codex?.credits;
    if (!credits) return [];
    if (credits.unlimited) return [{ label: "Balance", value: "Unlimited" }];
    const balance = finiteAmount(credits.balance);
    if (balance == null) return [{
      label: "Balance", value: credits.has_credits === false ? "No credit balance" : "Unknown",
    }];
    const details = [{ label: "Balance", value: `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(balance)} credits` }];
    // Standard personal-plan face value: 2,500 credits = $100.
    // https://developers.openai.com/community/students
    // Workspace purchase prices depend on the agreement; do not assume a rate.
    if (["free", "go", "plus", "pro"].includes(codex.plan_type)) {
      details.push({ label: "Estimated value (USD)", value: `$${(balance / 25).toFixed(2)}` });
      details.push({ label: "Standard rate", value: "1 credit ≈ $0.04" });
    }
    return details;
  }

  function codexCreditsLine(codex) {
    return codexCreditDetails(codex).map(({ value }) => value).join(" · ");
  }

  function resetCount(value) {
    const count = finiteAmount(value);
    return Number.isSafeInteger(count) ? count : null;
  }

  function resetExpiry(value) {
    if (value == null || value === "") return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  function claudeResetInfo(claude) {
    const source = claude?.cedar_ember;
    const unknown = { count: null, entries: [], message: "Reset availability is unavailable here. Check Claude Settings > Usage." };
    if (!source || !Array.isArray(source.grants)) return unknown;
    if (!source.eligible && source.ineligible_reason) return unknown;
    const entries = [];
    let count = 0;
    for (const grant of source.grants) {
      const remaining = resetCount(grant.resets_left);
      if (remaining == null) return unknown;
      const expires = resetExpiry(grant.ends_at);
      const starts = resetExpiry(grant.starts_at);
      if (!remaining || (expires != null && expires <= Date.now()) || (starts != null && starts > Date.now())) continue;
      count += remaining;
      const covers = (Array.isArray(grant.clears) ? grant.clears : [])
        .map((key) => ({ five_hour: "Session (5h)", seven_day: "Weekly", seven_day_opus: "Weekly Opus", seven_day_sonnet: "Weekly Sonnet", seven_day_overage_included: "Weekly included overage" })[key] || "Other limits")
        .join(" + ");
      entries.push({
        title: grant.label || "Limit reset", count: remaining,
        expiresAt: grant.ends_at, startsAt: grant.starts_at, covers,
        status: grant.paused ? "Paused" : grant.usable_now ? "Available now" : "Available when eligible",
      });
    }
    return { count, entries, message: count === 0 ? "No available resets." : null };
  }

  function codexResetInfo(codex) {
    const source = codex?.rate_limit_reset_credits;
    if (!source) return { count: null, entries: [], message: "Reset availability is not provided." };
    const count = resetCount(source.available_count);
    const entries = (Array.isArray(source.credits) ? source.credits : [])
      .filter((credit) => credit.status === "available" &&
        (resetExpiry(credit.expires_at) == null || resetExpiry(credit.expires_at) > Date.now()))
      .map((credit) => ({
        title: credit.title || "Limit reset", count: 1, expiresAt: credit.expires_at,
        grantedAt: credit.granted_at, description: credit.description,
        status: credit.is_supported_by_plan === false ? "Not supported by this plan" : "Available",
      }));
    const availableCount = Array.isArray(source.credits) ? entries.length : count;
    return {
      count: availableCount, entries,
      applicableCount: resetCount(source.applicable_available_count),
      message: source.details_unavailable || (!Array.isArray(source.credits) && count !== 0)
        ? "Reset details are currently unavailable."
        : availableCount === 0 ? "No available resets." : null,
    };
  }

  function resetExpiryLabel(value) {
    if (value === undefined) return "Unknown";
    return value === null ? "No expiry" : fmtResetAt(value, true);
  }

  function resetInfoHtml(info, provider) {
    return `<details class="credits available-resets" data-provider="${provider}">
      <summary>Available Resets: ${info.count ?? "—"}</summary>
      ${info.applicableCount != null ? `<div class="credit-row"><span class="label">Usable now</span><span class="value">${info.applicableCount}</span></div>` : ""}
      ${info.entries.map((entry) => `<div class="reset-entry">
        <div class="reset-title">${escapeHtml(entry.title)}${entry.count > 1 ? ` × ${entry.count}` : ""}</div>
        ${entry.description ? `<div class="reset-description label">${escapeHtml(entry.description)}</div>` : ""}
        ${entry.covers ? `<div class="credit-row"><span class="label">Covers</span><span class="value wrap">${escapeHtml(entry.covers)}</span></div>` : ""}
        <div class="credit-row"><span class="label">Status</span><span class="value wrap">${escapeHtml(entry.status)}</span></div>
        <div class="credit-row"><span class="label">Expires</span><span class="value wrap">${escapeHtml(resetExpiryLabel(entry.expiresAt))}</span></div>
        ${entry.grantedAt ? `<div class="credit-row"><span class="label">Granted</span><span class="value wrap">${escapeHtml(fmtDateTime(entry.grantedAt))}</span></div>` : ""}
      </div>`).join("")}
      ${info.message ? `<div class="reset-description label">${escapeHtml(info.message)}</div>` : ""}
    </details>`;
  }

  function resetInfoMarkdown(info) {
    const heading = `Available Resets: **${info.count ?? "—"}**\n\n`;
    const usable = info.applicableCount != null ? `Usable now: ${info.applicableCount}\n\n` : "";
    return heading + usable + info.entries.map((entry) =>
      `- ${escapeMarkdown(entry.title)}${entry.count > 1 ? ` × ${entry.count}` : ""} — ${escapeMarkdown(entry.status)}; expires ${escapeMarkdown(resetExpiryLabel(entry.expiresAt))}${entry.covers ? `; ${escapeMarkdown(entry.covers)}` : ""}\n`,
    ).join("") + (info.message ? `${escapeMarkdown(info.message)}\n` : "") + "\n";
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
        <div class="row reset-row"><span class="label">Resets</span><span class="value">${fmtResetAt(weekly.resets_at, true)}</span></div>
        ${creditsHtml}
        ${resetInfoHtml(claudeResetInfo(claude), "claude")}
      `;
    }

    function renderCodexHtml(codex) {
      if (!codex) return "";
      if (codex.error) {
        return `${providerHeading("codex", "Codex")}<div class="error">${escapeHtml(codex.message || codex.error)}</div>`;
      }
      const { session, weekly } = codexWindows(codex);
      const credits = codexCreditDetails(codex);
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
          <div class="row reset-row"><span class="label">Resets</span><span class="value">${fmtCodexReset(weekly, true)}</span></div>
        `;
      }
      if (credits.length) {
        html += `<div class="credits spaced"><div class="credits-title">Credits</div>${credits.map(({ label, value }) =>
          `<div class="credit-row"><span class="label">${escapeHtml(label)}</span><span class="value wrap">${escapeHtml(value)}</span></div>`,
        ).join("")}</div>`;
      }
      html += resetInfoHtml(codexResetInfo(codex), "codex");
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
    codexCreditDetails,
    claudeResetInfo,
    codexResetInfo,
    resetInfoMarkdown,
    codexWindows,
    barHtml,
    createRenderers,
  };
});

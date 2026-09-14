const test = require("node:test");
const assert = require("node:assert/strict");

const usage = require("../shared/usage");

test("classifies Codex windows by duration", () => {
  const fiveHour = { limit_window_seconds: 5 * 60 * 60, used_percent: 20 };
  const weekly = { window_minutes: 7 * 24 * 60, used_percent: 40 };
  const windows = usage.codexWindows({
    rate_limit: { primary_window: weekly, secondary_window: fiveHour },
  });

  assert.equal(windows.session, fiveHour);
  assert.equal(windows.weekly, weekly);
});

test("formats structured Claude credit amounts without NaN", () => {
  const line = usage.claudeCreditsLine({
    extra_usage: {
      is_enabled: true,
      used_credits: { amount_minor: 1250, exponent: 2, currency: "EUR" },
      monthly_limit: { amount_minor: 5000, exponent: 2, currency: "EUR" },
    },
  });

  assert.match(line, /12\.50 credits/);
  assert.match(line, /50\.00 credits/);
  assert.match(line, /Available 37\.50 credits/);
  assert.doesNotMatch(line, /NaN/);
});

test("scales numeric Claude credit amounts from minor units", () => {
  const line = usage.claudeCreditsLine({
    extra_usage: {
      is_enabled: true,
      used_credits: 216,
      monthly_limit: 5000,
      currency: "USD",
      decimal_places: 2,
    },
    spend: {
      balance: { amount_minor: 500, exponent: 2, currency: "USD" },
    },
  });

  assert.match(line, /Used 2\.16 credits/);
  assert.match(line, /Monthly limit 50\.00 credits/);
  assert.match(line, /Available 47\.84 credits/);
  assert.match(line, /Balance 5\.00 credits/);
  assert.doesNotMatch(line, /USD/);
  assert.doesNotMatch(line, /216\.00/);

  const { renderClaudeHtml } = usage.createRenderers({
    providerHeading: (_provider, label) => `<h2>${usage.escapeHtml(label)}</h2>`,
    cacheNotice: () => "",
  });
  const html = renderClaudeHtml({
    five_hour: { utilization: 10 },
    seven_day: { utilization: 20 },
    extra_usage: {
      is_enabled: true,
      used_credits: 216,
      monthly_limit: 5000,
      decimal_places: 2,
    },
  });
  assert.match(html, /class="credits spaced"/);
  assert.match(html, />Used<.*>2\.16 credits</s);
  assert.match(html, />Monthly limit<.*>50\.00 credits</s);
  assert.match(html, />Available<.*>47\.84 credits</s);
});

test("clamps progress bars and escapes provider errors", () => {
  assert.match(usage.barHtml(150), /width:100%/);
  const { renderClaudeHtml } = usage.createRenderers({
    providerHeading: (_provider, label) => `<h2>${usage.escapeHtml(label)}</h2>`,
    cacheNotice: () => "",
  });
  const html = renderClaudeHtml({ error: "failed", message: "<script>alert(1)</script>" });

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renders DeepSeek balance, daily spend, monthly spend, and tokens", () => {
  const { renderDeepSeekHtml } = usage.createRenderers({
    providerHeading: (_provider, label) => `<h2>${usage.escapeHtml(label)}</h2>`,
    cacheNotice: () => "",
  });
  const html = renderDeepSeekHtml({
    balance: {
      is_available: true,
      balance_infos: [
        {
          currency: "USD",
          total_balance: "12.34",
          topped_up_balance: "10.00",
          granted_balance: "2.34",
        },
      ],
    },
    usage: {
      today: { spend: [{ currency: "USD", amount: "0.12" }], total_tokens: 1234, requests: 2 },
      month: { spend: [{ currency: "USD", amount: "4.56" }], total_tokens: 98765, requests: 20 },
    },
  });

  assert.match(html, /12\.34 USD/);
  assert.match(html, /Today spend.*0\.12 USD/s);
  assert.match(html, /Today tokens.*1,234/s);
  assert.match(html, /Month spend.*4\.56 USD/s);
  assert.match(html, /Month tokens.*98,765/s);
});

test("renders DeepSeek balance even when the platform token is missing", () => {
  const { renderDeepSeekHtml } = usage.createRenderers({
    providerHeading: (_provider, label) => `<h2>${usage.escapeHtml(label)}</h2>`,
    cacheNotice: () => "",
  });
  const html = renderDeepSeekHtml({
    balance: {
      balance_infos: [{ currency: "CNY", total_balance: "8", topped_up_balance: "8", granted_balance: "0" }],
    },
    usage: { error: "platform_token_missing", message: "Add token <now>" },
  });

  assert.match(html, /8\.00 CNY/);
  assert.match(html, /Add token &lt;now&gt;/);
});

test("hides optional providers that are not configured", () => {
  const { renderDeepSeekHtml, renderZaiHtml } = usage.createRenderers({
    providerHeading: (_provider, label) => `<h2>${usage.escapeHtml(label)}</h2>`,
    cacheNotice: () => "",
  });

  const notConfigured = { error: "not_configured", message: "Add an API key." };
  assert.equal(renderDeepSeekHtml(notConfigured), "");
  assert.equal(renderZaiHtml(notConfigured), "");
});

test("renders Z.AI usage bundle balance, expiration, and consumed quota", () => {
  const { renderZaiHtml } = usage.createRenderers({
    providerHeading: (_provider, label) => `<h2>${usage.escapeHtml(label)}</h2>`,
    cacheNotice: () => "",
  });
  const zai = {
    usage_bundles: [
      {
        name: "100 million GLM-5.3-Flash Premium Pack",
        current_balance: 58561817,
        total_tokens: 100000000,
        used_percent: 41.44,
        expiration_time: "2026-12-09T07:15:28",
      },
    ],
    coding_plan: null,
    credits: null,
  };

  const html = renderZaiHtml(zai);

  assert.match(html, /Current balance.*58,561,817 tokens/s);
  assert.match(html, /Expiration time.*2026/s);
  assert.match(html, /Used.*41\.44%/s);
  assert.match(html, /width:41\.44%/);
  assert.doesNotMatch(html, /Coding Plan/);
  assert.doesNotMatch(html, />Credits</);
  assert.equal(usage.zaiCurrentBalance(zai), 58561817);
  assert.equal(usage.zaiUsedPercent(zai), 41.438183);
});

test("generated clients expose the canonical API", () => {
  const browserCopy = require("../extension/usage-shared");
  const vscodeCopy = require("../vscode-extension/usage-shared");

  assert.deepEqual(Object.keys(browserCopy).sort(), Object.keys(usage).sort());
  assert.deepEqual(Object.keys(vscodeCopy).sort(), Object.keys(usage).sort());
});

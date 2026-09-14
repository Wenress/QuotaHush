const SERVER_URL = "http://127.0.0.1:8765/usage";
const POLL_MS = 60000;
const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 15000;
const COMPANION_URL = "https://github.com/Wenress/QuotaHush/releases";

const { createRenderers, escapeHtml, fmtDuration } = QuotaHushShared;
const content = document.getElementById("content");
const meta = document.getElementById("meta");
let timer = null;
let retryDelay = RETRY_MIN_MS;

function providerHeading(icon, label) {
  return `<h2 class="provider-title"><img class="provider-icon" src="icons/${icon}.svg" alt="">${escapeHtml(label)}</h2>`;
}

function cacheNotice(provider) {
  const cache = provider?._cache;
  if (!cache?.stale || !cache.fetched_at) return "";
  const age = (Date.now() - new Date(cache.fetched_at).getTime()) / 1000;
  return `<div class="stale">Cached data · ${fmtDuration(age)} old</div>`;
}

const { renderClaudeHtml, renderCodexHtml, renderDeepSeekHtml, renderZaiHtml } = createRenderers({
  providerHeading,
  cacheNotice,
});

async function refresh() {
  clearTimeout(timer);
  let ok = false;
  try {
    const response = await fetch(SERVER_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`server returned ${response.status}`);
    const data = await response.json();
    content.innerHTML =
      renderClaudeHtml(data.claude) +
      renderCodexHtml(data.codex) +
      renderDeepSeekHtml(data.deepseek) +
      renderZaiHtml(data.zai);
    meta.textContent = "Updated " + new Date(data.fetched_at).toLocaleTimeString();
    ok = true;
  } catch {
    content.innerHTML = `
      <div class="offline">
        Can't reach the local QuotaHush server on 127.0.0.1:8765.<br><br>
        Install or start QuotaHush Companion, then try again.<br>
        <a class="install-button" href="${COMPANION_URL}" target="_blank" rel="noreferrer">Get QuotaHush Companion</a>
      </div>`;
    meta.textContent = "";
  }

  if (ok) {
    retryDelay = RETRY_MIN_MS;
    timer = setTimeout(refresh, POLL_MS);
  } else {
    timer = setTimeout(refresh, retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  }
}

refresh();
window.addEventListener("unload", () => clearTimeout(timer));

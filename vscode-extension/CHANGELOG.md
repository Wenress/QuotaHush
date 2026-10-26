# Changelog

## 0.1.9

- Fix automatic Companion updates on Windows: the updater launched its script detached from any console, so it exited without installing.
- Refresh an expired Claude token before requesting usage, so a rate-limited expired token no longer leaves the Companion on cached data.

## 0.1.8

- Format Codex credits and show their estimated USD value for personal plans.
- Include the local calendar date in weekly reset times.
- Add expandable available-reset counts, details, and expiration dates for Claude and Codex.
- Use compatible Claude client headers so existing reset grants are returned.

## 0.1.0

- Initial QuotaHush release.
- Claude Code, Codex, DeepSeek, and Z.AI usage indicators.
- Guided installation link when QuotaHush Companion is unavailable.

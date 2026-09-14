"""Reads Codex CLI's local OAuth credentials and fetches usage from ChatGPT's backend."""
from __future__ import annotations

import json
import os
import urllib.error
from pathlib import Path

from quotahush_server.providers._cache import TTLCache
from quotahush_server.providers._credentials import merge_credential_section
from quotahush_server.providers._http import (
    refresh_oauth_token,
    request_json,
    retry_after_seconds,
)

USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
TOKEN_URL = "https://auth.openai.com/oauth/token"
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"

_cache = TTLCache(ttl_seconds=55.0, default_backoff_seconds=120.0)

FIVE_HOURS_SECONDS = 5 * 60 * 60
SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60


def _window_seconds(window: dict) -> float | None:
    """Return a rate-limit window's duration across known API spellings."""
    seconds = window.get("limit_window_seconds")
    if isinstance(seconds, (int, float)) and not isinstance(seconds, bool):
        return float(seconds)

    minutes = window.get("window_minutes", window.get("window_duration_mins"))
    if isinstance(minutes, (int, float)) and not isinstance(minutes, bool):
        return float(minutes) * 60
    return None


def _normalise_rate_limit_windows(payload: dict) -> dict:
    """Add stable aliases without changing the upstream primary/secondary data.

    Codex has moved a lone weekly limit between the primary and secondary slots.
    Duration is therefore the reliable way to identify the 5-hour and 7-day
    meters. The positional fallback only applies to legacy payloads that do not
    report either duration.
    """
    rate_limit = payload.get("rate_limit")
    if not isinstance(rate_limit, dict):
        return payload

    aliases: dict[str, dict] = {}
    candidates = [
        rate_limit.get("primary_window"),
        rate_limit.get("secondary_window"),
    ]
    candidates = [window for window in candidates if isinstance(window, dict)]

    has_known_duration = False
    for window in candidates:
        duration = _window_seconds(window)
        if duration == FIVE_HOURS_SECONDS:
            aliases["five_hour"] = window
            has_known_duration = True
        elif duration == SEVEN_DAYS_SECONDS:
            aliases["seven_day"] = window
            has_known_duration = True

    if not has_known_duration:
        primary = rate_limit.get("primary_window")
        secondary = rate_limit.get("secondary_window")
        if isinstance(primary, dict):
            aliases["five_hour"] = primary
        if isinstance(secondary, dict):
            aliases["seven_day"] = secondary

    result = dict(payload)
    result["rate_limit"] = {**rate_limit, **aliases}
    return result


def _auth_path() -> Path:
    codex_home = os.environ.get("CODEX_HOME")
    if codex_home:
        return Path(codex_home) / "auth.json"
    return Path.home() / ".codex" / "auth.json"


def _load_auth() -> dict:
    path = _auth_path()
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _call_usage(access_token: str, account_id: str) -> dict:
    return request_json(
        USAGE_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "chatgpt-account-id": account_id,
            "User-Agent": "codex-cli",
        },
    )


def _refresh(refresh_token: str) -> dict:
    return refresh_oauth_token(TOKEN_URL, CLIENT_ID, refresh_token)


def _fetch_fresh() -> dict:
    try:
        auth = _load_auth()
    except FileNotFoundError:
        return {"error": "not_logged_in", "message": "~/.codex/auth.json not found"}
    except (json.JSONDecodeError, OSError) as exc:
        return {"error": "read_failed", "message": str(exc)}

    tokens = auth.get("tokens") or {}
    access_token = tokens.get("access_token")
    account_id = tokens.get("account_id")
    if not access_token or not account_id:
        return {"error": "not_logged_in", "message": "No Codex OAuth token on this machine"}

    try:
        return _call_usage(access_token, account_id)
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            return {
                "error": "http_error",
                "message": f"{exc.code} {exc.reason}",
                "retry_after": retry_after_seconds(exc),
            }
        if exc.code not in (401, 403) or not tokens.get("refresh_token"):
            return {"error": "http_error", "message": f"{exc.code} {exc.reason}"}
    except urllib.error.URLError as exc:
        return {"error": "network_error", "message": str(exc)}

    try:
        refreshed = _refresh(tokens["refresh_token"])
    except urllib.error.HTTPError as exc:
        return {
            "error": "refresh_failed",
            "message": f"{exc.code} {exc.reason}. Run 'codex login' again.",
        }
    except urllib.error.URLError as exc:
        return {"error": "network_error", "message": str(exc)}

    expected_tokens = {
        "access_token": tokens.get("access_token"),
        "refresh_token": tokens.get("refresh_token"),
        "account_id": tokens.get("account_id"),
    }
    updates = {
        "access_token": refreshed.get("access_token", access_token),
        "refresh_token": refreshed.get("refresh_token", tokens.get("refresh_token")),
    }
    if "id_token" in refreshed:
        updates["id_token"] = refreshed["id_token"]
    tokens, _ = merge_credential_section(
        _auth_path(), "tokens", expected_tokens, updates
    )
    account_id = tokens.get("account_id", account_id)

    try:
        return _call_usage(tokens["access_token"], account_id)
    except urllib.error.HTTPError as exc:
        result = {"error": "http_error", "message": f"{exc.code} {exc.reason}"}
        if exc.code == 429:
            result["retry_after"] = retry_after_seconds(exc)
        return result
    except urllib.error.URLError as exc:
        return {"error": "network_error", "message": str(exc)}


def get_usage() -> dict:
    return _normalise_rate_limit_windows(_cache.get(_fetch_fresh))

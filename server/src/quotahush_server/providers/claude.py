"""Reads Claude Code's local OAuth credentials and fetches usage from Anthropic."""
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

USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"


def _usage_cache_path() -> Path:
    configured = os.environ.get("QUOTAHUSH_CACHE_DIR")
    if configured:
        return Path(configured) / "claude_usage.json"
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "QuotaHush" / "cache" / "claude_usage.json"
    return Path.home() / ".cache" / "quotahush" / "claude_usage.json"


# Anthropic's undocumented usage endpoint is aggressively rate limited.
# Five minutes matches QuotaHush's refresh cadence and prevents the browser,
# VS Code, and the server's self-poll from multiplying upstream requests.
_cache = TTLCache(
    ttl_seconds=300.0,
    default_backoff_seconds=300.0,
    max_backoff_seconds=3600.0,
    storage_path=_usage_cache_path(),
    include_metadata=True,
)


def _credentials_path() -> Path:
    config_dir = os.environ.get("CLAUDE_CONFIG_DIR")
    if config_dir:
        return Path(config_dir) / ".credentials.json"
    return Path.home() / ".claude" / ".credentials.json"


def _load_credentials() -> dict:
    path = _credentials_path()
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _call_usage(access_token: str) -> dict:
    return request_json(
        USAGE_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "anthropic-beta": "oauth-2025-04-20",
            "User-Agent": "claude-cli/1.0.0",
        },
    )


def _refresh(refresh_token: str, scopes: list[str] | None = None) -> dict:
    return refresh_oauth_token(
        TOKEN_URL,
        CLIENT_ID,
        refresh_token,
        scope=" ".join(scopes or []),
        headers={
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "claude-cli/2.1.241",
        },
    )


def _retry_with_rotated_credentials(oauth: dict) -> dict | None:
    """Retry if Claude Code refreshed the single-use token concurrently."""
    try:
        current = _load_credentials().get("claudeAiOauth") or {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    if current.get("accessToken") == oauth.get("accessToken"):
        return None
    try:
        result = _call_usage(current["accessToken"])
        result["plan_type"] = current.get("subscriptionType")
        return result
    except (KeyError, urllib.error.HTTPError, urllib.error.URLError):
        return None


def _fetch_fresh() -> dict:
    try:
        creds = _load_credentials()
    except FileNotFoundError:
        return {"error": "not_logged_in", "message": "Not logged in. Run 'claude auth login'."}
    except (json.JSONDecodeError, OSError) as exc:
        return {"error": "read_failed", "message": str(exc)}

    oauth = creds.get("claudeAiOauth")
    if not oauth or not oauth.get("accessToken"):
        return {"error": "not_logged_in", "message": "Not logged in. Run 'claude auth login'."}

    plan_type = oauth.get("subscriptionType")

    try:
        result = _call_usage(oauth["accessToken"])
        result["plan_type"] = plan_type
        return result
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            return {
                "error": "http_error",
                "message": f"{exc.code} {exc.reason}",
                "retry_after": retry_after_seconds(exc),
            }
        if exc.code not in (401, 403) or not oauth.get("refreshToken"):
            return {"error": "http_error", "message": f"{exc.code} {exc.reason}"}
    except urllib.error.URLError as exc:
        return {"error": "network_error", "message": str(exc)}

    try:
        refreshed = _refresh(oauth["refreshToken"], oauth.get("scopes"))
    except urllib.error.HTTPError as exc:
        raced_result = _retry_with_rotated_credentials(oauth)
        if raced_result is not None:
            return raced_result
        return {
            "error": "refresh_failed",
            "message": (
                f"OAuth refresh failed ({exc.code} {exc.reason}). "
                "Run 'claude auth login'."
            ),
        }
    except urllib.error.URLError as exc:
        return {"error": "network_error", "message": str(exc)}

    expected_oauth = {
        "accessToken": oauth.get("accessToken"),
        "refreshToken": oauth.get("refreshToken"),
    }
    updates = {
        "accessToken": refreshed.get("access_token", oauth["accessToken"]),
        "refreshToken": refreshed.get("refresh_token", oauth["refreshToken"]),
    }
    if "expires_in" in refreshed:
        import time

        updates["expiresAt"] = int((time.time() + refreshed["expires_in"]) * 1000)
    oauth, _ = merge_credential_section(
        _credentials_path(), "claudeAiOauth", expected_oauth, updates
    )
    plan_type = oauth.get("subscriptionType", plan_type)

    try:
        result = _call_usage(oauth["accessToken"])
        result["plan_type"] = plan_type
        return result
    except urllib.error.HTTPError as exc:
        result = {"error": "http_error", "message": f"{exc.code} {exc.reason}"}
        if exc.code == 429:
            result["retry_after"] = retry_after_seconds(exc)
        return result
    except urllib.error.URLError as exc:
        return {"error": "network_error", "message": str(exc)}


def get_usage() -> dict:
    return _cache.get(_fetch_fresh)

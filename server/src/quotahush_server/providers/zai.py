"""Fetch Z.AI usage bundles using the locally configured API key."""
from __future__ import annotations

import os
import urllib.error

from quotahush_server.providers._cache import TTLCache
from quotahush_server.providers._credentials import provider_env_file
from quotahush_server.providers._http import request_json, retry_after_seconds

USAGE_BUNDLES_URL = (
    "https://api.z.ai/api/biz/tokenAccounts/list/my"
    "?pageNum=1&pageSize=10&statusFilter=ALL"
)

# Keep Z.AI on the same five-minute upstream cadence as Claude. Client refreshes
# inside this interval are served from this cache.
_cache = TTLCache(ttl_seconds=300.0, default_backoff_seconds=300.0)


def _read_env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = provider_env_file().read_text(encoding="utf-8-sig").splitlines()
    except (FileNotFoundError, OSError, UnicodeError):
        return values

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[7:].lstrip()
        equals = line.find("=")
        colon = line.find(":")
        separators = [index for index in (equals, colon) if index > 0]
        if not separators:
            continue
        index = min(separators)
        name = line[:index].strip().lower()
        value = line[index + 1 :].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if name and value:
            values[name] = value
    return values


def _load_api_key() -> str | None:
    values = _read_env_file()
    return os.environ.get("ZAI_API_KEY") or values.get("zai_api_key") or values.get("zai")


def _call_usage_bundles(api_key: str) -> dict:
    return request_json(
        USAGE_BUNDLES_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Accept-Language": "en-US,en",
            "User-Agent": "QuotaHush",
        },
    )


def _integer(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return 0


def _normalise_usage_bundles(payload: dict) -> list[dict]:
    if payload.get("code") != 200:
        message = payload.get("msg") or f"business error {payload.get('code')}"
        raise ValueError(f"Z.AI: {message}")
    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise ValueError("Z.AI returned an invalid usage-bundle response")

    bundles = []
    for row in rows:
        if not isinstance(row, dict) or row.get("status") != "EFFECTIVE":
            continue
        total_tokens = max(0, _integer(row.get("tokensMagnitude")))
        current_balance = max(
            0,
            _integer(
                row.get("availableBalance")
                if row.get("availableBalance") is not None
                else row.get("tokenBalance")
            ),
        )
        used_percent = (
            round(
                max(0.0, min(100.0, (total_tokens - current_balance) * 100 / total_tokens)),
                2,
            )
            if total_tokens
            else None
        )
        bundles.append(
            {
                "id": row.get("id"),
                "name": row.get("resourcePackageName") or row.get("tokenNo") or "Usage Bundle",
                "current_balance": current_balance,
                "total_tokens": total_tokens,
                "used_percent": used_percent,
                "expiration_time": row.get("packageExpirationTime") or row.get("expirationTime"),
                "model": row.get("suitableModel"),
                "status": row.get("status"),
            }
        )
    return bundles


def _error(exc: Exception) -> dict:
    if isinstance(exc, urllib.error.HTTPError):
        result = {"error": "http_error", "message": f"{exc.code} {exc.reason}"}
        if exc.code == 429:
            result["retry_after"] = retry_after_seconds(exc)
        return result
    if isinstance(exc, urllib.error.URLError):
        return {"error": "network_error", "message": str(exc)}
    return {"error": "invalid_response", "message": str(exc)}


def _fetch_fresh() -> dict:
    api_key = _load_api_key()
    if not api_key:
        return {
            "error": "not_configured",
            "message": "Add ZAI_API_KEY (or ZAI) to .var.env.",
        }

    try:
        payload = _call_usage_bundles(api_key)
        return {
            "usage_bundles": _normalise_usage_bundles(payload),
            # Reserved optional sections. They remain absent from the UI until a
            # future endpoint supplies actual Coding Plan or credit information.
            "coding_plan": None,
            "credits": None,
        }
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, TypeError) as exc:
        return _error(exc)


def get_usage() -> dict:
    return _cache.get(_fetch_fresh)

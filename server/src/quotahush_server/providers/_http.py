"""Small HTTP helpers shared by OAuth-backed providers."""
from __future__ import annotations

import json
import urllib.error
import urllib.request


def request_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    payload: dict | None = None,
    timeout: float = 15,
) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    request_headers = dict(headers or {})
    if data is not None:
        request_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(
        url,
        data=data,
        headers=request_headers,
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode())


def refresh_oauth_token(
    url: str,
    client_id: str,
    refresh_token: str,
    *,
    scope: str | None = None,
    headers: dict[str, str] | None = None,
) -> dict:
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
    }
    if scope:
        payload["scope"] = scope
    return request_json(
        url,
        headers=headers,
        payload=payload,
    )


def retry_after_seconds(exc: urllib.error.HTTPError) -> float | None:
    value = exc.headers.get("Retry-After") if exc.headers else None
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None

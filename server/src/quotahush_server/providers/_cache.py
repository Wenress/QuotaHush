"""Shared TTL cache + 429 backoff so multiple polling clients (browser
extension, VS Code extension, ...) never cause more than one upstream
request per provider per TTL window.
"""
from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


class TTLCache:
    def __init__(
        self,
        ttl_seconds: float = 55.0,
        default_backoff_seconds: float = 120.0,
        max_backoff_seconds: float = 3600.0,
        storage_path: Path | None = None,
        include_metadata: bool = False,
    ):
        self._ttl = ttl_seconds
        self._default_backoff = default_backoff_seconds
        self._max_backoff = max_backoff_seconds
        self._storage_path = storage_path
        self._include_metadata = include_metadata
        self._condition = threading.Condition()
        self._last_success: dict | None = None
        self._success_saved_at = 0.0
        self._last_attempt: dict | None = None
        self._attempted_at = 0.0
        self._cooldown_until = 0.0
        self._consecutive_rate_limits = 0
        self._fetching = False
        self._load_success()

    def _load_success(self) -> None:
        if self._storage_path is None:
            return
        try:
            with self._storage_path.open("r", encoding="utf-8") as cache_file:
                stored = json.load(cache_file)
            result = stored.get("result")
            saved_at = stored.get("saved_at")
            if not isinstance(result, dict) or not isinstance(saved_at, (int, float)):
                return
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return

        self._last_success = result
        self._success_saved_at = float(saved_at)
        age = max(0.0, time.time() - self._success_saved_at)
        if age < self._ttl:
            self._last_attempt = result
            self._attempted_at = time.monotonic() - age

    def _save_success(self) -> None:
        if self._storage_path is None or self._last_success is None:
            return
        try:
            self._storage_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self._storage_path.with_suffix(self._storage_path.suffix + ".tmp")
            with temporary.open("w", encoding="utf-8") as cache_file:
                json.dump(
                    {
                        "version": 1,
                        "saved_at": self._success_saved_at,
                        "result": self._last_success,
                    },
                    cache_file,
                )
            temporary.replace(self._storage_path)
        except OSError:
            pass

    def _present(self, result: dict, stale: bool) -> dict:
        if not self._include_metadata or result is not self._last_success:
            return result
        presented = dict(result)
        presented["_cache"] = {
            "fetched_at": datetime.fromtimestamp(
                self._success_saved_at, tz=timezone.utc
            ).isoformat(),
            "stale": stale,
        }
        return presented

    def get(self, fetch: Callable[[], dict]) -> dict:
        with self._condition:
            while True:
                now = time.monotonic()
                if self._last_attempt is not None and now < self._attempted_at + self._ttl:
                    result = self._last_success or self._last_attempt
                    stale = self._last_success is not None and self._last_attempt is not self._last_success
                    return self._present(result, stale)
                if now < self._cooldown_until:
                    if self._last_success is not None:
                        return self._present(self._last_success, True)
                    return {
                        "error": "rate_limited",
                        "message": f"Rate limited; retrying in {int(self._cooldown_until - now)}s",
                    }
                if not self._fetching:
                    self._fetching = True
                    break
                self._condition.wait()

        try:
            result = fetch()
        except Exception:
            with self._condition:
                self._fetching = False
                self._condition.notify_all()
            raise

        attempted_at = time.monotonic()
        with self._condition:
            is_not_configured = result.get("error") == "not_configured"
            if is_not_configured:
                # Configuration is a local file edit, so do not make users wait
                # for the provider TTL after adding or removing an API key.
                self._last_attempt = None
                self._attempted_at = 0.0
                self._last_success = None
                self._success_saved_at = 0.0
            else:
                self._last_attempt = result
                self._attempted_at = attempted_at

            is_rate_limited = (
                result.get("error") == "http_error"
                and "429" in str(result.get("message", ""))
            )
            if is_rate_limited:
                self._consecutive_rate_limits += 1
                retry_after = result.get("retry_after")
                if not isinstance(retry_after, (int, float)) or retry_after <= 0:
                    retry_after = self._default_backoff * (
                        2 ** (self._consecutive_rate_limits - 1)
                    )
                backoff = min(float(retry_after), self._max_backoff)
                self._cooldown_until = attempted_at + backoff
            elif not result.get("error"):
                self._last_success = result
                self._success_saved_at = time.time()
                self._consecutive_rate_limits = 0
                self._cooldown_until = 0.0
                self._save_success()

            self._fetching = False
            self._condition.notify_all()
            served = result if is_not_configured else self._last_success or result
            return self._present(served, served is not result)

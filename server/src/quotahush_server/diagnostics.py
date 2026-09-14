"""Diagnostic logging for the local QuotaHush server."""
from __future__ import annotations

import logging
import os
import re
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_MAX_BYTES = 1_000_000
LOG_BACKUP_COUNT = 3

_logger = logging.getLogger("quotahush_server")
_logger.addHandler(logging.NullHandler())
_provider_status_lock = threading.Lock()
_provider_status: dict[str, tuple] = {}


def _log_path() -> Path:
    configured = os.environ.get("QUOTAHUSH_LOG_DIR")
    if configured:
        return Path(configured) / "server.log"
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "QuotaHush" / "logs" / "server.log"
    return Path.home() / ".local" / "state" / "quotahush" / "server.log"


def _configure_logging() -> Path:
    path = _log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if not any(getattr(handler, "_quotahush_handler", False) for handler in _logger.handlers):
        handler = RotatingFileHandler(
            path,
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding="utf-8",
        )
        handler._quotahush_handler = True
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(threadName)s %(message)s")
        )
        _logger.addHandler(handler)
        _logger.setLevel(logging.INFO)
        _logger.propagate = False
    return path


def _safe_log_text(value: object) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ")[:500]
    text = re.sub(r"(?i)bearer\s+\S+", "Bearer [redacted]", text)
    return re.sub(
        r"(?i)\b(access_token|refresh_token|authorization)\b\s*[:=]\s*\S+",
        r"\1=[redacted]",
        text,
    )


def _log_provider_result(provider: str, result: dict) -> None:
    error = result.get("error")
    stale = bool((result.get("_cache") or {}).get("stale"))
    message = _safe_log_text(result.get("message", ""))[:200]
    status = (error, stale, message, result.get("retry_after"))
    with _provider_status_lock:
        if _provider_status.get(provider) == status:
            return
        previous = _provider_status.get(provider)
        _provider_status[provider] = status

    if error:
        _logger.warning(
            "%s provider error=%s message=%s retry_after=%s",
            provider,
            error,
            message or "-",
            result.get("retry_after"),
        )
    elif stale:
        _logger.warning("%s provider is serving persisted cached data", provider)
    elif previous is not None:
        _logger.info("%s provider recovered", provider)
    else:
        _logger.info("%s provider available", provider)

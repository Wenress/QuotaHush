"""Background update checks for installed Windows Companions."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from quotahush_server.diagnostics import _logger
from quotahush_server.providers._credentials import provider_env_file
from quotahush_server.version import __version__

RELEASE_API = "https://api.github.com/repos/Wenress/QuotaHush/releases/latest"
INITIAL_CHECK_SECONDS = 60
CHECK_INTERVAL_SECONDS = 6 * 60 * 60
_VERSION_PATTERN = re.compile(r"^(?:v)?(\d+)\.(\d+)\.(\d+)$")
_FALSE_VALUES = {"0", "false", "no", "off", "disabled"}
_status_lock = threading.Lock()
_status = {
    "enabled": True,
    "state": "starting",
    "current_version": __version__,
    "latest_version": None,
}


def _set_status(**changes: object) -> None:
    with _status_lock:
        _status.update(changes)


def get_update_status() -> dict:
    with _status_lock:
        return dict(_status)


def _configured_value(name: str) -> str | None:
    value = os.environ.get(name)
    if value is not None:
        return value.strip()
    try:
        lines = provider_env_file().read_text(encoding="utf-8-sig").splitlines()
    except (FileNotFoundError, OSError, UnicodeError):
        return None
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip().upper() == name:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            return value
    return None


def auto_update_enabled() -> bool:
    configured = _configured_value("QUOTAHUSH_AUTO_UPDATE")
    return configured is None or configured.lower() not in _FALSE_VALUES


def _version_tuple(value: str) -> tuple[int, int, int]:
    match = _VERSION_PATTERN.fullmatch(value)
    if not match:
        raise ValueError(f"unsupported release version: {value}")
    return tuple(int(part) for part in match.groups())


def _trusted_asset_url(value: object, expected_path: str) -> str:
    if not isinstance(value, str):
        raise ValueError("release asset has no download URL")
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or parsed.path != expected_path
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("release asset URL is not an expected QuotaHush download")
    return value


def _release_details(payload: dict) -> dict:
    if payload.get("draft") or payload.get("prerelease"):
        raise ValueError("latest GitHub release is not stable")
    version = str(payload.get("tag_name") or "")
    normalized = ".".join(str(part) for part in _version_tuple(version))
    expected_installer = f"QuotaHush-Setup-x64-{normalized}.exe"
    assets = {
        asset.get("name"): asset.get("browser_download_url")
        for asset in payload.get("assets", [])
        if isinstance(asset, dict)
    }
    if expected_installer not in assets or "SHA256SUMS.txt" not in assets:
        raise ValueError("release is missing the Windows installer or checksums")
    release_path = f"/Wenress/QuotaHush/releases/download/{version}"
    return {
        "version": normalized,
        "installer_url": _trusted_asset_url(
            assets[expected_installer], f"{release_path}/{expected_installer}"
        ),
        "checksums_url": _trusted_asset_url(
            assets["SHA256SUMS.txt"], f"{release_path}/SHA256SUMS.txt"
        ),
    }


def _installed_update_script() -> Path | None:
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return None
    script = Path(sys.executable).resolve().parent / "update-windows.ps1"
    return script if script.is_file() else None


def _powershell_executable() -> str | None:
    system_root = os.environ.get("SystemRoot")
    if system_root:
        candidate = Path(system_root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        if candidate.is_file():
            return str(candidate)
    return shutil.which("powershell.exe") or shutil.which("powershell")


def _fetch_latest_release() -> dict:
    request = Request(
        RELEASE_API,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": f"QuotaHush/{__version__}",
        },
    )
    with urlopen(request, timeout=20) as response:
        return _release_details(json.load(response))


def _launch_windows_update(script: Path, release: dict) -> None:
    powershell = _powershell_executable()
    if not powershell:
        raise RuntimeError("Windows PowerShell was not found")
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(
        subprocess, "DETACHED_PROCESS", 0
    )
    subprocess.Popen(
        [
            powershell,
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            str(script),
            "-Version",
            release["version"],
            "-InstallerUrl",
            release["installer_url"],
            "-ChecksumsUrl",
            release["checksums_url"],
        ],
        close_fds=True,
        creationflags=creation_flags,
    )


def check_for_update() -> bool:
    script = _installed_update_script()
    if script is None:
        _set_status(enabled=False, state="unsupported")
        return False
    _set_status(state="checking")
    release = _fetch_latest_release()
    _set_status(latest_version=release["version"])
    if _version_tuple(release["version"]) <= _version_tuple(__version__):
        _set_status(state="current")
        return False
    _logger.info(
        "Companion update available current=%s latest=%s",
        __version__,
        release["version"],
    )
    _launch_windows_update(script, release)
    _set_status(state="installing")
    return True


def _update_loop() -> None:
    threading.Event().wait(INITIAL_CHECK_SECONDS)
    while True:
        try:
            if check_for_update():
                return
        except Exception:
            _set_status(state="error")
            _logger.exception("automatic update check failed")
        threading.Event().wait(CHECK_INTERVAL_SECONDS)


def start_auto_update_thread() -> threading.Thread | None:
    if not auto_update_enabled():
        _set_status(enabled=False, state="disabled")
        return None
    if _installed_update_script() is None:
        _set_status(enabled=False, state="unsupported")
        return None
    _set_status(enabled=True, state="scheduled")
    thread = threading.Thread(
        target=_update_loop,
        name="quotahush-updater",
        daemon=True,
    )
    thread.start()
    return thread

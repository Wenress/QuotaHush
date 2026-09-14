"""Conservative atomic updates for CLI-owned credential files."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path

_write_lock = threading.Lock()


def provider_env_file() -> Path:
    """Return the user configuration file, preserving source-checkout setups."""
    configured = os.environ.get("QUOTAHUSH_ENV_FILE")
    if configured:
        return Path(configured).expanduser()

    source_file = Path(__file__).resolve().parents[4] / ".var.env"
    if source_file.is_file():
        return source_file

    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "QuotaHush" / ".var.env"

    config_home = os.environ.get("XDG_CONFIG_HOME")
    if config_home:
        return Path(config_home) / "quotahush" / ".var.env"
    return Path.home() / ".config" / "quotahush" / ".var.env"


def merge_credential_section(
    path: Path,
    section_name: str,
    expected: dict,
    updates: dict,
) -> tuple[dict, bool]:
    """Merge token updates unless another process changed the login first.

    Returns the effective section and whether it was written. A mismatched
    section is treated as a newer external login and returned unchanged.
    """
    proposed = {**expected, **updates}
    temporary = path.with_suffix(path.suffix + ".tmp")

    with _write_lock:
        try:
            with path.open("r", encoding="utf-8") as credentials_file:
                current_document = json.load(credentials_file)
            current_section = current_document.get(section_name)
            if not isinstance(current_section, dict):
                return proposed, False
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return proposed, False

        if any(current_section.get(key) != value for key, value in expected.items()):
            return current_section, False

        merged_section = {**current_section, **updates}
        current_document[section_name] = merged_section
        try:
            with temporary.open("w", encoding="utf-8") as credentials_file:
                json.dump(current_document, credentials_file, indent=2)
                credentials_file.flush()
                os.fsync(credentials_file.fileno())
            try:
                os.chmod(temporary, 0o600)
            except OSError:
                pass
            temporary.replace(path)
        except OSError:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
            return proposed, False

        return merged_section, True

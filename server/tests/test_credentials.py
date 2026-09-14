import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from quotahush_server.providers._credentials import (
    merge_credential_section,
    provider_env_file,
)


class ProviderEnvFileTests(unittest.TestCase):
    def test_explicit_path_takes_priority(self):
        explicit = Path("C:/QuotaHush/quota.env")
        with patch.dict(os.environ, {"QUOTAHUSH_ENV_FILE": str(explicit)}, clear=True):
            self.assertEqual(provider_env_file(), explicit)

    def test_uses_xdg_config_home_outside_source_checkout(self):
        with TemporaryDirectory() as temporary_directory:
            with (
                patch.dict(
                    os.environ,
                    {"XDG_CONFIG_HOME": temporary_directory},
                    clear=True,
                ),
                patch("pathlib.Path.is_file", return_value=False),
            ):
                self.assertEqual(
                    provider_env_file(),
                    Path(temporary_directory) / "quotahush" / ".var.env",
                )


class MergeCredentialSectionTests(unittest.TestCase):
    def test_merges_only_token_section_and_preserves_other_fields(self):
        with TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "auth.json"
            path.write_text(
                json.dumps(
                    {
                        "tokens": {
                            "access_token": "old-access",
                            "refresh_token": "old-refresh",
                            "account_id": "account-1",
                        },
                        "unrelated": {"keep": True},
                    }
                ),
                encoding="utf-8",
            )

            effective, written = merge_credential_section(
                path,
                "tokens",
                {
                    "access_token": "old-access",
                    "refresh_token": "old-refresh",
                    "account_id": "account-1",
                },
                {"access_token": "new-access", "refresh_token": "new-refresh"},
            )

            saved = json.loads(path.read_text(encoding="utf-8"))
            self.assertTrue(written)
            self.assertEqual(effective["access_token"], "new-access")
            self.assertEqual(saved["tokens"]["account_id"], "account-1")
            self.assertEqual(saved["unrelated"], {"keep": True})

    def test_does_not_overwrite_newer_external_login(self):
        with TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "credentials.json"
            current = {
                "claudeAiOauth": {
                    "accessToken": "newer-access",
                    "refreshToken": "newer-refresh",
                    "subscriptionType": "max",
                }
            }
            path.write_text(json.dumps(current), encoding="utf-8")

            effective, written = merge_credential_section(
                path,
                "claudeAiOauth",
                {"accessToken": "old-access", "refreshToken": "old-refresh"},
                {"accessToken": "stale-refresh-result"},
            )

            self.assertFalse(written)
            self.assertEqual(effective["accessToken"], "newer-access")
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")), current
            )


if __name__ == "__main__":
    unittest.main()

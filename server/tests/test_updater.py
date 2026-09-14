import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from quotahush_server import updater


class VersionTests(unittest.TestCase):
    def test_compares_numeric_stable_versions(self):
        self.assertLess(updater._version_tuple("0.1.3"), updater._version_tuple("v0.2.0"))
        with self.assertRaises(ValueError):
            updater._version_tuple("v0.2.0-beta.1")


class ConfigurationTests(unittest.TestCase):
    def test_auto_update_is_enabled_by_default(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("quotahush_server.updater.provider_env_file", return_value=Path("missing")),
        ):
            self.assertTrue(updater.auto_update_enabled())

    def test_auto_update_can_be_disabled_in_config_file(self):
        with TemporaryDirectory() as temporary_directory:
            config = Path(temporary_directory) / ".var.env"
            config.write_text("QUOTAHUSH_AUTO_UPDATE=0\n", encoding="utf-8")
            with (
                patch.dict(os.environ, {}, clear=True),
                patch("quotahush_server.updater.provider_env_file", return_value=config),
            ):
                self.assertFalse(updater.auto_update_enabled())


class ReleaseValidationTests(unittest.TestCase):
    def test_accepts_expected_official_release_assets(self):
        details = updater._release_details(
            {
                "tag_name": "v1.2.3",
                "draft": False,
                "prerelease": False,
                "assets": [
                    {
                        "name": "QuotaHush-Setup-x64-1.2.3.exe",
                        "browser_download_url": "https://github.com/Wenress/QuotaHush/releases/download/v1.2.3/QuotaHush-Setup-x64-1.2.3.exe",
                    },
                    {
                        "name": "SHA256SUMS.txt",
                        "browser_download_url": "https://github.com/Wenress/QuotaHush/releases/download/v1.2.3/SHA256SUMS.txt",
                    },
                ],
            }
        )
        self.assertEqual(details["version"], "1.2.3")

    def test_rejects_untrusted_asset_host(self):
        with self.assertRaises(ValueError):
            updater._release_details(
                {
                    "tag_name": "v1.2.3",
                    "assets": [
                        {
                            "name": "QuotaHush-Setup-x64-1.2.3.exe",
                            "browser_download_url": "https://example.com/setup.exe",
                        },
                        {
                            "name": "SHA256SUMS.txt",
                            "browser_download_url": "https://github.com/Wenress/QuotaHush/releases/download/v1.2.3/SHA256SUMS.txt",
                        },
                    ],
                }
            )

    def test_rejects_asset_from_another_github_repository(self):
        with self.assertRaises(ValueError):
            updater._release_details(
                {
                    "tag_name": "v1.2.3",
                    "assets": [
                        {
                            "name": "QuotaHush-Setup-x64-1.2.3.exe",
                            "browser_download_url": "https://github.com/example/QuotaHush/releases/download/v1.2.3/QuotaHush-Setup-x64-1.2.3.exe",
                        },
                        {
                            "name": "SHA256SUMS.txt",
                            "browser_download_url": "https://github.com/Wenress/QuotaHush/releases/download/v1.2.3/SHA256SUMS.txt",
                        },
                    ],
                }
            )

    def test_rejects_prerelease(self):
        with self.assertRaises(ValueError):
            updater._release_details(
                {"tag_name": "v1.2.3", "prerelease": True, "assets": []}
            )


if __name__ == "__main__":
    unittest.main()

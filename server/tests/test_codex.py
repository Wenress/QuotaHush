import unittest

from quotahush_server.providers.codex import _normalise_rate_limit_windows


class NormaliseRateLimitWindowsTests(unittest.TestCase):
    def test_classifies_five_hour_and_weekly_by_duration(self):
        session = {"used_percent": 12, "limit_window_seconds": 18_000}
        weekly = {"used_percent": 34, "limit_window_seconds": 604_800}
        result = _normalise_rate_limit_windows(
            {"rate_limit": {"primary_window": session, "secondary_window": weekly}}
        )

        self.assertIs(result["rate_limit"]["five_hour"], session)
        self.assertIs(result["rate_limit"]["seven_day"], weekly)

    def test_recognises_lone_weekly_window_in_primary_slot(self):
        weekly = {"used_percent": 34, "window_minutes": 10_080}
        result = _normalise_rate_limit_windows(
            {"rate_limit": {"primary_window": weekly}}
        )

        self.assertNotIn("five_hour", result["rate_limit"])
        self.assertIs(result["rate_limit"]["seven_day"], weekly)

    def test_uses_positional_fallback_for_legacy_payload(self):
        primary = {"used_percent": 12}
        secondary = {"used_percent": 34}
        result = _normalise_rate_limit_windows(
            {"rate_limit": {"primary_window": primary, "secondary_window": secondary}}
        )

        self.assertIs(result["rate_limit"]["five_hour"], primary)
        self.assertIs(result["rate_limit"]["seven_day"], secondary)


if __name__ == "__main__":
    unittest.main()

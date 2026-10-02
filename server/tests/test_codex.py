import unittest
import urllib.error
from unittest.mock import patch

from quotahush_server.providers import codex, claude
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


class ResetCreditFetchTests(unittest.TestCase):
    def test_fetches_reset_expirations_with_the_usage_credentials(self):
        usage = {"rate_limit": {"allowed": True}, "rate_limit_reset_credits": {
            "available_count": 2, "applicable_available_count": 0,
        }}
        details = {"available_count": 2, "credits": [
            {"status": "available", "expires_at": "2026-10-22T19:15:43Z"},
            {"status": "available", "expires_at": "2026-10-29T17:28:52Z"},
        ]}
        with patch.object(codex, "request_json", side_effect=[usage, details]) as request:
            result = codex._call_usage("access", "account")
        self.assertEqual(result["rate_limit_reset_credits"]["credits"], details["credits"])
        self.assertEqual(result["rate_limit_reset_credits"]["applicable_available_count"], 0)
        first, second = request.call_args_list
        self.assertEqual(second.args, (codex.RESET_CREDITS_URL,))
        self.assertEqual(second.kwargs["headers"], first.kwargs["headers"])
        self.assertNotIn("payload", second.kwargs)  # GET only; no resets consumed.

    def test_optional_failures_keep_usage_and_the_known_reset_count(self):
        for failure in [
            urllib.error.URLError("offline"),
            urllib.error.HTTPError(codex.RESET_CREDITS_URL, 429, "rate limited", {}, None),
            urllib.error.HTTPError(codex.RESET_CREDITS_URL, 401, "unauthorized", {}, None),
            ValueError("invalid JSON"),
            OSError("timeout"),
        ]:
            with self.subTest(failure=failure):
                if isinstance(failure, urllib.error.HTTPError):
                    self.addCleanup(failure.close)
                usage = {"rate_limit": {"allowed": True}, "rate_limit_reset_credits": {"available_count": 2}}
                with patch.object(codex, "request_json", side_effect=[usage, failure]):
                    result = codex._call_usage("access", "account")
                self.assertTrue(result["rate_limit"]["allowed"])
                self.assertEqual(result["rate_limit_reset_credits"]["available_count"], 2)
                self.assertTrue(result["rate_limit_reset_credits"]["details_unavailable"])

    def test_zero_resets_skip_the_optional_request(self):
        with patch.object(codex, "request_json", return_value={"rate_limit_reset_credits": {"available_count": 0}}) as request:
            result = codex._call_usage("access", "account")
        self.assertEqual(request.call_count, 1)
        self.assertEqual(result["rate_limit_reset_credits"]["credits"], [])

    def test_malformed_details_do_not_replace_the_summary(self):
        with patch.object(codex, "request_json", side_effect=[
            {"rate_limit_reset_credits": {"available_count": 2}}, {"credits": None},
        ]):
            result = codex._call_usage("access", "account")
        self.assertEqual(result["rate_limit_reset_credits"]["available_count"], 2)
        self.assertTrue(result["rate_limit_reset_credits"]["details_unavailable"])

    def test_fetches_count_when_the_usage_endpoint_does_not_supply_it(self):
        with patch.object(codex, "request_json", side_effect=[
            {"rate_limit": {"allowed": True}}, {"available_count": 1, "credits": [{"status": "available"}]},
        ]):
            result = codex._call_usage("access", "account")
        self.assertEqual(result["rate_limit_reset_credits"]["available_count"], 1)

    def test_claude_requests_grants_without_omitting_usage_or_spend(self):
        with patch.object(claude, "request_json", return_value={}) as request:
            claude._call_usage("access")
        url = request.call_args.args[0]
        self.assertIn("cedar_ember=1", url)
        self.assertNotIn("skip_spend", url)


    def test_claude_usage_identifies_a_reset_compatible_client(self):
        # Bare client headers give "surface"; older versions give
        # "cli_version". Both silently omit existing grants.
        with patch.object(claude, "request_json", return_value={}) as request:
            claude._call_usage("access")
        headers = request.call_args.kwargs["headers"]
        self.assertEqual(headers["User-Agent"], "claude-cli/2.1.280 (external, cli)")
        self.assertEqual(headers["Accept"], "application/json")
        self.assertEqual(headers["Authorization"], "Bearer access")


if __name__ == "__main__":
    unittest.main()

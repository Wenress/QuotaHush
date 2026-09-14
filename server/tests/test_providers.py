import unittest
import urllib.error
from unittest.mock import patch

from quotahush_server.providers import claude, codex, deepseek, zai


class ProviderNetworkErrorTests(unittest.TestCase):
    def test_claude_returns_network_error_on_initial_request(self):
        credentials = {
            "claudeAiOauth": {
                "accessToken": "access",
                "refreshToken": "refresh",
            }
        }
        with (
            patch.object(claude, "_load_credentials", return_value=credentials),
            patch.object(
                claude,
                "_call_usage",
                side_effect=urllib.error.URLError("offline"),
            ),
        ):
            result = claude._fetch_fresh()

        self.assertEqual(result["error"], "network_error")

    def test_codex_returns_network_error_on_initial_request(self):
        credentials = {
            "tokens": {
                "access_token": "access",
                "refresh_token": "refresh",
                "account_id": "account",
            }
        }
        with (
            patch.object(codex, "_load_auth", return_value=credentials),
            patch.object(
                codex,
                "_call_usage",
                side_effect=urllib.error.URLError("offline"),
            ),
        ):
            result = codex._fetch_fresh()

        self.assertEqual(result["error"], "network_error")

    def test_deepseek_keeps_usage_optional_when_balance_is_available(self):
        with (
            patch.object(deepseek, "_load_credentials", return_value=("api-key", None)),
            patch.object(
                deepseek,
                "_call_balance",
                return_value={"is_available": True, "balance_infos": []},
            ),
        ):
            result = deepseek._fetch_fresh()

        self.assertTrue(result["balance"]["is_available"])
        self.assertEqual(result["usage"]["error"], "platform_token_missing")


class DeepSeekUsageTests(unittest.TestCase):
    def test_uses_same_cache_interval_as_claude(self):
        self.assertEqual(deepseek._cache._ttl, claude._cache._ttl)

    def test_normalises_daily_and_monthly_platform_usage(self):
        amount = {
            "data": {
                "biz_code": 0,
                "biz_data": {
                    "series": [
                        {
                            "model": "deepseek-chat",
                            "buckets": [
                                {
                                    "time": 110,
                                    "usage": {
                                        "PROMPT_CACHE_HIT_TOKEN": "10",
                                        "PROMPT_CACHE_MISS_TOKEN": "20",
                                        "RESPONSE_TOKEN": "30",
                                        "REQUEST": "2",
                                    },
                                },
                                {
                                    "time": 210,
                                    "usage": {
                                        "PROMPT_CACHE_HIT_TOKEN": "1",
                                        "PROMPT_CACHE_MISS_TOKEN": "2",
                                        "RESPONSE_TOKEN": "3",
                                        "REQUEST": "1",
                                    },
                                },
                            ],
                        }
                    ]
                },
            }
        }
        cost = {
            "data": {
                "biz_code": 0,
                "biz_data": {
                    "data": [
                        {
                            "currency": "CNY",
                            "series": [
                                {
                                    "buckets": [
                                        {"time": 110, "cost": "1.25"},
                                        {"time": 210, "cost": "0.75"},
                                    ]
                                }
                            ],
                        }
                    ]
                },
            }
        }

        result = deepseek._normalise_platform_usage(
            amount,
            cost,
            month_start=100,
            month_end=300,
            today_start=200,
            today_end=300,
        )

        self.assertEqual(result["today"]["total_tokens"], 6)
        self.assertEqual(result["today"]["requests"], 1)
        self.assertEqual(result["today"]["spend"], [{"currency": "CNY", "amount": "0.75"}])
        self.assertEqual(result["month"]["total_tokens"], 66)
        self.assertEqual(result["month"]["requests"], 3)
        self.assertEqual(result["month"]["spend"], [{"currency": "CNY", "amount": "2"}])


class ZaiUsageTests(unittest.TestCase):
    def test_uses_same_cache_interval_as_claude(self):
        self.assertEqual(zai._cache._ttl, claude._cache._ttl)

    def test_normalises_effective_usage_bundles_and_consumed_percent(self):
        payload = {
            "code": 200,
            "rows": [
                {
                    "id": 39030248,
                    "tokenNo": "bundle_1148",
                    "tokenBalance": 58561817,
                    "availableBalance": 58561817,
                    "tokensMagnitude": 100000000,
                    "packageExpirationTime": "2026-12-09T07:15:28",
                    "resourcePackageName": "100 million GLM-5.3-Flash Premium Pack",
                    "suitableModel": "glm-5.3-flash",
                    "status": "EFFECTIVE",
                },
                {"id": 1, "status": "EXPIRED", "availableBalance": 10},
            ],
        }

        result = zai._normalise_usage_bundles(payload)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["current_balance"], 58561817)
        self.assertEqual(result[0]["total_tokens"], 100000000)
        self.assertEqual(result[0]["used_percent"], 41.44)
        self.assertEqual(result[0]["expiration_time"], "2026-12-09T07:15:28")

    def test_fetch_keeps_empty_future_sections_hidden(self):
        with (
            patch.object(zai, "_load_api_key", return_value="api-key"),
            patch.object(
                zai,
                "_call_usage_bundles",
                return_value={"code": 200, "rows": []},
            ),
        ):
            result = zai._fetch_fresh()

        self.assertEqual(result["usage_bundles"], [])
        self.assertIsNone(result["coding_plan"])
        self.assertIsNone(result["credits"])


class ClaudeRefreshTests(unittest.TestCase):
    def test_refresh_forwards_current_scopes_and_cli_headers(self):
        with patch.object(claude, "refresh_oauth_token", return_value={}) as refresh:
            claude._refresh("refresh", ["user:profile", "user:inference"])

        refresh.assert_called_once_with(
            claude.TOKEN_URL,
            claude.CLIENT_ID,
            "refresh",
            scope="user:profile user:inference",
            headers={
                "Accept": "application/json, text/plain, */*",
                "User-Agent": "claude-cli/2.1.241",
            },
        )

    def test_uses_credentials_rotated_by_claude_during_refresh(self):
        old_credentials = {
            "claudeAiOauth": {
                "accessToken": "old-access",
                "refreshToken": "old-refresh",
                "scopes": ["user:inference"],
                "subscriptionType": "pro",
            }
        }
        new_credentials = {
            "claudeAiOauth": {
                "accessToken": "new-access",
                "refreshToken": "new-refresh",
                "subscriptionType": "pro",
            }
        }
        forbidden = urllib.error.HTTPError("url", 403, "Forbidden", {}, None)
        with (
            patch.object(
                claude,
                "_load_credentials",
                side_effect=[old_credentials, new_credentials],
            ),
            patch.object(
                claude,
                "_call_usage",
                side_effect=[forbidden, {"five_hour": {"utilization": 1}}],
            ) as call_usage,
            patch.object(claude, "_refresh", side_effect=forbidden),
        ):
            result = claude._fetch_fresh()

        self.assertNotIn("error", result)
        self.assertEqual(result["plan_type"], "pro")
        self.assertEqual(call_usage.call_args_list[-1].args, ("new-access",))

if __name__ == "__main__":
    unittest.main()

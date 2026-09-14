"""Fetch DeepSeek balance and, when configured, platform usage statistics."""
from __future__ import annotations

import os
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode

from quotahush_server.providers._cache import TTLCache
from quotahush_server.providers._credentials import provider_env_file
from quotahush_server.providers._http import request_json, retry_after_seconds

BALANCE_URL = "https://api.deepseek.com/user/balance"
PLATFORM_USAGE_URL = "https://platform.deepseek.com/api/v0/usage/by_api_key"

_cache = TTLCache(ttl_seconds=300.0, default_backoff_seconds=300.0)


def _read_env_file() -> dict[str, str]:
    """Read the local secret file without mutating the process environment.

    Besides conventional NAME=value lines, the historical ``DeepSeek: value``
    spelling used by this project is accepted for backwards compatibility.
    """
    values: dict[str, str] = {}
    try:
        lines = provider_env_file().read_text(encoding="utf-8-sig").splitlines()
    except (FileNotFoundError, OSError, UnicodeError):
        return values

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[7:].lstrip()
        equals = line.find("=")
        colon = line.find(":")
        separators = [index for index in (equals, colon) if index > 0]
        if not separators:
            continue
        index = min(separators)
        name = line[:index].strip().lower()
        value = line[index + 1 :].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if name and value:
            values[name] = value
    return values


def _load_credentials() -> tuple[str | None, str | None]:
    values = _read_env_file()
    api_key = (
        os.environ.get("DEEPSEEK_API_KEY")
        or values.get("deepseek_api_key")
        or values.get("deepseek")
    )
    platform_token = (
        os.environ.get("DEEPSEEK_PLATFORM_TOKEN")
        or values.get("deepseek_platform_token")
        or values.get("deepseekplatformtoken")
    )
    return api_key, platform_token


def _auth_headers(token: str, *, platform: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if platform:
        headers.update(
            {
                "User-Agent": "Mozilla/5.0 (QuotaHush)",
                "x-client-platform": "web",
            }
        )
    return headers


def _call_balance(api_key: str) -> dict:
    return request_json(BALANCE_URL, headers=_auth_headers(api_key))


def _call_platform(kind: str, token: str, params: dict[str, int]) -> dict:
    url = f"{PLATFORM_USAGE_URL}/{kind}?{urlencode(params)}"
    return request_json(url, headers=_auth_headers(token, platform=True))


def _business_data(payload: dict) -> dict:
    if payload.get("code", 0) != 0:
        raise ValueError(f"DeepSeek Platform error {payload.get('code')}")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ValueError("DeepSeek Platform returned an invalid response")
    if data.get("biz_code", 0) != 0:
        message = data.get("biz_msg") or f"business error {data.get('biz_code')}"
        raise ValueError(f"DeepSeek Platform: {message}")
    business = data.get("biz_data")
    if not isinstance(business, dict):
        raise ValueError("DeepSeek Platform response has no usage data")
    return business


def _number(value, *, integer: bool = False):
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return 0 if integer else Decimal(0)
    return int(number) if integer else number


def _empty_period() -> dict:
    return {
        "prompt_cache_hit_tokens": 0,
        "prompt_cache_miss_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "requests": 0,
    }


def _add_token_bucket(period: dict, usage: dict) -> None:
    hit = _number(usage.get("PROMPT_CACHE_HIT_TOKEN"), integer=True)
    miss = _number(usage.get("PROMPT_CACHE_MISS_TOKEN"), integer=True)
    output = _number(usage.get("RESPONSE_TOKEN"), integer=True)
    period["prompt_cache_hit_tokens"] += hit
    period["prompt_cache_miss_tokens"] += miss
    period["output_tokens"] += output
    period["total_tokens"] += hit + miss + output
    period["requests"] += _number(usage.get("REQUEST"), integer=True)


def _decimal_string(value: Decimal) -> str:
    result = format(value, "f")
    if "." in result:
        result = result.rstrip("0").rstrip(".")
    return result or "0"


def _normalise_platform_usage(
    amount_payload: dict,
    cost_payload: dict,
    *,
    month_start: int,
    month_end: int,
    today_start: int,
    today_end: int,
) -> dict:
    amount = _business_data(amount_payload)
    cost = _business_data(cost_payload)
    periods = {"today": _empty_period(), "month": _empty_period()}

    for series in amount.get("series") or []:
        if not isinstance(series, dict):
            continue
        for bucket in series.get("buckets") or []:
            if not isinstance(bucket, dict):
                continue
            timestamp = _number(bucket.get("time"), integer=True)
            usage = bucket.get("usage")
            if not isinstance(usage, dict) or not month_start <= timestamp < month_end:
                continue
            _add_token_bucket(periods["month"], usage)
            if today_start <= timestamp < today_end:
                _add_token_bucket(periods["today"], usage)

    spend: dict[str, dict[str, Decimal]] = {"today": {}, "month": {}}
    for currency_data in cost.get("data") or []:
        if not isinstance(currency_data, dict):
            continue
        currency = str(currency_data.get("currency") or "CNY")
        spend["today"].setdefault(currency, Decimal(0))
        spend["month"].setdefault(currency, Decimal(0))
        for series in currency_data.get("series") or []:
            if not isinstance(series, dict):
                continue
            for bucket in series.get("buckets") or []:
                if not isinstance(bucket, dict):
                    continue
                timestamp = _number(bucket.get("time"), integer=True)
                if not month_start <= timestamp < month_end:
                    continue
                value = _number(bucket.get("cost"))
                spend["month"][currency] += value
                if today_start <= timestamp < today_end:
                    spend["today"][currency] += value

    for name, period in periods.items():
        period["spend"] = [
            {"currency": currency, "amount": _decimal_string(value)}
            for currency, value in spend[name].items()
        ]
    return periods


def _time_range() -> dict[str, int]:
    now = datetime.now().astimezone()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    month = today.replace(day=1)
    if month.month == 12:
        next_month = month.replace(year=month.year + 1, month=1)
    else:
        next_month = month.replace(month=month.month + 1)
    offset = now.utcoffset() or timedelta(0)
    return {
        "month_start": int(month.timestamp()),
        "month_end": int(next_month.timestamp()),
        "today_start": int(today.timestamp()),
        "today_end": int(tomorrow.timestamp()),
        "tz": int(offset.total_seconds()),
    }


def _error(exc: Exception) -> dict:
    if isinstance(exc, urllib.error.HTTPError):
        result = {"error": "http_error", "message": f"{exc.code} {exc.reason}"}
        if exc.code == 429:
            result["retry_after"] = retry_after_seconds(exc)
        return result
    if isinstance(exc, urllib.error.URLError):
        return {"error": "network_error", "message": str(exc)}
    return {"error": "invalid_response", "message": str(exc)}


def _fetch_fresh() -> dict:
    api_key, platform_token = _load_credentials()
    if not api_key and not platform_token:
        return {
            "error": "not_configured",
            "message": "Add DEEPSEEK_API_KEY (or DeepSeek) to .var.env.",
        }

    period = _time_range() if platform_token else None
    params = (
        {
            "start": period["month_start"],
            "end": period["month_end"],
            "tz": period["tz"],
        }
        if period
        else None
    )

    # Balance and the two dashboard queries are independent. Running them
    # together keeps the aggregate /usage request within one upstream timeout.
    with ThreadPoolExecutor(max_workers=3) as executor:
        balance_future = executor.submit(_call_balance, api_key) if api_key else None
        amount_future = (
            executor.submit(_call_platform, "amount", platform_token, params)
            if platform_token and params
            else None
        )
        cost_future = (
            executor.submit(_call_platform, "cost", platform_token, params)
            if platform_token and params
            else None
        )

        result: dict = {}
        if balance_future:
            try:
                result["balance"] = balance_future.result()
            except (
                urllib.error.HTTPError,
                urllib.error.URLError,
                ValueError,
                TypeError,
            ) as exc:
                result["balance"] = _error(exc)
        else:
            result["balance"] = {
                "error": "api_key_missing",
                "message": "DEEPSEEK_API_KEY is not configured.",
            }

        if not platform_token:
            result["usage"] = {
                "error": "platform_token_missing",
                "message": "Add DEEPSEEK_PLATFORM_TOKEN for daily/monthly spend and tokens.",
            }
            return result

        try:
            amount = amount_future.result()
            cost = cost_future.result()
            result["usage"] = _normalise_platform_usage(
                amount,
                cost,
                month_start=period["month_start"],
                month_end=period["month_end"],
                today_start=period["today_start"],
                today_end=period["today_end"],
            )
        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            ValueError,
            TypeError,
        ) as exc:
            result["usage"] = _error(exc)
    return result


def get_usage() -> dict:
    return _cache.get(_fetch_fresh)

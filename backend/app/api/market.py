import os
import threading
import time as time_module
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.stock import Stock
from app.services.angelone import get_smart_api, reset_smart_api
from app.services.market_stream import (
    STREAM_STALE_SECONDS,
    market_state,
)
from utils.market_hours import get_market_status


router = APIRouter(
    prefix="/market",
    tags=["Market"],
)

ALLOWED_INTERVALS = {
    "ONE_MINUTE",
    "THREE_MINUTE",
    "FIVE_MINUTE",
    "TEN_MINUTE",
    "FIFTEEN_MINUTE",
    "THIRTY_MINUTE",
    "ONE_HOUR",
    "ONE_DAY",
}

LTP_CACHE_SECONDS = int(os.getenv("LTP_CACHE_SECONDS", "5"))
MARKET_STATS_CACHE_SECONDS = int(os.getenv("MARKET_STATS_CACHE_SECONDS", "15"))
INTRADAY_CANDLE_CACHE_SECONDS = int(os.getenv("INTRADAY_CANDLE_CACHE_SECONDS", "60"))
DAILY_CANDLE_CACHE_SECONDS = int(os.getenv("DAILY_CANDLE_CACHE_SECONDS", "900"))

_cache = {}
_cache_lock = threading.Lock()


def _cache_get(key, ttl_seconds: int):
    now = time_module.time()

    with _cache_lock:
        item = _cache.get(key)

        if not item:
            return None

        created_at, value = item

        if now - created_at > ttl_seconds:
            _cache.pop(key, None)
            return None

        return value


def _cache_set(key, value):
    with _cache_lock:
        _cache[key] = (time_module.time(), value)


def _with_cache_flag(response, cached: bool):
    if isinstance(response, dict):
        cloned = dict(response)
        cloned["cached"] = cached
        return cloned

    return response


def _candle_cache_ttl(interval: str):
    if interval == "ONE_DAY":
        return DAILY_CANDLE_CACHE_SECONDS

    if interval == "ONE_MINUTE":
        # Disable caching for 1-minute candles - use WebSocket for real-time
        return 0

    return INTRADAY_CANDLE_CACHE_SECONDS


@router.get("/status")
def market_status():
    return get_market_status()


@router.get("/stocks")
def get_stocks(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    return (
        db.query(Stock)
        .offset(offset)
        .limit(limit)
        .all()
    )


def _fetch_ltp_from_angel(
    exchange: str,
    tradingsymbol: str,
    symboltoken: str,
    force_refresh_session: bool = False,
):
    smart = get_smart_api(force_refresh=force_refresh_session)

    return smart.ltpData(
        exchange=exchange,
        tradingsymbol=tradingsymbol,
        symboltoken=symboltoken,
    )


def _get_ltp_response(
    exchange: str,
    tradingsymbol: str,
    symboltoken: str,
    use_cache: bool = True,
):
    exchange = exchange.upper().strip()
    tradingsymbol = tradingsymbol.upper().strip()
    symboltoken = str(symboltoken).strip()

    cache_key = ("ltp", exchange, tradingsymbol, symboltoken)

    live_quote = market_state.get_quote(
        exchange,
        symboltoken,
        max_age_seconds=STREAM_STALE_SECONDS,
    )

    if live_quote:
        return {
            "status": True,
            "message": "Live quote from Angel One WebSocket V2",
            "data": {
                "exchange": exchange,
                "tradingsymbol": tradingsymbol,
                "symboltoken": symboltoken,
                "ltp": live_quote.get("ltp"),
                "open": live_quote.get("open"),
                "high": live_quote.get("high"),
                "low": live_quote.get("low"),
                "close": live_quote.get("previous_close"),
                "volume": live_quote.get("volume"),
                "exchange_timestamp": live_quote.get("exchange_timestamp"),
            },
            "source": "angel_one_websocket_v2",
            "cached": False,
        }

    if use_cache:
        cached = _cache_get(cache_key, LTP_CACHE_SECONDS)

        if cached is not None:
            return _with_cache_flag(cached, True)

    try:
        response = _fetch_ltp_from_angel(
            exchange=exchange,
            tradingsymbol=tradingsymbol,
            symboltoken=symboltoken,
        )

    except Exception as first_error:
        # If Angel One session expired silently, refresh once and retry.
        print("LTP first attempt failed, refreshing Angel One session:", first_error)
        reset_smart_api()

        response = _fetch_ltp_from_angel(
            exchange=exchange,
            tradingsymbol=tradingsymbol,
            symboltoken=symboltoken,
            force_refresh_session=True,
        )

    _cache_set(cache_key, response)

    return _with_cache_flag(response, False)


@router.get("/ltp")
def get_ltp(
    exchange: str,
    tradingsymbol: str,
    symboltoken: str,
    force: bool = Query(False),
):
    try:
        return _get_ltp_response(
            exchange=exchange,
            tradingsymbol=tradingsymbol,
            symboltoken=symboltoken,
            use_cache=not force,
        )

    except Exception as e:
        print(f"LTP failed: {exchange=} {tradingsymbol=} {symboltoken=}")
        print(e)

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.get("/quote-fast")
def get_quote_fast(
    exchange: str,
    tradingsymbol: str,
    symboltoken: str,
):
    """
    Single lightweight endpoint that returns LTP + OHLC + day change + volume.
    
    Uses the same caching as /market/ltp but returns a flatter, cleaner response
    so the frontend only needs one call for the stock detail hero section.
    """
    exchange = exchange.upper().strip()
    tradingsymbol = tradingsymbol.upper().strip()
    symboltoken = str(symboltoken).strip()

    try:
        ltp_response = _get_ltp_response(
            exchange=exchange,
            tradingsymbol=tradingsymbol,
            symboltoken=symboltoken,
            use_cache=True,
        )

        data = ltp_response.get("data") if isinstance(ltp_response, dict) else {}

        return {
            "status": bool(ltp_response),
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "ltp": data.get("ltp"),
            "open": data.get("open"),
            "high": data.get("high"),
            "low": data.get("low"),
            "close": data.get("close") or data.get("previous_close"),
            "volume": data.get("volume"),
            "change": data.get("change"),
            "change_percent": data.get("change_percent"),
            "source": ltp_response.get("source", "angel_one_rest"),
            "cached": ltp_response.get("cached", False),
        }

    except Exception as e:
        print(f"Quote fast failed: {exchange=} {tradingsymbol=} {symboltoken=}")
        print(e)

        return {
            "status": False,
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "ltp": None,
            "error": str(e),
        }


class QuoteBatchRequest(BaseModel):
    instruments: list[dict]


@router.post("/quote-batch")
def get_quote_batch(
    payload: QuoteBatchRequest,
):
    """
    Batch LTP endpoint for watchlist / holdings.

    Accepts a list of instruments, returns current LTP / OHLC / day change
    for each using cached or WebSocket data. Duplicate tokens are deduplicated
    and only one Angel One REST call is made per unique instrument.
    """
    from collections import OrderedDict

    results: OrderedDict[str, dict] = OrderedDict()

    for instrument in payload.instruments:
        exchange = str(instrument.get("exchange", "")).upper().strip()
        token = str(instrument.get("symboltoken", "") or instrument.get("token", "")).strip()
        symbol = str(instrument.get("tradingsymbol", "") or instrument.get("symbol", "")).strip()

        if not exchange or not token:
            continue

        key = f"{exchange}:{token}"

        ltp_response = _get_ltp_response(
            exchange=exchange,
            tradingsymbol=symbol or token,
            symboltoken=token,
            use_cache=True,
        )

        if isinstance(ltp_response, dict) and ltp_response.get("data"):
            data = ltp_response["data"]
            results[key] = {
                "exchange": exchange,
                "symboltoken": token,
                "tradingsymbol": symbol,
                "ltp": data.get("ltp"),
                "open": data.get("open"),
                "high": data.get("high"),
                "low": data.get("low"),
                "close": data.get("close") or data.get("previous_close"),
                "volume": data.get("volume"),
                "change": data.get("change"),
                "change_percent": data.get("change_percent"),
            }
        else:
            results[key] = {
                "exchange": exchange,
                "symboltoken": token,
                "tradingsymbol": symbol,
                "ltp": None,
                "error": "No data available",
            }

    return {
        "status": True,
        "quotes": list(results.values()),
        "count": len(results),
    }


class LTPBySymbolsRequest(BaseModel):
    symbols: list[str]


@router.post("/ltp-by-symbols")
def get_ltp_by_symbols(
    payload: LTPBySymbolsRequest,
    db: Session = Depends(get_db),
):
    """
    Batch LTP by stock symbol names.

    Accepts a list of symbols (e.g. ["RELIANCE", "TCS"]), looks up each
    in the stock database, and returns current LTP / OHLC / day change
    for each using cached or WebSocket data.
    """
    if not payload.symbols:
        return {"status": True, "quotes": {}, "count": 0}

    unique_symbols = list(set(
        s.strip().upper() for s in payload.symbols if s.strip()
    ))

    stocks = (
        db.query(Stock)
        .filter(func.upper(Stock.symbol).in_(unique_symbols))
        .all()
    )

    results = {}

    for stock in stocks:
        try:
            ltp_response = _get_ltp_response(
                exchange=stock.exchange,
                tradingsymbol=stock.symbol,
                symboltoken=stock.token,
                use_cache=True,
            )

            data = ltp_response.get("data") if isinstance(ltp_response, dict) else {}

            results[stock.symbol] = {
                "ltp": data.get("ltp"),
                "open": data.get("open"),
                "high": data.get("high"),
                "low": data.get("low"),
                "close": data.get("close") or data.get("previous_close"),
                "volume": data.get("volume"),
                "change": data.get("change"),
                "change_percent": data.get("change_percent"),
                "exchange": stock.exchange,
                "token": stock.token,
                "source": ltp_response.get("source", "angel_one_rest"),
            }
        except Exception as e:
            print(f"LTP lookup failed for {stock.symbol}: {e}")
            results[stock.symbol] = {
                "ltp": None,
                "error": str(e),
            }

    # Also include any symbols not found in DB
    found_symbols = {s.symbol.upper() for s in stocks}
    missing = [s for s in unique_symbols if s not in found_symbols]

    for sym in missing:
        results[sym] = {"ltp": None, "error": "Stock not found in database"}

    return {
        "status": True,
        "quotes": results,
        "count": len(results),
    }


def previous_market_day(value: datetime):
    value = value - timedelta(days=1)

    while value.weekday() >= 5:
        value = value - timedelta(days=1)

    return value


def get_safe_market_dates(interval: str, days: int):
    ist = ZoneInfo("Asia/Kolkata")
    now = datetime.now(ist)

    market_open = time(9, 15)
    market_close = time(15, 30)

    if now.weekday() >= 5:
        to_date = previous_market_day(now).replace(
            hour=15,
            minute=30,
            second=0,
            microsecond=0,
        )
    elif now.time() < market_open:
        to_date = previous_market_day(now).replace(
            hour=15,
            minute=30,
            second=0,
            microsecond=0,
        )
    elif now.time() > market_close:
        to_date = now.replace(
            hour=15,
            minute=30,
            second=0,
            microsecond=0,
        )
    else:
        to_date = now.replace(second=0, microsecond=0)

    from_date = to_date - timedelta(days=days)

    if interval == "ONE_DAY":
        from_date = from_date.replace(
            hour=9,
            minute=15,
            second=0,
            microsecond=0,
        )

        to_date = to_date.replace(
            hour=15,
            minute=30,
            second=0,
            microsecond=0,
        )

    return from_date, to_date


def format_angel_date(value: datetime):
    return value.strftime("%Y-%m-%d %H:%M")


def parse_candle_response(response):
    if not isinstance(response, dict):
        return []

    raw_data = response.get("data")

    if not raw_data:
        return []

    candles = []

    for row in raw_data:
        if not row or len(row) < 6:
            continue

        candles.append(
            {
                "time": row[0],
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5] or 0),
            }
        )

    return candles


def _fetch_candles_from_angel(candle_params):
    smart = get_smart_api()

    try:
        return smart.getCandleData(candle_params)

    except Exception as first_error:
        print("Candle first attempt failed, refreshing Angel One session:", first_error)
        reset_smart_api()

        smart = get_smart_api(force_refresh=True)
        return smart.getCandleData(candle_params)


@router.get("/candles")
def get_historical_candles(
    exchange: str,
    symboltoken: str,
    tradingsymbol: str = "",
    interval: str = Query("ONE_DAY"),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(150, ge=10, le=500),
    force: bool = Query(False),
):
    interval = interval.upper().strip()

    if interval not in ALLOWED_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interval. Allowed: {sorted(ALLOWED_INTERVALS)}",
        )

    exchange = exchange.upper().strip()
    symboltoken = str(symboltoken).strip()
    tradingsymbol = str(tradingsymbol or "").strip().upper()

    try:
        from_date, to_date = get_safe_market_dates(interval, days)

        candle_params = {
            "exchange": exchange,
            "symboltoken": symboltoken,
            "interval": interval,
            "fromdate": format_angel_date(from_date),
            "todate": format_angel_date(to_date),
        }

        cache_key = (
            "candles",
            exchange,
            symboltoken,
            interval,
            candle_params["fromdate"],
            candle_params["todate"],
            limit,
        )

        cache_ttl = _candle_cache_ttl(interval)

        if not force and cache_ttl > 0:
            cached = _cache_get(cache_key, cache_ttl)

            if cached is not None:
                return {
                    **cached,
                    "cached": True,
                }

        response = None
        angel_error_message = None

        try:
            response = _fetch_candles_from_angel(candle_params)
        except Exception as angel_error:
            angel_error_message = str(angel_error)
            print("Angel candle raw error:", angel_error)

        candles = parse_candle_response(response)

        interval_used = interval

        if not candles and interval != "ONE_DAY":
            fallback_from, fallback_to = get_safe_market_dates("ONE_DAY", 180)

            fallback_params = {
                "exchange": exchange,
                "symboltoken": symboltoken,
                "interval": "ONE_DAY",
                "fromdate": format_angel_date(fallback_from),
                "todate": format_angel_date(fallback_to),
            }

            fallback_cache_key = (
                "candles",
                exchange,
                symboltoken,
                "ONE_DAY",
                fallback_params["fromdate"],
                fallback_params["todate"],
                limit,
            )

            fallback_cached = _cache_get(
                fallback_cache_key,
                DAILY_CANDLE_CACHE_SECONDS,
            )

            if fallback_cached is not None:
                return {
                    **fallback_cached,
                    "interval": interval,
                    "interval_used": "ONE_DAY",
                    "cached": True,
                }

            try:
                fallback_response = _fetch_candles_from_angel(fallback_params)
                candles = parse_candle_response(fallback_response)
                interval_used = "ONE_DAY"
            except Exception as fallback_error:
                angel_error_message = str(fallback_error)
                print("Angel candle fallback error:", fallback_error)

        candles = candles[-limit:]

        if not candles:
            result = {
                "status": False,
                "message": (
                    "No historical candles returned by Angel One for this "
                    "instrument/timeframe. Try another stock, ONE_DAY interval, "
                    "or open TradingView."
                ),
                "exchange": exchange,
                "tradingsymbol": tradingsymbol,
                "symboltoken": symboltoken,
                "interval": interval,
                "interval_used": interval_used,
                "fromdate": candle_params["fromdate"],
                "todate": candle_params["todate"],
                "candles": [],
                "count": 0,
                "angel_error": angel_error_message,
                "cached": False,
            }

            if cache_ttl > 0:
                _cache_set(cache_key, result)

            return result

        market_state.seed_candles(
            exchange=exchange,
            symboltoken=symboltoken,
            interval=interval_used,
            candles=candles,
        )

        result = {
            "status": True,
            "message": "Candle data fetched successfully",
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "interval": interval,
            "interval_used": interval_used,
            "fromdate": candle_params["fromdate"],
            "todate": candle_params["todate"],
            "candles": candles,
            "count": len(candles),
            "cached": False,
        }

        if cache_ttl > 0:
            _cache_set(cache_key, result)

        return result

    except Exception as e:
        print(
            f"Candle data failed: {exchange=} {tradingsymbol=} "
            f"{symboltoken=} {interval=} {days=}"
        )
        print(e)

        return {
            "status": False,
            "message": "Candle API failed safely.",
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "interval": interval,
            "candles": [],
            "count": 0,
            "error": str(e),
            "cached": False,
        }


def safe_float(value):
    try:
        if value is None:
            return None

        return float(value)
    except Exception:
        return None


def extract_ltp_data(response):
    if not isinstance(response, dict):
        return {}

    data = response.get("data")

    if isinstance(data, dict):
        return data

    return {}


@router.get("/stats")
def get_market_stats(
    exchange: str,
    tradingsymbol: str,
    symboltoken: str,
    force: bool = Query(False),
):
    exchange = exchange.upper().strip()
    tradingsymbol = tradingsymbol.upper().strip()
    symboltoken = str(symboltoken).strip()

    cache_key = ("stats", exchange, tradingsymbol, symboltoken)

    if not force:
        cached = _cache_get(cache_key, MARKET_STATS_CACHE_SECONDS)

        if cached is not None:
            return {
                **cached,
                "cached": True,
            }

    try:
        ltp_response = _get_ltp_response(
            exchange=exchange,
            tradingsymbol=tradingsymbol,
            symboltoken=symboltoken,
            use_cache=not force,
        )

        ltp_data = extract_ltp_data(ltp_response)

        ltp = safe_float(ltp_data.get("ltp"))
        open_price = safe_float(ltp_data.get("open"))
        day_high = safe_float(ltp_data.get("high"))
        day_low = safe_float(ltp_data.get("low"))
        previous_close = safe_float(
            ltp_data.get("close")
            or ltp_data.get("prev_close")
            or ltp_data.get("prevClose")
        )

        change = None
        change_percent = None

        if ltp is not None and previous_close not in (None, 0):
            change = ltp - previous_close
            change_percent = (change / previous_close) * 100

        pe_ratio = (
            safe_float(ltp_data.get("pe"))
            or safe_float(ltp_data.get("peRatio"))
            or safe_float(ltp_data.get("pe_ratio"))
        )

        result = {
            "status": True,
            "message": "Fast market stats fetched successfully",
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "ltp": ltp,
            "open": open_price,
            "previous_close": previous_close,
            "day_high": day_high,
            "day_low": day_low,
            "week_52_high": None,
            "week_52_low": None,
            "volume": safe_float(ltp_data.get("volume")),
            "change": change,
            "change_percent": change_percent,
            "pe_ratio": pe_ratio,
            "pe_available": pe_ratio is not None,
            "cached": False,
        }

        _cache_set(cache_key, result)

        return result

    except Exception as e:
        print(
            f"Market stats failed: {exchange=} {tradingsymbol=} {symboltoken=}"
        )
        print(e)

        return {
            "status": False,
            "message": "Unable to fetch market stats",
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "ltp": None,
            "open": None,
            "previous_close": None,
            "day_high": None,
            "day_low": None,
            "week_52_high": None,
            "week_52_low": None,
            "volume": None,
            "change": None,
            "change_percent": None,
            "pe_ratio": None,
            "pe_available": False,
            "error": str(e),
            "cached": False,
        }


@router.get("/advanced-stats")
def get_advanced_market_stats(
    exchange: str,
    tradingsymbol: str,
    symboltoken: str,
    force: bool = Query(False),
):
    """
    Slower but richer stats endpoint.

    It is separate from /market/stats so StockDetails can open quickly with LTP,
    day high/low, open, previous close, and PE when available, then load 52-week
    stats in the background from cached daily candles.
    """
    exchange = exchange.upper().strip()
    tradingsymbol = tradingsymbol.upper().strip()
    symboltoken = str(symboltoken).strip()

    cache_key = ("advanced_stats", exchange, tradingsymbol, symboltoken)

    if not force:
        cached = _cache_get(cache_key, DAILY_CANDLE_CACHE_SECONDS)

        if cached is not None:
            return {
                **cached,
                "cached": True,
            }

    try:
        from_date, to_date = get_safe_market_dates("ONE_DAY", 365)

        candle_params = {
            "exchange": exchange,
            "symboltoken": symboltoken,
            "interval": "ONE_DAY",
            "fromdate": format_angel_date(from_date),
            "todate": format_angel_date(to_date),
        }

        candle_cache_key = (
            "candles",
            exchange,
            symboltoken,
            "ONE_DAY",
            candle_params["fromdate"],
            candle_params["todate"],
            365,
        )

        candles_result = None

        if not force:
            candles_result = _cache_get(
                candle_cache_key,
                DAILY_CANDLE_CACHE_SECONDS,
            )

        if candles_result and isinstance(candles_result, dict):
            candles = candles_result.get("candles", [])
        else:
            candle_response = _fetch_candles_from_angel(candle_params)
            candles = parse_candle_response(candle_response)

            candle_result = {
                "status": bool(candles),
                "message": "Daily candle data fetched successfully",
                "exchange": exchange,
                "tradingsymbol": tradingsymbol,
                "symboltoken": symboltoken,
                "interval": "ONE_DAY",
                "interval_used": "ONE_DAY",
                "fromdate": candle_params["fromdate"],
                "todate": candle_params["todate"],
                "candles": candles[-365:],
                "count": len(candles[-365:]),
                "cached": False,
            }

            _cache_set(candle_cache_key, candle_result)

        candles = candles[-365:]

        week_52_high = None
        week_52_low = None
        open_price = None
        day_high = None
        day_low = None
        previous_close = None
        volume = None

        if candles:
            week_52_high = max(item["high"] for item in candles)
            week_52_low = min(item["low"] for item in candles)

            latest = candles[-1]

            open_price = latest.get("open")
            day_high = latest.get("high")
            day_low = latest.get("low")
            volume = latest.get("volume")

            if len(candles) >= 2:
                previous_close = candles[-2].get("close")

        result = {
            "status": True,
            "message": "Advanced market stats fetched successfully",
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "open": open_price,
            "previous_close": previous_close,
            "day_high": day_high,
            "day_low": day_low,
            "week_52_high": week_52_high,
            "week_52_low": week_52_low,
            "volume": volume,
            "source": "ONE_DAY_CANDLES",
            "cached": False,
        }

        _cache_set(cache_key, result)

        return result

    except Exception as e:
        print(
            f"Advanced market stats failed: {exchange=} {tradingsymbol=} "
            f"{symboltoken=}"
        )
        print(e)

        return {
            "status": False,
            "message": "Unable to fetch advanced market stats",
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "open": None,
            "previous_close": None,
            "day_high": None,
            "day_low": None,
            "week_52_high": None,
            "week_52_low": None,
            "volume": None,
            "error": str(e),
            "cached": False,
        }


# Rate limiter for /market/reset — max once per 15 seconds
_last_reset_time = 0
_reset_lock = threading.Lock()
RESET_COOLDOWN_SECONDS = 15


@router.post("/reset")
def reset_angelone_session():
    """
    Force-reset the cached Angel One SmartAPI session.

    Rate-limited to once every {RESET_COOLDOWN_SECONDS} seconds to prevent
    the frontend reconnect loop from hammering Angel One's API.

    When Angel One credentials change (password, TOTP secret, API key),
    the frontend calls this endpoint to clear the stale session and
    authenticate with the current ANGELONE_* environment variables.

    Returns the new login status so the frontend can confirm success
    before reconnecting the WebSocket.
    """
    global _last_reset_time

    now = time_module.time()

    with _reset_lock:
        if now - _last_reset_time < RESET_COOLDOWN_SECONDS:
            return {
                "status": False,
                "message": f"Reset rate-limited. Try again in {int(RESET_COOLDOWN_SECONDS - (now - _last_reset_time))}s.",
                "rate_limited": True,
            }

        _last_reset_time = now

    try:
        from app.services.market_stream import market_stream

        # 1. Stop the live market stream (disconnects old Angel One WebSocket)
        market_stream.stop()

        # 2. Clear the stale SmartAPI session
        reset_smart_api()

        # 3. Re-login with whatever is in .env right now
        fresh_credentials = get_smart_api(force_refresh=True)

        # 4. Restart the market stream with fresh credentials
        market_stream.start()

        return {
            "status": True,
            "message": "Angel One session reset and re-logged in successfully. WebSocket reconnecting with new credentials.",
        }

    except Exception as e:
        print(f"Angel One session reset failed: {e}")

        return {
            "status": False,
            "message": f"Angel One session reset failed: {str(e)}",
        }


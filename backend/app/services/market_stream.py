import json
import logging
import os
import random
import threading
import time
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from SmartApi.smartWebSocketV2 import SmartWebSocketV2

from app.services.angelone import (
    get_smart_stream_credentials,
    reset_smart_api,
)


logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

EXCHANGE_TO_TYPE = {
    "NSE": SmartWebSocketV2.NSE_CM,
    "NFO": SmartWebSocketV2.NSE_FO,
    "BSE": SmartWebSocketV2.BSE_CM,
    "BFO": SmartWebSocketV2.BSE_FO,
    "MCX": SmartWebSocketV2.MCX_FO,
    "NCX": SmartWebSocketV2.NCX_FO,
    "CDS": SmartWebSocketV2.CDE_FO,
}
TYPE_TO_EXCHANGE = {value: key for key, value in EXCHANGE_TO_TYPE.items()}

INTERVAL_MINUTES = {
    "ONE_MINUTE": 1,
    "THREE_MINUTE": 3,
    "FIVE_MINUTE": 5,
    "TEN_MINUTE": 10,
    "FIFTEEN_MINUTE": 15,
    "THIRTY_MINUTE": 30,
    "ONE_HOUR": 60,
}
SUPPORTED_INTERVALS = set(INTERVAL_MINUTES) | {"ONE_DAY"}

PRICE_DIVISOR = float(os.getenv("ANGELONE_PRICE_DIVISOR", "100"))
STREAM_ENABLED = os.getenv("MARKET_STREAM_ENABLED", "true").lower() == "true"
STREAM_STALE_SECONDS = float(os.getenv("MARKET_STREAM_STALE_SECONDS", "15"))
RECONNECT_MIN_SECONDS = float(
    os.getenv("MARKET_STREAM_RECONNECT_MIN_SECONDS", "1")
)
RECONNECT_MAX_SECONDS = float(
    os.getenv("MARKET_STREAM_RECONNECT_MAX_SECONDS", "30")
)


def normalize_instrument(exchange: str, symboltoken: str) -> tuple[str, str, str]:
    clean_exchange = str(exchange or "").strip().upper()
    clean_token = str(symboltoken or "").strip()

    if clean_exchange not in EXCHANGE_TO_TYPE:
        raise ValueError(f"Unsupported exchange for live feed: {clean_exchange}")

    if not clean_token:
        raise ValueError("symboltoken is required")

    return clean_exchange, clean_token, f"{clean_exchange}:{clean_token}"


def normalize_interval(interval: str) -> str:
    clean_interval = str(interval or "ONE_MINUTE").strip().upper()

    if clean_interval not in SUPPORTED_INTERVALS:
        raise ValueError(f"Unsupported live candle interval: {clean_interval}")

    return clean_interval


def _safe_number(value, divisor: float = 1.0):
    try:
        if value is None:
            return None

        return float(value) / divisor
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _exchange_datetime(raw_timestamp) -> datetime:
    try:
        timestamp = float(raw_timestamp)

        if timestamp > 10_000_000_000:
            timestamp /= 1000

        if timestamp > 0:
            return datetime.fromtimestamp(timestamp, tz=IST)
    except (TypeError, ValueError, OSError):
        pass

    return datetime.now(IST)


def _parse_candle_time(value) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value or "").strip()

        if not text:
            return None

        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            for pattern in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
                try:
                    parsed = datetime.strptime(text, pattern)
                    break
                except ValueError:
                    parsed = None

            if parsed is None:
                return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=IST)

    return parsed.astimezone(IST)


def candle_bucket(value: datetime, interval: str) -> datetime:
    interval = normalize_interval(interval)
    local_value = value.astimezone(IST)

    if interval == "ONE_DAY":
        return local_value.replace(hour=0, minute=0, second=0, microsecond=0)

    interval_minutes = INTERVAL_MINUTES[interval]
    market_anchor_minutes = 9 * 60 + 15
    current_minutes = local_value.hour * 60 + local_value.minute
    elapsed = current_minutes - market_anchor_minutes
    bucket_offset = (elapsed // interval_minutes) * interval_minutes
    bucket_minutes = market_anchor_minutes + bucket_offset
    bucket_date = local_value.date()

    while bucket_minutes < 0:
        bucket_date -= timedelta(days=1)
        bucket_minutes += 24 * 60

    while bucket_minutes >= 24 * 60:
        bucket_date += timedelta(days=1)
        bucket_minutes -= 24 * 60

    return datetime(
        bucket_date.year,
        bucket_date.month,
        bucket_date.day,
        bucket_minutes // 60,
        bucket_minutes % 60,
        tzinfo=IST,
    )


class MarketState:
    def __init__(self):
        self._lock = threading.RLock()
        self._quotes = {}
        self._versions = defaultdict(int)
        self._candles = defaultdict(dict)
        self._last_cumulative_volume = {}

    def process_tick(self, raw_tick: dict):
        exchange_type = int(raw_tick.get("exchange_type") or 0)
        exchange = TYPE_TO_EXCHANGE.get(exchange_type)
        token = str(raw_tick.get("token") or "").strip()
        ltp = _safe_number(raw_tick.get("last_traded_price"), PRICE_DIVISOR)

        if not exchange or not token or ltp is None or ltp <= 0:
            return None

        _, _, symbol_key = normalize_instrument(exchange, token)
        exchange_time = _exchange_datetime(raw_tick.get("exchange_timestamp"))
        received_time = datetime.now(IST)
        cumulative_volume = _safe_number(
            raw_tick.get("volume_trade_for_the_day")
        )

        quote = {
            "exchange": exchange,
            "symboltoken": token,
            "symbol_key": symbol_key,
            "ltp": ltp,
            "last_traded_quantity": _safe_number(
                raw_tick.get("last_traded_quantity")
            ),
            "average_traded_price": _safe_number(
                raw_tick.get("average_traded_price"),
                PRICE_DIVISOR,
            ),
            "volume": cumulative_volume,
            "open": _safe_number(
                raw_tick.get("open_price_of_the_day"),
                PRICE_DIVISOR,
            ),
            "high": _safe_number(
                raw_tick.get("high_price_of_the_day"),
                PRICE_DIVISOR,
            ),
            "low": _safe_number(
                raw_tick.get("low_price_of_the_day"),
                PRICE_DIVISOR,
            ),
            "previous_close": _safe_number(
                raw_tick.get("closed_price"),
                PRICE_DIVISOR,
            ),
            "sequence_number": raw_tick.get("sequence_number"),
            "exchange_timestamp": exchange_time.isoformat(),
            "received_at": received_time.isoformat(),
            "latency_ms": max(
                0,
                int((received_time - exchange_time).total_seconds() * 1000),
            ),
            "source": "angel_one_websocket_v2",
        }

        with self._lock:
            previous_volume = self._last_cumulative_volume.get(symbol_key)
            volume_delta = 0.0

            if cumulative_volume is not None:
                if (
                    previous_volume is not None
                    and cumulative_volume >= previous_volume
                ):
                    volume_delta = cumulative_volume - previous_volume

                self._last_cumulative_volume[symbol_key] = cumulative_volume

            self._quotes[symbol_key] = quote

            for interval in SUPPORTED_INTERVALS:
                self._update_candle(
                    symbol_key=symbol_key,
                    interval=interval,
                    exchange_time=exchange_time,
                    quote=quote,
                    volume_delta=volume_delta,
                )

            self._versions[symbol_key] += 1

        return quote

    def _update_candle(
        self,
        symbol_key: str,
        interval: str,
        exchange_time: datetime,
        quote: dict,
        volume_delta: float,
    ):
        bucket = candle_bucket(exchange_time, interval)
        bucket_key = bucket.isoformat()
        candle_key = (symbol_key, interval)
        candles = self._candles[candle_key]
        current = candles.get(bucket_key)
        ltp = quote["ltp"]

        if interval == "ONE_DAY":
            day_open = quote.get("open") or (current or {}).get("open") or ltp
            day_high = quote.get("high") or ltp
            day_low = quote.get("low") or ltp
            total_volume = quote.get("volume")

            candles[bucket_key] = {
                "time": bucket_key,
                "open": day_open,
                "high": max(day_high, ltp),
                "low": min(day_low, ltp),
                "close": ltp,
                "volume": total_volume or 0,
                "tick_count": int((current or {}).get("tick_count", 0)) + 1,
                "is_live": True,
            }
        elif current:
            current["high"] = max(float(current["high"]), ltp)
            current["low"] = min(float(current["low"]), ltp)
            current["close"] = ltp
            current["volume"] = float(current.get("volume") or 0) + volume_delta
            current["tick_count"] = int(current.get("tick_count") or 0) + 1
            current["is_live"] = True
        else:
            candles[bucket_key] = {
                "time": bucket_key,
                "open": ltp,
                "high": ltp,
                "low": ltp,
                "close": ltp,
                "volume": volume_delta,
                "tick_count": 1,
                "is_live": True,
            }

        if len(candles) > 500:
            for stale_key in sorted(candles)[:-500]:
                candles.pop(stale_key, None)

    def seed_candles(
        self,
        exchange: str,
        symboltoken: str,
        interval: str,
        candles: list,
    ):
        interval = normalize_interval(interval)
        _, _, symbol_key = normalize_instrument(exchange, symboltoken)
        candle_key = (symbol_key, interval)

        with self._lock:
            stored = self._candles[candle_key]

            for incoming in candles or []:
                parsed_time = _parse_candle_time(incoming.get("time"))

                if parsed_time is None:
                    continue

                bucket_key = candle_bucket(parsed_time, interval).isoformat()
                seeded = {
                    "time": bucket_key,
                    "open": float(incoming.get("open") or 0),
                    "high": float(incoming.get("high") or 0),
                    "low": float(incoming.get("low") or 0),
                    "close": float(incoming.get("close") or 0),
                    "volume": float(incoming.get("volume") or 0),
                    "tick_count": int(incoming.get("tick_count") or 0),
                    "is_live": bool(incoming.get("is_live", False)),
                }
                existing = stored.get(bucket_key)

                if existing and existing.get("is_live"):
                    seeded["high"] = max(seeded["high"], existing["high"])
                    seeded["low"] = min(seeded["low"], existing["low"])
                    seeded["close"] = existing["close"]
                    seeded["volume"] = max(
                        seeded["volume"],
                        float(existing.get("volume") or 0),
                    )
                    seeded["tick_count"] = int(
                        existing.get("tick_count") or 0
                    )
                    seeded["is_live"] = True

                stored[bucket_key] = seeded

            if len(stored) > 500:
                for stale_key in sorted(stored)[:-500]:
                    stored.pop(stale_key, None)

    def get_version(self, symbol_key: str) -> int:
        with self._lock:
            return self._versions.get(symbol_key, 0)

    def get_quote(
        self,
        exchange: str,
        symboltoken: str,
        max_age_seconds: float | None = None,
    ):
        _, _, symbol_key = normalize_instrument(exchange, symboltoken)

        with self._lock:
            quote = self._quotes.get(symbol_key)

            if not quote:
                return None

            copied = deepcopy(quote)

        if max_age_seconds is not None:
            received_at = _parse_candle_time(copied.get("received_at"))

            if (
                received_at is None
                or (datetime.now(IST) - received_at).total_seconds()
                > max_age_seconds
            ):
                return None

        return copied

    def get_candles(
        self,
        exchange: str,
        symboltoken: str,
        interval: str,
        limit: int = 120,
    ):
        interval = normalize_interval(interval)
        _, _, symbol_key = normalize_instrument(exchange, symboltoken)

        with self._lock:
            candles = self._candles.get((symbol_key, interval), {})
            keys = sorted(candles)[-limit:]
            return [deepcopy(candles[key]) for key in keys]

    def get_update(
        self,
        exchange: str,
        symboltoken: str,
        interval: str,
    ):
        interval = normalize_interval(interval)
        _, _, symbol_key = normalize_instrument(exchange, symboltoken)

        with self._lock:
            quote = deepcopy(self._quotes.get(symbol_key))
            candles = self._candles.get((symbol_key, interval), {})
            candle = deepcopy(candles[max(candles)]) if candles else None
            version = self._versions.get(symbol_key, 0)

        return {
            "version": version,
            "quote": quote,
            "candle": candle,
        }


class AngelOneMarketStream:
    def __init__(self, state: MarketState):
        self.state = state
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._subscriptions = defaultdict(int)
        self._running = False
        self._connected = False
        self._thread = None
        self._socket = None
        self._last_error = None
        self._connected_at = None
        self._last_tick_at = None

    def start(self):
        if not STREAM_ENABLED:
            logger.warning("Angel One market stream is disabled")
            return

        with self._condition:
            if self._running:
                return

            self._running = True
            self._thread = threading.Thread(
                target=self._run,
                name="angel-one-market-stream",
                daemon=True,
            )
            self._thread.start()

    def stop(self):
        with self._condition:
            self._running = False
            socket = self._socket
            self._condition.notify_all()

        if socket:
            try:
                socket.close_connection()
            except Exception:
                logger.exception("Failed to close Angel One market stream")

    def subscribe(self, exchange: str, symboltoken: str):
        exchange, token, symbol_key = normalize_instrument(exchange, symboltoken)

        with self._condition:
            first_subscriber = self._subscriptions[symbol_key] == 0
            self._subscriptions[symbol_key] += 1
            socket = self._socket if self._connected else None
            self._condition.notify_all()

        if first_subscriber and socket:
            self._send_subscription(socket, exchange, token, subscribe=True)

    def unsubscribe(self, exchange: str, symboltoken: str):
        exchange, token, symbol_key = normalize_instrument(exchange, symboltoken)

        with self._condition:
            if self._subscriptions.get(symbol_key, 0) <= 1:
                self._subscriptions.pop(symbol_key, None)
                last_subscriber = True
            else:
                self._subscriptions[symbol_key] -= 1
                last_subscriber = False

            socket = self._socket if self._connected else None

        if last_subscriber and socket:
            self._send_subscription(socket, exchange, token, subscribe=False)

    def _current_token_list(self):
        grouped = defaultdict(list)

        with self._lock:
            symbol_keys = list(self._subscriptions)

        for symbol_key in symbol_keys:
            exchange, token = symbol_key.split(":", 1)
            grouped[EXCHANGE_TO_TYPE[exchange]].append(token)

        return [
            {"exchangeType": exchange_type, "tokens": tokens}
            for exchange_type, tokens in grouped.items()
            if tokens
        ]

    def _send_subscription(
        self,
        socket,
        exchange: str,
        token: str,
        subscribe: bool,
    ):
        token_list = [
            {
                "exchangeType": EXCHANGE_TO_TYPE[exchange],
                "tokens": [token],
            }
        ]

        try:
            self._send_token_list(socket, token_list, subscribe=subscribe)
        except Exception as exc:
            self._last_error = str(exc)
            logger.warning(
                "Angel One dynamic %s failed for %s:%s: %s",
                "subscribe" if subscribe else "unsubscribe",
                exchange,
                token,
                exc,
            )

    @staticmethod
    def _send_token_list(socket, token_list: list, subscribe: bool = True):
        if not socket.wsapp:
            raise RuntimeError("Angel One WebSocket is not open")

        request_data = {
            "correlationID": (
                f"{'sub' if subscribe else 'un'}{int(time.time())}"
            )[-10:],
            "action": (
                SmartWebSocketV2.SUBSCRIBE_ACTION
                if subscribe
                else SmartWebSocketV2.UNSUBSCRIBE_ACTION
            ),
            "params": {
                "mode": SmartWebSocketV2.QUOTE,
                "tokenList": token_list,
            },
        }
        socket.wsapp.send(json.dumps(request_data))

    def _run(self):
        retry_delay = RECONNECT_MIN_SECONDS

        while True:
            with self._condition:
                while self._running and not self._subscriptions:
                    self._condition.wait(timeout=5)

                if not self._running:
                    return

            try:
                credentials = get_smart_stream_credentials()
                socket = SmartWebSocketV2(
                    credentials["auth_token"],
                    credentials["api_key"],
                    credentials["client_code"],
                    credentials["feed_token"],
                    max_retry_attempt=0,
                )
                self._socket = socket

                def on_open(_wsapp):
                    with self._lock:
                        self._connected = True
                        self._connected_at = datetime.now(IST).isoformat()
                        self._last_error = None

                    token_list = self._current_token_list()

                    if token_list:
                        self._send_token_list(socket, token_list)

                def on_data(_wsapp, message):
                    quote = self.state.process_tick(message)

                    if quote:
                        self._last_tick_at = quote["received_at"]

                def on_error(*args):
                    error = args[-1] if args else "Unknown WebSocket error"
                    self._last_error = str(error)
                    logger.warning("Angel One WebSocket error: %s", error)

                def on_close(*_args):
                    with self._lock:
                        self._connected = False

                socket.on_open = on_open
                socket.on_data = on_data
                socket.on_error = on_error
                socket.on_close = on_close
                socket.connect()
                retry_delay = RECONNECT_MIN_SECONDS
            except Exception as exc:
                self._last_error = str(exc)
                logger.exception("Angel One WebSocket connection failed")

                if "token" in str(exc).lower() or "session" in str(exc).lower():
                    reset_smart_api()
            finally:
                with self._lock:
                    self._connected = False
                    self._socket = None

            with self._lock:
                should_retry = self._running and bool(self._subscriptions)

            if not should_retry:
                continue

            sleep_seconds = min(
                RECONNECT_MAX_SECONDS,
                retry_delay + random.uniform(0, max(0.25, retry_delay * 0.2)),
            )
            time.sleep(sleep_seconds)
            retry_delay = min(RECONNECT_MAX_SECONDS, retry_delay * 2)

    def status(self):
        with self._lock:
            subscription_count = len(self._subscriptions)
            connected = self._connected
            last_tick_at = self._last_tick_at

        feed_stale = True

        if last_tick_at:
            parsed = _parse_candle_time(last_tick_at)
            feed_stale = (
                parsed is None
                or (datetime.now(IST) - parsed).total_seconds()
                > STREAM_STALE_SECONDS
            )

        return {
            "enabled": STREAM_ENABLED,
            "connected": connected,
            "feed_stale": feed_stale,
            "active_instruments": subscription_count,
            "connected_at": self._connected_at,
            "last_tick_at": last_tick_at,
            "last_error": self._last_error,
            "source": "angel_one_websocket_v2",
        }


market_state = MarketState()
market_stream = AngelOneMarketStream(market_state)

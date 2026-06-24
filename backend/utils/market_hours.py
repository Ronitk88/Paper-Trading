import json
import os
from datetime import datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo


MARKET_TIMEZONE_NAME = os.getenv("MARKET_TIMEZONE", "Asia/Kolkata")

MARKET_TIMEZONE = ZoneInfo(MARKET_TIMEZONE_NAME)

NORMAL_MARKET_OPEN_TIME = time(
    int(os.getenv("MARKET_OPEN_HOUR", "9")),
    int(os.getenv("MARKET_OPEN_MINUTE", "15")),
)
NORMAL_MARKET_CLOSE_TIME = time(
    int(os.getenv("MARKET_CLOSE_HOUR", "15")),
    int(os.getenv("MARKET_CLOSE_MINUTE", "30")),
)

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_HOLIDAY_FILE = BASE_DIR / "market_holidays.json"


# Fallback NSE/BSE equity trading holidays for calendar year 2026.
# Override/extend using backend/market_holidays.json or EXTRA_MARKET_HOLIDAYS.
MARKET_HOLIDAYS = {
    "2026-01-15": "Municipal Corporation Elections in Maharashtra",
    "2026-01-26": "Republic Day",
    "2026-03-03": "Holi",
    "2026-03-26": "Shri Ram Navami",
    "2026-03-31": "Shri Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-28": "Bakri Eid",
    "2026-06-26": "Muharram",
    "2026-09-14": "Ganesh Chaturthi",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-10": "Diwali-Balipratipada",
    "2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
    "2026-12-25": "Christmas",
}


# Add special sessions like Diwali Muhurat Trading only after official time is declared.
SPECIAL_TRADING_SESSIONS = {}


def _load_holidays_from_json_file():
    configured_path = os.getenv("MARKET_HOLIDAYS_JSON", "").strip()
    file_path = Path(configured_path) if configured_path else DEFAULT_HOLIDAY_FILE

    if not file_path.is_absolute():
        file_path = BASE_DIR / file_path

    if not file_path.exists():
        return {}

    try:
        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)

        if isinstance(data, dict):
            return {
                str(date_value).strip(): str(name).strip()
                for date_value, name in data.items()
                if str(date_value).strip()
            }

        if isinstance(data, list):
            holidays = {}

            for item in data:
                if not isinstance(item, dict):
                    continue

                date_value = str(item.get("date", "")).strip()
                name = str(item.get("name", "Market Holiday")).strip()

                if date_value:
                    holidays[date_value] = name

            return holidays

        return {}

    except Exception as error:
        print("Market holiday JSON load failed:", error)
        return {}


def _load_extra_holidays_from_env():
    raw_value = os.getenv("EXTRA_MARKET_HOLIDAYS", "").strip()

    if not raw_value:
        return {}

    holidays = {}

    for item in raw_value.split(","):
        clean_item = item.strip()

        if not clean_item:
            continue

        if ":" in clean_item:
            date_value, name = clean_item.split(":", 1)
            holidays[date_value.strip()] = name.strip() or "Market Holiday"
        else:
            holidays[clean_item] = "Market Holiday"

    return holidays


def get_market_holidays():
    holidays = dict(MARKET_HOLIDAYS)
    holidays.update(_load_holidays_from_json_file())
    holidays.update(_load_extra_holidays_from_env())

    return holidays


def _format_datetime(value: datetime):
    return value.strftime("%d %b %Y, %H:%M:%S")


def _format_time(value: time):
    return value.strftime("%I:%M %p")


def _closed_response(status: str, reason: str, now: datetime, holiday_name=None):
    return {
        "is_open": False,
        "status": status,
        "reason": reason,
        "holiday_name": holiday_name,
        "current_time": _format_datetime(now),
        "timezone": "Asia/Kolkata",
        "market_open_time": _format_time(NORMAL_MARKET_OPEN_TIME),
        "market_close_time": _format_time(NORMAL_MARKET_CLOSE_TIME),
    }


def _open_response(status: str, reason: str, now: datetime, session_name=None):
    return {
        "is_open": True,
        "status": status,
        "reason": reason,
        "session_name": session_name,
        "current_time": _format_datetime(now),
        "timezone": "Asia/Kolkata",
        "market_open_time": _format_time(NORMAL_MARKET_OPEN_TIME),
        "market_close_time": _format_time(NORMAL_MARKET_CLOSE_TIME),
    }


def get_market_status():
    now = datetime.now(MARKET_TIMEZONE)
    today = now.date().isoformat()
    current_time = now.time()

    special_session = SPECIAL_TRADING_SESSIONS.get(today)

    if special_session:
        session_name = special_session.get("name", "Special Trading Session")
        session_open = special_session.get("open")
        session_close = special_session.get("close")

        if session_open and session_close:
            if session_open <= current_time <= session_close:
                return _open_response(
                    status="SPECIAL_OPEN",
                    reason=f"{session_name} is open.",
                    now=now,
                    session_name=session_name,
                )

            if current_time < session_open:
                return _closed_response(
                    status="SPECIAL_PRE_OPEN",
                    reason=(
                        f"{session_name} has not opened yet. "
                        f"Trading starts at {_format_time(session_open)}."
                    ),
                    now=now,
                    holiday_name=session_name,
                )

            return _closed_response(
                status="SPECIAL_CLOSED",
                reason=(
                    f"{session_name} is closed. "
                    f"Trading ended at {_format_time(session_close)}."
                ),
                now=now,
                holiday_name=session_name,
            )

    holidays = get_market_holidays()
    holiday_name = holidays.get(today)

    if holiday_name:
        return _closed_response(
            status="HOLIDAY",
            reason=f"Market is closed today for {holiday_name}.",
            now=now,
            holiday_name=holiday_name,
        )

    if now.weekday() >= 5:
        return _closed_response(
            status="WEEKEND",
            reason="Market is closed on weekends.",
            now=now,
        )

    if current_time < NORMAL_MARKET_OPEN_TIME:
        return _closed_response(
            status="PRE_MARKET",
            reason="Market has not opened yet. Trading starts at 09:15 AM.",
            now=now,
        )

    if current_time > NORMAL_MARKET_CLOSE_TIME:
        return _closed_response(
            status="CLOSED",
            reason="Market is closed. Trading is allowed only till 03:30 PM.",
            now=now,
        )

    return _open_response(
        status="OPEN",
        reason="Market is open.",
        now=now,
    )


def is_market_open():
    return get_market_status()["is_open"]


def is_market_holiday(date_value: str):
    return date_value in get_market_holidays()

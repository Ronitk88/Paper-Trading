import threading
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.holding import Holding
from app.models.stock import Stock
from app.services.angelone import get_smart_api, reset_smart_api


router = APIRouter(
    prefix="/market-aggressive",
    tags=["Market Aggressive Polling"],
)

IST = ZoneInfo("Asia/Kolkata")

_price_cache = {}
_cache_lock = threading.Lock()


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id

    return current_user


def safe_float(value, default=0):
    try:
        if value is None:
            return default

        return float(value)
    except Exception:
        return default


def safe_int(value, default=0):
    try:
        if value is None:
            return default

        return int(value)
    except Exception:
        return default


def get_attr_value(obj, names, default=None):
    for name in names:
        if hasattr(obj, name):
            value = getattr(obj, name)

            if value is not None:
                return value

    return default


def get_stock_token(stock):
    return get_attr_value(
        stock,
        ["token", "symboltoken", "symbol_token"],
        "",
    )


def get_stock_symbol(stock):
    return get_attr_value(
        stock,
        ["symbol", "tradingsymbol", "trading_symbol"],
        "",
    )


def get_stock_exchange(stock):
    return str(
        get_attr_value(
            stock,
            ["exchange"],
            "NSE",
        )
    ).upper()


def find_stock_by_token(
    db: Session,
    symboltoken: str,
):
    clean_token = str(symboltoken).strip()

    if not clean_token:
        return None

    for field_name in ["token", "symboltoken", "symbol_token"]:
        column = getattr(Stock, field_name, None)

        if column is None:
            continue

        stock = (
            db.query(Stock)
            .filter(column == clean_token)
            .first()
        )

        if stock:
            return stock

    return None


def find_stock_by_symbol(
    db: Session,
    symbol: str,
):
    clean_symbol = str(symbol or "").strip().upper()

    if not clean_symbol:
        return None

    for field_name in ["symbol", "tradingsymbol", "trading_symbol"]:
        column = getattr(Stock, field_name, None)

        if column is None:
            continue

        stock = (
            db.query(Stock)
            .filter(func.upper(column) == clean_symbol)
            .first()
        )

        if stock:
            return stock

    return None


def parse_ltp_response(response):
    """
    Supports both Angel One response styles:
    1. {"data": {"ltp": 123}}
    2. {"fetched": [{"ltp": 123}]}
    """

    if not isinstance(response, dict):
        return None

    data = response.get("data")

    if isinstance(data, dict):
        return {
            "ltp": safe_float(data.get("ltp")),
            "open": safe_float(data.get("open")),
            "high": safe_float(data.get("high")),
            "low": safe_float(data.get("low")),
            "close": safe_float(data.get("close")),
            "volume": safe_float(data.get("volume")),
            "oi": safe_float(data.get("oi")),
            "bid": safe_float(data.get("bid")),
            "ask": safe_float(data.get("ask")),
        }

    fetched = response.get("fetched")

    if isinstance(fetched, list) and len(fetched) > 0:
        item = fetched[0] or {}

        return {
            "ltp": safe_float(item.get("ltp")),
            "open": safe_float(item.get("open")),
            "high": safe_float(item.get("high")),
            "low": safe_float(item.get("low")),
            "close": safe_float(item.get("close")),
            "volume": safe_float(item.get("volume")),
            "oi": safe_float(item.get("oi")),
            "bid": safe_float(item.get("bid")),
            "ask": safe_float(item.get("ask")),
        }

    return None


def fetch_single_ltp(
    exchange: str,
    tradingsymbol: str,
    symboltoken: str,
):
    smart = get_smart_api()

    try:
        response = smart.ltpData(
            exchange=exchange,
            tradingsymbol=tradingsymbol,
            symboltoken=str(symboltoken),
        )

        return parse_ltp_response(response)

    except Exception as first_error:
        print(f"LTP first attempt failed for {tradingsymbol}: {first_error}")

        try:
            reset_smart_api()
            smart = get_smart_api()

            response = smart.ltpData(
                exchange=exchange,
                tradingsymbol=tradingsymbol,
                symboltoken=str(symboltoken),
            )

            return parse_ltp_response(response)

        except Exception as second_error:
            print(f"LTP retry failed for {tradingsymbol}: {second_error}")
            raise second_error


@router.get("/batch-ltps")
def get_batch_ltps(
    symbols: str = Query(..., description="Comma-separated symboltoken list"),
    exchange: str = Query("NSE", description="Default exchange"),
    db: Session = Depends(get_db),
):
    """
    Get LTP for multiple stock tokens.

    Example:
    /market-aggressive/batch-ltps?symbols=2885,11536,1594&exchange=NSE
    """

    try:
        exchange = exchange.upper().strip()
        symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]

        if not symbol_list:
            return {
                "status": False,
                "error": "No symbols provided",
                "data": {},
                "count": 0,
                "timestamp": datetime.now(IST).isoformat(),
            }

        results = {}

        for symboltoken in symbol_list:
            try:
                stock = find_stock_by_token(db, symboltoken)

                stock_exchange = exchange
                tradingsymbol = ""

                if stock:
                    stock_exchange = get_stock_exchange(stock)
                    tradingsymbol = get_stock_symbol(stock)

                ltp_data = fetch_single_ltp(
                    exchange=stock_exchange,
                    tradingsymbol=tradingsymbol,
                    symboltoken=symboltoken,
                )

                if not ltp_data:
                    results[symboltoken] = {
                        "status": False,
                        "symboltoken": symboltoken,
                        "error": "No LTP data returned",
                    }
                    continue

                results[symboltoken] = {
                    "status": True,
                    "symboltoken": symboltoken,
                    "exchange": stock_exchange,
                    "tradingsymbol": tradingsymbol,
                    "ltp": ltp_data["ltp"],
                    "open": ltp_data["open"],
                    "high": ltp_data["high"],
                    "low": ltp_data["low"],
                    "close": ltp_data["close"],
                    "volume": ltp_data["volume"],
                    "oi": ltp_data["oi"],
                    "bid": ltp_data["bid"],
                    "ask": ltp_data["ask"],
                    "timestamp": datetime.now(IST).isoformat(),
                }

            except Exception as error:
                print(f"LTP fetch error for token {symboltoken}: {error}")

                results[symboltoken] = {
                    "status": False,
                    "symboltoken": symboltoken,
                    "error": str(error),
                    "timestamp": datetime.now(IST).isoformat(),
                }

        return {
            "status": True,
            "data": results,
            "count": len(results),
            "timestamp": datetime.now(IST).isoformat(),
        }

    except Exception as error:
        print(f"Batch LTP error: {error}")

        return {
            "status": False,
            "error": str(error),
            "data": {},
            "count": 0,
            "timestamp": datetime.now(IST).isoformat(),
        }


@router.get("/holdings-ltps")
def get_holdings_ltps(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get latest LTPs for the logged-in user's holdings.

    This fixes the FastAPI error by using:
    db: Session = Depends(get_db)

    Not:
    db: Session = Query(None)
    """

    try:
        user_id = get_user_id(current_user)

        holdings = (
            db.query(Holding)
            .filter(Holding.user_id == user_id)
            .all()
        )

        if not holdings:
            return {
                "status": True,
                "data": {},
                "count": 0,
                "timestamp": datetime.now(IST).isoformat(),
            }

        results = {}

        for holding in holdings:
            try:
                holding_symbol = str(getattr(holding, "symbol", "")).upper()

                holding_token = get_attr_value(
                    holding,
                    ["token", "symboltoken", "symbol_token"],
                    None,
                )

                holding_exchange = str(
                    get_attr_value(
                        holding,
                        ["exchange"],
                        "NSE",
                    )
                ).upper()

                stock = None

                if holding_token:
                    stock = find_stock_by_token(db, str(holding_token))

                if not stock and holding_symbol:
                    stock = find_stock_by_symbol(db, holding_symbol)

                if stock:
                    symboltoken = str(get_stock_token(stock))
                    tradingsymbol = str(get_stock_symbol(stock))
                    exchange = get_stock_exchange(stock)
                else:
                    symboltoken = str(holding_token or "")
                    tradingsymbol = holding_symbol
                    exchange = holding_exchange

                if not symboltoken:
                    results[holding_symbol] = {
                        "status": False,
                        "symbol": holding_symbol,
                        "error": "Symbol token not found for holding",
                    }
                    continue

                ltp_data = fetch_single_ltp(
                    exchange=exchange,
                    tradingsymbol=tradingsymbol,
                    symboltoken=symboltoken,
                )

                if not ltp_data:
                    results[holding_symbol] = {
                        "status": False,
                        "symbol": holding_symbol,
                        "symboltoken": symboltoken,
                        "error": "No LTP data returned",
                    }
                    continue

                quantity = safe_int(getattr(holding, "quantity", 0))
                avg_price = safe_float(getattr(holding, "avg_price", 0))
                ltp = safe_float(ltp_data["ltp"])

                invested_value = quantity * avg_price
                current_value = quantity * ltp
                pnl = current_value - invested_value

                results[holding_symbol] = {
                    "status": True,
                    "symbol": holding_symbol,
                    "exchange": exchange,
                    "tradingsymbol": tradingsymbol,
                    "symboltoken": symboltoken,
                    "quantity": quantity,
                    "avg_price": avg_price,
                    "ltp": ltp,
                    "current_price": ltp,
                    "invested_value": invested_value,
                    "current_value": current_value,
                    "pnl": pnl,
                    "open": ltp_data["open"],
                    "high": ltp_data["high"],
                    "low": ltp_data["low"],
                    "close": ltp_data["close"],
                    "volume": ltp_data["volume"],
                    "timestamp": datetime.now(IST).isoformat(),
                }

            except Exception as error:
                print(f"Holding LTP fetch error for {holding.symbol}: {error}")

                results[str(getattr(holding, "symbol", "UNKNOWN"))] = {
                    "status": False,
                    "symbol": str(getattr(holding, "symbol", "UNKNOWN")),
                    "error": str(error),
                    "timestamp": datetime.now(IST).isoformat(),
                }

        return {
            "status": True,
            "data": results,
            "count": len(results),
            "timestamp": datetime.now(IST).isoformat(),
        }

    except Exception as error:
        print(f"Holdings LTP error: {error}")

        return {
            "status": False,
            "error": str(error),
            "data": {},
            "count": 0,
            "timestamp": datetime.now(IST).isoformat(),
        }
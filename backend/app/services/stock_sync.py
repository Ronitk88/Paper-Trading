import json
import urllib.request
from typing import Dict, List, Tuple

from sqlalchemy.orm import Session

from app.models.stock import Stock


ANGEL_ONE_SCRIP_MASTER_URL = (
    "https://margincalculator.angelbroking.com/"
    "OpenAPI_File/files/OpenAPIScripMaster.json"
)


def download_angel_one_master() -> List[Dict]:
    with urllib.request.urlopen(ANGEL_ONE_SCRIP_MASTER_URL, timeout=60) as response:
        data = response.read().decode("utf-8")

    return json.loads(data)


def is_equity_stock(item: Dict) -> bool:
    exchange = str(item.get("exch_seg", "")).upper().strip()
    instrument_type = str(item.get("instrumenttype", "")).upper().strip()
    symbol = str(item.get("symbol", "")).upper().strip()
    token = str(item.get("token", "")).strip()
    name = str(item.get("name", "")).strip()

    if exchange not in ["NSE", "BSE"]:
        return False

    if not symbol or not token or not name:
        return False

    # Exclude F&O, options, futures, commodities, currencies, indices etc.
    # Equity rows in the Angel master are usually blank or EQ-like instrument type.
    if instrument_type not in ["", "EQ"]:
        return False

    # Exclude obvious non-equity/index style names.
    blocked_words = [
        "NIFTY",
        "SENSEX",
        "BANKNIFTY",
        "FINNIFTY",
        "MIDCPNIFTY",
        "INDEX",
    ]

    if any(word in symbol for word in blocked_words):
        return False

    return True


def normalize_stock(item: Dict) -> Dict:
    return {
        "symbol": str(item.get("symbol", "")).strip().upper(),
        "name": str(item.get("name", "")).strip().upper(),
        "exchange": str(item.get("exch_seg", "")).strip().upper(),
        "token": str(item.get("token", "")).strip(),
    }


def sync_nse_bse_stocks(db: Session) -> Dict:
    master_data = download_angel_one_master()

    filtered_stocks = []

    seen: set[Tuple[str, str]] = set()

    for item in master_data:
        if not is_equity_stock(item):
            continue

        stock_data = normalize_stock(item)

        key = (
            stock_data["exchange"],
            stock_data["token"],
        )

        if key in seen:
            continue

        seen.add(key)
        filtered_stocks.append(stock_data)

    # Replace old NSE/BSE stock universe with fresh master data.
    db.query(Stock).filter(Stock.exchange.in_(["NSE", "BSE"])).delete(
        synchronize_session=False
    )

    batch = []

    for stock_data in filtered_stocks:
        batch.append(Stock(**stock_data))

        if len(batch) >= 1000:
            db.add_all(batch)
            db.flush()
            batch = []

    if batch:
        db.add_all(batch)

    db.commit()

    nse_count = len([s for s in filtered_stocks if s["exchange"] == "NSE"])
    bse_count = len([s for s in filtered_stocks if s["exchange"] == "BSE"])

    return {
        "message": "NSE/BSE stocks synced successfully",
        "total_stocks": len(filtered_stocks),
        "nse_count": nse_count,
        "bse_count": bse_count,
    }

def sync_nse_bse_stocks_if_needed(db: Session, minimum_count: int = 1000) -> Dict:
    current_count = db.query(Stock).count()

    if current_count >= minimum_count:
        return {
            "message": "Stock master already available",
            "synced": False,
            "current_count": current_count,
        }

    result = sync_nse_bse_stocks(db)

    return {
        **result,
        "synced": True,
    }
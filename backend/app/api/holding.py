from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.database import SessionLocal
from app.models.holding import Holding
from app.models.stock import Stock
from app.core.dependencies import get_current_user
from app.services.angelone import get_smart_api

router = APIRouter(
    prefix="/holdings",
    tags=["Holdings"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id
    return current_user


def build_holding_response(holding: Holding):
    quantity = int(holding.quantity or 0)
    avg_price = float(holding.avg_price or 0)
    current_price = float(holding.current_price or 0)

    invested_value = quantity * avg_price
    current_value = quantity * current_price
    pnl = current_value - invested_value

    return {
        "id": holding.id,
        "symbol": holding.symbol,
        "quantity": quantity,
        "avg_price": avg_price,
        "current_price": current_price,
        "invested_value": invested_value,
        "current_value": current_value,
        "pnl": pnl,
    }


def update_live_prices(user_id: int, db: Session):
    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == user_id)
        .all()
    )

    smart = get_smart_api()

    if not smart:
        return holdings

    for holding in holdings:
        try:
            stock = (
                db.query(Stock)
                .filter(func.upper(Stock.symbol) == str(holding.symbol).upper())
                .first()
            )

            if not stock:
                continue

            response = smart.ltpData(
                exchange=stock.exchange,
                tradingsymbol=stock.symbol,
                symboltoken=str(stock.token),
            )

            latest_price = response.get("data", {}).get("ltp")

            if latest_price is not None:
                holding.current_price = float(latest_price)

        except Exception as e:
            print(f"Failed to update live price for {holding.symbol}: {e}")

    db.commit()

    return holdings


@router.get("/")
def get_holdings(
    refresh_prices: bool = Query(False),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    if refresh_prices:
        holdings = update_live_prices(user_id, db)
    else:
        holdings = (
            db.query(Holding)
            .filter(Holding.user_id == user_id)
            .all()
        )

    return [build_holding_response(holding) for holding in holdings]


@router.get("/by-symbol/{symbol}")
def get_holding_by_symbol(
    symbol: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lightweight endpoint returning a single holding by symbol.

    Used by StockDetails to avoid fetching all holdings.
    """
    user_id = get_user_id(current_user)

    clean_symbol = symbol.strip().upper()

    holding = (
        db.query(Holding)
        .filter(
            Holding.user_id == user_id,
            func.upper(Holding.symbol) == clean_symbol,
        )
        .first()
    )

    if not holding:
        return {"holding": None}

    return {"holding": build_holding_response(holding)}


@router.post("/refresh-prices")
def refresh_holding_prices(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    holdings = update_live_prices(user_id, db)

    return {
        "message": "Holding prices refreshed",
        "holdings": [build_holding_response(holding) for holding in holdings],
    }
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.transaction import Transaction


router = APIRouter(
    prefix="/analytics-extra",
    tags=["Analytics Extra"],
)

DEFAULT_CASH_BALANCE = 1000000


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id

    return current_user


@router.get("/equity-curve")
def get_equity_curve(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.created_at.asc(), Transaction.id.asc())
        .all()
    )

    cash = float(DEFAULT_CASH_BALANCE)
    holdings = {}
    points = []

    points.append(
        {
            "label": "Start",
            "cash": cash,
            "holdings_value": 0,
            "total_value": cash,
            "pnl": 0,
            "event": "Initial Capital",
        }
    )

    for tx in transactions:
        symbol = tx.symbol
        quantity = int(tx.quantity or 0)
        price = float(tx.price or 0)
        value = quantity * price

        if tx.transaction_type == "BUY":
            cash -= value

            if symbol not in holdings:
                holdings[symbol] = {
                    "quantity": 0,
                    "last_price": price,
                }

            holdings[symbol]["quantity"] += quantity
            holdings[symbol]["last_price"] = price

        elif tx.transaction_type == "SELL":
            cash += value

            if symbol not in holdings:
                holdings[symbol] = {
                    "quantity": 0,
                    "last_price": price,
                }

            holdings[symbol]["quantity"] -= quantity
            holdings[symbol]["last_price"] = price

            if holdings[symbol]["quantity"] <= 0:
                holdings.pop(symbol, None)

        holdings_value = sum(
            float(item["quantity"]) * float(item["last_price"])
            for item in holdings.values()
        )

        total_value = cash + holdings_value

        points.append(
            {
                "label": (
                    tx.created_at.strftime("%d %b %H:%M")
                    if tx.created_at
                    else f"Trade {tx.id}"
                ),
                "transaction_id": tx.id,
                "symbol": symbol,
                "type": tx.transaction_type,
                "cash": round(cash, 2),
                "holdings_value": round(holdings_value, 2),
                "total_value": round(total_value, 2),
                "pnl": round(total_value - DEFAULT_CASH_BALANCE, 2),
                "event": f"{tx.transaction_type} {quantity} {symbol}",
            }
        )

    return {
        "starting_capital": DEFAULT_CASH_BALANCE,
        "points": points,
        "count": len(points),
    }
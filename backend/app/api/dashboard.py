from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.holding import Holding
from app.models.order import Order
from app.models.portfolio import Portfolio
from app.models.transaction import Transaction
from utils.market_hours import get_market_status


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)

DEFAULT_CASH_BALANCE = 1000000


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id

    return current_user


@router.get("/summary")
def get_dashboard_summary(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Single endpoint returning all dashboard data in one response.

    Replaces 5 separate calls (portfolio, holdings, transactions, orders, market status).
    """
    user_id = get_user_id(current_user)

    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user_id)
        .first()
    )

    if not portfolio:
        portfolio = Portfolio(
            user_id=user_id,
            cash_balance=DEFAULT_CASH_BALANCE,
            total_value=DEFAULT_CASH_BALANCE,
            total_pnl=0,
        )
        db.add(portfolio)
        db.flush()

    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == user_id)
        .all()
    )

    invested_value = sum(
        int(h.quantity or 0) * float(h.avg_price or 0)
        for h in holdings
    )

    current_holdings_value = sum(
        int(h.quantity or 0) * float(h.current_price or 0)
        for h in holdings
    )

    total_pnl = current_holdings_value - invested_value
    total_value = float(portfolio.cash_balance or 0) + current_holdings_value

    # Only return the 8 most recent transactions
    recent_transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.id.desc())
        .limit(8)
        .all()
    )

    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .all()
    )

    order_summary = {
        "total_orders": len(orders),
        "executed_orders": len([o for o in orders if o.status == "EXECUTED"]),
        "pending_orders": len([o for o in orders if o.status == "PENDING"]),
        "cancelled_orders": len([o for o in orders if o.status == "CANCELLED"]),
        "rejected_orders": len([o for o in orders if o.status == "REJECTED"]),
    }

    market_status = get_market_status()

    return {
        "portfolio": {
            "cash_balance": float(portfolio.cash_balance or 0),
            "invested_value": invested_value,
            "current_holdings_value": current_holdings_value,
            "total_value": total_value,
            "total_pnl": total_pnl,
            "total_holdings": len(holdings),
        },
        "holdings": [
            {
                "id": h.id,
                "symbol": h.symbol,
                "quantity": int(h.quantity or 0),
                "avg_price": float(h.avg_price or 0),
                "current_price": float(h.current_price or 0),
                "pnl": (
                    float(h.current_price or 0) - float(h.avg_price or 0)
                ) * int(h.quantity or 0),
            }
            for h in holdings
        ],
        "recent_transactions": [
            {
                "id": tx.id,
                "symbol": tx.symbol,
                "transaction_type": tx.transaction_type,
                "quantity": int(tx.quantity or 0),
                "price": float(tx.price or 0),
                "created_at": (
                    tx.created_at.isoformat()
                    if hasattr(tx, "created_at") and tx.created_at
                    else None
                ),
            }
            for tx in recent_transactions
        ],
        "order_summary": order_summary,
        "market_status": {
            "is_open": market_status.get("is_open", False),
            "status": market_status.get("status", "UNKNOWN"),
            "reason": market_status.get("reason", ""),
            "current_time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        },
    }
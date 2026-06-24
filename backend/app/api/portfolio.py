from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.portfolio import Portfolio
from app.models.holding import Holding
from app.models.transaction import Transaction
from app.models.order import Order
from app.core.dependencies import get_current_user

router = APIRouter(
    prefix="/portfolio",
    tags=["Portfolio"],
)

DEFAULT_CASH_BALANCE = 1000000


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


@router.get("/")
def get_portfolio(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user_id)
        .first()
    )

    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == user_id)
        .all()
    )

    if not portfolio:
        portfolio = Portfolio(
            user_id=user_id,
            cash_balance=DEFAULT_CASH_BALANCE,
            total_value=DEFAULT_CASH_BALANCE,
            total_pnl=0,
        )
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)

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

    portfolio.total_value = total_value
    portfolio.total_pnl = total_pnl

    db.commit()

    return {
        "cash_balance": float(portfolio.cash_balance or 0),
        "invested_value": invested_value,
        "current_holdings_value": current_holdings_value,
        "total_value": total_value,
        "total_pnl": total_pnl,
        "total_holdings": len(holdings),
    }


@router.get("/cash")
def get_portfolio_cash(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lightweight endpoint returning only cash balance.

    Used by StockDetails to avoid fetching the full portfolio.
    """
    user_id = get_user_id(current_user)

    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user_id)
        .first()
    )

    if not portfolio:
        return {"cash_balance": DEFAULT_CASH_BALANCE}

    return {"cash_balance": float(portfolio.cash_balance or 0)}


@router.post("/reset")
def reset_portfolio(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    db.query(Holding).filter(Holding.user_id == user_id).delete(
        synchronize_session=False
    )

    db.query(Transaction).filter(Transaction.user_id == user_id).delete(
        synchronize_session=False
    )

    db.query(Order).filter(Order.user_id == user_id).delete(
        synchronize_session=False
    )

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
    else:
        portfolio.cash_balance = DEFAULT_CASH_BALANCE
        portfolio.total_value = DEFAULT_CASH_BALANCE
        portfolio.total_pnl = 0

    db.commit()

    return {
        "message": "Portfolio reset successfully",
        "cash_balance": DEFAULT_CASH_BALANCE,
        "total_value": DEFAULT_CASH_BALANCE,
        "total_pnl": 0,
    }
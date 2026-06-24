import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.holding import Holding
from app.models.order import Order
from app.models.portfolio import Portfolio
from app.models.stock import Stock
from app.models.transaction import Transaction
from app.models.user import User
from app.models.watchlist import Watchlist


router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
)


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id

    return current_user


def require_admin(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    admin_emails = [
        item.strip().lower()
        for item in os.getenv("ADMIN_EMAILS", "").split(",")
        if item.strip()
    ]

    if not admin_emails:
        raise HTTPException(
            status_code=403,
            detail="Admin access is not configured. Add ADMIN_EMAILS in .env.",
        )

    if not user.email or user.email.lower() not in admin_emails:
        raise HTTPException(
            status_code=403,
            detail="Admin access denied",
        )

    return user


@router.get("/summary")
def get_admin_summary(
    admin_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    total_users = db.query(User).count()
    total_stocks = db.query(Stock).count()
    total_orders = db.query(Order).count()
    total_transactions = db.query(Transaction).count()
    total_holdings = db.query(Holding).count()
    total_watchlist_items = db.query(Watchlist).count()

    executed_orders = (
        db.query(Order)
        .filter(Order.status == "EXECUTED")
        .count()
    )

    pending_orders = (
        db.query(Order)
        .filter(Order.status == "PENDING")
        .count()
    )

    rejected_orders = (
        db.query(Order)
        .filter(Order.status == "REJECTED")
        .count()
    )

    cancelled_orders = (
        db.query(Order)
        .filter(Order.status == "CANCELLED")
        .count()
    )

    portfolios = db.query(Portfolio).all()

    total_virtual_cash = sum(
        float(item.cash_balance or 0)
        for item in portfolios
    )

    total_platform_value = sum(
        float(item.total_value or 0)
        for item in portfolios
    )

    total_platform_pnl = sum(
        float(item.total_pnl or 0)
        for item in portfolios
    )

    return {
        "admin": {
            "id": admin_user.id,
            "username": admin_user.username,
            "email": admin_user.email,
        },
        "users": {
            "total_users": total_users,
        },
        "stocks": {
            "total_stocks": total_stocks,
        },
        "orders": {
            "total_orders": total_orders,
            "executed_orders": executed_orders,
            "pending_orders": pending_orders,
            "rejected_orders": rejected_orders,
            "cancelled_orders": cancelled_orders,
        },
        "activity": {
            "total_transactions": total_transactions,
            "total_holdings": total_holdings,
            "total_watchlist_items": total_watchlist_items,
        },
        "platform_value": {
            "total_virtual_cash": total_virtual_cash,
            "total_platform_value": total_platform_value,
            "total_platform_pnl": total_platform_pnl,
        },
        "status": "healthy",
    }


@router.get("/users")
def get_admin_users(
    admin_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .order_by(User.id.desc())
        .limit(100)
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "phone": getattr(user, "phone", None),
        }
        for user in users
    ]
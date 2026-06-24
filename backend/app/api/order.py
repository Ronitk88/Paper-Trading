from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import SessionLocal
from app.models.holding import Holding
from app.models.order import Order
from app.models.portfolio import Portfolio
from app.models.stock import Stock
from app.models.transaction import Transaction
from app.schemas.order import OrderResponse
from app.services.angelone import get_smart_api
from utils.market_hours import get_market_status


router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
)

DEFAULT_CASH_BALANCE = 1000000

PENDING_PROCESS_ORDER_TYPES = ["LIMIT", "STOP_LOSS", "TARGET"]


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


def get_or_create_portfolio(user_id: int, db: Session):
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

    return portfolio


def recalculate_portfolio(
    portfolio: Portfolio,
    user_id: int,
    db: Session,
):
    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == user_id)
        .all()
    )

    holdings_value = sum(
        float(h.quantity or 0) * float(h.current_price or 0)
        for h in holdings
    )

    total_pnl = sum(
        (float(h.current_price or 0) - float(h.avg_price or 0))
        * float(h.quantity or 0)
        for h in holdings
    )

    portfolio.total_value = float(portfolio.cash_balance or 0) + holdings_value
    portfolio.total_pnl = total_pnl


def get_live_ltp(order: Order, db: Session):
    stock = (
        db.query(Stock)
        .filter(func.upper(Stock.symbol) == str(order.symbol).upper())
        .first()
    )

    if not stock:
        return None

    smart = get_smart_api()

    response = smart.ltpData(
        exchange=stock.exchange,
        tradingsymbol=stock.symbol,
        symboltoken=str(stock.token),
    )

    return response.get("data", {}).get("ltp")


def execute_pending_buy(
    order: Order,
    user_id: int,
    execution_price: float,
    db: Session,
):
    portfolio = get_or_create_portfolio(user_id, db)

    cost = int(order.quantity or 0) * execution_price

    if float(portfolio.cash_balance or 0) < cost:
        order.status = "REJECTED"
        order.rejection_reason = "Insufficient funds during pending execution"

        return "REJECTED"

    portfolio.cash_balance = float(portfolio.cash_balance or 0) - cost

    holding = (
        db.query(Holding)
        .filter(
            Holding.user_id == user_id,
            Holding.symbol == order.symbol,
        )
        .first()
    )

    if holding:
        old_quantity = int(holding.quantity or 0)
        old_avg_price = float(holding.avg_price or 0)

        new_quantity = old_quantity + int(order.quantity or 0)

        holding.avg_price = (
            (old_quantity * old_avg_price) + cost
        ) / new_quantity

        holding.quantity = new_quantity
        holding.current_price = execution_price

    else:
        holding = Holding(
            user_id=user_id,
            symbol=order.symbol,
            quantity=order.quantity,
            avg_price=execution_price,
            current_price=execution_price,
        )

        db.add(holding)

    transaction = Transaction(
        user_id=user_id,
        symbol=order.symbol,
        transaction_type="BUY",
        quantity=order.quantity,
        price=execution_price,
    )

    db.add(transaction)

    order.status = "EXECUTED"
    order.executed_price = execution_price
    order.executed_at = datetime.now(timezone.utc)

    recalculate_portfolio(portfolio, user_id, db)

    return "EXECUTED"


def execute_pending_sell(
    order: Order,
    user_id: int,
    execution_price: float,
    db: Session,
):
    holding = (
        db.query(Holding)
        .filter(
            Holding.user_id == user_id,
            Holding.symbol == order.symbol,
        )
        .first()
    )

    if not holding:
        order.status = "REJECTED"
        order.rejection_reason = "Stock not owned during pending execution"

        return "REJECTED"

    if int(holding.quantity or 0) < int(order.quantity or 0):
        order.status = "REJECTED"
        order.rejection_reason = "Not enough shares during pending execution"

        return "REJECTED"

    portfolio = get_or_create_portfolio(user_id, db)

    proceeds = int(order.quantity or 0) * execution_price

    portfolio.cash_balance = float(portfolio.cash_balance or 0) + proceeds

    holding.quantity = int(holding.quantity or 0) - int(order.quantity or 0)
    holding.current_price = execution_price

    if int(holding.quantity or 0) == 0:
        db.delete(holding)

    transaction = Transaction(
        user_id=user_id,
        symbol=order.symbol,
        transaction_type="SELL",
        quantity=order.quantity,
        price=execution_price,
    )

    db.add(transaction)

    order.status = "EXECUTED"
    order.executed_price = execution_price
    order.executed_at = datetime.now(timezone.utc)

    recalculate_portfolio(portfolio, user_id, db)

    return "EXECUTED"


def should_execute_pending_order(order: Order, ltp: float):
    trigger_price = float(order.price or 0)
    order_type = str(order.order_type or "").upper()
    side = str(order.side or "").upper()

    if order_type == "LIMIT":
        if side == "BUY":
            return ltp <= trigger_price

        if side == "SELL":
            return ltp >= trigger_price

    if order_type == "STOP_LOSS" and side == "SELL":
        return ltp <= trigger_price

    if order_type == "TARGET" and side == "SELL":
        return ltp >= trigger_price

    return False


@router.get("/", response_model=list[OrderResponse])
def get_orders(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.id.desc())
        .all()
    )


@router.get("/paginated")
def get_orders_paginated(
    page: int = 1,
    limit: int = 20,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    skip = (page - 1) * limit

    query = (
        db.query(Order)
        .filter(Order.user_id == user_id)
    )

    total = query.count()

    items = (
        query
        .order_by(Order.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit,
    }


@router.get("/summary")
def get_orders_summary(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .all()
    )

    return {
        "total_orders": len(orders),
        "executed_orders": len([o for o in orders if o.status == "EXECUTED"]),
        "pending_orders": len([o for o in orders if o.status == "PENDING"]),
        "cancelled_orders": len([o for o in orders if o.status == "CANCELLED"]),
        "rejected_orders": len([o for o in orders if o.status == "REJECTED"]),
    }


@router.post("/process-pending")
def process_pending_orders(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    pending_orders = (
        db.query(Order)
        .filter(
            Order.user_id == user_id,
            Order.status == "PENDING",
            Order.order_type.in_(PENDING_PROCESS_ORDER_TYPES),
        )
        .order_by(Order.id.asc())
        .all()
    )

    market_status = get_market_status()

    if not market_status["is_open"]:
        return {
            "message": market_status.get(
                "reason",
                "Market is closed. Pending orders were not processed.",
            ),
            "market_status": market_status.get("status", "CLOSED"),
            "checked": 0,
            "executed": 0,
            "rejected": 0,
            "still_pending": len(pending_orders),
            "results": [
                {
                    "order_id": order.id,
                    "symbol": order.symbol,
                    "order_type": order.order_type,
                    "status": "PENDING",
                    "reason": "Market closed. Order kept pending for next market session.",
                }
                for order in pending_orders
            ],
        }

    executed = 0
    rejected = 0
    still_pending = 0
    checked = 0

    results = []

    for order in pending_orders:
        checked += 1

        try:
            ltp = get_live_ltp(order, db)

            if ltp is None:
                still_pending += 1
                results.append(
                    {
                        "order_id": order.id,
                        "symbol": order.symbol,
                        "order_type": order.order_type,
                        "status": "PENDING",
                        "reason": "LTP unavailable",
                    }
                )
                continue

            ltp = float(ltp)
            trigger_price = float(order.price or 0)

            if not should_execute_pending_order(order, ltp):
                still_pending += 1
                results.append(
                    {
                        "order_id": order.id,
                        "symbol": order.symbol,
                        "order_type": order.order_type,
                        "status": "PENDING",
                        "ltp": ltp,
                        "trigger_price": trigger_price,
                    }
                )
                continue

            if order.side == "BUY":
                status = execute_pending_buy(
                    order=order,
                    user_id=user_id,
                    execution_price=ltp,
                    db=db,
                )
            else:
                status = execute_pending_sell(
                    order=order,
                    user_id=user_id,
                    execution_price=ltp,
                    db=db,
                )

            if status == "EXECUTED":
                executed += 1
            elif status == "REJECTED":
                rejected += 1

            results.append(
                {
                    "order_id": order.id,
                    "symbol": order.symbol,
                    "order_type": order.order_type,
                    "status": order.status,
                    "executed_price": order.executed_price,
                    "trigger_price": trigger_price,
                    "ltp": ltp,
                }
            )

        except Exception as e:
            still_pending += 1
            results.append(
                {
                    "order_id": order.id,
                    "symbol": order.symbol,
                    "order_type": order.order_type,
                    "status": "PENDING",
                    "reason": str(e),
                }
            )

    db.commit()

    return {
        "message": "Pending orders processed",
        "market_status": market_status.get("status", "OPEN"),
        "checked": checked,
        "executed": executed,
        "rejected": rejected,
        "still_pending": still_pending,
        "results": results,
    }


@router.post("/{order_id}/cancel")
def cancel_order(
    order_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    order = (
        db.query(Order)
        .filter(
            Order.id == order_id,
            Order.user_id == user_id,
        )
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status != "PENDING":
        raise HTTPException(
            status_code=400,
            detail="Only pending orders can be cancelled",
        )

    order.status = "CANCELLED"
    db.commit()

    return {
        "message": "Order cancelled successfully",
        "order_id": order.id,
        "status": order.status,
    }

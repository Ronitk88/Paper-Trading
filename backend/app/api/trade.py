from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import SessionLocal
from app.models.holding import Holding
from app.models.order import Order
from app.models.portfolio import Portfolio
from app.models.transaction import Transaction
from app.schemas.trade import TradeCreate
from utils.market_hours import get_market_status


router = APIRouter(
    prefix="/trade",
    tags=["Trade"],
)

DEFAULT_CASH_BALANCE = 1000000

BUY_ORDER_TYPES = ["MARKET", "LIMIT"]
SELL_ORDER_TYPES = ["MARKET", "LIMIT", "STOP_LOSS", "TARGET"]


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

    if portfolio is None:
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


def reject_order(order: Order, reason: str, db: Session):
    order.status = "REJECTED"
    order.rejection_reason = reason
    order.executed_price = None
    order.executed_at = None

    db.commit()
    db.refresh(order)


def reject_if_market_closed(order: Order, db: Session):
    market_status = get_market_status()

    if market_status["is_open"]:
        return

    reason = market_status.get(
        "reason",
        "Market is closed. Trading is allowed only during market hours.",
    )

    reject_order(order, reason, db)

    raise HTTPException(
        status_code=400,
        detail=reason,
    )


def validate_trade(
    side: str,
    symbol: str,
    quantity: int,
    price: float,
    order_type: str,
):
    if not symbol:
        raise HTTPException(
            status_code=400,
            detail="Symbol is required",
        )

    if quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be greater than 0",
        )

    if price <= 0:
        raise HTTPException(
            status_code=400,
            detail="Price must be greater than 0",
        )

    if side == "BUY" and order_type not in BUY_ORDER_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Buy order type must be MARKET or LIMIT",
        )

    if side == "SELL" and order_type not in SELL_ORDER_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Sell order type must be MARKET, LIMIT, STOP_LOSS, or TARGET"
            ),
        )


def should_execute_limit_order(
    side: str,
    limit_price: float,
    market_price: float,
):
    if side == "BUY":
        return market_price <= limit_price

    if side == "SELL":
        return market_price >= limit_price

    return False


def should_execute_exit_order(
    order_type: str,
    trigger_price: float,
    market_price: float,
):
    if order_type == "STOP_LOSS":
        return market_price <= trigger_price

    if order_type == "TARGET":
        return market_price >= trigger_price

    return False


def get_user_holding(
    user_id: int,
    symbol: str,
    db: Session,
):
    return (
        db.query(Holding)
        .filter(
            Holding.user_id == user_id,
            Holding.symbol == symbol,
        )
        .first()
    )


def validate_sell_holding(
    order: Order,
    user_id: int,
    symbol: str,
    quantity: int,
    db: Session,
):
    holding = get_user_holding(user_id, symbol, db)

    if holding is None:
        reject_order(order, "Stock not owned", db)

        raise HTTPException(
            status_code=400,
            detail="Stock not owned",
        )

    if int(holding.quantity or 0) < quantity:
        reject_order(order, "Not enough shares", db)

        raise HTTPException(
            status_code=400,
            detail="Not enough shares",
        )

    return holding


def execute_buy_order(
    order: Order,
    user_id: int,
    symbol: str,
    quantity: int,
    execution_price: float,
    db: Session,
):
    cost = quantity * execution_price

    portfolio = get_or_create_portfolio(user_id, db)

    if float(portfolio.cash_balance or 0) < cost:
        reject_order(order, "Insufficient funds", db)

        raise HTTPException(
            status_code=400,
            detail="Insufficient funds",
        )

    portfolio.cash_balance = float(portfolio.cash_balance or 0) - cost

    holding = get_user_holding(user_id, symbol, db)

    if holding:
        old_quantity = int(holding.quantity or 0)
        old_avg_price = float(holding.avg_price or 0)

        total_qty = old_quantity + quantity

        holding.avg_price = (
            (old_quantity * old_avg_price) + cost
        ) / total_qty

        holding.quantity = total_qty
        holding.current_price = execution_price

    else:
        holding = Holding(
            user_id=user_id,
            symbol=symbol,
            quantity=quantity,
            avg_price=execution_price,
            current_price=execution_price,
        )

        db.add(holding)

    transaction = Transaction(
        user_id=user_id,
        symbol=symbol,
        transaction_type="BUY",
        quantity=quantity,
        price=execution_price,
    )

    db.add(transaction)

    order.status = "EXECUTED"
    order.executed_price = execution_price
    order.executed_at = datetime.now(timezone.utc)

    recalculate_portfolio(portfolio, user_id, db)

    return portfolio


def execute_sell_order(
    order: Order,
    user_id: int,
    symbol: str,
    quantity: int,
    execution_price: float,
    db: Session,
):
    holding = validate_sell_holding(
        order=order,
        user_id=user_id,
        symbol=symbol,
        quantity=quantity,
        db=db,
    )

    portfolio = get_or_create_portfolio(user_id, db)

    proceeds = quantity * execution_price

    portfolio.cash_balance = float(portfolio.cash_balance or 0) + proceeds

    holding.quantity = int(holding.quantity or 0) - quantity
    holding.current_price = execution_price

    if holding.quantity == 0:
        db.delete(holding)

    transaction = Transaction(
        user_id=user_id,
        symbol=symbol,
        transaction_type="SELL",
        quantity=quantity,
        price=execution_price,
    )

    db.add(transaction)

    order.status = "EXECUTED"
    order.executed_price = execution_price
    order.executed_at = datetime.now(timezone.utc)

    recalculate_portfolio(portfolio, user_id, db)

    return portfolio


@router.post("/buy")
def buy_stock(
    trade: TradeCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    symbol = str(trade.symbol).strip().upper()
    quantity = int(trade.quantity)
    order_type = str(trade.order_type or "MARKET").upper()

    limit_or_order_price = float(trade.price)
    market_price = float(trade.market_price or trade.price)

    validate_trade(
        side="BUY",
        symbol=symbol,
        quantity=quantity,
        price=limit_or_order_price,
        order_type=order_type,
    )

    order = Order(
        user_id=user_id,
        symbol=symbol,
        side="BUY",
        order_type=order_type,
        quantity=quantity,
        price=limit_or_order_price,
        status="PENDING",
    )

    db.add(order)
    db.flush()

    reject_if_market_closed(order, db)

    if order_type == "LIMIT":
        if not should_execute_limit_order(
            side="BUY",
            limit_price=limit_or_order_price,
            market_price=market_price,
        ):
            db.commit()
            db.refresh(order)

            return {
                "message": "Limit buy order placed and is pending",
                "order_id": order.id,
                "status": order.status,
                "symbol": symbol,
                "quantity": quantity,
                "limit_price": limit_or_order_price,
                "market_price": market_price,
            }

    execution_price = market_price

    portfolio = execute_buy_order(
        order=order,
        user_id=user_id,
        symbol=symbol,
        quantity=quantity,
        execution_price=execution_price,
        db=db,
    )

    db.commit()
    db.refresh(order)
    db.refresh(portfolio)

    return {
        "message": "Buy order executed successfully",
        "order_id": order.id,
        "status": order.status,
        "symbol": symbol,
        "quantity": quantity,
        "price": execution_price,
        "cash_balance": portfolio.cash_balance,
        "total_value": portfolio.total_value,
        "total_pnl": portfolio.total_pnl,
    }


@router.post("/sell")
def sell_stock(
    trade: TradeCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    symbol = str(trade.symbol).strip().upper()
    quantity = int(trade.quantity)
    order_type = str(trade.order_type or "MARKET").upper()

    trigger_or_order_price = float(trade.price)
    market_price = float(trade.market_price or trade.price)

    validate_trade(
        side="SELL",
        symbol=symbol,
        quantity=quantity,
        price=trigger_or_order_price,
        order_type=order_type,
    )

    order = Order(
        user_id=user_id,
        symbol=symbol,
        side="SELL",
        order_type=order_type,
        quantity=quantity,
        price=trigger_or_order_price,
        status="PENDING",
    )

    db.add(order)
    db.flush()

    reject_if_market_closed(order, db)

    validate_sell_holding(
        order=order,
        user_id=user_id,
        symbol=symbol,
        quantity=quantity,
        db=db,
    )

    if order_type == "LIMIT":
        if not should_execute_limit_order(
            side="SELL",
            limit_price=trigger_or_order_price,
            market_price=market_price,
        ):
            db.commit()
            db.refresh(order)

            return {
                "message": "Limit sell order placed and is pending",
                "order_id": order.id,
                "status": order.status,
                "symbol": symbol,
                "quantity": quantity,
                "limit_price": trigger_or_order_price,
                "market_price": market_price,
            }

    if order_type in ["STOP_LOSS", "TARGET"]:
        if not should_execute_exit_order(
            order_type=order_type,
            trigger_price=trigger_or_order_price,
            market_price=market_price,
        ):
            db.commit()
            db.refresh(order)

            return {
                "message": (
                    "Stop-loss order placed and is pending"
                    if order_type == "STOP_LOSS"
                    else "Target order placed and is pending"
                ),
                "order_id": order.id,
                "status": order.status,
                "symbol": symbol,
                "quantity": quantity,
                "trigger_price": trigger_or_order_price,
                "market_price": market_price,
                "order_type": order_type,
            }

    execution_price = market_price

    portfolio = execute_sell_order(
        order=order,
        user_id=user_id,
        symbol=symbol,
        quantity=quantity,
        execution_price=execution_price,
        db=db,
    )

    db.commit()
    db.refresh(order)
    db.refresh(portfolio)

    return {
        "message": "Sell order executed successfully",
        "order_id": order.id,
        "status": order.status,
        "symbol": symbol,
        "quantity": quantity,
        "price": execution_price,
        "cash_balance": portfolio.cash_balance,
        "total_value": portfolio.total_value,
        "total_pnl": portfolio.total_pnl,
    }

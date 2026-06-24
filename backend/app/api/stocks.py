from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.db.database import get_db
from app.models.stock import Stock
from app.core.dependencies import get_current_user
from app.services.stock_sync import sync_nse_bse_stocks

router = APIRouter(
    prefix="/stocks",
    tags=["Stocks"],
)


@router.post("/sync")
def sync_stocks(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sync_nse_bse_stocks(db)


@router.get("/stats")
def get_stock_stats(
    db: Session = Depends(get_db),
):
    total = db.query(Stock).count()

    nse_count = (
        db.query(Stock)
        .filter(func.upper(Stock.exchange) == "NSE")
        .count()
    )

    bse_count = (
        db.query(Stock)
        .filter(func.upper(Stock.exchange) == "BSE")
        .count()
    )

    return {
        "total": total,
        "nse_count": nse_count,
        "bse_count": bse_count,
    }


@router.get("/")
def get_stocks(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    exchange: str = Query("ALL"),
    db: Session = Depends(get_db),
):
    query = db.query(Stock)

    clean_exchange = exchange.strip().upper()

    if clean_exchange in ["NSE", "BSE"]:
      query = query.filter(func.upper(Stock.exchange) == clean_exchange)

    return (
        query
        .order_by(Stock.exchange.asc(), Stock.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/search")
def search_stocks(
    q: str = Query(...),
    exchange: str = Query("ALL"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    clean_q = q.strip()
    clean_exchange = exchange.strip().upper()

    query = db.query(Stock)

    if clean_exchange in ["NSE", "BSE"]:
        query = query.filter(func.upper(Stock.exchange) == clean_exchange)

    query = query.filter(
        or_(
            Stock.symbol.ilike(f"%{clean_q}%"),
            Stock.name.ilike(f"%{clean_q}%"),
            Stock.token.ilike(f"%{clean_q}%"),
        )
    )

    return (
        query
        .order_by(Stock.exchange.asc(), Stock.name.asc())
        .limit(limit)
        .all()
    )

@router.get("/paginated")
def get_stocks_paginated(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    exchange: str = Query("ALL"),
    q: str = Query(""),
    db: Session = Depends(get_db),
):
    skip = (page - 1) * limit

    query = db.query(Stock)

    clean_exchange = exchange.strip().upper()
    clean_q = q.strip()

    if clean_exchange in ["NSE", "BSE"]:
        query = query.filter(func.upper(Stock.exchange) == clean_exchange)

    if clean_q:
        query = query.filter(
            or_(
                Stock.symbol.ilike(f"%{clean_q}%"),
                Stock.name.ilike(f"%{clean_q}%"),
                Stock.token.ilike(f"%{clean_q}%"),
            )
        )

    total = query.count()

    items = (
        query
        .order_by(Stock.exchange.asc(), Stock.name.asc())
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

@router.get("/{symbol}")
def get_stock_by_symbol(
    symbol: str,
    exchange: str = Query(""),
    db: Session = Depends(get_db),
):
    clean_symbol = symbol.strip().upper()
    clean_exchange = exchange.strip().upper()

    query = db.query(Stock).filter(
        func.upper(Stock.symbol) == clean_symbol
    )

    if clean_exchange in ["NSE", "BSE"]:
        query = query.filter(func.upper(Stock.exchange) == clean_exchange)

    stock = query.first()

    if stock is None:
        # Fallback: sometimes route receives company name instead of tradingsymbol.
        fallback_query = db.query(Stock).filter(
            func.upper(Stock.name) == clean_symbol
        )

        if clean_exchange in ["NSE", "BSE"]:
            fallback_query = fallback_query.filter(
                func.upper(Stock.exchange) == clean_exchange
            )

        stock = fallback_query.first()

    if stock is None:
        raise HTTPException(
            status_code=404,
            detail="Stock not found",
        )

    return stock
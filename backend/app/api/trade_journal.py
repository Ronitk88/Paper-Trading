from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.trade_journal import TradeJournal
from app.schemas.trade_journal import (
    TradeJournalCreate,
    TradeJournalResponse,
    TradeJournalUpdate,
)


router = APIRouter(
    prefix="/journal",
    tags=["Trading Journal"],
)


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id

    return current_user


@router.get("/", response_model=list[TradeJournalResponse])
def get_journal_entries(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return (
        db.query(TradeJournal)
        .filter(TradeJournal.user_id == user_id)
        .order_by(TradeJournal.id.desc())
        .all()
    )


@router.get("/paginated")
def get_journal_entries_paginated(
    page: int = 1,
    limit: int = 10,
    symbol: str = "",
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    page = max(page, 1)
    limit = max(min(limit, 100), 1)
    skip = (page - 1) * limit

    query = db.query(TradeJournal).filter(TradeJournal.user_id == user_id)

    if symbol.strip():
        query = query.filter(
            TradeJournal.symbol.ilike(f"%{symbol.strip()}%")
        )

    total = query.count()

    items = (
        query.order_by(TradeJournal.id.desc())
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


@router.post("/", response_model=TradeJournalResponse)
def create_journal_entry(
    payload: TradeJournalCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    symbol = payload.symbol.strip().upper()

    if not symbol:
        raise HTTPException(
            status_code=400,
            detail="Symbol is required",
        )

    entry = TradeJournal(
        user_id=user_id,
        symbol=symbol,
        trade_type=payload.trade_type.strip().upper() or "REVIEW",
        quantity=payload.quantity,
        entry_price=payload.entry_price,
        exit_price=payload.exit_price,
        reason=payload.reason,
        strategy=payload.strategy,
        mistake=payload.mistake,
        learning=payload.learning,
        mood=payload.mood,
        tags=payload.tags,
    )

    db.add(entry)
    db.commit()
    db.refresh(entry)

    return entry


@router.patch("/{entry_id}", response_model=TradeJournalResponse)
def update_journal_entry(
    entry_id: int,
    payload: TradeJournalUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    entry = (
        db.query(TradeJournal)
        .filter(
            TradeJournal.id == entry_id,
            TradeJournal.user_id == user_id,
        )
        .first()
    )

    if not entry:
        raise HTTPException(
            status_code=404,
            detail="Journal entry not found",
        )

    update_data = payload.model_dump(exclude_unset=True)

    if "symbol" in update_data and update_data["symbol"]:
        update_data["symbol"] = update_data["symbol"].strip().upper()

    if "trade_type" in update_data and update_data["trade_type"]:
        update_data["trade_type"] = update_data["trade_type"].strip().upper()

    for key, value in update_data.items():
        setattr(entry, key, value)

    db.commit()
    db.refresh(entry)

    return entry


@router.delete("/{entry_id}")
def delete_journal_entry(
    entry_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    entry = (
        db.query(TradeJournal)
        .filter(
            TradeJournal.id == entry_id,
            TradeJournal.user_id == user_id,
        )
        .first()
    )

    if not entry:
        raise HTTPException(
            status_code=404,
            detail="Journal entry not found",
        )

    db.delete(entry)
    db.commit()

    return {
        "message": "Journal entry deleted successfully",
        "entry_id": entry_id,
    }
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.watchlist import Watchlist
from app.core.dependencies import get_current_user

router = APIRouter(
    prefix="/watchlist",
    tags=["Watchlist"]
)


class WatchlistCreate(BaseModel):
    symbol: str


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
def get_watchlist(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = get_user_id(current_user)

    return (
        db.query(Watchlist)
        .filter(Watchlist.user_id == user_id)
        .order_by(Watchlist.id.desc())
        .all()
    )


@router.post("/")
def add_to_watchlist(
    payload: WatchlistCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = get_user_id(current_user)
    symbol = payload.symbol.strip().upper()

    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    existing = (
        db.query(Watchlist)
        .filter(
            Watchlist.user_id == user_id,
            Watchlist.symbol == symbol
        )
        .first()
    )

    if existing:
        return {
            "message": "Stock already exists in watchlist",
            "item": existing
        }

    item = Watchlist(
        user_id=user_id,
        symbol=symbol
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "message": "Stock added to watchlist",
        "item": item
    }


@router.delete("/{symbol}")
def remove_from_watchlist(
    symbol: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = get_user_id(current_user)
    clean_symbol = symbol.strip().upper()

    item = (
        db.query(Watchlist)
        .filter(
            Watchlist.user_id == user_id,
            Watchlist.symbol == clean_symbol
        )
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="Stock not found in watchlist")

    db.delete(item)
    db.commit()

    return {
        "message": "Stock removed from watchlist"
    }
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionResponse
from app.core.dependencies import get_current_user

router = APIRouter(
    prefix="/transactions",
    tags=["Transactions"]
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

@router.get("/paginated")
def get_transactions_paginated(
    page: int = 1,
    limit: int = 20,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    skip = (page - 1) * limit

    query = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
    )

    total = query.count()

    items = (
        query
        .order_by(Transaction.id.desc())
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

@router.get("/", response_model=list[TransactionResponse])
def get_transactions(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = get_user_id(current_user)

    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.id.desc())
        .all()
    )

    return transactions
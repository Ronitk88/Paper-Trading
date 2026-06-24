from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TradeJournalCreate(BaseModel):
    symbol: str
    trade_type: str = "REVIEW"

    quantity: Optional[int] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None

    reason: Optional[str] = None
    strategy: Optional[str] = None
    mistake: Optional[str] = None
    learning: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[str] = None


class TradeJournalUpdate(BaseModel):
    symbol: Optional[str] = None
    trade_type: Optional[str] = None

    quantity: Optional[int] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None

    reason: Optional[str] = None
    strategy: Optional[str] = None
    mistake: Optional[str] = None
    learning: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[str] = None


class TradeJournalResponse(BaseModel):
    id: int
    user_id: int
    symbol: str
    trade_type: str

    quantity: Optional[int] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None

    reason: Optional[str] = None
    strategy: Optional[str] = None
    mistake: Optional[str] = None
    learning: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
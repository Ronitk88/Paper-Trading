from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.database import Base


class TradeJournal(Base):
    __tablename__ = "trade_journals"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    symbol = Column(String, nullable=False, index=True)
    trade_type = Column(String, nullable=False)  # BUY / SELL / REVIEW

    quantity = Column(Integer, nullable=True)
    entry_price = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)

    reason = Column(Text, nullable=True)
    strategy = Column(Text, nullable=True)
    mistake = Column(Text, nullable=True)
    learning = Column(Text, nullable=True)
    mood = Column(String, nullable=True)
    tags = Column(String, nullable=True)

    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
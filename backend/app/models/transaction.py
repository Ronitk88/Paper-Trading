from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from datetime import datetime, timezone

from app.db.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
    )

    symbol = Column(String)

    transaction_type = Column(String)

    quantity = Column(Integer)

    price = Column(Float)

    created_at = Column(
        DateTime,
        default=utc_now,
    )
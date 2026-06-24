from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from datetime import datetime, timezone

from app.db.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    symbol = Column(String, nullable=False)

    side = Column(String, nullable=False)

    order_type = Column(String, nullable=False, default="MARKET")

    quantity = Column(Integer, nullable=False)

    price = Column(Float, nullable=False)

    status = Column(String, nullable=False, default="PENDING")

    executed_price = Column(Float, nullable=True)

    rejection_reason = Column(String, nullable=True)

    created_at = Column(DateTime, default=utc_now)

    executed_at = Column(DateTime, nullable=True)
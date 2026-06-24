from sqlalchemy import Column, Integer, Float, String, ForeignKey
from app.db.database import Base


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    symbol = Column(String, nullable=False)

    quantity = Column(Integer, nullable=False, default=0)

    avg_price = Column(Float, nullable=False, default=0)

    current_price = Column(Float, nullable=False, default=0)
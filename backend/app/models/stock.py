from sqlalchemy import Column, Integer, String
from app.db.database import Base


class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, index=True)

    # Angel One tradingsymbol, example: RELIANCE-EQ
    symbol = Column(String, index=True, nullable=False)

    # Company / instrument name, example: RELIANCE
    name = Column(String, index=True)

    # NSE / BSE
    exchange = Column(String, index=True, nullable=False)

    # Angel One symbol token
    token = Column(String, index=True, nullable=False)
from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import Float
from sqlalchemy import ForeignKey

from app.db.database import Base


class Portfolio(Base):

    __tablename__ = "portfolios"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True
    )

    cash_balance = Column(
        Float,
        default=100000
    )

    total_value = Column(
        Float,
        default=100000
    )

    total_pnl = Column(
        Float,
        default=0
    )
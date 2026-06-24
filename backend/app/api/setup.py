from fastapi import APIRouter
from sqlalchemy.orm import Session
from fastapi import Depends

from app.db.database import get_db

from app.models.portfolio import Portfolio

router = APIRouter(
    prefix="/setup",
    tags=["Setup"]
)


@router.post("/portfolio")
def create_portfolio(
    db: Session = Depends(get_db)
):

    portfolio = Portfolio(
        cash_balance=100000,
        total_value=100000,
        total_pnl=0
    )

    db.add(portfolio)

    db.commit()

    db.refresh(portfolio)

    return portfolio
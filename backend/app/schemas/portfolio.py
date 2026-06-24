from pydantic import BaseModel


class PortfolioResponse(BaseModel):
    cash_balance: float
    total_value: float
    total_pnl: float

    class Config:
        from_attributes = True
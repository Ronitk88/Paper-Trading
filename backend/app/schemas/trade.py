from typing import Optional

from pydantic import BaseModel


class TradeCreate(BaseModel):
    symbol: str
    quantity: int
    price: float
    order_type: str = "MARKET"
    market_price: Optional[float] = None

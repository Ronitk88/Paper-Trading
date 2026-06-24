from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class OrderResponse(BaseModel):
    id: int
    symbol: str
    side: str
    order_type: str
    quantity: int
    price: float
    status: str
    executed_price: Optional[float] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    executed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        orm_mode = True
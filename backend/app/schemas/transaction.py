from pydantic import BaseModel
from datetime import datetime


class TransactionResponse(BaseModel):
    id: int
    symbol: str
    transaction_type: str
    quantity: int
    price: float
    created_at: datetime

    class Config:
        from_attributes = True
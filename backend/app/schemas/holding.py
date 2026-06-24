from pydantic import BaseModel


class HoldingResponse(BaseModel):
    id: int
    symbol: str
    quantity: int
    avg_price: float
    current_price: float

    class Config:
        from_attributes = True
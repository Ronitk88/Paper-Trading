from pydantic import BaseModel


class ServicePreferenceUpdate(BaseModel):
    order_alerts: bool | None = None
    rejected_order_alerts: bool | None = None
    portfolio_alerts: bool | None = None
    price_alerts: bool | None = None
    daily_summary: bool | None = None
    risk_warnings: bool | None = None
    email_notifications: bool | None = None
    sound_alerts: bool | None = None


class ServicePreferenceResponse(BaseModel):
    id: int
    user_id: int
    order_alerts: bool
    rejected_order_alerts: bool
    portfolio_alerts: bool
    price_alerts: bool
    daily_summary: bool
    risk_warnings: bool
    email_notifications: bool
    sound_alerts: bool

    class Config:
        from_attributes = True
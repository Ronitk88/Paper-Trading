from sqlalchemy import Column, Integer, Boolean, ForeignKey
from app.db.database import Base


class ServicePreference(Base):
    __tablename__ = "service_preferences"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
    )

    order_alerts = Column(Boolean, default=True)
    rejected_order_alerts = Column(Boolean, default=True)
    portfolio_alerts = Column(Boolean, default=True)
    price_alerts = Column(Boolean, default=True)
    daily_summary = Column(Boolean, default=True)
    risk_warnings = Column(Boolean, default=True)
    email_notifications = Column(Boolean, default=False)
    sound_alerts = Column(Boolean, default=True)
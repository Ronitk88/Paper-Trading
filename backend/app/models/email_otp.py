from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime, timezone

from app.db.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class EmailOTP(Base):
    __tablename__ = "email_otps"

    id = Column(Integer, primary_key=True, index=True)

    email = Column(String, index=True, nullable=False)

    otp_code = Column(String, nullable=False)

    purpose = Column(String, default="AUTH")

    is_used = Column(Boolean, default=False)

    created_at = Column(DateTime, default=utc_now)

    expires_at = Column(DateTime, nullable=False)
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from datetime import datetime, timezone, timedelta

from app.db.database import Base


def utc_now():
    return datetime.now(timezone.utc)


def default_expiry():
    return datetime.now(timezone.utc) + timedelta(minutes=30)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    email = Column(String, nullable=False, index=True)

    token = Column(String, nullable=False, unique=True, index=True)

    is_used = Column(Boolean, default=False)

    created_at = Column(DateTime, default=utc_now)

    expires_at = Column(DateTime, default=default_expiry)
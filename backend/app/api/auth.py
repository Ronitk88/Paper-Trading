from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH)

import os
import os
import uuid
import secrets
import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.db.database import SessionLocal
from app.models.user import User
from app.models.portfolio import Portfolio
from app.models.password_reset import PasswordResetToken

from app.schemas.user import (
    UserCreate,
    UserLogin,
    GoogleLogin,
    UserProfileUpdate,
    PasswordChange,
)

from app.core.security import hash_password, verify_password
from app.core.jwt_handler import create_access_token
from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

DEFAULT_CASH_BALANCE = 1000000


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id

    return current_user


def clean_email(email):
    if not email:
        return None

    value = str(email).strip().lower()

    return value if value else None


def clean_phone(phone):
    if not phone:
        return None

    value = str(phone).strip().replace(" ", "")

    return value if value else None


def create_default_portfolio_if_missing(user_id: int, db: Session):
    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user_id)
        .first()
    )

    if portfolio:
        return portfolio

    portfolio = Portfolio(
        user_id=user_id,
        cash_balance=DEFAULT_CASH_BALANCE,
        total_value=DEFAULT_CASH_BALANCE,
        total_pnl=0,
    )

    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)

    return portfolio


def generate_unique_username(base_name: str, db: Session):
    clean_name = str(base_name or "Google User").strip()

    if not clean_name:
        clean_name = "Google User"

    username = clean_name

    existing = (
        db.query(User)
        .filter(User.username == username)
        .first()
    )

    if not existing:
        return username

    for _ in range(20):
        suffix = str(uuid.uuid4())[:6]
        username = f"{clean_name}-{suffix}"

        existing = (
            db.query(User)
            .filter(User.username == username)
            .first()
        )

        if not existing:
            return username

    return f"Google User-{str(uuid.uuid4())[:8]}"


def send_password_reset_email(to_email: str, reset_link: str):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    smtp_user = (
        os.getenv("SMTP_USER")
        or os.getenv("EMAIL_USER")
        or os.getenv("GMAIL_USER")
        or os.getenv("SMTP_EMAIL")
    )

    smtp_password = (
        os.getenv("SMTP_PASSWORD")
        or os.getenv("EMAIL_PASSWORD")
        or os.getenv("GMAIL_APP_PASSWORD")
        or os.getenv("GMAIL_PASSWORD")
    )

    smtp_from_email = (
        os.getenv("SMTP_FROM_EMAIL")
        or os.getenv("FROM_EMAIL")
        or smtp_user
    )

    if smtp_host:
        smtp_host = smtp_host.strip()

    if smtp_user:
        smtp_user = smtp_user.strip()

    if smtp_from_email:
        smtp_from_email = smtp_from_email.strip()

    if smtp_password:
        smtp_password = smtp_password.strip().replace(" ", "")

    missing = []

    if not smtp_host:
        missing.append("SMTP_HOST")

    if not smtp_user:
        missing.append("SMTP_USER")

    if not smtp_password:
        missing.append("SMTP_PASSWORD")

    if not smtp_from_email:
        missing.append("SMTP_FROM_EMAIL")

    if missing:
        raise Exception(
            f"Missing SMTP env values: {', '.join(missing)}. "
            f"Loaded env path: {ENV_PATH}. "
            f"Env file exists: {ENV_PATH.exists()}"
        )

    message = EmailMessage()

    message["Subject"] = "Reset your Paper Trading password"
    message["From"] = smtp_from_email
    message["To"] = to_email

    message.set_content(
        f"""
Hello,

We received a request to reset your Paper Trading account password.

Click the link below to reset your password:

{reset_link}

This link will expire in 30 minutes.

If you did not request this password reset, you can safely ignore this email.

Regards,
Paper Trading Team
"""
    )

    message.add_alternative(
        f"""
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 14px;">
            <h2 style="color: #0f172a;">Reset your password</h2>

            <p style="color: #334155; line-height: 1.6;">
                We received a request to reset your Paper Trading account password.
                Click the button below to create a new password.
            </p>

            <a href="{reset_link}"
               style="display: inline-block; margin: 18px 0; padding: 12px 18px; background: #2563eb; color: white; text-decoration: none; border-radius: 10px; font-weight: bold;">
                Reset Password
            </a>

            <p style="color: #64748b; line-height: 1.6;">
                This link is valid for 30 minutes. If you did not request this, you can safely ignore this email.
            </p>

            <p style="color: #94a3b8; font-size: 13px;">
                Paper Trading Platform
            </p>
        </div>
        """,
        subtype="html",
    )

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
            server.send_message(message)

    except smtplib.SMTPAuthenticationError:
        raise Exception(
            "Gmail rejected SMTP login. Use a Google App Password, not your normal Gmail password."
        )

    except Exception as e:
        raise Exception(f"SMTP sending failed: {str(e)}")


@router.post("/register")
def register_user(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    username = user.username.strip()
    email = clean_email(user.email)
    phone = clean_phone(user.phone)
    password = user.password

    if not username:
        raise HTTPException(
            status_code=400,
            detail="Username is required",
        )

    if not email and not phone:
        raise HTTPException(
            status_code=400,
            detail="Email or phone number is required",
        )

    if not password or len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters",
        )

    existing_username = (
        db.query(User)
        .filter(User.username == username)
        .first()
    )

    if existing_username:
        raise HTTPException(
            status_code=400,
            detail="Username already taken",
        )

    if email:
        existing_email = (
            db.query(User)
            .filter(User.email == email)
            .first()
        )

        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="Email already registered",
            )

    if phone:
        existing_phone = (
            db.query(User)
            .filter(User.phone == phone)
            .first()
        )

        if existing_phone:
            raise HTTPException(
                status_code=400,
                detail="Phone number already registered",
            )

    new_user = User(
        username=username,
        email=email,
        phone=phone,
        password=hash_password(password),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    portfolio = create_default_portfolio_if_missing(new_user.id, db)

    return {
        "message": "User registered successfully",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "phone": new_user.phone,
        },
        "portfolio": {
            "cash_balance": portfolio.cash_balance,
            "total_value": portfolio.total_value,
            "total_pnl": portfolio.total_pnl,
        },
    }


@router.post("/login")
def login_user(
    user: UserLogin,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    identifier = user.identifier.strip()
    password = user.password

    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="Email or phone number is required",
        )

    db_user = (
        db.query(User)
        .filter(
            or_(
                User.email == identifier.lower(),
                User.phone == identifier.replace(" ", ""),
            )
        )
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email/phone or password",
        )

    if not verify_password(password, db_user.password):
        raise HTTPException(
            status_code=401,
            detail="Invalid email/phone or password",
        )

    create_default_portfolio_if_missing(db_user.id, db)

    access_token = create_access_token(db_user.id)

    # Send login notification if email is configured
    try:
        email = getattr(db_user, "email", "")
        if email:
            from app.services.email_service import send_email
            background_tasks.add_task(
                send_email,
                to_email=email,
                subject="New Login to Paper Trading Account",
                html_body=f"""
                <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:30px;">
                  <div style="max-width:540px;margin:auto;background:white;border-radius:18px;padding:30px;border:1px solid #e5e7eb;">
                    <h2 style="color:#0f172a;margin-top:0;">Paper Trading Platform</h2>
                    <p style="color:#475569;font-size:15px;line-height:1.7;">
                      A new login was detected on your account.
                    </p>
                    <div style="background:#f8fafc;border-radius:14px;padding:16px;margin:16px 0;">
                      <p style="margin:4px 0;color:#334155;font-weight:700;">Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</p>
                      <p style="margin:4px 0;color:#334155;font-weight:700;">User: {db_user.username}</p>
                    </div>
                    <p style="color:#64748b;font-size:13px;">If this was not you, please change your password immediately.</p>
                  </div>
                </div>
                """,
            )
    except Exception as notify_error:
        print(f"Login notification failed: {notify_error}")

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": db_user.id,
            "username": db_user.username,
            "email": db_user.email,
            "phone": db_user.phone,
        },
    }


@router.post("/google")
def google_login(
    payload: GoogleLogin,
    db: Session = Depends(get_db),
):
    google_client_id = os.getenv("GOOGLE_CLIENT_ID")

    if not google_client_id:
        raise HTTPException(
            status_code=500,
            detail="Google Client ID is not configured in backend .env",
        )

    try:
        id_info = id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            google_client_id,
        )

    except Exception as e:
        print("Google token verification failed:", e)

        raise HTTPException(
            status_code=401,
            detail="Invalid Google login token",
        )

    email = clean_email(id_info.get("email"))
    email_verified = id_info.get("email_verified", False)
    name = id_info.get("name") or id_info.get("given_name") or "Google User"

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Google account email not found",
        )

    if not email_verified:
        raise HTTPException(
            status_code=400,
            detail="Google email is not verified",
        )

    db_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not db_user:
        username = generate_unique_username(name, db)

        db_user = User(
            username=username,
            email=email,
            phone=None,
            password=hash_password(f"GOOGLE_AUTH_{uuid.uuid4()}"),
        )

        db.add(db_user)
        db.commit()
        db.refresh(db_user)

    create_default_portfolio_if_missing(db_user.id, db)

    access_token = create_access_token(db_user.id)

    return {
        "message": "Google login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": db_user.id,
            "username": db_user.username,
            "email": db_user.email,
            "phone": db_user.phone,
        },
    }


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    email = clean_email(payload.email)

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Email is required",
        )

    db_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not db_user:
        return {
            "message": "If this email is registered, a password reset link has been sent.",
        }

    token = secrets.token_urlsafe(48)

    reset_record = PasswordResetToken(
        user_id=db_user.id,
        email=email,
        token=token,
        is_used=False,
    )

    db.add(reset_record)
    db.commit()
    db.refresh(reset_record)

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    reset_link = f"{frontend_url}/reset-password?token={token}"

    try:
        send_password_reset_email(email, reset_link)

    except Exception as e:
        print("PASSWORD RESET EMAIL FAILED:", str(e))

        raise HTTPException(
            status_code=500,
            detail=f"Password reset token created, but email failed: {str(e)}",
        )

    return {
        "message": "If this email is registered, a password reset link has been sent.",
    }


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    token = str(payload.token or "").strip()
    new_password = str(payload.new_password or "").strip()

    if not token:
        raise HTTPException(
            status_code=400,
            detail="Reset token is required",
        )

    if not new_password or len(new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 6 characters",
        )

    reset_record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token == token,
            PasswordResetToken.is_used == False,
        )
        .first()
    )

    if not reset_record:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link",
        )

    now = datetime.now(timezone.utc)

    expires_at = reset_record.expires_at

    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at is not None and expires_at < now:
        raise HTTPException(
            status_code=400,
            detail="Reset link has expired",
        )

    db_user = (
        db.query(User)
        .filter(User.id == reset_record.user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    db_user.password = hash_password(new_password)
    reset_record.is_used = True

    db.commit()

    return {
        "message": "Password reset successfully. Please login with your new password.",
    }


@router.get("/me")
def get_my_profile(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    db_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    portfolio = create_default_portfolio_if_missing(user_id, db)

    # Determine admin access
    admin_emails = [
        item.strip().lower()
        for item in os.getenv("ADMIN_EMAILS", "").split(",")
        if item.strip()
    ]

    is_admin = (
        db_user.email is not None
        and db_user.email.lower() in admin_emails
    )

    return {
        "id": db_user.id,
        "username": db_user.username,
        "email": db_user.email,
        "phone": db_user.phone,
        "account_type": "Paper Trading",
        "status": "Active",
        "is_admin": is_admin,
        "portfolio": {
            "cash_balance": portfolio.cash_balance,
            "total_value": portfolio.total_value,
            "total_pnl": portfolio.total_pnl,
        },
    }


@router.patch("/profile")
def update_profile(
    profile: UserProfileUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    db_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    new_username = profile.username.strip() if profile.username else None
    new_email = clean_email(profile.email)
    new_phone = clean_phone(profile.phone)

    if new_username:
        existing_username = (
            db.query(User)
            .filter(
                User.username == new_username,
                User.id != user_id,
            )
            .first()
        )

        if existing_username:
            raise HTTPException(
                status_code=400,
                detail="Username already taken",
            )

        db_user.username = new_username

    if new_email:
        existing_email = (
            db.query(User)
            .filter(
                User.email == new_email,
                User.id != user_id,
            )
            .first()
        )

        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="Email already registered",
            )

        db_user.email = new_email

    if new_phone:
        existing_phone = (
            db.query(User)
            .filter(
                User.phone == new_phone,
                User.id != user_id,
            )
            .first()
        )

        if existing_phone:
            raise HTTPException(
                status_code=400,
                detail="Phone number already registered",
            )

        db_user.phone = new_phone

    if not db_user.email and not db_user.phone:
        raise HTTPException(
            status_code=400,
            detail="At least one contact method is required",
        )

    db.commit()
    db.refresh(db_user)

    return {
        "message": "Profile updated successfully",
        "user": {
            "id": db_user.id,
            "username": db_user.username,
            "email": db_user.email,
            "phone": db_user.phone,
        },
    }


@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    db_user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    if not verify_password(payload.current_password, db_user.password):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    if not payload.new_password or len(payload.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 6 characters",
        )

    db_user.password = hash_password(payload.new_password)

    db.commit()

    return {
        "message": "Password changed successfully",
    }
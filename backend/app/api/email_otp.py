import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.email_otp import EmailOTP
from app.schemas.email_otp import SendEmailOTPRequest, VerifyEmailOTPRequest
from app.services.email_service import send_otp_email

router = APIRouter(
    prefix="/email",
    tags=["Email OTP"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def generate_otp():
    return str(random.randint(100000, 999999))


@router.post("/send-otp")
def send_email_otp(
    payload: SendEmailOTPRequest,
    db: Session = Depends(get_db),
):
    email = payload.email.lower().strip()
    purpose = payload.purpose.upper().strip() or "AUTH"

    otp_code = generate_otp()

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    previous_otps = (
        db.query(EmailOTP)
        .filter(
            EmailOTP.email == email,
            EmailOTP.purpose == purpose,
            EmailOTP.is_used == False,
        )
        .all()
    )

    for item in previous_otps:
        item.is_used = True

    otp = EmailOTP(
        email=email,
        otp_code=otp_code,
        purpose=purpose,
        is_used=False,
        expires_at=expires_at,
    )

    db.add(otp)
    db.commit()

    try:
        send_otp_email(email, otp_code)
    except Exception as e:
        print("Email OTP sending failed:", e)

        raise HTTPException(
            status_code=500,
            detail="Unable to send OTP email. Check SMTP configuration.",
        )

    return {
        "message": "OTP sent successfully",
        "email": email,
        "expires_in_minutes": 10,
    }


@router.post("/verify-otp")
def verify_email_otp(
    payload: VerifyEmailOTPRequest,
    db: Session = Depends(get_db),
):
    email = payload.email.lower().strip()
    otp_code = payload.otp_code.strip()
    purpose = payload.purpose.upper().strip() or "AUTH"

    otp = (
        db.query(EmailOTP)
        .filter(
            EmailOTP.email == email,
            EmailOTP.purpose == purpose,
            EmailOTP.otp_code == otp_code,
            EmailOTP.is_used == False,
        )
        .order_by(EmailOTP.id.desc())
        .first()
    )

    if not otp:
        raise HTTPException(
            status_code=400,
            detail="Invalid OTP",
        )

    now = datetime.now(timezone.utc)

    expires_at = otp.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        otp.is_used = True
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="OTP expired",
        )

    otp.is_used = True
    db.commit()

    return {
        "message": "OTP verified successfully",
        "email": email,
        "verified": True,
    }
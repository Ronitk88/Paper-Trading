from fastapi import APIRouter, HTTPException

from app.schemas.phone_otp import (
    SendPhoneOTPRequest,
    VerifyPhoneOTPRequest,
)

from app.services.phone_otp_service import (
    send_phone_otp,
    verify_phone_otp,
)

router = APIRouter(
    prefix="/phone",
    tags=["Phone OTP"],
)


@router.post("/send-otp")
def send_otp(payload: SendPhoneOTPRequest):
    try:
        result = send_phone_otp(payload.phone)

        return {
            "message": "Phone OTP sent successfully",
            "phone": result["phone"],
            "status": result["status"],
        }

    except Exception as e:
        print("Phone OTP send failed:", e)

        raise HTTPException(
            status_code=500,
            detail=str(e) or "Unable to send phone OTP",
        )


@router.post("/verify-otp")
def verify_otp(payload: VerifyPhoneOTPRequest):
    try:
        result = verify_phone_otp(
            phone=payload.phone,
            otp_code=payload.otp_code,
        )

        if not result["valid"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired phone OTP",
            )

        return {
            "message": "Phone OTP verified successfully",
            "phone": result["phone"],
            "verified": True,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Phone OTP verification failed:", e)

        raise HTTPException(
            status_code=500,
            detail=str(e) or "Unable to verify phone OTP",
        )
from pydantic import BaseModel, EmailStr


class SendEmailOTPRequest(BaseModel):
    email: EmailStr
    purpose: str = "AUTH"


class VerifyEmailOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str
    purpose: str = "AUTH"
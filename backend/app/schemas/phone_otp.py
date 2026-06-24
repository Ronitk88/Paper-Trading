from pydantic import BaseModel


class SendPhoneOTPRequest(BaseModel):
    phone: str


class VerifyPhoneOTPRequest(BaseModel):
    phone: str
    otp_code: str
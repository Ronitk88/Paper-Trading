import os
from pathlib import Path

from dotenv import load_dotenv
from twilio.rest import Client


# Force load backend/.env
BASE_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH)


def get_twilio_client():
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")

    if not account_sid:
        raise Exception("TWILIO_ACCOUNT_SID missing in backend/.env")

    if not auth_token:
        raise Exception("TWILIO_AUTH_TOKEN missing in backend/.env")

    return Client(account_sid, auth_token)


def get_verify_service_sid():
    service_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID")

    if not service_sid:
        raise Exception(
            "TWILIO_VERIFY_SERVICE_SID missing in backend/.env. "
            "It should start with VA."
        )

    if not service_sid.startswith("VA"):
        raise Exception(
            "Invalid TWILIO_VERIFY_SERVICE_SID. "
            "Verify Service SID should start with VA."
        )

    return service_sid


def normalize_phone_number(phone: str):
    if not phone:
        raise Exception("Phone number is required")

    value = phone.strip().replace(" ", "").replace("-", "")

    if value.startswith("+"):
        return value

    if len(value) == 10:
        return f"+91{value}"

    if value.startswith("91") and len(value) == 12:
        return f"+{value}"

    raise Exception("Invalid phone number. Use format +91XXXXXXXXXX")


def send_phone_otp(phone: str):
    client = get_twilio_client()
    service_sid = get_verify_service_sid()
    normalized_phone = normalize_phone_number(phone)

    verification = client.verify.v2.services(service_sid).verifications.create(
        to=normalized_phone,
        channel="sms",
    )

    return {
        "phone": normalized_phone,
        "status": verification.status,
    }


def verify_phone_otp(phone: str, otp_code: str):
    client = get_twilio_client()
    service_sid = get_verify_service_sid()
    normalized_phone = normalize_phone_number(phone)

    verification_check = client.verify.v2.services(
        service_sid
    ).verification_checks.create(
        to=normalized_phone,
        code=otp_code,
    )

    return {
        "phone": normalized_phone,
        "status": verification_check.status,
        "valid": verification_check.status == "approved",
    }
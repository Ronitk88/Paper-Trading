import os
import threading
import time

import pyotp
from dotenv import load_dotenv
from SmartApi import SmartConnect


load_dotenv()

_smart_instance = None
_smart_created_at = 0
_stream_credentials = None
_smart_lock = threading.Lock()

# Keep the same Angel One session instead of logging in for every API call.
# You can adjust this from backend/.env if needed.
SMARTAPI_SESSION_TTL_SECONDS = int(
    os.getenv("SMARTAPI_SESSION_TTL_SECONDS", str(8 * 60 * 60))
)


def _get_db_credentials():
    """Read Angel One credentials from database (BrokerCredential table).

    Falls back to .env if no DB credentials exist or DB is unavailable.
    Returns a dict with api_key, client_code, password, totp_secret or None.
    """
    try:
        from app.db.database import SessionLocal
        from app.models.broker_credential import BrokerCredential

        db = SessionLocal()
        try:
            cred = (
                db.query(BrokerCredential)
                .filter(BrokerCredential.provider == "ANGELONE")
                .first()
            )

            if cred and cred.api_key and cred.client_code:
                return cred.get_decrypted()

            return None
        finally:
            db.close()
    except Exception:
        return None


def _get_required_env(name: str) -> str:
    value = os.getenv(name)

    if not value:
        raise RuntimeError(f"Missing required Angel One env value: {name}")

    return value.strip()


def _get_angel_credentials():
    """Return credentials from DB first, fallback to .env."""
    db_creds = _get_db_credentials()

    if db_creds and db_creds.get("api_key"):
        return db_creds

    return {
        "api_key": os.getenv("ANGELONE_API_KEY", ""),
        "client_code": os.getenv("ANGELONE_CLIENT_CODE", ""),
        "password": os.getenv("ANGELONE_PASSWORD", ""),
        "totp_secret": os.getenv("ANGELONE_TOTP_SECRET", ""),
    }


def test_angelone_connection():
    """Test Angel One connectivity with current credentials.

    Returns (success: bool, message: str).
    """
    try:
        creds = _get_angel_credentials()

        if not creds.get("api_key") or not creds.get("client_code"):
            return False, "Angel One credentials are not configured."

        smart = SmartConnect(api_key=creds["api_key"])

        totp = pyotp.TOTP(creds["totp_secret"]).now()

        session_response = smart.generateSession(
            creds["client_code"],
            creds["password"],
            totp,
        )

        if isinstance(session_response, dict) and session_response.get("status") is False:
            return False, session_response.get("message", "Angel One login failed")

        return True, "Connected to Angel One successfully."

    except Exception as e:
        error_str = str(e).lower()

        if "invalid" in error_str and "totp" in error_str:
            return False, "Invalid TOTP secret. Check ANGELONE_TOTP_SECRET."

        if "invalid" in error_str and ("api_key" in error_str or "api key" in error_str):
            return False, "Invalid API key. Check ANGELONE_API_KEY."

        if "timeout" in error_str or "connection" in error_str:
            return False, "Connection timeout. Check your network."

        return False, f"Connection failed: {str(e)}"


def _create_smart_session():
    creds = _get_angel_credentials()

    api_key = creds["api_key"]
    client_code = creds["client_code"]
    password = creds["password"]
    totp_secret = creds["totp_secret"]

    if not all([api_key, client_code, password, totp_secret]):
        raise RuntimeError(
            "Missing Angel One credentials. Set them in .env or via "
            "the Broker Settings page (Settings > Broker Configuration)."
        )

    smart = SmartConnect(api_key=api_key)

    totp = pyotp.TOTP(totp_secret).now()

    session_response = smart.generateSession(
        client_code,
        password,
        totp,
    )

    if isinstance(session_response, dict) and session_response.get("status") is False:
        raise RuntimeError(
            session_response.get("message")
            or session_response.get("errorcode")
            or "Angel One login failed"
        )

    session_data = (
        session_response.get("data", {})
        if isinstance(session_response, dict)
        else {}
    )

    auth_token = (
        session_data.get("jwtToken")
        or getattr(smart, "access_token", None)
    )
    feed_token = (
        session_data.get("feedToken")
        or smart.getfeedToken()
    )

    if auth_token and not str(auth_token).lower().startswith("bearer "):
        auth_token = f"Bearer {auth_token}"

    stream_credentials = {
        "auth_token": auth_token,
        "feed_token": feed_token,
        "api_key": api_key,
        "client_code": client_code,
    }

    if not all(stream_credentials.values()):
        raise RuntimeError("Angel One login did not return WebSocket credentials")

    return smart, stream_credentials


def reset_smart_api():
    global _smart_instance
    global _smart_created_at
    global _stream_credentials

    with _smart_lock:
        _smart_instance = None
        _smart_created_at = 0
        _stream_credentials = None


def get_smart_api(force_refresh: bool = False):
    global _smart_instance
    global _smart_created_at
    global _stream_credentials

    now = time.time()

    with _smart_lock:
        session_expired = (
            _smart_instance is not None
            and _smart_created_at
            and now - _smart_created_at > SMARTAPI_SESSION_TTL_SECONDS
        )

        if _smart_instance is not None and not force_refresh and not session_expired:
            return _smart_instance

        _smart_instance, _stream_credentials = _create_smart_session()
        _smart_created_at = now

        return _smart_instance


def get_smart_stream_credentials(force_refresh: bool = False):
    """
    Return the authenticated values required by Angel One WebSocket V2.

    REST and WebSocket traffic intentionally share one SmartAPI login session
    so the application does not generate a new TOTP session for every request
    or reconnect.
    """
    get_smart_api(force_refresh=force_refresh)

    with _smart_lock:
        if not _stream_credentials:
            raise RuntimeError("Angel One WebSocket credentials are unavailable")

        return dict(_stream_credentials)
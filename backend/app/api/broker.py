import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.broker_credential import BrokerCredential, encrypt_value
from app.models.user import User


router = APIRouter(
    prefix="/broker",
    tags=["Broker"],
)


class BrokerCredentialsUpdate(BaseModel):
    api_key: str | None = None
    client_code: str | None = None
    password: str | None = None
    totp_secret: str | None = None
    secret_key: str | None = None


class BrokerCredentialsResponse(BaseModel):
    id: int
    provider: str
    api_key_masked: str
    client_code_masked: str
    password_masked: str = "********"
    totp_secret_masked: str = "********"
    secret_key_masked: str
    is_active: bool
    connection_status: str
    last_connected_at: str | None = None
    updated_at: str | None = None


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id
    return current_user


def _get_or_create_broker_credential(
    db: Session,
    provider: str = "ANGELONE",
) -> BrokerCredential:
    cred = (
        db.query(BrokerCredential)
        .filter(BrokerCredential.provider == provider)
        .first()
    )

    if not cred:
        cred = BrokerCredential(
            provider=provider,
            connection_status="disconnected",
        )
        db.add(cred)
        db.commit()
        db.refresh(cred)

    return cred


@router.get("/credentials")
def get_broker_credentials(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return masked broker credentials for UI display."""
    cred = _get_or_create_broker_credential(db)

    return cred.to_masked_dict()


@router.put("/credentials")
def update_broker_credentials(
    payload: BrokerCredentialsUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update encrypted broker credentials. Only non-None fields are updated."""
    cred = _get_or_create_broker_credential(db)

    update_data = {}

    for field in ("api_key", "client_code", "password", "totp_secret", "secret_key"):
        value = getattr(payload, field, None)
        if value is not None:
            update_data[field] = encrypt_value(str(value))

    if update_data:
        for field, encrypted in update_data.items():
            setattr(cred, field, encrypted)

        cred.connection_status = "updated"
        db.commit()
        db.refresh(cred)

    return {
        "status": True,
        "message": f"Broker credentials updated for {cred.provider}.",
        "credentials": cred.to_masked_dict(),
    }


@router.post("/test-connection")
def test_broker_connection(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Test Angel One connection using stored credentials."""
    from app.services.angelone import test_angelone_connection

    cred = _get_or_create_broker_credential(db)
    decrypted = cred.get_decrypted()

    if not decrypted.get("api_key") and not os.getenv("ANGELONE_API_KEY"):
        raise HTTPException(
            status_code=400,
            detail="No Angel One credentials configured. Update broker credentials first.",
        )

    success, message = test_angelone_connection()

    cred.connection_status = "connected" if success else "disconnected"
    if success:
        cred.last_connected_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "status": success,
        "message": message,
        "connection_status": cred.connection_status,
        "last_connected_at": cred.last_connected_at.isoformat() if cred.last_connected_at else None,
    }


@router.post("/reconnect")
def reconnect_broker(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Force-reconnect Angel One session using stored or env credentials."""
    from app.services.angelone import reset_smart_api, get_smart_api
    from app.services.market_stream import market_stream

    try:
        market_stream.stop()
        reset_smart_api()
        fresh = get_smart_api(force_refresh=True)
        market_stream.start()

        cred = _get_or_create_broker_credential(db)
        cred.connection_status = "connected"
        cred.last_connected_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "status": True,
            "message": "Angel One reconnected successfully. WebSocket restarted with fresh credentials.",
            "connection_status": "connected",
            "last_connected_at": cred.last_connected_at.isoformat() if cred.last_connected_at else None,
        }

    except Exception as e:
        cred = _get_or_create_broker_credential(db)
        cred.connection_status = "error"
        db.commit()

        return {
            "status": False,
            "message": f"Reconnection failed: {str(e)}",
            "connection_status": "error",
            "last_connected_at": None,
        }


@router.get("/status")
def get_broker_status(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current broker connection status without testing."""
    from app.services.market_stream import market_stream

    cred = _get_or_create_broker_credential(db)
    feed_status = market_stream.status()

    return {
        "provider": cred.provider,
        "connection_status": cred.connection_status,
        "last_connected_at": cred.last_connected_at.isoformat() if cred.last_connected_at else None,
        "is_active": cred.is_active,
        "websocket_connected": feed_status.get("running", False),
        "websocket_subscriptions": feed_status.get("subscription_count", 0),
        "credentials_configured": bool(
            cred.api_key
            or os.getenv("ANGELONE_API_KEY")
        ),
    }
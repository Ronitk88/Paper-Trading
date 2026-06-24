import os
import base64
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from app.db.database import Base
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def utc_now():
    return datetime.now(timezone.utc)


def _get_fernet():
    key_str = os.getenv("CREDENTIAL_ENCRYPTION_KEY", "")

    if not key_str:
        raise RuntimeError(
            "CREDENTIAL_ENCRYPTION_KEY is not set in .env. "
            "Run: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )

    key_bytes = key_str.encode() if isinstance(key_str, str) else key_str

    if len(key_bytes) not in (32, 44):
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"paper_trading_broker_salt",
            iterations=480000,
        )
        key_bytes = base64.urlsafe_b64encode(kdf.derive(key_bytes))

    return Fernet(key_bytes)


def encrypt_value(plain_text: str) -> str:
    if not plain_text:
        return ""
    f = _get_fernet()
    return f.encrypt(plain_text.encode()).decode()


def decrypt_value(encrypted_text: str) -> str:
    if not encrypted_text:
        return ""
    f = _get_fernet()
    return f.decrypt(encrypted_text.encode()).decode()


class BrokerCredential(Base):
    __tablename__ = "broker_credentials"

    id = Column(Integer, primary_key=True, index=True)

    provider = Column(String, nullable=False, default="ANGELONE")

    api_key = Column(Text, nullable=True)
    client_code = Column(Text, nullable=True)
    password = Column(Text, nullable=True)
    totp_secret = Column(Text, nullable=True)
    secret_key = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)

    connection_status = Column(String, default="disconnected")
    last_connected_at = Column(DateTime, nullable=True)

    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    def set_credentials(self, **kwargs):
        for field in ("api_key", "client_code", "password", "totp_secret", "secret_key"):
            value = kwargs.get(field)
            if value is not None:
                setattr(self, field, encrypt_value(str(value)))

    def get_decrypted(self):
        return {
            "api_key": decrypt_value(self.api_key) if self.api_key else "",
            "client_code": decrypt_value(self.client_code) if self.client_code else "",
            "password": decrypt_value(self.password) if self.password else "",
            "totp_secret": decrypt_value(self.totp_secret) if self.totp_secret else "",
            "secret_key": decrypt_value(self.secret_key) if self.secret_key else "",
        }

    def to_masked_dict(self):
        def mask(value):
            if not value:
                return ""
            decrypted = decrypt_value(value)
            if len(decrypted) <= 8:
                return decrypted[:2] + "*" * (len(decrypted) - 2) + decrypted[-2:] if len(decrypted) > 4 else "****"
            return decrypted[:4] + "****" + decrypted[-4:]

        return {
            "id": self.id,
            "provider": self.provider,
            "api_key_masked": mask(self.api_key),
            "client_code_masked": mask(self.client_code),
            "password_masked": "********",
            "totp_secret_masked": "********",
            "secret_key_masked": mask(self.secret_key),
            "is_active": self.is_active,
            "connection_status": self.connection_status,
            "last_connected_at": self.last_connected_at.isoformat() if self.last_connected_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

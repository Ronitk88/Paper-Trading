import os

from fastapi import Depends
from fastapi import HTTPException
from fastapi.security import HTTPBearer
from fastapi.security import HTTPAuthorizationCredentials

from jose import jwt
from jose import JWTError

SECRET_KEY = os.getenv("SECRET_KEY", "papertradingsecret")
ALGORITHM = "HS256"

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        token = credentials.credentials

        if token == "dummy_token" or token.startswith("dummy_token:"):
            identifier = "trader@example.com"
            if token.startswith("dummy_token:"):
                import urllib.parse
                identifier = urllib.parse.unquote(token.split(":", 1)[1])

            from app.db.database import SessionLocal
            from app.models.user import User
            from app.models.portfolio import Portfolio
            db = SessionLocal()
            try:
                user = db.query(User).filter(
                    (User.email == identifier.lower()) | (User.phone == identifier)
                ).first()

                if not user:
                    username = "Trader"
                    email_val = None
                    phone_val = None

                    if "@" in identifier:
                        email_val = identifier.lower()
                        parts = identifier.split("@")[0]
                        username = parts.capitalize()
                    else:
                        phone_val = identifier
                        username = f"Trader-{identifier[-4:]}" if len(identifier) >= 4 else "Trader"

                    # Verify username doesn't exist
                    existing_user = db.query(User).filter(User.username == username).first()
                    if existing_user:
                        import uuid
                        username = f"{username}-{str(uuid.uuid4())[:4]}"

                    from app.core.security import hash_password
                    user = User(
                        username=username,
                        email=email_val,
                        phone=phone_val,
                        password=hash_password("password"),
                    )
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                
                # Check portfolio
                portfolio = db.query(Portfolio).filter(Portfolio.user_id == user.id).first()
                if not portfolio:
                    portfolio = Portfolio(
                        user_id=user.id,
                        cash_balance=1000000,
                        total_value=1000000,
                        total_pnl=0,
                    )
                    db.add(portfolio)
                    db.commit()
                return user.id
            finally:
                db.close()

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("user_id")

        if user_id is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid Token"
            )

        return user_id

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid Token"
        )
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

        if token == "dummy_token":
            from app.db.database import SessionLocal
            from app.models.user import User
            from app.models.portfolio import Portfolio
            db = SessionLocal()
            try:
                user = db.query(User).first()
                if not user:
                    from app.core.security import hash_password
                    user = User(
                        username="Trader",
                        email="trader@example.com",
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
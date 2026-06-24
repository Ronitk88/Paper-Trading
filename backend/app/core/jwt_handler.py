from datetime import datetime, timedelta

from jose import jwt

SECRET_KEY = "papertradingsecret"
ALGORITHM = "HS256"


def create_access_token(user_id: int):
    expire = datetime.utcnow() + timedelta(days=7)

    payload = {
        "user_id": user_id,
        "exp": expire
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return token
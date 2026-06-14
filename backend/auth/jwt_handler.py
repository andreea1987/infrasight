from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from backend.config.settings import ALGORITHM, AUTH_SESSION_EXPIRE_MINUTES, SECRET_KEY


SESSION_COOKIE_NAME = "infrasight_session"


def create_session_token(payload: dict) -> str:
    """
    Create a signed browser session token.

    Inputs:
    - payload: authenticated user/workspace/role claims

    Output:
    - compact JWT stored only in an HTTP-only cookie by auth routes

    Assumption:
    - Real enterprise deployments must set SECRET_KEY to a long random value.
    """
    expiry = datetime.now(timezone.utc) + timedelta(minutes=AUTH_SESSION_EXPIRE_MINUTES)
    token_payload = {
        **payload,
        "exp": expiry,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(token_payload, _secret_key(), algorithm=_algorithm())


def decode_session_token(token: str | None) -> dict | None:
    """
    Decode and validate a browser session token.

    Returns:
    - decoded claims when the token is valid and unexpired
    - None when the cookie is missing, malformed or expired
    """
    if not token:
        return None

    try:
        return jwt.decode(token, _secret_key(), algorithms=[_algorithm()])
    except JWTError:
        return None


def _secret_key() -> str:
    return SECRET_KEY or "infrasight-dev-session-secret-change-me"


def _algorithm() -> str:
    return ALGORITHM or "HS256"

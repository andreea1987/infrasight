import base64
import hashlib
import hmac
import os


PBKDF2_ITERATIONS = 210_000


def hash_password(password: str) -> str:
    """
    Hash a local-auth password with PBKDF2-HMAC-SHA256.

    Used by:
    - local sign-in bootstrap
    - future user-management screens that set local passwords

    Inputs:
    - password: plaintext password received only by the backend

    Output:
    - versioned hash payload safe to store in the users table

    Assumption:
    - SSO users may not have a usable local password hash.
    """
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode(),
        base64.urlsafe_b64encode(digest).decode(),
    )


def verify_password(password: str, stored_hash: str | None) -> bool:
    """
    Verify a local-auth password against a stored hash.

    Returns:
    - True when the password matches
    - False for missing, unsupported or mismatched hashes
    """
    if not stored_hash or not stored_hash.startswith("pbkdf2_sha256$"):
        return False

    try:
        _, iterations, salt_b64, digest_b64 = stored_hash.split("$", 3)
        salt = base64.urlsafe_b64decode(salt_b64.encode())
        expected = base64.urlsafe_b64decode(digest_b64.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

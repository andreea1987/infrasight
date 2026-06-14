import base64
import hashlib
import hmac
import json
import os

from backend.config.settings import SECRET_KEY
from backend.models.organization import IntegrationSecret, Organization, OrganizationMembership


def ensure_default_organization(db):
    organization = db.query(Organization).filter(Organization.tenant_id == "internal").first()
    if organization:
        return organization

    organization = Organization(tenant_id="internal", name="Internal Operations", status="active")
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


def list_organizations(db):
    ensure_default_organization(db)
    return db.query(Organization).filter(Organization.status == "active").order_by(Organization.name).all()


def create_organization(db, payload):
    existing = db.query(Organization).filter(Organization.tenant_id == payload.tenant_id).first()
    if existing:
        return existing, False

    organization = Organization(
        tenant_id=payload.tenant_id,
        name=payload.name,
        status=payload.status,
    )
    db.add(organization)
    db.flush()
    db.add(
        OrganizationMembership(
            email="dashboard",
            tenant_id=organization.tenant_id,
            organization_id=organization.tenant_id,
            role="admin",
            is_msp_admin=True,
        )
    )
    db.commit()
    db.refresh(organization)
    return organization, True


def serialize_secret(secret):
    return {
        "id": secret.id,
        "tenant_id": secret.tenant_id,
        "organization_id": secret.organization_id,
        "provider": secret.provider,
        "name": secret.name,
        "metadata": secret.metadata_json or {},
        "created_at": secret.created_at,
        "updated_at": secret.updated_at,
    }


def store_integration_secret(db, payload, tenant_id="internal", organization_id="internal"):
    secret = IntegrationSecret(
        tenant_id=tenant_id,
        organization_id=payload.organization_id or organization_id,
        provider=payload.provider,
        name=payload.name,
        encrypted_value=_encrypt_secret(payload.value),
        metadata_json=payload.metadata,
    )
    db.add(secret)
    db.commit()
    db.refresh(secret)
    return serialize_secret(secret)


def list_integration_secrets(db, tenant_id="internal"):
    secrets = (
        db.query(IntegrationSecret)
        .filter(IntegrationSecret.tenant_id == tenant_id)
        .order_by(IntegrationSecret.created_at.desc())
        .all()
    )
    return [serialize_secret(secret) for secret in secrets]


def _encrypt_secret(value):
    key = (SECRET_KEY or os.getenv("INFRASIGHT_SECRET_KEY") or "infrasight-dev-key").encode()
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", key, salt, 120_000, dklen=32)
    payload = value.encode()
    stream = _keystream(derived, salt, len(payload))
    ciphertext = bytes(byte ^ stream[index] for index, byte in enumerate(payload))
    signature = hmac.new(derived, ciphertext, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(
        json.dumps(
            {
                "v": 1,
                "salt": base64.b64encode(salt).decode(),
                "ciphertext": base64.b64encode(ciphertext).decode(),
                "signature": base64.b64encode(signature).decode(),
            }
        ).encode()
    ).decode()


def _keystream(key, salt, length):
    blocks = []
    counter = 0
    while sum(len(block) for block in blocks) < length:
        blocks.append(
            hmac.new(key, salt + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        )
        counter += 1
    return b"".join(blocks)[:length]

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime
from urllib import request
from urllib.error import URLError

from backend.config.settings import OPENAI_API_KEY, OPENCLAW_MODEL, SECRET_KEY
from backend.models.ai_provider import OpenClawAiProvider
from backend.schemas.ai_provider import AiProviderConfigPayload
from backend.services.organization_service import _encrypt_secret

PROVIDER_TYPES = {
    "builtin": "Built-in OpenClaw",
    "openai_compatible": "OpenAI-compatible API",
    "azure_openai": "Azure OpenAI",
    "anthropic": "Anthropic Claude",
    "ollama": "Ollama/local model",
    "custom_http": "Custom HTTP endpoint",
}


def list_ai_providers(db, tenant_id="internal"):
    """
    Return all OpenClaw AI providers for a workspace.

    Outputs:
    - Provider metadata and masked secret indicators

    Assumption:
    - API secrets are never returned; the UI only receives has_secret and a
      generic mask so admins know a value is stored.
    """
    ensure_builtin_provider(db, tenant_id=tenant_id, organization_id=tenant_id)
    providers = (
        db.query(OpenClawAiProvider)
        .filter(OpenClawAiProvider.tenant_id == tenant_id)
        .order_by(OpenClawAiProvider.is_active.desc(), OpenClawAiProvider.provider_name.asc())
        .all()
    )
    return [serialize_ai_provider(provider) for provider in providers]


def ensure_builtin_provider(db, tenant_id="internal", organization_id="internal"):
    """Create the read-only built-in OpenClaw provider if a workspace has none."""
    provider = (
        db.query(OpenClawAiProvider)
        .filter(
            OpenClawAiProvider.tenant_id == tenant_id,
            OpenClawAiProvider.provider_type == "builtin",
        )
        .first()
    )
    if provider:
        return provider

    provider = OpenClawAiProvider(
        tenant_id=tenant_id,
        organization_id=organization_id,
        provider_name="Built-in OpenClaw",
        provider_type="builtin",
        model_name=OPENCLAW_MODEL,
        enabled=True,
        is_active=True,
        last_test_result="connected",
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def get_active_ai_provider(db, tenant_id="internal"):
    """
    Select the active enabled provider for OpenClaw chat.

    Falls back to the built-in provider when no configured provider is enabled
    or when the active provider is marked failed/not configured.
    """
    ensure_builtin_provider(db, tenant_id=tenant_id, organization_id=tenant_id)
    provider = (
        db.query(OpenClawAiProvider)
        .filter(
            OpenClawAiProvider.tenant_id == tenant_id,
            OpenClawAiProvider.enabled.is_(True),
            OpenClawAiProvider.is_active.is_(True),
        )
        .order_by(OpenClawAiProvider.updated_at.desc())
        .first()
    )
    if not provider or provider_status(provider) in {"Failed", "Not Configured"}:
        return (
            db.query(OpenClawAiProvider)
            .filter(
                OpenClawAiProvider.tenant_id == tenant_id,
                OpenClawAiProvider.provider_type == "builtin",
            )
            .first()
        )
    return provider


def upsert_ai_provider(db, payload: AiProviderConfigPayload, tenant_id="internal", organization_id="internal", provider_id=None):
    """
    Create or update a workspace AI provider.

    Inputs:
    - provider metadata and optional replacement secret
    - provider_id when editing

    Outputs:
    - serialized provider with masked secret status
    """
    if provider_id:
        provider = (
            db.query(OpenClawAiProvider)
            .filter(OpenClawAiProvider.id == provider_id, OpenClawAiProvider.tenant_id == tenant_id)
            .first()
        )
        if not provider:
            return None
    else:
        provider = OpenClawAiProvider(tenant_id=tenant_id, organization_id=organization_id)
        db.add(provider)

    provider.provider_name = payload.provider_name.strip()
    provider.provider_type = payload.provider_type
    provider.base_url = payload.base_url.strip() if payload.base_url else None
    provider.model_name = payload.model_name.strip() if payload.model_name else None
    provider.enabled = payload.enabled
    provider.organization_id = payload.workspace_id or organization_id
    provider.updated_at = datetime.utcnow()

    if payload.api_secret:
        provider.encrypted_secret = _encrypt_secret(payload.api_secret)

    if payload.is_active:
        _clear_active_provider(db, tenant_id)
        provider.is_active = True
    elif provider_id is None:
        provider.is_active = False

    db.commit()
    db.refresh(provider)
    return serialize_ai_provider(provider)


def set_active_ai_provider(db, provider_id, tenant_id="internal"):
    """Mark one enabled workspace provider active and deactivate the rest."""
    provider = (
        db.query(OpenClawAiProvider)
        .filter(OpenClawAiProvider.id == provider_id, OpenClawAiProvider.tenant_id == tenant_id)
        .first()
    )
    if not provider:
        return None
    _clear_active_provider(db, tenant_id)
    provider.is_active = True
    provider.enabled = True
    provider.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(provider)
    return serialize_ai_provider(provider)


def test_ai_provider(db, provider_id, tenant_id="internal"):
    """
    Validate provider configuration and perform a lightweight connectivity test.

    Outputs:
    - Connected, Failed, or Not Configured

    Important:
    - This does not send InfraSight workspace data to the provider. It only
      validates provider reachability/configuration.
    """
    provider = (
        db.query(OpenClawAiProvider)
        .filter(OpenClawAiProvider.id == provider_id, OpenClawAiProvider.tenant_id == tenant_id)
        .first()
    )
    if not provider:
        return None

    status, detail = _test_provider_connection(provider)
    provider.last_test_at = datetime.utcnow()
    provider.last_test_result = status.lower().replace(" ", "_")
    provider.last_test_error = None if status == "Connected" else detail
    db.commit()
    db.refresh(provider)
    return {
        "status": status,
        "detail": detail,
        "checked_at": provider.last_test_at,
        "provider": serialize_ai_provider(provider),
    }


def serialize_ai_provider(provider):
    has_secret = bool(provider.encrypted_secret)
    return {
        "id": provider.id,
        "provider_name": provider.provider_name,
        "provider_type": provider.provider_type,
        "base_url": provider.base_url,
        "model_name": provider.model_name,
        "enabled": provider.enabled,
        "is_active": provider.is_active,
        "workspace_id": provider.tenant_id,
        "has_secret": has_secret,
        "masked_secret": "••••••••" if has_secret else None,
        "status": provider_status(provider),
        "last_test_at": provider.last_test_at,
        "last_test_result": provider.last_test_result,
        "last_test_error": provider.last_test_error,
        "created_at": provider.created_at,
        "updated_at": provider.updated_at,
    }


def provider_status(provider):
    if not provider.enabled:
        return "Not Configured"
    if provider.provider_type == "builtin":
        return "Connected"
    if provider.provider_type in {"openai_compatible", "azure_openai", "anthropic", "custom_http"} and not provider.encrypted_secret:
        return "Not Configured"
    if provider.provider_type in {"openai_compatible", "azure_openai", "ollama", "custom_http"} and not provider.base_url:
        return "Not Configured"
    if provider.last_test_result in {"connected", "success"}:
        return "Connected"
    if provider.last_test_result in {"failed", "not_configured"}:
        return "Failed" if provider.last_test_error else "Not Configured"
    return "Not Configured"


def provider_secret(provider):
    """Decrypt a stored provider API secret for backend-only outbound calls."""
    if not provider.encrypted_secret:
        return OPENAI_API_KEY if provider.provider_type == "builtin" else None
    return _decrypt_secret(provider.encrypted_secret)


def _clear_active_provider(db, tenant_id):
    db.query(OpenClawAiProvider).filter(OpenClawAiProvider.tenant_id == tenant_id).update({"is_active": False})


def _test_provider_connection(provider):
    if provider.provider_type == "builtin":
        return "Connected", "Built-in OpenClaw fallback is available."

    missing = []
    if provider.provider_type in {"openai_compatible", "azure_openai", "anthropic", "custom_http"} and not provider.encrypted_secret:
        missing.append("API key/secret")
    if provider.provider_type in {"openai_compatible", "azure_openai", "ollama", "custom_http"} and not provider.base_url:
        missing.append("base URL")
    if not provider.model_name and provider.provider_type != "custom_http":
        missing.append("model name")
    if missing:
        return "Not Configured", f"Missing required field(s): {', '.join(missing)}."

    if provider.base_url:
        try:
            req = request.Request(provider.base_url, method="GET")
            with request.urlopen(req, timeout=3) as response:
                if response.status < 500:
                    return "Connected", "Provider endpoint is reachable."
        except (OSError, URLError) as exc:
            return "Failed", f"Provider endpoint could not be reached: {exc}."

    return "Connected", "Provider configuration is complete."


def _decrypt_secret(value):
    key = (SECRET_KEY or os.getenv("INFRASIGHT_SECRET_KEY") or "infrasight-dev-key").encode()
    encoded = json.loads(base64.urlsafe_b64decode(value.encode()).decode())
    salt = base64.b64decode(encoded["salt"])
    ciphertext = base64.b64decode(encoded["ciphertext"])
    expected_signature = base64.b64decode(encoded["signature"])
    derived = hashlib.pbkdf2_hmac("sha256", key, salt, 120_000, dklen=32)
    signature = hmac.new(derived, ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected_signature):
        raise ValueError("Stored provider secret could not be verified")
    stream = _keystream(derived, salt, len(ciphertext))
    return bytes(byte ^ stream[index] for index, byte in enumerate(ciphertext)).decode()


def _keystream(key, salt, length):
    blocks = []
    counter = 0
    while sum(len(block) for block in blocks) < length:
        blocks.append(hmac.new(key, salt + counter.to_bytes(4, "big"), hashlib.sha256).digest())
        counter += 1
    return b"".join(blocks)[:length]

"""
Connectors API Routes
=====================
Manages connector registrations and exposes connector health status.

Connectors are integration adapters that allow InfraSight to communicate with
cloud providers, Linux/Windows hosts, Docker daemons, and databases.  Each
registered connector stores a sanitized config where sensitive values (passwords,
API keys) are replaced with references to IntegrationSecrets.

Supported connector types are defined in the connector catalog.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from backend.connectors.catalog import get_connector_catalog, get_connector_catalog_item
from backend.database.session import SessionLocal
from backend.models.connector import ConnectorRegistration
from backend.schemas.organization import IntegrationSecretCreate
from backend.schemas.connector import (
    ConnectorCatalogItem,
    ConnectorHealthResponse,
    ConnectorRegistrationCreate,
    ConnectorRegistrationResponse,
)
from backend.services.connector_service import connector_health, serialize_connector_registration
from backend.services.organization_service import store_integration_secret
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("/catalog", response_model=list[ConnectorCatalogItem])
def connector_catalog():
    """Return the full connector type catalogue: supported types and their capabilities."""
    return get_connector_catalog()


@router.get("", response_model=list[ConnectorRegistrationResponse])
def list_connector_registrations(context: TenantContext = Depends(get_tenant_context)):
    """List all connectors registered for the tenant."""
    db = SessionLocal()

    try:
        connectors = (
            db.query(ConnectorRegistration)
            .filter(ConnectorRegistration.tenant_id == context.tenant_id)
            .order_by(ConnectorRegistration.created_at.desc())
            .all()
        )

        return [serialize_connector_registration(connector) for connector in connectors]
    finally:
        db.close()


@router.post("", response_model=ConnectorRegistrationResponse)
def create_connector_registration(
    payload: ConnectorRegistrationCreate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Register a new connector.  Sensitive config values are automatically
    extracted and stored as IntegrationSecrets; the stored config retains
    only secret reference IDs.
    Requires the 'integrations:write' permission.
    """
    require_permission(context, "integrations:write")
    if not get_connector_catalog_item(payload.connector_type):
        raise HTTPException(status_code=400, detail="Unknown connector type")

    db = SessionLocal()

    try:
        connector = ConnectorRegistration(
            tenant_id=context.tenant_id,
            organization_id=payload.organization_id or context.organization_id,
            connector_type=payload.connector_type,
            name=payload.name,
            status=payload.status,
            config_json=_secure_connector_config(
                db,
                payload.config,
                tenant_id=context.tenant_id,
                organization_id=payload.organization_id or context.organization_id,
                provider=payload.connector_type,
                connector_name=payload.name,
            ),
            last_status="registered",
            last_checked_at=datetime.utcnow(),
        )
        db.add(connector)
        db.commit()
        db.refresh(connector)

        return serialize_connector_registration(connector)
    finally:
        db.close()


def _secure_connector_config(db, config, tenant_id, organization_id, provider, connector_name):
    """
    Replace sensitive config values with IntegrationSecret references.
    Non-sensitive keys are stored as-is.  This ensures plaintext credentials
    never persist in the connector config JSON column.
    """
    secured = {}
    for key, value in (config or {}).items():
        if _is_sensitive_key(key) and value:
            secret = store_integration_secret(
                db,
                IntegrationSecretCreate(
                    provider=provider,
                    name=f"{connector_name}:{key}",
                    value=str(value),
                    organization_id=organization_id,
                    metadata={"source": "connector_registration"},
                ),
                tenant_id=tenant_id,
                organization_id=organization_id,
            )
            secured[key] = {"secret_ref": secret["id"]}
        else:
            secured[key] = value
    return secured


def _is_sensitive_key(key):
    """Return True if the config key name suggests it holds a credential."""
    lowered = key.lower()
    return any(marker in lowered for marker in ["secret", "password", "token", "private_key", "access_key"])


@router.get("/health", response_model=list[ConnectorHealthResponse])
def get_connector_health(context: TenantContext = Depends(get_tenant_context)):
    """
    Return health status for all connectors: resource count, metric count,
    alert count, and a human-readable status message.
    Used by the dashboard Overview and OpenClaw operational summary.
    """
    db = SessionLocal()

    try:
        return connector_health(db, tenant_id=context.tenant_id)
    finally:
        db.close()

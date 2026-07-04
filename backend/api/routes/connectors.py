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
from backend.models.connector import Connector, ConnectorRegistration, DiscoveredResource
from backend.models.organization import Organization, Workspace
from backend.schemas.organization import IntegrationSecretCreate
from backend.schemas.connector import (
    ConnectorCatalogItem,
    ConnectorOperationResponse,
    ConnectorHealthResponse,
    ConnectorRegistrationCreate,
    ConnectorRegistrationResponse,
    ConnectorResponse,
    ConnectorSaveRequest,
    ConnectorStatusResponse,
    DiscoveredResourceResponse,
)
from backend.services.connector_service import (
    connector_health,
    connector_status,
    run_mock_discovery,
    save_mock_connector,
    serialize_connector,
    serialize_connector_registration,
    serialize_discovered_resource,
    synchronize_mock_connector,
    test_mock_connection,
)
from backend.services.organization_service import store_integration_secret
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("/catalog", response_model=list[ConnectorCatalogItem])
def connector_catalog():
    """Return the full connector type catalogue: supported types and their capabilities."""
    return get_connector_catalog()


@router.get("/instances", response_model=list[ConnectorResponse])
def list_connector_instances(context: TenantContext = Depends(get_tenant_context)):
    """Return persisted connector framework instances for the active tenant."""
    db = SessionLocal()

    try:
        workspace = _ensure_context_workspace(db, context)
        connectors = (
            db.query(Connector)
            .filter(Connector.workspace_id == workspace.id)
            .order_by(Connector.updated_at.desc())
            .all()
        )
        return [serialize_connector(connector) for connector in connectors]
    finally:
        db.close()


@router.post("/instances", response_model=ConnectorResponse)
def save_connector_instance(
    payload: ConnectorSaveRequest,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Save a connector framework instance.

    This is a mocked lifecycle endpoint backed by local persistence. No real
    provider APIs are contacted, and any supplied credentials are encrypted into
    connector_credentials rather than returned in responses.
    """
    require_permission(context, "integrations:write")
    db = SessionLocal()

    try:
        workspace = _ensure_context_workspace(db, context, payload.workspace_id)
        try:
            return save_mock_connector(db, payload, workspace_id=workspace.id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        db.close()


@router.post("/instances/{connector_id}/test", response_model=ConnectorOperationResponse)
def test_connector_instance(
    connector_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Simulate a connector connection test."""
    require_permission(context, "integrations:write")
    db = SessionLocal()

    try:
        connector = _get_context_connector(db, context, connector_id)
        return test_mock_connection(db, connector)
    finally:
        db.close()


@router.post("/instances/{connector_id}/discovery", response_model=ConnectorOperationResponse)
def run_connector_discovery(
    connector_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Simulate discovery and persist mock resources for the connector."""
    require_permission(context, "discovery:run")
    db = SessionLocal()

    try:
        connector = _get_context_connector(db, context, connector_id)
        return run_mock_discovery(db, connector)
    finally:
        db.close()


@router.post("/instances/{connector_id}/sync", response_model=ConnectorOperationResponse)
def synchronize_connector_instance(
    connector_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Simulate a full connector synchronization and persist a sync run."""
    require_permission(context, "integrations:write")
    db = SessionLocal()

    try:
        connector = _get_context_connector(db, context, connector_id)
        return synchronize_mock_connector(db, connector)
    finally:
        db.close()


@router.get("/instances/{connector_id}/status", response_model=ConnectorStatusResponse)
def get_connector_instance_status(
    connector_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Return persisted status for one connector instance."""
    db = SessionLocal()

    try:
        connector = _get_context_connector(db, context, connector_id)
        return connector_status(connector)
    finally:
        db.close()


@router.get("/instances/{connector_id}/resources", response_model=list[DiscoveredResourceResponse])
def get_connector_instance_resources(
    connector_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Return discovered resources persisted for one connector instance."""
    db = SessionLocal()

    try:
        connector = _get_context_connector(db, context, connector_id)
        resources = (
            db.query(DiscoveredResource)
            .filter(DiscoveredResource.connector_id == connector.id)
            .order_by(DiscoveredResource.resource_type, DiscoveredResource.name)
            .all()
        )
        return [serialize_discovered_resource(resource) for resource in resources]
    finally:
        db.close()


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


def _ensure_context_workspace(db, context: TenantContext, workspace_id: int | None = None):
    organization = (
        db.query(Organization)
        .filter(Organization.tenant_id == context.organization_id, Organization.status == "active")
        .first()
    )
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    if workspace_id is not None:
        workspace = (
            db.query(Workspace)
            .filter(Workspace.id == workspace_id, Workspace.organization_id == organization.id)
            .first()
        )
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return workspace

    workspace = (
        db.query(Workspace)
        .filter(
            Workspace.organization_id == organization.id,
            Workspace.name == context.tenant_id,
            Workspace.environment == "production",
        )
        .first()
    )
    if workspace:
        return workspace

    workspace = Workspace(
        organization_id=organization.id,
        name=context.tenant_id,
        environment="production",
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def _get_context_connector(db, context: TenantContext, connector_id: int):
    organization = (
        db.query(Organization)
        .filter(Organization.tenant_id == context.organization_id, Organization.status == "active")
        .first()
    )
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    connector = (
        db.query(Connector)
        .join(Workspace, Connector.workspace_id == Workspace.id)
        .filter(
            Connector.id == connector_id,
            Workspace.organization_id == organization.id,
        )
        .first()
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    return connector


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

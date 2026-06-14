"""
Organizations API Routes
========================
Manages organizations (tenants) and their integration secrets.

Multi-tenancy model:
  Every API request carries X-InfraSight-Tenant and X-InfraSight-Organization
  headers.  MSP admins can list and create all organizations; regular operators
  can only see their own organization.

Integration secrets store encrypted credentials for third-party integrations
(cloud provider keys, webhook tokens, etc.) scoped to a specific organization.
"""

from fastapi import APIRouter, Depends, HTTPException

from backend.database.session import SessionLocal
from backend.schemas.organization import (
    IntegrationSecretCreate,
    IntegrationSecretResponse,
    OrganizationContextResponse,
    OrganizationCreate,
    OrganizationResponse,
)
from backend.services.organization_service import (
    create_organization,
    list_integration_secrets,
    list_organizations,
    store_integration_secret,
)
from backend.tenancy.context import (
    TenantContext,
    get_tenant_context,
    require_permission,
    serialize_tenant_context,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationResponse])
def get_organizations(context: TenantContext = Depends(get_tenant_context)):
    """
    List organizations.  MSP admins see all organizations; operators see only
    their own.  Used by the dashboard org switcher.
    """
    db = SessionLocal()

    try:
        if context.is_msp_admin:
            return list_organizations(db)

        # Non-admins are restricted to their own organization
        return [
            organization
            for organization in list_organizations(db)
            if organization.tenant_id == context.tenant_id
        ]
    finally:
        db.close()


@router.post("", response_model=OrganizationResponse)
def post_organization(
    payload: OrganizationCreate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Create a new organization (tenant).  Returns 409 if the organization
    already exists with a conflicting status.
    Requires the 'organizations:write' permission.
    """
    require_permission(context, "organizations:write")
    db = SessionLocal()

    try:
        organization, created = create_organization(db, payload)
        if not created and organization.status != payload.status:
            raise HTTPException(status_code=409, detail="Organization already exists")
        return organization
    finally:
        db.close()


@router.get("/context", response_model=OrganizationContextResponse)
def get_organization_context(context: TenantContext = Depends(get_tenant_context)):
    """
    Return the current request's tenant context: tenant_id, organization_id,
    role, and active permissions.  Used by the dashboard to gate UI features.
    """
    return serialize_tenant_context(context)


@router.get("/secrets", response_model=list[IntegrationSecretResponse])
def get_integration_secrets(context: TenantContext = Depends(get_tenant_context)):
    """
    List integration secrets for the tenant.  Secret values are not returned —
    only metadata (name, service, created_at) is exposed.
    Requires the 'integrations:write' permission.
    """
    require_permission(context, "integrations:write")
    db = SessionLocal()

    try:
        return list_integration_secrets(db, tenant_id=context.tenant_id)
    finally:
        db.close()


@router.post("/secrets", response_model=IntegrationSecretResponse)
def post_integration_secret(
    payload: IntegrationSecretCreate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Store or update an integration secret for the tenant.
    Secrets are encrypted at rest before being written to the database.
    Requires the 'integrations:write' permission.
    """
    require_permission(context, "integrations:write")
    db = SessionLocal()

    try:
        return store_integration_secret(
            db,
            payload,
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
    finally:
        db.close()

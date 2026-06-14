from dataclasses import dataclass

from fastapi import Cookie, Header, HTTPException

from backend.auth.jwt_handler import SESSION_COOKIE_NAME, decode_session_token
from backend.database.session import SessionLocal
from backend.models.organization import Organization, OrganizationMembership


TENANT_READ_PERMISSIONS = {
    "organization:read",
    "inventory:read",
    "monitoring:read",
    "alerts:read",
    "openclaw:read",
}
TENANT_OPERATOR_PERMISSIONS = TENANT_READ_PERMISSIONS | {
    "discovery:run",
    "monitoring:collect",
    "alerts:write",
    "notifications:write",
    "openclaw:chat",
}
TENANT_ADMIN_PERMISSIONS = TENANT_OPERATOR_PERMISSIONS | {
    "organizations:write",
    "integrations:write",
    "automation:write",
}


@dataclass(frozen=True)
class TenantContext:
    tenant_id: str
    organization_id: str
    organization_name: str
    role: str
    is_msp_admin: bool
    actor: str
    permissions: set[str]


def get_tenant_context(
    x_infrasight_tenant: str | None = Header(default=None),
    x_infrasight_organization: str | None = Header(default=None),
    x_infrasight_actor: str | None = Header(default="dashboard"),
    x_infrasight_role: str | None = Header(default="operator"),
    infrasight_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    session_claims = decode_session_token(infrasight_session)
    requested_tenant = _clean_header(
        x_infrasight_organization
        or x_infrasight_tenant
        or (session_claims or {}).get("tenant_id")
        or "internal"
    )
    actor = _clean_header((session_claims or {}).get("sub") or x_infrasight_actor or "dashboard")
    role = _clean_header((session_claims or {}).get("role") or x_infrasight_role or "operator")

    db = SessionLocal()
    try:
        _ensure_internal_organization(db)
        organization = (
            db.query(Organization)
            .filter(Organization.tenant_id == requested_tenant, Organization.status == "active")
            .first()
        )

        if not organization:
            raise HTTPException(status_code=404, detail="Organization not found or inactive")

        membership = (
            db.query(OrganizationMembership)
            .filter(
                OrganizationMembership.tenant_id == organization.tenant_id,
                OrganizationMembership.email == actor,
            )
            .first()
        )

        # Authenticated sessions should only inherit roles from an explicit
        # workspace membership; header roles are retained for existing local
        # demo flows where no user session has been established yet.
        effective_role = membership.role if membership else role
        is_msp_admin = bool(membership.is_msp_admin) if membership else effective_role == "msp_admin"

        return TenantContext(
            tenant_id=organization.tenant_id,
            organization_id=organization.tenant_id,
            organization_name=organization.name,
            role=effective_role,
            is_msp_admin=is_msp_admin,
            actor=actor,
            permissions=_permissions_for_role(effective_role),
        )
    finally:
        db.close()


def require_permission(context: TenantContext, permission: str):
    if permission in context.permissions:
        return

    raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")


def serialize_tenant_context(context: TenantContext):
    return {
        "tenant_id": context.tenant_id,
        "organization_id": context.organization_id,
        "organization_name": context.organization_name,
        "role": context.role,
        "is_msp_admin": context.is_msp_admin,
        "permissions": sorted(context.permissions),
    }


def _ensure_internal_organization(db):
    internal = db.query(Organization).filter(Organization.tenant_id == "internal").first()
    if internal:
        return

    db.add(Organization(tenant_id="internal", name="Internal Operations", status="active"))
    db.commit()


def _permissions_for_role(role):
    if role in {"admin", "msp_admin", "owner"}:
        return set(TENANT_ADMIN_PERMISSIONS)
    if role in {"operator", "engineer"}:
        return set(TENANT_OPERATOR_PERMISSIONS)
    return set(TENANT_READ_PERMISSIONS)


def _clean_header(value):
    return str(value or "").strip() or "internal"

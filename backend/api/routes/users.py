from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from backend.database.session import SessionLocal
from backend.models.organization import Organization, OrganizationMembership
from backend.models.user import User
from backend.schemas.user import InternalUserCreate, InternalUserResponse, InternalUserUpdate
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter(prefix="/internal/users", tags=["internal-users"])


@router.get("", response_model=list[InternalUserResponse])
def list_internal_users(context: TenantContext = Depends(get_tenant_context)):
    """
    Return users with access to the current workspace.

    Inputs:
    - tenant context from the signed session or legacy workspace headers

    Output:
    - user records enriched with workspaceIds from OrganizationMembership

    Assumption:
    - A user may eventually belong to multiple workspaces; access is modeled
      through membership rows rather than destructive user duplication.
    """
    db = SessionLocal()

    try:
        memberships = (
            db.query(OrganizationMembership)
            .filter(OrganizationMembership.tenant_id == context.tenant_id)
            .order_by(OrganizationMembership.email)
            .all()
        )
        emails = sorted({membership.email for membership in memberships})
        users = db.query(User).filter(User.email.in_(emails)).all() if emails else []
        users_by_email = {user.email: user for user in users}
        return [
            _serialize_user(users_by_email.get(email), email, memberships)
            for email in emails
            if users_by_email.get(email)
        ]
    finally:
        db.close()


@router.post("", response_model=InternalUserResponse)
def create_internal_user(
    payload: InternalUserCreate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Invite a manual or SSO-ready user into one or more workspaces.

    Inputs:
    - email/display name
    - role and workspace_ids
    - auth_type (local now, sso for future provisioning)

    Output:
    - non-destructive user record with Invited status
    """
    require_permission(context, "organizations:write")
    db = SessionLocal()

    try:
        email = _normalize_email(payload.email)
        if not _valid_email(email):
            raise HTTPException(status_code=422, detail="Enter a valid email address")

        workspace_ids = _normalize_workspace_ids(payload.workspace_ids, context)
        _ensure_workspaces_exist(db, workspace_ids)

        user = db.query(User).filter(User.email == email).first()
        if user:
            user.display_name = payload.display_name or user.display_name
            user.role = payload.role
            user.auth_type = payload.auth_type
            if user.status == "disabled":
                raise HTTPException(status_code=409, detail="User is disabled; re-enable before changing access")
        else:
            user = User(
                email=email,
                display_name=payload.display_name or _display_from_email(email),
                tenant_id=context.tenant_id,
                organization_id=context.organization_id,
                role=payload.role,
                auth_type=payload.auth_type,
                status="invited",
                password_hash="internal-only",
            )
            db.add(user)
            db.flush()

        _sync_memberships(
            db,
            user=user,
            email=email,
            role=payload.role,
            workspace_ids=workspace_ids,
            replace=False,
        )
        db.commit()
        db.refresh(user)

        memberships = db.query(OrganizationMembership).filter(OrganizationMembership.email == email).all()
        return _serialize_user(user, email, memberships)
    finally:
        db.close()


@router.put("/{user_id}", response_model=InternalUserResponse)
def update_internal_user(
    user_id: int,
    payload: InternalUserUpdate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Update role, workspace access, display name or status for a user.

    Disabling is intentionally non-destructive: no memberships or historical
    activity are removed, so future audit and reactivation flows remain possible.
    """
    require_permission(context, "organizations:write")
    db = SessionLocal()

    try:
        user = _get_user_in_context(db, user_id, context)
        if payload.display_name is not None:
            user.display_name = payload.display_name
        if payload.role is not None:
            user.role = payload.role
        if payload.status is not None:
            user.status = payload.status
            user.disabled_at = datetime.utcnow() if payload.status == "disabled" else None
        if payload.workspace_ids is not None:
            workspace_ids = _normalize_workspace_ids(payload.workspace_ids, context)
            _ensure_workspaces_exist(db, workspace_ids)
            _sync_memberships(
                db,
                user=user,
                email=user.email,
                role=payload.role or user.role,
                workspace_ids=workspace_ids,
                replace=True,
            )
        elif payload.role is not None:
            (
                db.query(OrganizationMembership)
                .filter(OrganizationMembership.email == user.email)
                .update({"role": payload.role, "is_msp_admin": payload.role == "admin"})
            )

        db.commit()
        db.refresh(user)
        memberships = db.query(OrganizationMembership).filter(OrganizationMembership.email == user.email).all()
        return _serialize_user(user, user.email, memberships)
    finally:
        db.close()


@router.post("/{user_id}/disable", response_model=InternalUserResponse)
def disable_internal_user(
    user_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Deactivate a user without deleting the record or workspace memberships."""
    require_permission(context, "organizations:write")
    db = SessionLocal()

    try:
        user = _get_user_in_context(db, user_id, context)
        user.status = "disabled"
        user.disabled_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        memberships = db.query(OrganizationMembership).filter(OrganizationMembership.email == user.email).all()
        return _serialize_user(user, user.email, memberships)
    finally:
        db.close()


def _serialize_user(user: User | None, email: str, memberships: list[OrganizationMembership]):
    workspace_ids = sorted({membership.tenant_id for membership in memberships if membership.email == email})
    primary_membership = next((membership for membership in memberships if membership.email == email), None)
    role = user.role if user else (primary_membership.role if primary_membership else "viewer")
    return {
        "id": user.id if user else 0,
        "tenant_id": user.tenant_id if user else (workspace_ids[0] if workspace_ids else "internal"),
        "organization_id": user.organization_id if user else (workspace_ids[0] if workspace_ids else "internal"),
        "email": email,
        "display_name": user.display_name if user else _display_from_email(email),
        "role": role if role in {"admin", "operator", "viewer"} else "viewer",
        "workspace_ids": workspace_ids,
        "auth_type": user.auth_type if user else "local",
        "status": user.status if user else "invited",
        "last_login_at": user.last_login_at if user else None,
    }


def _get_user_in_context(db, user_id: int, context: TenantContext) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    membership = (
        db.query(OrganizationMembership)
        .filter(OrganizationMembership.email == user.email, OrganizationMembership.tenant_id == context.tenant_id)
        .first()
    )
    if not membership and user.tenant_id != context.tenant_id:
        raise HTTPException(status_code=404, detail="User not found in this workspace")
    return user


def _sync_memberships(db, user: User, email: str, role: str, workspace_ids: list[str], replace: bool):
    if replace:
        existing = db.query(OrganizationMembership).filter(OrganizationMembership.email == email).all()
        keep = set(workspace_ids)
        for membership in existing:
            if membership.tenant_id not in keep:
                db.delete(membership)

    for workspace_id in workspace_ids:
        membership = (
            db.query(OrganizationMembership)
            .filter(OrganizationMembership.email == email, OrganizationMembership.tenant_id == workspace_id)
            .first()
        )
        if membership:
            membership.user_id = user.id
            membership.role = role
            membership.is_msp_admin = role == "admin"
            continue
        db.add(
            OrganizationMembership(
                user_id=user.id,
                email=email,
                tenant_id=workspace_id,
                organization_id=workspace_id,
                role=role,
                is_msp_admin=role == "admin",
            )
        )


def _ensure_workspaces_exist(db, workspace_ids: list[str]):
    existing = {
        organization.tenant_id
        for organization in db.query(Organization).filter(Organization.tenant_id.in_(workspace_ids)).all()
    }
    missing = sorted(set(workspace_ids) - existing)
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown workspace(s): {', '.join(missing)}")


def _normalize_workspace_ids(workspace_ids: list[str], context: TenantContext) -> list[str]:
    values = [workspace_id.strip() for workspace_id in workspace_ids if workspace_id.strip()]
    return sorted(set(values or [context.tenant_id]))


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _valid_email(email: str) -> bool:
    return "@" in email and "." in email.rsplit("@", 1)[-1]


def _display_from_email(email: str) -> str:
    return email.split("@", 1)[0].replace(".", " ").replace("_", " ").title()

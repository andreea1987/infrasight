from datetime import datetime
import re

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

from backend.auth.jwt_handler import SESSION_COOKIE_NAME, create_session_token, decode_session_token
from backend.auth.password import hash_password, verify_password
from backend.config.settings import (
    AUTH_SESSION_EXPIRE_MINUTES,
    AUTH_COOKIE_SECURE,
    INFRASIGHT_BOOTSTRAP_ADMIN_EMAIL,
    INFRASIGHT_BOOTSTRAP_ADMIN_PASSWORD,
)
from backend.database.session import SessionLocal
from backend.models.organization import IntegrationSecret, Organization, OrganizationMembership, SsoProviderConfig
from backend.models.user import User
from backend.schemas.auth import (
    AuthSessionResponse,
    LocalLoginRequest,
    SsoProviderConfigCreate,
    SsoProviderConfigResponse,
    SsoProviderConfigUpdate,
    SsoStartRequest,
    SsoStartResponse,
    SsoTestResponse,
)
from backend.services.organization_service import _encrypt_secret, ensure_default_organization
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthSessionResponse)
def login(payload: LocalLoginRequest, response: Response):
    """
    Authenticate a local email/password user and issue a browser session.

    Inputs:
    - email/password from the sign-in page
    - optional workspace_id to select a tenant before sign-in

    Output:
    - HTTP-only cookie containing a signed session token
    - masked user/workspace context for the frontend shell

    Important assumption:
    - This is the local-auth path only; SAML/OIDC assertions will be handled by
      separate callback routes when provider integrations are implemented.
    """
    db = SessionLocal()

    try:
        if not _valid_email(payload.email):
            raise HTTPException(status_code=422, detail="Enter a valid email address")
        _ensure_bootstrap_admin(db)
        query = db.query(User).filter(User.email == payload.email.lower())
        if payload.workspace_id:
            query = query.filter(User.tenant_id == payload.workspace_id)
        user = query.first()

        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if user.status == "disabled":
            raise HTTPException(status_code=403, detail="User is disabled")

        user.status = "active"
        user.last_login_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        session = _serialize_auth_session(db, user)
        token = create_session_token(
            {
                "sub": user.email,
                "user_id": user.id,
                "tenant_id": user.tenant_id,
                "organization_id": user.organization_id,
                "role": user.role,
            }
        )
        _set_session_cookie(response, token)
        return session
    finally:
        db.close()


@router.get("/session", response_model=AuthSessionResponse)
def get_session(infrasight_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    """
    Return the current authenticated session from the HTTP-only cookie.

    Returns 401 when the cookie is missing or expired so the frontend can show
    the sign-in page without leaking any token material into JavaScript.
    """
    claims = decode_session_token(infrasight_session)
    if not claims:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == claims.get("user_id")).first()
        if not user:
            raise HTTPException(status_code=401, detail="Session user not found")
        return _serialize_auth_session(db, user)
    finally:
        db.close()


@router.post("/logout")
def logout(response: Response):
    """Clear the browser session cookie and leave backend data untouched."""
    response.delete_cookie(SESSION_COOKIE_NAME, path="/", samesite="lax")
    return {"status": "logged_out"}


@router.post("/sso/start", response_model=SsoStartResponse)
def start_sso(payload: SsoStartRequest):
    """
    Resolve the workspace SSO provider for a sign-in attempt.

    This endpoint owns provider lookup and redirect-target construction so the
    frontend never receives provider secrets. Real SAML/OIDC request signing and
    state validation are intentionally pending backend integration.
    """
    db = SessionLocal()
    try:
        provider = _find_sso_provider(db, payload)
        if not provider:
            return SsoStartResponse(
                status="not_configured",
                message="No enabled SSO provider is configured for that workspace yet.",
            )

        redirect_url = provider.authorization_url or provider.sso_url
        return SsoStartResponse(
            status="pending_backend_integration",
            provider_name=provider.provider_name,
            provider_type=provider.provider_type,
            redirect_url=redirect_url,
            message=(
                "Provider configuration was found, but SAML/OIDC request generation "
                "and callback validation still require backend integration."
            ),
        )
    finally:
        db.close()


@router.get("/sso/callback")
def sso_callback():
    """
    Placeholder callback for SAML/OIDC providers.

    Real implementation will validate signed assertions or OIDC code exchange,
    create/update the user, map groups to roles, and issue the same HTTP-only
    session cookie used by local auth.

    First-login SSO provisioning contract:
    - Provider must be enabled.
    - auto_provisioning_enabled must be true for unknown users.
    - User email domain must match allowed_domains when configured.
    - New users receive default_role until group-to-role mapping is wired.
    """
    raise HTTPException(status_code=501, detail="SSO callback validation is pending backend integration")


@router.get("/sso/providers", response_model=list[SsoProviderConfigResponse])
def list_sso_providers(context: TenantContext = Depends(get_tenant_context)):
    require_permission(context, "organizations:write")
    db = SessionLocal()
    try:
        providers = (
            db.query(SsoProviderConfig)
            .filter(SsoProviderConfig.tenant_id == context.tenant_id)
            .order_by(SsoProviderConfig.created_at.desc())
            .all()
        )
        return [_serialize_sso_provider(provider) for provider in providers]
    finally:
        db.close()


@router.post("/sso/providers", response_model=SsoProviderConfigResponse)
def create_sso_provider(
    payload: SsoProviderConfigCreate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Create tenant-scoped SSO provider configuration.

    Secrets are written to the integration secret store and only secret
    references/booleans are retained on the provider record.
    """
    require_permission(context, "organizations:write")
    db = SessionLocal()
    try:
        provider = SsoProviderConfig(
            tenant_id=context.tenant_id,
            organization_id=payload.workspace_id or context.organization_id,
            provider_name=payload.provider_name,
            provider_type=payload.provider_type,
            entity_id=payload.entity_id,
            client_id=payload.client_id,
            sso_url=payload.sso_url,
            authorization_url=payload.authorization_url,
            metadata_url=payload.metadata_url,
            callback_url=payload.callback_url,
            enabled=payload.enabled,
            auto_provisioning_enabled=payload.auto_provisioning_enabled,
            allowed_domains_json=payload.allowed_domains,
            default_role=payload.default_role,
            role_mapping_json=payload.role_mapping,
            scim_config_json=payload.scim,
            secret_refs_json={},
        )
        db.add(provider)
        db.flush()
        provider.secret_refs_json = _store_sso_secrets(db, provider, payload.certificate, payload.client_secret)
        db.commit()
        db.refresh(provider)
        return _serialize_sso_provider(provider)
    finally:
        db.close()


@router.put("/sso/providers/{provider_id}", response_model=SsoProviderConfigResponse)
def update_sso_provider(
    provider_id: int,
    payload: SsoProviderConfigUpdate,
    context: TenantContext = Depends(get_tenant_context),
):
    require_permission(context, "organizations:write")
    db = SessionLocal()
    try:
        provider = _get_provider_for_tenant(db, provider_id, context.tenant_id)
        for field in [
            "provider_name",
            "provider_type",
            "entity_id",
            "client_id",
            "sso_url",
            "authorization_url",
            "metadata_url",
            "callback_url",
            "enabled",
            "auto_provisioning_enabled",
            "default_role",
        ]:
            value = getattr(payload, field)
            if value is not None:
                setattr(provider, field, value)
        if payload.role_mapping is not None:
            provider.role_mapping_json = payload.role_mapping
        if payload.allowed_domains is not None:
            provider.allowed_domains_json = payload.allowed_domains
        if payload.scim is not None:
            provider.scim_config_json = payload.scim
        provider.secret_refs_json = {
            **(provider.secret_refs_json or {}),
            **_store_sso_secrets(db, provider, payload.certificate, payload.client_secret),
        }
        db.commit()
        db.refresh(provider)
        return _serialize_sso_provider(provider)
    finally:
        db.close()


@router.post("/sso/providers/{provider_id}/test", response_model=SsoTestResponse)
def test_sso_provider(
    provider_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Validate that an SSO provider has enough non-secret configuration to start.

    This is a read-only smoke test. It does not contact the external IdP until
    real SAML metadata or OIDC discovery integration is added.
    """
    require_permission(context, "organizations:write")
    db = SessionLocal()
    try:
        provider = _get_provider_for_tenant(db, provider_id, context.tenant_id)
        missing = []
        if not provider.callback_url:
            missing.append("callback URL")
        if provider.provider_type == "SAML" and not (provider.entity_id and provider.sso_url):
            missing.append("SAML entity ID and SSO URL")
        if provider.provider_type == "OIDC" and not (provider.client_id and provider.authorization_url):
            missing.append("OIDC client ID and authorization URL")

        provider.last_test_at = datetime.utcnow()
        if missing:
            provider.last_test_result = "failed"
            provider.last_test_error = f"Missing {', '.join(missing)}."
            status = "failed"
            detail = provider.last_test_error
        else:
            provider.last_test_result = "pending_backend_integration"
            provider.last_test_error = None
            status = "pending_backend_integration"
            detail = "Configuration is structurally valid. Live provider exchange is pending backend integration."
        db.commit()
        return SsoTestResponse(status=status, detail=detail, checked_at=provider.last_test_at)
    finally:
        db.close()


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite="lax",
        max_age=AUTH_SESSION_EXPIRE_MINUTES * 60,
        path="/",
    )


def _valid_email(value: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value or ""))


def _serialize_auth_session(db, user: User) -> AuthSessionResponse:
    workspaces = _workspaces_for_user(db, user.email)
    return AuthSessionResponse(
        authenticated=True,
        expires_in_minutes=AUTH_SESSION_EXPIRE_MINUTES,
        user={
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "workspace_id": user.tenant_id,
            "organization_id": user.organization_id,
            "workspaces": workspaces,
        },
    )


def _workspaces_for_user(db, email: str) -> list[dict]:
    memberships = (
        db.query(OrganizationMembership, Organization)
        .join(Organization, Organization.tenant_id == OrganizationMembership.tenant_id)
        .filter(OrganizationMembership.email == email, Organization.status == "active")
        .order_by(Organization.name)
        .all()
    )
    return [
        {"id": organization.tenant_id, "name": organization.name, "role": membership.role}
        for membership, organization in memberships
    ]


def _ensure_bootstrap_admin(db) -> None:
    ensure_default_organization(db)
    email = INFRASIGHT_BOOTSTRAP_ADMIN_EMAIL.lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            display_name="InfraSight Admin",
            tenant_id="internal",
            organization_id="internal",
            role="admin",
            auth_type="local",
            status="active",
            password_hash=hash_password(INFRASIGHT_BOOTSTRAP_ADMIN_PASSWORD),
        )
        db.add(user)
        db.flush()
    else:
        user.status = "active" if user.status != "disabled" else user.status
        user.auth_type = user.auth_type or "local"
        user.display_name = user.display_name or "InfraSight Admin"

    membership = (
        db.query(OrganizationMembership)
        .filter(OrganizationMembership.email == email, OrganizationMembership.tenant_id == "internal")
        .first()
    )
    if not membership:
        db.add(
            OrganizationMembership(
                user_id=user.id,
                email=email,
                tenant_id="internal",
                organization_id="internal",
                role="admin",
                is_msp_admin=True,
            )
        )
    db.commit()


def _find_sso_provider(db, payload: SsoStartRequest) -> SsoProviderConfig | None:
    query = db.query(SsoProviderConfig).filter(SsoProviderConfig.enabled.is_(True))
    if payload.provider_id:
        query = query.filter(SsoProviderConfig.id == payload.provider_id)
    if payload.workspace_id:
        query = query.filter(SsoProviderConfig.tenant_id == payload.workspace_id)
    return query.order_by(SsoProviderConfig.created_at.desc()).first()


def _get_provider_for_tenant(db, provider_id: int, tenant_id: str) -> SsoProviderConfig:
    provider = (
        db.query(SsoProviderConfig)
        .filter(SsoProviderConfig.id == provider_id, SsoProviderConfig.tenant_id == tenant_id)
        .first()
    )
    if not provider:
        raise HTTPException(status_code=404, detail="SSO provider not found")
    return provider


def _store_sso_secrets(
    db,
    provider: SsoProviderConfig,
    certificate: str | None,
    client_secret: str | None,
) -> dict:
    refs = {}
    for key, value in {"certificate": certificate, "client_secret": client_secret}.items():
        if not value:
            continue
        secret = IntegrationSecret(
            tenant_id=provider.tenant_id,
            organization_id=provider.organization_id,
            provider="sso",
            name=f"sso:{provider.id}:{key}",
            encrypted_value=_encrypt_secret(value),
            metadata_json={"provider_id": provider.id, "secret_type": key},
        )
        db.add(secret)
        db.flush()
        refs[key] = secret.name
    return refs


def _serialize_sso_provider(provider: SsoProviderConfig) -> dict:
    secret_refs = provider.secret_refs_json or {}
    has_certificate = bool(secret_refs.get("certificate"))
    has_client_secret = bool(secret_refs.get("client_secret"))
    return {
        "id": provider.id,
        "workspace_id": provider.organization_id,
        "provider_name": provider.provider_name,
        "provider_type": provider.provider_type,
        "entity_id": provider.entity_id,
        "client_id": provider.client_id,
        "sso_url": provider.sso_url,
        "authorization_url": provider.authorization_url,
        "metadata_url": provider.metadata_url,
        "callback_url": provider.callback_url,
        "enabled": provider.enabled,
        "auto_provisioning_enabled": provider.auto_provisioning_enabled,
        "allowed_domains": provider.allowed_domains_json or [],
        "default_role": provider.default_role or "viewer",
        "role_mapping": provider.role_mapping_json or {},
        "scim": provider.scim_config_json or {},
        "has_certificate": has_certificate,
        "has_client_secret": has_client_secret,
        "masked_certificate": "configured" if has_certificate else None,
        "masked_client_secret": "••••••••" if has_client_secret else None,
        "last_test_at": provider.last_test_at,
        "last_test_result": provider.last_test_result,
        "last_test_error": provider.last_test_error,
        "created_at": provider.created_at,
        "updated_at": provider.updated_at,
    }

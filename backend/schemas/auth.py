from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


RoleName = Literal["admin", "operator", "viewer"]
SsoProviderType = Literal["SAML", "OIDC"]


class LocalLoginRequest(BaseModel):
    email: str
    password: str
    workspace_id: Optional[str] = None


class AuthWorkspace(BaseModel):
    id: str
    name: str
    role: str


class AuthUserResponse(BaseModel):
    id: int
    email: str
    role: str
    workspace_id: str
    organization_id: str
    workspaces: list[AuthWorkspace] = Field(default_factory=list)


class AuthSessionResponse(BaseModel):
    authenticated: bool
    user: AuthUserResponse
    expires_in_minutes: int


class SsoProviderConfigBase(BaseModel):
    provider_name: str
    provider_type: SsoProviderType
    entity_id: Optional[str] = None
    client_id: Optional[str] = None
    sso_url: Optional[str] = None
    authorization_url: Optional[str] = None
    metadata_url: Optional[str] = None
    callback_url: Optional[str] = None
    workspace_id: str = "internal"
    enabled: bool = False
    auto_provisioning_enabled: bool = False
    allowed_domains: list[str] = Field(default_factory=list)
    default_role: RoleName = "viewer"
    role_mapping: dict[str, RoleName] = Field(default_factory=dict)
    scim: dict = Field(default_factory=dict)


class SsoProviderConfigCreate(SsoProviderConfigBase):
    certificate: Optional[str] = None
    client_secret: Optional[str] = None


class SsoProviderConfigUpdate(BaseModel):
    provider_name: Optional[str] = None
    provider_type: Optional[SsoProviderType] = None
    entity_id: Optional[str] = None
    client_id: Optional[str] = None
    sso_url: Optional[str] = None
    authorization_url: Optional[str] = None
    metadata_url: Optional[str] = None
    callback_url: Optional[str] = None
    enabled: Optional[bool] = None
    auto_provisioning_enabled: Optional[bool] = None
    allowed_domains: Optional[list[str]] = None
    default_role: Optional[RoleName] = None
    role_mapping: Optional[dict[str, RoleName]] = None
    scim: Optional[dict] = None
    certificate: Optional[str] = None
    client_secret: Optional[str] = None


class SsoProviderConfigResponse(SsoProviderConfigBase):
    id: int
    has_certificate: bool = False
    has_client_secret: bool = False
    masked_certificate: Optional[str] = None
    masked_client_secret: Optional[str] = None
    last_test_at: Optional[datetime] = None
    last_test_result: Optional[str] = None
    last_test_error: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class SsoStartRequest(BaseModel):
    email: Optional[str] = None
    workspace_id: Optional[str] = None
    provider_id: Optional[int] = None


class SsoStartResponse(BaseModel):
    status: str
    provider_name: Optional[str] = None
    provider_type: Optional[str] = None
    redirect_url: Optional[str] = None
    message: str


class SsoTestResponse(BaseModel):
    status: str
    detail: str
    checked_at: datetime

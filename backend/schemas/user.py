from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


RoleName = Literal["admin", "operator", "viewer"]
UserStatus = Literal["invited", "active", "disabled"]
AuthType = Literal["local", "sso"]


class InternalUserCreate(BaseModel):
    email: str
    display_name: str | None = None
    role: RoleName = "operator"
    workspace_ids: list[str] = Field(default_factory=list)
    auth_type: AuthType = "local"


class InternalUserResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    role: RoleName
    email: str
    display_name: str | None = None
    workspace_ids: list[str] = Field(default_factory=list)
    auth_type: AuthType = "local"
    status: UserStatus = "invited"
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True


class InternalUserUpdate(BaseModel):
    display_name: str | None = None
    role: RoleName | None = None
    workspace_ids: list[str] | None = None
    status: UserStatus | None = None

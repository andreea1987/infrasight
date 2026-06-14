from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OrganizationCreate(BaseModel):
    tenant_id: str = Field(default="internal", pattern=r"^[a-zA-Z0-9_.:-]+$")
    name: str
    status: str = "active"


class OrganizationResponse(BaseModel):
    id: int
    tenant_id: str
    name: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class OrganizationContextResponse(BaseModel):
    tenant_id: str
    organization_id: str
    organization_name: str
    role: str
    is_msp_admin: bool
    permissions: list[str] = Field(default_factory=list)


class IntegrationSecretCreate(BaseModel):
    provider: str
    name: str
    value: str
    organization_id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class IntegrationSecretResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    provider: str
    name: str
    metadata: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None

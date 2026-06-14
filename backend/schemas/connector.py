from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ConnectorCapability(BaseModel):
    key: str
    label: str


class ConnectorCatalogItem(BaseModel):
    connector_type: str
    label: str
    platform: str
    description: str
    supports_agents: bool = True
    capabilities: list[ConnectorCapability] = Field(default_factory=list)


class ConnectorRegistrationCreate(BaseModel):
    connector_type: str
    name: str
    organization_id: str = "internal"
    status: str = "enabled"
    config: dict = Field(default_factory=dict)


class ConnectorRegistrationResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    connector_type: str
    name: str
    status: str
    config: dict = Field(default_factory=dict)
    last_status: str
    last_checked_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ConnectorHealthResponse(BaseModel):
    connector_type: str
    label: str
    status: str
    resources: int
    metrics: int
    alerts: int
    capabilities: list[str] = Field(default_factory=list)
    message: str = ""

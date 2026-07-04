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


class WorkspaceCreate(BaseModel):
    organization_id: int
    name: str
    environment: str = "production"


class WorkspaceResponse(BaseModel):
    id: int
    organization_id: int
    name: str
    environment: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class ConnectorCredentialCreate(BaseModel):
    type: str
    value: str


class ConnectorCredentialMetadataResponse(BaseModel):
    id: int
    connector_id: int
    type: str
    created_at: datetime


class ConnectorCreate(BaseModel):
    workspace_id: int
    provider: str
    connection_type: str
    status: str = "created"
    health: dict = Field(default_factory=dict)
    configuration: dict = Field(default_factory=dict)
    credentials: list[ConnectorCredentialCreate] = Field(default_factory=list)


class ConnectorSaveRequest(BaseModel):
    workspace_id: Optional[int] = None
    provider: str
    connection_type: str
    status: str = "saved"
    health: dict = Field(default_factory=dict)
    configuration: dict = Field(default_factory=dict)
    credentials: list[ConnectorCredentialCreate] = Field(default_factory=list)


class ConnectorResponse(BaseModel):
    id: int
    workspace_id: int
    provider: str
    connection_type: str
    status: str
    health: dict = Field(default_factory=dict)
    configuration: dict = Field(default_factory=dict)
    last_sync: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ConnectorSyncCreate(BaseModel):
    connector_id: int
    status: str = "running"
    resources_discovered: int = 0
    error_message: Optional[str] = None


class ConnectorSyncResponse(BaseModel):
    id: int
    connector_id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str
    resources_discovered: int
    error_message: Optional[str] = None


class DiscoveredResourceCreate(BaseModel):
    connector_id: int
    provider: str
    resource_type: str
    name: str
    metadata: dict = Field(default_factory=dict)
    health: dict = Field(default_factory=dict)
    status: str = "unknown"


class DiscoveredResourceResponse(BaseModel):
    id: int
    connector_id: int
    provider: str
    resource_type: str
    name: str
    metadata: dict = Field(default_factory=dict)
    health: dict = Field(default_factory=dict)
    status: str
    last_seen: datetime


class ConnectorStatusResponse(BaseModel):
    connector_id: int
    workspace_id: int
    provider: str
    connection_type: str
    status: str
    health: dict = Field(default_factory=dict)
    last_sync: Optional[datetime] = None
    resources_discovered: int = 0
    last_operation: Optional[str] = None
    updated_at: Optional[datetime] = None


class ConnectorOperationResponse(BaseModel):
    operation: str
    status: str
    outcome: str
    message: str
    connector: ConnectorResponse
    resources: list[DiscoveredResourceResponse] = Field(default_factory=list)
    sync: Optional[ConnectorSyncResponse] = None

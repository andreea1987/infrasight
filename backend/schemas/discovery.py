from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DiscoveryTarget(BaseModel):
    discovery_type: str
    name: str
    organization_id: str = "internal"
    config: dict = Field(default_factory=dict)


class DiscoveryRunRequest(BaseModel):
    discovery_types: list[str] = Field(default_factory=list)
    trigger: str = "manual"
    organization_id: str = "internal"
    config: dict = Field(default_factory=dict)


class DiscoveredAssetResponse(BaseModel):
    provider: str
    resource_id: str
    resource_type: str
    name: str
    region: str
    status: str
    tags: dict = Field(default_factory=dict)
    monitoring_profile: str
    metadata: dict = Field(default_factory=dict)


class DiscoveryRunResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    discovery_type: str
    trigger: str
    status: str
    assets_discovered: int
    assets_created: int
    assets_updated: int
    relationships_created: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class DiscoverySummaryResponse(BaseModel):
    supported_types: list[str]
    recent_runs: list[DiscoveryRunResponse] = Field(default_factory=list)
    topology_relationships: int
    monitoring_profiles: dict = Field(default_factory=dict)
    agent_ready: bool
    event_driven_ready: bool
    kubernetes_ready: bool

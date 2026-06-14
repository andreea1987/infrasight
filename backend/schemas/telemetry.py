from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LogEntryResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    connector_id: Optional[int] = None
    resource_id: Optional[int] = None
    source: str
    severity: str
    message: str
    timestamp: datetime
    metadata: dict = Field(default_factory=dict)


class SyncRunResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    connector_id: Optional[int] = None
    connector_type: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    resources_collected: int
    metrics_collected: int
    logs_collected: int
    alerts_created: int
    error: Optional[str] = None
    metadata: dict = Field(default_factory=dict)

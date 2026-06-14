from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MetricSampleCreate(BaseModel):
    resource_id: int
    metric_name: str
    value: float
    unit: str
    metadata: dict = Field(default_factory=dict)


class MetricSampleResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    resource_id: int
    metric_name: str
    value: float
    unit: str
    collected_at: datetime
    metadata: dict = Field(default_factory=dict)


class AlertResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    resource_id: int
    fingerprint: Optional[str] = None
    title: str
    description: Optional[str] = None
    severity: str
    status: str
    source: str
    metric_name: Optional[str] = None
    metric_value: Optional[float] = None
    threshold: Optional[float] = None
    created_at: datetime
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    investigating_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    assigned_to: Optional[str] = None
    investigation_notes: Optional[str] = None
    resolution_notes: Optional[str] = None
    root_cause: Optional[str] = None
    resolution_category: Optional[str] = None
    resolved_by: Optional[str] = None
    closed_by: Optional[str] = None
    success_rating: Optional[int] = None
    metadata: dict = Field(default_factory=dict)


class AlertStatusUpdate(BaseModel):
    status: str
    investigation_notes: Optional[str] = None
    resolution_notes: Optional[str] = None
    root_cause: Optional[str] = None
    resolution_category: Optional[str] = None
    resolved_by: Optional[str] = None
    success_rating: Optional[int] = None


class MonitoringSummaryResponse(BaseModel):
    total_resources: int
    healthy_percentage: int
    running_percentage: int
    open_alerts: int
    critical_alerts: int
    warning_alerts: int

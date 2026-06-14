from datetime import datetime

from pydantic import BaseModel, Field


class NotificationChannelCreate(BaseModel):
    name: str
    channel_type: str
    target: str
    enabled: bool = True
    config: dict = Field(default_factory=dict)


class NotificationChannelResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    name: str
    channel_type: str
    target: str
    enabled: bool
    config: dict = Field(default_factory=dict)
    created_at: datetime
    last_status: str
    last_test_at: datetime | None = None
    last_test_result: str | None = None
    last_test_error: str | None = None


class AlertDeliveryResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    alert_id: int | None = None
    channel_id: int | None = None
    channel_type: str
    target: str
    status: str
    detail: str | None = None
    response_time_ms: int | None = None
    sent_at: datetime


class SmtpConfigUpdate(BaseModel):
    host: str | None = None
    port: int = 587
    username: str | None = None
    password: str | None = None
    from_email: str = "alerts@infrasight.local"
    use_tls: bool = True


class SmtpConfigResponse(BaseModel):
    is_configured: bool
    host: str | None = None
    port: int = 587
    username: str | None = None
    has_password: bool = False
    from_email: str = "alerts@infrasight.local"
    use_tls: bool = True
    last_test_at: datetime | None = None
    last_test_result: str | None = None
    last_test_error: str | None = None

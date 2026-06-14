from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class OpenClawChatMessage(BaseModel):
    role: Literal["user", "assistant", "tool"]
    content: str


class OpenClawChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    history: list[OpenClawChatMessage] = Field(default_factory=list)


class OpenClawChatResponse(BaseModel):
    conversation_id: str
    mode: str
    answer: str
    tools_used: list[str] = Field(default_factory=list)


class RestartServiceRequest(BaseModel):
    service_name: str
    reason: str = "Requested through OpenClaw"


class OpenClawAuditLogResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    conversation_id: Optional[str] = None
    actor: str
    event_type: str
    mode: str
    tool_name: Optional[str] = None
    status: str
    request_payload: dict = Field(default_factory=dict)
    response_payload: dict = Field(default_factory=dict)
    summary: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

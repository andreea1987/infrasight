from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, JSON, String, Text

from backend.database.base import Base


class OpenClawAuditLog(Base):
    __tablename__ = "openclaw_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    conversation_id = Column(String, index=True)
    actor = Column(String, default="dashboard")
    event_type = Column(String, index=True)
    mode = Column(String, index=True)
    tool_name = Column(String, nullable=True, index=True)
    status = Column(String, index=True)
    request_payload = Column(JSON)
    response_payload = Column(JSON)
    summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

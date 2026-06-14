from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text

from backend.database.base import Base


class LogEntry(Base):
    __tablename__ = "log_entries"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    connector_id = Column(Integer, ForeignKey("connector_registrations.id"), nullable=True, index=True)
    resource_id = Column(Integer, ForeignKey("resources.id"), nullable=True, index=True)
    source = Column(String, index=True)
    severity = Column(String, index=True)
    message = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    metadata_json = Column(JSON)


class SyncRun(Base):
    __tablename__ = "sync_runs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    connector_id = Column(Integer, ForeignKey("connector_registrations.id"), nullable=True, index=True)
    connector_type = Column(String, index=True)
    status = Column(String, default="running", index=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at = Column(DateTime, nullable=True)
    resources_collected = Column(Integer, default=0)
    metrics_collected = Column(Integer, default=0)
    logs_collected = Column(Integer, default=0)
    alerts_created = Column(Integer, default=0)
    error = Column(Text, nullable=True)
    metadata_json = Column(JSON)

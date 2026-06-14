from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, JSON, String

from backend.database.base import Base


class ConnectorRegistration(Base):
    __tablename__ = "connector_registrations"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    connector_type = Column(String, index=True)
    name = Column(String)
    status = Column(String, default="enabled", index=True)
    config_json = Column(JSON)
    last_status = Column(String, default="never_run")
    last_checked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

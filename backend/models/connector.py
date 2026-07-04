from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.database.base import Base


class Connector(Base):
    __tablename__ = "connectors"
    __table_args__ = (
        UniqueConstraint("workspace_id", "provider", "connection_type", name="uq_connector_workspace_provider_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)
    connection_type = Column(String, nullable=False, index=True)
    status = Column(String, default="created", index=True)
    health_json = Column("health", JSON, default=dict)
    configuration_json = Column("configuration", JSON, default=dict)
    last_sync = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="connectors")
    credentials = relationship("ConnectorCredential", back_populates="connector", cascade="all, delete-orphan")
    sync_runs = relationship("ConnectorSync", back_populates="connector", cascade="all, delete-orphan")
    discovered_resources = relationship("DiscoveredResource", back_populates="connector", cascade="all, delete-orphan")


class ConnectorCredential(Base):
    __tablename__ = "connector_credentials"

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id"), nullable=False, index=True)
    type = Column(String, nullable=False, index=True)
    encrypted_value = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    connector = relationship("Connector", back_populates="credentials")


class ConnectorSync(Base):
    __tablename__ = "connector_syncs"

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id"), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    finished_at = Column(DateTime, nullable=True, index=True)
    status = Column(String, default="running", index=True)
    resources_discovered = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    connector = relationship("Connector", back_populates="sync_runs")


class DiscoveredResource(Base):
    __tablename__ = "discovered_resources"
    __table_args__ = (
        UniqueConstraint("connector_id", "provider", "resource_type", "name", name="uq_discovered_resource_connector_ref"),
    )

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    metadata_json = Column("metadata", JSON, default=dict)
    health_json = Column("health", JSON, default=dict)
    status = Column(String, default="unknown", index=True)
    last_seen = Column(DateTime, default=datetime.utcnow, index=True)

    connector = relationship("Connector", back_populates="discovered_resources")


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

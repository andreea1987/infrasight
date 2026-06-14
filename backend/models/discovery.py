from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from backend.database.base import Base


class DiscoveryRun(Base):
    __tablename__ = "discovery_runs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    discovery_type = Column(String, index=True)
    trigger = Column(String, default="manual", index=True)
    status = Column(String, default="running", index=True)
    assets_discovered = Column(Integer, default=0)
    assets_created = Column(Integer, default=0)
    assets_updated = Column(Integer, default=0)
    relationships_created = Column(Integer, default=0)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(String, nullable=True)
    metadata_json = Column(JSON)


class ResourceTag(Base):
    __tablename__ = "resource_tags"

    id = Column(Integer, primary_key=True, index=True)
    resource_id = Column(Integer, ForeignKey("resources.id"), index=True, nullable=False)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    key = Column(String, index=True)
    value = Column(String)
    source = Column(String, default="discovery")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ResourceRelationship(Base):
    __tablename__ = "resource_relationships"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    source_resource_id = Column(Integer, ForeignKey("resources.id"), index=True, nullable=False)
    target_resource_id = Column(Integer, ForeignKey("resources.id"), index=True, nullable=False)
    relationship_type = Column(String, index=True)
    source = Column(String, default="discovery")
    metadata_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class MonitoringProfileAssignment(Base):
    __tablename__ = "monitoring_profile_assignments"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    resource_id = Column(Integer, ForeignKey("resources.id"), index=True, nullable=False)
    profile_name = Column(String, index=True)
    source = Column(String, default="auto")
    metadata_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint

from backend.database.base import Base


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    resource_id = Column(Integer, ForeignKey("resources.id"), index=True, nullable=False)

    title = Column(String)
    description = Column(Text)
    severity = Column(String, index=True)
    status = Column(String, default="open", index=True)
    source = Column(String, index=True)
    fingerprint = Column(String, nullable=True, index=True)

    metric_name = Column(String, nullable=True)
    metric_value = Column(Float, nullable=True)
    threshold = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_seen_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    acknowledged_at = Column(DateTime, nullable=True)
    investigating_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True, index=True)
    assigned_to = Column(String, nullable=True)
    investigation_notes = Column(Text, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    root_cause = Column(Text, nullable=True)
    resolution_category = Column(String, nullable=True, index=True)
    resolved_by = Column(String, nullable=True)
    closed_by = Column(String, nullable=True)
    success_rating = Column(Integer, nullable=True)
    metadata_json = Column(JSON)


class AlertHistory(Base):
    __tablename__ = "alert_history"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    alert_id = Column(Integer, ForeignKey("alerts.id"), index=True, nullable=False)

    event_type = Column(String, index=True)
    from_status = Column(String, nullable=True, index=True)
    to_status = Column(String, nullable=True, index=True)
    actor = Column(String, default="system", index=True)
    message = Column(Text, nullable=True)
    before_json = Column(JSON)
    after_json = Column(JSON)
    metadata_json = Column(JSON)
    event_at = Column(DateTime, default=datetime.utcnow, index=True)


class IncidentKnowledge(Base):
    __tablename__ = "incident_knowledge"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    source_alert_id = Column(Integer, ForeignKey("alerts.id"), nullable=True, index=True)
    incident_key = Column(String, index=True)

    title = Column(String)
    summary = Column(Text, nullable=True)
    affected_resource_ids_json = Column(JSON)
    providers_json = Column(JSON)
    resource_types_json = Column(JSON)
    alert_sources_json = Column(JSON)
    metric_names_json = Column(JSON)
    severity = Column(String, index=True)
    symptoms = Column(Text, nullable=True)
    root_cause = Column(Text, nullable=True)
    investigation_notes = Column(Text, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    resolution_category = Column(String, nullable=True, index=True)
    runbook_steps_json = Column(JSON)
    prevention_notes = Column(Text, nullable=True)
    verified_by = Column(String, nullable=True)
    confidence_score = Column(Integer, nullable=True)
    success_rating = Column(Integer, nullable=True)
    occurrence_count = Column(Integer, default=1)
    first_seen_at = Column(DateTime, nullable=True, index=True)
    last_seen_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    metadata_json = Column(JSON)


class OpenClawResolutionLibrary(Base):
    __tablename__ = "openclaw_resolution_library"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    incident_knowledge_id = Column(Integer, ForeignKey("incident_knowledge.id"), index=True, nullable=False)

    pattern_key = Column(String, index=True)
    problem_signature = Column(Text)
    environment_signature_json = Column(JSON)
    recommended_resolution = Column(Text, nullable=True)
    ordered_steps_json = Column(JSON)
    contraindications_json = Column(JSON)
    required_permissions_json = Column(JSON)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    avg_time_to_resolve_seconds = Column(Integer, nullable=True)
    last_used_at = Column(DateTime, nullable=True, index=True)
    last_success_at = Column(DateTime, nullable=True, index=True)
    search_document = Column(Text, nullable=True)
    embedding_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "incident_knowledge_id",
            name="uq_openclaw_resolution_library_incident",
        ),
    )

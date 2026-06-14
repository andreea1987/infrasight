from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String

from backend.database.base import Base


class MetricSample(Base):
    __tablename__ = "metric_samples"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    resource_id = Column(Integer, ForeignKey("resources.id"), index=True, nullable=False)

    metric_name = Column(String, index=True)
    value = Column(Float)
    unit = Column(String)

    collected_at = Column(DateTime, default=datetime.utcnow, index=True)
    metadata_json = Column(JSON)

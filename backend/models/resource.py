from sqlalchemy import Column, Integer, String, JSON

from backend.database.base import Base


class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)

    provider = Column(String)
    resource_id = Column(String, unique=True)
    resource_type = Column(String)

    name = Column(String)
    region = Column(String)
    status = Column(String)

    metadata_json = Column(JSON)

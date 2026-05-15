from sqlalchemy import Column, Integer, String, JSON

from backend.database.base import Base

class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)

    provider = Column(String)
    resource_type = Column(String)

    name = Column(String)

    region = Column(String)

    status = Column(String)

    metadata_json = Column(JSON)

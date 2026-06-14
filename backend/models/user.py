from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from backend.database.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    role = Column(String, default="operator", index=True)

    email = Column(String, unique=True, index=True)
    display_name = Column(String, nullable=True)
    auth_type = Column(String, default="local", index=True)
    status = Column(String, default="invited", index=True)
    last_login_at = Column(DateTime, nullable=True)
    invited_at = Column(DateTime, default=datetime.utcnow, index=True)
    disabled_at = Column(DateTime, nullable=True)

    password_hash = Column(String)

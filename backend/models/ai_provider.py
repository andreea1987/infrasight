from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from backend.database.base import Base


class OpenClawAiProvider(Base):
    """
    Workspace-scoped AI provider configuration for OpenClaw.

    Stores:
    - provider metadata used by the Settings UI
    - masked status/test metadata returned to the frontend
    - encrypted API secret used only by backend OpenClaw calls

    Assumption:
    - Provider configs are read by OpenClaw only after workspace-scoped tool
      data has already been collected; providers never query InfraSight data
      outside the selected workspace.
    """

    __tablename__ = "openclaw_ai_providers"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    provider_name = Column(String, index=True)
    provider_type = Column(String, default="builtin", index=True)
    base_url = Column(Text, nullable=True)
    encrypted_secret = Column(Text, nullable=True)
    model_name = Column(String, nullable=True)
    enabled = Column(Boolean, default=True, index=True)
    is_active = Column(Boolean, default=False, index=True)
    last_test_at = Column(DateTime, nullable=True)
    last_test_result = Column(String, nullable=True)
    last_test_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

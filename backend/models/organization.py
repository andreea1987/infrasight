from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text

from backend.database.base import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, unique=True, index=True)
    name = Column(String)
    status = Column(String, default="active", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    email = Column(String, index=True)
    tenant_id = Column(String, index=True)
    organization_id = Column(String, index=True)
    role = Column(String, default="operator", index=True)
    is_msp_admin = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class IntegrationSecret(Base):
    __tablename__ = "integration_secrets"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    provider = Column(String, index=True)
    name = Column(String, index=True)
    encrypted_value = Column(Text)
    metadata_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SsoProviderConfig(Base):
    __tablename__ = "sso_provider_configs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    provider_name = Column(String, index=True)
    provider_type = Column(String, index=True)
    entity_id = Column(String, nullable=True)
    client_id = Column(String, nullable=True)
    sso_url = Column(Text, nullable=True)
    authorization_url = Column(Text, nullable=True)
    metadata_url = Column(Text, nullable=True)
    callback_url = Column(Text, nullable=True)
    enabled = Column(Boolean, default=False, index=True)
    auto_provisioning_enabled = Column(Boolean, default=False, index=True)
    allowed_domains_json = Column(JSON, default=list)
    default_role = Column(String, default="viewer")
    role_mapping_json = Column(JSON, default=dict)
    scim_config_json = Column(JSON, default=dict)
    secret_refs_json = Column(JSON, default=dict)
    last_test_at = Column(DateTime, nullable=True)
    last_test_result = Column(String, nullable=True)
    last_test_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

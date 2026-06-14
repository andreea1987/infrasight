from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text

from backend.database.base import Base


class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    name = Column(String)
    channel_type = Column(String, index=True)
    target = Column(String)
    enabled = Column(Boolean, default=True, index=True)
    config_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_status = Column(String, default="never_sent")
    # Test-tracking fields — populated by the /test endpoint
    last_test_at = Column(DateTime, nullable=True)
    last_test_result = Column(String, nullable=True)   # "sent" | "failed" | "skipped"
    last_test_error = Column(Text, nullable=True)


class AlertDelivery(Base):
    __tablename__ = "alert_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="internal", index=True)
    organization_id = Column(String, default="internal", index=True)
    alert_id = Column(Integer, ForeignKey("alerts.id"), index=True, nullable=True)
    channel_id = Column(Integer, ForeignKey("notification_channels.id"), nullable=True)
    channel_type = Column(String, index=True)
    target = Column(String)
    status = Column(String, index=True)
    detail = Column(Text)
    response_time_ms = Column(Integer, nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow, index=True)


class SmtpConfig(Base):
    """Per-tenant SMTP configuration stored in the database.

    Complements (and overrides) the global SMTP_* env-var defaults so that
    each MSP client can configure their own mail relay without touching the
    server environment.  The password is stored in plaintext for now — it is
    never returned via the API; callers receive ``has_password`` instead.
    """

    __tablename__ = "smtp_configs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, unique=True, index=True)
    host = Column(String, nullable=True)
    port = Column(Integer, default=587)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    from_email = Column(String, default="alerts@infrasight.local")
    use_tls = Column(Boolean, default=True)
    last_test_at = Column(DateTime, nullable=True)
    last_test_result = Column(String, nullable=True)
    last_test_error = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

from sqlalchemy import inspect, text


TENANT_COLUMNS = {
    "resources": ("tenant_id", "organization_id"),
    "users": ("tenant_id", "organization_id", "role"),
    "alerts": ("tenant_id", "organization_id"),
    "alert_history": ("tenant_id", "organization_id"),
    "incident_knowledge": ("tenant_id", "organization_id"),
    "openclaw_resolution_library": ("tenant_id", "organization_id"),
    "metric_samples": ("tenant_id", "organization_id"),
    "openclaw_audit_logs": ("tenant_id", "organization_id"),
    "resource_tags": ("organization_id",),
    "resource_relationships": ("organization_id",),
    "monitoring_profile_assignments": ("organization_id",),
    "notification_channels": ("tenant_id", "organization_id"),
    "alert_deliveries": ("tenant_id", "organization_id"),
    "sso_provider_configs": ("tenant_id", "organization_id"),
}

# (table, column, DDL fragment) — added idempotently at startup
ADDITIVE_COLUMNS = [
    # Incident knowledge fields for alert lifecycle and resolution library.
    ("alerts", "fingerprint", "VARCHAR"),
    ("alerts", "first_seen_at", "TIMESTAMP"),
    ("alerts", "last_seen_at", "TIMESTAMP"),
    ("alerts", "acknowledged_at", "TIMESTAMP"),
    ("alerts", "investigating_at", "TIMESTAMP"),
    ("alerts", "closed_at", "TIMESTAMP"),
    ("alerts", "archived_at", "TIMESTAMP"),
    ("alerts", "assigned_to", "VARCHAR"),
    ("alerts", "investigation_notes", "TEXT"),
    ("alerts", "resolution_notes", "TEXT"),
    ("alerts", "root_cause", "TEXT"),
    ("alerts", "resolution_category", "VARCHAR"),
    ("alerts", "resolved_by", "VARCHAR"),
    ("alerts", "closed_by", "VARCHAR"),
    ("alerts", "success_rating", "INTEGER"),
    # User-management columns; workspace access is still represented by memberships.
    ("users", "display_name", "VARCHAR"),
    ("users", "auth_type", "VARCHAR DEFAULT 'local'"),
    ("users", "status", "VARCHAR DEFAULT 'invited'"),
    ("users", "last_login_at", "TIMESTAMP"),
    ("users", "invited_at", "TIMESTAMP"),
    ("users", "disabled_at", "TIMESTAMP"),
    # Future SSO provisioning controls.
    ("sso_provider_configs", "auto_provisioning_enabled", "BOOLEAN DEFAULT FALSE"),
    ("sso_provider_configs", "allowed_domains_json", "JSON"),
    ("sso_provider_configs", "default_role", "VARCHAR DEFAULT 'viewer'"),
    ("sso_provider_configs", "scim_config_json", "JSON"),
    # Channel test-result tracking
    ("notification_channels", "last_test_at",     "TIMESTAMP"),
    ("notification_channels", "last_test_result",  "VARCHAR"),
    ("notification_channels", "last_test_error",   "TEXT"),
    # Delivery response-time tracking
    ("alert_deliveries",      "response_time_ms",  "INTEGER"),
]

# Columns that need their NOT NULL constraint removed.
# alert_deliveries.alert_id was originally non-nullable but test deliveries
# (from the /test endpoint) have no associated alert row, so NULL must be allowed.
NULLABLE_COLUMNS = [
    ("alert_deliveries", "alert_id"),
]


def ensure_multi_tenant_schema(engine):
    """Small runtime migration for the demo foundation until Alembic owns migrations."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        for table, columns in TENANT_COLUMNS.items():
            if table not in existing_tables:
                continue

            existing_columns = {column["name"] for column in inspector.get_columns(table)}
            for column in columns:
                if column not in existing_columns:
                    default = "operator" if column == "role" else "internal"
                    connection.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {column} VARCHAR DEFAULT '{default}'")
                    )

            if "tenant_id" in columns or "tenant_id" in existing_columns:
                connection.execute(
                    text(f"UPDATE {table} SET tenant_id = 'internal' WHERE tenant_id IS NULL")
                )
            if "organization_id" in columns or "organization_id" in existing_columns:
                connection.execute(
                    text(
                        f"UPDATE {table} SET organization_id = COALESCE(tenant_id, 'internal') "
                        "WHERE organization_id IS NULL"
                    )
                )

        # Idempotently add new feature columns to existing tables
        for table, column, ddl_type in ADDITIVE_COLUMNS:
            if table not in existing_tables:
                continue
            existing_columns = {col["name"] for col in inspector.get_columns(table)}
            if column not in existing_columns:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))

        if "alerts" in existing_tables:
            connection.execute(
                text("UPDATE alerts SET first_seen_at = created_at WHERE first_seen_at IS NULL")
            )
            connection.execute(
                text(
                    "UPDATE alerts SET last_seen_at = COALESCE(updated_at, created_at) "
                    "WHERE last_seen_at IS NULL"
                )
            )

        # Idempotently relax NOT NULL constraints that the model now marks nullable.
        # Only PostgreSQL needs explicit DDL; SQLite columns default to NULL-able.
        if engine.dialect.name == "postgresql":
            for table, column in NULLABLE_COLUMNS:
                if table not in existing_tables:
                    continue
                col_info = next(
                    (c for c in inspector.get_columns(table) if c["name"] == column),
                    None,
                )
                if col_info and not col_info.get("nullable", True):
                    connection.execute(
                        text(f"ALTER TABLE {table} ALTER COLUMN {column} DROP NOT NULL")
                    )

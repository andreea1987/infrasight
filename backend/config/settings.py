"""
Application Settings
====================
All configuration is read from environment variables (loaded from .env by
python-dotenv).  Sensitive values (API keys, credentials) should never be
committed — set them in .env or the deployment environment.
"""

from dotenv import load_dotenv
import os

load_dotenv()

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

# PostgreSQL connection string, e.g. postgresql://user:pass@host/dbname
DATABASE_URL = os.getenv("DATABASE_URL")

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

# JWT signing key — must be a long random secret in production
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")

# Local auth bootstrap for development/demo installations.
# Change these values in production and set a real SECRET_KEY.
AUTH_SESSION_EXPIRE_MINUTES = int(os.getenv("AUTH_SESSION_EXPIRE_MINUTES", "480"))
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true"
INFRASIGHT_BOOTSTRAP_ADMIN_EMAIL = os.getenv("INFRASIGHT_BOOTSTRAP_ADMIN_EMAIL", "admin@infrasight.local")
INFRASIGHT_BOOTSTRAP_ADMIN_PASSWORD = os.getenv("INFRASIGHT_BOOTSTRAP_ADMIN_PASSWORD", "AdminDemo123!")

# ---------------------------------------------------------------------------
# Cloud provider credentials
# ---------------------------------------------------------------------------

# AWS — region used when no per-resource region is specified
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION")

# Azure service-principal credentials for VM discovery
AZURE_SUBSCRIPTION_ID = os.getenv("AZURE_SUBSCRIPTION_ID")
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID")
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")

# ---------------------------------------------------------------------------
# Monitoring worker
# ---------------------------------------------------------------------------

# How often (seconds) the background worker collects metrics and evaluates alert rules
MONITORING_WORKER_INTERVAL_SECONDS = int(
    os.getenv("MONITORING_WORKER_INTERVAL_SECONDS", "60")
)

# ---------------------------------------------------------------------------
# Email / SMTP notifications
# ---------------------------------------------------------------------------

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "alerts@infrasight.local")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

# ---------------------------------------------------------------------------
# OpenClaw AI assistant
# ---------------------------------------------------------------------------

# OpenAI API key — if unset, OpenClaw uses the structured fallback answer path
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Model name passed to the OpenAI Responses API
OPENCLAW_MODEL = os.getenv("OPENCLAW_MODEL", "gpt-5.5")

# Execution mode is fixed to read-only for analyst workflows.
# OpenClaw may explain and recommend, but must not execute remediation actions.
OPENCLAW_MODE = "read_only"

# Seconds before an OpenAI API call is abandoned and the fallback is used
OPENCLAW_REQUEST_TIMEOUT_SECONDS = int(
    os.getenv("OPENCLAW_REQUEST_TIMEOUT_SECONDS", "30")
)

# Legacy allow-list retained for compatibility with older environments.
# Current OpenClaw analyst mode is read-only and does not execute restarts.
OPENCLAW_APPROVED_SERVICES = [
    service.strip()
    for service in os.getenv("OPENCLAW_APPROVED_SERVICES", "").split(",")
    if service.strip()
]

# Default permission set granted to OpenClaw — controls which tools are callable.
# Override via the OPENCLAW_PERMISSIONS env var (comma-separated).
DEFAULT_OPENCLAW_PERMISSIONS = [
    "analyze_alerts",
    "explain_incidents",
    "suggest_fixes",
    "correlate_infrastructure_events",
    "cloud_onprem_copilot",
]
OPENCLAW_PERMISSIONS = [
    permission.strip()
    for permission in os.getenv(
        "OPENCLAW_PERMISSIONS",
        ",".join(DEFAULT_OPENCLAW_PERMISSIONS),
    ).split(",")
    if permission.strip()
]

# InfraSight Administrator Guide

> **Intended audience:** System administrators responsible for deploying, configuring, and maintaining InfraSight.  
> **Last updated:** June 2026

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Initial Deployment](#initial-deployment)
3. [Environment Variables Reference](#environment-variables-reference)
4. [Database Setup and Migrations](#database-setup-and-migrations)
5. [Bootstrap Admin Account](#bootstrap-admin-account)
6. [Multi-Workspace (Multi-Tenant) Configuration](#multi-workspace-multi-tenant-configuration)
7. [Connector Configuration](#connector-configuration)
8. [SMTP / Email Configuration](#smtp--email-configuration)
9. [OpenClaw AI Assistant Configuration](#openclaw-ai-assistant-configuration)
10. [Authentication and Session Management](#authentication-and-session-management)
11. [SSO Configuration (Partially Implemented)](#sso-configuration-partially-implemented)
12. [User Management](#user-management)
13. [Monitoring Worker](#monitoring-worker)
14. [Alert Knowledge and Retention](#alert-knowledge-and-retention)
15. [Docker Compose Deployment](#docker-compose-deployment)
16. [Security Hardening Checklist](#security-hardening-checklist)
17. [Backup and Recovery](#backup-and-recovery)

---

## System Requirements

| Component | Requirement |
|---|---|
| **Backend** | Python 3.12+, FastAPI |
| **Frontend** | Node.js 20+, Next.js 15 |
| **Database** | PostgreSQL 14+ (SQLite supported for development only) |
| **Network** | Backend must reach configured cloud APIs (AWS, Azure) and SMTP server |
| **OpenClaw** | Optional: OpenAI API key for AI assistant functionality |

---

## Initial Deployment

### Backend

```bash
# Install dependencies
pip install -r requirements.txt

# Set required environment variables (see reference below)
export DATABASE_URL="postgresql://user:password@localhost:5432/infrasight"
export SECRET_KEY="your-secure-random-key-min-32-chars"

# Start the backend API server
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The backend automatically:
- Creates all database tables on first startup (`Base.metadata.create_all`)
- Runs idempotent schema migrations (adding new columns to existing tables)
- Creates the bootstrap admin account if it does not exist

### Frontend

```bash
cd web
npm install
npm run dev        # Development
npm run build && npm start  # Production
```

Set `NEXT_PUBLIC_API_URL` in `web/.env.local` to point to your backend:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Environment Variables Reference

Variables are optional unless marked **Required**. `DATABASE_URL` is required for the backend to start.

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | **Required.** Database connection string. The local `.env` and Docker Compose setup use PostgreSQL (`postgresql://infrasight:strongpassword@localhost:5432/infrasight`). SQLite can be used only if explicitly configured for local experiments. |

### Security / Auth

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `change-me-in-production` | JWT signing secret. **Required for production — use a random 32+ character string.** |
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `AUTH_SESSION_EXPIRE_MINUTES` | `480` | Session lifetime in minutes (8 hours) |
| `AUTH_COOKIE_SECURE` | `false` | Set to `true` in HTTPS deployments to enforce secure cookie flag |

### Bootstrap Admin

| Variable | Default | Description |
|---|---|---|
| `INFRASIGHT_BOOTSTRAP_ADMIN_EMAIL` | `admin@infrasight.local` | Email address for the auto-created admin account |
| `INFRASIGHT_BOOTSTRAP_ADMIN_PASSWORD` | `AdminDemo123!` | Password for the bootstrap admin. **Change before exposing to any network.** |

### AWS

| Variable | Default | Description |
|---|---|---|
| `AWS_DEFAULT_REGION` | `us-east-1` | Default AWS region for EC2 discovery |
| `AWS_ACCESS_KEY_ID` | — | AWS access key (or use IAM role) |
| `AWS_SECRET_ACCESS_KEY` | — | AWS secret key (or use IAM role) |

### Azure

| Variable | Default | Description |
|---|---|---|
| `AZURE_SUBSCRIPTION_ID` | — | Azure subscription ID |
| `AZURE_TENANT_ID` | — | Azure Active Directory tenant ID |
| `AZURE_CLIENT_ID` | — | Service principal client ID |
| `AZURE_CLIENT_SECRET` | — | Service principal client secret |

### SMTP (Email Notifications)

Global SMTP defaults; can be overridden per-tenant via the Notifications Settings UI.

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USERNAME` | — | SMTP authentication username |
| `SMTP_PASSWORD` | — | SMTP authentication password |
| `SMTP_FROM_EMAIL` | `alerts@infrasight.local` | Sender address for alert emails |
| `SMTP_USE_TLS` | `true` | Enable STARTTLS |

### Monitoring Worker

| Variable | Default | Description |
|---|---|---|
| `MONITORING_WORKER_INTERVAL_SECONDS` | `60` | How often the background worker collects metrics and evaluates alert rules |

### OpenClaw AI Assistant

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Optional OpenAI API key for the built-in AI-backed provider. If not set and no workspace AI provider is active, OpenClaw uses the structured fallback. |
| `OPENCLAW_MODEL` | `gpt-4o` | OpenAI model name to use |
| `OPENCLAW_REQUEST_TIMEOUT_SECONDS` | `30` | Timeout for OpenAI API calls |
| `OPENCLAW_PERMISSIONS` | (read-only set) | Comma-separated list of tool permissions for OpenClaw |

---

## Database Setup and Migrations

InfraSight uses SQLAlchemy with a **startup migration** approach rather than Alembic for initial deployment. On every startup:

1. `Base.metadata.create_all(bind=engine)` — creates any missing tables.
2. `ensure_multi_tenant_schema(engine)` — idempotently adds new columns (via `ALTER TABLE ADD COLUMN IF NOT EXISTS`) and backfills multi-tenancy columns.

This approach is safe to run repeatedly. **It does not drop or alter existing columns.**

### Using PostgreSQL

1. Set `DATABASE_URL` to your PostgreSQL connection string before first startup.
2. The schema will be created fresh in PostgreSQL on first run.
3. The included Docker Compose setup provides a local PostgreSQL instance that matches the sample `.env`.

> **Note:** SQLite is suitable only for local experiments when explicitly configured. PostgreSQL is required for multi-user and production deployments due to concurrency and connection-pooling requirements.

---

## Bootstrap Admin Account

On startup, InfraSight checks whether any admin user exists. If none does, it creates one using:

- Email: `$INFRASIGHT_BOOTSTRAP_ADMIN_EMAIL` (default: `admin@infrasight.local`)
- Password: `$INFRASIGHT_BOOTSTRAP_ADMIN_PASSWORD` (default: `AdminDemo123!`)

**Security action required:** Change the bootstrap password before exposing the application to any network other than `localhost`.

To change the password:
1. Sign in with the bootstrap credentials.
2. Go to **Settings → Users**.
3. Locate the admin account and update the password, or invite a new admin and disable the bootstrap account.

---

## Multi-Workspace (Multi-Tenant) Configuration

InfraSight supports multiple isolated workspaces (tenants). Each workspace has:

- Its own set of resources, alerts, connectors, and notification channels
- Isolated user access (users can be granted access to specific workspaces)
- A `tenant_id` and `organization_id` that scope all database queries

### Creating a new workspace

Workspaces (organizations) are managed via the `/organizations` API or by an admin creating them through the dashboard's organization management interface.

Every API request includes the following headers that the backend uses to scope queries:

```
X-InfraSight-Tenant: <tenant_id>
X-InfraSight-Organization: <organization_id>
X-InfraSight-Actor: <actor_name>
X-InfraSight-Role: <role>
```

The frontend automatically sends these headers based on the active workspace selection.

### MSP admin access

Users with the `msp_admin` role can see all workspaces and switch between them. Standard Admin, Operator, and Viewer roles are scoped to the workspaces they have been granted access to.

---

## Connector Configuration

Connectors are configured primarily through environment variables and registered via the API. The Connectors UI shows catalog entries, setup instructions, registrations, and health status; it does not currently provide credential-entry forms.

### AWS Connector

1. Create an IAM user with the following managed policies:
   - `AmazonEC2ReadOnlyAccess`
   - `CloudWatchReadOnlyAccess`
   - `AWSCloudTrailReadOnlyAccess` (optional, for audit events)
2. Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`.
3. Trigger EC2 discovery from the dashboard: **Sync → Sync AWS EC2**.

Alternatively, if InfraSight is deployed on an EC2 instance with an IAM role attached, the SDK will use the instance role automatically (no key variables needed).

### Azure Connector

1. Register an application in Azure Active Directory.
2. Assign the **Reader** role to the service principal at the subscription scope.
3. Set `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
4. Trigger discovery: **Sync → Sync Azure VMs**.

### Linux Agent (SSH)

The Linux discovery connector uses SSH to collect metrics from target hosts. The backend must be able to SSH to target hosts from its network location.

Required configuration (per-target, via the connector registration API):
- `host`: target hostname or IP
- `username`: SSH username
- `private_key` or `password`: SSH authentication credential (stored encrypted)

### Windows Agent (WinRM)

Similar to Linux, but uses WinRM for remote management. Requires WinRM to be enabled on target Windows hosts.

### Docker

The Docker connector requires access to the Docker socket (`/var/run/docker.sock`) or a remote Docker API endpoint.

### Kubernetes

The Kubernetes connector is currently scaffolded. It requires a future kubeconfig or in-cluster service account integration with read access to pods, deployments, services, nodes, and namespaces. The current discovery action can complete without importing Kubernetes assets unless those resources have been supplied by another ingestion path.

### Database Discovery

PostgreSQL and MSSQL discovery logic exists behind the discovery API and expects database host/configuration details in the request payload. The Databases UI does not currently collect those connection details, so database discovery from the page may only show resources already imported from cloud inventory or seed data.

---

## SMTP / Email Configuration

Global SMTP defaults are set via environment variables. Per-tenant SMTP overrides can be configured by admins through the **Settings → Notifications → SMTP Configuration** UI in each workspace.

**Order of precedence for email delivery:**
1. Tenant-specific SMTP config (stored in the `smtp_configs` database table)
2. Global environment variable defaults (`SMTP_HOST`, `SMTP_PORT`, etc.)

If neither is configured, email delivery is skipped and logged as `skipped: SMTP host is not configured`.

---

## OpenClaw AI Assistant Configuration

OpenClaw can use the built-in OpenAI-backed provider, a workspace-scoped AI provider, or the deterministic structured fallback. To enable AI-generated responses from the built-in provider:

1. Set `OPENAI_API_KEY` in the backend environment.
2. Optionally set `OPENCLAW_MODEL` (default: `gpt-4o`).
3. Optionally set `OPENCLAW_REQUEST_TIMEOUT_SECONDS` (default: 30 seconds).

OpenClaw operates in **read-only mode** by design. It can query the InfraSight database (resources, alerts, metrics) and call backend APIs to retrieve data, but it cannot modify any data or trigger infrastructure changes. This is enforced at the API permission level.

If no AI provider or `OPENAI_API_KEY` is configured, the OpenClaw chat endpoint still returns a structured fallback answer based on the collected tool context.

---

## Authentication and Session Management

### Session flow

1. User POSTs credentials to `/auth/login`.
2. Backend verifies credentials against the `users` table (bcrypt password hash comparison).
3. On success, a JWT is issued and set as an HTTP-only cookie (`infrasight_session`).
4. All subsequent requests use the session cookie automatically.
5. Session expires after `AUTH_SESSION_EXPIRE_MINUTES` minutes.

### Security configuration

| Setting | Recommendation |
|---|---|
| `SECRET_KEY` | Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `AUTH_COOKIE_SECURE` | Set to `true` when running behind HTTPS |
| `AUTH_SESSION_EXPIRE_MINUTES` | Reduce from 480 for high-security environments |
| Bootstrap password | Change on first deployment |

---

## SSO Configuration (Partially Implemented)

> **Important:** The SSO configuration UI and data persistence are implemented. The actual SAML/OIDC assertion validation callback (`/auth/sso/callback`) returns HTTP 501 and is not functional. Do not rely on SSO for authentication in production at this time.

### What IS implemented

- SSO provider CRUD (create, read, update, delete via `/auth/sso/providers`)
- Provider configuration storage (secrets encrypted server-side using `SECRET_KEY`)
- Configuration smoke tests (`/auth/sso/providers/{id}/test` — validates structure, not IdP connectivity)
- SSO start URL generation (`/auth/sso/start` — returns a redirect URL based on stored config)

### What is NOT yet implemented

- SAML assertion validation (XML signature verification, attribute mapping)
- OIDC token exchange and validation
- Group-to-role mapping execution on login
- Auto-provisioning of new users on first SSO login

---

## User Management

### User roles

| Role | Capabilities |
|---|---|
| `msp_admin` | Cross-workspace admin, full access to all tenants |
| `admin` | Full access within their assigned workspaces |
| `operator` | Read/write to alerts and notifications, read access to resources |
| `viewer` | Read-only access to all dashboards |

### Permission enforcement

The backend enforces permissions via `require_permission(context, "permission:name")` on write endpoints. Read endpoints are accessible to all authenticated users within the workspace scope.

### Password management

Passwords are hashed with bcrypt. There is no password reset flow implemented in the current version — administrators must reset passwords directly in the database or by re-inviting users if needed.

---

## Monitoring Worker

The background monitoring worker runs in a separate thread and:

1. Collects metrics from all connected resources (calls their respective connectors)
2. Evaluates alert rules against collected metric values
3. Creates or updates alert records in the database
4. Triggers notification deliveries for new alerts

The worker runs on a fixed interval set by `MONITORING_WORKER_INTERVAL_SECONDS` (default: 60 seconds).

The worker is started automatically when the FastAPI application starts (in the `lifespan` context) and stopped gracefully on shutdown.

---

## Alert Knowledge and Retention

InfraSight stores alerts in the database as hot operational records and promotes resolved/closed alerts into long-term incident knowledge.

Primary tables:

- `alerts` — current and recent operational alerts
- `alert_history` — lifecycle transitions, evidence changes, and before/after snapshots
- `incident_knowledge` — durable human-readable incident memory
- `openclaw_resolution_library` — OpenClaw retrieval records derived from incident knowledge

Alert states are stored in `alerts.status` and may be `open`, `acknowledged`, `investigating`, `resolved`, or `closed`. State-specific timestamps are stored on the alert row, and each transition writes an `alert_history` event.

The active alert list excludes `closed` records by default. Closed alerts remain queryable as incident history, retain their timeline and investigation fields, and can be reopened to `investigating`.

Recommended retention:

| Record type | Retention |
|---|---|
| Open/acknowledged/investigating alerts | Indefinitely until resolved or closed |
| Resolved alerts in `alerts` | 180 days |
| Closed alerts in `alerts` | 365 days |
| Incident knowledge records | Indefinitely |
| OpenClaw resolution records | Indefinitely |

Before pruning terminal alerts from the hot `alerts` table, ensure they have been promoted to `incident_knowledge` and `openclaw_resolution_library`. See [Alert Knowledge Architecture](alert-knowledge-architecture.md) for the full schema and OpenClaw retrieval flow.

---

## Docker Compose Deployment

A `docker-compose.yml` is included in the project root. It starts:

- PostgreSQL database
- FastAPI backend
- Next.js frontend

```bash
docker compose up -d
```

Review `docker-compose.yml` to configure environment variables before deploying. At minimum, set:
- `SECRET_KEY`
- `INFRASIGHT_BOOTSTRAP_ADMIN_PASSWORD`
- Any cloud provider credentials needed

---

## Security Hardening Checklist

Before deploying to any non-development environment:

- [ ] Change `SECRET_KEY` to a randomly generated 32+ character string
- [ ] Change the bootstrap admin password
- [ ] Set `DATABASE_URL` to a production PostgreSQL instance
- [ ] Set `AUTH_COOKIE_SECURE=true` when running behind HTTPS
- [ ] Restrict network access to the backend API (firewall, VPC, etc.)
- [ ] Rotate cloud provider credentials (AWS/Azure) to least-privilege
- [ ] Store secrets in a secrets manager (AWS Secrets Manager, Azure Key Vault) rather than plain environment variables where possible
- [ ] Review CORS settings in `backend/main.py` — restrict `allow_origins` to your frontend domain
- [ ] Enable PostgreSQL SSL (`?sslmode=require` in `DATABASE_URL`)

---

## Backup and Recovery

### Database backup

For PostgreSQL:

```bash
pg_dump -U infrasight infrasight > backup_$(date +%Y%m%d_%H%M%S).sql
```

Schedule this with a cron job or your cloud provider's automated backup feature.

### What is stored in the database

- All resource inventory data (re-discoverable from connectors)
- Current/recent alerts, alert lifecycle history, incident knowledge, OpenClaw resolution records, and notification delivery records
- User accounts, roles, and workspace memberships
- Notification channel configurations and SMTP settings (credentials stored encrypted)
- SSO provider configurations (secrets stored encrypted)
- Automation rule configurations are not currently stored; the Automation UI is browser-session demo state.
- Metric samples (time-series data)

### Recovery procedure

1. Restore PostgreSQL from backup.
2. Start the backend — schema migrations run automatically and are idempotent.
3. Verify the bootstrap admin account is accessible.
4. Re-trigger discovery runs to refresh resource inventory from live cloud/on-prem sources.

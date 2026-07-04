# InfraSight — Known Limitations

> This document lists features that are currently incomplete, simulated, placeholder-only, or pending backend integration.  
> Last updated: July 2026

---

## Authentication

### SSO / SAML / OIDC — Callback Not Implemented

**Status:** Configuration UI implemented; authentication flow not functional.

The `/auth/sso/callback` endpoint returns **HTTP 501 Not Implemented**. This means:

- You can configure SAML and OIDC providers in **Administration → Authentication**.
- The configuration is stored and the "Test" button runs a structural smoke test.
- However, actual SSO logins **do not work**. Clicking "Sign in with SSO" will redirect to the IdP but the callback will fail.

**Planned:** Full SAML assertion XML parsing, signature verification, attribute mapping, and OIDC token exchange.

---

### Password Reset

**Status:** Not implemented.

There is no password reset flow (forgot password email, reset link) in the current version. Administrators must reset passwords directly in the database or re-invite affected users.

---

## User Provisioning

### SCIM Provisioning — Not Functional

**Status:** Data model and UI exist; active sync not implemented.

The **Administration → Users** page includes a section about SCIM (System for Cross-domain Identity Management). The database schema and placeholder configuration exist, but InfraSight does not currently act as a SCIM service provider. External identity providers (Okta, Azure AD, etc.) cannot push user lifecycle events to InfraSight at this time.

---

### Auto-Provisioning on SSO First Login

**Status:** Not implemented (depends on SSO callback, which is also pending).

The user management UI includes an "Auto-provisioning" toggle on SSO provider configurations. When implemented, this would automatically create an InfraSight user account the first time someone logs in via SSO. Currently, this does not function.

---

## RBAC and Enterprise Access Control

### RBAC is Planned Beyond Current Role Checks

**Status:** Basic role checks exist; full RBAC is planned.

InfraSight has role concepts and permission checks for selected API operations, but a full enterprise RBAC model is not complete. Fine-grained permissions, policy management, audit-grade role assignment workflows, and full SSO group-to-role enforcement are planned future work.

---

## Automation

### Rule Execution is Simulated

**Status:** Frontend simulation only; no backend execution engine.

Automation rules can be created, configured, enabled, and "run" through the UI for the current browser session. When you click **Run Now**:

1. The rule shows "Running" status for approximately 2 seconds.
2. A simulated `ExecutionRecord` is added to the execution history with a randomized result.

**No actions actually occur:** No rules are persisted to backend storage, no alerts are generated, no notifications are sent, and no events are created by the automation engine. The 32-template library, 4-step wizard, and rule detail view are accurate representations of the planned feature, implemented as a demonstration.

**Planned:** A backend rule evaluation engine that runs conditions against live metric data and triggers configured actions.

---

### Automation Actions Are Read-Only

**Status:** By design for this release.

Even when the backend execution engine is implemented, the planned initial action set is:
- Generate an InfraSight alert
- Send a notification to a configured channel
- Log an activity event
- Create an event record

Remediation actions (restarting services, scaling resources, modifying infrastructure) are not planned for the current roadmap.

---

## OpenClaw AI Assistant

### AI Provider Quality Depends on Configuration

**Status:** Implemented with fallback.

OpenClaw can answer with the built-in structured fallback even when no external AI provider is configured. For richer natural-language reasoning, configure `OPENAI_API_KEY` or a workspace-scoped AI provider in Settings.

The fallback remains read-only and is limited to the tool context available in the InfraSight database.

---

### Read-Only by Design

**Status:** Intentional limitation.

OpenClaw cannot acknowledge alerts, modify resources, trigger syncs, or make any changes. This is enforced at the API permission level and is intentional for this release. All OpenClaw interactions are analytical and advisory only.

---

### Next Release Enhancements Planned

**Status:** Roadmap.

The next release is planned to improve OpenClaw with:

- Infrastructure-aware AI assistant behavior
- Alert analysis
- AI operational summaries
- Context-aware troubleshooting
- Runbook recommendations
- Knowledge base integration
- AI-assisted resource discovery

These capabilities are not implemented in the current release.

---

## Dashboard

### Topology Preview Placeholder

**Status:** Placeholder on dashboard; full functionality on dedicated page.

The dashboard overview shows a "Topology preview coming soon" placeholder card. The full interactive topology graph is available on the dedicated **Topology** page (accessible from the sidebar). There is no embedded preview on the dashboard.

---

## Filtering and Data Refresh

### Client-Side Filtering Only

**Status:** All filtering is applied in the browser against the loaded snapshot.

When you open any resource page (Servers, Databases, Containers, Kubernetes, Inventory), InfraSight loads a complete data snapshot from the backend. All filters — search, provider, status, health, type — are applied client-side to this snapshot.

**Implications:**
- Filters do not query the backend for refined results.
- Resources added or updated after the page loaded will not appear until the page is refreshed.
- For large inventories (thousands of resources), the initial load may be slower than paginated server-side queries.

**Workaround:** Use the **Refresh** button (available on some pages) or reload the browser tab to fetch the latest snapshot.

---

## Connectors

### Cloud Connectors Use Mocked Backend Workflows

**Status:** Implemented as persisted mocked workflows; real provider integrations pending.

The Connectors page includes real onboarding forms, lifecycle actions, encrypted credential storage, mocked connection tests, mocked discovery, mocked synchronization, and local resource import. These workflows are designed to behave like production from the UI perspective, but they do not call real AWS, Azure, Docker, Kubernetes, or host-agent APIs.

Current connector support:

- AWS (API) — mocked IAM Role / Access Keys workflow
- Azure (API) — mocked Service Principal / Managed Identity-style workflow
- Windows/Linux Agent (Agent) — mocked enrollment token and verification workflow
- Docker (Agent / Docker Socket) — mocked container/image discovery
- Kubernetes (Helm) — mocked token, Helm command, verification, and resource discovery

**Planned:** Replace mocked provider implementations with real cloud, agent, Docker, and Kubernetes integrations behind the existing connector lifecycle API.

---

### Resource Discovery is Simulated

**Status:** Mocked connector discovery persists local data.

Connector discovery creates representative resources and imports them into the normalized inventory. This updates Dashboard counts, Inventory, Servers, Databases, Containers, Kubernetes, and Topology views, but the resources are simulated.

Mocked discovery currently returns:

- AWS: EC2, RDS, EKS
- Azure: Virtual Machines, Azure SQL, AKS
- Windows/Linux Agent: Servers, Services, Processes
- Docker: Containers, Images
- Kubernetes: Nodes, Pods, Deployments

---

### Database and Kubernetes Discovery

**Status:** Mixed implementation.

PostgreSQL and MSSQL discovery logic exists, but it requires connection details in the backend discovery request payload. The Databases page does not currently collect those details, so the UI action may complete without importing new on-prem database assets.

Kubernetes resources can be imported through the mocked connector workflow. Real Kubernetes cluster discovery through Helm/service account integration is not implemented yet.

---

### On-Premises Agent Installation

**Status:** Mocked onboarding only; no installable production agent binary.

The Windows/Linux Agent connector can generate enrollment tokens, display installation commands, show connected-agent examples, and verify through mocked backend workflows. There is no production agent binary or real agent ingestion service in this release.

---

## Alerts

### Incident History Storage and Reopen Flow

**Status:** Implemented for alert records; automated archive pruning pending.

Closed alerts are hidden from the default active alert list and are available from **Closed / Incident History**. Closing saves investigation notes, root cause, resolution notes, category, success rating, and a lifecycle event. Reopening changes the status to `investigating` and returns the alert to the active list.

OpenClaw can reference closed incidents as historical context, but it remains read-only and cannot acknowledge, resolve, close, or reopen alerts.

### Alert Archive Scheduler

**Status:** Schema implemented; scheduled pruning pending.

InfraSight now stores alert lifecycle history in `alert_history` and promotes resolved/closed alerts into `incident_knowledge` and `openclaw_resolution_library`. The recommended retention policy is documented in the [Alert Knowledge Architecture](alert-knowledge-architecture.md).

There is not yet a built-in scheduled job that prunes old resolved/closed rows from the hot `alerts` table. Operators should run a controlled database maintenance job after verifying that terminal alerts have been promoted to incident knowledge and backed up.

---

## Metrics

### Metric History Retention

**Status:** All samples retained; no automatic pruning.

Metric samples are stored in the database indefinitely. There is no automatic retention policy or time-series data compaction. For long-running deployments, the `metric_samples` table will grow continuously.

**Workaround:** Set up periodic database cleanup jobs targeting `metric_samples` rows older than your desired retention period.

---

## Security

### Audit Log — Basic Only

**Status:** Basic status tracking; no detailed audit trail.

Resource changes, user actions, and configuration updates are partially tracked (e.g., `created_at`, `updated_at`, `last_checked_at` fields). However, there is no dedicated audit log table that records every administrative action (who changed what, when) in a tamper-resistant format.

**Planned:** OpenClaw Audit Log (`openclaw_audit_logs` table exists) captures OpenClaw interactions. A broader administrative audit trail is planned.

---

## SSO Role Mapping

**Status:** Configuration stored; mapping not applied during login.

The SSO provider configuration UI includes a role mapping editor where you can map IdP group names to InfraSight roles (Admin, Operator, Viewer). This configuration is stored in the database, but it is not yet applied during SSO login flows (which are themselves pending full implementation).

---

## Known UI Limitations

| Area | Limitation |
|---|---|
| Alert detail view | No click-through from alert list to a dedicated alert detail page |
| Resource metrics charts | Available in resource detail view; no cross-resource comparison charts |
| Topology | Dashboard topology preview is a placeholder |
| Automation history | Execution history is in-memory (lost on page refresh in demo mode) |
| Pagination | Most lists are not paginated; very large datasets may affect browser performance |
| Mobile responsiveness | UI is designed for desktop use; mobile layouts are partially responsive |

# Alert Knowledge Architecture

> Last updated: June 2026

InfraSight stores alerts as operational records and promotes resolved/closed alerts into a durable incident knowledge base. The goal is to keep the active alert table useful for day-to-day operations while preserving successful resolutions for OpenClaw and future operators.

## Storage Model

Alerts are stored in the application database through SQLAlchemy models. They are not stored authoritatively in JSON files, browser local storage, or in-memory state.

| Data | Table | Retention role |
|---|---|---|
| Active and recent terminal alerts | `alerts` | Hot operational queue |
| Alert lifecycle events | `alert_history` | Durable workflow/audit trail |
| Curated incident memory | `incident_knowledge` | Long-term human-readable knowledge |
| OpenClaw retrieval records | `openclaw_resolution_library` | Long-term AI retrieval and recommendation library |

The dashboard may keep optimistic UI state in browser storage during editing, but the database remains the source of truth.

## Alert Lifecycle

The lifecycle state is stored in `alerts.status`.

Supported states:

- `open`
- `acknowledged`
- `investigating`
- `resolved`
- `closed`

State-specific timestamps are stored directly on the alert row:

- `acknowledged_at`
- `investigating_at`
- `resolved_at`
- `closed_at`

Every lifecycle transition also writes an `alert_history` row with actor, previous status, new status, before/after snapshots, event time, and optional metadata.

The default operational view treats `open`, `acknowledged`, `investigating`, and `resolved` as active alert states. `closed` records are removed from the active alert list and shown through **Closed / Incident History**. Closing an alert saves the investigation notes, root cause, resolution notes, category, and success rating; writes an `Incident closed` timeline entry; and keeps the full details view available in read-only/history mode. Reopening a closed incident moves it back to `investigating` and writes an `Incident reopened` timeline entry.

## Current Schemas

### `alerts`

Operational alert records.

Key fields:

- `id`
- `tenant_id`, `organization_id`
- `resource_id`
- `fingerprint`
- `title`, `description`
- `severity`
- `status`
- `source`
- `metric_name`, `metric_value`, `threshold`
- `created_at`, `first_seen_at`, `last_seen_at`, `updated_at`
- `acknowledged_at`, `investigating_at`, `resolved_at`, `closed_at`, `archived_at`
- `assigned_to`, `resolved_by`, `closed_by`
- `investigation_notes`, `resolution_notes`, `root_cause`
- `resolution_category`, `success_rating`
- `metadata_json`

### `alert_history`

Lifecycle and evidence-change history for alert records.

Key fields:

- `id`
- `tenant_id`, `organization_id`
- `alert_id`
- `event_type`
- `from_status`, `to_status`
- `actor`
- `message`
- `before_json`, `after_json`
- `metadata_json`
- `event_at`

### `incident_knowledge`

Long-term incident memory created from resolved or closed alerts.

Key fields:

- `id`
- `tenant_id`, `organization_id`
- `source_alert_id`
- `incident_key`
- `title`, `summary`
- `affected_resource_ids_json`
- `providers_json`, `resource_types_json`
- `alert_sources_json`, `metric_names_json`
- `severity`
- `symptoms`, `root_cause`, `investigation_notes`, `resolution_notes`
- `resolution_category`
- `runbook_steps_json`
- `prevention_notes`
- `verified_by`
- `confidence_score`
- `success_rating`
- `occurrence_count`
- `first_seen_at`, `last_seen_at`
- `created_at`, `updated_at`
- `metadata_json`

### `openclaw_resolution_library`

AI-optimized retrieval records derived from incident knowledge.

Key fields:

- `id`
- `tenant_id`, `organization_id`
- `incident_knowledge_id`
- `pattern_key`
- `problem_signature`
- `environment_signature_json`
- `recommended_resolution`
- `ordered_steps_json`
- `contraindications_json`
- `required_permissions_json`
- `success_count`, `failure_count`
- `avg_time_to_resolve_seconds`
- `last_used_at`, `last_success_at`
- `search_document`
- `embedding_json`
- `created_at`, `updated_at`

`embedding_json` is a placeholder for future vector search data. PostgreSQL `pgvector` is the recommended production upgrade when semantic retrieval becomes a requirement.

## Retention Policy

Recommended retention:

| Record type | Retention |
|---|---|
| Open/acknowledged/investigating alerts | Indefinitely until terminal state |
| Resolved alerts in hot `alerts` table | 180 days |
| Closed alerts in hot `alerts` table | 365 days |
| `incident_knowledge` | Indefinitely |
| `openclaw_resolution_library` | Indefinitely |

Before any resolved or closed alert is pruned from the hot table, it must be promoted to `incident_knowledge` and `openclaw_resolution_library`.

## Historical Alert Archiving

Use a two-phase archive job:

1. Promote terminal alerts to knowledge.
2. Move full alert snapshots and lifecycle history to cold storage or archive partitions.
3. Mark hot rows with `archived_at`.
4. Delete or detach archived hot rows only after backup verification.

For PostgreSQL production deployments, prefer monthly partitions for high-volume alert and history data. Keep the current `alerts` table focused on active and recent terminal records, and retain incident knowledge indefinitely.

## OpenClaw Retrieval Flow

OpenClaw should query previous incidents in this order:

1. Filter `incident_knowledge` by tenant.
2. Score structured matches against current resource, provider, resource type, alert source, metric name, and severity.
3. Join `openclaw_resolution_library` for recommended resolution, ordered steps, and success metadata.
4. Fall back to resolved alert rows only when no incident knowledge exists.
5. Present recommendations as operator guidance, never as automatic remediation.

The response should include the match basis, prior root cause, successful resolution notes, known differences, and confidence. Operators must validate that a historical resolution applies to the current incident before acting.

from datetime import datetime

from backend.models.alert import Alert, AlertHistory, IncidentKnowledge, OpenClawResolutionLibrary
from backend.models.metric import MetricSample
from backend.models.resource import Resource
from backend.services.notification_service import notify_alert

HEALTHY_STATUSES = {"running", "healthy", "available"}
CRITICAL_STATUSES = {"critical", "failed", "terminated"}
ACTIVE_ALERT_STATUSES = {"open", "acknowledged", "investigating"}


def serialize_metric(metric):
    return {
        "id": metric.id,
        "tenant_id": metric.tenant_id,
        "organization_id": metric.organization_id,
        "resource_id": metric.resource_id,
        "metric_name": metric.metric_name,
        "value": metric.value,
        "unit": metric.unit,
        "collected_at": metric.collected_at,
        "metadata": metric.metadata_json or {},
    }


def serialize_alert(alert):
    return {
        "id": alert.id,
        "tenant_id": alert.tenant_id,
        "organization_id": alert.organization_id,
        "resource_id": alert.resource_id,
        "fingerprint": alert.fingerprint,
        "title": alert.title,
        "description": alert.description,
        "severity": alert.severity,
        "status": alert.status,
        "source": alert.source,
        "metric_name": alert.metric_name,
        "metric_value": alert.metric_value,
        "threshold": alert.threshold,
        "created_at": alert.created_at,
        "first_seen_at": alert.first_seen_at,
        "last_seen_at": alert.last_seen_at,
        "updated_at": alert.updated_at,
        "acknowledged_at": alert.acknowledged_at,
        "investigating_at": alert.investigating_at,
        "resolved_at": alert.resolved_at,
        "closed_at": alert.closed_at,
        "archived_at": alert.archived_at,
        "assigned_to": alert.assigned_to,
        "investigation_notes": alert.investigation_notes,
        "resolution_notes": alert.resolution_notes,
        "root_cause": alert.root_cause,
        "resolution_category": alert.resolution_category,
        "resolved_by": alert.resolved_by,
        "closed_by": alert.closed_by,
        "success_rating": alert.success_rating,
        "metadata": alert.metadata_json or {},
    }


def alert_history_snapshot(alert):
    return {
        "id": alert.id,
        "tenant_id": alert.tenant_id,
        "organization_id": alert.organization_id,
        "resource_id": alert.resource_id,
        "fingerprint": alert.fingerprint,
        "title": alert.title,
        "description": alert.description,
        "severity": alert.severity,
        "status": alert.status,
        "source": alert.source,
        "metric_name": alert.metric_name,
        "metric_value": alert.metric_value,
        "threshold": alert.threshold,
        "created_at": _json_datetime(alert.created_at),
        "first_seen_at": _json_datetime(alert.first_seen_at),
        "last_seen_at": _json_datetime(alert.last_seen_at),
        "updated_at": _json_datetime(alert.updated_at),
        "acknowledged_at": _json_datetime(alert.acknowledged_at),
        "investigating_at": _json_datetime(alert.investigating_at),
        "resolved_at": _json_datetime(alert.resolved_at),
        "closed_at": _json_datetime(alert.closed_at),
        "archived_at": _json_datetime(alert.archived_at),
        "assigned_to": alert.assigned_to,
        "investigation_notes": alert.investigation_notes,
        "resolution_notes": alert.resolution_notes,
        "root_cause": alert.root_cause,
        "resolution_category": alert.resolution_category,
        "resolved_by": alert.resolved_by,
        "closed_by": alert.closed_by,
        "success_rating": alert.success_rating,
        "metadata": alert.metadata_json or {},
    }


def record_alert_history(
    db,
    alert,
    *,
    event_type,
    actor="system",
    from_status=None,
    to_status=None,
    message=None,
    before=None,
    metadata=None,
):
    db.add(
        AlertHistory(
            tenant_id=alert.tenant_id,
            organization_id=alert.organization_id,
            alert_id=alert.id,
            event_type=event_type,
            from_status=from_status,
            to_status=to_status,
            actor=actor,
            message=message,
            before_json=before or {},
            after_json=alert_history_snapshot(alert),
            metadata_json=metadata or {},
        )
    )


def promote_alert_to_incident_knowledge(db, alert, *, actor="system"):
    if alert.status not in {"resolved", "closed"}:
        return None

    incident_key = alert.fingerprint or _alert_fingerprint_from_values(alert.resource_id, alert.source, alert.metric_name)
    resource = (
        db.query(Resource)
        .filter(Resource.id == alert.resource_id, Resource.tenant_id == alert.tenant_id)
        .first()
    )
    resource_metadata = resource.metadata_json or {} if resource else {}
    provider = resource.provider if resource else (alert.metadata_json or {}).get("provider")
    resource_type = resource.resource_type if resource else (alert.metadata_json or {}).get("resource_type")
    now = datetime.utcnow()

    knowledge = None
    if alert.id:
        knowledge = (
            db.query(IncidentKnowledge)
            .filter(
                IncidentKnowledge.tenant_id == alert.tenant_id,
                IncidentKnowledge.source_alert_id == alert.id,
            )
            .first()
        )

    if not knowledge:
        knowledge = IncidentKnowledge(
            tenant_id=alert.tenant_id,
            organization_id=alert.organization_id,
            source_alert_id=alert.id,
            incident_key=incident_key,
            created_at=now,
            occurrence_count=1,
        )
        db.add(knowledge)

    knowledge.title = alert.title
    knowledge.summary = _incident_summary(alert)
    knowledge.affected_resource_ids_json = [alert.resource_id]
    knowledge.providers_json = _compact_list([provider])
    knowledge.resource_types_json = _compact_list([resource_type])
    knowledge.alert_sources_json = _compact_list([alert.source])
    knowledge.metric_names_json = _compact_list([alert.metric_name])
    knowledge.severity = alert.severity
    knowledge.symptoms = alert.description
    knowledge.root_cause = alert.root_cause
    knowledge.investigation_notes = alert.investigation_notes
    knowledge.resolution_notes = alert.resolution_notes
    knowledge.resolution_category = alert.resolution_category
    knowledge.runbook_steps_json = _default_runbook_steps(alert)
    knowledge.verified_by = alert.resolved_by or alert.closed_by or actor
    knowledge.confidence_score = _incident_confidence_score(alert)
    knowledge.success_rating = alert.success_rating
    knowledge.first_seen_at = alert.first_seen_at or alert.created_at
    knowledge.last_seen_at = alert.resolved_at or alert.closed_at or alert.updated_at
    knowledge.updated_at = now
    knowledge.metadata_json = {
        "source": "alert_lifecycle",
        "source_alert_id": alert.id,
        "resource_name": resource.name if resource else None,
        "resource_region": resource.region if resource else None,
        "resource_metadata": resource_metadata,
        "promoted_by": actor,
    }

    db.flush()
    _upsert_openclaw_resolution(db, knowledge, alert, resource)
    return knowledge


def create_metric_sample(db, payload, tenant_id="internal", organization_id="internal"):
    metric = MetricSample(
        tenant_id=tenant_id,
        organization_id=organization_id,
        resource_id=payload.resource_id,
        metric_name=payload.metric_name,
        value=payload.value,
        unit=payload.unit,
        metadata_json=payload.metadata,
    )

    db.add(metric)
    db.commit()
    db.refresh(metric)

    return serialize_metric(metric)


def collect_resource_metrics(db, tenant_id="internal", organization_id="internal"):
    """
    Collect basic metrics from resources already known in a workspace.

    Outputs:
    - MetricSample rows for availability, disk, memory and CPU metadata

    Assumption:
    - This fallback collector reads stored resource metadata; connector-specific
      live collection happens through unified_monitoring_service.
    """
    resources = db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    created = 0

    for resource in resources:
        metadata = resource.metadata_json or {}

        created += _record_metric(
            db,
            resource,
            "resource_up",
            1 if resource.status in HEALTHY_STATUSES else 0,
            "boolean",
            tenant_id=tenant_id,
            organization_id=organization_id,
        )

        if "disk_used_percent" in metadata:
            created += _record_metric(
                db,
                resource,
                "disk_used_percent",
                metadata["disk_used_percent"],
                "percent",
                tenant_id=tenant_id,
                organization_id=organization_id,
            )

        if "memory_gb" in metadata:
            created += _record_metric(
                db,
                resource,
                "memory_total_gb",
                metadata["memory_gb"],
                "gigabytes",
                tenant_id=tenant_id,
                organization_id=organization_id,
            )

        if "cpu_count" in metadata:
            created += _record_metric(
                db,
                resource,
                "cpu_count",
                metadata["cpu_count"],
                "count",
                tenant_id=tenant_id,
                organization_id=organization_id,
            )

    db.commit()

    return {
        "status": "success",
        "metrics_created": created,
        "resources_checked": len(resources),
    }


def evaluate_alerts(db, tenant_id="internal", organization_id="internal"):
    """
    Evaluate current resource status and metric metadata into open/resolved alerts.

    Outputs:
    - Opens or updates active alerts for unavailable resources and disk pressure
    - Resolves prior alerts when the signal clears
    - Triggers notification delivery for newly opened alerts
    """
    resources = db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    opened_or_updated = 0
    resolved = 0

    for resource in resources:
        metadata = resource.metadata_json or {}

        status_alert = _status_alert_payload(resource)
        if status_alert:
            alert, created = _upsert_open_alert(
                db,
                resource,
                status_alert,
                tenant_id=tenant_id,
                organization_id=organization_id,
            )
            if created:
                notify_alert(db, alert)
            opened_or_updated += 1
        else:
            resolved += _resolve_alert(db, resource, "resource_status", "resource_up")

        disk_used_percent = metadata.get("disk_used_percent")
        disk_alert = _disk_alert_payload(resource, disk_used_percent)
        if disk_alert:
            alert, created = _upsert_open_alert(
                db,
                resource,
                disk_alert,
                tenant_id=tenant_id,
                organization_id=organization_id,
            )
            if created:
                notify_alert(db, alert)
            opened_or_updated += 1
        else:
            resolved += _resolve_alert(db, resource, "disk_capacity", "disk_used_percent")

    db.commit()

    return {
        "status": "success",
        "alerts_opened_or_updated": opened_or_updated,
        "alerts_resolved": resolved,
        "resources_checked": len(resources),
    }


def monitoring_summary(db, tenant_id="internal"):
    resources = db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    total_resources = len(resources)
    running = len([resource for resource in resources if resource.status == "running"])
    healthy = len([resource for resource in resources if resource.status in HEALTHY_STATUSES])
    open_alerts = db.query(Alert).filter(Alert.tenant_id == tenant_id, Alert.status == "open").all()

    return {
        "total_resources": total_resources,
        "healthy_percentage": _percentage(healthy, total_resources),
        "running_percentage": _percentage(running, total_resources),
        "open_alerts": len(open_alerts),
        "critical_alerts": len([alert for alert in open_alerts if alert.severity == "critical"]),
        "warning_alerts": len([alert for alert in open_alerts if alert.severity == "warning"]),
    }


def _record_metric(
    db,
    resource,
    metric_name,
    value,
    unit,
    metadata=None,
    tenant_id=None,
    organization_id=None,
):
    metric = MetricSample(
        tenant_id=tenant_id or resource.tenant_id or "internal",
        organization_id=organization_id or resource.organization_id or "internal",
        resource_id=resource.id,
        metric_name=metric_name,
        value=float(value),
        unit=unit,
        metadata_json=metadata or {
            "tenant_id": tenant_id or resource.tenant_id or "internal",
            "organization_id": organization_id or resource.organization_id or "internal",
            "provider": resource.provider,
            "resource_type": resource.resource_type,
        },
    )

    db.add(metric)
    return 1


def _status_alert_payload(resource):
    if resource.status in HEALTHY_STATUSES:
        return None

    severity = "critical" if resource.status in CRITICAL_STATUSES else "warning"

    return {
        "title": f"{resource.name} is {resource.status}",
        "description": "Resource status is outside the healthy operating states.",
        "severity": severity,
        "source": "resource_status",
        "metric_name": "resource_up",
        "metric_value": 0,
        "threshold": 1,
    }


def _disk_alert_payload(resource, disk_used_percent):
    if disk_used_percent is None or disk_used_percent < 80:
        return None

    severity = "critical" if disk_used_percent >= 90 else "warning"

    return {
        "title": f"{resource.name} disk usage is high",
        "description": "Disk usage has crossed the configured capacity threshold.",
        "severity": severity,
        "source": "disk_capacity",
        "metric_name": "disk_used_percent",
        "metric_value": disk_used_percent,
        "threshold": 90 if severity == "critical" else 80,
    }


def _upsert_open_alert(db, resource, payload, tenant_id=None, organization_id=None):
    tenant_id = tenant_id or resource.tenant_id or "internal"
    organization_id = organization_id or resource.organization_id or "internal"
    now = datetime.utcnow()
    fingerprint = _alert_fingerprint(resource, payload)
    alert = (
        db.query(Alert)
        .filter(
            Alert.tenant_id == tenant_id,
            Alert.resource_id == resource.id,
            Alert.source == payload["source"],
            Alert.metric_name == payload["metric_name"],
            Alert.status.in_(ACTIVE_ALERT_STATUSES),
        )
        .first()
    )

    if alert:
        before = alert_history_snapshot(alert)
        changed = any(
            [
                alert.title != payload["title"],
                alert.description != payload["description"],
                alert.severity != payload["severity"],
                alert.metric_value != payload["metric_value"],
                alert.threshold != payload["threshold"],
            ]
        )
        alert.title = payload["title"]
        alert.description = payload["description"]
        alert.severity = payload["severity"]
        alert.metric_value = payload["metric_value"]
        alert.threshold = payload["threshold"]
        alert.fingerprint = alert.fingerprint or fingerprint
        alert.last_seen_at = now
        alert.updated_at = now
        alert.metadata_json = {
            "tenant_id": tenant_id,
            "organization_id": organization_id,
            "provider": resource.provider,
            "resource_type": resource.resource_type,
            **payload.get("metadata", {}),
        }
        if changed:
            record_alert_history(
                db,
                alert,
                event_type="updated",
                actor="monitoring_worker",
                from_status=before.get("status"),
                to_status=alert.status,
                message="Alert evidence changed during monitoring evaluation.",
                before=before,
            )
        return alert, False

    alert = Alert(
        tenant_id=tenant_id,
        organization_id=organization_id,
        resource_id=resource.id,
        fingerprint=fingerprint,
        title=payload["title"],
        description=payload["description"],
        severity=payload["severity"],
        status="open",
        source=payload["source"],
        metric_name=payload["metric_name"],
        metric_value=payload["metric_value"],
        threshold=payload["threshold"],
        first_seen_at=now,
        last_seen_at=now,
        created_at=now,
        updated_at=now,
        metadata_json={
            "tenant_id": tenant_id,
            "organization_id": organization_id,
            "provider": resource.provider,
            "resource_type": resource.resource_type,
            **payload.get("metadata", {}),
        },
    )

    db.add(alert)
    db.flush()
    record_alert_history(
        db,
        alert,
        event_type="created",
        actor="monitoring_worker",
        to_status="open",
        message="Alert opened by monitoring evaluation.",
    )

    return alert, True


def _resolve_alert(db, resource, source, metric_name):
    alert = (
        db.query(Alert)
        .filter(
            Alert.tenant_id == resource.tenant_id,
            Alert.resource_id == resource.id,
            Alert.source == source,
            Alert.metric_name == metric_name,
            Alert.status.in_(ACTIVE_ALERT_STATUSES),
        )
        .first()
    )

    if not alert:
        return 0

    before = alert_history_snapshot(alert)
    alert.status = "resolved"
    alert.resolved_at = datetime.utcnow()
    alert.updated_at = alert.resolved_at
    record_alert_history(
        db,
        alert,
        event_type="status_changed",
        actor="monitoring_worker",
        from_status=before.get("status"),
        to_status="resolved",
        message="Alert auto-resolved because the monitored signal cleared.",
        before=before,
    )
    promote_alert_to_incident_knowledge(db, alert, actor="monitoring_worker")
    return 1


def _percentage(value, total):
    if total == 0:
        return 0

    return round((value / total) * 100)


def _alert_fingerprint(resource, payload):
    return _alert_fingerprint_from_values(resource.id, payload["source"], payload["metric_name"])


def _alert_fingerprint_from_values(resource_id, source, metric_name):
    return f"resource:{resource_id}:source:{source or 'unknown'}:metric:{metric_name or 'none'}"


def _json_datetime(value):
    return value.isoformat() if value else None


def _compact_list(values):
    return [value for value in dict.fromkeys(values) if value]


def _incident_summary(alert):
    pieces = [alert.title]
    if alert.root_cause:
        pieces.append(f"Root cause: {alert.root_cause}")
    if alert.resolution_notes:
        pieces.append(f"Resolution: {alert.resolution_notes}")
    return "\n\n".join(piece for piece in pieces if piece)


def _incident_confidence_score(alert):
    score = 35
    if alert.root_cause:
        score += 20
    if alert.resolution_notes:
        score += 25
    if alert.success_rating:
        score += min(alert.success_rating * 4, 20)
    return min(score, 95)


def _default_runbook_steps(alert):
    if alert.source == "disk_capacity" or alert.metric_name == "disk_used_percent":
        return [
            "Confirm disk usage and identify the largest directories or volumes.",
            "Rotate or archive logs and remove known temporary files.",
            "Increase disk capacity if growth is expected.",
            "Collect metrics again and close the alert after usage remains below threshold.",
        ]

    if alert.source == "resource_status" or alert.metric_name == "resource_up":
        return [
            "Confirm the current resource lifecycle state in InfraSight inventory.",
            "Review recent deployments, host events, and dependency health.",
            "Use the approved runbook for restart or recovery actions.",
            "Collect metrics again and close the alert after the resource remains healthy.",
        ]

    return [
        "Review the alert evidence and related metrics.",
        "Check recent changes around the alert window.",
        "Apply the approved remediation runbook for the affected service.",
        "Collect metrics again and close the alert only after validation.",
    ]


def _upsert_openclaw_resolution(db, knowledge, alert, resource):
    library_item = (
        db.query(OpenClawResolutionLibrary)
        .filter(
            OpenClawResolutionLibrary.tenant_id == knowledge.tenant_id,
            OpenClawResolutionLibrary.incident_knowledge_id == knowledge.id,
        )
        .first()
    )
    now = datetime.utcnow()
    successful = alert.success_rating is None or alert.success_rating >= 4
    duration = None
    if alert.resolved_at and alert.created_at:
        duration = int((alert.resolved_at - alert.created_at).total_seconds())

    if not library_item:
        library_item = OpenClawResolutionLibrary(
            tenant_id=knowledge.tenant_id,
            organization_id=knowledge.organization_id,
            incident_knowledge_id=knowledge.id,
            pattern_key=knowledge.incident_key,
            created_at=now,
            success_count=0,
            failure_count=0,
        )
        db.add(library_item)

    library_item.problem_signature = _problem_signature(alert, resource)
    library_item.environment_signature_json = {
        "provider": resource.provider if resource else None,
        "resource_type": resource.resource_type if resource else None,
        "resource_id": alert.resource_id,
        "source": alert.source,
        "metric_name": alert.metric_name,
        "severity": alert.severity,
    }
    library_item.recommended_resolution = alert.resolution_notes or knowledge.summary or alert.description
    library_item.ordered_steps_json = knowledge.runbook_steps_json or []
    library_item.contraindications_json = [
        "OpenClaw must not execute remediation automatically.",
        "Operators must validate the current environment before reusing a prior resolution.",
    ]
    library_item.required_permissions_json = ["read:alerts", "read:metrics", "read:inventory"]
    library_item.avg_time_to_resolve_seconds = duration
    library_item.last_success_at = now if successful else library_item.last_success_at
    library_item.success_count = max(library_item.success_count or 0, 1 if successful else 0)
    library_item.failure_count = library_item.failure_count or 0
    library_item.search_document = "\n".join(
        value
        for value in [
            alert.title,
            alert.description,
            alert.source,
            alert.metric_name,
            alert.root_cause,
            alert.investigation_notes,
            alert.resolution_notes,
            knowledge.summary,
        ]
        if value
    )
    library_item.embedding_json = library_item.embedding_json or {}
    library_item.updated_at = now


def _problem_signature(alert, resource):
    resource_name = resource.name if resource else f"resource {alert.resource_id}"
    metric = f" metric={alert.metric_name}" if alert.metric_name else ""
    return f"{alert.severity} {alert.source} alert on {resource_name}{metric}: {alert.title}"

"""
OpenClaw Tool Implementations
=============================
Each tool in this module maps to one entry in OPENCLAW_TOOL_DEFINITIONS and is
dispatched by execute_openclaw_tool(). OpenClaw analyst tools are read-only:
they inspect InfraSight data and return evidence, never mutations.

Data flow:
  OpenClaw chat request
    → _select_tool_calls() picks relevant tools
    → execute_openclaw_tool() routes to the matching function here
    → result dict is passed back to the LLM as context
    → LLM composes a natural-language answer grounded in the tool output
"""

import json
import shutil
import subprocess
from collections import defaultdict

from sqlalchemy import or_

from backend.config.settings import (
    OPENCLAW_MODE,
    OPENCLAW_PERMISSIONS,
)
from backend.discovery.onprem.local_service import discover_local_system
from backend.models.alert import Alert, IncidentKnowledge, OpenClawResolutionLibrary
from backend.models.metric import MetricSample
from backend.models.resource import Resource
from backend.services.monitoring_service import (
    ACTIVE_ALERT_STATUSES,
    monitoring_summary,
    serialize_alert,
    serialize_metric,
)
from backend.services.discovery_service import discovery_summary
from backend.services.unified_monitoring_service import operational_summary

# Catalogue of all tools OpenClaw can invoke.
# Each entry describes the tool name, what it does, whether it requires a
# specific permission, and whether it is read-only (safe) or write (gated).
OPENCLAW_TOOL_DEFINITIONS = [
    {
        "name": "ec2_inventory",
        "description": "Read EC2 inventory already synchronized into InfraSight.",
        "read_only": True,
    },
    {
        "name": "docker_container_status",
        "description": "Read local Docker container status through the backend host.",
        "read_only": True,
    },
    {
        "name": "system_metrics",
        "description": "Read InfraSight monitoring summary and recent metric samples.",
        "read_only": True,
    },
    {
        "name": "alerts",
        "description": "Read InfraSight alert records.",
        "read_only": True,
    },
    {
        "name": "infrastructure_health_analysis",
        "description": "Read metrics, alerts, and resolved historical incidents to explain unhealthy resources.",
        "permission": "explain_incidents",
        "read_only": True,
    },
    {
        "name": "analyze_alerts",
        "description": "Analyze open alerts by severity, source, provider, and affected resource.",
        "permission": "analyze_alerts",
        "read_only": True,
    },
    {
        "name": "explain_incidents",
        "description": "Explain open incidents using alert, resource, and metric context.",
        "permission": "explain_incidents",
        "read_only": True,
    },
    {
        "name": "suggest_fixes",
        "description": "Suggest safe operational fixes based on InfraSight data.",
        "permission": "suggest_fixes",
        "read_only": True,
    },
    {
        "name": "correlate_infrastructure_events",
        "description": "Correlate alerts, metrics, resources, and OpenClaw audit events.",
        "permission": "correlate_infrastructure_events",
        "read_only": True,
    },
    {
        "name": "cloud_onprem_copilot_context",
        "description": "Build cloud and on-prem operating context for copilot responses.",
        "permission": "cloud_onprem_copilot",
        "read_only": True,
    },
    {
        "name": "operational_summary",
        "description": "Summarize unified infrastructure, container, cloud, and database health.",
        "permission": "cloud_onprem_copilot",
        "read_only": True,
    },
    {
        "name": "discovery_summary",
        "description": "Summarize discovery coverage, topology relationships, and monitoring profiles.",
        "permission": "cloud_onprem_copilot",
        "read_only": True,
    },
]


# ---------------------------------------------------------------------------
# Read-only data tools
# ---------------------------------------------------------------------------

def get_ec2_inventory(db, tenant_id="internal"):
    """Return all EC2 resources synchronized into InfraSight for the tenant."""
    resources = (
        db.query(Resource)
        .filter(
            Resource.tenant_id == tenant_id,
            Resource.provider == "aws",
            Resource.resource_type == "ec2",
        )
        .order_by(Resource.name)
        .all()
    )

    items = [_serialize_resource(resource) for resource in resources]

    return {
        "status": "success",
        "count": len(items),
        "items": items,
    }


def get_docker_container_status():
    """
    Query local Docker daemon for container status via the docker CLI.
    Returns a structured list or an unavailable/error payload when Docker
    is not installed or the daemon is unreachable.
    """
    if not shutil.which("docker"):
        return {
            "status": "unavailable",
            "message": "Docker CLI is not installed or not available to the backend process.",
            "containers": [],
        }

    try:
        completed = subprocess.run(
            ["docker", "ps", "-a", "--format", "{{json .}}"],
            capture_output=True,
            check=False,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {
            "status": "error",
            "message": str(exc),
            "containers": [],
        }

    if completed.returncode != 0:
        return {
            "status": "error",
            "message": completed.stderr.strip() or "Docker returned a non-zero exit code.",
            "containers": [],
        }

    containers = []
    for line in completed.stdout.splitlines():
        if not line.strip():
            continue

        try:
            containers.append(json.loads(line))
        except json.JSONDecodeError:
            containers.append({"raw": line})

    return {
        "status": "success",
        "count": len(containers),
        "containers": containers,
    }


def get_system_metrics(db, tenant_id="internal"):
    """
    Return the InfraSight monitoring summary plus the latest metric sample
    per metric-name per resource (capped at 250 most-recent samples total).
    Also includes a live on-prem local system snapshot.
    """
    latest_by_resource = defaultdict(dict)
    samples = (
        db.query(MetricSample)
        .filter(MetricSample.tenant_id == tenant_id)
        .order_by(MetricSample.collected_at.desc())
        .limit(250)
        .all()
    )

    # Deduplicate: keep only the most-recent value for each (resource, metric) pair
    for sample in samples:
        resource_metrics = latest_by_resource[sample.resource_id]
        if sample.metric_name not in resource_metrics:
            resource_metrics[sample.metric_name] = serialize_metric(sample)

    return {
        "status": "success",
        "summary": monitoring_summary(db, tenant_id=tenant_id),
        "local_system": discover_local_system(),
        "latest_metrics_by_resource": latest_by_resource,
    }


def get_alerts(db, status="open", severity=None, tenant_id="internal"):
    """
    Fetch alert records filtered by status and optional severity.
    Defaults to open alerts; pass status="all" to include historical records
    or status="active" to include only currently actionable alerts.
    """
    query = db.query(Alert).filter(Alert.tenant_id == tenant_id)

    if status == "active":
        query = query.filter(Alert.status.in_(ACTIVE_ALERT_STATUSES))
    elif status != "all":
        query = query.filter(Alert.status == status)

    if severity:
        query = query.filter(Alert.severity == severity)

    alerts = query.order_by(Alert.created_at.desc()).limit(100).all()

    return {
        "status": "success",
        "count": len(alerts),
        "items": [serialize_alert(alert) for alert in alerts],
    }


def analyze_infrastructure_health(db, resource_query=None, tenant_id="internal"):
    """
    Build a read-only infrastructure analyst view from InfraSight telemetry.
    The analysis combines active alerts, latest resource metrics, availability
    status, and resolved historical alerts that look similar.
    """
    permission_error = _permission_error("explain_incidents")
    if permission_error:
        return permission_error

    resources_query = db.query(Resource).filter(Resource.tenant_id == tenant_id)
    if resource_query:
        query = f"%{resource_query.lower()}%"
        resources_query = resources_query.filter(
            or_(
                Resource.name.ilike(query),
                Resource.resource_id.ilike(query),
                Resource.resource_type.ilike(query),
                Resource.provider.ilike(query),
            )
        )

    resources = resources_query.order_by(Resource.name).limit(25).all()
    if not resources and resource_query:
        resources = (
            db.query(Resource)
            .filter(Resource.tenant_id == tenant_id)
            .order_by(Resource.name)
            .limit(25)
            .all()
        )

    analyses = []
    for resource in resources:
        active_alerts = (
            db.query(Alert)
            .filter(
                Alert.tenant_id == tenant_id,
                Alert.resource_id == resource.id,
                Alert.status.in_(ACTIVE_ALERT_STATUSES),
            )
            .order_by(Alert.created_at.desc())
            .limit(20)
            .all()
        )
        latest_metrics = _latest_metrics_for_resource(db, resource.id, tenant_id=tenant_id)
        similar_incidents = _similar_resolved_incidents(db, resource, active_alerts, tenant_id=tenant_id)
        health_state = _resource_health_state(resource, active_alerts)

        analyses.append(
            {
                "resource": _serialize_resource(resource),
                "health_status": health_state["status"],
                "health_reasons": health_state["reasons"],
                "active_alerts": [serialize_alert(alert) for alert in active_alerts],
                "latest_metrics": latest_metrics,
                "possible_causes": _possible_causes(resource, active_alerts, latest_metrics),
                "suggested_checks": _investigation_steps(resource, active_alerts, latest_metrics),
                "similar_incidents": similar_incidents,
                "confidence": _analysis_confidence(active_alerts, latest_metrics, similar_incidents),
                "read_only": True,
            }
        )

    return {
        "status": "success",
        "resource_query": resource_query,
        "analysis_count": len(analyses),
        "analyses": analyses,
        "read_only": True,
    }


# ---------------------------------------------------------------------------
# Permission-gated analysis tools
# ---------------------------------------------------------------------------

def analyze_alerts(db, tenant_id="internal"):
    """
    Aggregate non-resolved alerts by severity, source, and cloud provider.
    Requires the 'analyze_alerts' OpenClaw permission.
    """
    permission_error = _permission_error("analyze_alerts")
    if permission_error:
        return permission_error

    alerts = db.query(Alert).filter(Alert.tenant_id == tenant_id, Alert.status.in_(ACTIVE_ALERT_STATUSES)).all()
    resources = {
        resource.id: resource
        for resource in db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    }
    by_severity = defaultdict(int)
    by_source = defaultdict(int)
    by_provider = defaultdict(int)
    affected_resources = []

    for alert in alerts:
        resource = resources.get(alert.resource_id)
        by_severity[alert.severity] += 1
        by_source[alert.source] += 1
        by_provider[resource.provider if resource else "unknown"] += 1
        affected_resources.append(
            {
                "alert_id": alert.id,
                "title": alert.title,
                "severity": alert.severity,
                "source": alert.source,
                "resource": _serialize_resource(resource) if resource else None,
                "metric_name": alert.metric_name,
                "metric_value": alert.metric_value,
                "threshold": alert.threshold,
            }
        )

    return {
        "status": "success",
        "open_or_acknowledged_alerts": len(alerts),
        "by_severity": dict(by_severity),
        "by_source": dict(by_source),
        "by_provider": dict(by_provider),
        "affected_resources": affected_resources,
    }


def explain_incidents(db, tenant_id="internal"):
    """
    For each open alert, build an incident explanation that includes the
    affected resource, latest metrics, and a likely-cause heuristic.
    Requires the 'explain_incidents' OpenClaw permission.
    """
    permission_error = _permission_error("explain_incidents")
    if permission_error:
        return permission_error

    alerts = (
        db.query(Alert)
        .filter(Alert.tenant_id == tenant_id, Alert.status == "open")
        .order_by(Alert.created_at.desc())
        .all()
    )
    resources = {
        resource.id: resource
        for resource in db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    }
    incidents = []

    for alert in alerts:
        resource = resources.get(alert.resource_id)
        latest_metrics = _latest_metrics_for_resource(db, alert.resource_id, tenant_id=tenant_id)
        incidents.append(
            {
                "alert_id": alert.id,
                "title": alert.title,
                "severity": alert.severity,
                "status": alert.status,
                "source": alert.source,
                "resource": _serialize_resource(resource) if resource else None,
                "likely_cause": _likely_cause(alert),
                "evidence": {
                    "metric_name": alert.metric_name,
                    "metric_value": alert.metric_value,
                    "threshold": alert.threshold,
                    "latest_metrics": latest_metrics,
                },
                "operator_note": "OpenClaw explanation is based only on InfraSight backend telemetry.",
            }
        )

    return {
        "status": "success",
        "count": len(incidents),
        "incidents": incidents,
    }


def suggest_fixes(db, tenant_id="internal"):
    """
    Generate per-alert remediation suggestions based on source and metric context.
    Delegates to analyze_alerts for the alert list, then applies fix heuristics.
    Requires the 'suggest_fixes' OpenClaw permission.
    """
    permission_error = _permission_error("suggest_fixes")
    if permission_error:
        return permission_error

    analysis = analyze_alerts(db, tenant_id=tenant_id)
    if analysis.get("status") != "success":
        return analysis

    suggestions = []
    for item in analysis["affected_resources"]:
        suggestions.append(
            {
                "alert_id": item["alert_id"],
                "title": item["title"],
                "severity": item["severity"],
                "recommended_steps": _suggest_steps(item),
                "remediation_policy": {
                    "can_execute": False,
                    "read_only": True,
                    "current_mode": OPENCLAW_MODE,
                },
            }
        )

    return {
        "status": "success",
        "count": len(suggestions),
        "suggestions": suggestions,
    }


def correlate_infrastructure_events(db, tenant_id="internal"):
    """
    Join alerts with their resources and nearest metric samples to surface
    correlated infrastructure events.  Useful for root-cause analysis.
    Requires the 'correlate_infrastructure_events' OpenClaw permission.
    """
    permission_error = _permission_error("correlate_infrastructure_events")
    if permission_error:
        return permission_error

    resources = db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    alerts = (
        db.query(Alert)
        .filter(Alert.tenant_id == tenant_id)
        .order_by(Alert.created_at.desc())
        .limit(100)
        .all()
    )
    samples = (
        db.query(MetricSample)
        .filter(MetricSample.tenant_id == tenant_id)
        .order_by(MetricSample.collected_at.desc())
        .limit(100)
        .all()
    )

    resource_map = {resource.id: resource for resource in resources}
    correlations = []

    for alert in alerts:
        resource = resource_map.get(alert.resource_id)
        # Find up to 5 metric samples for the same resource, filtered to the
        # alert's metric name when available for tighter correlation
        related_metrics = [
            serialize_metric(sample)
            for sample in samples
            if sample.resource_id == alert.resource_id
            and (not alert.metric_name or sample.metric_name == alert.metric_name)
        ][:5]
        correlations.append(
            {
                "alert": serialize_alert(alert),
                "resource": _serialize_resource(resource) if resource else None,
                "related_metrics": related_metrics,
                "correlation": _correlation_summary(alert, resource, related_metrics),
            }
        )

    return {
        "status": "success",
        "resource_count": len(resources),
        "correlation_count": len(correlations),
        "correlations": correlations,
    }


def get_copilot_context(db, tenant_id="internal"):
    """
    Build a high-level cloud/on-prem copilot context: resource counts grouped
    by provider and type, current monitoring summary, and local system snapshot.
    Requires the 'cloud_onprem_copilot' OpenClaw permission.
    """
    permission_error = _permission_error("cloud_onprem_copilot")
    if permission_error:
        return permission_error

    resources = db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    by_provider = defaultdict(int)
    by_type = defaultdict(int)

    for resource in resources:
        by_provider[resource.provider] += 1
        by_type[resource.resource_type] += 1

    return {
        "status": "success",
        "mode": OPENCLAW_MODE,
        "permissions": OPENCLAW_PERMISSIONS,
        "summary": monitoring_summary(db, tenant_id=tenant_id),
        "resources": {
            "total": len(resources),
            "by_provider": dict(by_provider),
            "by_type": dict(by_type),
        },
        "local_system": discover_local_system(),
    }


def get_operational_summary(db, tenant_id="internal"):
    """
    Unified infrastructure health summary across all connectors and providers.
    Delegates to the unified_monitoring_service.
    Requires the 'cloud_onprem_copilot' OpenClaw permission.
    """
    permission_error = _permission_error("cloud_onprem_copilot")
    if permission_error:
        return permission_error

    return operational_summary(db, tenant_id=tenant_id)


def get_discovery_summary(db, tenant_id="internal"):
    """
    Return discovery coverage: supported types, recent runs, topology
    relationships, and monitoring profile assignments.
    Requires the 'cloud_onprem_copilot' OpenClaw permission.
    """
    permission_error = _permission_error("cloud_onprem_copilot")
    if permission_error:
        return permission_error

    return {
        "status": "success",
        **discovery_summary(db, tenant_id=tenant_id),
    }


# ---------------------------------------------------------------------------
# Write tool — gated by mode and explicit allow-list
# ---------------------------------------------------------------------------

def restart_approved_service(service_name, reason, actor="openclaw"):
    """
    Legacy compatibility shim. OpenClaw is read-only, so restart requests are
    blocked and must be handled outside the analyst workflow.
    """
    return {
        "status": "blocked",
        "message": "OpenClaw is read-only. Service restarts are not executed.",
        "service_name": service_name,
        "reason": reason,
        "actor": actor,
        "mode": OPENCLAW_MODE,
    }


# ---------------------------------------------------------------------------
# Central dispatcher
# ---------------------------------------------------------------------------

def execute_openclaw_tool(
    db,
    tool_name,
    arguments=None,
    actor="openclaw",
    tenant_id="internal",
    organization_id="internal",
):
    """
    Route a read-only OpenClaw tool call to its implementation.

    Inputs:
    - tool_name and optional arguments selected by openclaw_service
    - tenant_id / organization_id workspace scope

    Outputs:
    - dict result with at least a status key for response composition and audit

    Important assumptions:
    - Tools may inspect inventory, metrics, alerts and incidents.
    - Tools must not execute infrastructure changes; restart_approved_service is
      intentionally blocked even when called through this dispatcher.
    """
    arguments = arguments or {}

    if tool_name == "ec2_inventory":
        return get_ec2_inventory(db, tenant_id=tenant_id)

    if tool_name == "docker_container_status":
        return get_docker_container_status()

    if tool_name == "system_metrics":
        return get_system_metrics(db, tenant_id=tenant_id)

    if tool_name == "alerts":
        return get_alerts(
            db,
            status=arguments.get("status", "open"),
            severity=arguments.get("severity"),
            tenant_id=tenant_id,
        )

    if tool_name == "infrastructure_health_analysis":
        return analyze_infrastructure_health(
            db,
            resource_query=arguments.get("resource_query"),
            tenant_id=tenant_id,
        )

    if tool_name == "analyze_alerts":
        return analyze_alerts(db, tenant_id=tenant_id)

    if tool_name == "explain_incidents":
        return explain_incidents(db, tenant_id=tenant_id)

    if tool_name == "suggest_fixes":
        return suggest_fixes(db, tenant_id=tenant_id)

    if tool_name == "correlate_infrastructure_events":
        return correlate_infrastructure_events(db, tenant_id=tenant_id)

    if tool_name == "cloud_onprem_copilot_context":
        return get_copilot_context(db, tenant_id=tenant_id)

    if tool_name == "operational_summary":
        return get_operational_summary(db, tenant_id=tenant_id)

    if tool_name == "discovery_summary":
        return get_discovery_summary(db, tenant_id=tenant_id)

    return {
        "status": "error",
        "message": f"Unknown OpenClaw tool: {tool_name}",
    }


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _serialize_resource(resource):
    """Flatten a Resource ORM row into a JSON-safe dict for tool results."""
    if not resource:
        return None

    metadata = resource.metadata_json or {}

    return {
        "id": resource.id,
        "resource_id": resource.resource_id,
        "provider": resource.provider,
        "resource_type": resource.resource_type,
        "name": resource.name,
        "region": resource.region,
        "status": resource.status,
        "private_ip": metadata.get("private_ip"),
        "public_ip": metadata.get("public_ip"),
        "metadata": metadata,
    }


# ---------------------------------------------------------------------------
# Permission guard
# ---------------------------------------------------------------------------

def _permission_error(permission):
    """
    Return a denial payload when the requested permission is not in the active
    OPENCLAW_PERMISSIONS list, or None if the permission is granted.
    """
    if permission in OPENCLAW_PERMISSIONS:
        return None

    return {
        "status": "denied",
        "message": f"OpenClaw permission is not enabled: {permission}",
        "permission": permission,
        "enabled_permissions": OPENCLAW_PERMISSIONS,
    }


# ---------------------------------------------------------------------------
# Metric helpers
# ---------------------------------------------------------------------------

def _latest_metrics_for_resource(db, resource_id, tenant_id="internal"):
    """Return the most-recent sample per metric name for a given resource."""
    samples = (
        db.query(MetricSample)
        .filter(MetricSample.resource_id == resource_id, MetricSample.tenant_id == tenant_id)
        .order_by(MetricSample.collected_at.desc())
        .limit(25)
        .all()
    )
    latest = {}

    for sample in samples:
        if sample.metric_name not in latest:
            latest[sample.metric_name] = serialize_metric(sample)

    return latest


def _similar_resolved_incidents(db, resource, active_alerts, tenant_id="internal"):
    """Find incident knowledge that shares resource, metric, or source context."""
    metric_names = [alert.metric_name for alert in active_alerts if alert.metric_name]
    sources = [alert.source for alert in active_alerts if alert.source]

    knowledge_rows = (
        db.query(IncidentKnowledge, OpenClawResolutionLibrary)
        .outerjoin(
            OpenClawResolutionLibrary,
            OpenClawResolutionLibrary.incident_knowledge_id == IncidentKnowledge.id,
        )
        .filter(IncidentKnowledge.tenant_id == tenant_id)
        .order_by(IncidentKnowledge.last_seen_at.desc().nullslast(), IncidentKnowledge.updated_at.desc())
        .limit(25)
        .all()
    )
    matches = []

    for knowledge, resolution in knowledge_rows:
        basis = _knowledge_match_basis(knowledge, resource, metric_names, sources)
        if not basis:
            continue
        matches.append(
            {
                "alert_id": knowledge.source_alert_id,
                "incident_knowledge_id": knowledge.id,
                "title": knowledge.title,
                "severity": knowledge.severity,
                "source": _first_json_value(knowledge.alert_sources_json),
                "metric_name": _first_json_value(knowledge.metric_names_json),
                "metric_value": None,
                "threshold": None,
                "created_at": knowledge.first_seen_at,
                "resolved_at": knowledge.last_seen_at,
                "match_basis": basis,
                "root_cause": knowledge.root_cause,
                "resolution_notes": knowledge.resolution_notes,
                "success_rating": knowledge.success_rating,
                "recommended_resolution": resolution.recommended_resolution if resolution else None,
                "ordered_steps": resolution.ordered_steps_json if resolution else knowledge.runbook_steps_json,
            }
        )

    if matches:
        return sorted(matches, key=lambda item: len(item["match_basis"]), reverse=True)[:5]

    filters = [Alert.resource_id == resource.id]
    if metric_names:
        filters.append(Alert.metric_name.in_(metric_names))
    if sources:
        filters.append(Alert.source.in_(sources))

    incidents = (
        db.query(Alert)
        .filter(Alert.tenant_id == tenant_id, Alert.status.in_(["resolved", "closed"]), or_(*filters))
        .order_by(Alert.resolved_at.desc().nullslast(), Alert.updated_at.desc())
        .limit(5)
        .all()
    )

    return [
        {
            "alert_id": alert.id,
            "title": alert.title,
            "severity": alert.severity,
            "source": alert.source,
            "metric_name": alert.metric_name,
            "metric_value": alert.metric_value,
            "threshold": alert.threshold,
            "created_at": alert.created_at,
            "resolved_at": alert.resolved_at,
            "match_basis": _incident_match_basis(alert, resource, metric_names, sources),
        }
        for alert in incidents
    ]


# ---------------------------------------------------------------------------
# Heuristic helpers
# ---------------------------------------------------------------------------

def _likely_cause(alert):
    """Map known alert sources and metric names to a plain-English cause string."""
    if alert.source == "disk_capacity":
        return "Disk usage has crossed the configured threshold."

    if alert.source == "resource_status":
        return "The resource reported a non-healthy runtime status."

    if alert.metric_name:
        return f"The {alert.metric_name} metric is outside the expected operating range."

    return "InfraSight detected an infrastructure condition requiring operator review."


def _resource_health_state(resource, active_alerts):
    """Explain unhealthy state from availability and active alert evidence."""
    status = (resource.status or "unknown").lower()
    reasons = []

    if status not in {"running", "healthy", "available"}:
        reasons.append(f"Resource availability status is {resource.status}.")

    critical_alerts = [alert for alert in active_alerts if alert.severity == "critical"]
    warning_alerts = [alert for alert in active_alerts if alert.severity == "warning"]
    if critical_alerts:
        reasons.append(f"{len(critical_alerts)} active critical alert(s).")
    if warning_alerts:
        reasons.append(f"{len(warning_alerts)} active warning alert(s).")

    if critical_alerts or status in {"critical", "failed", "terminated", "stopped", "down", "offline"}:
        health_status = "Critical"
    elif warning_alerts or reasons:
        health_status = "Warning"
    else:
        health_status = "Healthy"
        reasons.append("No active alert or availability signal indicates degradation.")

    return {"status": health_status, "reasons": reasons}


def _possible_causes(resource, active_alerts, latest_metrics):
    """Map alert and metric evidence to possible causes without claiming certainty."""
    causes = []
    status = (resource.status or "").lower()

    for alert in active_alerts:
        causes.append(_likely_cause(alert))

    disk_metric = latest_metrics.get("disk_used_percent")
    if disk_metric and disk_metric.get("value", 0) >= 80:
        causes.append("Disk pressure may be causing degraded service behavior.")

    resource_up = latest_metrics.get("resource_up")
    if resource_up and resource_up.get("value") == 0:
        causes.append("Availability check reports the resource is down.")

    if status in {"stopped", "terminated", "failed", "critical"}:
        causes.append("Recent lifecycle state suggests the resource may be stopped, failed, or removed.")

    if not causes:
        causes.append("No specific cause is proven by current telemetry; check recent changes and dependency health.")

    return list(dict.fromkeys(causes))


def _investigation_steps(resource, active_alerts, latest_metrics):
    """Return read-only investigation steps tailored to the available evidence."""
    steps = [
        f"Confirm current {resource.provider} / {resource.resource_type} lifecycle status in InfraSight inventory.",
        "Review deployment, configuration, and dependency changes around the alert window.",
    ]

    metric_names = {alert.metric_name for alert in active_alerts if alert.metric_name}
    metric_names.update(latest_metrics.keys())

    if "disk_used_percent" in metric_names:
        steps.append("Check filesystem usage trends, largest directories, log growth, and retention jobs.")
    if "resource_up" in metric_names:
        steps.append("Check host or service reachability and recent restart or shutdown events.")
    if any(alert.severity == "critical" for alert in active_alerts):
        steps.append("Prioritize critical alerts first and validate whether user-facing services are impacted.")

    steps.append("Keep remediation outside OpenClaw; use approved operator runbooks after confirming cause.")
    return steps


def _analysis_confidence(active_alerts, latest_metrics, similar_incidents):
    """Score confidence from the amount and quality of read-only evidence."""
    score = 20
    reasons = []

    if active_alerts:
        score += 35
        reasons.append("active alerts are present")
    if latest_metrics:
        score += 25
        reasons.append("latest metrics are available")
    if similar_incidents:
        score += 15
        reasons.append("similar resolved incidents are available")

    if score >= 70:
        level = "High"
    elif score >= 45:
        level = "Medium"
    else:
        level = "Low"

    return {
        "level": level,
        "score": min(score, 95),
        "basis": reasons or ["limited InfraSight evidence is available"],
    }


def _incident_match_basis(alert, resource, metric_names, sources):
    basis = []
    if alert.resource_id == resource.id:
        basis.append("same resource")
    if alert.metric_name in metric_names:
        basis.append("same metric")
    if alert.source in sources:
        basis.append("same alert source")
    return basis or ["resolved incident in same tenant"]


def _knowledge_match_basis(knowledge, resource, metric_names, sources):
    basis = []
    resource_ids = knowledge.affected_resource_ids_json or []
    metric_history = knowledge.metric_names_json or []
    source_history = knowledge.alert_sources_json or []
    resource_types = knowledge.resource_types_json or []
    providers = knowledge.providers_json or []

    if resource.id in resource_ids:
        basis.append("same resource")
    if set(metric_names).intersection(metric_history):
        basis.append("same metric")
    if set(sources).intersection(source_history):
        basis.append("same alert source")
    if resource.resource_type in resource_types:
        basis.append("same resource type")
    if resource.provider in providers:
        basis.append("same provider")

    return basis


def _first_json_value(values):
    if not values:
        return None
    return values[0]


def _suggest_steps(alert_item):
    """Return ordered remediation steps based on alert source and provider."""
    source = alert_item.get("source")
    metric_name = alert_item.get("metric_name")
    resource = alert_item.get("resource") or {}
    provider = resource.get("provider", "unknown")

    if source == "disk_capacity" or metric_name == "disk_used_percent":
        return [
            "Confirm the largest directories or volumes from the host or platform console.",
            "Rotate or archive logs and remove known temporary files.",
            "Increase disk capacity if usage growth is expected.",
            "Collect metrics again and resolve the alert only after usage drops below threshold.",
        ]

    if source == "resource_status":
        steps = [
            f"Check the {provider} resource status and recent lifecycle events.",
            "Review recent deployments, host logs, and dependency health.",
            "Restart only an approved service if the runbook indicates it is safe.",
        ]
        if provider in {"aws", "azure"}:
            steps.append("Use cloud console or synchronized InfraSight inventory; OpenClaw has no direct cloud credentials.")
        return steps

    return [
        "Review the alert evidence and related metrics.",
        "Compare against recent infrastructure changes.",
        "Apply the relevant runbook and keep remediation within approved actions.",
    ]


def _correlation_summary(alert, resource, related_metrics):
    """Produce a one-line correlation summary for an alert/resource pair."""
    resource_name = resource.name if resource else "unknown resource"
    metric_count = len(related_metrics)

    if metric_count:
        return (
            f"{alert.title} is linked to {resource_name} with "
            f"{metric_count} recent related metric samples."
        )

    return f"{alert.title} is linked to {resource_name}; no recent related metric samples were found."

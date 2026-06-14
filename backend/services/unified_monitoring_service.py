"""
Unified Monitoring Service
===========================
Collects metrics and alerts across all registered connectors in a single pass.

Data flow:
  build_connectors() → iterates registered connector types for the tenant
    → connector.collect() → returns observations (resource + metrics + alerts)
    → _upsert_resource_from_observation() → creates/updates Resource rows
    → _record_metric() → writes MetricSample rows
    → _upsert_open_alert() → creates/updates Alert rows

The operational_summary() function provides a cross-provider health overview
used by the dashboard Overview and the OpenClaw operational_summary tool.
"""

from backend.connectors.registry import build_connectors
from backend.models.alert import Alert
from backend.models.resource import Resource
from backend.services.monitoring_service import _record_metric, _upsert_open_alert


def collect_unified_monitoring(
    db,
    tenant_id="internal",
    organization_id="internal",
):
    """
    Run a monitoring collection pass for all connectors belonging to the tenant.
    Returns a summary of metrics created and alerts opened, broken down by connector.
    """
    metrics_created = 0
    alerts_opened = 0
    connector_results = []

    for connector in build_connectors(db, tenant_id=tenant_id):
        observations = connector.collect()
        connector_metrics = 0
        connector_alerts = 0

        for observation in observations:
            resource = _upsert_resource_from_observation(db, observation)

            # Write a MetricSample for each numeric metric in the observation
            for metric_name, value in observation.get("metrics", {}).items():
                if value is None:
                    continue

                metrics_created += _record_metric(
                    db,
                    resource,
                    metric_name,
                    value,
                    _metric_unit(metric_name),
                    metadata={
                        "connector_type": observation["connector_type"],
                        "tenant_id": tenant_id,
                        "organization_id": organization_id,
                        "provider": resource.provider,
                        "resource_type": resource.resource_type,
                    },
                    tenant_id=tenant_id,
                    organization_id=organization_id,
                )
                connector_metrics += 1

            # Create or update Alert rows for any alert conditions reported by the connector
            for alert_payload in observation.get("alerts", []):
                alert_payload["source"] = alert_payload.get("source", "unified_monitoring")
                _, created = _upsert_open_alert(
                    db,
                    resource,
                    {
                        **alert_payload,
                        "metadata": {
                            "connector_type": observation["connector_type"],
                            "tenant_id": tenant_id,
                            "organization_id": organization_id,
                        },
                    },
                    tenant_id=tenant_id,
                    organization_id=organization_id,
                )
                if created:
                    alerts_opened += 1
                    connector_alerts += 1

        connector_results.append(
            {
                "connector_type": connector.connector_type,
                "observations": len(observations),
                "metrics_created": connector_metrics,
                "alerts_opened": connector_alerts,
            }
        )

    db.commit()

    return {
        "status": "success",
        "tenant_id": tenant_id,
        "metrics_created": metrics_created,
        "alerts_opened": alerts_opened,
        "connectors": connector_results,
    }


def operational_summary(db, tenant_id="internal"):
    """
    Return a cross-provider operational health summary:
    - total resources grouped by provider
    - open alerts grouped by connector type and severity
    - readiness flags for agent and Kubernetes integrations

    Used by the dashboard Overview, OpenClaw operational_summary tool,
    and the monitoring operational-summary endpoint.
    """
    resources = db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    open_alerts = db.query(Alert).filter(Alert.tenant_id == tenant_id, Alert.status == "open").all()
    by_provider = {}
    by_connector = {}
    by_severity = {}

    for resource in resources:
        by_provider[resource.provider] = by_provider.get(resource.provider, 0) + 1

    for alert in open_alerts:
        metadata = alert.metadata_json or {}
        connector_type = metadata.get("connector_type", "legacy")
        by_connector[connector_type] = by_connector.get(connector_type, 0) + 1
        by_severity[alert.severity] = by_severity.get(alert.severity, 0) + 1

    return {
        "status": "success",
        "tenant_id": tenant_id,
        "resources": {
            "total": len(resources),
            "by_provider": by_provider,
        },
        "alerts": {
            "open": len(open_alerts),
            "by_connector": by_connector,
            "by_severity": by_severity,
        },
        "agent_ready": True,
        "kubernetes_ready": True,
    }


def _upsert_resource_from_observation(db, observation):
    """
    Upsert a Resource row from a connector observation dict.
    Matches on resource_id + tenant_id; updates all fields on subsequent collections.
    """
    resource = (
        db.query(Resource)
        .filter(
            Resource.resource_id == observation["resource_id"],
            Resource.tenant_id == observation.get("tenant_id", "internal"),
        )
        .first()
    )
    metadata = {
        **observation.get("metadata", {}),
        "connector_type": observation["connector_type"],
        "tenant_id": observation.get("tenant_id", "internal"),
        "organization_id": observation.get("organization_id", observation.get("tenant_id", "internal")),
    }

    if resource:
        resource.tenant_id = observation.get("tenant_id", "internal")
        resource.organization_id = observation.get("organization_id", observation.get("tenant_id", "internal"))
        resource.provider = observation["provider"]
        resource.resource_type = observation["resource_type"]
        resource.name = observation["name"]
        resource.region = observation["region"]
        resource.status = observation["status"]
        resource.metadata_json = metadata
        db.flush()
        return resource

    resource = Resource(
        tenant_id=observation.get("tenant_id", "internal"),
        organization_id=observation.get("organization_id", observation.get("tenant_id", "internal")),
        provider=observation["provider"],
        resource_id=observation["resource_id"],
        resource_type=observation["resource_type"],
        name=observation["name"],
        region=observation["region"],
        status=observation["status"],
        metadata_json=metadata,
    )
    db.add(resource)
    db.flush()

    return resource


def _metric_unit(metric_name):
    """Infer the unit for a metric from its name suffix."""
    if metric_name.endswith("percent") or metric_name.endswith("_percent"):
        return "percent"

    if metric_name.endswith("_gb"):
        return "gigabytes"

    if metric_name in {"resource_up", "container_up"}:
        return "boolean"

    if metric_name.endswith("_seconds"):
        return "seconds"

    return "count"

from backend.connectors.catalog import get_connector_catalog
from backend.models.alert import Alert
from backend.models.connector import ConnectorRegistration
from backend.models.metric import MetricSample
from backend.models.resource import Resource


def serialize_connector_registration(connector):
    """
    Convert a connector registration into an API-safe response.

    Output:
    - Workspace-scoped connector metadata
    - Masked config values instead of plaintext credentials
    """
    return {
        "id": connector.id,
        "tenant_id": connector.tenant_id,
        "organization_id": connector.organization_id,
        "connector_type": connector.connector_type,
        "name": connector.name,
        "status": connector.status,
        "config": _masked_config(connector.config_json or {}),
        "last_status": connector.last_status,
        "last_checked_at": connector.last_checked_at,
        "created_at": connector.created_at,
        "updated_at": connector.updated_at,
    }


def connector_health(db, tenant_id="internal"):
    """
    Build connector status for the active workspace.

    Inputs:
    - tenant_id/workspace ID

    Output:
    - Per connector type status, resource count, metric count, alert count and capabilities

    Assumption:
    - Status is derived from registered connectors and collected telemetry; no
      live infrastructure calls are made from this read path.
    """
    registrations = db.query(ConnectorRegistration).filter(
        ConnectorRegistration.tenant_id == tenant_id
    ).all()
    registered_types = {registration.connector_type for registration in registrations}
    resources = db.query(Resource).filter(Resource.tenant_id == tenant_id).all()
    metrics = db.query(MetricSample).filter(MetricSample.tenant_id == tenant_id).all()
    alerts = db.query(Alert).filter(Alert.tenant_id == tenant_id, Alert.status == "open").all()
    health = []

    for item in get_connector_catalog():
        connector_type = item["connector_type"]
        matching_resources = [
            resource
            for resource in resources
            if _resource_matches_connector(resource, connector_type)
        ]
        matching_metrics = [
            metric
            for metric in metrics
            if (metric.metadata_json or {}).get("connector_type") == connector_type
        ]
        matching_alerts = [
            alert
            for alert in alerts
            if (alert.metadata_json or {}).get("connector_type") == connector_type
        ]
        status = _connector_status(
            connector_type,
            registered_types=registered_types,
            matching_resources=matching_resources,
            matching_alerts=matching_alerts,
        )

        health.append(
            {
                "connector_type": connector_type,
                "label": item["label"],
                "status": status,
                "resources": len(matching_resources),
                "metrics": len(matching_metrics),
                "alerts": len(matching_alerts),
                "capabilities": [capability["key"] for capability in item["capabilities"]],
                "message": item["description"],
            }
        )

    return health


def _resource_matches_connector(resource, connector_type):
    metadata = resource.metadata_json or {}

    if connector_type in {"aws", "azure"}:
        return resource.provider == connector_type

    if connector_type == "docker":
        return resource.provider == "docker" or resource.resource_type == "container"

    if connector_type == "agent":
        return resource.provider == "onprem" or resource.resource_type in {"linux_host", "windows_host", "local_host"}

    if connector_type == "kubernetes":
        return resource.provider == "kubernetes" or resource.resource_type in {
            "kubernetes_cluster",
            "kubernetes_node",
            "kubernetes_pod",
            "deployment",
            "pod",
            "service",
        }

    if connector_type == "linux":
        return metadata.get("system") == "linux" or resource.resource_type == "linux_host"

    if connector_type == "windows":
        return metadata.get("system") == "windows" or resource.resource_type == "windows_host"

    if connector_type == "mssql":
        return resource.resource_type in {"mssql_database", "sqlserver_database"}

    if connector_type == "postgresql":
        return resource.resource_type in {"postgres_database", "postgresql_database"}

    return False


def _connector_status(connector_type, *, registered_types, matching_resources, matching_alerts):
    if matching_alerts:
        return "degraded"

    if matching_resources or connector_type in registered_types:
        return "connected"

    return "ready"


def _masked_config(config):
    masked = {}
    for key, value in config.items():
        if isinstance(value, dict) and "secret_ref" in value:
            masked[key] = {"masked": True}
        elif _is_sensitive_key(key):
            masked[key] = "masked"
        else:
            masked[key] = value
    return masked


def _is_sensitive_key(key):
    lowered = key.lower()
    return any(marker in lowered for marker in ["secret", "password", "token", "private_key", "access_key", "webhook"])

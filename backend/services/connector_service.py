from datetime import datetime

from backend.connectors.catalog import get_connector_catalog
from backend.models.alert import Alert
from backend.models.connector import (
    Connector,
    ConnectorCredential,
    ConnectorRegistration,
    ConnectorSync,
    DiscoveredResource,
)
from backend.models.metric import MetricSample
from backend.models.organization import Organization, Workspace
from backend.models.resource import Resource
from backend.services.organization_service import _encrypt_secret


MOCK_CONNECTOR_PROFILES = {
    "aws": {
        "label": "AWS",
        "connection_types": {"api"},
        "resources": [
            ("EC2", "prod-web-01", {"region": "eu-west-2", "instance_type": "t3.large", "private_ip": "10.20.1.14"}),
            ("EC2", "prod-worker-02", {"region": "eu-west-2", "instance_type": "m6i.large", "private_ip": "10.20.2.31"}),
            ("RDS", "orders-postgres", {"region": "eu-west-2", "engine": "postgres", "multi_az": True}),
            ("EKS", "platform-eks", {"region": "eu-west-2", "version": "1.29", "nodes": 6}),
        ],
    },
    "azure": {
        "label": "Azure",
        "connection_types": {"api"},
        "resources": [
            ("Virtual Machines", "az-api-01", {"location": "uksouth", "size": "Standard_D4s_v5"}),
            ("Virtual Machines", "az-batch-02", {"location": "uksouth", "size": "Standard_D2s_v5"}),
            ("Azure SQL", "billing-sql", {"location": "uksouth", "tier": "GeneralPurpose"}),
            ("AKS", "customer-aks", {"location": "uksouth", "node_count": 4}),
        ],
    },
    "agent": {
        "label": "Windows/Linux Agent",
        "connection_types": {"agent"},
        "resources": [
            ("Servers", "linux-app-01", {"os": "Ubuntu 22.04", "cpu": 8, "memory_gb": 32}),
            ("Servers", "win-iis-01", {"os": "Windows Server 2022", "cpu": 4, "memory_gb": 16}),
            ("Services", "nginx", {"host": "linux-app-01", "state": "running"}),
            ("Processes", "dotnet-api", {"host": "win-iis-01", "pid": 4288}),
        ],
    },
    "docker": {
        "label": "Docker",
        "connection_types": {"agent", "docker socket", "local agent"},
        "resources": [
            ("Containers", "frontend-web", {"image": "infrasight/web:latest", "state": "running", "restarts": 0}),
            ("Containers", "api-worker", {"image": "infrasight/api:latest", "state": "running", "restarts": 1}),
            ("Images", "postgres:16", {"size_mb": 432, "tags": ["16", "latest"]}),
            ("Images", "redis:7", {"size_mb": 116, "tags": ["7", "alpine"]}),
        ],
    },
    "kubernetes": {
        "label": "Kubernetes",
        "connection_types": {"helm"},
        "resources": [
            ("Nodes", "aks-nodepool1-000001", {"ready": True, "cpu": "4", "memory": "16Gi"}),
            ("Nodes", "aks-nodepool1-000002", {"ready": True, "cpu": "4", "memory": "16Gi"}),
            ("Pods", "checkout-api-7d96c8f9d9", {"namespace": "commerce", "ready": True, "restarts": 0}),
            ("Deployments", "checkout-api", {"namespace": "commerce", "replicas": 3, "available": 3}),
        ],
    },
}


TEST_OUTCOMES = {
    "success": ("connected", "healthy", "Connection test succeeded."),
    "invalid_credentials": ("failed", "critical", "Invalid credentials were supplied."),
    "invalid credentials": ("failed", "critical", "Invalid credentials were supplied."),
    "timeout": ("degraded", "warning", "Connection timed out while contacting the provider."),
    "permission_denied": ("failed", "critical", "Permission denied for the requested connector scope."),
    "permission denied": ("failed", "critical", "Permission denied for the requested connector scope."),
}


def create_connector(db, payload):
    """
    Create a workspace-scoped connector and store any supplied credentials as
    encrypted ConnectorCredential rows.

    Returns the connector response shape only; credential values and encrypted
    blobs stay server-side.
    """
    connector = Connector(
        workspace_id=payload.workspace_id,
        provider=payload.provider,
        connection_type=payload.connection_type,
        status=payload.status,
        health_json=payload.health,
        configuration_json=payload.configuration,
    )
    db.add(connector)
    db.flush()

    for credential in payload.credentials:
        create_connector_credential(
            db,
            connector_id=connector.id,
            credential_type=credential.type,
            value=credential.value,
        )

    db.commit()
    db.refresh(connector)
    return serialize_connector(connector)


def save_mock_connector(db, payload, workspace_id: int):
    """
    Upsert a mocked connector instance for a workspace.

    Credentials are encrypted into ConnectorCredential rows. The returned
    connector intentionally contains only non-secret metadata and masked config.
    """
    provider = normalize_mock_provider(payload.provider)
    connection_type = normalize_connection_type(payload.connection_type)
    _validate_mock_connector(provider, connection_type)

    connector = (
        db.query(Connector)
        .filter(
            Connector.workspace_id == workspace_id,
            Connector.provider == provider,
            Connector.connection_type == connection_type,
        )
        .first()
    )
    if not connector:
        connector = Connector(
            workspace_id=workspace_id,
            provider=provider,
            connection_type=connection_type,
            created_at=datetime.utcnow(),
        )
        db.add(connector)
        db.flush()

    connector.status = payload.status or "saved"
    connector.health_json = payload.health or {"state": "unknown", "message": "Connector saved. Test connection has not run yet."}
    connector.configuration_json = payload.configuration or {}
    connector.updated_at = datetime.utcnow()

    for credential in payload.credentials:
        create_connector_credential(
            db,
            connector_id=connector.id,
            credential_type=credential.type,
            value=credential.value,
        )

    db.commit()
    db.refresh(connector)
    return serialize_connector(connector)


def test_mock_connection(db, connector: Connector):
    outcome = _configured_test_outcome(connector.configuration_json or {})
    status, health_state, message = TEST_OUTCOMES[outcome]
    now = datetime.utcnow()

    connector.status = status
    connector.health_json = {
        "state": health_state,
        "message": message,
        "lastTestedAt": now.isoformat(),
        "mocked": True,
    }
    connector.updated_at = now
    db.commit()
    db.refresh(connector)

    return {
        "operation": "test_connection",
        "status": status,
        "outcome": outcome,
        "message": message,
        "connector": serialize_connector(connector),
        "resources": [],
        "sync": None,
    }


def run_mock_discovery(db, connector: Connector):
    resources = upsert_mock_discovered_resources(db, connector)
    now = datetime.utcnow()
    connector.status = "discovered"
    connector.health_json = {
        "state": "healthy",
        "message": f"Discovery completed with {len(resources)} resources.",
        "lastDiscoveredAt": now.isoformat(),
        "mocked": True,
    }
    connector.updated_at = now
    db.commit()
    db.refresh(connector)

    return {
        "operation": "run_discovery",
        "status": "completed",
        "outcome": "success",
        "message": f"Mock discovery completed for {connector.provider}.",
        "connector": serialize_connector(connector),
        "resources": [serialize_discovered_resource(resource) for resource in resources],
        "sync": None,
    }


def synchronize_mock_connector(db, connector: Connector):
    started_at = datetime.utcnow()
    sync = ConnectorSync(
        connector_id=connector.id,
        started_at=started_at,
        status="running",
        resources_discovered=0,
    )
    db.add(sync)
    db.flush()

    resources = upsert_mock_discovered_resources(db, connector)
    finished_at = datetime.utcnow()
    sync.finished_at = finished_at
    sync.status = "completed"
    sync.resources_discovered = len(resources)

    connector.status = "synchronized"
    connector.last_sync = finished_at
    connector.updated_at = finished_at
    connector.health_json = {
        "state": "healthy",
        "message": f"Synchronization completed with {len(resources)} resources.",
        "lastSyncAt": finished_at.isoformat(),
        "mocked": True,
    }
    db.commit()
    db.refresh(connector)
    db.refresh(sync)

    return {
        "operation": "synchronize",
        "status": "completed",
        "outcome": "success",
        "message": f"Mock synchronization completed for {connector.provider}.",
        "connector": serialize_connector(connector),
        "resources": [serialize_discovered_resource(resource) for resource in resources],
        "sync": serialize_connector_sync(sync),
    }


def connector_status(connector: Connector):
    return {
        "connector_id": connector.id,
        "workspace_id": connector.workspace_id,
        "provider": connector.provider,
        "connection_type": connector.connection_type,
        "status": connector.status,
        "health": connector.health_json or {},
        "last_sync": connector.last_sync,
        "resources_discovered": len(connector.discovered_resources or []),
        "last_operation": (connector.health_json or {}).get("last_operation"),
        "updated_at": connector.updated_at,
    }


def upsert_mock_discovered_resources(db, connector: Connector):
    provider = normalize_mock_provider(connector.provider)
    profile = MOCK_CONNECTOR_PROFILES[provider]
    now = datetime.utcnow()
    organization = connector.workspace.organization
    resources = []

    for index, (resource_type, name, metadata) in enumerate(profile["resources"], start=1):
        resource = (
            db.query(DiscoveredResource)
            .filter(
                DiscoveredResource.connector_id == connector.id,
                DiscoveredResource.provider == provider,
                DiscoveredResource.resource_type == resource_type,
                DiscoveredResource.name == name,
            )
            .first()
        )
        if not resource:
            resource = DiscoveredResource(
                connector_id=connector.id,
                provider=provider,
                resource_type=resource_type,
                name=name,
            )
            db.add(resource)

        resource.metadata_json = {
            **metadata,
            "mock_id": f"{provider}-{index:03d}",
            "source": "mock_connector_api",
        }
        resource.health_json = _mock_resource_health(resource_type, index)
        resource.status = "healthy" if index % 4 else "warning"
        resource.last_seen = now
        db.flush()
        if organization:
            _upsert_inventory_resource(
                db,
                connector=connector,
                discovered_resource=resource,
                tenant_id=organization.tenant_id,
                organization_id=organization.tenant_id,
                metadata=resource.metadata_json,
            )
        resources.append(resource)

    db.flush()
    return resources


def _upsert_inventory_resource(
    db,
    *,
    connector: Connector,
    discovered_resource: DiscoveredResource,
    tenant_id: str,
    organization_id: str,
    metadata: dict,
):
    resource_id = (
        f"connector:{connector.id}:{discovered_resource.provider}:"
        f"{discovered_resource.resource_type}:{discovered_resource.name}"
    ).lower().replace(" ", "_")
    resource = (
        db.query(Resource)
        .filter(Resource.resource_id == resource_id, Resource.tenant_id == tenant_id)
        .first()
    )
    if not resource:
        resource = Resource(
            tenant_id=tenant_id,
            organization_id=organization_id,
            resource_id=resource_id,
        )
        db.add(resource)

    resource.provider = _inventory_provider(discovered_resource.provider)
    resource.resource_type = _inventory_resource_type(discovered_resource.provider, discovered_resource.resource_type)
    resource.platform = _inventory_platform(discovered_resource.provider, discovered_resource.resource_type, metadata)
    resource.name = discovered_resource.name
    resource.region = metadata.get("region") or metadata.get("location") or metadata.get("namespace") or "local"
    resource.status = "running" if discovered_resource.status == "healthy" else "maintenance"
    resource.metadata_json = {
        **metadata,
        "connector_id": connector.id,
        "connector_provider": connector.provider,
        "connector_connection_type": connector.connection_type,
        "discovered_resource_id": discovered_resource.id,
        "health_state": (discovered_resource.health_json or {}).get("state"),
        "health_score": (discovered_resource.health_json or {}).get("score"),
        "last_seen": discovered_resource.last_seen.isoformat() if discovered_resource.last_seen else None,
    }
    return resource


def _inventory_provider(provider: str):
    if provider == "agent":
        return "on_prem"
    return provider


def _inventory_resource_type(provider: str, resource_type: str):
    normalized = resource_type.lower().replace(" ", "_")
    if provider == "aws" and normalized == "ec2":
        return "ec2_instance"
    if provider == "aws" and normalized == "rds":
        return "rds_database"
    if provider == "aws" and normalized == "eks":
        return "kubernetes_cluster"
    if provider == "azure" and normalized == "virtual_machines":
        return "virtual_machine"
    if provider == "azure" and normalized == "azure_sql":
        return "azure_sql_database"
    if provider == "azure" and normalized == "aks":
        return "kubernetes_cluster"
    if provider == "agent" and normalized == "servers":
        return "server"
    if provider == "agent" and normalized == "services":
        return "service"
    if provider == "agent" and normalized == "processes":
        return "process"
    if provider == "docker" and normalized == "containers":
        return "container"
    if provider == "docker" and normalized == "images":
        return "container_image"
    if provider == "kubernetes" and normalized == "nodes":
        return "kubernetes_node"
    if provider == "kubernetes" and normalized == "pods":
        return "kubernetes_pod"
    if provider == "kubernetes" and normalized == "deployments":
        return "deployment"
    return normalized


def _inventory_platform(provider: str, resource_type: str, metadata: dict):
    if provider == "docker":
        return "docker"
    if provider == "kubernetes" or resource_type.lower() in {"eks", "aks"}:
        return "kubernetes"
    if provider == "agent":
        os_name = str(metadata.get("os") or "").lower()
        if "windows" in os_name:
            return "windows"
        return "linux"
    if "postgres" in str(metadata.get("engine") or "").lower():
        return "postgresql"
    if "sql" in resource_type.lower():
        return "sql_server"
    return provider


def normalize_mock_provider(provider: str):
    normalized = (provider or "").strip().lower().replace("_", "-")
    aliases = {
        "amazon": "aws",
        "amazon-web-services": "aws",
        "windows": "agent",
        "linux": "agent",
        "windows-linux": "agent",
        "windows/linux": "agent",
        "windows-linux-agent": "agent",
        "local-agent": "agent",
        "k8s": "kubernetes",
    }
    return aliases.get(normalized, normalized)


def normalize_connection_type(connection_type: str):
    normalized = (connection_type or "").strip().lower().replace("_", " ")
    aliases = {
        "api": "api",
        "agent": "agent",
        "local agent": "agent",
        "helm": "helm",
        "docker": "docker socket",
        "docker-socket": "docker socket",
        "docker socket": "docker socket",
        "webhook": "webhook",
    }
    return aliases.get(normalized, normalized)


def _validate_mock_connector(provider: str, connection_type: str):
    profile = MOCK_CONNECTOR_PROFILES.get(provider)
    if not profile:
        raise ValueError("Unsupported connector provider")
    if connection_type not in profile["connection_types"]:
        raise ValueError("Unsupported connection type for provider")


def _configured_test_outcome(configuration: dict):
    requested = (
        configuration.get("mock_connection_result")
        or configuration.get("mock_test_result")
        or configuration.get("test_result")
        or configuration.get("simulate")
        or "success"
    )
    normalized = str(requested).strip().lower().replace("-", "_")
    if normalized in TEST_OUTCOMES:
        return normalized
    normalized = normalized.replace("_", " ")
    if normalized in TEST_OUTCOMES:
        return normalized
    return "success"


def _mock_resource_health(resource_type: str, index: int):
    if index % 4 == 0:
        return {
            "state": "warning",
            "score": 72,
            "message": f"{resource_type} is reachable with minor telemetry lag.",
        }
    return {
        "state": "healthy",
        "score": 96 - index,
        "message": f"{resource_type} is reporting normally.",
    }


def serialize_connector(connector: Connector):
    """
    Convert a workspace connector into an API-safe response.

    Connector credentials are stored in connector_credentials and are never
    returned from this serializer. Configuration is intended for non-secret
    connector settings; any accidental secret-like keys are masked defensively.
    """
    return {
        "id": connector.id,
        "workspace_id": connector.workspace_id,
        "provider": connector.provider,
        "connection_type": connector.connection_type,
        "status": connector.status,
        "health": connector.health_json or {},
        "configuration": _masked_config(connector.configuration_json or {}),
        "last_sync": connector.last_sync,
        "created_at": connector.created_at,
        "updated_at": connector.updated_at,
    }


def create_connector_credential(db, connector_id: int, credential_type: str, value: str):
    """
    Store a connector credential as an encrypted secret.

    Returns only credential metadata so encrypted_value cannot leak into API
    response bodies by accident.
    """
    credential = ConnectorCredential(
        connector_id=connector_id,
        type=credential_type,
        encrypted_value=_encrypt_secret(value),
    )
    db.add(credential)
    db.flush()
    return serialize_connector_credential_metadata(credential)


def serialize_connector_credential_metadata(credential: ConnectorCredential):
    return {
        "id": credential.id,
        "connector_id": credential.connector_id,
        "type": credential.type,
        "created_at": credential.created_at,
    }


def serialize_connector_sync(sync: ConnectorSync):
    return {
        "id": sync.id,
        "connector_id": sync.connector_id,
        "started_at": sync.started_at,
        "finished_at": sync.finished_at,
        "status": sync.status,
        "resources_discovered": sync.resources_discovered,
        "error_message": sync.error_message,
    }


def serialize_discovered_resource(resource: DiscoveredResource):
    return {
        "id": resource.id,
        "connector_id": resource.connector_id,
        "provider": resource.provider,
        "resource_type": resource.resource_type,
        "name": resource.name,
        "metadata": resource.metadata_json or {},
        "health": resource.health_json or {},
        "status": resource.status,
        "last_seen": resource.last_seen,
    }


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
    workspace_ids = [
        workspace_id
        for (workspace_id,) in (
            db.query(Workspace.id)
            .join(Organization, Workspace.organization_id == Organization.id)
            .filter(Organization.tenant_id == tenant_id)
            .all()
        )
    ]
    mock_connectors = []
    mock_resources = []
    if workspace_ids:
        mock_connectors = db.query(Connector).filter(Connector.workspace_id.in_(workspace_ids)).all()
        mock_connector_ids = [connector.id for connector in mock_connectors]
        if mock_connector_ids:
            mock_resources = (
                db.query(DiscoveredResource)
                .filter(DiscoveredResource.connector_id.in_(mock_connector_ids))
                .all()
            )
    registered_types.update(connector.provider for connector in mock_connectors)
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
        matching_discovered_resources = [
            resource
            for resource in mock_resources
            if _discovered_resource_matches_connector(resource, connector_type)
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
            matching_resources=[*matching_resources, *matching_discovered_resources],
            matching_alerts=matching_alerts,
        )

        health.append(
            {
                "connector_type": connector_type,
                "label": item["label"],
                "status": status,
                "resources": len(matching_resources) + len(matching_discovered_resources),
                "metrics": len(matching_metrics),
                "alerts": len(matching_alerts),
                "capabilities": [capability["key"] for capability in item["capabilities"]],
                "message": item["description"],
            }
        )

    return health


def _discovered_resource_matches_connector(resource, connector_type):
    provider = normalize_mock_provider(resource.provider)
    if connector_type == "agent":
        return provider == "agent"
    return provider == connector_type


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

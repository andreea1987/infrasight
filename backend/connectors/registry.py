from backend.connectors.agent import AgentConnector
from backend.connectors.cloud import AwsConnector, AzureConnector
from backend.connectors.databases import PostgreSqlConnector, SqlServerConnector
from backend.connectors.docker import DockerConnector
from backend.connectors.linux import LinuxConnector
from backend.connectors.kubernetes import KubernetesConnector
from backend.connectors.windows import WindowsConnector

CONNECTOR_CLASSES = {
    "linux": LinuxConnector,
    "windows": WindowsConnector,
    "agent": AgentConnector,
    "aws": AwsConnector,
    "azure": AzureConnector,
    "docker": DockerConnector,
    "kubernetes": KubernetesConnector,
    "mssql": SqlServerConnector,
    "postgresql": PostgreSqlConnector,
}


def build_connectors(db, tenant_id="internal"):
    from backend.models.connector import ConnectorRegistration

    registrations = db.query(ConnectorRegistration).filter(
        ConnectorRegistration.tenant_id == tenant_id,
        ConnectorRegistration.status == "enabled",
    ).all()
    registration_by_type = {registration.connector_type: registration for registration in registrations}

    return [
        connector_class(db, registration_by_type.get(connector_type), tenant_id=tenant_id)
        for connector_type, connector_class in CONNECTOR_CLASSES.items()
    ]

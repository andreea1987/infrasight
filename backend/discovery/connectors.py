import json
import shutil
import subprocess

from backend.discovery.aws.ec2_service import get_ec2_instances
from backend.discovery.azure.vm_service import AzureDiscoveryNotConfigured, get_azure_virtual_machines
from backend.discovery.common import DiscoveredAsset
from backend.discovery.onprem.local_service import discover_local_system


class BaseDiscoveryConnector:
    """
    Base class for read-only discovery connectors.

    Inputs:
    - optional connector config
    - tenant_id / organization_id workspace scope

    Outputs:
    - DiscoveredAsset records imported by discovery_service

    Assumption:
    - Discovery observes infrastructure and never changes external systems.
    """
    discovery_type = "base"

    def __init__(self, config=None, tenant_id="internal", organization_id="internal"):
        self.config = config or {}
        self.tenant_id = tenant_id
        self.organization_id = organization_id

    def discover(self):
        return []

    def tags(self):
        return {
            "tenant_id": self.tenant_id,
            "organization_id": self.organization_id,
            "discovery_type": self.discovery_type,
        }


class AwsDiscoveryConnector(BaseDiscoveryConnector):
    discovery_type = "aws"

    def discover(self):
        assets = []
        for instance in get_ec2_instances():
            tags = {
                **self.tags(),
                **instance.get("tags", {}),
            }
            assets.append(
                DiscoveredAsset(
                    provider="aws",
                    resource_id=instance["instance_id"],
                    resource_type="ec2",
                    name=instance["name"],
                    region=instance.get("region", "unknown"),
                    status=instance["state"],
                    tags=tags,
                    relationships=_relationships_from_tags(tags),
                    metadata={
                        **instance,
                        "discovery_method": "aws_api",
                    },
                )
            )
        return assets


class AzureDiscoveryConnector(BaseDiscoveryConnector):
    discovery_type = "azure"

    def discover(self):
        try:
            virtual_machines = get_azure_virtual_machines()
        except AzureDiscoveryNotConfigured:
            return []

        assets = []
        for vm in virtual_machines:
            tags = {
                **self.tags(),
                **vm.get("metadata", {}).get("tags", {}),
            }
            assets.append(
                DiscoveredAsset(
                    provider="azure",
                    resource_id=vm["resource_id"],
                    resource_type=vm["resource_type"],
                    name=vm["name"],
                    region=vm["region"],
                    status=vm["status"],
                    tags=tags,
                    relationships=_relationships_from_tags(tags),
                    metadata={
                        **vm["metadata"],
                        "discovery_method": "azure_api",
                    },
                )
            )
        return assets


class SshLinuxDiscoveryConnector(BaseDiscoveryConnector):
    discovery_type = "linux_ssh"

    def discover(self):
        hosts = self.config.get("hosts", [])
        if not hosts:
            local = discover_local_system()
            return [
                DiscoveredAsset(
                    provider="onprem",
                    resource_id=local["resource_id"],
                    resource_type="linux_host",
                    name=local["name"],
                    region=local["region"],
                    status=local["status"],
                    tags={**self.tags(), "agent_ready": "true"},
                    relationships=[],
                    metadata={
                        **local["metadata"],
                        "discovery_method": "local_linux_probe",
                        "agent_ready": True,
                    },
                )
            ]

        return [
            DiscoveredAsset(
                provider="onprem",
                resource_id=f"ssh:{host.get('hostname') or host.get('host')}",
                resource_type="linux_host",
                name=host.get("name") or host.get("hostname") or host.get("host"),
                region=host.get("region", "onprem"),
                status="pending_agent" if host.get("agent_pending") else "discovered",
                tags={**self.tags(), **host.get("tags", {})},
                relationships=_relationships_from_tags(host.get("tags", {})),
                metadata={
                    "host": host.get("host"),
                    "hostname": host.get("hostname"),
                    "port": host.get("port", 22),
                    "discovery_method": "ssh",
                    "credential_ref": host.get("credential_ref"),
                    "agent_ready": True,
                },
            )
            for host in hosts
        ]


class WinRmWindowsDiscoveryConnector(BaseDiscoveryConnector):
    discovery_type = "windows_winrm"

    def discover(self):
        hosts = self.config.get("hosts", [])
        return [
            DiscoveredAsset(
                provider="onprem",
                resource_id=f"winrm:{host.get('hostname') or host.get('host')}",
                resource_type="windows_host",
                name=host.get("name") or host.get("hostname") or host.get("host"),
                region=host.get("region", "onprem"),
                status="discovered",
                tags={**self.tags(), **host.get("tags", {})},
                relationships=_relationships_from_tags(host.get("tags", {})),
                metadata={
                    "host": host.get("host"),
                    "hostname": host.get("hostname"),
                    "port": host.get("port", 5986),
                    "discovery_method": "winrm_powershell",
                    "credential_ref": host.get("credential_ref"),
                    "agent_ready": True,
                },
            )
            for host in hosts
        ]


class DockerDiscoveryConnector(BaseDiscoveryConnector):
    discovery_type = "docker"

    def discover(self):
        if not shutil.which("docker"):
            return []

        completed = subprocess.run(
            ["docker", "ps", "-a", "--format", "{{json .}}"],
            capture_output=True,
            check=False,
            text=True,
            timeout=10,
        )
        if completed.returncode != 0:
            return []

        assets = []
        for line in completed.stdout.splitlines():
            if not line.strip():
                continue
            container = json.loads(line)
            state = container.get("State", "unknown").lower()
            name = container.get("Names") or container.get("ID")
            tags = {
                **self.tags(),
                "container_image": container.get("Image", ""),
            }
            assets.append(
                DiscoveredAsset(
                    provider="docker",
                    resource_id=f"docker:{container.get('ID')}",
                    resource_type="container",
                    name=name,
                    region="local",
                    status="running" if state == "running" else state,
                    tags=tags,
                    relationships=[],
                    metadata={
                        **container,
                        "discovery_method": "docker_api",
                    },
                )
            )
        return assets


class SqlServerDiscoveryConnector(BaseDiscoveryConnector):
    discovery_type = "mssql"

    def discover(self):
        return [
            DiscoveredAsset(
                provider="mssql",
                resource_id=database.get("resource_id") or f"mssql:{database['name']}",
                resource_type="mssql_database",
                name=database["name"],
                region=database.get("region", "database"),
                status=database.get("status", "discovered"),
                tags={**self.tags(), **database.get("tags", {})},
                relationships=_relationships_from_tags(database.get("tags", {})),
                metadata={
                    **database,
                    "discovery_method": "sql_server_metadata",
                    "credential_ref": database.get("credential_ref"),
                },
            )
            for database in self.config.get("databases", [])
        ]


class PostgreSqlDiscoveryConnector(BaseDiscoveryConnector):
    discovery_type = "postgresql"

    def discover(self):
        return [
            DiscoveredAsset(
                provider="postgresql",
                resource_id=database.get("resource_id") or f"postgresql:{database['name']}",
                resource_type="postgresql_database",
                name=database["name"],
                region=database.get("region", "database"),
                status=database.get("status", "discovered"),
                tags={**self.tags(), **database.get("tags", {})},
                relationships=_relationships_from_tags(database.get("tags", {})),
                metadata={
                    **database,
                    "discovery_method": "postgresql_metadata",
                    "credential_ref": database.get("credential_ref"),
                },
            )
            for database in self.config.get("databases", [])
        ]


class KubernetesDiscoveryConnector(BaseDiscoveryConnector):
    discovery_type = "kubernetes"

    def discover(self):
        return []


DISCOVERY_CONNECTORS = {
    "aws": AwsDiscoveryConnector,
    "azure": AzureDiscoveryConnector,
    "linux_ssh": SshLinuxDiscoveryConnector,
    "windows_winrm": WinRmWindowsDiscoveryConnector,
    "docker": DockerDiscoveryConnector,
    "mssql": SqlServerDiscoveryConnector,
    "postgresql": PostgreSqlDiscoveryConnector,
    "kubernetes": KubernetesDiscoveryConnector,
}


def supported_discovery_types():
    return list(DISCOVERY_CONNECTORS.keys())


def build_discovery_connector(discovery_type, config=None, tenant_id="internal", organization_id="internal"):
    """
    Instantiate the discovery connector for a requested discovery type.
    The caller supplies workspace scope so imported assets cannot cross tenants.
    """
    connector_class = DISCOVERY_CONNECTORS[discovery_type]
    return connector_class(config=config, tenant_id=tenant_id, organization_id=organization_id)


def _relationships_from_tags(tags):
    relationships = []
    for key in ["app", "application", "service", "environment", "vpc", "subnet", "resource_group"]:
        if tags.get(key):
            relationships.append(
                {
                    "relationship_type": f"tag:{key}",
                    "target_ref": str(tags[key]),
                    "metadata": {"tag_key": key, "tag_value": tags[key]},
                }
            )
    return relationships

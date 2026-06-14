from backend.connectors.base import BaseConnector


class AgentConnector(BaseConnector):
    """
    Read-only logical connector for Windows/Linux agent telemetry.

    Inputs:
    - Existing on-prem host resources in the workspace

    Outputs:
    - CPU, memory, disk, uptime/service/log capability observations

    Assumption:
    - The real agent uses outbound HTTPS only; this class models collected host
      telemetry already stored in InfraSight.
    """
    connector_type = "agent"
    label = "Windows/Linux Agent"

    def collect(self):
        resources = self.resources_by_type("linux_host", "windows_host", "local_host")
        return [
            self.observation(
                provider=resource.provider,
                resource_id=resource.resource_id,
                resource_type=resource.resource_type,
                name=resource.name,
                region=resource.region,
                status=resource.status,
                metrics={
                    "resource_up": 1 if resource.status in {"running", "healthy", "available"} else 0,
                    "cpu_percent": (resource.metadata_json or {}).get("cpu_percent"),
                    "memory_percent": (resource.metadata_json or {}).get("memory_percent"),
                    "disk_used_percent": (resource.metadata_json or {}).get("disk_used_percent"),
                },
                alerts=[],
                metadata={
                    **(resource.metadata_json or {}),
                    "monitoring": ["cpu", "memory", "disk", "services", "uptime", "docker_status", "local_logs"],
                    "transport": "outbound_https",
                    "inbound_required": False,
                },
            )
            for resource in resources
        ]

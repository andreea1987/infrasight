from backend.connectors.base import BaseConnector


class WindowsConnector(BaseConnector):
    connector_type = "windows"
    label = "Windows Servers"

    def collect(self):
        observations = []
        for resource in self.resources_by_type("windows_host"):
            metadata = resource.metadata_json or {}
            alerts = []
            failed_logins = metadata.get("failed_logins", 0)
            stopped_services = metadata.get("stopped_services", 0)

            if failed_logins:
                alerts.append(
                    {
                        "source": "failed_logins",
                        "metric_name": "failed_logins",
                        "severity": "warning",
                        "title": f"{resource.name} has failed Windows logins",
                        "description": "Windows security events show failed login activity.",
                        "metric_value": failed_logins,
                        "threshold": 0,
                    }
                )

            if stopped_services:
                alerts.append(
                    {
                        "source": "service_health",
                        "metric_name": "stopped_services",
                        "severity": "critical",
                        "title": f"{resource.name} has stopped services",
                        "description": "One or more monitored Windows services are stopped.",
                        "metric_value": stopped_services,
                        "threshold": 0,
                    }
                )

            observations.append(
                self.observation(
                    provider="onprem",
                    resource_id=resource.resource_id,
                    resource_type=resource.resource_type,
                    name=resource.name,
                    region=resource.region,
                    status=resource.status,
                    metrics={
                        "cpu_percent": metadata.get("cpu_percent"),
                        "memory_used_percent": metadata.get("memory_used_percent"),
                        "disk_used_percent": metadata.get("disk_used_percent"),
                        "failed_logins": failed_logins,
                        "stopped_services": stopped_services,
                    },
                    alerts=alerts,
                    metadata={**metadata, "monitoring": ["cpu", "memory", "disk", "services", "logs", "failed_logins"]},
                )
            )

        return observations

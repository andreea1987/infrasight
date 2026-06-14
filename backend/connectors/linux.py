from backend.connectors.base import BaseConnector
from backend.discovery.onprem.local_service import discover_local_system


class LinuxConnector(BaseConnector):
    connector_type = "linux"
    label = "Linux Servers"

    def collect(self):
        local = discover_local_system()
        metadata = local["metadata"]
        alerts = []

        disk_used = metadata.get("disk_used_percent")
        if disk_used and disk_used >= 80:
            alerts.append(
                {
                    "source": "disk_capacity",
                    "metric_name": "disk_used_percent",
                    "severity": "critical" if disk_used >= 90 else "warning",
                    "title": f"{local['name']} disk usage is high",
                    "description": "Linux disk utilization crossed the configured threshold.",
                    "metric_value": disk_used,
                    "threshold": 90 if disk_used >= 90 else 80,
                }
            )

        failed_logins = metadata.get("failed_logins", 0)
        if failed_logins:
            alerts.append(
                {
                    "source": "failed_logins",
                    "metric_name": "failed_logins",
                    "severity": "warning",
                    "title": f"{local['name']} has failed login activity",
                    "description": "Failed login count is above zero.",
                    "metric_value": failed_logins,
                    "threshold": 0,
                }
            )

        return [
            self.observation(
                provider="onprem",
                resource_id=local["resource_id"],
                resource_type="linux_host",
                name=local["name"],
                region=local["region"],
                status=local["status"],
                metrics={
                    "cpu_count": metadata.get("cpu_count"),
                    "memory_total_gb": metadata.get("memory_gb"),
                    "disk_used_percent": disk_used,
                    "failed_logins": failed_logins,
                },
                alerts=alerts,
                metadata={
                    **metadata,
                    "monitoring": ["cpu", "memory", "disk", "services", "logs", "failed_logins"],
                },
            )
        ]

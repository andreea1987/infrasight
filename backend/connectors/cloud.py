from backend.connectors.base import BaseConnector


class AwsConnector(BaseConnector):
    """
    Read-only AWS connector facade.

    Collects workspace AWS resources that were synchronized through read-only
    AWS APIs and emits EC2/RDS/CloudWatch/CloudTrail-ready observations.
    """
    connector_type = "aws"
    label = "AWS Infrastructure"

    def collect(self):
        return [_cloud_observation(self, resource) for resource in self.resources_by_provider("aws")]


class AzureConnector(BaseConnector):
    """
    Read-only Azure connector facade.

    Collects workspace Azure resources that were synchronized through Reader
    permissions and emits Azure Monitor / Log Analytics ready observations.
    """
    connector_type = "azure"
    label = "Azure Infrastructure"

    def collect(self):
        return [_cloud_observation(self, resource) for resource in self.resources_by_provider("azure")]


def _cloud_observation(connector, resource):
    metadata = resource.metadata_json or {}
    cloud_alerts = metadata.get("cloud_alerts", [])
    alerts = []

    for index, alert in enumerate(cloud_alerts):
        alerts.append(
            {
                "source": "cloud_alert",
                "metric_name": alert.get("metric_name", "cloud_alert"),
                "severity": alert.get("severity", "warning"),
                "title": alert.get("title", f"{resource.name} cloud alert"),
                "description": alert.get("description", "Cloud provider alert synchronized into InfraSight."),
                "metric_value": alert.get("metric_value", 1),
                "threshold": alert.get("threshold", 0),
                "dedupe": f"cloud-alert-{index}",
            }
        )

    return connector.observation(
        provider=resource.provider,
        resource_id=resource.resource_id,
        resource_type=resource.resource_type,
        name=resource.name,
        region=resource.region,
        status=resource.status,
        metrics={
            "resource_up": 1 if resource.status in {"running", "healthy", "available"} else 0,
            "cpu_percent": metadata.get("cpu_percent"),
            "disk_used_percent": metadata.get("disk_used_percent"),
        },
        alerts=alerts,
        metadata={**metadata, "monitoring": ["inventory", "cloud_alerts", "cpu", "disk"]},
    )

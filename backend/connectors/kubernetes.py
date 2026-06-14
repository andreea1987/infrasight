from backend.connectors.base import BaseConnector


class KubernetesConnector(BaseConnector):
    """
    Read-only logical connector for Kubernetes telemetry.

    Inputs:
    - Kubernetes resources already discovered for the active workspace

    Outputs:
    - Cluster/workload observations for unified monitoring and topology

    Assumption:
    - A Helm chart will eventually send telemetry to Infrasight; this connector
      keeps the backend model ready without changing cluster state.
    """
    connector_type = "kubernetes"
    label = "Kubernetes Cluster"

    def collect(self):
        resources = self.resources_by_provider("kubernetes")
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
                    "restart_count": (resource.metadata_json or {}).get("restart_count"),
                },
                alerts=[],
                metadata={
                    **(resource.metadata_json or {}),
                    "monitoring": ["clusters", "nodes", "pods", "deployments", "services", "events", "logs"],
                    "deployment": "helm_chart",
                },
            )
            for resource in resources
        ]

import json
import shutil
import subprocess

from backend.connectors.base import BaseConnector


class DockerConnector(BaseConnector):
    connector_type = "docker"
    label = "Docker Environments"

    def collect(self):
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

        observations = []
        for line in completed.stdout.splitlines():
            if not line.strip():
                continue

            container = json.loads(line)
            state = container.get("State", "unknown").lower()
            name = container.get("Names") or container.get("ID")
            alerts = []
            if state not in {"running", "healthy"}:
                alerts.append(
                    {
                        "source": "container_health",
                        "metric_name": "container_up",
                        "severity": "warning",
                        "title": f"{name} container is {state}",
                        "description": "Docker container is not in a healthy running state.",
                        "metric_value": 0,
                        "threshold": 1,
                    }
                )

            observations.append(
                self.observation(
                    provider="docker",
                    resource_id=f"docker:{container.get('ID')}",
                    resource_type="container",
                    name=name,
                    region="local",
                    status="running" if state == "running" else state,
                    metrics={"container_up": 1 if state == "running" else 0},
                    alerts=alerts,
                    metadata={**container, "monitoring": ["container_health", "logs"]},
                )
            )

        return observations

from dataclasses import dataclass, field


@dataclass
class DiscoveredAsset:
    provider: str
    resource_id: str
    resource_type: str
    name: str
    region: str = "global"
    status: str = "unknown"
    tags: dict = field(default_factory=dict)
    relationships: list[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    def to_resource_payload(self):
        return {
            "provider": self.provider,
            "resource_id": self.resource_id,
            "resource_type": self.resource_type,
            "name": self.name,
            "region": self.region,
            "status": self.status,
            "metadata": {
                **self.metadata,
                "tags": self.tags,
                "relationships": self.relationships,
            },
        }

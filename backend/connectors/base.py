class ConnectorObservation(dict):
    pass


class BaseConnector:
    """
    Base class for read-only telemetry connectors.

    Inputs:
    - db: workspace-scoped database session
    - registration: optional connector registration and sanitized config
    - tenant_id: active workspace ID

    Outputs:
    - ConnectorObservation dictionaries consumed by unified_monitoring_service

    Assumption:
    - Connectors collect telemetry only and never mutate customer infrastructure.
    """
    connector_type = "base"
    label = "Base"

    def __init__(self, db, registration=None, tenant_id="internal"):
        self.db = db
        self.registration = registration
        self.tenant_id = tenant_id

    def collect(self):
        return []

    def resources_by_provider(self, provider):
        from backend.models.resource import Resource

        return self.db.query(Resource).filter(
            Resource.provider == provider,
            Resource.tenant_id == self.tenant_id,
        ).all()

    def resources_by_type(self, *resource_types):
        from backend.models.resource import Resource

        return self.db.query(Resource).filter(
            Resource.resource_type.in_(resource_types),
            Resource.tenant_id == self.tenant_id,
        ).all()

    def observation(self, **payload):
        """
        Normalizes connector-specific telemetry into the shared observation shape.
        The unified monitoring service converts observations into resources,
        metrics and alerts for the active workspace.
        """
        return ConnectorObservation(
            {
                "connector_type": self.connector_type,
                "tenant_id": self.tenant_id,
                "region": payload.pop("region", "global"),
                "status": payload.pop("status", "healthy"),
                "metrics": payload.pop("metrics", {}),
                "alerts": payload.pop("alerts", []),
                "metadata": payload.pop("metadata", {}),
                **payload,
            }
        )

from backend.connectors.base import BaseConnector


class SqlServerConnector(BaseConnector):
    connector_type = "mssql"
    label = "Microsoft SQL Server"

    def collect(self):
        observations = []
        for resource in self.resources_by_type("mssql_database", "sqlserver_database"):
            metadata = resource.metadata_json or {}
            observations.append(
                self.observation(
                    provider="mssql",
                    resource_id=resource.resource_id,
                    resource_type=resource.resource_type,
                    name=resource.name,
                    region=resource.region,
                    status=resource.status,
                    metrics={
                        "blocking_queries": metadata.get("blocking_queries", 0),
                        "deadlocks": metadata.get("deadlocks", 0),
                        "failed_stored_procedures": metadata.get("failed_stored_procedures", 0),
                        "failed_sql_jobs": metadata.get("failed_sql_jobs", 0),
                        "long_running_queries": metadata.get("long_running_queries", 0),
                    },
                    alerts=_database_alerts(resource, metadata, "mssql"),
                    metadata={
                        **metadata,
                        "monitoring": [
                            "blocking_queries",
                            "deadlocks",
                            "failed_stored_procedures",
                            "failed_sql_jobs",
                            "long_running_queries",
                        ],
                    },
                )
            )

        return observations


class PostgreSqlConnector(BaseConnector):
    connector_type = "postgresql"
    label = "PostgreSQL"

    def collect(self):
        observations = []
        for resource in self.resources_by_type("postgres_database", "postgresql_database"):
            metadata = resource.metadata_json or {}
            observations.append(
                self.observation(
                    provider="postgresql",
                    resource_id=resource.resource_id,
                    resource_type=resource.resource_type,
                    name=resource.name,
                    region=resource.region,
                    status=resource.status,
                    metrics={
                        "locks": metadata.get("locks", 0),
                        "deadlocks": metadata.get("deadlocks", 0),
                        "slow_queries": metadata.get("slow_queries", 0),
                        "replication_lag_seconds": metadata.get("replication_lag_seconds", 0),
                        "connection_saturation_percent": metadata.get("connection_saturation_percent", 0),
                    },
                    alerts=_database_alerts(resource, metadata, "postgresql"),
                    metadata={
                        **metadata,
                        "monitoring": [
                            "locks",
                            "deadlocks",
                            "slow_queries",
                            "replication_lag",
                            "connection_saturation",
                        ],
                    },
                )
            )

        return observations


def _database_alerts(resource, metadata, engine):
    alerts = []
    checks = {
        "blocking_queries": ("blocking queries", 0),
        "locks": ("lock pressure", 10),
        "deadlocks": ("deadlocks", 0),
        "failed_stored_procedures": ("failed stored procedures", 0),
        "failed_sql_jobs": ("failed SQL jobs", 0),
        "long_running_queries": ("long-running queries", 0),
        "slow_queries": ("slow queries", 0),
        "replication_lag_seconds": ("replication lag", 60),
        "connection_saturation_percent": ("connection saturation", 80),
    }

    for metric_name, (label, threshold) in checks.items():
        value = metadata.get(metric_name, 0)
        if value and value > threshold:
            alerts.append(
                {
                    "source": "database_performance",
                    "metric_name": metric_name,
                    "severity": "critical" if metric_name in {"deadlocks", "failed_sql_jobs"} else "warning",
                    "title": f"{resource.name} has {label}",
                    "description": f"{engine} database performance monitor detected {label}.",
                    "metric_value": value,
                    "threshold": threshold,
                }
            )

    return alerts

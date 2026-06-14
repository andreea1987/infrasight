def assign_monitoring_profile(asset):
    resource_type = asset.resource_type
    provider = asset.provider
    metadata = asset.metadata or {}

    if resource_type in {"linux_host", "local_host"} or metadata.get("system") == "linux":
        return "linux-server-standard"

    if resource_type == "windows_host" or metadata.get("system") == "windows":
        return "windows-server-standard"

    if provider == "aws":
        return "aws-infrastructure-standard"

    if provider == "azure":
        return "azure-infrastructure-standard"

    if resource_type == "container" or provider == "docker":
        return "docker-container-standard"

    if resource_type in {"mssql_database", "sqlserver_database"}:
        return "mssql-performance-standard"

    if resource_type in {"postgres_database", "postgresql_database"}:
        return "postgresql-performance-standard"

    if provider == "kubernetes":
        return "kubernetes-workload-standard"

    return "generic-infrastructure-standard"

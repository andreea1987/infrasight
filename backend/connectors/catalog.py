CONNECTOR_CATALOG = [
    {
        "connector_type": "linux",
        "label": "Linux Servers",
        "platform": "server",
        "description": "Monitor Linux CPU, memory, disk, services, logs, and failed logins.",
        "capabilities": [
            {"key": "cpu", "label": "CPU"},
            {"key": "memory", "label": "Memory"},
            {"key": "disk", "label": "Disk"},
            {"key": "services", "label": "Services"},
            {"key": "logs", "label": "Logs"},
            {"key": "failed_logins", "label": "Failed logins"},
        ],
    },
    {
        "connector_type": "agent",
        "label": "Windows/Linux Agent",
        "platform": "agent",
        "description": "Outbound HTTPS agent for Windows, Linux, and on-prem servers. No inbound access required.",
        "capabilities": [
            {"key": "cpu", "label": "CPU"},
            {"key": "memory", "label": "Memory"},
            {"key": "disk", "label": "Disk"},
            {"key": "services", "label": "Services"},
            {"key": "uptime", "label": "Uptime"},
            {"key": "docker_status", "label": "Docker status"},
            {"key": "local_logs", "label": "Local logs"},
        ],
    },
    {
        "connector_type": "windows",
        "label": "Windows Servers",
        "platform": "server",
        "description": "Monitor Windows CPU, memory, disk, services, event logs, and failed logins.",
        "capabilities": [
            {"key": "cpu", "label": "CPU"},
            {"key": "memory", "label": "Memory"},
            {"key": "disk", "label": "Disk"},
            {"key": "services", "label": "Services"},
            {"key": "logs", "label": "Event logs"},
            {"key": "failed_logins", "label": "Failed logins"},
        ],
    },
    {
        "connector_type": "aws",
        "label": "AWS Infrastructure",
        "platform": "cloud",
        "description": "Use synchronized AWS inventory and cloud alert context.",
        "capabilities": [
            {"key": "ec2", "label": "EC2"},
            {"key": "rds", "label": "RDS"},
            {"key": "cloudwatch_metrics", "label": "CloudWatch metrics"},
            {"key": "cloudwatch_logs", "label": "CloudWatch logs"},
            {"key": "cloudtrail_events", "label": "CloudTrail events"},
        ],
    },
    {
        "connector_type": "azure",
        "label": "Azure Infrastructure",
        "platform": "cloud",
        "description": "Use synchronized Azure inventory and cloud alert context.",
        "capabilities": [
            {"key": "virtual_machines", "label": "Azure VMs"},
            {"key": "azure_monitor_metrics", "label": "Azure Monitor metrics"},
            {"key": "log_analytics_logs", "label": "Log Analytics logs"},
            {"key": "activity_logs", "label": "Activity Logs"},
        ],
    },
    {
        "connector_type": "docker",
        "label": "Docker Environments",
        "platform": "containers",
        "description": "Monitor Docker container state and health.",
        "capabilities": [
            {"key": "container_health", "label": "Container health"},
            {"key": "logs", "label": "Container logs"},
        ],
    },
    {
        "connector_type": "kubernetes",
        "label": "Kubernetes Cluster",
        "platform": "kubernetes",
        "description": "Helm chart deployment that sends cluster inventory, events, metrics, and logs to InfraSight.",
        "capabilities": [
            {"key": "clusters", "label": "Clusters"},
            {"key": "nodes", "label": "Nodes"},
            {"key": "pods", "label": "Pods"},
            {"key": "deployments", "label": "Deployments"},
            {"key": "services", "label": "Services"},
            {"key": "events", "label": "Events"},
            {"key": "logs", "label": "Logs"},
        ],
    },
    {
        "connector_type": "mssql",
        "label": "Microsoft SQL Server",
        "platform": "database",
        "description": "Monitor SQL Server blocking, deadlocks, failed procedures/jobs, and long-running queries.",
        "capabilities": [
            {"key": "blocking_queries", "label": "Blocking queries"},
            {"key": "deadlocks", "label": "Deadlocks"},
            {"key": "failed_stored_procedures", "label": "Failed stored procedures"},
            {"key": "failed_sql_jobs", "label": "Failed SQL jobs"},
            {"key": "long_running_queries", "label": "Long-running queries"},
        ],
    },
    {
        "connector_type": "postgresql",
        "label": "PostgreSQL",
        "platform": "database",
        "description": "Monitor PostgreSQL locks, deadlocks, slow queries, replication lag, and connection saturation.",
        "capabilities": [
            {"key": "locks", "label": "Locks"},
            {"key": "deadlocks", "label": "Deadlocks"},
            {"key": "slow_queries", "label": "Slow queries"},
            {"key": "replication_lag", "label": "Replication lag"},
            {"key": "connection_saturation", "label": "Connection saturation"},
        ],
    },
]


def get_connector_catalog():
    return CONNECTOR_CATALOG


def get_connector_catalog_item(connector_type):
    return next(
        (item for item in CONNECTOR_CATALOG if item["connector_type"] == connector_type),
        None,
    )

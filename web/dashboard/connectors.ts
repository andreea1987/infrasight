export const CONNECTOR_SECTION_ORDER = [
  "overview",
  "actions",
  "connection",
  "authentication",
  "discovery",
  "synchronization",
  "resources",
  "health",
  "logs",
] as const;

export type ConnectorSectionId = (typeof CONNECTOR_SECTION_ORDER)[number];

export type ConnectorField = {
  label: string;
  value: string;
  masked?: boolean;
};

export type ConnectorSectionConfig = {
  description?: string;
  fields?: ConnectorField[];
  items?: string[];
  steps?: string[];
};

export type ConnectorCategory =
  | "Cloud"
  | "Infrastructure"
  | "Containers"
  | "Monitoring"
  | "Notifications"
  | "Identity";

export type ConnectorConfigField = {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "multiselect" | "url" | "token";
  required?: boolean;
  sensitive?: boolean;
  options?: string[];
  placeholder?: string;
};

export type ConnectorHealthCheck = {
  id: string;
  label: string;
  description: string;
};

export type ConnectorAction = {
  id: string;
  label: string;
  description: string;
  scope: "common" | "connector";
};

export type ConnectorConnectionType =
  | "API"
  | "Agent"
  | "Helm"
  | "Docker Socket"
  | "Webhook";

export type ConnectorConnectionOption = {
  id: string;
  label: string;
  type: ConnectorConnectionType;
  description: string;
  recommended?: boolean;
  authenticationMethods?: string[];
  workflow?: string[];
  configurationFields?: string[];
};

export type ConnectorRegistryItem = {
  id: string;
  displayName: string;
  icon: string;
  category: ConnectorCategory;
  connectionType: ConnectorConnectionType;
  connectionOptions: ConnectorConnectionOption[];
  authenticationType: string;
  description: string;
  connectorTypes: string[];
  supportedResourceTypes: string[];
  supportedDiscoveryMethods: string[];
  supportedMetrics: string[];
  supportedLogs: string[];
  configurationSchema: ConnectorConfigField[];
  healthChecks: ConnectorHealthCheck[];
  actions: ConnectorAction[];
  statusModel: string;
  sections: Partial<Record<ConnectorSectionId, ConnectorSectionConfig>>;
};

export const SUPPORTED_CONNECTOR_CONNECTION_TYPES: ConnectorConnectionType[] = [
  "API",
  "Agent",
  "Helm",
  "Docker Socket",
  "Webhook",
];

export const COMMON_CONNECTOR_ACTIONS: ConnectorAction[] = [
  {
    id: "test_connection",
    label: "Test Connection",
    description: "Validate the connector credentials and read-only reachability.",
    scope: "common",
  },
  {
    id: "sync_now",
    label: "Sync Now",
    description: "Queue an on-demand inventory and telemetry synchronization.",
    scope: "common",
  },
  {
    id: "view_logs",
    label: "View Logs",
    description: "Open connector audit, sync, and collection log context.",
    scope: "common",
  },
  {
    id: "view_resources",
    label: "View Resources",
    description: "Open resources currently associated with this connector.",
    scope: "common",
  },
];

export const CONNECTOR_REGISTRY: ConnectorRegistryItem[] = [
  {
    id: "aws",
    displayName: "AWS",
    icon: "aws",
    category: "Cloud",
    connectionType: "API",
    connectionOptions: [
      {
        id: "aws-api",
        label: "AWS API",
        type: "API",
        description: "Connect to AWS APIs with read-only permissions for inventory, metrics, logs, and events.",
        recommended: true,
        authenticationMethods: ["IAM Role", "Access Keys"],
        configurationFields: ["auth_mode", "role_arn", "external_id", "access_key_id", "secret_access_key", "regions"],
      },
    ],
    authenticationType: "IAM Role / Access Keys",
    description: "Read-only cloud connector for AWS inventory, metrics, logs, and events.",
    connectorTypes: ["aws"],
    supportedResourceTypes: ["EC2", "RDS", "EKS", "VPC", "CloudWatch Log Groups"],
    supportedDiscoveryMethods: ["AWS API polling", "Regional inventory sync", "CloudWatch metric collection", "CloudTrail event import"],
    supportedMetrics: ["CPUUtilization", "NetworkIn", "NetworkOut", "DiskReadOps", "DatabaseConnections", "EKS node readiness"],
    supportedLogs: ["CloudWatch Logs", "CloudTrail Events", "Connector Sync Audit"],
    configurationSchema: [
      { key: "auth_mode", label: "Authentication Mode", type: "select", required: true, options: ["iam_role", "access_keys"] },
      { key: "role_arn", label: "IAM Role ARN", type: "text", required: true, sensitive: true, placeholder: "arn:aws:iam::*:role/InfraSightReadOnly" },
      { key: "external_id", label: "External ID", type: "token", required: true, sensitive: true },
      { key: "access_key_id", label: "Access Key ID", type: "text", sensitive: true },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", sensitive: true },
      { key: "regions", label: "Regions", type: "multiselect", required: true },
    ],
    healthChecks: [
      { id: "aws-auth", label: "Credential validation", description: "Confirms STS identity or access key authentication succeeds." },
      { id: "aws-region-sync", label: "Regional sync freshness", description: "Checks that configured regions completed a recent inventory sync." },
      { id: "aws-cloudwatch", label: "CloudWatch availability", description: "Verifies metric and log APIs are reachable." },
    ],
    actions: [
      ...COMMON_CONNECTOR_ACTIONS,
      { id: "run_discovery", label: "Run Discovery", description: "Start AWS inventory discovery across configured regions.", scope: "connector" },
      { id: "validate_iam_permissions", label: "Validate IAM Permissions", description: "Check the expected read-only AWS IAM policy coverage.", scope: "connector" },
    ],
    statusModel: "IAM role or access key credentials with read-only collection.",
    sections: {
      overview: {
        description: "AWS resources are normalized into InfraSight inventory, topology, metrics, logs, and OpenClaw context.",
        items: ["Credential-safe read-only collection", "Workspace-scoped resources", "CloudWatch and CloudTrail context"],
      },
      connection: {
        description: "Connect through an IAM role trust relationship or encrypted access keys.",
        fields: [
          { label: "Account ID", value: "AWS account identifier", masked: true },
          { label: "Regions", value: "Selected AWS regions" },
          { label: "External ID", value: "Workspace-generated trust value", masked: true },
        ],
      },
      authentication: {
        description: "Use least-privilege IAM permissions.",
        fields: [
          { label: "IAM Role ARN", value: "arn:aws:iam::*:role/InfraSightReadOnly", masked: true },
          { label: "Access Key ID", value: "Optional fallback credential", masked: true },
          { label: "Secret Access Key", value: "Encrypted server-side", masked: true },
        ],
      },
      discovery: {
        description: "Discovery maps cloud services into the shared resource model.",
        items: ["EC2 instances", "RDS databases", "EKS clusters", "VPC and network metadata"],
      },
      synchronization: {
        description: "Sync jobs collect inventory and operational telemetry without changing infrastructure.",
        steps: ["Validate credentials", "Discover regional resources", "Collect CloudWatch metrics", "Import CloudTrail and log metadata"],
      },
      resources: {
        description: "AWS resource types supported by this connector.",
        items: ["EC2", "RDS", "EKS", "CloudWatch metrics", "CloudWatch logs"],
      },
      health: {
        description: "Health combines connector status, sync freshness, service reachability, and imported alert signals.",
        items: ["Credential validity", "Last successful sync", "CloudWatch metric availability", "Resource alert pressure"],
      },
      logs: {
        description: "Logs remain read-only and are represented as searchable operational context.",
        items: ["CloudWatch Logs", "CloudTrail events", "Sync audit entries"],
      },
    },
  },
  {
    id: "azure",
    displayName: "Azure",
    icon: "azure",
    category: "Cloud",
    connectionType: "API",
    connectionOptions: [
      {
        id: "azure-api",
        label: "Azure API",
        type: "API",
        description: "Connect through Azure management APIs scoped to subscriptions and resource groups.",
        recommended: true,
        authenticationMethods: ["Service Principal", "Managed Identity"],
        configurationFields: ["auth_mode", "tenant_id", "client_id", "client_secret", "subscription_ids", "resource_groups"],
      },
    ],
    authenticationType: "Service Principal / Managed Identity",
    description: "Read-only Azure connector for subscriptions, resource groups, compute, SQL, AKS, metrics, and logs.",
    connectorTypes: ["azure"],
    supportedResourceTypes: ["Virtual Machines", "Azure SQL", "AKS", "Storage Accounts", "Resource Groups"],
    supportedDiscoveryMethods: ["Azure Resource Graph", "Subscription inventory sync", "Azure Monitor metric collection", "Activity Log import"],
    supportedMetrics: ["Percentage CPU", "Network In", "Network Out", "Disk Read Bytes", "DTU / vCore usage", "AKS node readiness"],
    supportedLogs: ["Activity Logs", "Log Analytics", "Azure Monitor Logs", "Connector Sync Audit"],
    configurationSchema: [
      { key: "auth_mode", label: "Authentication Mode", type: "select", required: true, options: ["service_principal", "managed_identity"] },
      { key: "tenant_id", label: "Tenant ID", type: "text", required: true, sensitive: true },
      { key: "client_id", label: "Client ID", type: "text", required: true, sensitive: true },
      { key: "client_secret", label: "Client Secret", type: "password", sensitive: true },
      { key: "subscription_ids", label: "Subscriptions", type: "multiselect", required: true },
      { key: "resource_groups", label: "Resource Groups", type: "multiselect" },
    ],
    healthChecks: [
      { id: "azure-auth", label: "Identity validation", description: "Confirms Service Principal or Managed Identity access." },
      { id: "azure-subscription", label: "Subscription reachability", description: "Checks that configured subscriptions are readable." },
      { id: "azure-monitor", label: "Azure Monitor freshness", description: "Verifies metrics and activity logs are available." },
    ],
    actions: [
      ...COMMON_CONNECTOR_ACTIONS,
      { id: "discover_resources", label: "Discover Resources", description: "Query Azure Resource Graph for selected subscriptions.", scope: "connector" },
      { id: "validate_subscription", label: "Validate Subscription", description: "Confirm selected subscriptions and resource groups are readable.", scope: "connector" },
    ],
    statusModel: "Service Principal or Managed Identity with scoped Reader permissions.",
    sections: {
      overview: {
        description: "Azure telemetry is collected through subscription-scoped read-only permissions.",
        items: ["Subscription-level inventory", "Resource group filtering", "Azure Monitor context"],
      },
      connection: {
        description: "Connect to selected subscriptions and resource groups.",
        fields: [
          { label: "Tenant ID", value: "Microsoft Entra tenant", masked: true },
          { label: "Subscription", value: "Selected subscriptions" },
          { label: "Resource Groups", value: "Optional scoped groups" },
        ],
      },
      authentication: {
        description: "Use a Service Principal or Managed Identity.",
        fields: [
          { label: "Client ID", value: "Application / managed identity ID", masked: true },
          { label: "Client Secret", value: "Encrypted server-side", masked: true },
          { label: "Role Scope", value: "Reader + Monitor Reader" },
        ],
      },
      discovery: {
        description: "Discovery maps Azure services into the unified resource model.",
        items: ["Virtual Machines", "Azure SQL", "AKS clusters", "Storage and networking metadata"],
      },
      synchronization: {
        description: "Sync reads Azure Resource Graph and Azure Monitor sources.",
        steps: ["Validate tenant and subscription access", "Query Resource Graph", "Collect Azure Monitor metrics", "Import Activity Log context"],
      },
      resources: {
        description: "Azure resource types supported by this connector.",
        items: ["VM", "Azure SQL", "AKS", "Resource Groups", "Activity Logs"],
      },
      health: {
        description: "Health reflects access validity, resource graph freshness, metric availability, and active alerts.",
        items: ["Service Principal status", "Subscription reachability", "Azure Monitor freshness"],
      },
      logs: {
        description: "Azure log sources are read-only operational context.",
        items: ["Activity Logs", "Log Analytics", "Connector sync audit entries"],
      },
    },
  },
  {
    id: "agent",
    displayName: "Windows/Linux Agent",
    icon: "agent",
    category: "Infrastructure",
    connectionType: "Agent",
    connectionOptions: [
      {
        id: "host-agent",
        label: "Windows/Linux Agent",
        type: "Agent",
        description: "Install an outbound-only host agent that enrolls into the workspace.",
        recommended: true,
        authenticationMethods: ["Enrollment Token"],
        workflow: ["Generate enrollment token", "Download installer", "Install agent", "Verify connection"],
        configurationFields: ["enrollment_token", "workspace_id", "ingestion_url", "log_paths"],
      },
    ],
    authenticationType: "Enrollment Token",
    description: "Outbound-only host agent for Windows and Linux inventory, local metrics, services, and logs.",
    connectorTypes: ["agent", "linux", "windows"],
    supportedResourceTypes: ["Windows Hosts", "Linux Hosts", "Services", "Local Disks", "Processes"],
    supportedDiscoveryMethods: ["Agent enrollment", "Host heartbeat", "Local inventory scan", "Service inventory scan"],
    supportedMetrics: ["CPU usage", "Memory usage", "Disk usage", "Uptime", "Service status"],
    supportedLogs: ["System logs", "Application logs", "Agent logs", "Local service logs"],
    configurationSchema: [
      { key: "enrollment_token", label: "Enrollment Token", type: "token", required: true, sensitive: true },
      { key: "workspace_id", label: "Workspace ID", type: "text", required: true, sensitive: true },
      { key: "ingestion_url", label: "Ingestion URL", type: "url", required: true },
      { key: "log_paths", label: "Log Paths", type: "multiselect" },
    ],
    healthChecks: [
      { id: "agent-heartbeat", label: "Heartbeat freshness", description: "Checks that enrolled hosts report recent heartbeats." },
      { id: "agent-version", label: "Agent version", description: "Reports outdated or incompatible agent versions." },
      { id: "agent-telemetry", label: "Telemetry quality", description: "Verifies metrics and logs are arriving." },
    ],
    actions: [
      ...COMMON_CONNECTOR_ACTIONS,
      { id: "generate_enrollment_token", label: "Generate Enrollment Token", description: "Create a workspace-scoped enrollment token placeholder.", scope: "connector" },
      { id: "download_agent", label: "Download Agent", description: "Prepare the Windows or Linux agent download flow.", scope: "connector" },
      { id: "verify_agent", label: "Verify Agent", description: "Check agent heartbeat and telemetry readiness.", scope: "connector" },
    ],
    statusModel: "Workspace enrollment token and host heartbeat.",
    sections: {
      overview: {
        description: "Agents report host telemetry through outbound HTTPS without requiring inbound access.",
        items: ["Windows and Linux hosts", "Local service inventory", "Host metrics and logs"],
      },
      connection: {
        description: "Hosts connect to the InfraSight ingestion endpoint.",
        fields: [
          { label: "Ingestion URL", value: "Workspace ingestion endpoint" },
          { label: "Workspace ID", value: "Active workspace identifier", masked: true },
          { label: "Heartbeat", value: "Agent health interval" },
        ],
      },
      authentication: {
        description: "Enrollment is token-based and workspace-scoped.",
        fields: [
          { label: "Enrollment Token", value: "Generated per workspace", masked: true },
          { label: "Host Identity", value: "Generated during enrollment", masked: true },
        ],
      },
      discovery: {
        description: "Agent discovery reports local host inventory.",
        items: ["Connected hosts", "Operating system", "CPU, memory, disk", "Services and local runtime metadata"],
      },
      synchronization: {
        description: "Agents stream heartbeats and periodic snapshots.",
        steps: ["Generate enrollment token", "Install agent package", "Start host service", "Verify heartbeat and telemetry"],
      },
      resources: {
        description: "Agent-backed resources supported by this connector.",
        items: ["Windows hosts", "Linux hosts", "Services", "Local disks", "Local logs"],
      },
      health: {
        description: "Health is based on heartbeat freshness, service status, and telemetry quality.",
        items: ["Heartbeat age", "Agent version", "Host resource pressure", "Local alert signals"],
      },
      logs: {
        description: "Local logs are collected as read-only operational context.",
        items: ["System logs", "Application logs", "Agent logs", "Enrollment audit"],
      },
    },
  },
  {
    id: "docker",
    displayName: "Docker",
    icon: "docker",
    category: "Containers",
    connectionType: "Agent",
    connectionOptions: [
      {
        id: "docker-local-agent",
        label: "Local Agent",
        type: "Agent",
        description: "Use the InfraSight host agent to collect Docker telemetry without exposing the Docker socket remotely.",
        recommended: true,
        authenticationMethods: ["Agent Token", "Host Permissions"],
        workflow: ["Install local agent", "Grant Docker read access", "Discover containers", "Verify telemetry"],
        configurationFields: ["collection_mode", "agent_token", "include_images"],
      },
      {
        id: "docker-socket",
        label: "Docker Socket",
        type: "Docker Socket",
        description: "Read local Docker state through the host socket when an agent-based path is not available.",
        authenticationMethods: ["Local Socket Permission"],
        workflow: ["Verify socket path", "Confirm read access", "Discover containers"],
        configurationFields: ["collection_mode", "docker_socket", "include_images"],
      },
    ],
    authenticationType: "Docker Socket / Local Agent",
    description: "Container connector for Docker hosts through the local agent or local Docker socket access.",
    connectorTypes: ["docker"],
    supportedResourceTypes: ["Containers", "Images", "Networks", "Volumes", "Docker Hosts"],
    supportedDiscoveryMethods: ["Local Docker socket scan", "Agent-backed container inventory", "Container state polling"],
    supportedMetrics: ["Container CPU", "Container memory", "Restart count", "Network I/O", "Container health state"],
    supportedLogs: ["Container stdout/stderr", "Docker daemon logs", "Agent collection logs"],
    configurationSchema: [
      { key: "collection_mode", label: "Collection Mode", type: "select", required: true, options: ["local_agent", "docker_socket"] },
      { key: "agent_token", label: "Agent Token", type: "token", sensitive: true },
      { key: "docker_socket", label: "Docker Socket", type: "text", sensitive: true, placeholder: "/var/run/docker.sock" },
      { key: "include_images", label: "Include Images", type: "select", options: ["yes", "no"] },
    ],
    healthChecks: [
      { id: "docker-socket", label: "Docker access", description: "Confirms the agent can read Docker state." },
      { id: "docker-inventory", label: "Inventory freshness", description: "Checks that containers and images were recently discovered." },
      { id: "docker-logs", label: "Log collection", description: "Verifies container log collection is available." },
    ],
    actions: [
      ...COMMON_CONNECTOR_ACTIONS,
      { id: "verify_docker_socket", label: "Verify Docker Socket", description: "Confirm local Docker socket read access is available.", scope: "connector" },
      { id: "discover_containers", label: "Discover Containers", description: "Scan containers, images, networks, and volumes.", scope: "connector" },
    ],
    statusModel: "Local agent with Docker socket read access.",
    sections: {
      overview: {
        description: "Docker telemetry enriches container inventory, topology, metrics, and logs.",
        items: ["Container discovery", "Image and network metadata", "Container health and restart context"],
      },
      connection: {
        description: "Prefer local agent collection instead of exposing Docker over the network.",
        fields: [
          { label: "Docker Socket", value: "/var/run/docker.sock", masked: true },
          { label: "Collection Mode", value: "Local agent" },
        ],
      },
      authentication: {
        description: "Access is controlled by local host permissions and agent enrollment.",
        fields: [
          { label: "Agent Token", value: "Workspace enrollment token", masked: true },
          { label: "Service Account", value: "Docker read permission" },
        ],
      },
      discovery: {
        description: "Docker discovery maps runtime objects into InfraSight resources.",
        items: ["Containers", "Images", "Networks", "Volumes"],
      },
      synchronization: {
        description: "Sync collects container state and local metrics.",
        steps: ["Install host agent", "Grant Docker socket read access", "Collect container inventory", "Stream health and log context"],
      },
      resources: {
        description: "Docker resource types supported by this connector.",
        items: ["Containers", "Images", "Networks", "Volumes", "Host relationship"],
      },
      health: {
        description: "Health reflects container state, restart count, resource pressure, and log signals.",
        items: ["Container status", "Restart pressure", "CPU and memory usage", "Recent errors"],
      },
      logs: {
        description: "Container logs are collected as read-only context.",
        items: ["Container stdout/stderr", "Docker daemon context", "Agent collection logs"],
      },
    },
  },
  {
    id: "kubernetes",
    displayName: "Kubernetes",
    icon: "kubernetes",
    category: "Containers",
    connectionType: "Helm",
    connectionOptions: [
      {
        id: "kubernetes-helm",
        label: "Helm",
        type: "Helm",
        description: "Install the InfraSight collector chart with read-only Kubernetes RBAC.",
        recommended: true,
        authenticationMethods: ["Helm Token", "Service Account"],
        workflow: ["Generate Helm command", "Install Helm chart", "Verify cluster connection"],
        configurationFields: ["helm_token", "cluster_id", "namespace", "ingestion_key", "watched_namespaces"],
      },
    ],
    authenticationType: "Helm / Service Account",
    description: "Cluster connector installed by Helm for Kubernetes inventory, events, metrics, and logs.",
    connectorTypes: ["kubernetes"],
    supportedResourceTypes: ["Clusters", "Namespaces", "Nodes", "Pods", "Deployments", "Services", "Events"],
    supportedDiscoveryMethods: ["Helm installation", "Kubernetes API watch", "Namespace inventory", "Event stream import"],
    supportedMetrics: ["Pod readiness", "Restart count", "Node CPU", "Node memory", "Deployment availability"],
    supportedLogs: ["Pod logs", "Cluster events", "Collector logs", "Kubernetes audit context"],
    configurationSchema: [
      { key: "helm_token", label: "Helm Token", type: "token", required: true, sensitive: true },
      { key: "cluster_id", label: "Cluster ID", type: "text", required: true, sensitive: true },
      { key: "namespace", label: "Namespace", type: "text", required: true, placeholder: "infrasight-system" },
      { key: "ingestion_key", label: "Ingestion Key", type: "password", required: true, sensitive: true },
      { key: "watched_namespaces", label: "Watched Namespaces", type: "multiselect" },
    ],
    healthChecks: [
      { id: "k8s-collector", label: "Collector heartbeat", description: "Checks the Helm collector is reporting." },
      { id: "k8s-rbac", label: "RBAC coverage", description: "Validates read access to expected Kubernetes objects." },
      { id: "k8s-events", label: "Event stream", description: "Verifies events and workload state are arriving." },
    ],
    actions: [
      ...COMMON_CONNECTOR_ACTIONS,
      { id: "generate_helm_command", label: "Generate Helm Command", description: "Build a placeholder Helm install command for the cluster.", scope: "connector" },
      { id: "validate_cluster_access", label: "Validate Cluster Access", description: "Check read-only Kubernetes API and RBAC coverage.", scope: "connector" },
    ],
    statusModel: "Helm-installed collector with read-only RBAC.",
    sections: {
      overview: {
        description: "Kubernetes telemetry normalizes clusters, workloads, events, and service relationships.",
        items: ["Cluster topology", "Namespace-aware discovery", "Events and workload context"],
      },
      connection: {
        description: "Install the collector into each selected cluster.",
        fields: [
          { label: "Cluster ID", value: "Workspace cluster identity", masked: true },
          { label: "Namespace", value: "infrasight-system" },
          { label: "Helm Release", value: "infrasight-agent" },
        ],
      },
      authentication: {
        description: "The collector uses read-only service account permissions.",
        fields: [
          { label: "Helm Token", value: "Encrypted ingestion key", masked: true },
          { label: "Service Account", value: "Read-only RBAC" },
          { label: "Ingestion Key", value: "Workspace-scoped secret", masked: true },
        ],
      },
      discovery: {
        description: "Discovery imports Kubernetes objects and event context.",
        items: ["Clusters", "Namespaces", "Pods", "Deployments", "Services", "Events"],
      },
      synchronization: {
        description: "Sync is driven by collector snapshots and event streams.",
        steps: ["Add Helm repository", "Install collector chart", "Apply read-only RBAC", "Verify resources and events"],
      },
      resources: {
        description: "Kubernetes resources supported by this connector.",
        items: ["Pods", "Deployments", "Services", "Namespaces", "Nodes", "Events"],
      },
      health: {
        description: "Health reflects collector heartbeat, workload status, restart pressure, and event severity.",
        items: ["Collector heartbeat", "Pod readiness", "Deployment availability", "Warning and error events"],
      },
      logs: {
        description: "Workload logs and events are collected as read-only operational context.",
        items: ["Pod logs", "Cluster events", "Collector audit logs"],
      },
    },
  },
];

export function connectorRegistryItemById(id: string) {
  return CONNECTOR_REGISTRY.find((connector) => connector.id === id) ?? CONNECTOR_REGISTRY[0];
}

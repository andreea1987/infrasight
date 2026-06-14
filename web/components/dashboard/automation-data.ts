/**
 * Automation Platform — Types, Templates, Constants, and Seed Data
 * Pure TypeScript module with no React imports.
 */

// ── Category types ─────────────────────────────────────────────────────────────

export type RuleCategory =
  | "Infrastructure"
  | "Monitoring"
  | "Database"
  | "Security"
  | "Cost Management"
  | "Compliance"
  | "Notifications";

export type TemplateCategory =
  | "Infrastructure"
  | "Database"
  | "Container"
  | "Kubernetes"
  | "AWS"
  | "Azure"
  | "Security";

export type RuleStatus = "active" | "warning" | "disabled" | "running";

// ── Conditions ────────────────────────────────────────────────────────────────

export type Condition = {
  id: string;
  field: string;
  operator: string;
  value: string;
  unit?: string;
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type ActionType = "alert" | "notification" | "event" | "log";

export type AutomationAction = {
  id: string;
  type: ActionType;
  severity?: "critical" | "warning" | "info";
  channelId?: number;
  channelType?: string;
  message: string;
};

// ── Execution history ─────────────────────────────────────────────────────────

export type ExecutionRecord = {
  id: string;
  timestamp: string;
  status: "success" | "failed";
  durationMs: number;
  targetResource: string;
  result: string;
};

// ── Full rule ─────────────────────────────────────────────────────────────────

export type AutomationRule = {
  id: number;
  name: string;
  category: RuleCategory;
  description: string;
  templateId?: string;
  trigger: string;
  conditions: Condition[];
  actions: AutomationAction[];
  status: RuleStatus;
  enabled: boolean;
  lastRun: string | null;
  runsToday: number;
  totalRuns: number;
  createdAt: string;
  executionHistory: ExecutionRecord[];
};

// ── Template definition ───────────────────────────────────────────────────────

export type AutomationTemplate = {
  id: string;
  name: string;
  templateCategory: TemplateCategory;
  ruleCategory: RuleCategory;
  description: string;
  trigger: string;
  defaultConditions: Omit<Condition, "id">[];
  suggestedActions: ActionType[];
  tags: string[];
};

// ── Template library (32 templates) ─────────────────────────────────────────

export const TEMPLATES: AutomationTemplate[] = [
  // Infrastructure
  {
    id: "infra-high-cpu",
    name: "High CPU Alert",
    templateCategory: "Infrastructure",
    ruleCategory: "Monitoring",
    description: "Triggers when CPU utilisation exceeds a defined threshold for a sustained period.",
    trigger: "CPU utilisation > threshold for ≥ 5 minutes",
    defaultConditions: [{ field: "cpu_percent", operator: ">", value: "85", unit: "%" }],
    suggestedActions: ["alert", "notification"],
    tags: ["cpu", "performance", "ec2", "vm"],
  },
  {
    id: "infra-high-memory",
    name: "High Memory Alert",
    templateCategory: "Infrastructure",
    ruleCategory: "Monitoring",
    description: "Fires when available memory drops below a safe threshold.",
    trigger: "Memory utilisation > threshold",
    defaultConditions: [{ field: "memory_percent", operator: ">", value: "90", unit: "%" }],
    suggestedActions: ["alert", "notification"],
    tags: ["memory", "performance"],
  },
  {
    id: "infra-low-disk",
    name: "Low Disk Space Alert",
    templateCategory: "Infrastructure",
    ruleCategory: "Monitoring",
    description: "Alerts when available disk space falls below a safe level.",
    trigger: "Disk usage > threshold",
    defaultConditions: [{ field: "disk_percent", operator: ">", value: "85", unit: "%" }],
    suggestedActions: ["alert", "notification", "log"],
    tags: ["disk", "storage", "performance"],
  },
  {
    id: "infra-unreachable",
    name: "Resource Unreachable",
    templateCategory: "Infrastructure",
    ruleCategory: "Infrastructure",
    description: "Detects when a resource stops responding to health checks.",
    trigger: "Resource status becomes unreachable",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "unreachable" }],
    suggestedActions: ["alert", "notification", "event"],
    tags: ["health", "connectivity", "critical"],
  },
  {
    id: "infra-service-stopped",
    name: "Service Stopped",
    templateCategory: "Infrastructure",
    ruleCategory: "Infrastructure",
    description: "Triggers when a monitored service or process stops unexpectedly.",
    trigger: "Service status transitions to stopped",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "stopped" }],
    suggestedActions: ["alert", "notification", "event"],
    tags: ["service", "availability"],
  },
  {
    id: "infra-vm-restart",
    name: "VM Restart Recommendation",
    templateCategory: "Infrastructure",
    ruleCategory: "Infrastructure",
    description: "Logs a restart recommendation when memory pressure is critical and uptime is high.",
    trigger: "Memory > 95% AND uptime > 30 days",
    defaultConditions: [{ field: "memory_percent", operator: ">", value: "95", unit: "%" }],
    suggestedActions: ["log", "event", "notification"],
    tags: ["vm", "maintenance", "recommendation"],
  },

  // Database
  {
    id: "db-failed-sql-job",
    name: "Failed SQL Job",
    templateCategory: "Database",
    ruleCategory: "Database",
    description: "Notifies when a scheduled SQL agent job fails.",
    trigger: "SQL job exit code is non-zero",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "failed" }],
    suggestedActions: ["alert", "notification", "log"],
    tags: ["sql", "jobs", "database"],
  },
  {
    id: "db-blocking-queries",
    name: "Blocking Queries",
    templateCategory: "Database",
    ruleCategory: "Database",
    description: "Detects when blocking queries cause lock wait times to spike.",
    trigger: "Blocking chain detected with wait time > threshold",
    defaultConditions: [{ field: "query_duration_seconds", operator: ">", value: "30", unit: "s" }],
    suggestedActions: ["alert", "log"],
    tags: ["sql", "blocking", "performance"],
  },
  {
    id: "db-deadlock",
    name: "Deadlock Detection",
    templateCategory: "Database",
    ruleCategory: "Database",
    description: "Fires when the database engine detects and resolves a deadlock.",
    trigger: "Deadlock event logged in error log",
    defaultConditions: [{ field: "alert_count", operator: ">", value: "0" }],
    suggestedActions: ["event", "log", "notification"],
    tags: ["deadlock", "database", "transactions"],
  },
  {
    id: "db-replication-lag",
    name: "Replication Lag",
    templateCategory: "Database",
    ruleCategory: "Database",
    description: "Alerts when a replica falls behind the primary by too many seconds.",
    trigger: "Replication lag > threshold",
    defaultConditions: [{ field: "replication_lag_seconds", operator: ">", value: "60", unit: "s" }],
    suggestedActions: ["alert", "notification"],
    tags: ["replication", "ha", "database"],
  },
  {
    id: "db-backup-failure",
    name: "Backup Failure",
    templateCategory: "Database",
    ruleCategory: "Database",
    description: "Triggers when a scheduled database backup does not complete successfully.",
    trigger: "Backup job status is failed or missing",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "failed" }],
    suggestedActions: ["alert", "notification", "event"],
    tags: ["backup", "database", "critical"],
  },
  {
    id: "db-long-running-query",
    name: "Long Running Query",
    templateCategory: "Database",
    ruleCategory: "Database",
    description: "Detects queries that have been executing beyond a safe duration.",
    trigger: "Query running time exceeds threshold",
    defaultConditions: [{ field: "query_duration_seconds", operator: ">", value: "300", unit: "s" }],
    suggestedActions: ["alert", "log"],
    tags: ["query", "performance", "database"],
  },

  // Container
  {
    id: "ctr-restart-loop",
    name: "Container Restart Loop",
    templateCategory: "Container",
    ruleCategory: "Infrastructure",
    description: "Fires when a container restarts repeatedly, indicating a crash loop.",
    trigger: "Container restart count > threshold within window",
    defaultConditions: [{ field: "restart_count", operator: ">", value: "5" }],
    suggestedActions: ["alert", "event", "notification"],
    tags: ["container", "docker", "crash"],
  },
  {
    id: "ctr-high-cpu",
    name: "High Container CPU",
    templateCategory: "Container",
    ruleCategory: "Monitoring",
    description: "Alerts when a container's CPU usage exceeds its limit or a threshold.",
    trigger: "Container CPU utilisation > threshold",
    defaultConditions: [{ field: "cpu_percent", operator: ">", value: "80", unit: "%" }],
    suggestedActions: ["alert", "log"],
    tags: ["container", "cpu", "performance"],
  },
  {
    id: "ctr-high-memory",
    name: "High Container Memory",
    templateCategory: "Container",
    ruleCategory: "Monitoring",
    description: "Triggers when a container approaches its memory limit.",
    trigger: "Container memory utilisation > threshold",
    defaultConditions: [{ field: "memory_percent", operator: ">", value: "85", unit: "%" }],
    suggestedActions: ["alert", "notification"],
    tags: ["container", "memory", "performance"],
  },
  {
    id: "ctr-image-drift",
    name: "Image Drift Detection",
    templateCategory: "Container",
    ruleCategory: "Security",
    description: "Detects when running containers diverge from their registered image digest.",
    trigger: "Running image digest differs from registry digest",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "drifted" }],
    suggestedActions: ["alert", "event", "notification"],
    tags: ["container", "security", "drift"],
  },

  // Kubernetes
  {
    id: "k8s-crashloop",
    name: "Pod CrashLoopBackOff",
    templateCategory: "Kubernetes",
    ruleCategory: "Infrastructure",
    description: "Detects pods entering CrashLoopBackOff state.",
    trigger: "Pod state is CrashLoopBackOff",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "CrashLoopBackOff" }],
    suggestedActions: ["alert", "event", "notification"],
    tags: ["kubernetes", "pod", "crash"],
  },
  {
    id: "k8s-node-not-ready",
    name: "Node Not Ready",
    templateCategory: "Kubernetes",
    ruleCategory: "Infrastructure",
    description: "Fires when a Kubernetes node transitions to NotReady.",
    trigger: "Node condition NotReady for > 2 minutes",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "NotReady" }],
    suggestedActions: ["alert", "event", "notification"],
    tags: ["kubernetes", "node", "cluster"],
  },
  {
    id: "k8s-deployment-failure",
    name: "Deployment Failure",
    templateCategory: "Kubernetes",
    ruleCategory: "Infrastructure",
    description: "Alerts when a rollout fails to progress or gets stuck.",
    trigger: "Deployment rollout stalled or unavailable replicas > 0",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "stalled" }],
    suggestedActions: ["alert", "event", "notification"],
    tags: ["kubernetes", "deployment", "rollout"],
  },
  {
    id: "k8s-high-restart",
    name: "High Pod Restart Count",
    templateCategory: "Kubernetes",
    ruleCategory: "Monitoring",
    description: "Triggers when cumulative pod restarts exceed a threshold.",
    trigger: "Pod restart count > threshold",
    defaultConditions: [{ field: "restart_count", operator: ">", value: "10" }],
    suggestedActions: ["alert", "log"],
    tags: ["kubernetes", "pod", "stability"],
  },

  // AWS
  {
    id: "aws-sg-change",
    name: "Security Group Change",
    templateCategory: "AWS",
    ruleCategory: "Security",
    description: "Detects any modification to EC2 security group rules via CloudTrail.",
    trigger: "CloudTrail AuthorizeSecurityGroupIngress / Revoke event",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "modified" }],
    suggestedActions: ["alert", "event", "notification", "log"],
    tags: ["aws", "security", "cloudtrail", "compliance"],
  },
  {
    id: "aws-ec2-high-cpu",
    name: "EC2 High CPU",
    templateCategory: "AWS",
    ruleCategory: "Monitoring",
    description: "CloudWatch-backed alert for sustained high CPU on EC2 instances.",
    trigger: "EC2 CPUUtilization > threshold for ≥ 5 minutes",
    defaultConditions: [{ field: "cpu_percent", operator: ">", value: "85", unit: "%" }],
    suggestedActions: ["alert", "notification"],
    tags: ["aws", "ec2", "cloudwatch", "performance"],
  },
  {
    id: "aws-cost-anomaly",
    name: "Cost Anomaly Detection",
    templateCategory: "AWS",
    ruleCategory: "Cost Management",
    description: "Fires when AWS spend exceeds the rolling baseline by a set percentage.",
    trigger: "Daily spend exceeds baseline by > threshold%",
    defaultConditions: [{ field: "cost_change_percent", operator: ">", value: "20", unit: "%" }],
    suggestedActions: ["alert", "notification"],
    tags: ["aws", "cost", "billing", "anomaly"],
  },
  {
    id: "aws-unattached-ebs",
    name: "Unattached EBS Volume",
    templateCategory: "AWS",
    ruleCategory: "Cost Management",
    description: "Identifies EBS volumes in available state not attached to any instance.",
    trigger: "EBS volume state is available (not attached) for > 24 hours",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "available" }],
    suggestedActions: ["event", "notification", "log"],
    tags: ["aws", "ebs", "cost", "waste"],
  },

  // Azure
  {
    id: "azure-vm-health",
    name: "VM Health Alert",
    templateCategory: "Azure",
    ruleCategory: "Monitoring",
    description: "Azure Monitor-backed alert for VM health state changes.",
    trigger: "Azure VM health state transitions to Degraded or Unavailable",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "Degraded" }],
    suggestedActions: ["alert", "event", "notification"],
    tags: ["azure", "vm", "health", "monitor"],
  },
  {
    id: "azure-nsg-change",
    name: "NSG Change Detection",
    templateCategory: "Azure",
    ruleCategory: "Security",
    description: "Detects modifications to Azure Network Security Group rules via Activity Log.",
    trigger: "Azure Activity Log records NSG rule create/update/delete",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "modified" }],
    suggestedActions: ["alert", "event", "notification", "log"],
    tags: ["azure", "nsg", "security", "compliance"],
  },
  {
    id: "azure-cost-spike",
    name: "Cost Spike Alert",
    templateCategory: "Azure",
    ruleCategory: "Cost Management",
    description: "Triggers when Azure subscription spend spikes beyond a set tolerance.",
    trigger: "Subscription spend exceeds daily budget threshold",
    defaultConditions: [{ field: "cost_change_percent", operator: ">", value: "25", unit: "%" }],
    suggestedActions: ["alert", "notification"],
    tags: ["azure", "cost", "budget"],
  },
  {
    id: "azure-resource-deletion",
    name: "Resource Deletion Alert",
    templateCategory: "Azure",
    ruleCategory: "Compliance",
    description: "Logs and alerts whenever a resource is deleted in the monitored subscription.",
    trigger: "Azure Activity Log records Delete operation on any resource",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "deleted" }],
    suggestedActions: ["alert", "event", "log", "notification"],
    tags: ["azure", "deletion", "compliance", "audit"],
  },

  // Security
  {
    id: "sec-failed-login",
    name: "Failed Login Threshold",
    templateCategory: "Security",
    ruleCategory: "Security",
    description: "Fires when failed authentication attempts exceed a count threshold within a window.",
    trigger: "Failed logins > threshold within 10-minute window",
    defaultConditions: [{ field: "failed_login_count", operator: ">", value: "10" }],
    suggestedActions: ["alert", "event", "notification", "log"],
    tags: ["security", "auth", "brute-force"],
  },
  {
    id: "sec-privileged-activity",
    name: "Privileged Account Activity",
    templateCategory: "Security",
    ruleCategory: "Security",
    description: "Alerts when privileged accounts perform sensitive operations.",
    trigger: "Privileged account action detected in audit log",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "privileged_action" }],
    suggestedActions: ["alert", "event", "notification", "log"],
    tags: ["security", "privileged", "audit", "iam"],
  },
  {
    id: "sec-config-drift",
    name: "Configuration Drift",
    templateCategory: "Security",
    ruleCategory: "Compliance",
    description: "Detects when resource configuration deviates from the approved baseline.",
    trigger: "Configuration hash differs from approved baseline",
    defaultConditions: [{ field: "resource_status", operator: "is", value: "drifted" }],
    suggestedActions: ["alert", "event", "notification"],
    tags: ["security", "compliance", "drift", "baseline"],
  },
  {
    id: "sec-critical-vuln",
    name: "Critical Vulnerability Detected",
    templateCategory: "Security",
    ruleCategory: "Security",
    description: "Triggers when a CVE with critical severity is identified on a monitored resource.",
    trigger: "CVE severity is Critical (CVSS ≥ 9.0) on monitored asset",
    defaultConditions: [{ field: "alert_severity", operator: "is", value: "critical" }],
    suggestedActions: ["alert", "notification", "event"],
    tags: ["security", "cve", "vulnerability", "patch"],
  },
];

// ── Display configs ───────────────────────────────────────────────────────────

export const CATEGORY_CONFIG: Record<RuleCategory, { color: string; bg: string }> = {
  Infrastructure:    { color: "hsl(263 72% 66%)", bg: "hsl(263 72% 66% / 0.14)" },
  Monitoring:        { color: "hsl(196 90% 55%)", bg: "hsl(196 90% 55% / 0.14)" },
  Database:          { color: "hsl(217 80% 65%)", bg: "hsl(217 80% 65% / 0.14)" },
  Security:          { color: "hsl(4 78% 65%)",   bg: "hsl(4 78% 65% / 0.14)"   },
  "Cost Management": { color: "hsl(142 70% 50%)", bg: "hsl(142 70% 50% / 0.14)" },
  Compliance:        { color: "hsl(38 88% 60%)",  bg: "hsl(38 88% 60% / 0.14)"  },
  Notifications:     { color: "hsl(263 72% 66%)", bg: "hsl(263 72% 66% / 0.14)" },
};

export const TEMPLATE_CATEGORY_COLOR: Record<TemplateCategory, string> = {
  Infrastructure: "hsl(263 72% 66%)",
  Database:       "hsl(217 80% 65%)",
  Container:      "hsl(38 88% 60%)",
  Kubernetes:     "hsl(196 90% 55%)",
  AWS:            "hsl(38 88% 60%)",
  Azure:          "hsl(196 90% 55%)",
  Security:       "hsl(4 78% 65%)",
};

export const ACTION_CONFIG: Record<ActionType, { label: string; description: string; color: string }> = {
  alert:        { label: "Generate Alert",    description: "Creates an alert record with specified severity",    color: "hsl(4 78% 65%)"   },
  notification: { label: "Send Notification", description: "Delivers a message via email, Slack, or Teams",      color: "hsl(263 72% 66%)" },
  event:        { label: "Create Event",      description: "Appends a structured event to the activity log",     color: "hsl(196 90% 55%)" },
  log:          { label: "Log Activity",      description: "Writes a timestamped entry to the audit trail",      color: "hsl(142 70% 50%)" },
};

export const CONDITION_FIELDS = [
  { value: "cpu_percent",              label: "CPU Utilisation (%)"       },
  { value: "memory_percent",           label: "Memory Utilisation (%)"    },
  { value: "disk_percent",             label: "Disk Usage (%)"            },
  { value: "response_time_ms",         label: "Response Time (ms)"        },
  { value: "resource_status",          label: "Resource Status"           },
  { value: "alert_count",              label: "Alert Count"               },
  { value: "alert_severity",           label: "Alert Severity"            },
  { value: "restart_count",            label: "Restart Count"             },
  { value: "replication_lag_seconds",  label: "Replication Lag (s)"      },
  { value: "query_duration_seconds",   label: "Query Duration (s)"        },
  { value: "failed_login_count",       label: "Failed Login Count"        },
  { value: "cost_change_percent",      label: "Cost Change (%)"           },
  { value: "schedule",                 label: "Schedule (cron)"           },
];

export const CONDITION_OPERATORS = [
  { value: ">",        label: "greater than (>)" },
  { value: "<",        label: "less than (<)"    },
  { value: ">=",       label: "at least (≥)"     },
  { value: "<=",       label: "at most (≤)"      },
  { value: "==",       label: "equals (=)"       },
  { value: "!=",       label: "not equals (≠)"   },
  { value: "is",       label: "is"               },
  { value: "contains", label: "contains"         },
];

// ── Seed data helpers ─────────────────────────────────────────────────────────

function fakeHistory(
  count: number,
  failFirst: number,
  resource: string,
  successMsg: string,
  failMsg: string,
): ExecutionRecord[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `h-${i}`,
    timestamp: new Date(now - i * 7_200_000 - Math.random() * 3_600_000).toISOString(),
    status: i < failFirst ? ("failed" as const) : ("success" as const),
    durationMs: 280 + Math.floor(Math.random() * 920),
    targetResource: resource,
    result: i < failFirst ? failMsg : successMsg,
  }));
}

// ── Initial rules ─────────────────────────────────────────────────────────────

export const INITIAL_RULES: AutomationRule[] = [
  {
    id: 1,
    name: "EC2 High CPU Alert",
    category: "Monitoring",
    description: "Raises a critical alert when an EC2 instance CPU exceeds 85% for 5 minutes and notifies via Slack.",
    templateId: "aws-ec2-high-cpu",
    trigger: "EC2 CPUUtilization > 85% for ≥ 5 minutes",
    conditions: [
      { id: "c1", field: "cpu_percent", operator: ">", value: "85", unit: "%" },
    ],
    actions: [
      { id: "a1", type: "alert", severity: "critical", message: "EC2 instance {{resource.name}} CPU at {{metric.value}}%" },
      { id: "a2", type: "notification", channelType: "slack", message: "⚠️ High CPU on {{resource.name}}: {{metric.value}}%" },
    ],
    status: "active",
    enabled: true,
    lastRun: "2h ago",
    runsToday: 3,
    totalRuns: 47,
    createdAt: "2025-11-01",
    executionHistory: fakeHistory(8, 0, "web-server-01", "Alert generated, Slack notification delivered", "Notification delivery failed"),
  },
  {
    id: 2,
    name: "Unhealthy Resource Alert",
    category: "Infrastructure",
    description: "Raises a critical alert and creates an event when any resource transitions to unhealthy.",
    templateId: "infra-unreachable",
    trigger: "Resource health status transitions to Unhealthy",
    conditions: [
      { id: "c1", field: "resource_status", operator: "is", value: "unhealthy" },
    ],
    actions: [
      { id: "a1", type: "alert", severity: "critical", message: "Resource {{resource.name}} is unhealthy" },
      { id: "a2", type: "event", message: "Health change detected: {{resource.name}} → unhealthy" },
    ],
    status: "active",
    enabled: true,
    lastRun: "15 min ago",
    runsToday: 1,
    totalRuns: 12,
    createdAt: "2025-11-15",
    executionHistory: fakeHistory(6, 1, "db-primary-01", "Alert and event created successfully", "Alert DB write failed"),
  },
  {
    id: 3,
    name: "Database Backup Verification",
    category: "Database",
    description: "Logs backup results daily at 03:00 UTC and raises a critical alert on failure.",
    templateId: "db-backup-failure",
    trigger: "Daily schedule: 03:00 UTC",
    conditions: [
      { id: "c1", field: "schedule", operator: "is", value: "0 3 * * *" },
    ],
    actions: [
      { id: "a1", type: "log", message: "Backup verification run for {{resource.name}}: {{result}}" },
      { id: "a2", type: "alert", severity: "critical", message: "Backup failed for {{resource.name}}" },
    ],
    status: "active",
    enabled: true,
    lastRun: "8h ago",
    runsToday: 1,
    totalRuns: 183,
    createdAt: "2025-09-20",
    executionHistory: fakeHistory(9, 0, "postgres-prod", "Backup integrity verified, log entry written", "Backup not found"),
  },
  {
    id: 4,
    name: "Security Group Drift Detection",
    category: "Security",
    description: "Alerts the security team and writes an audit log entry whenever a security group rule is modified.",
    templateId: "aws-sg-change",
    trigger: "CloudTrail: SecurityGroup rule modified",
    conditions: [
      { id: "c1", field: "resource_status", operator: "is", value: "modified" },
    ],
    actions: [
      { id: "a1", type: "alert", severity: "warning", message: "Security group {{resource.name}} was modified" },
      { id: "a2", type: "log", message: "Audit: security group change on {{resource.name}} by {{actor}}" },
    ],
    status: "warning",
    enabled: true,
    lastRun: "3 days ago",
    runsToday: 0,
    totalRuns: 4,
    createdAt: "2025-10-10",
    executionHistory: fakeHistory(4, 2, "sg-prod-web", "Alert raised, audit log written", "Alert channel unreachable"),
  },
  {
    id: 5,
    name: "Stale Resource Review",
    category: "Compliance",
    description: "Creates a review event and emails stakeholders when a resource has been inactive for over 30 days.",
    trigger: "Resource has no activity for > 30 days",
    conditions: [
      { id: "c1", field: "resource_status", operator: "is", value: "inactive" },
    ],
    actions: [
      { id: "a1", type: "event", message: "Stale resource flagged for review: {{resource.name}}" },
      { id: "a2", type: "notification", channelType: "email", message: "Stale resource review required: {{resource.name}} ({{resource.region}})" },
    ],
    status: "disabled",
    enabled: false,
    lastRun: null,
    runsToday: 0,
    totalRuns: 0,
    createdAt: "2025-12-01",
    executionHistory: [],
  },
  {
    id: 6,
    name: "Cost Anomaly Alert",
    category: "Cost Management",
    description: "Notifies finance and engineering when daily spend exceeds 120% of the 7-day rolling baseline.",
    templateId: "aws-cost-anomaly",
    trigger: "Daily spend > 120% of 7-day baseline",
    conditions: [
      { id: "c1", field: "cost_change_percent", operator: ">", value: "20", unit: "%" },
    ],
    actions: [
      { id: "a1", type: "alert", severity: "warning", message: "Cost anomaly: spend at {{metric.value}}% of baseline" },
      { id: "a2", type: "notification", channelType: "email", message: "Cost anomaly detected — review your infrastructure spend" },
    ],
    status: "disabled",
    enabled: false,
    lastRun: null,
    runsToday: 0,
    totalRuns: 0,
    createdAt: "2025-12-05",
    executionHistory: [],
  },
];

import type { AlertRecord, MonitoringSummary, Resource } from "@/types/infrasight";

export const mockResources: Resource[] = [
  {
    id: "mock-1",
    name: "api-prod-01",
    provider: "aws",
    resource_type: "ec2",
    status: "running",
    region: "us-east-1",
    private_ip: "10.0.4.21",
    metadata: { cpu_count: 4, memory_gb: 16 },
  },
  {
    id: "mock-2",
    name: "edge-host-local",
    provider: "onprem",
    resource_type: "local_host",
    status: "running",
    region: "local",
    private_ip: "192.168.1.15",
    metadata: { cpu_count: 8, memory_gb: 32, disk_used_percent: 68, monitoring_status: "paused" },
  },
  {
    id: "mock-db-1",
    name: "orders-postgres",
    provider: "onprem",
    resource_type: "postgres_database",
    status: "healthy",
    region: "local",
    private_ip: "192.168.1.30",
    metadata: {
      active_connections: 18,
      connection_status: "connected",
      cpu_percent: 24,
      last_checked: new Date().toISOString(),
      memory_percent: 61,
      replication_lag_seconds: 0,
      size_gb: 42,
      storage_used_percent: 54,
    },
  },
  {
    id: "mock-k8s-1",
    name: "payments-deployment",
    provider: "kubernetes",
    resource_type: "deployment",
    status: "healthy",
    region: "cluster-dev",
    metadata: { namespace: "payments", desired_replicas: 3, ready_replicas: 3 },
  },
];

export const defaultSummary: MonitoringSummary = {
  total_resources: mockResources.length,
  healthy_percentage: 75,
  running_percentage: 50,
  open_alerts: 1,
  critical_alerts: 0,
  warning_alerts: 1,
};

export const mockAlerts: AlertRecord[] = [
  {
    id: "mock-alert-1",
    resource_id: "mock-2",
    title: "edge-host-local monitoring delayed",
    severity: "warning",
    status: "open",
    source: "resource_status",
    metric_name: "resource_up",
    metric_value: 0,
    threshold: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-alert-2",
    resource_id: "mock-db-1",
    title: "orders-postgres connection saturation recovered",
    severity: "warning",
    status: "resolved",
    source: "database_events",
    metric_name: "active_connections",
    metric_value: 18,
    threshold: 40,
    created_at: new Date().toISOString(),
    resolved_at: new Date().toISOString(),
  },
];

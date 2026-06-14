import { getMonitoringStatus } from "@/dashboard/health";
import type { AlertRecord, RecentActivityItem, Resource } from "@/types/infrasight";

export function buildRecentActivity({
  alerts,
  lastEvent,
  resources,
}: {
  alerts: AlertRecord[];
  lastEvent: string;
  resources: Resource[];
}) {
  const activities: RecentActivityItem[] = [];

  alerts
    .filter((alert) => alert.status !== "resolved")
    .slice(0, 4)
    .forEach((alert) => {
      activities.push({
        id: `alert-triggered-${alert.id}`,
        type: "alert_triggered",
        title: "Alert triggered",
        detail: alert.title,
        severity: alert.severity === "critical" ? "critical" : "warning",
        timestamp: alert.created_at,
      });
    });

  alerts
    .filter((alert) => alert.status === "resolved")
    .slice(0, 3)
    .forEach((alert) => {
      activities.push({
        id: `alert-resolved-${alert.id}`,
        type: "alert_resolved",
        title: "Alert resolved",
        detail: alert.title,
        severity: "success",
        timestamp: alert.resolved_at ?? alert.updated_at ?? alert.created_at,
      });
    });

  resources.slice(0, 3).forEach((resource) => {
    activities.push({
      id: `resource-discovered-${resource.id}`,
      type: "resource_discovered",
      title: "Resource discovered",
      detail: `${resource.name} joined ${resource.provider}`,
      severity: "info",
      timestamp: getMetadataTime(resource, "created_at") ?? getMetadataTime(resource, "discovered_at"),
    });
  });

  resources
    .filter((resource) => ["terminated", "deleted", "removed"].includes(resource.status.toLowerCase()))
    .slice(0, 3)
    .forEach((resource) => {
      activities.push({
        id: `resource-removed-${resource.id}`,
        type: "resource_removed",
        title: "Resource removed",
        detail: `${resource.name} is ${resource.status}`,
        severity: "warning",
        timestamp: getMetadataTime(resource, "removed_at") ?? getMetadataTime(resource, "updated_at"),
      });
    });

  resources
    .filter((resource) => getMonitoringStatus(resource).toLowerCase() !== "monitored")
    .slice(0, 3)
    .forEach((resource) => {
      activities.push({
        id: `monitoring-state-${resource.id}`,
        type: "monitoring_state",
        title: "Monitoring state changed",
        detail: `${resource.name} is ${getMonitoringStatus(resource)}`,
        severity: "info",
        timestamp: getMetadataTime(resource, "updated_at"),
      });
    });

  if (lastEvent && !["booting console", "event stream online"].includes(lastEvent)) {
    activities.push({
      id: `stream-${lastEvent}`,
      type: "monitoring_state",
      title: "Monitoring state changed",
      detail: lastEvent.replaceAll("_", " "),
      severity: "info",
    });
  }

  return activities
    .sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime())
    .slice(0, 8);
}

function getMetadataTime(resource: Resource, key: string) {
  const value = resource.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

import type { AlertRecord, Resource, ResourceHealthStatus } from "@/types/infrasight";

const AVAILABLE_STATUSES = ["running", "healthy", "available", "active", "ready", "ok"];
const DEGRADED_STATUSES = ["warning", "degraded", "pending", "starting", "unknown"];
const UNAVAILABLE_STATUSES = ["critical", "error", "failed", "stopped", "terminated", "down", "offline"];
const UNMONITORED_STATUSES = ["disabled", "paused", "offline", "unmonitored", "not_monitored"];

/**
 * Adds derived health fields to every resource in the current workspace.
 * Used by dashboard metrics, inventory, infrastructure tables and details pages.
 *
 * Inputs:
 * - resources: raw backend or mock inventory records
 * - alerts: workspace alerts used to correlate active risk
 *
 * Output:
 * - resources with health_score, health_status and monitoring_status populated
 */
export function enrichResourcesWithHealth(resources: Resource[], alerts: AlertRecord[]) {
  return resources.map((resource) => {
    const health = calculateResourceHealth(resource, getAlertsForResource(resource, alerts));

    return {
      ...resource,
      health_score: health.score,
      health_status: health.status,
      monitoring_status: health.monitoringStatus,
    };
  });
}

/**
 * Calculate a health score between 0 and 100 for a single resource.
 *
 * The score is reduced based on:
 * - Critical and warning alerts
 * - Unknown or unavailable resource status
 * - Disabled or paused monitoring
 * - Critical event pressure
 *
 * Assumption:
 * - Alerts passed to this function are already scoped to the resource.
 */
export function calculateResourceHealth(resource: Resource, alerts: AlertRecord[]) {
  const activeAlerts = alerts.filter((alert) => alert.status !== "resolved");
  const criticalAlerts = activeAlerts.filter((alert) => alert.severity === "critical");
  const warningAlerts = activeAlerts.filter((alert) => alert.severity === "warning");
  const status = resource.status.toLowerCase();
  const monitoringStatus = getMonitoringStatus(resource);
  const unavailable = UNAVAILABLE_STATUSES.includes(status);
  const degraded = DEGRADED_STATUSES.includes(status);
  const monitoringUnavailable = UNMONITORED_STATUSES.includes(monitoringStatus.toLowerCase());

  let score = 100;

  // Active alerts carry the strongest signal because operators need the score
  // to reflect what is currently paging or queued for action.
  score -= Math.min(55, criticalAlerts.length * 35 + warningAlerts.length * 15);
  score -= Math.min(
    20,
    activeAlerts.filter((alert) => !["critical", "warning"].includes(alert.severity)).length * 8,
  );

  // Availability is evaluated separately from alerting so a stopped or failed
  // resource is marked down even if the alert pipeline has not caught up yet.
  if (unavailable) {
    score -= 25;
  } else if (degraded || !AVAILABLE_STATUSES.includes(status)) {
    score -= 8;
  }

  // Disabled or paused monitoring reduces confidence in the resource health.
  if (monitoringUnavailable) {
    score -= 15;
  }

  // Critical event sources are treated as recent operational incidents and
  // keep the resource out of a healthy state until the event noise clears.
  const criticalEvents = activeAlerts.filter(
    (alert) => alert.severity === "critical" || alert.source.toLowerCase().includes("event"),
  );
  score -= Math.min(30, criticalEvents.length * 10);

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const statusLabel = getHealthStatus(clampedScore, {
    hasCritical: criticalAlerts.length > 0 || unavailable,
    hasWarning: warningAlerts.length > 0 || degraded || monitoringUnavailable,
  });

  return {
    score: clampedScore,
    status: statusLabel,
    monitoringStatus,
  };
}

/**
 * Finds alerts that belong to a resource by ID, external resource_id or title match.
 * This supports mixed real and mock data where alert relationships may be partial.
 */
export function getAlertsForResource(resource: Resource, alerts: AlertRecord[]) {
  const ids = [resource.id, resource.resource_id].filter(Boolean).map(String);
  const name = resource.name.toLowerCase();

  return alerts.filter((alert) => {
    const alertResourceId = alert.resource_id === undefined ? "" : String(alert.resource_id);
    return ids.includes(alertResourceId) || alert.title.toLowerCase().includes(name);
  });
}

/**
 * Normalizes monitoring state from resource metadata.
 * Returns "monitored" when the backend has not supplied an explicit state.
 */
export function getMonitoringStatus(resource: Resource) {
  const metadataStatus =
    resource.metadata?.monitoring_status ??
    resource.metadata?.monitoring_state ??
    resource.metadata?.monitoring_enabled;

  if (typeof metadataStatus === "boolean") {
    return metadataStatus ? "monitored" : "disabled";
  }

  return String(metadataStatus ?? "monitored");
}

function getHealthStatus(
  score: number,
  signals: { hasCritical: boolean; hasWarning: boolean },
): ResourceHealthStatus {
  if (signals.hasCritical || score < 50) return "Critical";
  if (signals.hasWarning || score < 80) return "Warning";
  return "Healthy";
}

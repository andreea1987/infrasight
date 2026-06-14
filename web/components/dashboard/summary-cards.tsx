import { Activity, AlertTriangle, Bell, Gauge, ShieldCheck } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { getCategoryIcon } from "@/dashboard/resourceIcons";
import type { AlertRecord, MonitoringSummary, Resource } from "@/types/infrasight";

export type SummaryMetricTarget =
  | "total-resources"
  | "healthy-resources"
  | "warning-resources"
  | "critical-resources"
  | "open-alerts"
  | "estate-health-score";

/**
 * Renders the operational dashboard metric cards for the active workspace.
 *
 * Inputs:
 * - resources and alerts enriched with health state
 * - summary from the monitoring API
 *
 * Output:
 * - interactive cards that preview matching records and navigate to filtered views
 */
export function SummaryCards({
  alerts = [],
  onMetricClick,
  resources,
  summary,
}: {
  alerts?: AlertRecord[];
  onMetricClick?: (target: SummaryMetricTarget) => void;
  resources: Resource[];
  summary: MonitoringSummary;
}) {
  const healthyResourceItems = resources.filter((resource) => resource.health_status === "Healthy");
  const warningResourceItems = resources.filter((resource) => resource.health_status === "Warning");
  const criticalResourceItems = resources.filter((resource) => resource.health_status === "Critical");
  const openAlerts = alerts.filter((alert) => alert.status === "open");
  const sortedByHealth = [...resources].sort(
    (a, b) => (a.health_score ?? 100) - (b.health_score ?? 100),
  );
  const estateHealthScore = resources.length
    ? Math.round(
        resources.reduce((total, resource) => total + (resource.health_score ?? 0), 0) /
          resources.length,
      )
    : 0;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <MetricCard
        icon={getCategoryIcon("inventory")}
        label="Total Resources"
        value={resources.length}
        helper="Across all providers"
        onClick={() => onMetricClick?.("total-resources")}
        tooltipItems={resources.map(resourceSummary)}
        tooltipTitle="All resources"
      />
      <MetricCard
        icon={ShieldCheck}
        label="Healthy Resources"
        value={healthyResourceItems.length}
        helper="No active risk signals"
        onClick={() => onMetricClick?.("healthy-resources")}
        tone="success"
        tooltipItems={healthyResourceItems.map(resourceSummary)}
        tooltipTitle="Healthy resources"
      />
      <MetricCard
        icon={Activity}
        label="Warning Resources"
        value={warningResourceItems.length}
        helper="Degraded or watchlisted"
        onClick={() => onMetricClick?.("warning-resources")}
        tone="warning"
        tooltipItems={warningResourceItems.map(resourceSummary)}
        tooltipTitle="Warning resources"
      />
      <MetricCard
        icon={AlertTriangle}
        label="Critical Resources"
        value={criticalResourceItems.length}
        helper="Needs operator action"
        onClick={() => onMetricClick?.("critical-resources")}
        tone="danger"
        tooltipItems={criticalResourceItems.map(resourceSummary)}
        tooltipTitle="Critical resources"
      />
      <MetricCard
        icon={Bell}
        label="Open Alerts"
        value={summary.open_alerts}
        helper={`${summary.critical_alerts} critical / ${summary.warning_alerts} warning`}
        onClick={() => onMetricClick?.("open-alerts")}
        tone={summary.critical_alerts > 0 ? "danger" : summary.warning_alerts > 0 ? "warning" : undefined}
        tooltipItems={openAlerts.map((alert) => `${alert.severity}: ${alert.title}`)}
        tooltipTitle="Open alerts"
      />
      <MetricCard
        icon={Gauge}
        label="Estate Health Score"
        value={`${estateHealthScore}`}
        helper="Average resource health"
        onClick={() => onMetricClick?.("estate-health-score")}
        tone={estateHealthScore >= 80 ? "success" : estateHealthScore >= 50 ? "warning" : "danger"}
        tooltipItems={sortedByHealth.map((resource) => `${resource.health_score ?? "n/a"} - ${resource.name}`)}
        tooltipTitle="Lowest health scores"
      />
    </section>
  );
}

function resourceSummary(resource: Resource) {
  return `${resource.name} - ${resource.health_status ?? resource.status} (${resource.health_score ?? "n/a"})`;
}

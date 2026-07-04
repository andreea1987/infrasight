import { ArrowLeft, Bot, Gauge, Link2, ListChecks, Server } from "lucide-react";

import { getAlertsForResource } from "@/dashboard/health";
import { AlertStream } from "@/components/dashboard/alert-stream";
import { EmptyState } from "@/components/dashboard/empty-state";
import { InfoTile } from "@/components/dashboard/info-tile";
import { ResourceTable } from "@/components/dashboard/resource-table";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platformLabel, providerLabel, resourceTypeLabel } from "@/dashboard/resourceClassification";
import type { AlertRecord, MetricSample, Resource } from "@/types/infrasight";

/**
 * Shows a read-only operational detail view for one infrastructure resource.
 *
 * Inputs:
 * - resource: selected resource from inventory/topology/infrastructure pages
 * - alerts and metrics: workspace-scoped telemetry used for current health
 * - resources: inventory used to derive related resources
 *
 * Output:
 * - metadata, health, alerts, recent events, metrics, related resources and OpenClaw context
 */
export function ResourceDetailsPage({
  alerts,
  metrics,
  onBack,
  onSelectResource,
  resource,
  resources,
}: {
  alerts: AlertRecord[];
  metrics: MetricSample[];
  onBack: () => void;
  onSelectResource: (resource: Resource) => void;
  resource: Resource;
  resources: Resource[];
}) {
  const activeAlerts = getAlertsForResource(resource, alerts).filter(
    (alert) => alert.status !== "resolved",
  );
  const recentEvents = getAlertsForResource(resource, alerts).slice(0, 6);
  const resourceMetrics = metrics
    .filter((metric) => String(metric.resource_id) === String(resource.id))
    .slice(0, 8);
  const relatedResources = resources
    .filter(
      (item) =>
        item.id !== resource.id &&
        (item.provider === resource.provider ||
          item.region === resource.region ||
          item.resource_type === resource.resource_type),
    )
    .slice(0, 5);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={resource.health_status ?? "Unknown"} />
          <span className="text-sm text-muted-foreground">
            Health score {resource.health_score ?? "n/a"}
          </span>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="console-line">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-3.5 text-primary" />
              Metadata
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              ["Name", resource.name],
              ["Provider", providerLabel(resource)],
              ["Resource Type", resourceTypeLabel(resource)],
              ["Platform", platformLabel(resource)],
              ["Region", resource.region],
              ["Status", resource.status],
              ["Private IP", resource.private_ip ?? "n/a"],
              ["Resource ID", resource.resource_id ?? resource.id],
              ["Monitoring", resource.monitoring_status ?? "monitored"],
            ].map(([label, value]) => (
              <InfoTile key={label}>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                <p className="mt-1 break-words text-sm font-medium">{value}</p>
              </InfoTile>
            ))}
          </CardContent>
        </Card>

        <Card className="console-line">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="size-3.5 text-primary" />
              Current Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-end justify-between gap-3">
                <span className="text-5xl font-bold tracking-tight">{resource.health_score ?? 0}</span>
                <SeverityBadge severity={resource.health_status ?? "Unknown"} />
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${resource.health_score ?? 0}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Score reflects active alerts, resource availability, monitoring status, and critical event pressure.
            </p>
          </CardContent>
        </Card>
      </section>

      <AlertStream alerts={activeAlerts} title="Active Alerts" />

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="console-line">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-3.5 text-primary" />
              Recent Events
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {recentEvents.map((event) => (
              <InfoTile key={event.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{event.title}</p>
                  <SeverityBadge severity={event.severity} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.source} - {event.status}
                </p>
              </InfoTile>
            ))}
            {recentEvents.length === 0 && <EmptyState text="No recent events for this resource." />}
          </CardContent>
        </Card>

        <Card className="console-line">
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {resourceMetrics.map((metric) => (
              <InfoTile
                key={metric.id}
                className="grid grid-cols-[1fr_auto] gap-3"
              >
                <span className="text-sm font-medium">{metric.metric_name}</span>
                <span className="text-sm text-muted-foreground">
                  {metric.value} {metric.unit}
                </span>
              </InfoTile>
            ))}
            {resourceMetrics.length === 0 && <EmptyState text="No metrics collected for this resource." />}
          </CardContent>
        </Card>
      </section>

      <Card className="console-line">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-3.5 text-primary" />
            Related Resources
          </CardTitle>
        </CardHeader>
        <CardContent>
          {relatedResources.length ? (
            <ResourceTable onSelectResource={onSelectResource} resources={relatedResources} />
          ) : (
            <EmptyState text="No related resources found." />
          )}
        </CardContent>
      </Card>

      <Card className="console-line">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-3.5 text-primary" />
            OpenClaw Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            OpenClaw sees {resource.name} as {resource.health_status ?? "Unknown"} with a
            health score of {resource.health_score ?? "n/a"}. There are {activeAlerts.length}
            active alerts, monitoring is {resource.monitoring_status ?? "monitored"}, and the
            current operating status is {resource.status}. Prioritize this resource when the
            health state is Critical or active critical alerts are present.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

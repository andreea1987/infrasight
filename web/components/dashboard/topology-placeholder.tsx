import { createElement } from "react";
import { AlertTriangle, GitBranch, Network, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TechnologyIcon, getCategoryIcon } from "@/dashboard/resourceIcons";
import type { AlertRecord, Resource, ResourceMetadataValue } from "@/types/infrasight";

type TopologyRelationship = {
  source: string;
  target: string;
  type: string;
  inferred: boolean;
};

/**
 * Dashboard topology summary.
 *
 * Inputs:
 * - resources and alerts from the active workspace snapshot
 *
 * Output:
 * - compact operational topology metrics and an entry point to the full map
 *
 * Important assumption:
 * - The dashboard should summarize dependency posture only; the dedicated
 *   Topology page owns the full graph visualization and node interactions.
 */
export function TopologyPlaceholder({
  alerts,
  onOpenTopology,
  resources,
}: {
  alerts: AlertRecord[];
  onOpenTopology?: () => void;
  resources: Resource[];
}) {
  const relationships = buildRelationships(resources);
  const relatedIds = new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]));
  const groups = buildTopologyGroups(resources);
  const typeBreakdown = buildTypeBreakdown(resources);
  const healthSummary = buildHealthSummary(resources);
  const criticalDependencies = countCriticalDependencies(resources, alerts, relationships);
  const coverage = resources.length ? Math.round((relatedIds.size / resources.length) * 100) : 0;
  const recentChanges = buildRecentTopologyChanges(resources, alerts, relationships);

  return (
    <Card className="console-line">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Network className="size-4 text-primary" />
            Topology Summary
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Dependency posture for the active workspace.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onOpenTopology}>
          <GitBranch className="size-4" />
          Open Topology
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr_1fr]">
        <section className="grid gap-3 sm:grid-cols-2">
          <TopologyStat label="Total Resources" value={resources.length} icon="inventory" />
          <TopologyStat label="Relationships" value={relationships.length} icon="topology" />
          <TopologyStat label="Topology Groups" value={groups.length} icon="cluster" />
          <TopologyStat
            danger={criticalDependencies > 0}
            label="Critical Dependencies"
            value={criticalDependencies}
            icon="alert"
          />
          <div className="rounded-md border border-border bg-background/60 p-3 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Dependency Coverage
                </span>
              </div>
              <span className="text-lg font-semibold">{coverage}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${coverage}%` }}
              />
            </div>
          </div>
        </section>

        <section className="rounded-md border border-border bg-background/60 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Resource Type Breakdown
          </p>
          <div className="space-y-2">
            {typeBreakdown.map((item) => (
              <div key={item.type} className="flex items-center gap-2">
                <TechnologyIcon name={item.type} surface="tooltip" />
                <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                <span className="text-sm font-semibold">{item.count}</span>
              </div>
            ))}
            {typeBreakdown.length === 0 && (
              <p className="text-sm text-muted-foreground">No resources discovered yet.</p>
            )}
          </div>
        </section>

        <section className="grid gap-3">
          <div className="rounded-md border border-border bg-background/60 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Health Summary
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <HealthChip label="Healthy" value={healthSummary.healthy} tone="success" />
              <HealthChip label="Warning" value={healthSummary.warning} tone="warning" />
              <HealthChip label="Critical" value={healthSummary.critical} tone="danger" />
            </div>
          </div>

          <div className="rounded-md border border-border bg-background/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Recent Topology Changes
            </p>
            <div className="space-y-2">
              {recentChanges.map((change) => (
                <div key={change} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{change}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function TopologyStat({
  danger,
  icon,
  label,
  value,
}: {
  danger?: boolean;
  icon: string;
  label: string;
  value: number;
}) {
  const Icon = danger ? AlertTriangle : getCategoryIcon(icon);
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-3">
        {createElement(Icon, {
          className: danger ? "size-5 text-destructive" : "size-5 text-primary",
        })}
        <span className={danger ? "text-xl font-semibold text-destructive" : "text-xl font-semibold"}>
          {value}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function HealthChip({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "success" | "warning" | "danger";
  value: number;
}) {
  const toneClass = {
    danger: "text-destructive",
    success: "text-primary",
    warning: "text-warning",
  }[tone];
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2 py-2">
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function buildRelationships(resources: Resource[]) {
  const relationships: TopologyRelationship[] = [];
  const byName = new Map(resources.map((resource) => [resource.name.toLowerCase(), resource]));

  for (const resource of resources) {
    for (const relationship of metadataRelationships(resource)) {
      relationships.push({
        source: String(resource.id),
        target: relationship.target,
        type: relationship.type,
        inferred: false,
      });
    }

    const host = stringMetadata(resource, ["host", "hostname", "node", "server"]);
    if (host && byName.has(host.toLowerCase())) {
      relationships.push({
        source: String(byName.get(host.toLowerCase())?.id),
        target: String(resource.id),
        type: "hosts",
        inferred: true,
      });
    }

    const app = stringMetadata(resource, ["app", "application", "service", "workload"]);
    if (app) {
      const peers = resources.filter((peer) => peer.id !== resource.id && stringMetadata(peer, ["app", "application", "service", "workload"]) === app);
      for (const peer of peers.slice(0, 2)) {
        relationships.push({
          source: String(resource.id),
          target: String(peer.id),
          type: "same application",
          inferred: true,
        });
      }
    }
  }

  const unique = new Map<string, TopologyRelationship>();
  for (const relationship of relationships) {
    if (!relationship.source || !relationship.target || relationship.source === relationship.target) continue;
    unique.set(`${relationship.source}:${relationship.target}:${relationship.type}`, relationship);
  }
  return [...unique.values()];
}

function buildTopologyGroups(resources: Resource[]) {
  return [
    ...new Set(
      resources
        .map((resource) =>
          stringMetadata(resource, ["topology_group", "group", "resource_group", "app", "application", "namespace"]) ||
          `${resource.provider}:${resource.region}`,
        )
        .filter(Boolean),
    ),
  ];
}

function buildTypeBreakdown(resources: Resource[]) {
  const counts = new Map<string, number>();
  for (const resource of resources) {
    const type = resource.resource_type || "resource";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count]) => ({ type, count, label: labelForType(type) }));
}

function buildHealthSummary(resources: Resource[]) {
  return {
    critical: resources.filter((resource) => resource.health_status === "Critical").length,
    healthy: resources.filter((resource) => resource.health_status === "Healthy").length,
    warning: resources.filter((resource) => resource.health_status === "Warning").length,
  };
}

function countCriticalDependencies(
  resources: Resource[],
  alerts: AlertRecord[],
  relationships: TopologyRelationship[],
) {
  const related = new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]));
  const criticalAlertResourceIds = new Set(
    alerts
      .filter((alert) => alert.status === "open" && alert.severity.toLowerCase() === "critical")
      .map((alert) => String(alert.resource_id)),
  );
  return resources.filter(
    (resource) =>
      related.has(String(resource.id)) &&
      (resource.health_status === "Critical" || criticalAlertResourceIds.has(String(resource.id))),
  ).length;
}

function buildRecentTopologyChanges(
  resources: Resource[],
  alerts: AlertRecord[],
  relationships: TopologyRelationship[],
) {
  const changes = [
    `${relationships.filter((relationship) => !relationship.inferred).length} discovered relationships tracked`,
    `${relationships.filter((relationship) => relationship.inferred).length} inferred relationships available`,
  ];

  const latestResource = resources
    .filter((resource) => stringMetadata(resource, ["created_at", "discovered_at", "updated_at"]))
    .sort((a, b) => Date.parse(stringMetadata(b, ["created_at", "discovered_at", "updated_at"])) - Date.parse(stringMetadata(a, ["created_at", "discovered_at", "updated_at"])))[0];
  if (latestResource) changes.unshift(`${latestResource.name} topology metadata changed`);

  const criticalAlert = alerts.find((alert) => alert.status === "open" && alert.severity.toLowerCase() === "critical");
  if (criticalAlert) changes.unshift(`Critical dependency signal: ${criticalAlert.title}`);

  if (!resources.length) return ["No resources discovered yet", "Run discovery to populate topology coverage"];
  return changes.slice(0, 4);
}

function metadataRelationships(resource: Resource) {
  const value = resource.metadata?.relationships;
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      return {
        target: String(item.target_ref ?? item.target ?? ""),
        type: String(item.relationship_type ?? item.type ?? "related to"),
      };
    })
    .filter((item): item is { target: string; type: string } => Boolean(item?.target));
}

function stringMetadata(resource: Resource, keys: string[]) {
  for (const key of keys) {
    const value = resource.metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function isRecord(value: ResourceMetadataValue): value is Record<string, ResourceMetadataValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function labelForType(type: string) {
  return type.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

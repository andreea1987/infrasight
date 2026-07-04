import { useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import {
  DashboardTable,
  DashboardTableCell,
  DashboardTableHeader,
  DashboardTableRow,
} from "@/components/dashboard/dashboard-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { IconText, ProviderBadge, ResourceName } from "@/components/dashboard/resource-badges";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { ActionBanner, type ActionResult } from "@/components/ui/action-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ControlToolbar, FilterGrid, SearchField } from "@/components/ui/controls";
import { Select } from "@/components/ui/select";
import { getAlertsForResource } from "@/dashboard/health";
import {
  HEALTH_OPTIONS,
  OPERATING_SYSTEM_OPTIONS,
  PLATFORM_OPTIONS,
  PROVIDER_OPTIONS,
  RESOURCE_TYPE_OPTIONS,
  STATUS_OPTIONS,
  healthLabel,
  labelFor,
  operatingSystemLabel,
  providerConfig,
  resourceHealth,
  resourceOperatingSystem,
  resourcePlatform,
  resourceProvider,
  resourceStatus,
  resourceType,
  resourceTypeLabel,
  supportedProviderValues,
} from "@/dashboard/resourceClassification";
import { TechnologyIcon } from "@/dashboard/resourceIcons";
import type { AlertRecord, MetricSample, Resource } from "@/types/infrasight";

type ResourceKind = "servers" | "containers" | "kubernetes";
type DiscoveryAction = { label: string; path?: string; discoveryTypes?: string[] };

export function InfrastructureResourcePage({
  alerts,
  busy,
  discoveryActions,
  kind,
  metrics,
  onRunAction,
  onRunDiscovery,
  onSelectResource,
  resources,
  title,
}: {
  alerts: AlertRecord[];
  busy: boolean;
  discoveryActions: DiscoveryAction[];
  kind: ResourceKind;
  metrics: MetricSample[];
  onRunAction: (path: string) => Promise<void>;
  onRunDiscovery?: (discoveryTypes: string[]) => Promise<void>;
  onSelectResource: (resource: Resource) => void;
  resources: Resource[];
  title: string;
}) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [health, setHealth] = useState("all");
  const [os, setOs] = useState("all");
  // runningLabel: which discovery button is currently in flight
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const providerOptions = useMemo(() => ["all", ...supportedProviderValues()], []);
  const providerCounts = useMemo(
    () => countValues(resources.map(resourceProvider)),
    [resources],
  );
  const selectedProvider = providerConfig(provider);
  const providerEmptyState =
    provider !== "all" && (providerCounts[provider] ?? 0) === 0 && selectedProvider
      ? selectedProvider
      : null;

  // Filtering stays client-side over the already-loaded inventory snapshot so
  // these infrastructure pages remain read-only and do not alter discovery data.
  const filteredResources = useMemo(() => {
    const lowerQuery = query.toLowerCase();

    return resources.filter((resource) => {
      const matchesQuery =
        !lowerQuery ||
        [resource.name, resource.resource_type, resource.region]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(lowerQuery));
      const matchesProvider = provider === "all" || resourceProvider(resource) === provider;
      const matchesResourceType = resourceTypeFilter === "all" || resourceType(resource) === resourceTypeFilter;
      const matchesPlatform = platform === "all" || resourcePlatform(resource) === platform;
      const matchesStatus = status === "all" || resourceStatus(resource) === status;
      const matchesHealth = health === "all" || resourceHealth(resource) === health;
      const matchesOs = kind !== "servers" || os === "all" || resourceOperatingSystem(resource) === os;
      return matchesQuery && matchesProvider && matchesResourceType && matchesPlatform && matchesStatus && matchesHealth && matchesOs;
    });
  }, [health, kind, os, platform, provider, query, resourceTypeFilter, resources, status]);

  // Discovery buttons live on the relevant infrastructure page now. Sync
  // endpoints keep their existing behavior, while typed discovery calls use the
  // shared /discovery/run service without mutating resources from the client.
  const runDiscoveryAction = async (action: DiscoveryAction) => {
    setRunningLabel(action.label);
    setActionResult(null);
    try {
      if (action.discoveryTypes) {
        await onRunDiscovery?.(action.discoveryTypes);
      } else if (action.path) {
        await onRunAction(action.path);
      }
      setActionResult({ ok: true, message: `${action.label} completed successfully.` });
    } catch {
      setActionResult({ ok: false, message: `${action.label} failed — check connectors and try again.` });
    } finally {
      setRunningLabel(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="console-line">
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>{title}</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Discovery actions are read-only inventory collection triggers for this infrastructure type.
              </p>
            </div>
            <ControlToolbar>
              {discoveryActions.map((action) => (
                <Button
                  disabled={busy || runningLabel !== null}
                  key={action.path ?? action.discoveryTypes?.join(",") ?? action.label}
                  onClick={() => void runDiscoveryAction(action)}
                  size="sm"
                  variant="secondary"
                >
                  {runningLabel === action.label ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {action.label}
                </Button>
              ))}
            </ControlToolbar>
          </div>
          {actionResult && (
            <ActionBanner result={actionResult} onDismiss={() => setActionResult(null)} />
          )}
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryCard("Total", resources.length, kind)}
          {summaryCard("Healthy", resources.filter((resource) => resourceHealth(resource) === "healthy").length, "health")}
          {summaryCard("Warning", resources.filter((resource) => resourceHealth(resource) === "warning").length, "alert")}
          {summaryCard("Critical", resources.filter((resource) => resourceHealth(resource) === "critical").length, "alert")}
        </CardContent>
      </Card>

      <Card className="console-line">
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>{title} Inventory</CardTitle>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setQuery("");
                setProvider("all");
                setResourceTypeFilter("all");
                setPlatform("all");
                setStatus("all");
                setHealth("all");
                setOs("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
          <FilterGrid>
            <SearchField placeholder={`Search ${title.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} />
            <Select value={provider} onChange={(event) => setProvider(event.target.value)}>
              {providerOptions.map((item) => (
                <option key={item} value={item}>{providerFilterLabel(item, providerCounts)}</option>
              ))}
            </Select>
            <Select value={resourceTypeFilter} onChange={(event) => setResourceTypeFilter(event.target.value)}>
              {["all", ...optionValues(RESOURCE_TYPE_OPTIONS)].map((item) => (
                <option key={item} value={item}>{item === "all" ? "All resource types" : labelFor(item, RESOURCE_TYPE_OPTIONS)}</option>
              ))}
            </Select>
            <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {["all", ...optionValues(PLATFORM_OPTIONS)].map((item) => (
                <option key={item} value={item}>{item === "all" ? "All platforms" : labelFor(item, PLATFORM_OPTIONS)}</option>
              ))}
            </Select>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {["all", ...optionValues(STATUS_OPTIONS)].map((item) => (
                <option key={item} value={item}>{item === "all" ? "All statuses" : labelFor(item, STATUS_OPTIONS)}</option>
              ))}
            </Select>
            <Select value={health} onChange={(event) => setHealth(event.target.value)}>
              {["all", ...optionValues(HEALTH_OPTIONS)].map((item) => (
                <option key={item} value={item}>{item === "all" ? "All health" : labelFor(item, HEALTH_OPTIONS)}</option>
              ))}
            </Select>
            {kind === "servers" && (
              <Select value={os} onChange={(event) => setOs(event.target.value)}>
                {["all", ...optionValues(OPERATING_SYSTEM_OPTIONS)].map((item) => (
                  <option key={item} value={item}>{item === "all" ? "All OS" : labelFor(item, OPERATING_SYSTEM_OPTIONS)}</option>
                ))}
              </Select>
            )}
          </FilterGrid>
        </CardHeader>
        <CardContent>
          {filteredResources.length ? (
            kind === "servers" ? (
              <ServerTable alerts={alerts} metrics={metrics} onSelectResource={onSelectResource} resources={filteredResources} />
            ) : kind === "containers" ? (
              <ContainerTable alerts={alerts} metrics={metrics} onSelectResource={onSelectResource} resources={filteredResources} />
            ) : (
              <KubernetesTable alerts={alerts} metrics={metrics} onSelectResource={onSelectResource} resources={filteredResources} />
            )
          ) : (
            <div className="space-y-3">
              <EmptyState text={providerEmptyState ? providerEmptyState.emptyState : `No ${title.toLowerCase()} match the current filters.`} />
              {providerEmptyState && (
                <Button
                  disabled={busy || runningLabel !== null || providerEmptyState.comingSoon || !providerEmptyState.actionPath}
                  onClick={() => void runDiscoveryAction({ label: providerEmptyState.actionLabel, path: providerEmptyState.actionPath })}
                  type="button"
                >
                  {providerEmptyState.actionLabel}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ServerTable({ alerts, metrics, onSelectResource, resources }: ResourceTableProps) {
  return (
    <DashboardTable minWidth="1180px">
        <DashboardTableHeader columns={["Server", "OS", "Provider", "Status", "Health", "CPU", "Memory", "Disk", "Services", "Logs", "Alerts", "Last Checked", { ariaLabel: "Server actions" }]} />
        <tbody>
          {resources.map((resource) => (
            <DashboardTableRow key={resource.id} onClick={() => onSelectResource(resource)}>
              <DashboardTableCell className="font-medium"><ResourceName resource={resource} /></DashboardTableCell>
              <DashboardTableCell muted><IconText iconName={resourceOperatingSystem(resource)} label={operatingSystemLabel(resource)} /></DashboardTableCell>
              <DashboardTableCell><ProviderBadge resource={resource} /></DashboardTableCell>
              <DashboardTableCell><SeverityBadge severity={labelFor(resourceStatus(resource), STATUS_OPTIONS)} /></DashboardTableCell>
              <DashboardTableCell><SeverityBadge severity={healthLabel(resource)} /></DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["cpu_percent", "cpu_count"])}</DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["memory_percent", "memory_gb"])}</DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["disk_used_percent", "disk_percent"])}</DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["services", "service_count"])}</DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["logs", "log_count"])}</DashboardTableCell>
              <DashboardTableCell muted>{openAlertCount(resource, alerts)}</DashboardTableCell>
              <DashboardTableCell muted>{lastChecked(resource, metrics)}</DashboardTableCell>
              <DetailsCell resource={resource} onSelectResource={onSelectResource} />
            </DashboardTableRow>
          ))}
        </tbody>
    </DashboardTable>
  );
}

function ContainerTable({ alerts, metrics, onSelectResource, resources }: ResourceTableProps) {
  return (
    <DashboardTable minWidth="1080px">
        <DashboardTableHeader columns={["Container", "Image", "Host", "Status", "Health", "CPU", "Memory", "Restarts", "Alerts", "Last Checked", { ariaLabel: "Container actions" }]} />
        <tbody>
          {resources.map((resource) => (
            <DashboardTableRow key={resource.id} onClick={() => onSelectResource(resource)}>
              <DashboardTableCell className="font-medium"><ResourceName resource={resource} /></DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["image", "container_image"])}</DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["host", "hostname", "node"])}</DashboardTableCell>
              <DashboardTableCell><SeverityBadge severity={labelFor(resourceStatus(resource), STATUS_OPTIONS)} /></DashboardTableCell>
              <DashboardTableCell><SeverityBadge severity={healthLabel(resource)} /></DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["cpu_percent"])}</DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["memory_percent", "memory_usage"])}</DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["restart_count", "restarts"])}</DashboardTableCell>
              <DashboardTableCell muted>{openAlertCount(resource, alerts)}</DashboardTableCell>
              <DashboardTableCell muted>{lastChecked(resource, metrics)}</DashboardTableCell>
              <DetailsCell resource={resource} onSelectResource={onSelectResource} />
            </DashboardTableRow>
          ))}
        </tbody>
    </DashboardTable>
  );
}

function KubernetesTable({ alerts, metrics, onSelectResource, resources }: ResourceTableProps) {
  return (
    <DashboardTable minWidth="1180px">
        <DashboardTableHeader columns={["Resource", "Kind", "Cluster", "Namespace", "Status", "Health", "Restarts", "Alerts", "Last Checked", { ariaLabel: "Kubernetes actions" }]} />
        <tbody>
          {resources.map((resource) => (
            <DashboardTableRow key={resource.id} onClick={() => onSelectResource(resource)}>
              <DashboardTableCell className="font-medium"><ResourceName resource={resource} /></DashboardTableCell>
              <DashboardTableCell muted><IconText iconName={resourceType(resource)} label={resourceTypeLabel(resource)} /></DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["cluster", "cluster_name"])}</DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["namespace"])}</DashboardTableCell>
              <DashboardTableCell><SeverityBadge severity={labelFor(resourceStatus(resource), STATUS_OPTIONS)} /></DashboardTableCell>
              <DashboardTableCell><SeverityBadge severity={healthLabel(resource)} /></DashboardTableCell>
              <DashboardTableCell muted>{metadataValue(resource, ["restart_count", "restarts"])}</DashboardTableCell>
              <DashboardTableCell muted>{openAlertCount(resource, alerts)}</DashboardTableCell>
              <DashboardTableCell muted>{lastChecked(resource, metrics)}</DashboardTableCell>
              <DetailsCell resource={resource} onSelectResource={onSelectResource} />
            </DashboardTableRow>
          ))}
        </tbody>
    </DashboardTable>
  );
}

type ResourceTableProps = {
  alerts: AlertRecord[];
  metrics: MetricSample[];
  onSelectResource: (resource: Resource) => void;
  resources: Resource[];
};

function DetailsCell({ onSelectResource, resource }: { onSelectResource: (resource: Resource) => void; resource: Resource }) {
  return (
    <DashboardTableCell align="right">
      <Button
        size="sm"
        variant="secondary"
        onClick={(event) => {
          event.stopPropagation();
          onSelectResource(resource);
        }}
      >
        Details
      </Button>
    </DashboardTableCell>
  );
}

function summaryCard(label: string, value: number, iconName: string) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-4">
      <TechnologyIcon className="mb-3 text-primary" name={iconName} surface="card" />
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function metadataValue(resource: Resource, keys: string[]) {
  for (const key of keys) {
    const value = resource.metadata?.[key];
    if (Array.isArray(value)) return value.length;
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "n/a";
}

function openAlertCount(resource: Resource, alerts: AlertRecord[]) {
  return getAlertsForResource(resource, alerts).filter((alert) => alert.status === "open").length;
}

function lastChecked(resource: Resource, metrics: MetricSample[]) {
  const metadataTime = resource.metadata?.last_checked ?? resource.metadata?.last_seen ?? resource.metadata?.updated_at;
  if (typeof metadataTime === "string") return formatDate(metadataTime);
  const latestMetric = metrics
    .filter((metric) => String(metric.resource_id) === String(resource.id))
    .sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime())[0];
  return latestMetric ? formatDate(latestMetric.collected_at) : "n/a";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short" });
}

function countValues(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    if (value) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function providerFilterLabel(item: string, providerCounts: Record<string, number>) {
  if (item === "all") return "All providers";
  const provider = providerConfig(item);
  const label = provider?.label ?? labelFor(item, PROVIDER_OPTIONS);
  if (provider?.comingSoon) return `${label} (Coming Soon)`;
  return `${label} (${providerCounts[item] ?? 0})`;
}

function optionValues(options: readonly { value: string }[]) {
  return options.map((option) => option.value);
}

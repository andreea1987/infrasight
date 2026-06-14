import { useMemo, useState, type ReactNode } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { ActionBanner, type ActionResult } from "@/components/ui/action-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getAlertsForResource } from "@/dashboard/health";
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
  const [status, setStatus] = useState("all");
  const [health, setHealth] = useState("all");
  const [os, setOs] = useState("all");
  // runningLabel: which discovery button is currently in flight
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

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
      const matchesProvider = provider === "all" || resource.provider === provider;
      const matchesStatus = status === "all" || resource.status === status;
      const matchesHealth = health === "all" || resource.health_status === health;
      const matchesOs = kind !== "servers" || os === "all" || getServerOs(resource) === os;
      return matchesQuery && matchesProvider && matchesStatus && matchesHealth && matchesOs;
    });
  }, [health, kind, os, provider, query, resources, status]);

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
            <div className="flex flex-wrap gap-2">
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
            </div>
          </div>
          {actionResult && (
            <ActionBanner result={actionResult} onDismiss={() => setActionResult(null)} />
          )}
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryCard("Total", resources.length, kind)}
          {summaryCard("Healthy", resources.filter((r) => r.health_status === "Healthy").length, "health")}
          {summaryCard("Warning", resources.filter((r) => r.health_status === "Warning").length, "alert")}
          {summaryCard("Critical", resources.filter((r) => r.health_status === "Critical").length, "alert")}
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
                setStatus("all");
                setHealth("all");
                setOs("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-9" placeholder={`Search ${title.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Select value={provider} onChange={(event) => setProvider(event.target.value)}>
              {["all", ...unique(resources.map((resource) => resource.provider))].map((item) => (
                <option key={item} value={item}>{item === "all" ? "All providers" : item}</option>
              ))}
            </Select>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {["all", ...unique(resources.map((resource) => resource.status))].map((item) => (
                <option key={item} value={item}>{item === "all" ? "All statuses" : item}</option>
              ))}
            </Select>
            <Select value={health} onChange={(event) => setHealth(event.target.value)}>
              {["all", "Healthy", "Warning", "Critical"].map((item) => (
                <option key={item} value={item}>{item === "all" ? "All health" : item}</option>
              ))}
            </Select>
            {kind === "servers" && (
              <Select value={os} onChange={(event) => setOs(event.target.value)}>
                {["all", ...unique(resources.map(getServerOs))].map((item) => (
                  <option key={item} value={item}>{item === "all" ? "All OS" : item}</option>
                ))}
              </Select>
            )}
          </div>
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
            <EmptyState text={`No ${title.toLowerCase()} match the current filters.`} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ServerTable({ alerts, metrics, onSelectResource, resources }: ResourceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
        <thead>{header(["Server", "OS", "Provider", "Status", "Health", "CPU", "Memory", "Disk", "Services", "Logs", "Alerts", "Last Checked", ""])}</thead>
        <tbody>
          {resources.map((resource) => (
            <ClickableRow key={resource.id} onClick={() => onSelectResource(resource)}>
              <td className="px-3 py-3 font-medium"><ResourceName resource={resource} /></td>
              <td className="px-3 py-3 text-muted-foreground"><IconText iconName={getServerOs(resource)} label={getServerOs(resource)} /></td>
              <td className="px-3 py-3"><ProviderBadge provider={resource.provider} /></td>
              <td className="px-3 py-3"><SeverityBadge severity={resource.status} /></td>
              <td className="px-3 py-3"><SeverityBadge severity={resource.health_status ?? "Unknown"} /></td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["cpu_percent", "cpu_count"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["memory_percent", "memory_gb"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["disk_used_percent", "disk_percent"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["services", "service_count"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["logs", "log_count"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{openAlertCount(resource, alerts)}</td>
              <td className="px-3 py-3 text-muted-foreground">{lastChecked(resource, metrics)}</td>
              <DetailsCell resource={resource} onSelectResource={onSelectResource} />
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContainerTable({ alerts, metrics, onSelectResource, resources }: ResourceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
        <thead>{header(["Container", "Image", "Host", "Status", "Health", "CPU", "Memory", "Restarts", "Alerts", "Last Checked", ""])}</thead>
        <tbody>
          {resources.map((resource) => (
            <ClickableRow key={resource.id} onClick={() => onSelectResource(resource)}>
              <td className="px-3 py-3 font-medium"><ResourceName resource={resource} iconName="docker" /></td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["image", "container_image"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["host", "hostname", "node"])}</td>
              <td className="px-3 py-3"><SeverityBadge severity={resource.status} /></td>
              <td className="px-3 py-3"><SeverityBadge severity={resource.health_status ?? "Unknown"} /></td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["cpu_percent"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["memory_percent", "memory_usage"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["restart_count", "restarts"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{openAlertCount(resource, alerts)}</td>
              <td className="px-3 py-3 text-muted-foreground">{lastChecked(resource, metrics)}</td>
              <DetailsCell resource={resource} onSelectResource={onSelectResource} />
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KubernetesTable({ alerts, metrics, onSelectResource, resources }: ResourceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
        <thead>{header(["Resource", "Kind", "Cluster", "Namespace", "Status", "Health", "Restarts", "Alerts", "Last Checked", ""])}</thead>
        <tbody>
          {resources.map((resource) => (
            <ClickableRow key={resource.id} onClick={() => onSelectResource(resource)}>
              <td className="px-3 py-3 font-medium"><ResourceName resource={resource} iconName="kubernetes" /></td>
              <td className="px-3 py-3 text-muted-foreground"><IconText iconName={resource.resource_type} label={resource.resource_type} /></td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["cluster", "cluster_name"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["namespace"])}</td>
              <td className="px-3 py-3"><SeverityBadge severity={resource.status} /></td>
              <td className="px-3 py-3"><SeverityBadge severity={resource.health_status ?? "Unknown"} /></td>
              <td className="px-3 py-3 text-muted-foreground">{metadataValue(resource, ["restart_count", "restarts"])}</td>
              <td className="px-3 py-3 text-muted-foreground">{openAlertCount(resource, alerts)}</td>
              <td className="px-3 py-3 text-muted-foreground">{lastChecked(resource, metrics)}</td>
              <DetailsCell resource={resource} onSelectResource={onSelectResource} />
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ResourceTableProps = {
  alerts: AlertRecord[];
  metrics: MetricSample[];
  onSelectResource: (resource: Resource) => void;
  resources: Resource[];
};

function ClickableRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <tr className="cursor-pointer border-b border-border/70 transition-colors hover:bg-muted/30" onClick={onClick}>
      {children}
    </tr>
  );
}

function DetailsCell({ onSelectResource, resource }: { onSelectResource: (resource: Resource) => void; resource: Resource }) {
  return (
    <td className="px-3 py-3 text-right">
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
    </td>
  );
}

function header(labels: string[]) {
  return (
    <tr className="border-b border-border text-xs uppercase tracking-[0.16em] text-muted-foreground">
      {labels.map((label) => <th className="px-3 py-3" key={label}>{label}</th>)}
    </tr>
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

function ResourceName({ iconName, resource }: { iconName?: string; resource: Resource }) {
  return (
    <span className="flex items-center gap-2">
      <TechnologyIcon name={iconName ?? resource.resource_type ?? resource.provider} surface="table" />
      {resource.name}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <Badge className="inline-flex items-center gap-1.5">
      <TechnologyIcon name={provider} surface="table" />
      {provider}
    </Badge>
  );
}

function IconText({ iconName, label }: { iconName: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <TechnologyIcon name={iconName} surface="table" />
      {label}
    </span>
  );
}

function getServerOs(resource: Resource) {
  const text = `${resource.resource_type} ${resource.provider} ${String(resource.metadata?.os ?? resource.metadata?.platform ?? "")}`.toLowerCase();
  if (text.includes("windows") || text.includes("winrm")) return "windows";
  if (text.includes("linux") || text.includes("ec2") || text.includes("local_host")) return "linux";
  return "unknown";
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

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))].sort();
}

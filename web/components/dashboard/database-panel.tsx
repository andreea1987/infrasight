import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Bot,
  Database,
  Gauge,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import {
  DashboardTable,
  DashboardTableCell,
  DashboardTableHeader,
  DashboardTableRow,
} from "@/components/dashboard/dashboard-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { InfoTile } from "@/components/dashboard/info-tile";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ProviderBadge } from "@/components/dashboard/resource-badges";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ControlToolbar, FilterGrid, SearchField } from "@/components/ui/controls";
import { Select } from "@/components/ui/select";
import { getAlertsForResource } from "@/dashboard/health";
import { TechnologyIcon } from "@/dashboard/resourceIcons";
import type { AlertRecord, MetricSample, Resource } from "@/types/infrasight";

type DatabaseSort = "health_score" | "status" | "provider";

export function DatabasePanel({
  alerts,
  busy = false,
  metrics,
  onRunDiscovery,
  resources,
}: {
  alerts: AlertRecord[];
  busy?: boolean;
  metrics: MetricSample[];
  onRunDiscovery?: (discoveryTypes: string[]) => Promise<void>;
  resources: Resource[];
}) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const [health, setHealth] = useState("all");
  const [region, setRegion] = useState("all");
  const [sortBy, setSortBy] = useState<DatabaseSort>("health_score");
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<Resource["id"] | null>(null);

  const selectedDatabase = resources.find((resource) => resource.id === selectedDatabaseId);

  const openDatabaseAlerts = resources.flatMap((resource) =>
    getAlertsForResource(resource, alerts).filter((alert) => alert.status === "open"),
  );
  const averageHealth = resources.length
    ? Math.round(resources.reduce((total, resource) => total + (resource.health_score ?? 0), 0) / resources.length)
    : 0;

  // Filtering and sorting are computed client-side from the already-loaded
  // inventory snapshot so the database page stays read-only and backend-neutral.
  const filteredDatabases = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    const rows = resources.filter((resource) => {
      const matchesQuery = !lowerQuery || resource.name.toLowerCase().includes(lowerQuery);
      const matchesProvider = provider === "all" || resource.provider === provider;
      const matchesStatus = status === "all" || resource.status === status;
      const matchesHealth = health === "all" || resource.health_status === health;
      const matchesRegion = region === "all" || resource.region === region;
      return matchesQuery && matchesProvider && matchesStatus && matchesHealth && matchesRegion;
    });

    return rows.sort((a, b) => {
      if (sortBy === "health_score") return (a.health_score ?? 100) - (b.health_score ?? 100);
      if (sortBy === "status") return a.status.localeCompare(b.status);
      return a.provider.localeCompare(b.provider);
    });
  }, [health, provider, query, region, resources, sortBy, status]);

  const resetFilters = () => {
    setQuery("");
    setProvider("all");
    setStatus("all");
    setHealth("all");
    setRegion("all");
    setSortBy("health_score");
  };

  if (selectedDatabase) {
    return (
      <DatabaseDetailsView
        alerts={alerts}
        database={selectedDatabase}
        metrics={metrics}
        onBack={() => setSelectedDatabaseId(null)}
      />
    );
  }

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          icon={Database}
          label="Total Databases"
          value={resources.length}
          helper="Database resources"
          tooltipItems={resources.map(databasePreview)}
          tooltipTitle="Databases"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Healthy Databases"
          value={resources.filter((resource) => resource.health_status === "Healthy").length}
          helper="No active risk signals"
          tone="success"
          tooltipItems={resources.filter((resource) => resource.health_status === "Healthy").map(databasePreview)}
          tooltipTitle="Healthy databases"
        />
        <MetricCard
          icon={Activity}
          label="Warning Databases"
          value={resources.filter((resource) => resource.health_status === "Warning").length}
          helper="Needs review"
          tone="warning"
          tooltipItems={resources.filter((resource) => resource.health_status === "Warning").map(databasePreview)}
          tooltipTitle="Warning databases"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Critical Databases"
          value={resources.filter((resource) => resource.health_status === "Critical").length}
          helper="Needs operator action"
          tone="danger"
          tooltipItems={resources.filter((resource) => resource.health_status === "Critical").map(databasePreview)}
          tooltipTitle="Critical databases"
        />
        <MetricCard
          icon={Bell}
          label="Open Database Alerts"
          value={openDatabaseAlerts.length}
          helper="Active database alerts"
          tone={openDatabaseAlerts.some((alert) => alert.severity === "critical") ? "danger" : openDatabaseAlerts.length ? "warning" : undefined}
          tooltipItems={openDatabaseAlerts.map((alert) => `${alert.severity}: ${alert.title}`)}
          tooltipTitle="Open database alerts"
        />
        <MetricCard
          icon={Gauge}
          label="Average Database Health Score"
          value={averageHealth}
          helper="Mean database score"
          tone={averageHealth >= 80 ? "success" : averageHealth >= 50 ? "warning" : "danger"}
          tooltipItems={[...resources]
            .sort((a, b) => (a.health_score ?? 100) - (b.health_score ?? 100))
            .map((resource) => `${resource.health_score ?? "n/a"} - ${resource.name}`)}
          tooltipTitle="Lowest database scores"
        />
      </section>

      <Card className="console-line">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Database Discovery</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              SQL Server and PostgreSQL discovery stays read-only and uses the shared discovery service.
            </p>
          </div>
          <ControlToolbar>
            {[
              { label: "Discover SQL Server", discoveryTypes: ["mssql"] },
              { label: "Discover PostgreSQL", discoveryTypes: ["postgresql"] },
            ].map((action) => (
              <Button
                disabled={busy || !onRunDiscovery}
                key={action.label}
                onClick={() => onRunDiscovery?.(action.discoveryTypes)}
                size="sm"
                variant="secondary"
              >
                <RefreshCw className="size-4" />
                {action.label}
              </Button>
            ))}
          </ControlToolbar>
        </CardHeader>
      </Card>

      <Card className="console-line">
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Database Estate</CardTitle>
            <Button size="sm" variant="secondary" onClick={resetFilters}>
              <SlidersHorizontal className="size-4" />
              Reset Filters
            </Button>
          </div>
          <FilterGrid>
            <SearchField
              className="xl:col-span-2"
              placeholder="Search database name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
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
            <Select value={region} onChange={(event) => setRegion(event.target.value)}>
              {["all", ...unique(resources.map((resource) => resource.region))].map((item) => (
                <option key={item} value={item}>{item === "all" ? "All regions" : item}</option>
              ))}
            </Select>
          </FilterGrid>
          <ControlToolbar>
            <span className="text-xs text-muted-foreground">Sort by</span>
            <Select value={sortBy} onChange={(event) => setSortBy(event.target.value as DatabaseSort)}>
              <option value="health_score">Health score</option>
              <option value="status">Status</option>
              <option value="provider">Provider</option>
            </Select>
          </ControlToolbar>
        </CardHeader>
        <CardContent>
          {filteredDatabases.length ? (
            <DatabaseTable
              alerts={alerts}
              metrics={metrics}
              onSelectDatabase={setSelectedDatabaseId}
              resources={filteredDatabases}
            />
          ) : (
            <EmptyState text="No databases match the current filters." />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function DatabaseTable({
  alerts,
  metrics,
  onSelectDatabase,
  resources,
}: {
  alerts: AlertRecord[];
  metrics: MetricSample[];
  onSelectDatabase: (id: Resource["id"]) => void;
  resources: Resource[];
}) {
  return (
    <DashboardTable minWidth="1180px">
        <DashboardTableHeader columns={["Database", "Provider", "Status", "Health", "Score", "Region", "Open Alerts", "Last Checked", "Connection", { ariaLabel: "Database actions" }]} />
        <tbody>
          {resources.map((resource) => {
            const activeAlerts = getAlertsForResource(resource, alerts).filter((alert) => alert.status === "open");
            return (
              <DashboardTableRow
                key={resource.id}
                onClick={() => onSelectDatabase(resource.id)}
              >
                <DashboardTableCell>
                  <div className="flex items-center gap-2 font-medium">
                    <TechnologyIcon name={resource.resource_type || resource.provider} surface="table" />
                    {resource.name}
                  </div>
                  <div className="ml-6 text-xs text-muted-foreground">{resource.resource_type}</div>
                </DashboardTableCell>
                <DashboardTableCell>
                  <ProviderBadge provider={resource.provider} />
                </DashboardTableCell>
                <DashboardTableCell><SeverityBadge severity={resource.status} /></DashboardTableCell>
                <DashboardTableCell><SeverityBadge severity={resource.health_status ?? "Unknown"} /></DashboardTableCell>
                <DashboardTableCell className="font-medium">{resource.health_score ?? "n/a"}</DashboardTableCell>
                <DashboardTableCell muted>{resource.region}</DashboardTableCell>
                <DashboardTableCell muted>{activeAlerts.length}</DashboardTableCell>
                <DashboardTableCell muted>{lastChecked(resource, metrics)}</DashboardTableCell>
                <DashboardTableCell>
                  <SeverityBadge severity={connectionStatus(resource)} />
                </DashboardTableCell>
                <DashboardTableCell align="right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectDatabase(resource.id);
                    }}
                  >
                    Details
                  </Button>
                </DashboardTableCell>
              </DashboardTableRow>
            );
          })}
        </tbody>
    </DashboardTable>
  );
}

export function DatabaseDetailsView({
  alerts,
  database,
  metrics,
  onBack,
}: {
  alerts: AlertRecord[];
  database: Resource;
  metrics: MetricSample[];
  onBack: () => void;
}) {
  const activeAlerts = getAlertsForResource(database, alerts).filter((alert) => alert.status === "open");
  const recentEvents = getAlertsForResource(database, alerts).slice(0, 8);
  const databaseMetrics = metrics.filter((metric) => String(metric.resource_id) === String(database.id));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <TechnologyIcon name={database.resource_type || database.provider} surface="card" />
          <SeverityBadge severity={database.health_status ?? "Unknown"} />
          <span className="text-sm text-muted-foreground">Health score {database.health_score ?? "n/a"}</span>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card className="console-line">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              ["Name", database.name],
              ["Provider", database.provider],
              ["Type", database.resource_type],
              ["Region", database.region],
              ["Status", database.status],
              ["Connection", connectionStatus(database)],
              ["Last checked", lastChecked(database, metrics)],
              ["Resource ID", database.resource_id ?? database.id],
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
              Current Health Score
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <span className="text-5xl font-bold tracking-tight">{database.health_score ?? 0}</span>
              <SeverityBadge severity={database.health_status ?? "Unknown"} />
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${database.health_score ?? 0}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">
              {/* Health display logic mirrors the estate score: alerts, availability, monitoring, and critical events all reduce confidence. */}
              Database health is derived from active alerts, availability status, monitoring state, and critical event pressure.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SignalCard title="Active Alerts" emptyText="No active database alerts.">
          {activeAlerts.map((alert) => (
            <EventRow key={alert.id} title={alert.title} meta={`${alert.source} - ${alert.status}`} severity={alert.severity} />
          ))}
        </SignalCard>
        <SignalCard title="Recent Database Events" emptyText="No recent database events collected.">
          {recentEvents.map((event) => (
            <EventRow key={event.id} title={event.title} meta={`${event.source} - ${event.status}`} severity={event.severity} />
          ))}
        </SignalCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SignalCard title="Key Metrics" emptyText="No database metrics collected.">
          {databaseMetrics.slice(0, 10).map((metric) => (
            <MetricRow key={metric.id} label={metric.metric_name} value={`${metric.value} ${metric.unit}`} />
          ))}
        </SignalCard>
        <SignalCard title="CPU, Memory, Storage" emptyText="No capacity metrics collected.">
          <MetricRow label="CPU" value={valueFrom(database, databaseMetrics, ["cpu_percent", "cpu_count"])} />
          <MetricRow label="Memory" value={valueFrom(database, databaseMetrics, ["memory_percent", "memory_gb", "memory_total_gb"])} />
          <MetricRow label="Storage" value={valueFrom(database, databaseMetrics, ["storage_used_percent", "disk_used_percent", "size_gb"])} />
        </SignalCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <SignalCard title="Failed Jobs" emptyText="No failed job data collected.">
          {asList(database.metadata?.failed_jobs).map((item) => <MetricRow key={item} label="Failed job" value={item} />)}
        </SignalCard>
        <SignalCard title="Blocking Queries" emptyText="No blocking query data collected.">
          {asList(database.metadata?.blocking_queries).map((item) => <MetricRow key={item} label="Blocking query" value={item} />)}
        </SignalCard>
        <SignalCard title="Deadlocks" emptyText="No deadlock data collected.">
          <MetricRow label="Deadlocks" value={valueFrom(database, databaseMetrics, ["deadlocks", "deadlock_count"])} />
        </SignalCard>
        <SignalCard title="Long-Running Queries" emptyText="No long-running query data collected.">
          {asList(database.metadata?.long_running_queries).map((item) => <MetricRow key={item} label="Query" value={item} />)}
        </SignalCard>
        <SignalCard title="Replication Lag" emptyText="No replication lag data collected.">
          <MetricRow label="Lag" value={valueFrom(database, databaseMetrics, ["replication_lag_seconds", "replication_lag_ms", "replication_lag"])} />
        </SignalCard>
      </section>

      <Card className="console-line">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-3.5 text-primary" />
            OpenClaw Database Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OpenClawDatabaseAnalysis
            activeAlerts={activeAlerts}
            database={database}
            metrics={databaseMetrics}
            recentEvents={recentEvents}
          />
        </CardContent>
      </Card>
    </>
  );
}

function OpenClawDatabaseAnalysis({
  activeAlerts,
  database,
  metrics,
  recentEvents,
}: {
  activeAlerts: AlertRecord[];
  database: Resource;
  metrics: MetricSample[];
  recentEvents: AlertRecord[];
}) {
  const evidence = [
    `${database.name} is ${database.health_status ?? "Unknown"} with score ${database.health_score ?? "n/a"}.`,
    `${activeAlerts.length} active alert(s), ${metrics.length} metric sample(s), ${recentEvents.length} recent event(s).`,
  ];
  const lowEvidence = activeAlerts.length === 0 && metrics.length === 0 && recentEvents.length === 0;

  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      <p>
        OpenClaw sees this database as {database.health_status ?? "Unknown"} because InfraSight reports
        status {database.status}, connection {connectionStatus(database)}, and {activeAlerts.length} active alerts.
      </p>
      <div>
        <p className="font-medium text-foreground">Evidence</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {evidence.map((item) => <li key={item}>{item}</li>)}
          {activeAlerts.slice(0, 3).map((alert) => (
            <li key={alert.id}>{alert.severity} alert: {alert.title}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-medium text-foreground">Suggested next checks</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Confirm database connectivity from the application tier.</li>
          <li>Review storage growth, locks, slow queries, replication lag, and recent deployments.</li>
          <li>Use operator runbooks for remediation; this view is read-only.</li>
        </ul>
      </div>
      {lowEvidence && (
        <p>
          There is not enough database-specific telemetry to produce a confident diagnosis. Collect database
          metrics/events for jobs, locks, query duration, replication, CPU, memory, and storage to improve analysis.
        </p>
      )}
    </div>
  );
}

function SignalCard({
  children,
  emptyText,
  title,
}: {
  children: ReactNode;
  emptyText: string;
  title: string;
}) {
  const hasChildren = Boolean(children) && (!Array.isArray(children) || children.length > 0);
  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {hasChildren ? children : <EmptyState text={emptyText} />}
      </CardContent>
    </Card>
  );
}

function EventRow({ meta, severity, title }: { meta: string; severity: string; title: string }) {
  return (
    <InfoTile>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <SeverityBadge severity={severity} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
    </InfoTile>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <InfoTile className="grid grid-cols-[1fr_auto] gap-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">{value || "n/a"}</span>
    </InfoTile>
  );
}

function databasePreview(resource: Resource) {
  return `${resource.name} - ${resource.health_status ?? resource.status} (${resource.health_score ?? "n/a"})`;
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))].sort();
}

function connectionStatus(resource: Resource) {
  return String(
    resource.metadata?.connection_status ??
      resource.metadata?.db_connection_status ??
      resource.metadata?.database_connection_status ??
      resource.status,
  );
}

function lastChecked(resource: Resource, metrics: MetricSample[]) {
  const metadataValue =
    resource.metadata?.last_checked ??
    resource.metadata?.last_seen ??
    resource.metadata?.updated_at ??
    resource.metadata?.checked_at;
  if (typeof metadataValue === "string") return formatDate(metadataValue);

  const latestMetric = metrics
    .filter((metric) => String(metric.resource_id) === String(resource.id))
    .sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime())[0];
  return latestMetric ? formatDate(latestMetric.collected_at) : "n/a";
}

function valueFrom(resource: Resource, metrics: MetricSample[], keys: string[]) {
  for (const key of keys) {
    const metadataValue = resource.metadata?.[key];
    if (metadataValue !== undefined && metadataValue !== null) return String(metadataValue);

    const metric = metrics.find((item) => item.metric_name === key);
    if (metric) return `${metric.value} ${metric.unit}`;
  }
  return "n/a";
}

function asList(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return [value];
  if (typeof value === "number") return [String(value)];
  return [];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

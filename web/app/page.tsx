"use client";

/**
 * InfraSight Console
 * ==================
 * Root page component — renders the full dashboard shell: sidebar navigation,
 * top header (org switcher, sync menu, notification centre), and the active
 * section panel.
 *
 * Section routing is client-side state; clicking a nav item sets activeSection
 * which swaps the content panel via AnimatePresence.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogOut, Menu, RefreshCw, X } from "lucide-react";

import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { AutomationPanel } from "@/components/dashboard/automation-panel";
import { ConnectorsPage } from "@/components/dashboard/connectors-page";
import { DatabaseDetailsView, DatabasePanel } from "@/components/dashboard/database-panel";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { InfrastructureResourcePage } from "@/components/dashboard/infrastructure-resource-page";
import { InventoryPanel } from "@/components/dashboard/inventory-panel";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import { NotificationSettings } from "@/components/dashboard/notification-settings";
import { OpenClawAssistant } from "@/components/dashboard/openclaw-assistant";
import { OpenClawPage } from "@/components/dashboard/openclaw-page";
import { ResourceDetailsPage } from "@/components/dashboard/resource-details-page";
import { SignInPage } from "@/components/dashboard/sign-in-page";
import type { SummaryMetricTarget } from "@/components/dashboard/summary-cards";
import { TopologyPage } from "@/components/dashboard/topology-page";
import { Select } from "@/components/ui/select";
import { navigationGroups } from "@/dashboard/navigation";
import { countBy, toChartData } from "@/dashboard/utils";
import { buildWorkspaceContext } from "@/dashboard/workspace";
import { useInfraSightData } from "@/hooks/use-infrasight-data";
import { cn } from "@/lib/utils";
import {
  fetchOrganizationContext,
  fetchOrganizations,
  fetchAuthSession,
  logout,
  runDiscovery,
  setAuthContext,
  setActiveOrganization,
} from "@/services/infrasight-api";
import type { AlertRecord, AuthSession, Organization, OrganizationContext, Resource, Section } from "@/types/infrasight";

type ResourceMetricFilter =
  | { kind: "all"; label: string }
  | { kind: "health"; status: "Healthy" | "Warning" | "Critical"; label: string }
  | { kind: "health-score"; label: string }
  | { kind: "unified"; label: string };

type AlertMetricFilter =
  | { kind: "open"; label: string }
  | { kind: "connector"; label: string };

export default function InfraSightConsole() {
  const [activeSection, setActiveSection] = useState<Section>("Dashboard");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const [assetType, setAssetType] = useState("all");
  const [assetHealth, setAssetHealth] = useState("all");
  const [assetClient, setAssetClient] = useState("all");
  const [selectedResourceId, setSelectedResourceId] = useState<number | string | null>(null);
  const [resourceMetricFilter, setResourceMetricFilter] = useState<ResourceMetricFilter | null>(null);
  const [alertMetricFilter, setAlertMetricFilter] = useState<AlertMetricFilter | null>(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("internal");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationContext, setOrganizationContext] = useState<OrganizationContext | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const {
    addChannel,
    alerts,
    busy,
    channelAction,
    channels,
    deliveries,
    lastEvent,
    loadAll,
    metrics,
    realtime,
    resources,
    runAction,
    summary,
  } = useInfraSightData(activeWorkspaceId);

  useEffect(() => {
    fetchAuthSession()
      .then((session) => {
        setAuthSession(session);
        setActiveWorkspaceId(session.user.workspace_id);
      })
      .catch(() => {
        setAuthContext(null);
        setAuthSession(null);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    setActiveOrganization(activeWorkspaceId);
    fetchOrganizations()
      .then(setOrganizations)
      .catch(() => undefined);
    fetchOrganizationContext()
      .then(setOrganizationContext)
      .catch(() => undefined);
  }, [activeWorkspaceId]);

  const syncProviderResources = async (path: string, nextProvider: string) => {
    setActiveSection("Assets");
    setProvider(nextProvider);
    setStatus("all");
    setQuery("");
    setResourceMetricFilter(null);
    setSyncMenuOpen(false);
    await runAction(path);
  };

  const runDiscoveryTypes = async (discoveryTypes: string[]) => {
    setDiscoveryBusy(true);
    try {
      setActiveOrganization(activeWorkspaceId);
      await runDiscovery(discoveryTypes);
      await loadAll();
    } finally {
      setDiscoveryBusy(false);
    }
  };

  const filteredResources = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    const nextResources = resources.filter((resource) => {
      const matchesProvider = provider === "all" || resource.provider === provider;
      const matchesStatus = status === "all" || resource.status === status;
      const matchesType = assetType === "all" || resource.resource_type === assetType;
      const matchesHealth = assetHealth === "all" || resource.health_status === assetHealth;
      const client = resource.organization_id ?? resource.tenant_id ?? "internal";
      const matchesClient = assetClient === "all" || client === assetClient;
      const matchesQuery = [resource.name, resource.region, resource.resource_type]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(lowerQuery));
      return (
        matchesProvider &&
        matchesStatus &&
        matchesType &&
        matchesHealth &&
        matchesClient &&
        (!lowerQuery || matchesQuery) &&
        matchesResourceMetricFilter(resource, resourceMetricFilter)
      );
    });

    if (resourceMetricFilter?.kind === "health-score") {
      return [...nextResources].sort((a, b) => (a.health_score ?? 100) - (b.health_score ?? 100));
    }

    return nextResources;
  }, [assetClient, assetHealth, assetType, provider, query, resourceMetricFilter, resources, status]);

  const providerData = toChartData(countBy(resources, "provider"));
  const statusData = toChartData(countBy(resources, "status"));
  const typeData = toChartData(countBy(resources, "resource_type"));
  const openAlerts = alerts.filter((a) => a.status === "open");
  const workspaceContext = useMemo(
    () =>
      buildWorkspaceContext({
        activeWorkspaceId,
        alerts,
        organizations,
        resources,
      }),
    [activeWorkspaceId, alerts, organizations, resources],
  );
  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => matchesAlertMetricFilter(alert, alertMetricFilter)),
    [alertMetricFilter, alerts],
  );
  const databaseResources = resources.filter(isDatabaseResource);
  const serverResources = resources.filter(isServerResource);
  const containerResources = resources.filter(isContainerResource);
  const kubernetesResources = resources.filter(isKubernetesResource);
  const providerOptions = ["all", ...new Set([...Object.keys(countBy(resources, "provider")), provider])];
  const assetTypeOptions = ["all", ...Object.keys(countBy(resources, "resource_type"))];
  const assetHealthOptions = ["all", "Healthy", "Warning", "Critical"];
  const assetClientOptions = ["all", ...new Set(resources.map((r) => r.organization_id ?? r.tenant_id ?? "internal"))];
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);

  function navigate(section: Section) {
    setActiveSection(section);
    setSelectedResourceId(null);
    clearMetricFilters();
    setSidebarOpen(false);
  }

  function openResourceDetails(resource: Resource) {
    setSelectedResourceId(resource.id);
  }

  function clearMetricFilters() {
    setResourceMetricFilter(null);
    setAlertMetricFilter(null);
  }

  function clearResourceFilters() {
    setResourceMetricFilter(null);
    setProvider("all");
    setStatus("all");
    setAssetType("all");
    setAssetHealth("all");
    setAssetClient("all");
    setQuery("");
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    setAuthSession(null);
    setSelectedResourceId(null);
    setActiveSection("Dashboard");
  }

  // Card navigation is intentionally centralized here: hover previews stay local
  // to the cards, while clicks update the dashboard section and destination filter.
  function handleSummaryMetricClick(target: SummaryMetricTarget) {
    setSelectedResourceId(null);
    setAlertMetricFilter(null);

    if (target === "open-alerts") {
      setActiveSection("Alerts");
      setAlertMetricFilter({ kind: "open", label: "Open alerts" });
      setResourceMetricFilter(null);
      return;
    }

    setActiveSection("Assets");
    setProvider("all");
    setStatus("all");
    setQuery("");

    if (target === "total-resources") {
      setResourceMetricFilter({ kind: "all", label: "All resources" });
    } else if (target === "healthy-resources") {
      setResourceMetricFilter({ kind: "health", status: "Healthy", label: "Healthy resources" });
    } else if (target === "warning-resources") {
      setResourceMetricFilter({ kind: "health", status: "Warning", label: "Warning resources" });
    } else if (target === "critical-resources") {
      setResourceMetricFilter({ kind: "health", status: "Critical", label: "Critical resources" });
    } else if (target === "estate-health-score") {
      setResourceMetricFilter({ kind: "health-score", label: "Sorted by health score" });
    }
  }

  const isConnected = realtime === "connected";

  if (authChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking session...
      </main>
    );
  }

  if (!authSession) {
    return (
      <SignInPage
        onAuthenticated={(session) => {
          setAuthSession(session);
          setActiveWorkspaceId(session.user.workspace_id);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card/80 backdrop-blur-xl transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:flex",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="console-line flex h-16 shrink-0 items-center gap-3 border-b border-border px-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-gradient-to-br from-primary/25 to-accent/15 font-black text-sm text-primary shadow-glow-sm">
            IS
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight">InfraSight</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Command Fabric
            </div>
          </div>
        </div>

        {/* Primary nav — main dashboard sections */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navigationGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
              {group.items.map((item) => {
                const active = activeSection === item.name;
                return (
                  <button
                    key={item.name}
                    onClick={() => navigate(item.name)}
                    className={cn(
                      "group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-all",
                      active
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-primary" />}
                    <item.icon className={cn("size-5 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    <span className="truncate">{item.name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer: org switcher + real-time status */}
        <div className="shrink-0 space-y-2 border-t border-border p-3">
          <div className="space-y-2 rounded-lg border border-border bg-background/55 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Workspace
              </span>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                {workspaceContext.activeWorkspace.status}
              </span>
            </div>
            <Select
              aria-label="Workspace"
              className="w-full text-xs"
              value={activeWorkspaceId}
              onChange={(event) => {
                const workspaceId = event.target.value;
                setActiveWorkspaceId(workspaceId);
                setActiveOrganization(workspaceId);
                setSelectedResourceId(null);
                clearMetricFilters();
              }}
            >
              {workspaceContext.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-3 gap-1 text-center">
              <WorkspaceStat label="Resources" value={workspaceContext.activeWorkspace.resource_count} />
              <WorkspaceStat label="Alerts" value={workspaceContext.activeWorkspace.alert_count} />
              <WorkspaceStat label="Health" value={`${workspaceContext.activeWorkspace.health_score}%`} />
            </div>
          </div>

          {organizationContext && (
            <p className="truncate px-1 text-[11px] text-muted-foreground">
              User profile: {organizationContext.role.replace("_", " ")}
            </p>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
            <span className="relative flex size-2">
              {isConnected && (
                <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 animate-pulse-ring" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2 rounded-full",
                  isConnected ? "bg-primary" : "bg-muted-foreground",
                )}
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {realtime} · {lastEvent}
            </span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="console-line sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/70 px-5 backdrop-blur-xl">
          {/* Left: mobile menu + section title */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors lg:hidden"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Menu"
            >
              {sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">
                Hybrid Operations
              </p>
              <h1 className="truncate text-lg font-semibold leading-none mt-0.5">
                {selectedResource ? "Resource Details" : activeSection}
              </h1>
            </div>
          </div>

          {/* Right: real-time status + notification centre + sync menu */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Real-time connection indicator */}
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 sm:flex">
              <span className="relative flex size-2">
                {isConnected && (
                  <span className="absolute inline-flex size-full rounded-full bg-primary opacity-70 animate-pulse-ring" />
                )}
                <span
                  className={cn(
                    "relative inline-flex size-2 rounded-full",
                    isConnected ? "bg-primary" : "bg-muted-foreground",
                  )}
                />
              </span>
              <span className="text-xs text-muted-foreground">{realtime}</span>
            </div>

            {/* Notification centre — shows open alert count */}
            <NotificationCenter alerts={openAlerts} />

            {/* Sync dropdown — triggers provider sync and metric collection */}
            <div className="relative">
              <button
                onClick={() => setSyncMenuOpen((v) => !v)}
                disabled={busy}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-50",
                  syncMenuOpen && "bg-muted text-foreground",
                )}
              >
                <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
                <span className="hidden sm:inline">Sync</span>
                <ChevronDown className={cn("size-3 transition-transform", syncMenuOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {syncMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full z-50 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-border bg-card shadow-console"
                  >
                    {[
                      { label: "Sync AWS EC2", path: "/sync/ec2", prov: "aws" },
                      { label: "Sync Azure VMs", path: "/sync/azure/vms", prov: "azure" },
                      { label: "Sync On-Prem", path: "/sync/onprem/local", prov: "onprem" },
                      { label: "Collect Metrics", path: "/monitoring/collect", prov: "" },
                    ].map(({ label, path, prov }) => (
                      <button
                        key={label}
                        onClick={() =>
                          prov
                            ? syncProviderResources(path, prov)
                            : (runAction(path), setSyncMenuOpen(false))
                        }
                        disabled={busy}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <RefreshCw className="size-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
              aria-label="Log out"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>

          </div>
        </header>

        {/* Content area — animated section transitions */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-6"
              >
                {selectedResource ? (
                  isDatabaseResource(selectedResource) ? (
                    <DatabaseDetailsView
                      alerts={alerts}
                      database={selectedResource}
                      metrics={metrics}
                      onBack={() => setSelectedResourceId(null)}
                    />
                  ) : (
                    <ResourceDetailsPage
                      alerts={alerts}
                      metrics={metrics}
                      onBack={() => setSelectedResourceId(null)}
                      onSelectResource={openResourceDetails}
                      resource={selectedResource}
                      resources={resources}
                    />
                  )
                ) : activeSection === "Dashboard" && (
                  <DashboardOverview
                    alerts={alerts}
                    channels={channels}
                    lastEvent={lastEvent}
                    onOpenTopology={() => {
                      setSelectedResourceId(null);
                      setActiveSection("Topology");
                    }}
                    onSummaryMetricClick={handleSummaryMetricClick}
                    openAlerts={openAlerts}
                    providerData={providerData}
                    resources={resources}
                    statusData={statusData}
                    summary={summary}
                    typeData={typeData}
                  />
                )}
                {!selectedResource && activeSection === "Assets" && (
                  <InventoryPanel
                    activeFilterLabel={resourceMetricFilter?.label}
                    clearActiveFilter={clearResourceFilters}
                    client={assetClient}
                    clients={assetClientOptions}
                    health={assetHealth}
                    healthStates={assetHealthOptions}
                    provider={provider}
                    providers={providerOptions}
                    onSelectResource={openResourceDetails}
                    query={query}
                    resources={filteredResources}
                    resourceType={assetType}
                    resourceTypes={assetTypeOptions}
                    setClient={setAssetClient}
                    setHealth={setAssetHealth}
                    setProvider={setProvider}
                    setQuery={setQuery}
                    setResourceType={setAssetType}
                    setStatus={setStatus}
                    status={status}
                    statuses={["all", ...Object.keys(countBy(resources, "status"))]}
                  />
                )}
                {!selectedResource && activeSection === "Servers" && (
                  <InfrastructureResourcePage
                    alerts={alerts}
                    busy={busy || discoveryBusy}
                    discoveryActions={[
                      { label: "Discover Linux", discoveryTypes: ["linux_ssh"] },
                      { label: "Discover Windows", discoveryTypes: ["windows_winrm"] },
                      { label: "Sync EC2", path: "/sync/ec2" },
                      { label: "Sync Azure VMs", path: "/sync/azure/vms" },
                    ]}
                    kind="servers"
                    metrics={metrics}
                    onRunAction={runAction}
                    onRunDiscovery={runDiscoveryTypes}
                    onSelectResource={openResourceDetails}
                    resources={serverResources}
                    title="Servers"
                  />
                )}
                {!selectedResource && activeSection === "Alerts" && (
                  <AlertsPanel
                    activeFilterLabel={alertMetricFilter?.label}
                    alerts={filteredAlerts}
                    channels={channels}
                    clearActiveFilter={() => setAlertMetricFilter(null)}
                    refresh={loadAll}
                    resources={resources}
                    summary={summary}
                  />
                )}
                {!selectedResource && activeSection === "Databases" && (
                  <DatabasePanel
                    alerts={alerts}
                    busy={busy || discoveryBusy}
                    metrics={metrics}
                    onRunDiscovery={runDiscoveryTypes}
                    resources={databaseResources}
                  />
                )}
                {!selectedResource && activeSection === "Automation" && <AutomationPanel channels={channels} />}
                {!selectedResource && activeSection === "OpenClaw" && (
                  <OpenClawPage
                    key={activeWorkspaceId}
                    workspaceName={workspaceContext.activeWorkspace.name}
                  />
                )}
                {!selectedResource && activeSection === "Containers" && (
                  <InfrastructureResourcePage
                    alerts={alerts}
                    busy={busy || discoveryBusy}
                    discoveryActions={[{ label: "Discover Docker", discoveryTypes: ["docker"] }]}
                    kind="containers"
                    metrics={metrics}
                    onRunAction={runAction}
                    onRunDiscovery={runDiscoveryTypes}
                    onSelectResource={openResourceDetails}
                    resources={containerResources}
                    title="Containers"
                  />
                )}
                {!selectedResource && activeSection === "Kubernetes" && (
                  <InfrastructureResourcePage
                    alerts={alerts}
                    busy={busy || discoveryBusy}
                    discoveryActions={[{ label: "Discover Kubernetes", discoveryTypes: ["kubernetes"] }]}
                    kind="kubernetes"
                    metrics={metrics}
                    onRunAction={runAction}
                    onRunDiscovery={runDiscoveryTypes}
                    onSelectResource={openResourceDetails}
                    resources={kubernetesResources}
                    title="Kubernetes"
                  />
                )}
                {!selectedResource && activeSection === "Topology" && (
                  <TopologyPage onSelectResource={openResourceDetails} resources={resources} alerts={alerts} />
                )}
                {!selectedResource && activeSection === "Connectors" && (
                  <ConnectorsPage
                    resources={resources}
                    workspace={workspaceContext.activeWorkspace}
                  />
                )}
                {!selectedResource && activeSection === "Settings" && (
                  <NotificationSettings
                    channelAction={channelAction}
                    channels={channels}
                    deliveries={deliveries}
                    onAddChannel={addChannel}
                    workspaceId={activeWorkspaceId}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Floating OpenClaw assistant — available from any section */}
      <OpenClawAssistant
        key={activeWorkspaceId}
        workspaceName={workspaceContext.activeWorkspace.name}
      />
    </div>
  );
}

function WorkspaceStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-1.5 py-1">
      <div className="text-[10px] font-semibold text-foreground">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function isDatabaseResource(resource: Resource) {
  const resourceType = resource.resource_type.toLowerCase();
  return (
    resourceType.includes("database") ||
    resourceType.includes("postgres") ||
    resourceType.includes("sql") ||
    resourceType.includes("rds")
  );
}

function isServerResource(resource: Resource) {
  const provider = resource.provider.toLowerCase();
  const resourceType = resource.resource_type.toLowerCase();
  const metadataText = `${String(resource.metadata?.os ?? "")} ${String(resource.metadata?.platform ?? "")}`.toLowerCase();

  if (isDatabaseResource(resource) || isContainerResource(resource) || isKubernetesResource(resource)) {
    return false;
  }

  return (
    resourceType.includes("server") ||
    resourceType.includes("host") ||
    resourceType.includes("vm") ||
    resourceType.includes("ec2") ||
    resourceType.includes("linux") ||
    resourceType.includes("windows") ||
    provider === "aws" ||
    provider === "azure" ||
    metadataText.includes("linux") ||
    metadataText.includes("windows")
  );
}

function isContainerResource(resource: Resource) {
  const provider = resource.provider.toLowerCase();
  const resourceType = resource.resource_type.toLowerCase();
  return resourceType.includes("container") || resourceType.includes("docker") || provider === "docker";
}

function isKubernetesResource(resource: Resource) {
  const provider = resource.provider.toLowerCase();
  const resourceType = resource.resource_type.toLowerCase();
  return (
    provider === "kubernetes" ||
    ["deployment", "pod", "service", "namespace", "cluster", "node"].some((type) =>
      resourceType.includes(type),
    )
  );
}

function matchesResourceMetricFilter(resource: Resource, filter: ResourceMetricFilter | null) {
  if (!filter || filter.kind === "all" || filter.kind === "health-score") return true;
  if (filter.kind === "health") return resource.health_status === filter.status;
  if (filter.kind === "unified") return Boolean(resource.provider || resource.metadata?.connector_type);
  return true;
}

function matchesAlertMetricFilter(alert: AlertRecord, filter: AlertMetricFilter | null) {
  if (!filter) return true;
  if (filter.kind === "open") return alert.status === "open";
  if (filter.kind === "connector") {
    return alert.status === "open";
  }
  return true;
}

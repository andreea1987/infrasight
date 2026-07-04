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
import { Button } from "@/components/ui/button";
import { ControlToolbar } from "@/components/ui/controls";
import { navigationGroups } from "@/dashboard/navigation";
import {
  HEALTH_OPTIONS,
  PLATFORM_OPTIONS,
  RESOURCE_TYPE_OPTIONS,
  STATUS_OPTIONS,
  providerConfig,
  resourceHealth,
  resourcePlatform,
  resourceProvider,
  resourceStatus,
  resourceType,
  supportedProviderValues,
} from "@/dashboard/resourceClassification";
import { countBy, toChartData } from "@/dashboard/utils";
import { buildWorkspaceContext, organizationIdFromWorkspace } from "@/dashboard/workspace";
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
import type {
  AlertRecord,
  AuthSession,
  MonitoringSummary,
  Organization,
  OrganizationContext,
  Resource,
  Section,
  Workspace,
  WorkspaceGroup,
} from "@/types/infrasight";

type ResourceMetricFilter =
  | { kind: "all"; label: string }
  | { kind: "health"; status: "healthy" | "warning" | "critical"; label: string }
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
  const [assetPlatform, setAssetPlatform] = useState("all");
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
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const activeOrganizationId = organizationIdFromWorkspace(activeWorkspaceId);

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
  } = useInfraSightData(activeWorkspaceId, activeOrganizationId);

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
    setActiveOrganization(activeWorkspaceId, activeOrganizationId);
    fetchOrganizations()
      .then(setOrganizations)
      .catch(() => undefined);
    fetchOrganizationContext()
      .then(setOrganizationContext)
      .catch(() => undefined);
  }, [activeOrganizationId, activeWorkspaceId]);

  const syncProviderResources = async (path: string, nextProvider: string) => {
    setActiveSection("Inventory");
    setProvider(nextProvider);
    setStatus("all");
    setAssetType("all");
    setAssetPlatform("all");
    setQuery("");
    setResourceMetricFilter(null);
    setSyncMenuOpen(false);
    await runAction(path);
  };

  const runProviderDiscovery = async (providerValue: string) => {
    const providerDetails = providerConfig(providerValue);
    if (!providerDetails?.actionPath || providerDetails.comingSoon) return;
    await syncProviderResources(providerDetails.actionPath, providerValue);
  };

  const runDiscoveryTypes = async (discoveryTypes: string[]) => {
    setDiscoveryBusy(true);
    try {
      setActiveOrganization(activeWorkspaceId, activeOrganizationId);
      await runDiscovery(discoveryTypes);
      await loadAll();
    } finally {
      setDiscoveryBusy(false);
    }
  };

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
  const scopedResources = useMemo(
    () => resources.filter((resource) => matchesWorkspaceScope(resource, workspaceContext.activeWorkspace.id)),
    [resources, workspaceContext.activeWorkspace.id],
  );
  const scopedAlerts = useMemo(
    () => alerts.filter((alert) => matchesWorkspaceScope(alert, workspaceContext.activeWorkspace.id)),
    [alerts, workspaceContext.activeWorkspace.id],
  );
  const scopedSummary = useMemo(
    () => buildScopedSummary(scopedResources, scopedAlerts, summary),
    [scopedAlerts, scopedResources, summary],
  );

  const filteredResources = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    const nextResources = scopedResources.filter((resource) => {
      const matchesProvider = provider === "all" || resourceProvider(resource) === provider;
      const matchesStatus = status === "all" || resourceStatus(resource) === status;
      const matchesType = assetType === "all" || resourceType(resource) === assetType;
      const matchesPlatform = assetPlatform === "all" || resourcePlatform(resource) === assetPlatform;
      const matchesHealth = assetHealth === "all" || resourceHealth(resource) === assetHealth;
      const client = resource.organization_id ?? resource.tenant_id ?? "internal";
      const matchesClient = assetClient === "all" || client === assetClient;
      const matchesQuery = [resource.name, resource.region, resource.resource_type]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(lowerQuery));
      return (
        matchesProvider &&
        matchesStatus &&
        matchesType &&
        matchesPlatform &&
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
  }, [assetClient, assetHealth, assetPlatform, assetType, provider, query, resourceMetricFilter, scopedResources, status]);

  const statusData = toChartData(countBy(scopedResources, "status"));
  const openAlerts = scopedAlerts.filter((a) => a.status === "open");
  const filteredAlerts = useMemo(
    () => scopedAlerts.filter((alert) => matchesAlertMetricFilter(alert, alertMetricFilter)),
    [alertMetricFilter, scopedAlerts],
  );
  const databaseResources = scopedResources.filter(isDatabaseResource);
  const serverResources = scopedResources.filter(isServerResource);
  const containerResources = scopedResources.filter(isContainerResource);
  const kubernetesResources = scopedResources.filter(isKubernetesResource);
  const providerOptions = ["all", ...supportedProviderValues()];
  const providerCounts = useMemo(
    () => countValues(scopedResources.map(resourceProvider)),
    [scopedResources],
  );
  const assetTypeOptions = ["all", ...optionValues(RESOURCE_TYPE_OPTIONS)];
  const assetPlatformOptions = ["all", ...optionValues(PLATFORM_OPTIONS)];
  const assetHealthOptions = ["all", ...optionValues(HEALTH_OPTIONS)];
  const assetStatusOptions = ["all", ...optionValues(STATUS_OPTIONS)];
  const assetClientOptions = ["all", ...new Set(scopedResources.map((r) => r.organization_id ?? r.tenant_id ?? "internal"))];
  const selectedResource = scopedResources.find((resource) => resource.id === selectedResourceId);

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
    setAssetPlatform("all");
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

    setActiveSection("Inventory");
    setProvider("all");
    setStatus("all");
    setAssetType("all");
    setAssetPlatform("all");
    setQuery("");

    if (target === "total-resources") {
      setResourceMetricFilter({ kind: "all", label: "All resources" });
    } else if (target === "healthy-resources") {
      setResourceMetricFilter({ kind: "health", status: "healthy", label: "Healthy resources" });
    } else if (target === "warning-resources") {
      setResourceMetricFilter({ kind: "health", status: "warning", label: "Warning resources" });
    } else if (target === "critical-resources") {
      setResourceMetricFilter({ kind: "health", status: "critical", label: "Critical resources" });
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
                      "group relative flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25",
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
            <WorkspaceSelector
              activeWorkspaceId={activeWorkspaceId}
              groups={workspaceContext.groups}
              open={workspaceMenuOpen}
              onOpenChange={setWorkspaceMenuOpen}
              onSelect={(workspace) => {
                setActiveWorkspaceId(workspace.id);
                setActiveOrganization(workspace.id, workspace.organization_id);
                setSelectedResourceId(null);
                clearMetricFilters();
                setWorkspaceMenuOpen(false);
              }}
            />
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

          <div className="flex min-h-9 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5">
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
            <Button
              className="lg:hidden"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Menu"
              size="icon"
              type="button"
              variant="ghost"
            >
              {sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
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
          <ControlToolbar className="shrink-0">
            {/* Real-time connection indicator */}
            <div className="hidden min-h-9 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 sm:flex">
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
              <Button
                onClick={() => setSyncMenuOpen((v) => !v)}
                disabled={busy}
                size="sm"
                type="button"
                variant="secondary"
                className={cn(
                  "bg-muted/30 text-muted-foreground",
                  syncMenuOpen && "bg-muted text-foreground",
                )}
              >
                <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
                <span className="hidden sm:inline">Sync</span>
                <ChevronDown className={cn("size-3 transition-transform", syncMenuOpen && "rotate-180")} />
              </Button>

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
                      { label: "Sync On-Prem", path: "/sync/onprem/local", prov: "on_prem" },
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
                        className="flex min-h-9 w-full items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
                      >
                        <RefreshCw className="size-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button
              onClick={handleLogout}
              className="bg-muted/30 text-muted-foreground"
              aria-label="Log out"
              size="sm"
              type="button"
              variant="secondary"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </Button>

          </ControlToolbar>
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
                      alerts={scopedAlerts}
                      database={selectedResource}
                      metrics={metrics}
                      onBack={() => setSelectedResourceId(null)}
                    />
                  ) : (
                    <ResourceDetailsPage
                      alerts={scopedAlerts}
                      metrics={metrics}
                      onBack={() => setSelectedResourceId(null)}
                      onSelectResource={openResourceDetails}
                      resource={selectedResource}
                      resources={scopedResources}
                    />
                  )
                ) : activeSection === "Dashboard" && (
                  <DashboardOverview
                    alerts={scopedAlerts}
                    lastEvent={lastEvent}
                    onSummaryMetricClick={handleSummaryMetricClick}
                    openAlerts={openAlerts}
                    resources={scopedResources}
                    statusData={statusData}
                    summary={scopedSummary}
                  />
                )}
                {!selectedResource && activeSection === "Inventory" && (
                  <InventoryPanel
                    activeFilterLabel={resourceMetricFilter?.label}
                    clearActiveFilter={clearResourceFilters}
                    client={assetClient}
                    clients={assetClientOptions}
                    health={assetHealth}
                    healthStates={assetHealthOptions}
                    platform={assetPlatform}
                    platforms={assetPlatformOptions}
                    provider={provider}
                    providerActionBusy={busy}
                    providerCounts={providerCounts}
                    providers={providerOptions}
                    onProviderAction={runProviderDiscovery}
                    onSelectResource={openResourceDetails}
                    query={query}
                    resources={filteredResources}
                    resourceType={assetType}
                    resourceTypes={assetTypeOptions}
                    setClient={setAssetClient}
                    setHealth={setAssetHealth}
                    setPlatform={setAssetPlatform}
                    setProvider={setProvider}
                    setQuery={setQuery}
                    setResourceType={setAssetType}
                    setStatus={setStatus}
                    status={status}
                    statuses={assetStatusOptions}
                  />
                )}
                {!selectedResource && activeSection === "Servers" && (
                  <InfrastructureResourcePage
                    alerts={scopedAlerts}
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
                    resources={scopedResources}
                    summary={scopedSummary}
                  />
                )}
                {!selectedResource && activeSection === "Databases" && (
                  <DatabasePanel
                    alerts={scopedAlerts}
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
                    alerts={scopedAlerts}
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
                    alerts={scopedAlerts}
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
                  <TopologyPage onSelectResource={openResourceDetails} resources={scopedResources} alerts={scopedAlerts} />
                )}
                {!selectedResource && activeSection === "Connectors" && (
                  <ConnectorsPage
                    onRefreshWorkspace={loadAll}
                    resources={scopedResources}
                    workspace={workspaceContext.activeWorkspace}
                  />
                )}
                {!selectedResource && activeSection === "Notifications" && (
                  <NotificationSettings
                    channelAction={channelAction}
                    channels={channels}
                    deliveries={deliveries}
                    mode="notifications"
                    onAddChannel={addChannel}
                    workspaceId={activeWorkspaceId}
                  />
                )}
                {!selectedResource && activeSection === "Administration" && (
                  <NotificationSettings
                    channelAction={channelAction}
                    channels={channels}
                    deliveries={deliveries}
                    mode="administration"
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

function WorkspaceSelector({
  activeWorkspaceId,
  groups,
  onOpenChange,
  onSelect,
  open,
}: {
  activeWorkspaceId: string;
  groups: WorkspaceGroup[];
  onOpenChange: (open: boolean) => void;
  onSelect: (workspace: Workspace) => void;
  open: boolean;
}) {
  const activeWorkspace = groups
    .flatMap((group) => group.workspaces)
    .find((workspace) => workspace.id === activeWorkspaceId);

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label="Workspace selector"
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background/70 px-3 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold">
            {activeWorkspace?.organization_name ?? "Organization"}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {activeWorkspace?.environment ?? "Production"}
          </span>
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute bottom-full left-0 z-50 mb-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-console"
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
          >
            {groups.map((group) => (
              <div className="space-y-1 pb-2 last:pb-0" key={group.organization_id}>
                <p className="truncate px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {group.organization_name}
                </p>
                {group.workspaces.map((workspace) => {
                  const active = workspace.id === activeWorkspaceId;
                  return (
                    <button
                      className={cn(
                        "flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                      key={workspace.id}
                      onClick={() => onSelect(workspace)}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{workspace.environment}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {workspace.resource_count} resources · {workspace.alert_count} alerts
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {workspace.health_score}%
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function isDatabaseResource(resource: Resource) {
  return resourceType(resource) === "database";
}

function isServerResource(resource: Resource) {
  const type = resourceType(resource);
  return type === "server" || type === "virtual_machine";
}

function isContainerResource(resource: Resource) {
  return resourceType(resource) === "container";
}

function isKubernetesResource(resource: Resource) {
  return resourceType(resource) === "kubernetes_cluster";
}

function matchesResourceMetricFilter(resource: Resource, filter: ResourceMetricFilter | null) {
  if (!filter || filter.kind === "all" || filter.kind === "health-score") return true;
  if (filter.kind === "health") return resourceHealth(resource) === filter.status;
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

function matchesWorkspaceScope(
  record: { tenant_id?: string; organization_id?: string },
  activeWorkspaceId: string,
) {
  const recordWorkspaceId = record.tenant_id ?? record.organization_id ?? "internal";
  const recordOrganizationId = record.organization_id ?? organizationIdFromWorkspace(recordWorkspaceId);

  if (activeWorkspaceId.includes(":")) {
    return recordWorkspaceId === activeWorkspaceId;
  }

  return recordWorkspaceId === activeWorkspaceId || (!record.tenant_id && recordOrganizationId === activeWorkspaceId);
}

function buildScopedSummary(
  resources: Resource[],
  alerts: AlertRecord[],
  fallback: MonitoringSummary,
): MonitoringSummary {
  if (!resources.length && !alerts.length) {
    return {
      total_resources: 0,
      healthy_percentage: 100,
      running_percentage: 100,
      open_alerts: 0,
      critical_alerts: 0,
      warning_alerts: 0,
    };
  }

  const openAlerts = alerts.filter((alert) => alert.status === "open");
  const healthyResources = resources.filter((resource) => resourceHealth(resource) === "healthy");
  const runningResources = resources.filter((resource) => resourceStatus(resource) === "running");

  return {
    total_resources: resources.length,
    healthy_percentage: resources.length
      ? Math.round((healthyResources.length / resources.length) * 100)
      : fallback.healthy_percentage,
    running_percentage: resources.length
      ? Math.round((runningResources.length / resources.length) * 100)
      : fallback.running_percentage,
    open_alerts: openAlerts.length,
    critical_alerts: openAlerts.filter((alert) => alert.severity === "critical").length,
    warning_alerts: openAlerts.filter((alert) => alert.severity === "warning").length,
  };
}

function countValues(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    if (value) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function optionValues(options: readonly { value: string }[]) {
  return options.map((option) => option.value);
}

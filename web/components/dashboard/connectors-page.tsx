"use client";

import { useEffect, useMemo, useState } from "react";
import {
  KeyRound,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchConnectorCatalog,
  fetchConnectorHealth,
  fetchConnectorRegistrations,
} from "@/services/infrasight-api";
import { TechnologyIcon, getConnectorIcon } from "@/dashboard/resourceIcons";
import type {
  ConnectorCatalogItem,
  ConnectorHealth,
  ConnectorRegistration,
  Resource,
  Workspace,
} from "@/types/infrasight";

type ConnectorSetupId = "aws" | "azure" | "agent" | "docker" | "kubernetes";

const SETUP_PAGES: Record<
  ConnectorSetupId,
  {
    title: string;
    connectorTypes: string[];
    description: string;
    auth: string;
    collects: string[];
    steps: string[];
    maskedFields: string[];
  }
> = {
  aws: {
    title: "AWS",
    connectorTypes: ["aws"],
    description: "Read-only cloud connector using IAM role credentials.",
    auth: "Use a read-only IAM role with external ID and least-privilege policies for EC2, RDS, CloudWatch, CloudWatch Logs, and CloudTrail.",
    collects: ["EC2", "RDS", "CloudWatch metrics", "CloudWatch logs", "CloudTrail events"],
    maskedFields: ["role_arn", "external_id", "access_key_id", "secret_access_key"],
    steps: [
      "Create an IAM role trusted by the InfraSight workspace account.",
      "Attach read-only permissions for EC2, RDS, CloudWatch, Logs, and CloudTrail.",
      "Store the role ARN and external ID as encrypted connector credentials.",
      "Run a read-only sync to populate resources, metrics, logs, and events.",
    ],
  },
  azure: {
    title: "Azure",
    connectorTypes: ["azure"],
    description: "Read-only Azure connector using App Registration or Managed Identity.",
    auth: "Grant Reader plus monitoring/log read permissions to an App Registration or Managed Identity scoped to the subscription/resource groups.",
    collects: ["Azure VMs", "Azure Monitor metrics", "Log Analytics logs", "Activity Logs"],
    maskedFields: ["tenant_id", "client_id", "client_secret", "subscription_id"],
    steps: [
      "Create or select an App Registration or Managed Identity.",
      "Assign Reader and monitoring/log read roles at the required scope.",
      "Store tenant, client, subscription, and secret values as encrypted connector credentials.",
      "Run a read-only sync to collect Azure inventory, metrics, logs, and activity events.",
    ],
  },
  agent: {
    title: "Windows/Linux Agent",
    connectorTypes: ["agent", "linux", "windows"],
    description: "Lightweight on-prem/server agent using outbound HTTPS only.",
    auth: "Agent enrollment uses a workspace-scoped token. No inbound firewall access or SSH/WinRM listener is required.",
    collects: ["CPU", "Memory", "Disk", "Services", "Uptime", "Docker status", "Local logs"],
    maskedFields: ["enrollment_token", "workspace_id"],
    steps: [
      "Generate a workspace-scoped enrollment token.",
      "Install the agent on Windows or Linux hosts.",
      "Allow outbound HTTPS to the InfraSight ingestion endpoint.",
      "Verify host telemetry appears as server resources in the selected workspace.",
    ],
  },
  docker: {
    title: "Docker Host",
    connectorTypes: ["docker"],
    description: "Container telemetry collected by the local agent or Docker host connector.",
    auth: "Prefer local agent collection through outbound HTTPS. Do not expose the Docker socket over the network.",
    collects: ["Container inventory", "Image", "Host", "Status", "Health", "CPU", "Memory", "Restarts", "Container logs"],
    maskedFields: ["agent_token", "docker_socket"],
    steps: [
      "Install the agent on the Docker host.",
      "Enable local Docker socket read access for the agent service account.",
      "Collect container inventory and health through outbound HTTPS.",
      "Review containers in the Containers page and dependency graph.",
    ],
  },
  kubernetes: {
    title: "Kubernetes",
    connectorTypes: ["kubernetes"],
    description: "Helm chart connector that sends Kubernetes telemetry back to InfraSight.",
    auth: "Use a scoped service account with read-only RBAC for cluster, workload, event, and log collection.",
    collects: ["Clusters", "Nodes", "Pods", "Deployments", "Services", "Events", "Logs"],
    maskedFields: ["helm_token", "cluster_id", "ingestion_key"],
    steps: [
      "Add the InfraSight Helm repository.",
      "Install the chart with the workspace ID and encrypted ingestion token.",
      "Apply read-only RBAC for nodes, pods, deployments, services, events, and logs.",
      "Verify resources appear in the Kubernetes and Topology pages.",
    ],
  },
};

/**
 * Workspace-scoped connector setup and status page.
 *
 * What it does:
 * - Shows read-only setup instructions for AWS, Azure, Agent, Docker and Kubernetes
 * - Displays connector status, last sync and collected resource counts
 * - Shows only masked credential metadata returned by the backend
 *
 * Inputs:
 * - resources: active workspace resources used for scope counts
 * - workspace: active workspace summary shown in setup context
 */
export function ConnectorsPage({
  resources,
  workspace,
}: {
  resources: Resource[];
  workspace: Workspace;
}) {
  const [activeSetup, setActiveSetup] = useState<ConnectorSetupId>("aws");
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [health, setHealth] = useState<ConnectorHealth[]>([]);
  const [registrations, setRegistrations] = useState<ConnectorRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  const loadConnectors = async () => {
    setLoading(true);
    try {
      const [nextCatalog, nextHealth, nextRegistrations] = await Promise.all([
        fetchConnectorCatalog(),
        fetchConnectorHealth(),
        fetchConnectorRegistrations(),
      ]);
      setCatalog(nextCatalog);
      setHealth(nextHealth);
      setRegistrations(nextRegistrations);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      loadConnectors().catch(() => setLoading(false));
    });
  }, [workspace.id]);

  const active = SETUP_PAGES[activeSetup];
  const activeHealth = health.filter((item) => active.connectorTypes.includes(item.connector_type));
  const activeRegistrations = registrations.filter((item) => active.connectorTypes.includes(item.connector_type));
  const activeCollectedResources = activeHealth.reduce((total, item) => total + item.resources, 0);
  const latestSync = latestDate(activeRegistrations.map((registration) => registration.last_checked_at));

  const summary = useMemo(() => {
    const connected = health.filter((item) => normalizeConnectorStatus(item.status) === "Connected").length;
    const degraded = health.filter((item) => normalizeConnectorStatus(item.status) === "Degraded").length;
    const failed = health.filter((item) => normalizeConnectorStatus(item.status) === "Failed").length;
    return { connected, degraded, failed };
  }, [health]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard label="Connected" value={summary.connected} status="Healthy" />
        <StatusCard label="Degraded" value={summary.degraded} status="Warning" />
        <StatusCard label="Failed" value={summary.failed} status="Critical" />
      </section>

      <Card className="console-line">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Workspace Connectors</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {workspace.name} connector architecture is workspace-scoped, read-only, and credential-safe.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => loadConnectors()} disabled={loading}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {(Object.keys(SETUP_PAGES) as ConnectorSetupId[]).map((key) => {
            const setup = SETUP_PAGES[key];
            const status = statusForTypes(setup.connectorTypes, health);
            const Icon = getConnectorIcon(key);
            return (
              <button
                className={`rounded-md border p-4 text-left transition-colors ${
                  activeSetup === key
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-background/60 hover:bg-muted/40"
                }`}
                key={key}
                onClick={() => setActiveSetup(key)}
              >
                <div className="mb-3 flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
                  <Icon className="size-7" />
                </div>
                <div className="font-medium">{setup.title}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <SeverityBadge severity={statusToSeverity(status)} />
                  <span className="text-xs text-muted-foreground">
                    {resourcesForTypes(setup.connectorTypes, health)} resources
                  </span>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card className="console-line">
          <CardHeader>
            <CardTitle>{active.title} Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-md border border-border bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{active.description}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{active.auth}</p>
                </div>
                <Badge className="normal-case">Read-only</Badge>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Collection scope
              </p>
              <div className="flex flex-wrap gap-2">
                {active.collects.map((item) => (
                  <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Setup instructions
              </p>
              <ol className="grid gap-2">
                {active.steps.map((step, index) => (
                  <li className="flex gap-3 rounded-md border border-border bg-background/60 p-3 text-sm" key={step}>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 text-primary" />
                Credential handling
              </div>
              <p className="text-sm text-muted-foreground">
                Credentials are stored as encrypted integration secrets and only masked references are returned to the browser.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {active.maskedFields.map((field) => (
                  <div className="rounded border border-border bg-background/60 px-3 py-2 text-xs" key={field}>
                    <span className="text-muted-foreground">{field}</span>
                    <span className="float-right font-medium">masked</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="console-line">
          <CardHeader>
            <CardTitle>Connector Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniStat label="Status" value={statusForTypes(active.connectorTypes, health)} />
              <MiniStat label="Last Sync" value={latestSync ? formatDate(latestSync) : "Not synced"} />
              <MiniStat label="Resources" value={activeCollectedResources} />
              <MiniStat label="Workspace Scope" value={resources.length} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Registered connectors
              </p>
              <div className="grid gap-2">
                {activeRegistrations.map((registration) => (
                  <div className="rounded-md border border-border bg-background/60 p-3" key={registration.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{registration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {registration.connector_type} · {registration.last_status}
                        </p>
                      </div>
                      <SeverityBadge severity={statusToSeverity(normalizeConnectorStatus(registration.last_status))} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Last checked {registration.last_checked_at ? formatDate(registration.last_checked_at) : "never"}
                    </div>
                  </div>
                ))}
                {activeRegistrations.length === 0 && (
                  <EmptyState text="No connector registration exists for this setup yet." />
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Architecture model
              </p>
              <div className="grid gap-2 text-sm text-muted-foreground">
                {[
                  "Workspace owns connectors, resources, metrics, logs, alerts, sync runs, topology, and OpenClaw context.",
                  "Connector credentials are encrypted server-side and masked in UI/API responses.",
                  "Connectors collect telemetry only; infrastructure changes are not available from this UI.",
                  "Cloud, agent, Docker, and Kubernetes telemetry converge into the unified resource and topology model.",
                ].map((item) => (
                  <div className="rounded-md border border-border bg-background/60 p-3" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="console-line">
        <CardHeader>
          <CardTitle>Connector Catalog</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {catalog.map((item) => (
            <div className="rounded-md border border-border bg-background/60 p-3" key={item.connector_type}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <TechnologyIcon name={item.connector_type} surface="tooltip" />
                  {item.label}
                </div>
                <Badge className="normal-case">{item.platform}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.capabilities.map((capability) => (
                  <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground" key={capability.key}>
                    {capability.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {catalog.length === 0 && <EmptyState text="Connector catalog unavailable." />}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ label, status, value }: { label: string; status: string; value: number }) {
  return (
    <Card className="console-line">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <ShieldCheck className="size-5 text-primary" />
          <SeverityBadge severity={status} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function statusForTypes(types: string[], health: ConnectorHealth[]) {
  const statuses = health.filter((item) => types.includes(item.connector_type)).map((item) => normalizeConnectorStatus(item.status));
  if (statuses.includes("Failed")) return "Failed";
  if (statuses.includes("Degraded")) return "Degraded";
  if (statuses.includes("Connected")) return "Connected";
  return "Ready";
}

function resourcesForTypes(types: string[], health: ConnectorHealth[]) {
  return health
    .filter((item) => types.includes(item.connector_type))
    .reduce((total, item) => total + item.resources, 0);
}

function normalizeConnectorStatus(status: string) {
  const lower = status.toLowerCase();
  if (["connected", "active", "success", "registered"].includes(lower)) return "Connected";
  if (["degraded", "warning", "partial"].includes(lower)) return "Degraded";
  if (["failed", "error"].includes(lower)) return "Failed";
  return "Ready";
}

function statusToSeverity(status: string) {
  if (status === "Connected") return "Healthy";
  if (status === "Degraded") return "Warning";
  if (status === "Failed") return "Critical";
  return "Unknown";
}

function latestDate(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

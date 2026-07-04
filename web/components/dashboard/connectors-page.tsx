"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { InfoTile, MiniStat } from "@/components/dashboard/info-tile";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ControlToolbar } from "@/components/ui/controls";
import { ActionBanner, type ActionResult } from "@/components/ui/action-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CONNECTOR_REGISTRY,
  CONNECTOR_SECTION_ORDER,
  connectorRegistryItemById,
  type ConnectorAction,
  type ConnectorConnectionOption,
  type ConnectorRegistryItem,
  type ConnectorSectionConfig,
  type ConnectorSectionId,
} from "@/dashboard/connectors";
import { TechnologyIcon } from "@/dashboard/resourceIcons";
import {
  fetchConnectorCatalog,
  fetchConnectorHealth,
  fetchConnectorRegistrations,
  fetchConnectorResources,
  runConnectorDiscovery,
  saveConnectorInstance,
  synchronizeConnector,
  testConnectorConnection,
} from "@/services/infrasight-api";
import type {
  ConnectorCatalogItem,
  ConnectorHealth,
  ConnectorRegistration,
  ConnectorOperationResult,
  Resource,
  Workspace,
} from "@/types/infrasight";

type ConnectorRuntime = {
  health: ConnectorHealth[];
  latestSync: string | null;
  registrations: ConnectorRegistration[];
  resources: number;
  status: string;
  workspaceResources: number;
};

const SECTION_LABELS: Record<ConnectorSectionId, string> = {
  actions: "Actions",
  authentication: "Authentication",
  connection: "Connection",
  discovery: "Discovery",
  health: "Health",
  logs: "Logs",
  overview: "Overview",
  resources: "Resources",
  synchronization: "Synchronization",
};

/**
 * Workspace-scoped reusable connector framework.
 *
 * Connector-specific behavior is supplied by CONNECTOR_REGISTRY. The UI
 * always renders the same section model so adding a future connector is data
 * work rather than page-layout work.
 */
export function ConnectorsPage({
  onRefreshWorkspace,
  resources,
  workspace,
}: {
  onRefreshWorkspace?: () => Promise<void>;
  resources: Resource[];
  workspace: Workspace;
}) {
  const [activeConnectorId, setActiveConnectorId] = useState(CONNECTOR_REGISTRY[0].id);
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [health, setHealth] = useState<ConnectorHealth[]>([]);
  const [registrations, setRegistrations] = useState<ConnectorRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [forms, setForms] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(CONNECTOR_REGISTRY.map((connector) => [connector.id, defaultConnectorForm(connector)])),
  );
  const [workflow, setWorkflow] = useState<Record<string, number>>({});

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

  const activeConnector = connectorRegistryItemById(activeConnectorId);
  const runtime = runtimeForConnector(activeConnector, health, registrations, resources.length);
  const activeForm = forms[activeConnector.id] ?? defaultConnectorForm(activeConnector);
  const updateActiveForm = (key: string, value: string) => {
    setForms((current) => ({
      ...current,
      [activeConnector.id]: {
        ...(current[activeConnector.id] ?? defaultConnectorForm(activeConnector)),
        [key]: value,
      },
    }));
  };
  const handleConnectorAction = async (action: ConnectorAction) => {
    setActionResult({ ok: true, message: `${activeConnector.displayName}: ${action.label} started.` });
    try {
      const connector = await saveActiveConnector(activeConnector, activeForm);
      setWorkflow((current) => ({ ...current, [activeConnector.id]: Math.max(current[activeConnector.id] ?? 0, 2) }));
      const result = await runConnectorAction(action, connector.id);
      setActionResult({ ok: true, message: result });
      await loadConnectors();
      await onRefreshWorkspace?.();
    } catch (error) {
      setActionResult({
        ok: false,
        message: error instanceof Error ? error.message : `${activeConnector.displayName}: ${action.label} failed.`,
      });
    }
  };

  const saveActiveConnector = async (connector: ConnectorRegistryItem, form: Record<string, string>) => {
    const saved = await saveConnectorInstance({
      provider: connector.id,
      connection_type: connector.id === "docker" ? form.connection_method : connector.connectionType,
      status: "configured",
      configuration: connectorConfiguration(connector, form),
      credentials: connectorCredentials(connector, form),
    });
    setWorkflow((current) => ({ ...current, [connector.id]: Math.max(current[connector.id] ?? 0, 2) }));
    return saved;
  };

  const runConnectorAction = async (action: ConnectorAction, connectorId: number) => {
    if (action.id === "test_connection" || action.id.startsWith("validate_") || action.id.startsWith("verify_")) {
      const message = operationMessage(activeConnector.displayName, await testConnectorConnection(connectorId));
      setWorkflow((current) => ({ ...current, [activeConnector.id]: Math.max(current[activeConnector.id] ?? 0, 3) }));
      return message;
    }

    if (action.id === "sync_now") {
      const message = operationMessage(activeConnector.displayName, await synchronizeConnector(connectorId));
      setWorkflow((current) => ({ ...current, [activeConnector.id]: 6 }));
      return message;
    }

    if (action.id === "run_discovery" || action.id.startsWith("discover_")) {
      setWorkflow((current) => ({ ...current, [activeConnector.id]: Math.max(current[activeConnector.id] ?? 0, 4) }));
      const message = operationMessage(activeConnector.displayName, await runConnectorDiscovery(connectorId));
      setWorkflow((current) => ({ ...current, [activeConnector.id]: 6 }));
      return message;
    }

    if (action.id === "view_resources") {
      const discovered = await fetchConnectorResources(connectorId);
      if (!discovered.length) {
        return `${activeConnector.displayName}: no discovered resources yet. Run Discovery or Sync Now to populate resources.`;
      }
      const resourceTypes = Array.from(new Set(discovered.map((resource) => resource.resource_type))).join(", ");
      return `${activeConnector.displayName}: returned ${discovered.length} discovered resources (${resourceTypes}).`;
    }

    return `${activeConnector.displayName}: ${action.label} completed. Connector configuration was saved locally.`;
  };

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
          {CONNECTOR_REGISTRY.map((connector) => (
            <ConnectorCard
              active={connector.id === activeConnector.id}
              connector={connector}
              key={connector.id}
              onSelect={() => {
                setActiveConnectorId(connector.id);
                setActionResult(null);
              }}
              runtime={runtimeForConnector(connector, health, registrations, resources.length)}
            />
          ))}
        </CardContent>
      </Card>

      <ConnectorFrameworkPage
        actionResult={actionResult}
        connector={activeConnector}
        onAction={handleConnectorAction}
        onDismissAction={() => setActionResult(null)}
        form={activeForm}
        onFormChange={updateActiveForm}
        stepIndex={workflow[activeConnector.id] ?? 0}
        runtime={runtime}
        workspace={workspace}
      />

      <ConnectorCatalog catalog={catalog} />
    </div>
  );
}

function ConnectorCard({
  active,
  connector,
  onSelect,
  runtime,
}: {
  active: boolean;
  connector: ConnectorRegistryItem;
  onSelect: () => void;
  runtime: ConnectorRuntime;
}) {
  return (
    <button
      className={`rounded-md border p-4 text-left outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-background/60 hover:bg-muted/40"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="mb-3 flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
        <TechnologyIcon className="size-7" name={connector.icon} surface="tooltip" />
      </div>
      <div className="font-medium">{connector.displayName}</div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{connector.description}</p>
      <Badge className="mt-3 normal-case">{connector.connectionType}</Badge>
      <div className="mt-3 flex items-center justify-between gap-2">
        <SeverityBadge severity={statusToSeverity(runtime.status)} />
        <span className="text-xs text-muted-foreground">{runtime.resources} resources</span>
      </div>
    </button>
  );
}

function ConnectorFrameworkPage({
  actionResult,
  connector,
  form,
  onAction,
  onDismissAction,
  onFormChange,
  runtime,
  stepIndex,
  workspace,
}: {
  actionResult: ActionResult | null;
  connector: ConnectorRegistryItem;
  form: Record<string, string>;
  onAction: (action: ConnectorAction) => void;
  onDismissAction: () => void;
  onFormChange: (key: string, value: string) => void;
  runtime: ConnectorRuntime;
  stepIndex: number;
  workspace: Workspace;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_0.82fr]">
      <Card className="console-line">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>{connector.displayName}</CardTitle>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{connector.description}</p>
          </div>
          <ControlToolbar>
            <Badge className="normal-case">{connector.category}</Badge>
            <Badge className="normal-case">{connector.connectionType}</Badge>
            <Badge className="normal-case">{connector.authenticationType}</Badge>
            <Badge className="normal-case">Read-only</Badge>
          </ControlToolbar>
        </CardHeader>
        <CardContent className="grid gap-4">
          {CONNECTOR_SECTION_ORDER.map((sectionId) =>
            sectionId === "actions" ? (
              <ConnectorActionsPanel
                actionResult={actionResult}
                connector={connector}
                form={form}
                key={sectionId}
                onAction={onAction}
                onDismissAction={onDismissAction}
                onFormChange={onFormChange}
                stepIndex={stepIndex}
              />
            ) : sectionId === "connection" ? (
              <ConnectorConnectionPanel
                connector={connector}
                key={sectionId}
                runtime={runtime}
                section={connector.sections[sectionId] ?? {}}
                workspace={workspace}
              />
            ) : (
              <ConnectorSectionCard
                connector={connector}
                key={sectionId}
                runtime={runtime}
                section={connector.sections[sectionId] ?? {}}
                sectionId={sectionId}
                workspace={workspace}
              />
            ),
          )}
        </CardContent>
      </Card>

      <ConnectorRuntimePanel connector={connector} runtime={runtime} />
    </section>
  );
}

function ConnectorActionsPanel({
  actionResult,
  connector,
  form,
  onAction,
  onDismissAction,
  onFormChange,
  stepIndex,
}: {
  actionResult: ActionResult | null;
  connector: ConnectorRegistryItem;
  form: Record<string, string>;
  onAction: (action: ConnectorAction) => void;
  onDismissAction: () => void;
  onFormChange: (key: string, value: string) => void;
  stepIndex: number;
}) {
  return (
    <InfoTile>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {SECTION_LABELS.actions}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure, save credentials, test connectivity, discover resources, and import them into the workspace inventory.
          </p>
        </div>
        <Badge className="normal-case">{CONNECTOR_LIFECYCLE[Math.min(stepIndex, CONNECTOR_LIFECYCLE.length - 1)]}</Badge>
      </div>

      <ConnectorLifecycleStrip stepIndex={stepIndex} />

      {actionResult && (
        <div className="mt-4">
          <ActionBanner onDismiss={onDismissAction} result={actionResult} />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <ConnectorOnboardingForm
          connector={connector}
          form={form}
          onAction={onAction}
          onFormChange={onFormChange}
        />
        <ConnectorOnboardingActions
          connector={connector}
          onAction={onAction}
        />
      </div>
    </InfoTile>
  );
}

function ConnectorLifecycleStrip({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-4 xl:grid-cols-7">
      {CONNECTOR_LIFECYCLE.map((step, index) => (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            index <= stepIndex
              ? "border-primary/35 bg-primary/10 text-primary"
              : "border-border bg-background/60 text-muted-foreground"
          }`}
          key={step}
        >
          <span className="font-semibold">{index + 1}</span>
          <span className="ml-2">{step}</span>
        </div>
      ))}
    </div>
  );
}

function ConnectorOnboardingForm({
  connector,
  form,
  onAction,
  onFormChange,
}: {
  connector: ConnectorRegistryItem;
  form: Record<string, string>;
  onAction: (action: ConnectorAction) => void;
  onFormChange: (key: string, value: string) => void;
}) {
  if (connector.id === "agent") {
    return (
      <InfoTile className="bg-muted/20 p-3">
        <PanelTitle title="Agent enrollment" />
        <Field label="Enrollment Token">
          <div className="flex gap-2">
            <Input readOnly value={form.enrollment_token} />
            <Button size="sm" type="button" variant="secondary" onClick={() => onFormChange("enrollment_token", generatedToken("agent"))}>
              Generate
            </Button>
          </div>
        </Field>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <CommandBlock label="Windows Agent" value={`msiexec /i InfraSightAgent.msi WORKSPACE=${form.workspace_id} TOKEN=${form.enrollment_token}`} />
          <CommandBlock label="Linux Agent" value={`curl -fsSL https://agents.infrasight.local/linux.sh | sudo bash -s -- --workspace ${form.workspace_id} --token ${form.enrollment_token}`} />
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Button type="button" variant="secondary" onClick={() => onAction(actionFor("download_agent", "Download Windows Agent"))}>Download Windows Agent</Button>
          <Button type="button" variant="secondary" onClick={() => onAction(actionFor("download_agent", "Download Linux Agent"))}>Download Linux Agent</Button>
        </div>
        <InfoTile className="mt-3 bg-background/60 p-2.5">
          <p className="text-xs font-semibold">Connected Agents</p>
          <p className="mt-1 text-xs text-muted-foreground">linux-app-01 · win-iis-01 · awaiting verification</p>
        </InfoTile>
      </InfoTile>
    );
  }

  if (connector.id === "kubernetes") {
    return (
      <InfoTile className="bg-muted/20 p-3">
        <PanelTitle title="Kubernetes setup" />
        <FormGrid>
          <TextField label="Namespace" name="namespace" value={form.namespace} onChange={onFormChange} />
          <TextField label="Cluster ID" name="cluster_id" value={form.cluster_id} onChange={onFormChange} />
        </FormGrid>
        <Field label="Workspace Token">
          <div className="flex gap-2">
            <Input readOnly value={form.helm_token} />
            <Button size="sm" type="button" variant="secondary" onClick={() => onFormChange("helm_token", generatedToken("k8s"))}>
              Generate
            </Button>
          </div>
        </Field>
        <CommandBlock label="Helm Command" value={`helm upgrade --install infrasight-agent oci://registry.infrasight.local/agent --namespace ${form.namespace} --create-namespace --set workspaceToken=${form.helm_token}`} />
      </InfoTile>
    );
  }

  if (connector.id === "docker") {
    return (
      <InfoTile className="bg-muted/20 p-3">
        <PanelTitle title="Docker connection" />
        <FormGrid>
          <SelectField label="Connection Method" name="connection_method" value={form.connection_method} onChange={onFormChange} options={[["Agent", "Local Agent"], ["Docker Socket", "Docker Socket"]]} />
          <TextField label="Docker Socket" name="docker_socket" value={form.docker_socket} onChange={onFormChange} />
          <TextField label="Agent Token" name="agent_token" value={form.agent_token} onChange={onFormChange} />
        </FormGrid>
      </InfoTile>
    );
  }

  if (connector.id === "azure") {
    return (
      <InfoTile className="bg-muted/20 p-3">
        <PanelTitle title="Azure API configuration" />
        <FormGrid>
          <TextField label="Tenant ID" name="tenant_id" value={form.tenant_id} onChange={onFormChange} />
          <TextField label="Subscription" name="subscription_ids" value={form.subscription_ids} onChange={onFormChange} />
          <TextField label="Client ID" name="client_id" value={form.client_id} onChange={onFormChange} />
          <PasswordField label="Client Secret" name="client_secret" value={form.client_secret} onChange={onFormChange} />
        </FormGrid>
      </InfoTile>
    );
  }

  return (
    <InfoTile className="bg-muted/20 p-3">
      <PanelTitle title="AWS API configuration" />
      <FormGrid>
        <SelectField label="Connection Method" name="auth_mode" value={form.auth_mode} onChange={onFormChange} options={[["iam_role", "IAM Role"], ["access_keys", "Access Keys"]]} />
        <TextField label="Regions" name="regions" value={form.regions} onChange={onFormChange} />
        {form.auth_mode === "iam_role" ? (
          <>
            <TextField label="IAM Role ARN" name="role_arn" value={form.role_arn} onChange={onFormChange} />
            <PasswordField label="External ID" name="external_id" value={form.external_id} onChange={onFormChange} />
          </>
        ) : (
          <>
            <PasswordField label="Access Key ID" name="access_key_id" value={form.access_key_id} onChange={onFormChange} />
            <PasswordField label="Secret Access Key" name="secret_access_key" value={form.secret_access_key} onChange={onFormChange} />
          </>
        )}
      </FormGrid>
    </InfoTile>
  );
}

function ConnectorOnboardingActions({
  connector,
  onAction,
}: {
  connector: ConnectorRegistryItem;
  onAction: (action: ConnectorAction) => void;
}) {
  const discoveryLabel = connector.id === "docker" ? "Discover Containers" : connector.id === "kubernetes" ? "Discover Resources" : "Run Discovery";
  const testLabel = connector.id === "agent" ? "Verify Agent" : connector.id === "kubernetes" ? "Verify Cluster" : "Test Connection";
  return (
    <InfoTile className="bg-muted/20 p-3">
      <PanelTitle title="Workflow actions" />
      <div className="grid gap-2">
        <Button type="button" onClick={() => onAction(actionFor("save", "Save"))}>Save</Button>
        <Button type="button" variant="secondary" onClick={() => onAction(actionFor("test_connection", testLabel))}>{testLabel}</Button>
        <Button type="button" variant="secondary" onClick={() => onAction(actionFor("run_discovery", discoveryLabel))}>{discoveryLabel}</Button>
        <Button type="button" variant="secondary" onClick={() => onAction(actionFor("view_resources", "View Resources"))}>View Resources</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Successful discovery imports resources into Inventory, infrastructure views, topology, and dashboard counts.
      </p>
    </InfoTile>
  );
}

const CONNECTOR_LIFECYCLE = [
  "Disconnected",
  "Configured",
  "Credentials Saved",
  "Connection Tested",
  "Discovery Started",
  "Resources Imported",
  "Healthy",
];

function PanelTitle({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {title}
    </p>
  );
}

function FormGrid({ children }: { children: ReactNode }) {
  return <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function TextField({
  label,
  name,
  onChange,
  value,
}: {
  label: string;
  name: string;
  onChange: (key: string, value: string) => void;
  value?: string;
}) {
  return (
    <Field label={label}>
      <Input value={value ?? ""} onChange={(event) => onChange(name, event.target.value)} />
    </Field>
  );
}

function PasswordField(props: Parameters<typeof TextField>[0]) {
  return (
    <Field label={props.label}>
      <Input type="password" value={props.value ?? ""} onChange={(event) => props.onChange(props.name, event.target.value)} />
    </Field>
  );
}

function SelectField({
  label,
  name,
  onChange,
  options,
  value,
}: {
  label: string;
  name: string;
  onChange: (key: string, value: string) => void;
  options: Array<[string, string]>;
  value?: string;
}) {
  return (
    <Field label={label}>
      <Select value={value ?? ""} onChange={(event) => onChange(name, event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </Select>
    </Field>
  );
}

function CommandBlock({ label, value }: { label: string; value: string }) {
  return (
    <InfoTile className="bg-background/60 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <code className="mt-2 block break-words rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
        {value}
      </code>
    </InfoTile>
  );
}

function actionFor(id: string, label: string): ConnectorAction {
  return { id, label, description: label, scope: "common" };
}

function generatedToken(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function defaultConnectorForm(connector: ConnectorRegistryItem): Record<string, string> {
  if (connector.id === "aws") {
    return {
      auth_mode: "iam_role",
      role_arn: "arn:aws:iam::123456789012:role/InfraSightReadOnly",
      external_id: "infrasight-demo-external-id",
      access_key_id: "",
      secret_access_key: "",
      regions: "eu-west-2, eu-west-1",
    };
  }
  if (connector.id === "azure") {
    return {
      tenant_id: "00000000-0000-0000-0000-000000000000",
      subscription_ids: "demo-subscription",
      client_id: "demo-client-id",
      client_secret: "demo-client-secret",
    };
  }
  if (connector.id === "agent") {
    return {
      enrollment_token: generatedToken("agent"),
      workspace_id: "internal",
      ingestion_url: "https://ingest.infrasight.local",
    };
  }
  if (connector.id === "docker") {
    return {
      connection_method: "Agent",
      docker_socket: "/var/run/docker.sock",
      agent_token: generatedToken("docker"),
    };
  }
  return {
    namespace: "infrasight-system",
    cluster_id: "demo-cluster",
    helm_token: generatedToken("k8s"),
  };
}

function connectorConfiguration(connector: ConnectorRegistryItem, form: Record<string, string>) {
  return {
    ...form,
    authentication_type: connector.authenticationType,
    category: connector.category,
    display_name: connector.displayName,
    mock_connection_result: "success",
    supported_discovery_methods: connector.supportedDiscoveryMethods,
    supported_resource_types: connector.supportedResourceTypes,
  };
}

function connectorCredentials(connector: ConnectorRegistryItem, form: Record<string, string>) {
  if (connector.id === "aws") {
    return form.auth_mode === "iam_role"
      ? [
          { type: "role_arn", value: form.role_arn },
          { type: "external_id", value: form.external_id },
        ]
      : [
          { type: "access_key_id", value: form.access_key_id },
          { type: "secret_access_key", value: form.secret_access_key },
        ];
  }
  if (connector.id === "azure") {
    return [{ type: "client_secret", value: form.client_secret }];
  }
  if (connector.id === "agent") {
    return [{ type: "enrollment_token", value: form.enrollment_token }];
  }
  if (connector.id === "docker") {
    return [{ type: "agent_token", value: form.agent_token || form.docker_socket }];
  }
  return [{ type: "helm_token", value: form.helm_token }];
}

function ConnectorConnectionPanel({
  connector,
  runtime,
  section,
  workspace,
}: {
  connector: ConnectorRegistryItem;
  runtime: ConnectorRuntime;
  section: ConnectorSectionConfig;
  workspace: Workspace;
}) {
  const sectionMetrics = metricsForSection("connection", connector, runtime, workspace);

  return (
    <InfoTile>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {SECTION_LABELS.connection}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {section.description ?? "Choose the connection path and complete the required setup workflow."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Badge className="normal-case">{connector.connectionType}</Badge>
          {connector.connectionOptions.length > 1 && (
            <Badge className="normal-case">{connector.connectionOptions.length} options</Badge>
          )}
        </div>
      </div>

      {sectionMetrics.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {sectionMetrics.map((metric) => (
            <MiniStat key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {connector.connectionOptions.map((option) => (
          <ConnectorConnectionOptionCard
            connector={connector}
            key={option.id}
            option={option}
          />
        ))}
      </div>
    </InfoTile>
  );
}

function ConnectorConnectionOptionCard({
  connector,
  option,
}: {
  connector: ConnectorRegistryItem;
  option: ConnectorConnectionOption;
}) {
  const fields = connector.configurationSchema.filter((field) =>
    option.configurationFields?.includes(field.key),
  );

  return (
    <InfoTile className="bg-muted/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{option.label}</p>
            <Badge className="normal-case">{option.type}</Badge>
            {option.recommended && <Badge className="normal-case">Recommended</Badge>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
        </div>
      </div>

      {option.authenticationMethods && option.authenticationMethods.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Authentication
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {option.authenticationMethods.map((method) => (
              <Badge className="normal-case" key={method}>
                {method}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {option.workflow && option.workflow.length > 0 && (
        <ol className="mt-3 grid gap-2">
          {option.workflow.map((step, index) => (
            <li className="flex gap-3 rounded-md border border-border bg-background/60 p-3 text-sm" key={step}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {fields.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => (
            <InfoTile className="bg-background/60 p-2.5" key={field.key}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {field.label}
              </p>
              <p className="mt-1 text-xs font-medium">
                {field.type}
                {field.required ? " · required" : ""}
                {field.sensitive ? " · masked" : ""}
              </p>
            </InfoTile>
          ))}
        </div>
      )}
    </InfoTile>
  );
}

function ConnectorSectionCard({
  connector,
  runtime,
  section,
  sectionId,
  workspace,
}: {
  connector: ConnectorRegistryItem;
  runtime: ConnectorRuntime;
  section: ConnectorSectionConfig;
  sectionId: ConnectorSectionId;
  workspace: Workspace;
}) {
  const sectionMetrics = metricsForSection(sectionId, connector, runtime, workspace);
  const registryFields = fieldsForSection(sectionId, connector, section);
  const registryItems = itemsForSection(sectionId, connector, section);

  return (
    <InfoTile>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {SECTION_LABELS[sectionId]}
          </p>
          {section.description && (
            <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
          )}
        </div>
        {sectionMetrics.length > 0 && (
          <div className="grid min-w-[12rem] gap-2 sm:grid-cols-2">
            {sectionMetrics.map((metric) => (
              <MiniStat key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        )}
      </div>

      {registryFields.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {registryFields.map((field) => (
            <InfoTile className="bg-muted/20 p-2.5" key={field.label}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {field.label}
              </p>
              <p className="mt-1 break-words text-xs font-medium">
                {field.masked ? "••••••••" : field.value}
              </p>
              {field.masked && (
                <p className="mt-1 text-[10px] text-muted-foreground">{field.value}</p>
              )}
            </InfoTile>
          ))}
        </div>
      )}

      {registryItems.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {registryItems.map((item) => (
            <Badge className="normal-case" key={item}>
              {item}
            </Badge>
          ))}
        </div>
      )}

      {sectionId === "health" && connector.healthChecks.length > 0 && (
        <div className="mt-4 grid gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Health checks
          </p>
          {connector.healthChecks.map((check) => (
            <InfoTile className="bg-muted/20 p-2.5" key={check.id}>
              <p className="text-xs font-semibold">{check.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{check.description}</p>
            </InfoTile>
          ))}
        </div>
      )}

      {section.steps && section.steps.length > 0 && (
        <ol className="mt-4 grid gap-2">
          {section.steps.map((step, index) => (
            <li className="flex gap-3 rounded-md border border-border bg-background/60 p-3 text-sm" key={step}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </InfoTile>
  );
}

function ConnectorRuntimePanel({
  connector,
  runtime,
}: {
  connector: ConnectorRegistryItem;
  runtime: ConnectorRuntime;
}) {
  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle>Connector Runtime</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat label="Status" value={runtime.status} />
          <MiniStat label="Last Sync" value={runtime.latestSync ? formatDate(runtime.latestSync) : "Not synced"} />
          <MiniStat label="Resources" value={runtime.resources} />
          <MiniStat label="Workspace Scope" value={runtime.workspaceResources} />
        </div>

        <InfoTile>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4 text-primary" />
            Configuration Model
          </div>
          <p className="text-sm text-muted-foreground">{connector.statusModel}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Credentials and tokens are represented as masked fields and should be persisted as encrypted integration secrets when backend integration is added.
          </p>
        </InfoTile>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Registered connectors
          </p>
          <div className="grid gap-2">
            {runtime.registrations.map((registration) => (
              <InfoTile key={registration.id}>
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
              </InfoTile>
            ))}
            {runtime.registrations.length === 0 && (
              <EmptyState text="No connector registration exists for this connector yet." />
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Framework guarantees
          </p>
          <div className="grid gap-2 text-sm text-muted-foreground">
            {[
              "All connectors render through the same section model.",
              "Connector-specific fields are data-driven and masked by default when marked sensitive.",
              "Cloud, agent, Docker, Kubernetes, and future integrations feed the same resource and topology model.",
              "The UI remains read-only until backend connector actions are implemented.",
            ].map((item) => (
              <InfoTile key={item}>{item}</InfoTile>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectorCatalog({ catalog }: { catalog: ConnectorCatalogItem[] }) {
  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle>Connector Catalog</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {catalog.map((item) => (
          <InfoTile key={item.connector_type}>
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
                <Badge className="normal-case" key={capability.key}>
                  {capability.label}
                </Badge>
              ))}
            </div>
          </InfoTile>
        ))}
        {catalog.length === 0 && <EmptyState text="Connector catalog unavailable." />}
      </CardContent>
    </Card>
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

function runtimeForConnector(
  connector: ConnectorRegistryItem,
  health: ConnectorHealth[],
  registrations: ConnectorRegistration[],
  workspaceResources: number,
): ConnectorRuntime {
  const connectorHealth = health.filter((item) => connector.connectorTypes.includes(item.connector_type));
  const connectorRegistrations = registrations.filter((item) => connector.connectorTypes.includes(item.connector_type));
  return {
    health: connectorHealth,
    latestSync: latestDate(connectorRegistrations.map((registration) => registration.last_checked_at)),
    registrations: connectorRegistrations,
    resources: connectorHealth.reduce((total, item) => total + item.resources, 0),
    status: statusForTypes(connector.connectorTypes, health),
    workspaceResources,
  };
}

function metricsForSection(
  sectionId: ConnectorSectionId,
  connector: ConnectorRegistryItem,
  runtime: ConnectorRuntime,
  workspace: Workspace,
) {
  if (sectionId === "overview") {
    return [
      { label: "Category", value: connector.category },
      { label: "Workspace", value: workspace.name },
    ];
  }

  if (sectionId === "resources") {
    return [
      { label: "Collected", value: runtime.resources },
      { label: "Scope", value: runtime.workspaceResources },
    ];
  }

  if (sectionId === "health") {
    return [
      { label: "Status", value: runtime.status },
      { label: "Signals", value: runtime.health.length },
    ];
  }

  if (sectionId === "synchronization") {
    return [
      { label: "Last Sync", value: runtime.latestSync ? formatDate(runtime.latestSync) : "Not synced" },
    ];
  }

  if (sectionId === "connection") {
    return [{ label: "Registrations", value: runtime.registrations.length }];
  }

  return [];
}

function fieldsForSection(
  sectionId: ConnectorSectionId,
  connector: ConnectorRegistryItem,
  section: ConnectorSectionConfig,
) {
  if (sectionId === "authentication") {
    return connector.configurationSchema.map((field) => ({
      label: field.label,
      masked: field.sensitive,
      value: `${field.type}${field.required ? " · required" : ""}`,
    }));
  }

  if (section.fields?.length) return section.fields;
  return [];
}

function itemsForSection(
  sectionId: ConnectorSectionId,
  connector: ConnectorRegistryItem,
  section: ConnectorSectionConfig,
) {
  if (sectionId === "overview") {
    return [
      `id: ${connector.id}`,
      connector.category,
      connector.authenticationType,
      ...connector.connectorTypes.map((type) => `type: ${type}`),
    ];
  }

  if (sectionId === "discovery") return connector.supportedDiscoveryMethods;
  if (sectionId === "resources") return connector.supportedResourceTypes;
  if (sectionId === "health") return connector.supportedMetrics;
  if (sectionId === "logs") return connector.supportedLogs;

  if (section.items?.length) return section.items;
  return [];
}

function statusForTypes(types: string[], health: ConnectorHealth[]) {
  const statuses = health.filter((item) => types.includes(item.connector_type)).map((item) => normalizeConnectorStatus(item.status));
  if (statuses.includes("Failed")) return "Failed";
  if (statuses.includes("Degraded")) return "Degraded";
  if (statuses.includes("Connected")) return "Connected";
  return "Ready";
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

function operationMessage(displayName: string, result: ConnectorOperationResult) {
  const resourceCount = result.resources.length;
  const syncCount = result.sync?.resources_discovered;
  const resourceSummary = resourceCount
    ? ` Returned ${resourceCount} resources.`
    : syncCount
      ? ` Synchronized ${syncCount} resources.`
      : "";
  return `${displayName}: ${result.message}${resourceSummary}`;
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

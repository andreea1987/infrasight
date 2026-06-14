/**
 * InfraSight API Client
 * =====================
 * Centralised REST client for all InfraSight backend calls.
 *
 * Multi-tenancy: every request carries X-InfraSight-Tenant / Organization /
 * Actor / Role headers so the backend can scope queries correctly.
 * Call setActiveOrganization() when the user switches org in the sidebar.
 *
 * OpenClaw WebSocket: use getOpenClawWebSocketUrl() to get the streaming
 * chat endpoint URL including the active tenant as query params.
 */

import type {
  AlertRecord,
  AlertStatusUpdate,
  AiProviderConfig,
  AiProviderConfigPayload,
  AiProviderTestResult,
  ChannelForm,
  InfraSightSnapshot,
  ManagedUser,
  ManagedUserInvite,
  ManagedUserUpdate,
  MetricSample,
  MonitoringSummary,
  NotificationChannel,
  Resource,
  AlertDelivery,
  AuthSession,
  ConnectorCatalogItem,
  ConnectorHealth,
  ConnectorRegistration,
  DiscoveryRun,
  DiscoverySummary,
  Organization,
  OrganizationContext,
  OperationalSummary,
  SmtpConfig,
  SmtpConfigUpdate,
  SsoProviderConfig,
  SsoProviderConfigPayload,
  SsoStartResponse,
  TopologyGraph,
} from "@/types/infrasight";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
export const WS_URL = API_URL.replace("http", "ws");
const LOCAL_AUTH_FALLBACK_KEY = "infrasight.localAuthSession";
const LOCAL_USERS_FALLBACK_KEY = "infrasight.localUsers";
const LOCAL_AI_PROVIDERS_FALLBACK_KEY = "infrasight.localAiProviders";

/** WebSocket URL for the OpenClaw streaming chat endpoint. */
export const OPENCLAW_WS_URL = `${WS_URL}/openclaw/ws/chat`;

let activeOrganization = "internal";
let activeActor = "dashboard";
let activeRole = "msp_admin";

/** Update the active organization context for all subsequent API calls. */
export function setActiveOrganization(tenantId: string) {
  activeOrganization = tenantId || "internal";
}

export function getActiveOrganization() {
  return activeOrganization;
}

/** Update request identity headers after sign-in or logout. */
export function setAuthContext(session: AuthSession | null) {
  activeActor = session?.user.email ?? "dashboard";
  activeRole = session?.user.role ?? "msp_admin";
}

/**
 * Build the OpenClaw WebSocket URL with the active tenant context encoded
 * as query params so the backend can scope tool results correctly.
 */
export function getOpenClawWebSocketUrl() {
  const params = new URLSearchParams({
    tenant: activeOrganization,
    organization: activeOrganization,
  });

  return `${OPENCLAW_WS_URL}?${params.toString()}`;
}

/**
 * Standard workspace headers injected into every REST request.
 *
 * Inputs:
 * - optional extra headers such as Content-Type
 *
 * Output:
 * - header object carrying workspace, organization, actor and role context
 *
 * Assumption:
 * - activeOrganization is updated before calls that depend on selected workspace.
 */
function tenantHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "X-InfraSight-Tenant": activeOrganization,
    "X-InfraSight-Organization": activeOrganization,
    "X-InfraSight-Actor": activeActor,
    "X-InfraSight-Role": activeRole,
    ...extra,
  };
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: tenantHeaders(),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: tenantHeaders(body ? { "Content-Type": "application/json" } : undefined),
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function putJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: tenantHeaders(body ? { "Content-Type": "application/json" } : undefined),
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`PUT ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: tenantHeaders(),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`DELETE ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Sign in with local email/password auth.
 * The backend stores the session token in an HTTP-only cookie; the frontend
 * only receives non-secret user/workspace context.
 */
export async function loginWithPassword(email: string, password: string, workspaceId?: string) {
  let session: AuthSession;
  try {
    session = await postJson<AuthSession>("/auth/login", {
      email,
      password,
      workspace_id: workspaceId || undefined,
    });
  } catch (error) {
    if (!authBackendUnavailable(error)) throw error;
    session = createLocalDemoSession(email, password, workspaceId);
    storeLocalDemoSession(session);
  }
  setAuthContext(session);
  setActiveOrganization(session.user.workspace_id);
  return session;
}

/** Return the current cookie-backed session, or throw when expired. */
export async function fetchAuthSession() {
  let session: AuthSession;
  try {
    session = await getJson<AuthSession>("/auth/session");
  } catch (error) {
    if (!authBackendUnavailable(error)) throw error;
    const storedSession = readLocalDemoSession();
    if (!storedSession) throw error;
    session = storedSession;
  }
  setAuthContext(session);
  setActiveOrganization(session.user.workspace_id);
  return session;
}

/** Clear the backend session cookie and reset frontend request identity. */
export async function logout() {
  await postJson<{ status: string }>("/auth/logout").catch(() => undefined);
  clearLocalDemoSession();
  setAuthContext(null);
}

/** Resolve an SSO provider for a workspace/email before redirecting to IdP. */
export function startSsoSignIn(payload: { email?: string; workspace_id?: string; provider_id?: number }) {
  return postJson<SsoStartResponse>("/auth/sso/start", payload).catch((error) => {
    if (!authBackendUnavailable(error)) throw error;
    return {
      status: "pending_backend_integration",
      message: "The auth backend route is not available yet. Restart the backend to use configured SSO providers.",
      redirect_url: null,
    };
  });
}

function authBackendUnavailable(error: unknown) {
  return error instanceof Error && (
    error.message.includes("/auth/") && error.message.includes("404")
  );
}

/**
 * Local dev fallback used only when the backend auth routes are unavailable.
 *
 * This preserves the dashboard while an old API server is still running. Once
 * the backend is restarted and /auth/login exists, the HTTP-only cookie flow is
 * used instead.
 */
function createLocalDemoSession(email: string, password: string, workspaceId?: string): AuthSession {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== "admin@infrasight.local" || password !== "AdminDemo123!") {
    throw new Error("Invalid local demo credentials. Restart the backend for real local auth users.");
  }

  return {
    authenticated: true,
    expires_in_minutes: 480,
    user: {
      id: 0,
      email: normalizedEmail,
      role: "admin",
      workspace_id: workspaceId?.trim() || "internal",
      organization_id: workspaceId?.trim() || "internal",
      workspaces: [
        {
          id: workspaceId?.trim() || "internal",
          name: workspaceId?.trim() === "internal" || !workspaceId?.trim()
            ? "Internal Operations"
            : workspaceId.trim(),
          role: "admin",
        },
      ],
    },
  };
}

function storeLocalDemoSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_AUTH_FALLBACK_KEY, JSON.stringify(session));
}

function readLocalDemoSession() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LOCAL_AUTH_FALLBACK_KEY);
    return value ? (JSON.parse(value) as AuthSession) : null;
  } catch {
    return null;
  }
}

function clearLocalDemoSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_AUTH_FALLBACK_KEY);
}

export function fetchSsoProviders() {
  return getJson<SsoProviderConfig[]>("/auth/sso/providers");
}

export function createSsoProvider(provider: SsoProviderConfigPayload) {
  return postJson<SsoProviderConfig>("/auth/sso/providers", provider);
}

export function updateSsoProvider(providerId: number, provider: Partial<SsoProviderConfigPayload>) {
  return putJson<SsoProviderConfig>(`/auth/sso/providers/${providerId}`, provider);
}

export function testSsoProvider(providerId: number) {
  return postJson<{ status: string; detail: string; checked_at: string }>(
    `/auth/sso/providers/${providerId}/test`,
  );
}

// ---------------------------------------------------------------------------
// OpenClaw AI provider configuration
// ---------------------------------------------------------------------------

/** List masked, workspace-scoped AI providers for OpenClaw. */
export function fetchAiProviders() {
  return getJson<AiProviderConfig[]>("/openclaw/ai-providers").catch((error) => {
    if (!aiProviderBackendUnavailable(error)) throw error;
    return readLocalAiProviders();
  });
}

/** Create a provider config. Secrets are sent once and never returned unmasked. */
export function createAiProvider(payload: AiProviderConfigPayload) {
  return postJson<AiProviderConfig>("/openclaw/ai-providers", payload).catch((error) => {
    if (!aiProviderBackendUnavailable(error)) throw error;
    const providers = readLocalAiProviders();
    const provider = normalizeLocalAiProvider({
      ...payload,
      id: Date.now(),
      has_secret: Boolean(payload.api_secret),
      masked_secret: payload.api_secret ? "••••••••" : null,
      status: localAiProviderStatus(payload),
      created_at: new Date().toISOString(),
    });
    const next = provider.is_active
      ? providers.map((item) => ({ ...item, is_active: false }))
      : providers;
    writeLocalAiProviders([provider, ...next]);
    return provider;
  });
}

/** Update provider metadata and optionally replace its secret. */
export function updateAiProvider(providerId: number, payload: AiProviderConfigPayload) {
  return putJson<AiProviderConfig>(`/openclaw/ai-providers/${providerId}`, payload).catch((error) => {
    if (!aiProviderBackendUnavailable(error)) throw error;
    const providers = readLocalAiProviders();
    const next = providers.map((provider) =>
      provider.id === providerId
        ? normalizeLocalAiProvider({
            ...provider,
            ...payload,
            has_secret: provider.has_secret || Boolean(payload.api_secret),
            masked_secret: provider.has_secret || payload.api_secret ? "••••••••" : null,
            status: localAiProviderStatus({ ...provider, ...payload }),
            updated_at: new Date().toISOString(),
          })
        : payload.is_active
        ? { ...provider, is_active: false }
        : provider,
    );
    writeLocalAiProviders(next);
    const provider = next.find((entry) => entry.id === providerId);
    if (!provider) throw new Error("AI provider not found");
    return provider;
  });
}

/** Select one provider as active for the current workspace. */
export function activateAiProvider(providerId: number) {
  return postJson<AiProviderConfig>(`/openclaw/ai-providers/${providerId}/activate`).catch((error) => {
    if (!aiProviderBackendUnavailable(error)) throw error;
    const providers = readLocalAiProviders().map((provider) => ({
      ...provider,
      enabled: provider.id === providerId ? true : provider.enabled,
      is_active: provider.id === providerId,
    }));
    writeLocalAiProviders(providers);
    const provider = providers.find((entry) => entry.id === providerId);
    if (!provider) throw new Error("AI provider not found");
    return provider;
  });
}

/** Test provider configuration without sending workspace telemetry. */
export function testAiProvider(providerId: number) {
  return postJson<AiProviderTestResult>(`/openclaw/ai-providers/${providerId}/test`).catch((error) => {
    if (!aiProviderBackendUnavailable(error)) throw error;
    const providers = readLocalAiProviders();
    const provider = providers.find((entry) => entry.id === providerId);
    if (!provider) throw new Error("AI provider not found");
    const status = provider.status;
    const result: AiProviderTestResult = {
      status,
      detail: status === "Connected" ? "Provider configuration is complete (local demo)." : "Provider is missing required configuration.",
      checked_at: new Date().toISOString(),
      provider: {
        ...provider,
        last_test_at: new Date().toISOString(),
        last_test_result: status.toLowerCase().replaceAll(" ", "_"),
        last_test_error: status === "Connected" ? null : "Provider is missing required configuration.",
      },
    };
    writeLocalAiProviders(providers.map((entry) => (entry.id === providerId ? result.provider : entry)));
    return result;
  });
}

function aiProviderBackendUnavailable(error: unknown) {
  return error instanceof Error && (
    error.message.includes("/openclaw/ai-providers") && error.message.includes("404")
  );
}

function readLocalAiProviders(): AiProviderConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(LOCAL_AI_PROVIDERS_FALLBACK_KEY);
    if (stored) return JSON.parse(stored) as AiProviderConfig[];
  } catch {
    // Fall through to built-in seed config.
  }
  return [
    {
      id: 1,
      provider_name: "Built-in OpenClaw",
      provider_type: "builtin",
      base_url: null,
      model_name: "built-in",
      enabled: true,
      is_active: true,
      workspace_id: activeOrganization,
      has_secret: false,
      masked_secret: null,
      status: "Connected",
      last_test_at: null,
      last_test_result: "connected",
      last_test_error: null,
      created_at: new Date().toISOString(),
      updated_at: null,
    },
  ];
}

function writeLocalAiProviders(providers: AiProviderConfig[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_AI_PROVIDERS_FALLBACK_KEY, JSON.stringify(providers));
}

function normalizeLocalAiProvider(
  provider: Partial<AiProviderConfig> & Omit<Partial<AiProviderConfigPayload>, "base_url" | "model_name"> & {
    api_secret?: string;
    base_url?: string | null;
    model_name?: string | null;
  },
): AiProviderConfig {
  return {
    id: provider.id ?? Date.now(),
    provider_name: provider.provider_name ?? "AI Provider",
    provider_type: provider.provider_type ?? "builtin",
    base_url: provider.base_url ?? null,
    model_name: provider.model_name ?? null,
    enabled: provider.enabled ?? true,
    is_active: provider.is_active ?? false,
    workspace_id: provider.workspace_id ?? activeOrganization,
    has_secret: provider.has_secret ?? Boolean(provider.api_secret),
    masked_secret: provider.masked_secret ?? (provider.api_secret ? "••••••••" : null),
    status: provider.status ?? localAiProviderStatus(provider),
    last_test_at: provider.last_test_at ?? null,
    last_test_result: provider.last_test_result ?? null,
    last_test_error: provider.last_test_error ?? null,
    created_at: provider.created_at ?? new Date().toISOString(),
    updated_at: provider.updated_at ?? null,
  };
}

function localAiProviderStatus(
  provider: Partial<AiProviderConfig> & Omit<Partial<AiProviderConfigPayload>, "base_url" | "model_name"> & {
    api_secret?: string;
    base_url?: string | null;
    model_name?: string | null;
  },
): AiProviderConfig["status"] {
  if (provider.enabled === false) return "Not Configured";
  if (provider.provider_type === "builtin") return "Connected";
  if (["openai_compatible", "azure_openai", "ollama", "custom_http"].includes(provider.provider_type ?? "") && !provider.base_url) {
    return "Not Configured";
  }
  if (["openai_compatible", "azure_openai", "anthropic", "custom_http"].includes(provider.provider_type ?? "") && !provider.api_secret && !provider.has_secret) {
    return "Not Configured";
  }
  if (provider.provider_type !== "custom_http" && !provider.model_name) return "Not Configured";
  return "Connected";
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

/** List users that have access to the active workspace. */
export function fetchManagedUsers() {
  return getJson<Partial<ManagedUser>[]>("/internal/users")
    .then((users) => users.map(normalizeManagedUser))
    .catch((error) => {
      if (!userBackendUnavailable(error)) throw error;
      return readLocalUsers();
    });
}

/** Invite a user without creating destructive side effects. */
export function inviteManagedUser(payload: ManagedUserInvite) {
  return postJson<Partial<ManagedUser>>("/internal/users", payload).then(normalizeManagedUser).catch((error) => {
    if (!userBackendUnavailable(error)) throw error;
    const users = readLocalUsers();
    const existing = users.find((user) => user.email === payload.email.trim().toLowerCase());
    if (existing) throw new Error("User already exists");
    const user: ManagedUser = {
      id: Date.now(),
      email: payload.email.trim().toLowerCase(),
      display_name: payload.display_name || payload.email.split("@")[0],
      role: payload.role,
      workspace_ids: payload.workspace_ids.length ? payload.workspace_ids : [activeOrganization],
      auth_type: payload.auth_type,
      status: "invited",
      last_login_at: null,
    };
    writeLocalUsers([user, ...users]);
    return user;
  });
}

/** Change role, workspace access, display name or status for a managed user. */
export function updateManagedUser(userId: number, payload: ManagedUserUpdate) {
  return putJson<Partial<ManagedUser>>(`/internal/users/${userId}`, payload).then(normalizeManagedUser).catch((error) => {
    if (!userBackendUnavailable(error)) throw error;
    const users = readLocalUsers();
    const updated = users.map((user) =>
      user.id === userId
        ? {
            ...user,
            ...payload,
            workspace_ids: payload.workspace_ids ?? user.workspace_ids,
          }
        : user,
    );
    writeLocalUsers(updated);
    const user = updated.find((entry) => entry.id === userId);
    if (!user) throw new Error("User not found");
    return user;
  });
}

/** Disable/deactivate a user; deletion is intentionally not implemented. */
export function disableManagedUser(userId: number) {
  return postJson<Partial<ManagedUser>>(`/internal/users/${userId}/disable`).then(normalizeManagedUser).catch((error) => {
    if (!userBackendUnavailable(error)) throw error;
    return updateManagedUser(userId, { status: "disabled" });
  });
}

function normalizeManagedUser(user: Partial<ManagedUser>): ManagedUser {
  return {
    id: user.id ?? Date.now(),
    email: user.email ?? "unknown@infrasight.local",
    display_name: user.display_name ?? user.email?.split("@")[0] ?? "Unknown User",
    role: user.role ?? "viewer",
    workspace_ids: user.workspace_ids?.length ? user.workspace_ids : [activeOrganization],
    auth_type: user.auth_type ?? "local",
    status: user.status ?? "invited",
    last_login_at: user.last_login_at ?? null,
  };
}

function userBackendUnavailable(error: unknown) {
  return error instanceof Error && (
    error.message.includes("/internal/users") && error.message.includes("404")
  );
}

function readLocalUsers(): ManagedUser[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(LOCAL_USERS_FALLBACK_KEY);
    if (stored) return JSON.parse(stored) as ManagedUser[];
  } catch {
    // Fall through to seed data.
  }
  return [
    {
      id: 1,
      email: "admin@infrasight.local",
      display_name: "InfraSight Admin",
      role: "admin",
      workspace_ids: [activeOrganization],
      auth_type: "local",
      status: "active",
      last_login_at: null,
    },
  ];
}

function writeLocalUsers(users: ManagedUser[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_USERS_FALLBACK_KEY, JSON.stringify(users));
}

// ---------------------------------------------------------------------------
// Snapshot — fetches all dashboard data in a single parallel batch
// ---------------------------------------------------------------------------

/**
 * Load the complete dashboard snapshot for the active workspace.
 *
 * Used by:
 * - Dashboard metrics
 * - Assets and infrastructure pages
 * - Alerts and notification settings
 *
 * Returns:
 * - Resources, summary, alerts, metrics, channels and delivery history.
 */
export async function fetchInfraSightSnapshot(): Promise<InfraSightSnapshot> {
  const [resources, summary, alerts, metrics, channels, deliveries] = await Promise.all([
    getJson<Resource[]>("/inventory/resources"),
    getJson<MonitoringSummary>("/monitoring/summary"),
    getJson<AlertRecord[]>("/alerts?status=all"),
    getJson<MetricSample[]>("/monitoring/metrics"),
    getJson<NotificationChannel[]>("/notifications/channels"),
    getJson<AlertDelivery[]>("/notifications/deliveries"),
  ]);

  return {
    resources,
    summary,
    alerts,
    metrics,
    channels,
    deliveries,
  };
}

// ---------------------------------------------------------------------------
// Organizations / multi-client management
// ---------------------------------------------------------------------------

/** List organizations visible to the current user (MSP admins see all). */
export function fetchOrganizations() {
  return getJson<Organization[]>("/organizations");
}

/** Fetch the current request's tenant context: role, permissions, org details. */
export function fetchOrganizationContext() {
  return getJson<OrganizationContext>("/organizations/context");
}

// ---------------------------------------------------------------------------
// Generic backend action trigger (sync, collect, etc.)
// ---------------------------------------------------------------------------

/** Fire a POST to any backend action path and return the raw result. */
export function runBackendAction(path: string) {
  return postJson(path);
}

// ---------------------------------------------------------------------------
// Alert actions
// ---------------------------------------------------------------------------

/** Acknowledge or resolve an alert by ID. */
export function updateAlert(alertId: number | string, action: "ack" | "resolve") {
  return postJson(`/alerts/${alertId}/${action}`);
}

/** Update the incident lifecycle state and knowledge fields for an alert. */
export function updateAlertStatus(alertId: number | string, payload: AlertStatusUpdate) {
  return putJson<AlertRecord>(`/alerts/${alertId}/status`, payload);
}

/** Fetch resolved/closed alerts retained as reusable incident knowledge. */
export function fetchResolutionLibrary() {
  return getJson<AlertRecord[]>("/alerts/resolution-library");
}

/** Immediately send notifications for an alert through all enabled channels. */
export function notifyAlert(alertId: number | string) {
  return postJson(`/alerts/${alertId}/notify`);
}

// ---------------------------------------------------------------------------
// Notification channel management
// ---------------------------------------------------------------------------

/** Create a new notification channel (email, Slack, or Teams). */
export function createNotificationChannel(channel: ChannelForm) {
  return postJson("/notifications/channels", {
    ...channel,
    enabled: true,
    config: {},
  });
}

/** Enable, disable, or test a notification channel by ID. */
export function notificationChannelAction(
  channelId: number,
  action: "test" | "enable" | "disable",
) {
  return postJson<{
    status?: string;
    detail?: string;
    response_time_ms?: number;
  }>(`/notifications/channels/${channelId}/${action}`);
}

/** Delete an alert destination. Actual alert delivery history is kept. */
export function deleteNotificationChannel(channelId: number) {
  return deleteJson(`/notifications/channels/${channelId}`);
}

// ---------------------------------------------------------------------------
// Connector health
// ---------------------------------------------------------------------------

/**
 * Fetch health status for all connector types in the active workspace.
 * Status is derived from registrations, collected resources, metrics and alerts.
 */
export function fetchConnectorHealth() {
  return getJson<ConnectorHealth[]>("/connectors/health");
}

export function fetchConnectorCatalog() {
  return getJson<ConnectorCatalogItem[]>("/connectors/catalog");
}

export function fetchConnectorRegistrations() {
  return getJson<ConnectorRegistration[]>("/connectors");
}

// ---------------------------------------------------------------------------
// Operational summary
// ---------------------------------------------------------------------------

/** Fetch the unified cross-provider operational summary used by the Overview and OpenClaw. */
export function fetchOperationalSummary() {
  return getJson<OperationalSummary>("/monitoring/operational-summary");
}

/** Trigger a unified monitoring collection pass across all connectors. */
export function collectUnifiedMonitoring() {
  return postJson("/monitoring/unified/collect");
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** Fetch the discovery coverage summary: types, recent runs, topology, profiles. */
export function fetchDiscoverySummary() {
  return getJson<DiscoverySummary>("/discovery/summary");
}

/** Run one or more discovery types and return the resulting DiscoveryRun records. */
/**
 * Run workspace-scoped discovery for one or more connector/discovery types.
 * The backend performs read-only discovery and imports discovered resources.
 */
export function runDiscovery(discoveryTypes: string[] = []) {
  return postJson<DiscoveryRun[]>("/discovery/run", {
    discovery_types: discoveryTypes,
    trigger: "manual",
    organization_id: activeOrganization,
    config: {},
  });
}

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

/**
 * Fetch the active workspace topology graph.
 * Nodes are resources; edges are discovered or inferred relationships.
 */
export function fetchTopologyGraph() {
  return getJson<TopologyGraph>("/topology/graph");
}

// ---------------------------------------------------------------------------
// SMTP configuration
// ---------------------------------------------------------------------------

/** Fetch the SMTP configuration for the active tenant. Password is never returned. */
export function fetchSmtpConfig() {
  return getJson<SmtpConfig>("/notifications/smtp-config");
}

/** Save SMTP settings. Omit the password field to keep the existing stored value. */
export function saveSmtpConfig(config: SmtpConfigUpdate) {
  return putJson<SmtpConfig>("/notifications/smtp-config", config);
}

/** Validate SMTP connectivity without sending any email. */
export function testSmtpConnection() {
  return postJson<{ status: string; detail: string; response_time_ms: number; config: SmtpConfig }>(
    "/notifications/smtp-config/test",
  );
}

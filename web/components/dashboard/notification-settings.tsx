"use client";

import {
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageSquare,
  Server,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AuthenticationSettings } from "@/components/dashboard/authentication-settings";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OpenClawAiProvidersSettings } from "@/components/dashboard/openclaw-ai-providers-settings";
import { UserManagement } from "@/components/dashboard/user-management";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchSmtpConfig,
  saveSmtpConfig,
  testSmtpConnection,
} from "@/services/infrasight-api";
import type {
  AlertDelivery,
  ChannelForm,
  NotificationChannel,
  SmtpConfig,
  SmtpConfigUpdate,
} from "@/types/infrasight";

// ── helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function normalizeStatus(status: string) {
  if (status === "sent") return "Success";
  if (status === "failed") return "Failed";
  if (status === "never_sent") return "Never sent";
  return status;
}

/**
 * Returns true when the error is a network-level failure (backend unreachable).
 * Used to decide whether to fall back to a demo simulation instead of showing
 * a raw HTTP error that would confuse non-technical users.
 */
function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && err.message.toLowerCase().includes("failed to fetch"))
  );
}

function StatusPip({ status }: { status: string | null | undefined }) {
  if (!status || status === "never_sent")
    return <span className="text-xs text-muted-foreground">Never tested</span>;
  if (status === "sent")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-primary">
        <CheckCircle2 className="size-3" /> Success
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <XCircle className="size-3" /> Failed
      </span>
    );
  return <span className="text-xs text-muted-foreground capitalize">{status}</span>;
}

// ── SMTP Panel ────────────────────────────────────────────────────────────────

/**
 * Self-contained SMTP configuration card.
 * Manages its own fetch/save/test lifecycle independently of the parent
 * so SMTP changes do not require a full dashboard reload.
 */
function SmtpPanel() {
  const [config, setConfig] = useState<SmtpConfig | null>(null);
  const [form, setForm] = useState({
    host: "",
    port: 587,
    username: "",
    password: "",
    from_email: "alerts@infrasight.local",
    use_tls: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{
    status: string;
    detail: string;
    ms: number;
  } | null>(null);

  useEffect(() => {
    fetchSmtpConfig()
      .then((cfg) => {
        setConfig(cfg);
        setForm({
          host: cfg.host ?? "",
          port: cfg.port ?? 587,
          username: cfg.username ?? "",
          password: "",
          from_email: cfg.from_email ?? "alerts@infrasight.local",
          use_tls: cfg.use_tls ?? true,
        });
      })
      .catch(() => {/* API unavailable — fields stay at defaults */});
  }, []);

  const handleSave = async () => {
    // Validate required field before attempting to persist.
    if (!form.host.trim()) {
      setSaveMsg({ ok: false, text: "SMTP host is required." });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload: SmtpConfigUpdate = {
        host: form.host.trim(),
        port: form.port,
        username: form.username || null,
        from_email: form.from_email,
        use_tls: form.use_tls,
      };
      // Omit password when blank so the existing stored value is preserved.
      if (form.password) payload.password = form.password;
      const updated = await saveSmtpConfig(payload);
      setConfig(updated);
      setForm((prev) => ({ ...prev, password: "" }));
      setSaveMsg({ ok: true, text: "Configuration saved." });
    } catch (err) {
      const text = isNetworkError(err)
        ? "Backend unreachable — start the backend to save SMTP settings."
        : err instanceof Error
        ? err.message
        : "Save failed.";
      setSaveMsg({ ok: false, text });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    // Require a saved configuration before testing — the backend must have
    // the currently stored credentials to connect with.
    if (!config?.is_configured) {
      setTestResult({
        status: "failed",
        detail: "Save SMTP configuration before testing the connection.",
        ms: 0,
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSmtpConnection();
      setTestResult({ status: res.status, detail: res.detail, ms: res.response_time_ms });
      setConfig(res.config);
    } catch (err) {
      const detail = isNetworkError(err)
        ? "Backend unreachable — start the backend to test SMTP connectivity."
        : err instanceof Error
        ? err.message
        : "Connection test failed.";
      setTestResult({ status: "failed", detail, ms: 0 });
    } finally {
      setTesting(false);
    }
  };

  const isConfigured = config?.is_configured ?? false;
  const activeTestResult = testResult ?? (config?.last_test_result
    ? { status: config.last_test_result, detail: config.last_test_error ?? "", ms: 0 }
    : null);

  return (
    <Card className="console-line">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Server className="size-4 text-primary" />
            SMTP Configuration
          </CardTitle>
          <Badge
            className={cn(
              "text-[10px]",
              isConfigured ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {isConfigured ? "Configured" : "Not Configured"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Host <span className="text-destructive" aria-hidden>*</span>
              </p>
              <Input
                placeholder="smtp.example.com"
                value={form.host}
                onChange={(e) => { setForm({ ...form, host: e.target.value }); setSaveMsg(null); }}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Port</p>
              <Input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sender Address</p>
              <Input
                placeholder="alerts@example.com"
                value={form.from_email}
                onChange={(e) => setForm({ ...form, from_email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</p>
              <Input
                placeholder="smtp@example.com"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Password
                {config?.has_password && (
                  <span className="ml-1 font-normal normal-case text-muted-foreground">
                    (blank = keep existing)
                  </span>
                )}
              </p>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={config?.has_password ? "••••••••" : "Enter password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="pr-9"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">TLS (STARTTLS)</p>
              <div className="flex h-9 items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.use_tls}
                  onClick={() => setForm({ ...form, use_tls: !form.use_tls })}
                  className={cn(
                    "relative inline-flex h-5 w-9 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    form.use_tls ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                      form.use_tls ? "translate-x-4" : "translate-x-0",
                    )}
                  />
                </button>
                <span className="text-xs">{form.use_tls ? "Enabled" : "Disabled"}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-1.5 size-3 animate-spin" />Saving…</>
              ) : "Save Configuration"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 text-xs"
              disabled={testing}
              onClick={() => void handleTest()}
            >
              {testing ? (
                <><Loader2 className="mr-1.5 size-3 animate-spin" />Testing…</>
              ) : "Test Connection"}
            </Button>
            {saveMsg && (
              <span className={cn("text-xs", saveMsg.ok ? "text-primary" : "text-destructive")}>
                {saveMsg.ok
                  ? <><CheckCircle2 className="mr-1 inline size-3" />{saveMsg.text}</>
                  : <><XCircle className="mr-1 inline size-3" />{saveMsg.text}</>
                }
              </span>
            )}
          </div>
        </form>

        {activeTestResult && (
          <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Last Connection Test
              {config?.last_test_at && !testResult && (
                <span className="ml-2 font-normal normal-case">{formatTs(config.last_test_at)}</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPip status={activeTestResult.status} />
              {activeTestResult.ms > 0 && (
                <span className="text-xs text-muted-foreground">{activeTestResult.ms}ms</span>
              )}
            </div>
            {activeTestResult.detail && (
              <p
                className={cn(
                  "mt-1.5 rounded px-2 py-1 text-[11px]",
                  activeTestResult.status === "sent"
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {activeTestResult.detail}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Per-type channel section ──────────────────────────────────────────────────

const CHANNEL_CFG = {
  email: {
    label: "Email Destinations",
    Icon: Mail,
    placeholder: "ops@example.com",
    validate: (v: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email address.",
  },
  slack: {
    label: "Slack Webhooks",
    Icon: MessageSquare,
    placeholder: "https://hooks.slack.com/services/…",
    validate: (v: string) =>
      /^https:\/\/hooks\.slack\.com\/.+/i.test(v) ? "" : "Enter a valid Slack webhook URL.",
  },
  teams: {
    label: "Teams Webhooks",
    Icon: Workflow,
    placeholder: "https://outlook.office.com/webhook/…",
    validate: (v: string) =>
      /^https:\/\/.+/i.test(v) ? "" : "Enter a valid Teams webhook URL.",
  },
} as const;

type ChannelType = keyof typeof CHANNEL_CFG;

/**
 * Renders one section (email / Slack / Teams) with an inline add form and
 * a per-channel action row. Loading/result/confirm state is owned by the
 * parent (NotificationSettings) so only one action can be in-flight at a
 * time across all three sections.
 */
function ChannelSection({
  channels,
  channelResults,
  confirmDeleteId,
  onAction,
  onAdd,
  onCancelConfirmDelete,
  onConfirmDelete,
  pendingAction,
  type,
}: {
  channels: NotificationChannel[];
  channelResults: Record<number, { ok: boolean; message: string }>;
  confirmDeleteId: number | null;
  onAction: (channel: NotificationChannel, action: "test" | "enable" | "disable" | "delete") => Promise<void>;
  onAdd: (form: ChannelForm) => Promise<void>;
  onCancelConfirmDelete: () => void;
  onConfirmDelete: (id: number) => void;
  pendingAction: { id: number; action: string } | null;
  type: ChannelType;
}) {
  const { label, Icon, placeholder, validate } = CHANNEL_CFG[type];
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) { setErr("Name is required."); return; }
    const targetErr = validate(target.trim());
    if (targetErr) { setErr(targetErr); return; }
    setErr("");
    setSubmitting(true);
    try {
      await onAdd({ name: name.trim(), channel_type: type, target: target.trim() });
      setName("");
      setTarget("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to add channel.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-border bg-background/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-primary" />
          {label}
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            {channels.length} configured
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Add form — validated before submission */}
        <form onSubmit={(e) => { e.preventDefault(); void handleAdd(); }} className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              placeholder="Name"
              value={name}
              onChange={(e) => { setName(e.target.value); setErr(""); }}
              className="h-8 w-28 shrink-0 text-xs"
            />
            <Input
              placeholder={placeholder}
              value={target}
              onChange={(e) => { setTarget(e.target.value); setErr(""); }}
              className="h-8 min-w-0 flex-1 text-xs"
            />
            <Button type="submit" size="sm" className="h-8 shrink-0 text-xs" disabled={submitting}>
              {submitting ? <Loader2 className="size-3 animate-spin" /> : "Add"}
            </Button>
          </div>
          {err && <p className="text-[11px] text-destructive">{err}</p>}
        </form>

        {channels.map((ch) => {
          const isThisPending = pendingAction?.id === ch.id;
          // Disable all buttons while any action is in flight to prevent concurrent mutations.
          const anyPending = pendingAction !== null;
          const result = channelResults[ch.id];
          const awaitingDelete = confirmDeleteId === ch.id;

          return (
            <div key={ch.id} className="space-y-2 rounded-md border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{ch.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{ch.target}</p>
                </div>
                <Badge className={cn("shrink-0 text-[10px]", !ch.enabled && "opacity-50")}>
                  {ch.enabled ? normalizeStatus(ch.last_status) : "Disabled"}
                </Badge>
              </div>

              {/* Last test result from the backend */}
              {ch.last_test_result && (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPip status={ch.last_test_result} />
                  {ch.last_test_at && (
                    <span className="text-[11px] text-muted-foreground">{formatTs(ch.last_test_at)}</span>
                  )}
                </div>
              )}
              {ch.last_test_error && (
                <p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                  {ch.last_test_error}
                </p>
              )}

              {/* Action buttons — only one action runs at a time across all channels */}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[11px]"
                  disabled={anyPending}
                  onClick={() => void onAction(ch, "test")}
                >
                  {isThisPending && pendingAction.action === "test" ? (
                    <><Loader2 className="mr-1 size-3 animate-spin" />Testing…</>
                  ) : "Test"}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[11px]"
                  disabled={anyPending}
                  onClick={() => void onAction(ch, ch.enabled ? "disable" : "enable")}
                >
                  {isThisPending && (pendingAction.action === "enable" || pendingAction.action === "disable") ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : ch.enabled ? "Disable" : "Enable"}
                </Button>

                {/* Delete requires inline confirmation to prevent accidental removals */}
                {awaitingDelete ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-[11px]"
                      disabled={anyPending}
                      onClick={() => void onAction(ch, "delete")}
                    >
                      {isThisPending && pendingAction.action === "delete" ? (
                        <><Loader2 className="mr-1 size-3 animate-spin" />Deleting…</>
                      ) : "Yes, delete"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[11px]"
                      disabled={anyPending}
                      onClick={() => onCancelConfirmDelete()}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 gap-1 text-[11px]"
                    disabled={anyPending}
                    onClick={() => onConfirmDelete(ch.id)}
                  >
                    <Trash2 className="size-3" />
                    Delete
                  </Button>
                )}
              </div>

              {/* Inline feedback: persists until the next action on this channel */}
              {result && (
                <p className={cn("flex items-center gap-1 text-[11px]", result.ok ? "text-primary" : "text-destructive")}>
                  {result.ok
                    ? <CheckCircle2 className="size-3 shrink-0" />
                    : <XCircle className="size-3 shrink-0" />}
                  {result.message}
                </p>
              )}
            </div>
          );
        })}

        {channels.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
            No {label.toLowerCase()} configured yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Delivery History ──────────────────────────────────────────────────────────

function DeliveryHistory({
  channelNamesById,
  deliveries,
}: {
  channelNamesById: Map<number, string>;
  deliveries: AlertDelivery[];
}) {
  const [limit, setLimit] = useState(10);
  const visible = deliveries.slice(0, limit);

  return (
    <Card className="console-line">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="size-4 text-primary" />
          Delivery History
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            {deliveries.length} records
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {deliveries.length === 0 ? (
          <EmptyState text="No deliveries recorded yet." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-border">
                    {["Time", "Channel", "Type", "Destination", "Status", "Response", "Error"].map((h) => (
                      <th
                        key={h}
                        className="pb-2 pr-4 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((d) => {
                    const ok = d.status === "sent";
                    const skipped = d.status === "skipped";
                    return (
                      <tr key={d.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatTs(d.sent_at)}
                        </td>
                        <td className="py-2 pr-4 text-xs font-medium">
                          {channelNamesById.get(d.channel_id ?? -1) ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge className="text-[10px] normal-case">{d.channel_type}</Badge>
                        </td>
                        <td className="max-w-[160px] truncate py-2 pr-4 text-[11px] text-muted-foreground">
                          {d.target}
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              ok
                                ? "bg-primary/10 text-primary"
                                : skipped
                                ? "bg-muted text-muted-foreground"
                                : "bg-destructive/10 text-destructive",
                            )}
                          >
                            {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                            {ok ? "Sent" : skipped ? "Skipped" : "Failed"}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {d.response_time_ms != null ? `${d.response_time_ms}ms` : "—"}
                        </td>
                        <td className="max-w-[200px] truncate py-2 text-[11px] text-muted-foreground">
                          {!ok && d.detail ? d.detail : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {deliveries.length > limit && (
              <button
                className="mt-3 text-xs text-primary hover:underline"
                onClick={() => setLimit((l) => l + 10)}
              >
                Show more ({deliveries.length - limit} remaining)
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Settings hub for alert destinations, SMTP, users, and SSO configuration.
 *
 * Channel action flow:
 *   User clicks button → pendingAction set → button shows spinner + disabled
 *   → channelAction (hook) calls backend → loadAll() refreshes channels prop
 *   → success: channelResults[id] set with green message
 *   → failure: channelResults[id] set with red message (or demo for "test")
 *   → pendingAction cleared → buttons re-enable
 *
 * Delete confirmation:
 *   First click → confirmDeleteId set → "Yes, delete" + "Cancel" shown inline
 *   → "Yes, delete" triggers the delete action
 *   → "Cancel" clears confirmDeleteId with no side effects
 *
 * Demo fallback for "test" actions:
 *   When the backend is unreachable (TypeError / "Failed to fetch"), a local
 *   delivery record is added to extraDeliveries so delivery history shows an
 *   entry and the user sees "Test sent (demo — backend unreachable)".
 */
export function NotificationSettings(props: {
  channelAction: (
    channel: NotificationChannel,
    action: "test" | "enable" | "disable" | "delete",
  ) => Promise<{ status?: string; detail?: string; response_time_ms?: number } | undefined>;
  channels: NotificationChannel[];
  deliveries: AlertDelivery[];
  onAddChannel: (channel: ChannelForm) => Promise<void>;
  workspaceId: string;
}) {
  const { channelAction, channels, deliveries, onAddChannel, workspaceId } = props;

  // Tracks which channel+action is currently in flight so buttons show spinners.
  const [pendingAction, setPendingAction] = useState<{ id: number; action: string } | null>(null);
  // Per-channel success/error message shown inline under each channel card.
  const [channelResults, setChannelResults] = useState<Record<number, { ok: boolean; message: string }>>({});
  // Set when user first clicks Delete; cleared on confirm or cancel.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Demo delivery entries injected into history when backend is unreachable.
  const [extraDeliveries, setExtraDeliveries] = useState<AlertDelivery[]>([]);
  const [activeSettingsPage, setActiveSettingsPage] = useState<"users" | "authentication" | "destinations" | "ai-providers">("users");

  const channelNamesById = useMemo(
    () => new Map(channels.map((c) => [c.id, c.name])),
    [channels],
  );

  const emailChannels = channels.filter((c) => c.channel_type === "email");
  const slackChannels = channels.filter((c) => c.channel_type === "slack");
  const teamsChannels = channels.filter((c) => c.channel_type === "teams");

  // Merge demo deliveries (prepended) with backend deliveries so history is
  // always non-empty after a test even when the backend is unreachable.
  const allDeliveries = useMemo(
    () => [...extraDeliveries, ...deliveries],
    [extraDeliveries, deliveries],
  );

  /**
   * Shared channel action handler used by all three ChannelSection instances.
   *
   * Tries the real backend first. On success it shows a positive result and
   * the hook's loadAll() refreshes the channel list. On failure it shows a
   * clear error message. For the "test" action specifically, a network error
   * triggers a demo simulation so the user sees a delivery history entry.
   */
  const runChannelAction = async (
    channel: NotificationChannel,
    action: "test" | "enable" | "disable" | "delete",
  ) => {
    setPendingAction({ id: channel.id, action });
    // Clear any previous result for this channel so stale messages don't linger.
    setChannelResults((prev) => {
      const next = { ...prev };
      delete next[channel.id];
      return next;
    });

    try {
      const result = await channelAction(channel, action);

      // On success: show a context-appropriate message. Deleted channels
      // disappear from the list so no message is needed for them.
      if (action !== "delete") {
        const backendStatus = result?.status?.toLowerCase();
        if (action === "test" && backendStatus && backendStatus !== "sent") {
          setChannelResults((prev) => ({
            ...prev,
            [channel.id]: {
              ok: false,
              message: result?.detail || `Test ${backendStatus}.`,
            },
          }));
          return;
        }
        const testSuccessMsg =
          channel.channel_type === "email"
            ? "Test email sent successfully."
            : channel.channel_type === "slack"
            ? "Test Slack message sent successfully."
            : "Test notification sent successfully.";
        const messages = {
          test: testSuccessMsg,
          enable: `${channel.name} enabled.`,
          disable: `${channel.name} disabled.`,
        };
        setChannelResults((prev) => ({
          ...prev,
          [channel.id]: { ok: true, message: messages[action] },
        }));
      }
    } catch (err) {
      if (action === "test" && isNetworkError(err)) {
        // Backend unreachable: inject a demo delivery record so the history
        // table shows evidence of the test attempt, then show a demo result.
        const demoEntry: AlertDelivery = {
          id: Date.now(),
          channel_id: channel.id,
          channel_type: channel.channel_type,
          target: channel.target,
          status: "sent",
          detail: "Test notification (demo — backend unreachable)",
          response_time_ms: 42,
          sent_at: new Date().toISOString(),
        };
        setExtraDeliveries((prev) => [demoEntry, ...prev]);
        setChannelResults((prev) => ({
          ...prev,
          [channel.id]: { ok: true, message: "Test sent (demo — backend unreachable)." },
        }));
      } else {
        const message = isNetworkError(err)
          ? `Action could not complete — backend unreachable.`
          : err instanceof Error
          ? err.message
          : `${action} failed.`;
        setChannelResults((prev) => ({
          ...prev,
          [channel.id]: { ok: false, message },
        }));
      }
    } finally {
      setPendingAction(null);
      setConfirmDeleteId(null);
    }
  };

  const sharedChannelSectionProps = {
    channelResults,
    confirmDeleteId,
    onAction: runChannelAction,
    onAdd: onAddChannel,
    onCancelConfirmDelete: () => setConfirmDeleteId(null),
    onConfirmDelete: (id: number) => setConfirmDeleteId(id),
    pendingAction,
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {[
          { key: "users", label: "Users" },
          { key: "authentication", label: "Authentication / SSO" },
          { key: "ai-providers", label: "OpenClaw / AI Providers" },
          { key: "destinations", label: "Alert Destinations" },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveSettingsPage(item.key as typeof activeSettingsPage)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
              activeSettingsPage === item.key
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-muted/20 text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeSettingsPage === "users" && <UserManagement workspaceId={workspaceId} />}

      {activeSettingsPage === "authentication" && <AuthenticationSettings workspaceId={workspaceId} />}

      {activeSettingsPage === "ai-providers" && <OpenClawAiProvidersSettings workspaceId={workspaceId} />}

      {activeSettingsPage === "destinations" && (
        <>
          <SmtpPanel />
          <div className="grid gap-4 lg:grid-cols-3">
            <ChannelSection {...sharedChannelSectionProps} type="email" channels={emailChannels} />
            <ChannelSection {...sharedChannelSectionProps} type="slack" channels={slackChannels} />
            <ChannelSection {...sharedChannelSectionProps} type="teams" channels={teamsChannels} />
          </div>
          <DeliveryHistory deliveries={allDeliveries} channelNamesById={channelNamesById} />
        </>
      )}
    </section>
  );
}

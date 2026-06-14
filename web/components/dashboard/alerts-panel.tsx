import { useMemo, useState } from "react";
import { Activity, Bell, BookOpen, Clock, History, Lightbulb, RotateCcw, Search, ShieldAlert } from "lucide-react";

import { AlertRouting } from "@/components/dashboard/alert-routing";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TechnologyIcon } from "@/dashboard/resourceIcons";
import { updateAlertStatus } from "@/services/infrasight-api";
import type {
  AlertRecord,
  AlertStatus,
  AlertStatusUpdate,
  MonitoringSummary,
  NotificationChannel,
  Resource,
} from "@/types/infrasight";

const LOCAL_INCIDENT_KNOWLEDGE_KEY = "infrasight.alertIncidentKnowledge";

const ACTIVE_ALERT_STATUSES: AlertStatus[] = ["open", "acknowledged", "investigating", "resolved"];

type AlertStatusView = "active" | AlertStatus;
type AlertAction = "save_knowledge" | "acknowledged" | "investigating" | "resolved" | "closed" | "reopen";

const STATUS_VIEWS: { key: AlertStatusView; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "investigating", label: "Investigating" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed / Incident History" },
];

/**
 * Incident knowledge workspace for alerts.
 *
 * Inputs:
 * - alerts, resources and notification channels from the active workspace
 *
 * Outputs:
 * - alert history by lifecycle status
 * - details panel with investigation and resolution knowledge fields
 * - resolution-library recommendations from similar historical alerts
 *
 * Safety:
 * - OpenClaw suggestions are read-only recommendations. This component never
 *   remediates infrastructure or automatically resolves alerts.
 */
export function AlertsPanel({
  activeFilterLabel,
  alerts,
  channels,
  clearActiveFilter,
  refresh,
  resources,
  summary,
}: {
  activeFilterLabel?: string | null;
  alerts: AlertRecord[];
  channels: NotificationChannel[];
  clearActiveFilter?: () => void;
  refresh: () => Promise<void>;
  resources: Resource[];
  summary: MonitoringSummary;
}) {
  const [localAlertState, setLocalAlertState] = useState<Record<string, AlertRecord>>(() => readLocalIncidentKnowledge());
  const [statusView, setStatusView] = useState<AlertStatusView>("active");
  const [query, setQuery] = useState("");
  const alertsWithKnowledge = useMemo(
    () => mergeAlertKnowledge(alerts, localAlertState),
    [alerts, localAlertState],
  );
  const filteredAlerts = useMemo(
    () =>
      alertsWithKnowledge.filter((alert) => {
        const resource = resourceForAlert(alert, resources);
        const haystack = [
          alert.title,
          alert.description,
          alert.source,
          alert.status,
          alert.severity,
          alert.resolution_category,
          alert.root_cause,
          alert.resolution_notes,
          alert.investigation_notes,
          alert.created_at,
          alert.resolved_at,
          alert.closed_at,
          resource?.name,
          resource?.provider,
          resource?.resource_type,
          resource?.region,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const statusMatches =
          statusView === "active"
            ? ACTIVE_ALERT_STATUSES.includes(normalizeStatus(alert.status))
            : alert.status === statusView;
        return statusMatches && (!query || haystack.includes(query.toLowerCase()));
      }),
    [alertsWithKnowledge, query, resources, statusView],
  );
  const [selectedAlertId, setSelectedAlertId] = useState<AlertRecord["id"] | null>(
    filteredAlerts[0]?.id ?? alertsWithKnowledge[0]?.id ?? null,
  );
  const selectedAlert =
    filteredAlerts.find((alert) => alert.id === selectedAlertId) ??
    filteredAlerts[0] ??
    alertsWithKnowledge.find((alert) => alert.id === selectedAlertId) ??
    null;
  const selectedResource = selectedAlert ? resourceForAlert(selectedAlert, resources) : undefined;
  const resolutionLibrary = alertsWithKnowledge.filter((alert) => ["resolved", "closed"].includes(alert.status));
  const similarIncidents = selectedAlert ? findSimilarIncidents(selectedAlert, resolutionLibrary) : [];
  const metrics = buildAlertMetrics(alertsWithKnowledge);

  /**
   * Applies incident knowledge locally so the operator sees an immediate result.
   * Backend refreshes can later replace these records, but local storage keeps
   * knowledge available when the API is not running.
   */
  const applyLocalAlertUpdate = (updatedAlert: AlertRecord) => {
    setLocalAlertState((previous) => {
      const next = {
        ...previous,
        [String(updatedAlert.id)]: updatedAlert,
      };
      writeLocalIncidentKnowledge(next);
      return next;
    });
    setSelectedAlertId(updatedAlert.id);
  };

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Bell} label="Open Alerts" value={summary.open_alerts} helper="Currently active" />
        <MetricCard icon={ShieldAlert} label="Critical" value={summary.critical_alerts} helper="Immediate response" tone="danger" />
        <MetricCard icon={Activity} label="Occurrences" value={metrics.occurrences} helper="Matching incident records" />
        <MetricCard icon={Clock} label="MTTR" value={metrics.mttr} helper="Mean time to resolve" />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <KnowledgeMetric label="First Seen" value={metrics.firstSeen} />
        <KnowledgeMetric label="Last Seen" value={metrics.lastSeen} />
        <KnowledgeMetric label="Resolution Success" value={metrics.successRate} />
      </section>

      <AlertRouting channels={channels} />

      {activeFilterLabel && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">
          <span>Active filter: {activeFilterLabel}</span>
          <button className="rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10" onClick={clearActiveFilter} type="button">
            Clear
          </button>
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card className="console-line">
          <CardHeader className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>Alert History</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search alerts, resources or sources" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_VIEWS.map((view) => {
                const count =
                  view.key === "active"
                    ? alertsWithKnowledge.filter((alert) => ACTIVE_ALERT_STATUSES.includes(normalizeStatus(alert.status))).length
                    : alertsWithKnowledge.filter((alert) => alert.status === view.key).length;
                return (
                  <button
                    key={view.key}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      statusView === view.key
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border bg-muted/20 text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setStatusView(view.key)}
                  >
                    {view.label} <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="grid gap-2">
            {filteredAlerts.map((alert) => {
              const resource = resourceForAlert(alert, resources);
              const selected = selectedAlert?.id === alert.id;
              return (
                <button
                  key={alert.id}
                  className={`grid gap-3 rounded-md border p-3 text-left transition-colors md:grid-cols-[120px_1fr_auto] md:items-center ${
                    selected ? "border-primary/45 bg-primary/10" : "border-border bg-background/60 hover:bg-muted/30"
                  }`}
                  onClick={() => setSelectedAlertId(alert.id)}
                >
                  <SeverityBadge severity={alert.severity} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{alert.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {resource && <TechnologyIcon name={resource.resource_type || resource.provider} surface="table" />}
                      <span>{resource?.name ?? "Unknown resource"}</span>
                      <span aria-hidden="true">-</span>
                      <span>{alert.source}</span>
                    </div>
                  </div>
                  <Badge className="normal-case">{labelForStatus(alert.status)}</Badge>
                </button>
              );
            })}
            {filteredAlerts.length === 0 && <EmptyState text="No alerts match this view." />}
          </CardContent>
        </Card>

        {selectedAlert ? (
          <AlertDetails
            alert={selectedAlert}
            key={selectedAlert.id}
            refresh={refresh}
            resource={selectedResource}
            similarIncidents={similarIncidents}
            updateLocalAlert={applyLocalAlertUpdate}
            updateStatusView={setStatusView}
          />
        ) : (
          <Card className="console-line">
            <CardContent className="p-6"><EmptyState text="Select an alert to inspect incident knowledge." /></CardContent>
          </Card>
        )}
      </section>

      <ResolutionLibrary alerts={resolutionLibrary} resources={resources} />
    </>
  );
}

function AlertDetails({
  alert,
  refresh,
  resource,
  similarIncidents,
  updateLocalAlert,
  updateStatusView,
}: {
  alert: AlertRecord;
  refresh: () => Promise<void>;
  resource?: Resource;
  similarIncidents: AlertRecord[];
  updateLocalAlert: (alert: AlertRecord) => void;
  updateStatusView: (view: AlertStatusView) => void;
}) {
  const [form, setForm] = useState<AlertStatusUpdate>({
    status: normalizeStatus(alert.status),
    investigation_notes: alert.investigation_notes ?? "",
    resolution_notes: alert.resolution_notes ?? "",
    root_cause: alert.root_cause ?? "",
    resolution_category: alert.resolution_category ?? "Operational",
    resolved_by: alert.resolved_by ?? "dashboard",
    success_rating: alert.success_rating ?? 4,
  });
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const resolutionReady = hasResolutionFields(form);
  const historyMode = alert.status === "closed";

  const save = async (action: AlertAction) => {
    const status = action === "save_knowledge" ? normalizeStatus(alert.status) : action === "reopen" ? "investigating" : action;
    if ((status === "resolved" || status === "closed") && !resolutionReady) {
      setFeedback({
        ok: false,
        text: "Root cause, resolution notes, resolution category and success rating are required before resolving or closing.",
      });
      return;
    }

    setActiveAction(action);
    setFeedback(null);
    setForm((previous) => ({ ...previous, status }));

    const optimisticAlert = buildUpdatedAlert(alert, form, status, action);
    updateLocalAlert(optimisticAlert);
    if (action === "closed") updateStatusView("closed");
    if (action === "reopen") updateStatusView("active");

    try {
      if (String(alert.id).startsWith("mock")) {
        throw new Error("Local alert record");
      }
      const persisted = await updateAlertStatus(alert.id, { ...form, status });
      updateLocalAlert(mergeTimelineIfMissing(persisted, optimisticAlert));
      await refresh().catch(() => undefined);
      setFeedback({ ok: true, text: messageForAction(action, "backend") });
    } catch (error) {
      writeLocalIncidentKnowledgeEntry(optimisticAlert);
      const fallbackText = backendUnavailable(error)
        ? messageForAction(action, "local")
        : `${messageForAction(action, "local")} Backend update failed: ${error instanceof Error ? error.message : "unknown error"}`;
      setFeedback({ ok: backendUnavailable(error), text: fallbackText });
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {historyMode ? <History className="size-4 text-primary" /> : <BookOpen className="size-4 text-primary" />}
          {historyMode ? "Incident Details" : "Alert Details"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <Badge className="normal-case">{labelForStatus(alert.status)}</Badge>
          </div>
          <h3 className="mt-2 text-base font-semibold">{alert.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{alert.description ?? "No alert description provided."}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <InfoField label="Source" value={alert.source} />
          <InfoField label="Metric" value={alert.metric_name ?? "inventory"} />
          <InfoField label="Observed" value={alert.metric_value ?? "n/a"} />
          <InfoField label="Threshold" value={alert.threshold ?? "n/a"} />
          <InfoField label="First Seen" value={formatDate(alert.created_at)} />
          <InfoField label="Last Seen" value={formatDate(alert.updated_at ?? alert.created_at)} />
          {alert.resolved_at && <InfoField label="Resolved" value={formatDate(alert.resolved_at)} />}
          {alert.closed_at && <InfoField label="Closed" value={formatDate(alert.closed_at)} />}
          <InfoField label="Category" value={alert.resolution_category ?? "Uncategorized"} />
          <InfoField label="Success" value={alert.success_rating ? `${alert.success_rating}/5` : "n/a"} />
        </div>

        {resource && (
          <div className="rounded-md border border-border bg-background/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Resource Information</p>
            <div className="flex items-center gap-2">
              <TechnologyIcon name={resource.resource_type || resource.provider} surface="tooltip" />
              <div>
                <p className="text-sm font-medium">{resource.name}</p>
                <p className="text-xs text-muted-foreground">{resource.provider} - {resource.resource_type} - {resource.region}</p>
              </div>
            </div>
          </div>
        )}

        <Timeline alert={alert} />

        {historyMode ? (
          <div className="grid gap-3">
            <ReadOnlyText label="Investigation Notes" value={alert.investigation_notes} />
            <ReadOnlyText label="Root Cause" value={alert.root_cause} />
            <ReadOnlyText label="Resolution Notes" value={alert.resolution_notes} />
            <MetadataBlock metadata={alert.metadata} />
          </div>
        ) : (
          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</span>
              <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AlertStatus })}>
                {STATUS_VIEWS.filter((view) => view.key !== "active").map((view) => <option key={view.key} value={view.key}>{view.label}</option>)}
              </Select>
            </label>
            <TextArea label="Investigation Notes" value={form.investigation_notes ?? ""} onChange={(value) => setForm({ ...form, investigation_notes: value })} />
            <TextArea label="Root Cause" value={form.root_cause ?? ""} onChange={(value) => setForm({ ...form, root_cause: value })} />
            <TextArea label="Resolution Notes" value={form.resolution_notes ?? ""} onChange={(value) => setForm({ ...form, resolution_notes: value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Resolution Category</span>
                <Select value={form.resolution_category} onChange={(event) => setForm({ ...form, resolution_category: event.target.value })}>
                  {["Operational", "Capacity", "Configuration", "Deployment", "Dependency", "Security", "Unknown"].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Success Rating</span>
                <Select value={String(form.success_rating ?? 4)} onChange={(event) => setForm({ ...form, success_rating: Number(event.target.value) })}>
                  {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item}/5</option>)}
                </Select>
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {historyMode ? (
            <Button size="sm" disabled={Boolean(activeAction)} onClick={() => save("reopen")}>
              <RotateCcw className="mr-2 size-3.5" />
              {activeAction === "reopen" ? "Reopening..." : "Reopen Incident"}
            </Button>
          ) : (
            <>
              <Button size="sm" disabled={Boolean(activeAction)} onClick={() => save("save_knowledge")}>
                {activeAction === "save_knowledge" ? "Saving..." : "Save Knowledge"}
              </Button>
              <Button size="sm" variant="secondary" disabled={Boolean(activeAction)} onClick={() => save("acknowledged")}>
                {activeAction === "acknowledged" ? "Updating..." : "Acknowledge"}
              </Button>
              <Button size="sm" variant="secondary" disabled={Boolean(activeAction)} onClick={() => save("investigating")}>
                {activeAction === "investigating" ? "Updating..." : "Investigating"}
              </Button>
              <Button size="sm" variant="secondary" disabled={Boolean(activeAction) || !resolutionReady} onClick={() => save("resolved")}>
                {activeAction === "resolved" ? "Resolving..." : "Resolve"}
              </Button>
              <Button size="sm" variant="secondary" disabled={Boolean(activeAction) || !resolutionReady} onClick={() => save("closed")}>
                {activeAction === "closed" ? "Closing..." : "Close"}
              </Button>
            </>
          )}
        </div>

        {feedback && (
          <div className={`rounded-md border px-3 py-2 text-sm ${feedback.ok ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {feedback.text}
          </div>
        )}

        <OpenClawIncidentHints alert={alert} similarIncidents={similarIncidents} />
      </CardContent>
    </Card>
  );
}

function OpenClawIncidentHints({ alert, similarIncidents }: { alert: AlertRecord; similarIncidents: AlertRecord[] }) {
  const best = similarIncidents[0];
  const likelyCauses = [
    best?.root_cause,
    alert.metric_name ? `${alert.metric_name} breached the expected threshold` : undefined,
    alert.source ? `Signal originated from ${alert.source}` : undefined,
  ].filter(Boolean);

  return (
    <div className="rounded-md border border-primary/25 bg-primary/10 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        <Lightbulb className="size-4" />
        OpenClaw Incident Context
      </p>
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          OpenClaw can search previous incidents and recommend checks, but it will not resolve alerts or change infrastructure.
        </p>
        <div>
          <p className="text-xs font-semibold text-foreground">Likely causes</p>
          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
            {likelyCauses.length ? likelyCauses.map((cause) => <li key={String(cause)}>{cause}</li>) : <li>No strong cause found yet.</li>}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">Previous successful resolution</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {best?.resolution_notes ?? best?.root_cause ?? "No matching resolved incident found. This appears to be a new issue."}
          </p>
        </div>
      </div>
    </div>
  );
}

function ResolutionLibrary({ alerts, resources }: { alerts: AlertRecord[]; resources: Resource[] }) {
  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle>Resolution Library</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {alerts.slice(0, 8).map((alert) => {
          const resource = resourceForAlert(alert, resources);
          return (
            <div key={alert.id} className="rounded-md border border-border bg-background/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {resource?.name ?? "Unknown resource"} - {alert.resolution_category ?? "Uncategorized"} - {alert.resolved_by ?? "unknown"}
                  </p>
                </div>
                <Badge className="normal-case">Success {alert.success_rating ?? "n/a"}/5</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {alert.resolution_notes || alert.root_cause || "Resolution knowledge has not been captured yet."}
              </p>
            </div>
          );
        })}
        {alerts.length === 0 && <EmptyState text="Resolved alerts will appear here as reusable incident knowledge." />}
      </CardContent>
    </Card>
  );
}

function Timeline({ alert }: { alert: AlertRecord }) {
  const metadataTimeline = Array.isArray(alert.metadata?.timeline) ? alert.metadata.timeline : [];
  const base = [
    ["Created", alert.created_at],
    ["Acknowledged", alert.acknowledged_at],
    ["Investigating", alert.investigating_at],
    ["Resolved", alert.resolved_at],
    ["Closed", alert.closed_at],
  ].filter(([, at]) => Boolean(at));

  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Timeline</p>
      <div className="space-y-2">
        {base.map(([label, at]) => <TimelineRow key={label} label={String(label)} detail={formatDate(String(at))} />)}
        {metadataTimeline.slice(-4).map((item, index) => {
          const event = isRecord(item) ? labelForTimelineEvent(String(item.event ?? "timeline event")) : "timeline event";
          const at = isRecord(item) ? String(item.at ?? "") : "";
          return <TimelineRow key={`${event}-${index}`} label={event} detail={formatDate(at)} />;
        })}
      </div>
    </div>
  );
}

function TimelineRow({ detail, label }: { detail: string; label: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{detail}</span>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm">{value}</p>
    </div>
  );
}

function KnowledgeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function TextArea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <textarea
        className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ReadOnlyText({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{value?.trim() || "Not captured."}</p>
    </div>
  );
}

function MetadataBlock({ metadata }: { metadata?: Record<string, unknown> }) {
  const entries = Object.entries(metadata ?? {}).filter(([key]) => key !== "timeline");
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Metadata</p>
      {entries.length ? (
        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {JSON.stringify(Object.fromEntries(entries), null, 2)}
        </pre>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No additional metadata captured.</p>
      )}
    </div>
  );
}

/**
 * Builds the client-side incident record used for optimistic UI updates and
 * local fallback persistence.
 *
 * Inputs:
 * - current alert record
 * - incident knowledge form data
 * - target lifecycle status
 * - action name for timeline/audit context
 *
 * Outputs:
 * - complete AlertRecord with updated knowledge fields, timestamps and timeline
 */
function buildUpdatedAlert(
  alert: AlertRecord,
  form: AlertStatusUpdate,
  status: AlertStatus,
  action: AlertAction,
): AlertRecord {
  const now = new Date().toISOString();
  const metadata = isRecord(alert.metadata) ? alert.metadata : {};
  const timeline = Array.isArray(metadata.timeline) ? metadata.timeline : [];
  const event = eventForAction(action, status);
  return {
    ...alert,
    status,
    updated_at: now,
    acknowledged_at: status === "acknowledged" ? alert.acknowledged_at ?? now : alert.acknowledged_at ?? null,
    investigating_at: status === "investigating" ? (action === "reopen" ? now : alert.investigating_at ?? now) : alert.investigating_at ?? null,
    resolved_at: status === "resolved" || status === "closed" ? alert.resolved_at ?? now : alert.resolved_at ?? null,
    closed_at: status === "closed" ? alert.closed_at ?? now : alert.closed_at ?? null,
    investigation_notes: form.investigation_notes ?? "",
    root_cause: form.root_cause ?? "",
    resolution_notes: form.resolution_notes ?? "",
    resolution_category: form.resolution_category ?? "",
    resolved_by: status === "resolved" || status === "closed" ? form.resolved_by || "dashboard" : alert.resolved_by ?? null,
    success_rating: form.success_rating ?? alert.success_rating ?? null,
    metadata: {
      ...metadata,
      timeline: [
        ...timeline,
        {
          action,
          at: now,
          event,
          source: "dashboard",
        },
      ].slice(-25),
    },
  };
}

function hasResolutionFields(form: AlertStatusUpdate) {
  return Boolean(
    form.root_cause?.trim() &&
      form.resolution_notes?.trim() &&
      form.resolution_category?.trim() &&
      form.success_rating,
  );
}

function messageForAction(action: AlertAction, target: "backend" | "local") {
  const suffix = target === "backend" ? "saved to backend." : "saved locally for this workspace.";
  const labels = {
    save_knowledge: "Incident knowledge",
    acknowledged: "Alert acknowledged",
    investigating: "Alert moved to Investigating",
    resolved: "Alert resolved and added to the resolution library",
    closed: "Incident closed and moved to Incident History",
    reopen: "Incident reopened and moved back to active alerts",
  };
  return `${labels[action]} ${suffix}`;
}

function backendUnavailable(error: unknown) {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("failed to fetch") || message.includes("404") || message.includes("local alert record");
}

function mergeTimelineIfMissing(persisted: AlertRecord, optimistic: AlertRecord) {
  const persistedTimeline = Array.isArray(persisted.metadata?.timeline) ? persisted.metadata.timeline : [];
  if (persistedTimeline.length) return persisted;
  return {
    ...persisted,
    metadata: optimistic.metadata,
  };
}

function mergeAlertKnowledge(alerts: AlertRecord[], localState: Record<string, AlertRecord>) {
  const merged = alerts.map((alert) => ({
    ...alert,
    ...localState[String(alert.id)],
    metadata: {
      ...(isRecord(alert.metadata) ? alert.metadata : {}),
      ...(isRecord(localState[String(alert.id)]?.metadata) ? localState[String(alert.id)]?.metadata : {}),
    },
  }));
  const existingIds = new Set(merged.map((alert) => String(alert.id)));
  const localOnly = Object.values(localState).filter((alert) => !existingIds.has(String(alert.id)));
  return [...merged, ...localOnly];
}

function readLocalIncidentKnowledge(): Record<string, AlertRecord> {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(LOCAL_INCIDENT_KNOWLEDGE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, AlertRecord>) : {};
  } catch {
    return {};
  }
}

function writeLocalIncidentKnowledge(records: Record<string, AlertRecord>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_INCIDENT_KNOWLEDGE_KEY, JSON.stringify(records));
}

function writeLocalIncidentKnowledgeEntry(alert: AlertRecord) {
  const records = readLocalIncidentKnowledge();
  writeLocalIncidentKnowledge({
    ...records,
    [String(alert.id)]: alert,
  });
}

function buildAlertMetrics(alerts: AlertRecord[]) {
  /*
   * Build incident-level metrics from the full alert history.
   * These numbers intentionally use resolved_at/created_at timestamps instead
   * of current severity so the dashboard can measure troubleshooting outcomes,
   * not just the current notification queue.
   */
  const resolved = alerts.filter((alert) => alert.resolved_at);
  const mttrMinutes = resolved.length
    ? Math.round(
        resolved.reduce((total, alert) => total + (Date.parse(alert.resolved_at ?? "") - Date.parse(alert.created_at ?? "")), 0) /
          resolved.length /
          60000,
      )
    : 0;
  const ratings = resolved.map((alert) => alert.success_rating).filter((rating): rating is number => typeof rating === "number");
  const successRate = ratings.length ? `${Math.round((ratings.filter((rating) => rating >= 4).length / ratings.length) * 100)}%` : "n/a";
  const sorted = [...alerts].sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""));
  const last = sorted[sorted.length - 1];
  return {
    firstSeen: sorted[0]?.created_at ? formatDate(sorted[0].created_at) : "n/a",
    lastSeen: last?.created_at ? formatDate(last.created_at) : "n/a",
    mttr: mttrMinutes ? `${mttrMinutes}m` : "n/a",
    occurrences: alerts.length,
    successRate,
  };
}

function findSimilarIncidents(alert: AlertRecord, library: AlertRecord[]) {
  /*
   * Lightweight read-only similarity scoring for OpenClaw hints.
   * Backend/vector search can replace this later; for now we compare source,
   * metric, severity and title vocabulary so historical resolutions surface
   * without granting the UI any remediation capability.
   */
  return library
    .filter((candidate) => candidate.id !== alert.id)
    .map((candidate) => ({
      candidate,
      score:
        (candidate.source === alert.source ? 3 : 0) +
        (candidate.metric_name && candidate.metric_name === alert.metric_name ? 3 : 0) +
        (candidate.severity === alert.severity ? 1 : 0) +
        (words(candidate.title).some((word) => words(alert.title).includes(word)) ? 2 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.candidate)
    .slice(0, 5);
}

function resourceForAlert(alert: AlertRecord, resources: Resource[]) {
  return resources.find((resource) => String(resource.id) === String(alert.resource_id));
}

function normalizeStatus(status: string): AlertStatus {
  if (["open", "acknowledged", "investigating", "resolved", "closed"].includes(status)) return status as AlertStatus;
  return "open";
}

function labelForStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventForAction(action: AlertAction, status: AlertStatus) {
  if (action === "save_knowledge") return "Incident knowledge saved";
  if (action === "closed") return "Incident closed";
  if (action === "reopen") return "Incident reopened";
  return `Alert ${labelForStatus(status)}`;
}

function labelForTimelineEvent(event: string) {
  if (event === "status_changed_to_closed") return "Incident closed";
  if (event === "status_changed_to_investigating") return "Alert Investigating";
  if (event === "knowledge_saved") return "Incident knowledge saved";
  return event.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short" });
}

function words(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

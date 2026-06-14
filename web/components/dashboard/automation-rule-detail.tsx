"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  Play,
  ScrollText,
  Settings2,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { cn } from "@/lib/utils";
import type { NotificationChannel } from "@/types/infrasight";
import {
  ACTION_CONFIG,
  CATEGORY_CONFIG,
  TEMPLATES,
  type ActionType,
  type AutomationRule,
  type ExecutionRecord,
} from "./automation-data";

// ── Status display ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active:   { label: "Active",   Icon: CheckCircle2, className: "text-primary"          },
  warning:  { label: "Warning",  Icon: AlertTriangle, className: "text-[hsl(38_88%_60%)]" },
  disabled: { label: "Disabled", Icon: Settings2,    className: "text-muted-foreground"  },
  running:  { label: "Running",  Icon: Play,         className: "text-accent"            },
} as const;

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  alert:        AlertTriangle,
  notification: Bell,
  event:        FileText,
  log:          ScrollText,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day:   "numeric",
      hour:  "2-digit",
      minute:"2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Execution row ─────────────────────────────────────────────────────────────

function ExecRow({ rec }: { rec: ExecutionRecord }) {
  const ok = rec.status === "success";
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground">{formatTs(rec.timestamp)}</td>
      <td className="py-2.5 pr-4">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
            ok
              ? "bg-primary/10 text-primary"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
          {rec.status}
        </span>
      </td>
      <td className="py-2.5 pr-4 text-xs text-muted-foreground font-mono">{fmtDuration(rec.durationMs)}</td>
      <td className="py-2.5 pr-4 text-xs">{rec.targetResource}</td>
      <td className="py-2.5 text-xs text-muted-foreground max-w-xs truncate">{rec.result}</td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type DetailTab = "overview" | "history" | "resources";

export function AutomationRuleDetail({
  rule,
  channels,
  runningId,
  onBack,
  onToggle,
  onRun,
}: {
  rule: AutomationRule;
  channels: NotificationChannel[];
  runningId: number | null;
  onBack: () => void;
  onToggle: (id: number) => void;
  onRun: (id: number) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");

  const { label: statusLabel, Icon: StatusIcon, className: statusClass } = STATUS_CONFIG[rule.status];
  const catCfg = CATEGORY_CONFIG[rule.category];
  const template = rule.templateId ? TEMPLATES.find((t) => t.id === rule.templateId) : null;

  const successCount = rule.executionHistory.filter((r) => r.status === "success").length;
  const failCount    = rule.executionHistory.filter((r) => r.status === "failed").length;
  const successRate  = rule.executionHistory.length > 0
    ? Math.round((successCount / rule.executionHistory.length) * 100)
    : null;

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview",  label: "Overview"          },
    { id: "history",   label: `History (${rule.executionHistory.length})` },
    { id: "resources", label: "Related Resources" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Back + title */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold leading-tight">{rule.name}</h2>
            <span
              className="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{ background: catCfg.bg, color: catCfg.color }}
            >
              {rule.category}
            </span>
            <div className="flex items-center gap-1">
              <StatusIcon className={cn("size-3.5", statusClass)} />
              <span className={cn("text-xs font-medium", statusClass)}>{statusLabel}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{rule.description}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onToggle(rule.id)}
          >
            {rule.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => onRun(rule.id)}
            disabled={rule.status === "running" || runningId !== null}
          >
            <Play className={cn("size-3", rule.status === "running" && "animate-pulse")} />
            {rule.status === "running" ? "Running…" : "Run Now"}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total Runs",    value: rule.totalRuns },
          { label: "Runs Today",    value: rule.runsToday },
          { label: "Success Rate",  value: successRate != null ? `${successRate}%` : "—" },
          { label: "Last Run",      value: rule.lastRun ?? "Never" },
        ].map(({ label, value }) => (
          <Card key={label} className="border-border bg-background/60">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="mt-1.5 text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2 text-xs font-semibold uppercase tracking-wide transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Trigger + Conditions */}
          <Card className="border-border bg-background/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="size-3.5 text-primary" />
                Trigger &amp; Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trigger</p>
                <p className="text-sm">{rule.trigger}</p>
              </div>

              {template && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Template</p>
                  <p className="text-sm">{template.name}</p>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Conditions ({rule.conditions.length})
                </p>
                {rule.conditions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No conditions defined.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {rule.conditions.map((c, i) => (
                      <li key={c.id} className="flex items-center gap-2 text-xs">
                        {i > 0 && (
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">AND</span>
                        )}
                        <code className="rounded bg-muted px-2 py-0.5 font-mono">
                          {c.field} {c.operator} {c.value}{c.unit ?? ""}
                        </code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="border-border bg-background/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Play className="size-3.5 text-primary" />
                Actions ({rule.actions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {rule.actions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No actions configured.</p>
              ) : (
                rule.actions.map((action) => {
                  const cfg = ACTION_CONFIG[action.type as ActionType];
                  const Icon = ACTION_ICONS[action.type as ActionType];
                  const channel = channels.find((c) => c.id === action.channelId);
                  return (
                    <div
                      key={action.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-3"
                    >
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                        style={{ background: cfg.color + "22", color: cfg.color }}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{cfg.label}</span>
                          {action.severity && (
                            <SeverityBadge severity={action.severity} />
                          )}
                          {channel && (
                            <Badge className="normal-case text-[10px]">
                              {channel.name}
                            </Badge>
                          )}
                          {action.channelType && !channel && (
                            <Badge className="normal-case text-[10px]">{action.channelType}</Badge>
                          )}
                        </div>
                        {action.message && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {action.message}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: History */}
      {tab === "history" && (
        <Card className="border-border bg-background/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="size-3.5 text-primary" />
                Execution History
              </CardTitle>
              {rule.executionHistory.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-primary" />
                    {successCount} success
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="size-3 text-destructive" />
                    {failCount} failed
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {rule.executionHistory.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No execution history. Run the rule to see results here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr className="border-b border-border">
                      {["Time", "Status", "Duration", "Target Resource", "Result"].map((h) => (
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
                    {rule.executionHistory.map((rec) => (
                      <ExecRow key={rec.id} rec={rec} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Related Resources */}
      {tab === "resources" && (
        <Card className="border-border bg-background/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Related Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rule.conditions.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3 text-xs">
                  <div>
                    <p className="font-medium">Resources where <code className="font-mono">{c.field}</code></p>
                    <p className="mt-0.5 text-muted-foreground">
                      Condition: {c.field} {c.operator} {c.value}{c.unit ?? ""}
                    </p>
                  </div>
                  <Badge className="normal-case text-[10px]">Monitored</Badge>
                </div>
              ))}
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Resource-to-rule mapping is populated once the rule has been evaluated against live inventory data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

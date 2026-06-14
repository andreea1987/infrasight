"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Play,
  Plus,
  Search,
  Settings2,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NotificationChannel } from "@/types/infrasight";
import { AutomationWizard } from "./automation-wizard";
import { AutomationRuleDetail } from "./automation-rule-detail";
import {
  CATEGORY_CONFIG,
  INITIAL_RULES,
  TEMPLATE_CATEGORY_COLOR,
  TEMPLATES,
  type AutomationRule,
  type AutomationTemplate,
  type RuleCategory,
  type TemplateCategory,
} from "./automation-data";

// ── Types ─────────────────────────────────────────────────────────────────────

type PanelView = "list" | "templates" | "wizard" | "detail";

const RULE_CATEGORIES: RuleCategory[] = [
  "Infrastructure",
  "Monitoring",
  "Database",
  "Security",
  "Cost Management",
  "Compliance",
  "Notifications",
];

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Infrastructure",
  "Database",
  "Container",
  "Kubernetes",
  "AWS",
  "Azure",
  "Security",
];

const STATUS_CONFIG = {
  active:   { label: "Active",   Icon: CheckCircle2, className: "text-primary"             },
  warning:  { label: "Warning",  Icon: AlertTriangle, className: "text-[hsl(38_88%_60%)]"  },
  disabled: { label: "Disabled", Icon: Settings2,    className: "text-muted-foreground"     },
  running:  { label: "Running",  Icon: Play,         className: "text-accent"               },
} as const;

let nextId = INITIAL_RULES.length + 1;

// ── Template library view ─────────────────────────────────────────────────────

function TemplateLibrary({
  onBack,
  onUse,
}: {
  onBack: () => void;
  onUse: (t: AutomationTemplate) => void;
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<TemplateCategory | null>(null);

  const visible = TEMPLATES.filter((t) => {
    const matchCat = !catFilter || t.templateCategory === catFilter;
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q));
    return matchCat && matchQ;
  });

  const grouped = TEMPLATE_CATEGORIES.reduce<Record<string, typeof TEMPLATES>>(
    (acc, cat) => {
      acc[cat] = visible.filter((t) => t.templateCategory === cat);
      return acc;
    },
    {},
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Template Library</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {TEMPLATES.length} templates across {TEMPLATE_CATEGORIES.length} categories. Use a template to start a new rule.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onBack} className="shrink-0 text-xs">
          ← Back to Rules
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="h-8 pl-8 text-xs max-w-64"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? null : cat)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                catFilter === cat
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {TEMPLATE_CATEGORIES.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        const color = TEMPLATE_CATEGORY_COLOR[cat];
        return (
          <div key={cat}>
            <div className="mb-2.5 flex items-center gap-2">
              <span
                className="h-px flex-1"
                style={{ background: `linear-gradient(90deg, ${color}55, transparent)` }}
              />
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: color + "22", color }}
              >
                {cat}
              </span>
              <span className="text-[10px] text-muted-foreground">{items.length}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-2.5 rounded-lg border border-border bg-background/70 p-3.5 transition-colors hover:border-border/80"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-tight">{t.name}</p>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{t.description}</p>
                  <div className="text-[10px] text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wide opacity-70">Trigger </span>
                    {t.trigger}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-auto h-7 text-xs"
                    onClick={() => onUse(t)}
                  >
                    Use Template →
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {visible.length === 0 && (
        <p className="py-8 text-center text-xs text-muted-foreground">No templates match your search.</p>
      )}
    </div>
  );
}

// ── Rule card ─────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  runningId,
  onView,
  onToggle,
  onRun,
}: {
  rule: AutomationRule;
  runningId: number | null;
  onView: () => void;
  onToggle: () => void;
  onRun: () => void;
}) {
  const { label, Icon: StatusIcon, className: statusClass } = STATUS_CONFIG[rule.status];
  const isDisabled = rule.status === "disabled";
  const isRunning  = rule.status === "running";
  const catCfg = CATEGORY_CONFIG[rule.category];

  const successRate = rule.executionHistory.length > 0
    ? Math.round(rule.executionHistory.filter((r) => r.status === "success").length / rule.executionHistory.length * 100)
    : null;

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border p-4 transition-all",
        isDisabled
          ? "border-border bg-background/40 opacity-60"
          : "border-border bg-background/70 hover:border-primary/20",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="text-sm font-semibold leading-snug hover:text-primary hover:underline"
              onClick={onView}
            >
              {rule.name}
            </button>
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
              style={{ background: catCfg.bg, color: catCfg.color }}
            >
              {rule.category}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{rule.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusIcon className={cn("size-3.5", statusClass)} />
          <span className={cn("text-xs font-medium", statusClass)}>{label}</span>
        </div>
      </div>

      {/* Trigger / Action summary */}
      <div className="space-y-1 text-[11px] text-muted-foreground">
        <div className="flex gap-2">
          <span className="shrink-0 font-bold uppercase tracking-wide text-[9px] pt-0.5">Trigger</span>
          <span>{rule.trigger}</span>
        </div>
        <div className="flex gap-2">
          <span className="shrink-0 font-bold uppercase tracking-wide text-[9px] pt-0.5">Actions</span>
          <span>{rule.actions.map((a) => {
            const label = a.type === "alert" ? `Alert (${a.severity ?? "warning"})`
              : a.type === "notification" ? `Notify (${a.channelType ?? "channel"})`
              : a.type === "event" ? "Create Event"
              : "Log Activity";
            return label;
          }).join(" · ") || "None configured"}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>{rule.lastRun ?? "Never"}</span>
          {rule.runsToday > 0 && (
            <Badge className="ml-0.5 normal-case text-[10px]">{rule.runsToday}× today</Badge>
          )}
          {successRate != null && (
            <span className="text-[10px] opacity-70">{successRate}% success</span>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={onView}>
            Details
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={onToggle}>
            {isDisabled ? "Enable" : "Disable"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={onRun}
            disabled={isRunning || runningId !== null}
          >
            <Play className={cn("size-3", isRunning && "animate-pulse")} />
            {isRunning ? "Running…" : "Run"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

/**
 * Read-only automation rule workspace.
 *
 * What it does:
 * - Displays automation templates and locally modeled rules
 * - Lets operators draft, enable/disable and simulate rules in the UI
 *
 * Assumption:
 * - No infrastructure action is executed from this panel; rule execution is a UI simulation until backend execution exists.
 */
export function AutomationPanel({ channels = [] }: { channels?: NotificationChannel[] }) {
  const [rules, setRules]         = useState<AutomationRule[]>(INITIAL_RULES);
  const [view, setView]           = useState<PanelView>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [catFilter, setCatFilter] = useState<RuleCategory | null>(null);
  const [search, setSearch]       = useState("");
  const [wizardTemplate, setWizardTemplate] = useState<AutomationTemplate | null | undefined>(undefined);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedRule = rules.find((r) => r.id === selectedId) ?? null;

  const visibleRules = rules.filter((r) => {
    const matchCat = !catFilter || r.category === catFilter;
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.trigger.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const activeCount = rules.filter((r) => r.enabled).length;
  const todayRuns   = rules.reduce((s, r) => s + r.runsToday, 0);
  const lastTriggered = rules
    .filter((r) => r.lastRun && r.lastRun !== "Never" && r.lastRun !== null)
    .sort((a, b) => (a.lastRun! > b.lastRun! ? -1 : 1))[0];

  // ── Handlers ──────────────────────────────────────────────────────────────

  function toggleRule(id: number) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, enabled: !r.enabled, status: r.enabled ? "disabled" : "active" }
          : r,
      ),
    );
  }

  async function runRule(id: number) {
    setRunningId(id);
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, status: "running" } : r)));
    await new Promise((res) => setTimeout(res, 1800));
    const now = new Date().toISOString();
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const newRecord = {
          id: `h-${Date.now()}`,
          timestamp: now,
          status: "success" as const,
          durationMs: 350 + Math.floor(Math.random() * 700),
          targetResource: "manual-run",
          result: "Rule evaluated successfully (manual trigger)",
        };
        return {
          ...r,
          status: "active",
          lastRun: "just now",
          runsToday: r.runsToday + 1,
          totalRuns: r.totalRuns + 1,
          executionHistory: [newRecord, ...r.executionHistory],
        };
      }),
    );
    setRunningId(null);
  }

  function handleWizardComplete(
    partial: Omit<AutomationRule, "id" | "createdAt" | "lastRun" | "runsToday" | "totalRuns" | "executionHistory" | "status">,
  ) {
    const newRule: AutomationRule = {
      ...partial,
      id: nextId++,
      status: partial.enabled ? "active" : "disabled",
      createdAt: new Date().toISOString().slice(0, 10),
      lastRun: null,
      runsToday: 0,
      totalRuns: 0,
      executionHistory: [],
    };
    setRules((prev) => [newRule, ...prev]);
    setView("list");
    setWizardTemplate(undefined);
  }

  function openWizard(template?: AutomationTemplate | null) {
    setWizardTemplate(template ?? null);
    setView("wizard");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (view === "templates") {
    return (
      <TemplateLibrary
        onBack={() => setView("list")}
        onUse={(t) => openWizard(t)}
      />
    );
  }

  if (view === "wizard") {
    return (
      <AutomationWizard
        channels={channels}
        initialTemplate={wizardTemplate}
        onComplete={handleWizardComplete}
        onCancel={() => { setView("list"); setWizardTemplate(undefined); }}
      />
    );
  }

  if (view === "detail" && selectedRule) {
    return (
      <AutomationRuleDetail
        rule={selectedRule}
        channels={channels}
        runningId={runningId}
        onBack={() => setView("list")}
        onToggle={(id) => toggleRule(id)}
        onRun={(id) => runRule(id)}
      />
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active Rules",  value: activeCount,          sub: `${rules.length} total` },
          { label: "Runs Today",    value: todayRuns,            sub: "across all rules"        },
          { label: "Last Trigger",  value: lastTriggered?.lastRun ?? "—", sub: lastTriggered?.name ?? "no recent activity" },
        ].map(({ label, value, sub }) => (
          <Card key={label} className="console-line">
            <CardContent className="pt-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
              <p className="mt-3 text-3xl font-semibold">{value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Rules header + controls */}
      <Card className="console-line">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Zap className="size-3.5 text-primary" />
              Automation Rules
              <span className="text-xs font-normal text-muted-foreground">{rules.length} total</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rules…"
                  className="h-8 pl-8 text-xs max-w-52"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setView("templates")}
              >
                <BookOpen className="size-3.5" />
                Templates
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => openWizard()}
              >
                <Plus className="size-3.5" />
                New Rule
              </Button>
            </div>
          </div>

          {/* Category filter chips */}
          <div className="flex flex-wrap gap-1 pt-1">
            <button
              onClick={() => setCatFilter(null)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                catFilter === null
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              All ({rules.length})
            </button>
            {RULE_CATEGORIES.map((cat) => {
              const count = rules.filter((r) => r.category === cat).length;
              if (!count) return null;
              const cfg = CATEGORY_CONFIG[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setCatFilter(catFilter === cat ? null : cat)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                  )}
                  style={
                    catFilter === cat
                      ? { borderColor: cfg.color + "90", background: cfg.bg, color: cfg.color }
                      : undefined
                  }
                >
                  <span className={catFilter !== cat ? "text-muted-foreground" : undefined}>
                    {cat} ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 lg:grid-cols-2">
          {visibleRules.length === 0 ? (
            <div className="col-span-2 py-8 text-center text-xs text-muted-foreground">
              {search || catFilter ? "No rules match your filters." : 'No automation rules yet. Click “New Rule” to get started.'}
            </div>
          ) : (
            visibleRules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                runningId={runningId}
                onView={() => { setSelectedId(rule.id); setView("detail"); }}
                onToggle={() => toggleRule(rule.id)}
                onRun={() => runRule(rule.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Template quick-access */}
      <Card className="console-line">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="size-3.5 text-primary" />
            Template Library
            <span className="text-xs font-normal text-muted-foreground">{TEMPLATES.length} ready-to-use templates</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATE_CATEGORIES.map((cat) => {
              const count = TEMPLATES.filter((t) => t.templateCategory === cat).length;
              const color = TEMPLATE_CATEGORY_COLOR[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setView("templates")}
                  className="flex flex-col gap-1.5 rounded-lg border border-border bg-background/60 p-3 text-left transition-colors hover:border-border/80 hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-semibold"
                      style={{ color }}
                    >
                      {cat}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ background: color + "22", color }}
                    >
                      {count}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {TEMPLATES.filter((t) => t.templateCategory === cat).map((t) => t.name).slice(0, 2).join(", ")}
                    {count > 2 ? ` +${count - 2} more` : ""}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

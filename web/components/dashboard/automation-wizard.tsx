"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  FileText,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlToolbar, FilterChip, ToggleSwitch } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { NotificationChannel } from "@/types/infrasight";
import {
  ACTION_CONFIG,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  TEMPLATE_CATEGORY_COLOR,
  TEMPLATES,
  type ActionType,
  type AutomationAction,
  type AutomationRule,
  type AutomationTemplate,
  type Condition,
  type RuleCategory,
  type TemplateCategory,
} from "./automation-data";

// Re-export CATEGORIES list used in wizard
export const RULE_CATEGORIES: RuleCategory[] = [
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

type WizardForm = {
  selectedTemplate: AutomationTemplate | null;
  name: string;
  category: RuleCategory;
  description: string;
  trigger: string;
  conditions: Condition[];
  actions: AutomationAction[];
  enabled: boolean;
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Step indicators ───────────────────────────────────────────────────────────

function StepBar({ step }: { step: number }) {
  const steps = ["Template", "Conditions", "Actions", "Review"];
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  done  && "bg-primary text-primary-foreground",
                  active && "border-2 border-primary text-primary",
                  !done && !active && "border border-border text-muted-foreground",
                )}
              >
                {done ? <CircleCheck className="size-4" /> : n}
              </div>
              <span
                className={cn(
                  "text-[9px] font-semibold uppercase tracking-wide",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-4 h-px w-10 transition-colors",
                  done ? "bg-primary/60" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Template picker ───────────────────────────────────────────────────

function Step1Templates({
  selected,
  onSelect,
}: {
  selected: AutomationTemplate | null;
  onSelect: (t: AutomationTemplate | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<TemplateCategory | null>(null);

  const visible = TEMPLATES.filter((t) => {
    const matchCat = !catFilter || t.templateCategory === catFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q));
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col gap-4">
      <ControlToolbar>
        <Input
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-64 text-xs"
        />
        <ControlToolbar>
          {TEMPLATE_CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? null : cat)}
              active={catFilter === cat}
              className="text-[10px]"
            >
              {cat}
            </FilterChip>
          ))}
        </ControlToolbar>
      </ControlToolbar>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => {
          const color = TEMPLATE_CATEGORY_COLOR[t.templateCategory];
          const isSelected = selected?.id === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(isSelected ? null : t)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3.5 text-left transition-all",
                isSelected
                  ? "border-primary/60 bg-primary/10 shadow-sm"
                  : "border-border bg-background/60 hover:border-border/80 hover:bg-muted/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-tight">{t.name}</span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                  style={{ background: color + "22", color }}
                >
                  {t.templateCategory}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t.description}</p>
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="font-semibold uppercase opacity-70">Trigger</span>
                <span className="truncate">{t.trigger}</span>
              </p>
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">No templates match your search.</p>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
        <Sparkles className="size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-xs font-medium">Start from scratch</p>
          <p className="text-[11px] text-muted-foreground">Build a custom rule without using a template.</p>
        </div>
        <Button
          onClick={() => onSelect(null)}
          className={cn("ml-auto text-xs", selected === null && "border-primary/60 bg-primary/15 text-primary")}
          size="sm"
          type="button"
          variant={selected === null ? "default" : "secondary"}
        >
          {selected === null ? "Selected" : "Select"}
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Configure conditions ──────────────────────────────────────────────

function Step2Conditions({
  form,
  onChange,
}: {
  form: WizardForm;
  onChange: (patch: Partial<WizardForm>) => void;
}) {
  function addCondition() {
    onChange({
      conditions: [
        ...form.conditions,
        { id: uid(), field: "cpu_percent", operator: ">", value: "80", unit: "%" },
      ],
    });
  }

  function updateCondition(id: string, patch: Partial<Condition>) {
    onChange({ conditions: form.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  function removeCondition(id: string) {
    onChange({ conditions: form.conditions.filter((c) => c.id !== id) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rule Name *</label>
          <Input
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. EC2 High CPU Alert"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</label>
          <Select value={form.category} onChange={(e) => onChange({ category: e.target.value as RuleCategory })}>
            {RULE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trigger Description</label>
          <Input
            value={form.trigger}
            onChange={(e) => onChange({ trigger: e.target.value })}
            placeholder="e.g. CPU > 85% for 5 minutes"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
          <Input
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="What does this rule do?"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Conditions ({form.conditions.length})
          </span>
          <Button
            onClick={addCondition}
            className="text-xs text-primary"
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3" />
            Add Condition
          </Button>
        </div>

        {form.conditions.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No conditions added. Add a condition to define when this rule fires.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {form.conditions.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 p-2.5">
              {i > 0 && (
                <span className="text-[10px] font-bold uppercase text-muted-foreground">AND</span>
              )}
              <Select
                className="flex-1 min-w-[160px] text-xs"
                value={c.field}
                onChange={(e) => updateCondition(c.id, { field: e.target.value })}
              >
                {CONDITION_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
              <Select
                className="w-36 text-xs"
                value={c.operator}
                onChange={(e) => updateCondition(c.id, { operator: e.target.value })}
              >
                {CONDITION_OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </Select>
              <Input
                className="w-24 text-xs"
                value={c.value}
                onChange={(e) => updateCondition(c.id, { value: e.target.value })}
                placeholder="Value"
              />
              {c.unit && (
                <span className="text-xs text-muted-foreground">{c.unit}</span>
              )}
              <Button
                onClick={() => removeCondition(c.id)}
                className="ml-auto hover:text-destructive"
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Actions ───────────────────────────────────────────────────────────

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  alert:        AlertTriangle,
  notification: Bell,
  event:        FileText,
  log:          ScrollText,
};

function Step3Actions({
  form,
  channels,
  onChange,
}: {
  form: WizardForm;
  channels: NotificationChannel[];
  onChange: (patch: Partial<WizardForm>) => void;
}) {
  const actionTypes: ActionType[] = ["alert", "notification", "event", "log"];

  function addAction(type: ActionType) {
    const base: AutomationAction = { id: uid(), type, message: "" };
    if (type === "alert") base.severity = "warning";
    onChange({ actions: [...form.actions, base] });
  }

  function updateAction(id: string, patch: Partial<AutomationAction>) {
    onChange({ actions: form.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }

  function removeAction(id: string) {
    onChange({ actions: form.actions.filter((a) => a.id !== id) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Read-only actions only.</span>{" "}
          All actions observe and notify — no infrastructure changes are made automatically.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Available Actions
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {actionTypes.map((type) => {
            const cfg = ACTION_CONFIG[type];
            const Icon = ACTION_ICONS[type];
            return (
              <button
                key={type}
                onClick={() => addAction(type)}
                className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-3 text-left transition-colors hover:border-border/80 hover:bg-muted/30"
              >
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                  style={{ background: cfg.color + "22", color: cfg.color }}
                >
                  <Icon className="size-3.5" />
                </span>
                <span>
                  <span className="block text-xs font-semibold">{cfg.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{cfg.description}</span>
                </span>
                <Plus className="ml-auto mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </div>

      {form.actions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Configured Actions ({form.actions.length})
          </p>
          <div className="flex flex-col gap-2">
            {form.actions.map((action) => {
              const cfg = ACTION_CONFIG[action.type];
              const Icon = ACTION_ICONS[action.type];
              return (
                <div
                  key={action.id}
                  className="rounded-lg border border-border bg-background/60 p-3"
                >
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded"
                        style={{ background: cfg.color + "22", color: cfg.color }}
                      >
                        <Icon className="size-3" />
                      </span>
                      <span className="text-xs font-semibold">{cfg.label}</span>
                    </div>
                    <Button
                      onClick={() => removeAction(action.id)}
                      className="hover:text-destructive"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {action.type === "alert" && (
                      <Select
                        className="w-28 text-xs"
                        value={action.severity ?? "warning"}
                        onChange={(e) => updateAction(action.id, { severity: e.target.value as AutomationAction["severity"] })}
                      >
                        <option value="critical">Critical</option>
                        <option value="warning">Warning</option>
                        <option value="info">Info</option>
                      </Select>
                    )}

                    {action.type === "notification" && (
                      <Select
                        className="flex-1 min-w-[160px] text-xs"
                        value={action.channelId?.toString() ?? ""}
                        onChange={(e) => {
                          const ch = channels.find((c) => c.id === Number(e.target.value));
                          updateAction(action.id, {
                            channelId: ch?.id,
                            channelType: ch?.channel_type,
                          });
                        }}
                      >
                        <option value="">— Select channel —</option>
                        {channels.filter((c) => c.enabled).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.channel_type})
                          </option>
                        ))}
                      </Select>
                    )}

                    <Input
                      className="flex-1 min-w-[200px] text-xs"
                      value={action.message}
                      onChange={(e) => updateAction(action.id, { message: e.target.value })}
                      placeholder="Message template — use {{resource.name}}, {{metric.value}}"
                    />
                  </div>

                  {action.type === "notification" && channels.length === 0 && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      No notification channels configured. Add one in <span className="text-primary">Settings → Notifications</span>.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {form.actions.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No actions configured. Click an action above to add it to this rule.
        </p>
      )}
    </div>
  );
}

// ── Step 4: Review ────────────────────────────────────────────────────────────

function Step4Review({
  form,
  channels,
  onChange,
}: {
  form: WizardForm;
  channels: NotificationChannel[];
  onChange: (patch: Partial<WizardForm>) => void;
}) {
  const actionIcons: Record<ActionType, React.ElementType> = ACTION_ICONS;

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border bg-background/60">
        <CardContent className="pt-4">
          <div className="grid gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rule Name</span>
            <span className="font-medium">{form.name || <span className="italic text-destructive">Not set</span>}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</span>
            <span>{form.category}</span>
            {form.selectedTemplate && (
              <>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Template</span>
                <span>{form.selectedTemplate.name}</span>
              </>
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trigger</span>
            <span className="text-muted-foreground">{form.trigger || "—"}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Conditions ({form.conditions.length})
          </p>
          {form.conditions.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1">
              {form.conditions.map((c) => (
                <li key={c.id} className="text-xs text-muted-foreground">
                  <span className="font-mono">{c.field} {c.operator} {c.value}{c.unit ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Actions ({form.actions.length})
          </p>
          {form.actions.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1">
              {form.actions.map((a) => {
                const cfg = ACTION_CONFIG[a.type];
                const Icon = actionIcons[a.type];
                const ch = channels.find((c) => c.id === a.channelId);
                return (
                  <li key={a.id} className="flex items-center gap-1.5 text-xs">
                    <Icon className="size-3 shrink-0" style={{ color: cfg.color }} />
                    <span className="font-medium">{cfg.label}</span>
                    {a.severity && <span className="text-muted-foreground">({a.severity})</span>}
                    {ch && <span className="text-muted-foreground">via {ch.name}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3">
        <div>
          <p className="text-sm font-medium">Enable rule after creation</p>
          <p className="text-xs text-muted-foreground">Rule will start evaluating immediately when enabled.</p>
        </div>
        <ToggleSwitch checked={form.enabled} onClick={() => onChange({ enabled: !form.enabled })} />
      </div>
    </div>
  );
}

// ── Main wizard component ─────────────────────────────────────────────────────

export function AutomationWizard({
  onComplete,
  onCancel,
  channels,
  initialTemplate,
}: {
  onComplete: (rule: Omit<AutomationRule, "id" | "createdAt" | "lastRun" | "runsToday" | "totalRuns" | "executionHistory" | "status">) => void;
  onCancel: () => void;
  channels: NotificationChannel[];
  initialTemplate?: AutomationTemplate | null;
}) {
  const startStep = initialTemplate ? 2 : 1;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(startStep as 1 | 2 | 3 | 4);
  const [form, setForm] = useState<WizardForm>({
    selectedTemplate: initialTemplate ?? null,
    name: initialTemplate?.name ?? "",
    category: initialTemplate?.ruleCategory ?? "Monitoring",
    description: initialTemplate?.description ?? "",
    trigger: initialTemplate?.trigger ?? "",
    conditions: (initialTemplate?.defaultConditions ?? []).map((c) => ({ ...c, id: uid() })),
    actions: (initialTemplate?.suggestedActions ?? []).slice(0, 2).map((type) => ({
      id: uid(),
      type,
      message: "",
      ...(type === "alert" ? { severity: "warning" as const } : {}),
    })),
    enabled: true,
  });

  function patch(update: Partial<WizardForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  function applyTemplate(t: AutomationTemplate | null) {
    if (!t) {
      patch({ selectedTemplate: null });
      return;
    }
    patch({
      selectedTemplate: t,
      name: t.name,
      category: t.ruleCategory,
      description: t.description,
      trigger: t.trigger,
      conditions: t.defaultConditions.map((c) => ({ ...c, id: uid() })),
      actions: t.suggestedActions.slice(0, 2).map((type) => ({
        id: uid(),
        type,
        message: "",
        ...(type === "alert" ? { severity: "warning" as const } : {}),
      })),
    });
  }

  const canAdvance =
    (step === 1) ||
    (step === 2 && form.name.trim().length > 0) ||
    (step === 3) ||
    (step === 4);

  function advance() {
    if (step < 4) setStep((s) => (s + 1) as typeof step);
    else handleCreate();
  }

  function handleCreate() {
    onComplete({
      name: form.name,
      category: form.category,
      description: form.description,
      templateId: form.selectedTemplate?.id,
      trigger: form.trigger,
      conditions: form.conditions,
      actions: form.actions,
      enabled: form.enabled,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">
            {step === 1 && "Choose a Template"}
            {step === 2 && "Configure Conditions"}
            {step === 3 && "Configure Actions"}
            {step === 4 && "Review & Enable"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {step === 1 && "Select a template or start from scratch to define your automation rule."}
            {step === 2 && "Set the rule name, trigger description, and conditions that must be met."}
            {step === 3 && "Choose read-only actions — alerts, notifications, events, and logs."}
            {step === 4 && "Review your configuration and enable the rule."}
          </p>
        </div>
        <Button
          onClick={onCancel}
          aria-label="Close automation wizard"
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>

      <StepBar step={step} />

      {/* Step content */}
      <div className="min-h-72">
        {step === 1 && <Step1Templates selected={form.selectedTemplate} onSelect={applyTemplate} />}
        {step === 2 && <Step2Conditions form={form} onChange={patch} />}
        {step === 3 && <Step3Actions form={form} channels={channels} onChange={patch} />}
        {step === 4 && <Step4Review form={form} channels={channels} onChange={patch} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={step === 1 ? onCancel : () => setStep((s) => (s - 1) as typeof step)}
          className="gap-1.5"
        >
          <ChevronLeft className="size-3.5" />
          {step === 1 ? "Cancel" : "Back"}
        </Button>
        <Button
          size="sm"
          onClick={advance}
          disabled={!canAdvance}
          className="gap-1.5"
        >
          {step === 4 ? "Create Rule" : "Continue"}
          {step < 4 && <ChevronRight className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

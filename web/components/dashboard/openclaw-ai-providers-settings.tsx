"use client";

import { Bot, CheckCircle2, KeyRound, Loader2, Server, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  activateAiProvider,
  createAiProvider,
  fetchAiProviders,
  testAiProvider,
  updateAiProvider,
} from "@/services/infrasight-api";
import type { AiProviderConfig, AiProviderConfigPayload, AiProviderType } from "@/types/infrasight";

const PROVIDER_TYPES: { value: AiProviderType; label: string; helper: string }[] = [
  { value: "builtin", label: "Built-in OpenClaw", helper: "Uses the existing OpenClaw fallback and optional server OpenAI env config." },
  { value: "openai_compatible", label: "OpenAI-compatible API", helper: "For OpenAI-compatible /v1 endpoints, gateways and hosted model APIs." },
  { value: "azure_openai", label: "Azure OpenAI", helper: "Use an Azure OpenAI endpoint and deployment/model name." },
  { value: "anthropic", label: "Anthropic Claude", helper: "Uses Anthropic Messages API with an API key." },
  { value: "ollama", label: "Ollama / local model", helper: "Use a local or private Ollama base URL, usually http://localhost:11434." },
  { value: "custom_http", label: "Custom HTTP endpoint", helper: "POSTs a read-only prompt payload and expects answer/text/response JSON." },
];

const DEFAULT_MODELS: Record<AiProviderType, string> = {
  builtin: "built-in",
  openai_compatible: "gpt-4o-mini",
  azure_openai: "deployment-name",
  anthropic: "claude-3-5-sonnet-latest",
  ollama: "llama3.1",
  custom_http: "custom-model",
};

const DEFAULT_BASE_URLS: Partial<Record<AiProviderType, string>> = {
  openai_compatible: "https://api.openai.com/v1",
  azure_openai: "https://YOUR-RESOURCE.openai.azure.com",
  anthropic: "https://api.anthropic.com/v1/messages",
  ollama: "http://localhost:11434",
};

type ProviderForm = AiProviderConfigPayload;

/**
 * Settings page for workspace-scoped OpenClaw AI providers.
 *
 * Inputs:
 * - workspaceId from the active workspace selector
 *
 * Outputs:
 * - provider configuration CRUD, active provider selection, and test results
 *
 * Safety:
 * - API secrets are sent only on save and are never rendered after storage.
 * - Provider tests do not send workspace telemetry.
 * - OpenClaw remains read-only; providers receive only scoped tool output
 *   during chat execution.
 */
export function OpenClawAiProvidersSettings({ workspaceId }: { workspaceId: string }) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [selectedId, setSelectedId] = useState<number | "new">("new");
  const [form, setForm] = useState<ProviderForm>(() => emptyForm(workspaceId));
  const [secretValue, setSecretValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetchAiProviders()
      .then((items) => {
        if (!active) return;
        setProviders(items);
        const activeProvider = items.find((provider) => provider.is_active) ?? items[0];
        if (activeProvider) {
          selectProvider(activeProvider, setSelectedId, setForm, setSecretValue);
        }
      })
      .catch((error) => {
        if (!active) return;
        setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not load AI providers." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedId) ?? null,
    [providers, selectedId],
  );
  const providerMeta = PROVIDER_TYPES.find((item) => item.value === form.provider_type) ?? PROVIDER_TYPES[0];
  const addDisabled = !form.provider_name.trim() || !form.provider_type || (form.provider_type !== "builtin" && form.provider_type !== "anthropic" && !form.base_url?.trim());

  const refresh = async () => {
    const items = await fetchAiProviders();
    setProviders(items);
    return items;
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...form,
        api_secret: secretValue.trim() || undefined,
        workspace_id: workspaceId,
      };
      const saved = selectedId === "new"
        ? await createAiProvider(payload)
        : await updateAiProvider(Number(selectedId), payload);
      const items = await refresh();
      const current = items.find((provider) => provider.id === saved.id) ?? saved;
      selectProvider(current, setSelectedId, setForm, setSecretValue);
      setMessage({ ok: true, text: "AI provider saved. Secrets are stored server-side and masked in the UI." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save AI provider." });
    } finally {
      setSaving(false);
    }
  };

  const activate = async (provider: AiProviderConfig) => {
    setMessage(null);
    try {
      const activeProvider = await activateAiProvider(provider.id);
      const items = await refresh();
      selectProvider(items.find((item) => item.id === activeProvider.id) ?? activeProvider, setSelectedId, setForm, setSecretValue);
      setMessage({ ok: true, text: `${provider.provider_name} is now the active OpenClaw provider for this workspace.` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not activate provider." });
    }
  };

  const test = async (provider: AiProviderConfig) => {
    setTestingId(provider.id);
    setMessage(null);
    try {
      const result = await testAiProvider(provider.id);
      const items = await refresh();
      const current = items.find((item) => item.id === result.provider.id) ?? result.provider;
      selectProvider(current, setSelectedId, setForm, setSecretValue);
      setMessage({ ok: result.status === "Connected", text: result.detail });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Provider test failed." });
    } finally {
      setTestingId(null);
    }
  };

  const changeProviderType = (providerType: AiProviderType) => {
    setForm((prev) => ({
      ...prev,
      provider_type: providerType,
      model_name: DEFAULT_MODELS[providerType],
      base_url: DEFAULT_BASE_URLS[providerType] ?? "",
    }));
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[0.85fr_1fr]">
      <Card className="console-line">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            OpenClaw / AI Providers
          </CardTitle>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedId("new");
              setForm(emptyForm(workspaceId));
              setSecretValue("");
            }}
          >
            Add Provider
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading providers
            </div>
          )}
          {!loading && providers.length === 0 && <EmptyState text="No AI providers configured yet." />}
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => selectProvider(provider, setSelectedId, setForm, setSecretValue)}
              className={`rounded-md border p-3 text-left transition-colors ${
                selectedId === provider.id ? "border-primary/45 bg-primary/10" : "border-border bg-background/60 hover:bg-muted/30"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{provider.provider_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {labelForProvider(provider.provider_type)} · {provider.model_name || "No model"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {provider.is_active && <Badge className="border-primary/30 text-primary">Active</Badge>}
                  <StatusBadge status={provider.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{provider.enabled ? "Enabled" : "Disabled"}</span>
                <span aria-hidden="true">·</span>
                <span>{provider.has_secret ? "Secret saved" : "No secret"}</span>
                {provider.last_test_at && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Tested {formatDate(provider.last_test_at)}</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card className="console-line">
          <CardHeader>
            <CardTitle>{selectedId === "new" ? "Add AI Provider" : "Provider Configuration"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Provider Name</span>
                <Input value={form.provider_name} onChange={(event) => setForm({ ...form, provider_name: event.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Provider Type</span>
                <Select value={form.provider_type} onChange={(event) => changeProviderType(event.target.value as AiProviderType)}>
                  {PROVIDER_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Base URL</span>
                <Input
                  disabled={form.provider_type === "builtin" || form.provider_type === "anthropic"}
                  placeholder={DEFAULT_BASE_URLS[form.provider_type] ?? "https://provider.example.com/v1/chat"}
                  value={form.base_url ?? ""}
                  onChange={(event) => setForm({ ...form, base_url: event.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Model Name</span>
                <Input
                  disabled={form.provider_type === "custom_http"}
                  placeholder={DEFAULT_MODELS[form.provider_type]}
                  value={form.model_name ?? ""}
                  onChange={(event) => setForm({ ...form, model_name: event.target.value })}
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">API Key / Secret</span>
                <Input
                  type="password"
                  disabled={form.provider_type === "builtin" || form.provider_type === "ollama"}
                  placeholder={selectedProvider?.has_secret ? "Secret already saved; enter a new value to replace it" : "Paste API key or secret"}
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {selectedProvider?.has_secret ? "Saved value is masked and never returned to the browser." : "Secrets are stored server-side and masked after saving."}
                </p>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border border-border bg-background/60 p-3 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
                Enabled
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border bg-background/60 p-3 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                Active for this workspace
              </label>
            </div>

            {message && (
              <div className={`rounded-md border px-3 py-2 text-sm ${message.ok ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                {message.text}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button disabled={saving || addDisabled} onClick={save}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save Provider
              </Button>
              {selectedProvider && (
                <>
                  <Button variant="secondary" disabled={selectedProvider.is_active} onClick={() => activate(selectedProvider)}>
                    Make Active
                  </Button>
                  <Button variant="secondary" disabled={testingId === selectedProvider.id} onClick={() => test(selectedProvider)}>
                    {testingId === selectedProvider.id && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Test Connection
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <ProviderDocumentation providerType={form.provider_type} helper={providerMeta.helper} />
      </div>
    </section>
  );
}

function ProviderDocumentation({ helper, providerType }: { helper: string; providerType: AiProviderType }) {
  const rows = docsForProvider(providerType);
  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          Configuration Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        <p>{helper}</p>
        {rows.map((row) => (
          <div key={row.title} className="rounded-md border border-border bg-background/60 p-3">
            <p className="font-semibold text-foreground">{row.title}</p>
            <p className="mt-1">{row.detail}</p>
          </div>
        ))}
        <div className="rounded-md border border-primary/25 bg-primary/10 p-3 text-primary">
          OpenClaw remains read-only. Providers receive only selected workspace tool context and cannot execute discovery, remediation, alert updates, or infrastructure changes.
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: AiProviderConfig["status"] }) {
  if (status === "Connected") {
    return <Badge className="border-primary/30 text-primary"><CheckCircle2 className="mr-1 size-3" />Connected</Badge>;
  }
  if (status === "Failed") {
    return <Badge className="border-destructive/30 text-destructive"><XCircle className="mr-1 size-3" />Failed</Badge>;
  }
  return <Badge><Server className="mr-1 size-3" />Not Configured</Badge>;
}

function emptyForm(workspaceId: string): ProviderForm {
  return {
    provider_name: "OpenAI-compatible Provider",
    provider_type: "openai_compatible",
    base_url: DEFAULT_BASE_URLS.openai_compatible,
    api_secret: "",
    model_name: DEFAULT_MODELS.openai_compatible,
    enabled: true,
    is_active: false,
    workspace_id: workspaceId,
  };
}

function selectProvider(
  provider: AiProviderConfig,
  setSelectedId: (id: number | "new") => void,
  setForm: (form: ProviderForm) => void,
  setSecretValue: (value: string) => void,
) {
  setSelectedId(provider.id);
  setForm({
    provider_name: provider.provider_name,
    provider_type: provider.provider_type,
    base_url: provider.base_url ?? "",
    api_secret: "",
    model_name: provider.model_name ?? "",
    enabled: provider.enabled,
    is_active: provider.is_active,
    workspace_id: provider.workspace_id,
  });
  setSecretValue("");
}

function labelForProvider(providerType: AiProviderType) {
  return PROVIDER_TYPES.find((item) => item.value === providerType)?.label ?? providerType;
}

function docsForProvider(providerType: AiProviderType) {
  const common = [
    {
      title: "Fallback behavior",
      detail: "If the selected provider is failed or not configured, OpenClaw uses the built-in structured analyst response.",
    },
  ];
  const specific: Record<AiProviderType, { title: string; detail: string }[]> = {
    builtin: [
      { title: "Built-in mode", detail: "No browser-side secret is required. If the backend has an OpenAI key environment variable, it can use it; otherwise it uses deterministic OpenClaw analysis." },
    ],
    openai_compatible: [
      { title: "Base URL", detail: "Use the provider root URL, for example https://api.openai.com/v1 or your gateway's /v1 endpoint." },
      { title: "Model", detail: "Use the provider's chat model name. The backend sends an OpenAI-compatible chat completion request." },
    ],
    azure_openai: [
      { title: "Base URL", detail: "Use the Azure resource URL. The model field should be the deployment name." },
      { title: "Secret", detail: "Use the Azure OpenAI API key. Managed identity exchange is a future backend integration point." },
    ],
    anthropic: [
      { title: "Endpoint", detail: "The default Anthropic Messages API endpoint is used unless a custom endpoint is configured later in backend integration." },
      { title: "Model", detail: "Use a Claude model such as claude-3-5-sonnet-latest." },
    ],
    ollama: [
      { title: "Local access", detail: "Set the base URL to the Ollama server reachable from the backend, not necessarily from the browser." },
      { title: "Secret", detail: "Ollama does not require an API key by default." },
    ],
    custom_http: [
      { title: "Request shape", detail: "The backend POSTs { model, system, prompt } and reads answer, text or response from the JSON reply." },
      { title: "Secret", detail: "If a secret is configured, it is sent as a Bearer token by the backend." },
    ],
  };
  return [...specific[providerType], ...common];
}

function formatDate(value?: string | null) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

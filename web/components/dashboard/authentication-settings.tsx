"use client";

import { CheckCircle2, KeyRound, ShieldCheck, TestTube2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createSsoProvider,
  fetchSsoProviders,
  testSsoProvider,
  updateSsoProvider,
} from "@/services/infrasight-api";
import type { InfrasightRole, SsoProviderConfig, SsoProviderConfigPayload, SsoProviderType } from "@/types/infrasight";

const DEFAULT_CALLBACK = "http://localhost:8000/auth/sso/callback";

/**
 * Admin panel for workspace-scoped SSO provider configuration.
 *
 * Inputs:
 * - workspaceId: active tenant/workspace selected in the sidebar
 *
 * Outputs:
 * - tenant-scoped SAML/OIDC provider records
 * - masked secret state and structural test results
 *
 * Important assumptions:
 * - certificates and client secrets are submitted to the backend only and are
 *   never rendered in full after saving.
 * - live IdP metadata exchange is pending backend integration.
 */
export function AuthenticationSettings({ workspaceId }: { workspaceId: string }) {
  const [providers, setProviders] = useState<SsoProviderConfig[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<SsoProviderConfigPayload>({
    provider_name: "",
    provider_type: "SAML",
    entity_id: "",
    client_id: "",
    sso_url: "",
    authorization_url: "",
    metadata_url: "",
    callback_url: DEFAULT_CALLBACK,
    workspace_id: workspaceId,
    enabled: false,
    auto_provisioning_enabled: false,
    allowed_domains: [],
    default_role: "viewer",
    role_mapping: {
      "Infrasight-Admins": "admin",
      "Infrasight-Operators": "operator",
      "Infrasight-Viewers": "viewer",
    },
    scim: {
      enabled: false,
      endpoint: "/scim/v2",
      token_configured: false,
    },
    certificate: "",
    client_secret: "",
  });

  useEffect(() => {
    void loadProviders();
  }, [workspaceId]);

  const enabledProvider = useMemo(
    () => providers.find((provider) => provider.enabled),
    [providers],
  );

  const canSave = Boolean(form.provider_name.trim() && form.provider_type && form.callback_url?.trim());

  async function loadProviders() {
    try {
      setProviders(await fetchSsoProviders());
    } catch {
      setProviders([]);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    setMessage(null);
    try {
      await createSsoProvider({
        ...form,
        workspace_id: workspaceId,
        certificate: form.certificate?.trim() || undefined,
        client_secret: form.client_secret?.trim() || undefined,
      });
      setForm((prev) => ({
        ...prev,
        provider_name: "",
        entity_id: "",
        client_id: "",
        sso_url: "",
        authorization_url: "",
        metadata_url: "",
        certificate: "",
        client_secret: "",
      }));
      await loadProviders();
      setMessage({ ok: true, text: "SSO provider saved. Secrets are stored server-side and masked here." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Failed to save SSO provider." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleProvider(provider: SsoProviderConfig) {
    setPendingId(provider.id);
    try {
      await updateSsoProvider(provider.id, { enabled: !provider.enabled });
      await loadProviders();
    } finally {
      setPendingId(null);
    }
  }

  async function runTest(provider: SsoProviderConfig) {
    setPendingId(provider.id);
    setMessage(null);
    try {
      const result = await testSsoProvider(provider.id);
      await loadProviders();
      setMessage({ ok: result.status !== "failed", text: result.detail });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "SSO test failed." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="console-line">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-primary" />
            Authentication / SSO
          </CardTitle>
          <Badge className="text-[10px]">
            {enabledProvider ? `${enabledProvider.provider_name} enabled` : "Local auth active"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
          Local email/password sign-in is active now. SAML/OIDC provider records are workspace-scoped and ready for backend IdP exchange, callback validation and group claim mapping.
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="Enable SSO">
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              className={cn(
                "relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors",
                form.enabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  form.enabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </Field>
          <Field label="Auto Provision Users">
            <button
              type="button"
              role="switch"
              aria-checked={form.auto_provisioning_enabled}
              onClick={() => setForm({ ...form, auto_provisioning_enabled: !form.auto_provisioning_enabled })}
              className={cn(
                "relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors",
                form.auto_provisioning_enabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  form.auto_provisioning_enabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </Field>
          <Field label="Provider Type">
            <Select
              value={form.provider_type}
              onChange={(event) => setForm({ ...form, provider_type: event.target.value as SsoProviderType })}
            >
              <option value="SAML">SAML</option>
              <option value="OIDC">OIDC</option>
            </Select>
          </Field>
          <Field label="Display Name">
            <Input
              value={form.provider_name}
              onChange={(event) => setForm({ ...form, provider_name: event.target.value })}
              placeholder="Microsoft Entra ID"
            />
          </Field>
          <Field label="Metadata URL">
            <Input
              value={form.metadata_url}
              onChange={(event) => setForm({ ...form, metadata_url: event.target.value })}
              placeholder="https://idp.example.com/metadata"
            />
          </Field>
          <Field label="Entity ID / Client ID">
            <Input
              value={form.provider_type === "SAML" ? form.entity_id : form.client_id}
              onChange={(event) =>
                setForm(
                  form.provider_type === "SAML"
                    ? { ...form, entity_id: event.target.value }
                    : { ...form, client_id: event.target.value },
                )
              }
              placeholder={form.provider_type === "SAML" ? "urn:infrasight:workspace" : "client-id"}
            />
          </Field>
          <Field label="SSO / Authorization URL">
            <Input
              value={form.provider_type === "SAML" ? form.sso_url : form.authorization_url}
              onChange={(event) =>
                setForm(
                  form.provider_type === "SAML"
                    ? { ...form, sso_url: event.target.value }
                    : { ...form, authorization_url: event.target.value },
                )
              }
              placeholder="https://idp.example.com/sso"
            />
          </Field>
          <Field label="Certificate / Client Secret">
            <Input
              type="password"
              value={form.provider_type === "SAML" ? form.certificate : form.client_secret}
              onChange={(event) =>
                setForm(
                  form.provider_type === "SAML"
                    ? { ...form, certificate: event.target.value }
                    : { ...form, client_secret: event.target.value },
                )
              }
              placeholder="Stored and masked after save"
            />
          </Field>
          <Field label="Callback URL">
            <Input
              value={form.callback_url}
              onChange={(event) => setForm({ ...form, callback_url: event.target.value })}
            />
          </Field>
          <Field label="Allowed Domains">
            <Input
              value={form.allowed_domains.join(", ")}
              onChange={(event) =>
                setForm({
                  ...form,
                  allowed_domains: event.target.value
                    .split(",")
                    .map((domain) => domain.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
              placeholder="example.com, company.org"
            />
          </Field>
          <Field label="Default SSO Role">
            <Select
              value={form.default_role}
              onChange={(event) => setForm({ ...form, default_role: event.target.value as InfrasightRole })}
            >
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </Select>
          </Field>
          <Field label="Role Mapping">
            <RoleMappingEditor
              value={form.role_mapping}
              onChange={(role_mapping) => setForm({ ...form, role_mapping })}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={!canSave || busy} onClick={handleSave}>
            {busy ? "Saving..." : "Save SSO Provider"}
          </Button>
          {message && (
            <span className={cn("text-xs", message.ok ? "text-primary" : "text-destructive")}>
              {message.text}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Configured Providers
          </p>
          {providers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
              No SSO providers configured for this workspace yet.
            </p>
          ) : (
            providers.map((provider) => (
              <div key={provider.id} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{provider.provider_name}</p>
                      <Badge className="text-[10px]">{provider.provider_type}</Badge>
                      <Badge className={cn("text-[10px]", !provider.enabled && "opacity-50")}>
                        {provider.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Callback: {provider.callback_url || "not set"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Secrets: certificate {provider.has_certificate ? provider.masked_certificate : "not set"} · client secret {provider.has_client_secret ? provider.masked_client_secret : "not set"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Auto-provisioning: {provider.auto_provisioning_enabled ? "enabled" : "disabled"} · default role {provider.default_role} · domains {provider.allowed_domains.length ? provider.allowed_domains.join(", ") : "any"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      SCIM: {provider.scim?.enabled ? "placeholder enabled" : "placeholder ready"}
                    </p>
                    {provider.last_test_result && (
                      <p className={cn("mt-1 flex items-center gap-1 text-[11px]", provider.last_test_result === "failed" ? "text-destructive" : "text-primary")}>
                        {provider.last_test_result === "failed" ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
                        {provider.last_test_error || provider.last_test_result}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 gap-1 text-[11px]"
                      disabled={pendingId === provider.id}
                      onClick={() => runTest(provider)}
                    >
                      <TestTube2 className="size-3" />
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[11px]"
                      disabled={pendingId === provider.id}
                      onClick={() => toggleProvider(provider)}
                    >
                      {provider.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function RoleMappingEditor({
  value,
  onChange,
}: {
  value: Record<string, InfrasightRole>;
  onChange: (value: Record<string, InfrasightRole>) => void;
}) {
  const rows = Object.entries(value);
  return (
    <div className="space-y-2">
      {rows.map(([group, role]) => (
        <div key={group} className="grid grid-cols-[1fr_110px] gap-2">
          <Input
            value={group}
            onChange={(event) => {
              const next = { ...value };
              delete next[group];
              next[event.target.value] = role;
              onChange(next);
            }}
            className="h-8 text-xs"
          />
          <Select
            value={role}
            onChange={(event) => onChange({ ...value, [group]: event.target.value as InfrasightRole })}
            className="h-8 text-xs"
          >
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </Select>
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-primary hover:underline"
        onClick={() => onChange({ ...value, "New-Group": "viewer" })}
      >
        <ShieldCheck className="size-3" />
        Add group mapping
      </button>
    </div>
  );
}

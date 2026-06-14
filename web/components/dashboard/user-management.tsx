"use client";

import { ShieldCheck, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  disableManagedUser,
  fetchManagedUsers,
  fetchOrganizations,
  inviteManagedUser,
  updateManagedUser,
} from "@/services/infrasight-api";
import type {
  InfrasightRole,
  ManagedUser,
  ManagedUserAuthType,
  ManagedUserStatus,
  Organization,
} from "@/types/infrasight";

/**
 * Settings page for workspace user management.
 *
 * Inputs:
 * - active workspaceId from the sidebar context
 *
 * Outputs:
 * - invited users with role, auth type, status and workspace access
 * - non-destructive role/status updates
 *
 * Important assumptions:
 * - Deletion is intentionally absent; users are disabled for auditability.
 * - SSO and SCIM provisioning structures are prepared, but real IdP/SCIM
 *   lifecycle events are backend integration work.
 */
export function UserManagement({ workspaceId }: { workspaceId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [workspaces, setWorkspaces] = useState<Organization[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    role: "operator" as InfrasightRole,
    authType: "local" as ManagedUserAuthType,
    workspaceIds: [workspaceId],
  });

  useEffect(() => {
    void loadUsers();
    fetchOrganizations().then(setWorkspaces).catch(() => {
      setWorkspaces([{
        id: 0,
        tenant_id: workspaceId,
        name: workspaceId === "internal" ? "Internal Operations" : workspaceId,
        status: "active",
        created_at: new Date().toISOString(),
      }]);
    });
  }, [workspaceId]);

  const workspaceOptions = useMemo(() => {
    if (workspaces.length) return workspaces;
    return [{
      id: 0,
      tenant_id: workspaceId,
      name: workspaceId,
      status: "active",
      created_at: new Date().toISOString(),
    }];
  }, [workspaceId, workspaces]);

  const canInvite = Boolean(form.email.trim() && form.workspaceIds.length);

  async function loadUsers() {
    setUsers(await fetchManagedUsers());
  }

  async function inviteUser() {
    if (!canInvite) return;
    setBusy(true);
    setMessage(null);
    try {
      await inviteManagedUser({
        email: form.email,
        display_name: form.displayName,
        role: form.role,
        auth_type: form.authType,
        workspace_ids: form.workspaceIds,
      });
      setForm({
        email: "",
        displayName: "",
        role: "operator",
        authType: "local",
        workspaceIds: [workspaceId],
      });
      await loadUsers();
      setMessage({ ok: true, text: "User invited. They can be activated by local sign-in or future SSO provisioning." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Failed to invite user." });
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(user: ManagedUser, payload: Parameters<typeof updateManagedUser>[1]) {
    setPendingId(user.id);
    try {
      await updateManagedUser(user.id, payload);
      await loadUsers();
    } finally {
      setPendingId(null);
    }
  }

  async function disableUser(user: ManagedUser) {
    setPendingId(user.id);
    try {
      await disableManagedUser(user.id);
      await loadUsers();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <Card className="console-line">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <UserPlus className="size-4 text-primary" />
            Invite User
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_140px_120px]">
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="operator@example.com"
              />
            </Field>
            <Field label="Display Name">
              <Input
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                placeholder="Optional"
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as InfrasightRole })}
              >
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </Select>
            </Field>
            <Field label="Auth Type">
              <Select
                value={form.authType}
                onChange={(event) => setForm({ ...form, authType: event.target.value as ManagedUserAuthType })}
              >
                <option value="local">Local</option>
                <option value="sso">SSO</option>
              </Select>
            </Field>
          </div>
          <WorkspacePicker
            label="Workspace Access"
            options={workspaceOptions}
            selected={form.workspaceIds}
            onChange={(workspaceIds) => setForm({ ...form, workspaceIds })}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={!canInvite || busy} onClick={inviteUser}>
              {busy ? "Inviting..." : "Invite User"}
            </Button>
            {message && (
              <span className={cn("text-xs", message.ok ? "text-primary" : "text-destructive")}>
                {message.text}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="console-line">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-primary" />
            Users
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              {users.length} records
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
              No users have been invited to this workspace yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-border">
                    {["User", "Role", "Workspace Access", "Auth", "Status", "Last Login", "Actions"].map((header) => (
                      <th key={header} className="pb-2 pr-4 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4">
                        <p className="text-sm font-semibold">{user.display_name || user.email}</p>
                        <p className="text-[11px] text-muted-foreground">{user.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Select
                          value={user.role}
                          disabled={pendingId === user.id || user.status === "disabled"}
                          onChange={(event) => patchUser(user, { role: event.target.value as InfrasightRole })}
                          className="h-8 min-w-[120px] text-xs"
                        >
                          <option value="admin">Admin</option>
                          <option value="operator">Operator</option>
                          <option value="viewer">Viewer</option>
                        </Select>
                      </td>
                      <td className="py-3 pr-4">
                        <WorkspacePicker
                          compact
                          options={workspaceOptions}
                          selected={user.workspace_ids}
                          onChange={(workspace_ids) => patchUser(user, { workspace_ids })}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <Badge className="text-[10px] normal-case">{user.auth_type.toUpperCase()}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={user.status} />
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-2">
                          {user.status === "disabled" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-[11px]"
                              disabled={pendingId === user.id}
                              onClick={() => patchUser(user, { status: "active" })}
                            >
                              Reactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-[11px]"
                              disabled={pendingId === user.id}
                              onClick={() => disableUser(user)}
                            >
                              Disable
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="console-line">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-primary" />
            SSO / SCIM Provisioning Readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
          <ProvisioningNote title="SSO first login">
            Enabled providers can auto-provision users after a successful SAML/OIDC callback when allowed domains and default role checks pass.
          </ProvisioningNote>
          <ProvisioningNote title="Group mapping">
            Provider group claims are prepared to map into Admin, Operator and Viewer roles from the Authentication/SSO settings.
          </ProvisioningNote>
          <ProvisioningNote title="SCIM placeholder">
            The data model includes a SCIM configuration object for future external create/update/deactivate provisioning.
          </ProvisioningNote>
        </CardContent>
      </Card>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function WorkspacePicker({
  compact,
  label,
  options,
  selected,
  onChange,
}: {
  compact?: boolean;
  label?: string;
  options: Organization[];
  selected: string[];
  onChange: (workspaceIds: string[]) => void;
}) {
  const toggle = (workspaceId: string) => {
    const next = selected.includes(workspaceId)
      ? selected.filter((value) => value !== workspaceId)
      : [...selected, workspaceId];
    onChange(next.length ? next : selected);
  };

  return (
    <div className={cn("space-y-1", compact && "max-w-[280px]")}>
      {label && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map((workspace) => {
          const active = selected.includes(workspace.tenant_id);
          return (
            <button
              key={workspace.tenant_id}
              type="button"
              onClick={() => toggle(workspace.tenant_id)}
              className={cn(
                "rounded-full border px-2 py-1 text-[11px] transition-colors",
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-muted/20 text-muted-foreground hover:text-foreground",
              )}
            >
              {workspace.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ManagedUserStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
        status === "active" && "bg-primary/10 text-primary",
        status === "invited" && "bg-warning/10 text-warning",
        status === "disabled" && "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function ProvisioningNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="mb-1 text-xs font-semibold text-foreground">{title}</p>
      <p>{children}</p>
    </div>
  );
}

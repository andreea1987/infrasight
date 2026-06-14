"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loginWithPassword, startSsoSignIn } from "@/services/infrasight-api";
import type { AuthSession } from "@/types/infrasight";

/**
 * Renders the entry point for local auth and future enterprise SSO.
 *
 * Inputs:
 * - onAuthenticated: called with non-secret session context after local login
 *
 * Outputs:
 * - local email/password session via HTTP-only backend cookie
 * - SSO provider lookup result for pending SAML/OIDC integration
 *
 * Assumption:
 * - Real SAML/OIDC redirects are backend-owned so provider secrets never reach
 *   the browser.
 */
export function SignInPage({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [email, setEmail] = useState("admin@infrasight.local");
  const [password, setPassword] = useState("AdminDemo123!");
  const [workspaceId, setWorkspaceId] = useState("internal");
  const [busy, setBusy] = useState<"local" | "sso" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const canSubmit = email.trim() && password.trim();

  const handleLocalSignIn = async () => {
    setBusy("local");
    setMessage(null);
    try {
      const session = await loginWithPassword(email.trim(), password, workspaceId.trim() || undefined);
      onAuthenticated(session);
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Sign-in failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleSso = async () => {
    setBusy("sso");
    setMessage(null);
    try {
      const result = await startSsoSignIn({
        email: email.trim() || undefined,
        workspace_id: workspaceId.trim() || undefined,
      });
      setMessage({
        ok: result.status !== "not_configured",
        text: result.redirect_url
          ? `${result.message} Redirect target: ${result.redirect_url}`
          : result.message,
      });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "SSO start failed.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_420px]">
        <section className="flex flex-col justify-center">
          <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-primary/40 bg-primary/15 text-lg font-black text-primary shadow-glow-sm">
            IS
          </div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-primary/80">
            InfraSight Command Fabric
          </p>
          <h1 className="max-w-xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            Sign in to your operations workspace
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
            Local authentication is available now. SAML and OIDC providers can be configured per workspace and will use the same session and role model when backend provider exchange is connected.
          </p>
          <div className="mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
            {["HTTP-only sessions", "Workspace scoped", "Role aware"].map((item) => (
              <div key={item} className="rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="mb-2 size-4 text-primary" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <Card className="console-line">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <LockKeyhole className="size-4 text-primary" />
              Sign In
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) void handleLocalSignIn();
              }}
            >
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Password
                </label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Workspace ID
                </label>
                <Input
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  placeholder="internal"
                />
              </div>

              {message && (
                <p
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs",
                    message.ok
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                >
                  {message.text}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={!canSubmit || busy === "local"}>
                {busy === "local" ? "Signing in..." : "Sign in"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={busy === "sso"}
                onClick={handleSso}
              >
                {busy === "sso" ? "Checking SSO..." : "Continue with SSO"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

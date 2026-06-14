/**
 * AlertStream
 * ===========
 * Renders a card listing alert records with inline action buttons.
 * Actions: Ack (acknowledge), Resolve, and Send (trigger notifications).
 */

import { notifyAlert, updateAlert } from "@/services/infrasight-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import type { AlertRecord } from "@/types/infrasight";

export function AlertStream({
  alerts,
  refresh,
  title,
}: {
  alerts: AlertRecord[];
  refresh?: () => Promise<void>;
  title: string;
}) {
  const runAlertAction = async (
    alert: AlertRecord,
    action: "ack" | "resolve" | "notify",
  ) => {
    if (String(alert.id).startsWith("mock")) return;

    if (action === "notify") {
      await notifyAlert(alert.id);
    } else {
      await updateAlert(alert.id, action);
    }

    await refresh?.();
  };

  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {alerts.map((alert, index) => (
          <div
            className="grid gap-3 rounded-md border border-border bg-background/60 p-3 md:grid-cols-[110px_1fr_auto_auto] md:items-center"
            key={`${alert.id}-${index}`}
          >
            <SeverityBadge severity={alert.severity} />
            <div>
              <div className="font-medium">{alert.title}</div>
              <div className="text-xs text-muted-foreground">
                {alert.source} - {alert.metric_name ?? "inventory"} - {alert.status}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {alert.metric_value ?? "n/a"} / {alert.threshold ?? "n/a"}
            </div>
            {refresh && (
              <div className="flex flex-wrap gap-2">
                {alert.status === "open" && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => runAlertAction(alert, "ack")}>
                      Ack
                    </Button>
                    <Button size="sm" onClick={() => runAlertAction(alert, "resolve")}>
                      Resolve
                    </Button>
                  </>
                )}
                <Button size="sm" variant="secondary" onClick={() => runAlertAction(alert, "notify")}>
                  Send
                </Button>
              </div>
            )}
          </div>
        ))}
        {alerts.length === 0 && <EmptyState text="No alerts found." />}
      </CardContent>
    </Card>
  );
}

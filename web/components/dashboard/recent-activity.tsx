import { Activity, Bell, CheckCircle2, EyeOff, ServerOff } from "lucide-react";

import { buildRecentActivity } from "@/dashboard/activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";
import type { AlertRecord, RecentActivityItem, Resource } from "@/types/infrasight";

const iconMap = {
  alert_triggered: Bell,
  alert_resolved: CheckCircle2,
  resource_discovered: Activity,
  resource_removed: ServerOff,
  monitoring_state: EyeOff,
};

const toneMap: Record<RecentActivityItem["severity"], string> = {
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-primary/30 bg-primary/10 text-primary",
  info: "border-accent/30 bg-accent/10 text-accent",
};

export function RecentActivity({
  alerts,
  lastEvent,
  resources,
}: {
  alerts: AlertRecord[];
  lastEvent: string;
  resources: Resource[];
}) {
  const activities = buildRecentActivity({ alerts, lastEvent, resources });

  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {activities.map((activity) => {
          const Icon = iconMap[activity.type];
          return (
            <div
              key={activity.id}
              className="grid gap-3 rounded-md border border-border bg-background/60 p-3 sm:grid-cols-[36px_1fr_auto] sm:items-center"
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg border",
                  toneMap[activity.severity],
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{activity.title}</p>
                <p className="truncate text-xs text-muted-foreground">{activity.detail}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatActivityTime(activity.timestamp)}
              </p>
            </div>
          );
        })}
        {activities.length === 0 && <EmptyState text="No operational activity yet." />}
      </CardContent>
    </Card>
  );
}

function formatActivityTime(timestamp?: string) {
  if (!timestamp) return "latest";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "latest";

  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

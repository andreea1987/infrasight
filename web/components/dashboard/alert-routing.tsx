import { Mail, Slack, Workflow } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NotificationChannel } from "@/types/infrasight";

export function AlertRouting({ channels }: { channels: NotificationChannel[] }) {
  const counts = {
    email: channels.filter((channel) => channel.channel_type === "email" && channel.enabled).length,
    slack: channels.filter((channel) => channel.channel_type === "slack" && channel.enabled).length,
    teams: channels.filter((channel) => channel.channel_type === "teams" && channel.enabled).length,
  };

  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle>Alert Routing</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <RouteCard icon={Mail} label="Email" value={counts.email} />
        <RouteCard icon={Slack} label="Slack" value={counts.slack} />
        <RouteCard icon={Workflow} label="Microsoft Teams" value={counts.teams} />
      </CardContent>
    </Card>
  );
}

function RouteCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-4">
      <Icon className="mb-3 size-5 text-primary" />
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">enabled destinations</div>
    </div>
  );
}

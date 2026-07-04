import { AlertTriangle, CheckCircle2, Info, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AlertRecord, MonitoringSummary, Resource } from "@/types/infrasight";

type InsightType = "critical" | "warning" | "success" | "info";

type Insight = {
  type: InsightType;
  title: string;
  detail: string;
};

const iconMap = {
  critical: AlertTriangle,
  warning: TrendingDown,
  success: CheckCircle2,
  info: Info,
};

const colorMap: Record<InsightType, string> = {
  critical: "text-destructive bg-destructive/10 border-destructive/20",
  warning: "text-warning bg-warning/10 border-warning/20",
  success: "text-primary bg-primary/10 border-primary/20",
  info: "text-accent bg-accent/10 border-accent/20",
};

function isDatabaseResource(r: Resource) {
  return (
    r.resource_type.includes("database") ||
    r.resource_type.includes("postgres") ||
    r.resource_type.includes("sql") ||
    r.resource_type.includes("rds")
  );
}

export function AIInsights({
  alerts,
  resources,
  summary,
}: {
  alerts: AlertRecord[];
  resources: Resource[];
  summary: MonitoringSummary;
}) {
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" && a.status === "open");
  const unhealthyResources = resources.filter(
    (r) => r.status === "unhealthy" || r.status === "error" || r.status === "stopped",
  );
  const dbResources = resources.filter(isDatabaseResource);
  const awsResources = resources.filter((r) => r.provider === "aws");
  const azureResources = resources.filter((r) => r.provider === "azure");

  const insights: Insight[] = [];

  if (criticalAlerts.length > 0) {
    insights.push({
      type: "critical",
      title: `${criticalAlerts.length} critical alert${criticalAlerts.length > 1 ? "s" : ""} need attention`,
      detail: criticalAlerts
        .slice(0, 2)
        .map((a) => a.title)
        .join("; "),
    });
  }

  if (unhealthyResources.length > 0) {
    insights.push({
      type: "warning",
      title: `${unhealthyResources.length} resource${unhealthyResources.length > 1 ? "s" : ""} reporting degraded status`,
      detail: unhealthyResources
        .slice(0, 2)
        .map((r) => r.name)
        .join(", "),
    });
  } else if (resources.length > 0) {
    insights.push({
      type: "success",
      title: `${summary.healthy_percentage}% of infrastructure is healthy`,
      detail: `${resources.length} resources monitored across all providers`,
    });
  }

  if (awsResources.length > 0 && azureResources.length > 0) {
    insights.push({
      type: "info",
      title: "Multi-cloud estate detected",
      detail: `${awsResources.length} AWS · ${azureResources.length} Azure resources in scope`,
    });
  } else if (awsResources.length > 0) {
    insights.push({
      type: "info",
      title: `${awsResources.length} AWS resource${awsResources.length > 1 ? "s" : ""} in estate`,
      detail: "EC2, RDS, and associated services discovered",
    });
  }

  if (dbResources.length > 0) {
    insights.push({
      type: "info",
      title: `${dbResources.length} database${dbResources.length > 1 ? "s" : ""} in managed estate`,
      detail: "Connected via unified connector health monitoring",
    });
  }

  if (insights.length === 0) {
    insights.push(
      {
        type: "success",
        title: "Infrastructure is operating normally",
        detail: "No anomalies detected across monitored resources",
      },
      {
        type: "info",
        title: "OpenClaw ready for operational queries",
        detail: "Ask about inventory, metrics, alerts, or remediation",
      },
    );
  }

  const displayInsights = insights.slice(0, 4);

  return (
    <Card className="console-line">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary" />
          AI Operational Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {displayInsights.map((insight, i) => {
          const Icon = iconMap[insight.type];
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                colorMap[insight.type],
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">{insight.title}</p>
                <p className="mt-1 text-xs opacity-75 leading-relaxed line-clamp-2">
                  {insight.detail}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
      <div className="flex items-center gap-1.5 border-t border-border px-5 py-2.5">
        <Sparkles className="size-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Powered by OpenClaw · updated on data refresh</span>
        <TrendingUp className="ml-auto size-3 text-primary/60" />
      </div>
    </Card>
  );
}

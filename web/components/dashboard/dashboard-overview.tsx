import { AlertRouting } from "@/components/dashboard/alert-routing";
import { AIInsights } from "@/components/dashboard/ai-insights";
import { AlertStream } from "@/components/dashboard/alert-stream";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { SummaryCards, type SummaryMetricTarget } from "@/components/dashboard/summary-cards";
import { TopologyPlaceholder } from "@/components/dashboard/topology-placeholder";
import { ChartCard } from "@/charts/chart-card";
import type {
  AlertRecord,
  ChartDatum,
  MonitoringSummary,
  NotificationChannel,
  Resource,
} from "@/types/infrasight";

/**
 * Main operations dashboard for the active workspace.
 *
 * Inputs:
 * - summary metrics, resources, alerts and notification channels
 *
 * Output:
 * - operational metric cards, recent activity, AI insights, topology preview
 *   and alert routing/stream panels
 */
export function DashboardOverview({
  alerts,
  channels,
  openAlerts,
  onSummaryMetricClick,
  onOpenTopology,
  lastEvent,
  providerData,
  resources,
  statusData,
  summary,
  typeData,
}: {
  alerts: AlertRecord[];
  channels: NotificationChannel[];
  lastEvent: string;
  onSummaryMetricClick?: (target: SummaryMetricTarget) => void;
  onOpenTopology?: () => void;
  openAlerts: AlertRecord[];
  providerData: ChartDatum[];
  resources: Resource[];
  statusData: ChartDatum[];
  summary: MonitoringSummary;
  typeData: ChartDatum[];
}) {
  return (
    <>
      {/* KPI metric cards */}
      <SummaryCards
        alerts={alerts}
        onMetricClick={onSummaryMetricClick}
        resources={resources}
        summary={summary}
      />

      {/* AI insights + chart side by side */}
      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <AIInsights alerts={openAlerts} resources={resources} summary={summary} />
        <ChartCard title="Resource Status" data={statusData} type="pie" />
      </section>

      {/* Charts row */}
      <section className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <ChartCard title="Provider Distribution" data={providerData} type="pie" />
        <ChartCard title="Resource Types" data={typeData} type="bar" />
      </section>

      {/* Topology */}
      <TopologyPlaceholder alerts={alerts} onOpenTopology={onOpenTopology} resources={resources} />

      {/* Alert routing + live alert stream */}
      <AlertRouting channels={channels} />
      <RecentActivity alerts={alerts} lastEvent={lastEvent} resources={resources} />
      <AlertStream alerts={openAlerts.slice(0, 6)} title="Live Alert Stream" />
    </>
  );
}

import { AIInsights } from "@/components/dashboard/ai-insights";
import { AlertStream } from "@/components/dashboard/alert-stream";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { SummaryCards, type SummaryMetricTarget } from "@/components/dashboard/summary-cards";
import { ChartCard } from "@/charts/chart-card";
import type {
  AlertRecord,
  ChartDatum,
  MonitoringSummary,
  Resource,
} from "@/types/infrasight";

/**
 * Main operations dashboard for the active workspace.
 *
 * Inputs:
 * - summary metrics, resources and alerts
 *
 * Output:
 * - operational metric cards, AI summary, resource status, active alerts and
 *   recent activity for answering: "Is my platform healthy right now?"
 */
export function DashboardOverview({
  alerts,
  openAlerts,
  onSummaryMetricClick,
  lastEvent,
  resources,
  statusData,
  summary,
}: {
  alerts: AlertRecord[];
  lastEvent: string;
  onSummaryMetricClick?: (target: SummaryMetricTarget) => void;
  openAlerts: AlertRecord[];
  resources: Resource[];
  statusData: ChartDatum[];
  summary: MonitoringSummary;
}) {
  return (
    <>
      <SummaryCards
        alerts={alerts}
        onMetricClick={onSummaryMetricClick}
        resources={resources}
        summary={summary}
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <AIInsights alerts={openAlerts} resources={resources} summary={summary} />
        <ChartCard title="Resource Status" data={statusData} type="pie" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <AlertStream alerts={openAlerts.slice(0, 6)} title="Active Alerts" />
        <RecentActivity alerts={alerts} lastEvent={lastEvent} resources={resources} />
      </section>
    </>
  );
}

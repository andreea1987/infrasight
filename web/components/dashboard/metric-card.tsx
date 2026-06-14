import type { ComponentType, SVGProps } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

export function MetricCard({
  helper,
  icon: Icon,
  label,
  onClick,
  tone,
  tooltipItems,
  tooltipTitle,
  trend,
  value,
}: {
  helper: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick?: () => void;
  tone?: "danger" | "warning" | "success";
  tooltipItems?: string[];
  tooltipTitle?: string;
  trend?: number;
  value: number | string;
}) {
  const toneClasses: Record<string, string> = {
    danger: "text-destructive",
    warning: "text-warning",
    success: "text-primary",
  };
  const toneClass = tone ? (toneClasses[tone] ?? "") : "";

  const iconBgClasses: Record<string, string> = {
    danger: "border-destructive/20 bg-destructive/10 text-destructive",
    warning: "border-warning/20 bg-warning/10 text-warning",
    success: "border-primary/20 bg-primary/10 text-primary",
  };
  const iconBgClass = tone ? (iconBgClasses[tone] ?? "border-primary/20 bg-primary/10 text-primary") : "border-primary/20 bg-primary/10 text-primary";

  const positiveClass = trend !== undefined && trend > 0 ? "text-primary" : "text-destructive";
  const TrendIcon = trend !== undefined && trend >= 0 ? TrendingUp : TrendingDown;
  const interactive = Boolean(onClick);
  const Shell = interactive ? "button" : "div";
  const previewItems = tooltipItems?.filter(Boolean).slice(0, 6) ?? [];
  const showTooltip = tooltipItems !== undefined;

  return (
    <Shell
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "console-line group relative w-full overflow-hidden rounded-xl border border-border bg-card p-5 text-left shadow-console transition-all",
        "hover:border-primary/25 hover:shadow-glow-primary",
        interactive && "cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50",
      )}
    >
      {/* Icon + trend row */}
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex size-9 items-center justify-center rounded-lg border", iconBgClass)}>
          <Icon className="size-6" />
        </div>
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 text-xs font-semibold", positiveClass)}>
            <TrendIcon className="size-3.5" />
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>

      {/* Value */}
      <div className={cn("mt-4 text-3xl font-bold tracking-tight", toneClass)}>
        {value}
      </div>

      {/* Label */}
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>

      {/* Helper */}
      <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
        {helper}
      </p>

      {/* Hover preview: cards stay layout-compatible while surfacing the records the click will filter to. */}
      {showTooltip && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 translate-y-2 rounded-md border border-border bg-background/95 p-3 opacity-0 shadow-console backdrop-blur transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {tooltipTitle ?? label}
          </p>
          <div className="mt-2 grid gap-1">
            {previewItems.length ? (
              previewItems.map((item) => (
                <p className="truncate text-xs text-foreground" key={item}>
                  {item}
                </p>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No matching records</p>
            )}
          </div>
          {(tooltipItems?.length ?? 0) > previewItems.length && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              +{(tooltipItems?.length ?? 0) - previewItems.length} more
            </p>
          )}
        </div>
      )}

      {/* Subtle gradient overlay on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </Shell>
  );
}

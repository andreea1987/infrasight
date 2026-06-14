import type { ChartDatum } from "@/types/infrasight";

export function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = String(item[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export function toChartData(counts: Record<string, number>): ChartDatum[] {
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

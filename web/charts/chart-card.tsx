"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TechnologyIcon } from "@/dashboard/resourceIcons";
import type { ChartDatum } from "@/types/infrasight";

const CHART_COLORS = [
  "hsl(263 72% 66%)",
  "hsl(196 90% 55%)",
  "hsl(38 88% 60%)",
  "hsl(4 78% 65%)",
  "hsl(320 65% 65%)",
  "hsl(263 55% 45%)",
];

export function ChartCard({
  data,
  title,
  type,
}: {
  data: ChartDatum[];
  title: string;
  type: "bar" | "pie" | "area";
}) {
  return (
    <Card className="console-line min-h-[300px]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          {type === "pie" ? (
            <PieChart>
              <defs>
                {CHART_COLORS.map((color, i) => (
                  <radialGradient key={i} id={`pie-gradient-${i}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                  </radialGradient>
                ))}
              </defs>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={52}
                outerRadius={88}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={`url(#pie-gradient-${index % CHART_COLORS.length})`}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={1}
                    strokeOpacity={0.3}
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          ) : type === "area" ? (
            <AreaChart data={data}>
              <defs>
                <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(263 72% 66%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(263 72% 66%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="name"
                stroke="hsl(215 16% 40%)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(215 16% 40%)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(263 72% 66%)"
                strokeWidth={2}
                fill="url(#area-gradient)"
              />
            </AreaChart>
          ) : (
            <BarChart data={data} barCategoryGap="32%">
              <defs>
                <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(263 72% 66%)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="hsl(263 72% 66%)" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="name"
                stroke="hsl(215 16% 40%)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(215 16% 40%)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="value"
                fill="url(#bar-gradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.slice(0, 8).map((item) => (
            <span
              key={item.name}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground"
            >
              <TechnologyIcon name={item.name} surface="tooltip" />
              {item.name}
              <span className="font-semibold text-foreground">{item.value}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; payload?: ChartDatum }>;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-console">
      <div className="flex items-center gap-2">
        <TechnologyIcon name={item.name} surface="tooltip" />
        <span className="font-semibold text-foreground">{item.name}</span>
      </div>
      <p className="mt-1 text-muted-foreground">Count: {payload?.[0]?.value ?? item.value}</p>
    </div>
  );
}

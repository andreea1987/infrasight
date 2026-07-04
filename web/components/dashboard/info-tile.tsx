import * as React from "react";

import { cn } from "@/lib/utils";

export function InfoTile({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border border-border bg-background/60 p-3", className)}
    >
      {children}
    </div>
  );
}

export function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <InfoTile>
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </InfoTile>
  );
}

import * as React from "react";

import { cn } from "@/lib/utils";

type DashboardColumnConfig = {
  ariaLabel?: string;
  className?: string;
  label?: React.ReactNode;
};

type DashboardColumn = React.ReactNode | DashboardColumnConfig;

export function DashboardTable({
  children,
  className,
  minWidth = "1120px",
}: {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-left text-sm", className)}
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

export function DashboardTableHeader({ columns }: { columns: DashboardColumn[] }) {
  return (
    <thead>
      <tr className="border-b border-border text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {columns.map((column, index) => {
          const config = isDashboardColumnConfig(column)
            ? column
            : { label: column as React.ReactNode };

          return (
            <th
              aria-label={config.ariaLabel}
              className={cn("px-3 py-3", config.className)}
              key={`${config.ariaLabel ?? config.label ?? "column"}-${index}`}
            >
              {config.label}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function isDashboardColumnConfig(column: DashboardColumn): column is DashboardColumnConfig {
  return (
    typeof column === "object" &&
    column !== null &&
    !React.isValidElement(column) &&
    ("label" in column || "ariaLabel" in column || "className" in column)
  );
}

export function DashboardTableRow({
  children,
  className,
  onClick,
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border/70 transition-colors",
        onClick && "cursor-pointer hover:bg-muted/30",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function DashboardTableCell({
  align,
  children,
  className,
  muted,
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right";
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3",
        align === "right" && "text-right",
        muted && "text-muted-foreground",
        className,
      )}
    >
      {children}
    </td>
  );
}

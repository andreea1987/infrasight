import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary",
        className,
      )}
      {...props}
    />
  );
}

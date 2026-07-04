import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center justify-center gap-1.5 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-bold uppercase leading-none text-muted-foreground [&>svg]:size-3 [&>svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

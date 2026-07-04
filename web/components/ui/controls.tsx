import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";

export function ControlToolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 [&>select]:w-auto", className)}
      {...props}
    />
  );
}

export function FilterGrid({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-6", className)}
      {...props}
    />
  );
}

export function SearchField({ className, ...props }: InputProps) {
  return (
    <div className={cn("relative min-w-[12rem]", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" {...props} />
    </div>
  );
}

export function FilterChip({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold uppercase leading-none outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-3.5 [&>svg]:shrink-0",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground active:bg-muted/60",
        className,
      )}
      type="button"
      {...props}
    />
  );
}

export function ToggleSwitch({
  checked,
  className,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "role"> & {
  checked: boolean;
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border border-transparent p-0.5 outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:pointer-events-none disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted",
        className,
      )}
      role="switch"
      type="button"
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function ActiveFilterBanner({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}

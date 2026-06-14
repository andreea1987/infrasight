"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, X } from "lucide-react";

import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { cn } from "@/lib/utils";
import type { AlertRecord } from "@/types/infrasight";

export function NotificationCenter({ alerts }: { alerts: AlertRecord[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = alerts.length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground border-primary/30",
        )}
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white shadow-glow-destructive">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-console"
          >
            <div className="console-line flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Notifications</h3>
                <p className="text-xs text-muted-foreground">
                  {count > 0 ? `${count} active alert${count > 1 ? "s" : ""}` : "All clear"}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <CheckCircle2 className="size-8 text-primary/60" />
                  <p className="text-sm text-muted-foreground">No active alerts</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {alerts.slice(0, 8).map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                    >
                      <SeverityBadge severity={alert.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{alert.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {alert.source}
                          {alert.metric_name ? ` · ${alert.metric_name}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                  {alerts.length > 8 && (
                    <div className="px-4 py-3 text-center text-xs text-muted-foreground">
                      +{alerts.length - 8} more alerts
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

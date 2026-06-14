import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SeverityBadge({ severity }: { severity: string }) {
  const normalizedSeverity = severity.toLowerCase();

  return (
    <Badge
      className={cn(
        ["running", "healthy", "available", "sent"].includes(normalizedSeverity) &&
          "border-primary/40 text-primary",
        ["critical", "failed", "terminated"].includes(normalizedSeverity) &&
          "border-destructive/40 text-destructive",
        ["warning", "stopped", "skipped"].includes(normalizedSeverity) &&
          "border-[#f2b84b]/40 text-[#f2b84b]",
      )}
    >
      {severity}
    </Badge>
  );
}

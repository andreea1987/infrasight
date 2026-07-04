import { CheckCircle2, Server, XCircle } from "lucide-react";

import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { Badge } from "@/components/ui/badge";
import {
  providerLabel,
  resourcePlatform,
  resourceProvider,
  resourceType,
} from "@/dashboard/resourceClassification";
import { TechnologyIcon } from "@/dashboard/resourceIcons";
import { cn } from "@/lib/utils";
import type { Resource } from "@/types/infrasight";

export function IconText({
  className,
  iconName,
  label,
}: {
  className?: string;
  iconName: string;
  label: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <TechnologyIcon name={iconName} surface="table" />
      {label}
    </span>
  );
}

export function ResourceName({ resource }: { resource: Resource }) {
  return (
    <IconText
      iconName={resourcePlatform(resource) || resourceType(resource)}
      label={resource.name}
    />
  );
}

export function ProviderBadge({
  label,
  provider,
  resource,
}: {
  label?: string;
  provider?: string;
  resource?: Resource;
}) {
  const providerName = provider ?? (resource ? resourceProvider(resource) : "unknown");
  const displayLabel = label ?? (resource ? providerLabel(resource) : providerName);

  return (
    <Badge className="normal-case">
      <TechnologyIcon name={providerName} surface="table" />
      {displayLabel}
    </Badge>
  );
}

export function HealthBadge({ health }: { health: string }) {
  return <SeverityBadge severity={health || "Unknown"} />;
}

export function StatusBadge({
  status,
  label,
}: {
  label?: string;
  status: string | null | undefined;
}) {
  const normalized = String(status ?? "unknown").toLowerCase();
  const text = label ?? titleCase(String(status ?? "Not Configured"));

  if (["connected", "active", "enabled", "healthy", "success", "sent"].includes(normalized)) {
    return (
      <Badge className="border-primary/30 text-primary normal-case">
        <CheckCircle2 className="size-3" />
        {text}
      </Badge>
    );
  }

  if (["failed", "error", "critical"].includes(normalized)) {
    return (
      <Badge className="border-destructive/30 text-destructive normal-case">
        <XCircle className="size-3" />
        {text}
      </Badge>
    );
  }

  return (
    <Badge className="normal-case">
      <Server className="size-3" />
      {text}
    </Badge>
  );
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

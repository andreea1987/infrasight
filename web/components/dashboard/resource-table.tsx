import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { Button } from "@/components/ui/button";
import { TechnologyIcon } from "@/dashboard/resourceIcons";
import type { Resource, ResourceMetadataValue } from "@/types/infrasight";

export function ResourceTable({
  onSelectResource,
  resources,
}: {
  onSelectResource?: (resource: Resource) => void;
  resources: Resource[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <th className="px-3 py-3">Name</th>
            <th className="px-3 py-3">Provider</th>
            <th className="px-3 py-3">Type</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Health</th>
            <th className="px-3 py-3">Score</th>
            <th className="px-3 py-3">Region</th>
            <th className="px-3 py-3">Private IP</th>
            <th className="px-3 py-3">CPU</th>
            <th className="px-3 py-3">Memory</th>
            <th className="px-3 py-3" aria-label="Resource actions" />
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr className="border-b border-border/70" key={resource.id}>
              <td className="px-3 py-3 font-medium">
                <span className="flex items-center gap-2">
                  <TechnologyIcon name={resource.resource_type || resource.provider} surface="table" />
                  {resource.name}
                </span>
              </td>
              <td className="px-3 py-3">
                <Badge className="inline-flex items-center gap-1.5">
                  <TechnologyIcon name={resource.provider} surface="table" />
                  {resource.provider}
                </Badge>
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                <span className="flex items-center gap-2">
                  <TechnologyIcon name={resource.resource_type} surface="table" />
                  {resource.resource_type}
                </span>
              </td>
              <td className="px-3 py-3">
                <SeverityBadge severity={resource.status} />
              </td>
              <td className="px-3 py-3">
                <SeverityBadge severity={resource.health_status ?? "Unknown"} />
              </td>
              <td className="px-3 py-3 font-medium">
                {resource.health_score ?? "n/a"}
              </td>
              <td className="px-3 py-3 text-muted-foreground">{resource.region}</td>
              <td className="px-3 py-3 text-muted-foreground">
                {resource.private_ip ?? "n/a"}
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {formatMetadataValue(resource.metadata?.cpu_count ?? resource.metadata?.cpu_percent)}
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {formatMetadataValue(resource.metadata?.memory_gb, " GB")}
              </td>
              <td className="px-3 py-3 text-right">
                {onSelectResource && (
                  <Button size="sm" variant="secondary" onClick={() => onSelectResource(resource)}>
                    Details
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMetadataValue(value: ResourceMetadataValue | undefined, suffix = "") {
  if (value === undefined || value === null || value === "") return "n/a";
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join(", ") : "n/a";
  if (typeof value === "object") return JSON.stringify(value);
  return `${value}${suffix}`;
}

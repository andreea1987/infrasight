import { SeverityBadge } from "@/components/dashboard/severity-badge";
import {
  DashboardTable,
  DashboardTableCell,
  DashboardTableHeader,
  DashboardTableRow,
} from "@/components/dashboard/dashboard-table";
import { IconText, ProviderBadge, ResourceName } from "@/components/dashboard/resource-badges";
import { Button } from "@/components/ui/button";
import {
  platformLabel,
  resourceType,
  resourceTypeLabel,
  resourcePlatform,
} from "@/dashboard/resourceClassification";
import type { Resource, ResourceMetadataValue } from "@/types/infrasight";

export function ResourceTable({
  onSelectResource,
  resources,
}: {
  onSelectResource?: (resource: Resource) => void;
  resources: Resource[];
}) {
  return (
    <DashboardTable minWidth="1120px">
        <DashboardTableHeader columns={[
          "Name",
          "Provider",
          "Resource Type",
          "Platform",
          "Status",
          "Health",
          "Score",
          "Region",
          "Private IP",
          "CPU",
          "Memory",
          { ariaLabel: "Resource actions" },
        ]} />
        <tbody>
          {resources.map((resource) => (
            <DashboardTableRow key={resource.id}>
              <DashboardTableCell className="font-medium">
                <ResourceName resource={resource} />
              </DashboardTableCell>
              <DashboardTableCell>
                <ProviderBadge resource={resource} />
              </DashboardTableCell>
              <DashboardTableCell muted>
                <IconText iconName={resourceType(resource)} label={resourceTypeLabel(resource)} />
              </DashboardTableCell>
              <DashboardTableCell muted>
                <IconText iconName={resourcePlatform(resource)} label={platformLabel(resource)} />
              </DashboardTableCell>
              <DashboardTableCell>
                <SeverityBadge severity={resource.status} />
              </DashboardTableCell>
              <DashboardTableCell>
                <SeverityBadge severity={resource.health_status ?? "Unknown"} />
              </DashboardTableCell>
              <DashboardTableCell className="font-medium">
                {resource.health_score ?? "n/a"}
              </DashboardTableCell>
              <DashboardTableCell muted>{resource.region}</DashboardTableCell>
              <DashboardTableCell muted>
                {resource.private_ip ?? "n/a"}
              </DashboardTableCell>
              <DashboardTableCell muted>
                {formatMetadataValue(resource.metadata?.cpu_count ?? resource.metadata?.cpu_percent)}
              </DashboardTableCell>
              <DashboardTableCell muted>
                {formatMetadataValue(resource.metadata?.memory_gb, " GB")}
              </DashboardTableCell>
              <DashboardTableCell align="right">
                {onSelectResource && (
                  <Button size="sm" variant="secondary" onClick={() => onSelectResource(resource)}>
                    Details
                  </Button>
                )}
              </DashboardTableCell>
            </DashboardTableRow>
          ))}
        </tbody>
    </DashboardTable>
  );
}

function formatMetadataValue(value: ResourceMetadataValue | undefined, suffix = "") {
  if (value === undefined || value === null || value === "") return "n/a";
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join(", ") : "n/a";
  if (typeof value === "object") return JSON.stringify(value);
  return `${value}${suffix}`;
}

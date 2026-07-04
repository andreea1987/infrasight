import type { AlertRecord, Organization, Resource, Workspace, WorkspaceGroup } from "@/types/infrasight";

const DEFAULT_WORKSPACE_ID = "internal";
const DEFAULT_ORGANIZATION_NAME = "Internal Operations";
const WORKSPACE_ENVIRONMENTS = [
  { key: "production", name: "Production", suffix: "" },
  { key: "uat", name: "UAT", suffix: "uat" },
  { key: "development", name: "Development", suffix: "development" },
];

/**
 * Builds the frontend workspace context from backend organizations plus the
 * currently scoped resource and alert snapshot.
 *
 * Why it exists:
 * - The backend already scopes API reads by tenant/workspace headers.
 * - Some deployments do not yet expose a dedicated workspace API.
 * - This layer gives every page a stable Workspace object today.
 *
 * Returns:
 * - activeWorkspace: selector target and summary metrics
 * - workspaces: selectable workspace list
 */
export function buildWorkspaceContext({
  activeWorkspaceId,
  alerts,
  organizations,
  resources,
}: {
  activeWorkspaceId: string;
  alerts: AlertRecord[];
  organizations: Organization[];
  resources: Resource[];
}) {
  const sourceOrganizations = organizations.length
    ? organizations
    : [
        {
          id: 0,
          tenant_id: organizationIdFromWorkspace(activeWorkspaceId),
          name: DEFAULT_ORGANIZATION_NAME,
          status: "active",
          created_at: "",
        },
      ];

  const groups: WorkspaceGroup[] = sourceOrganizations.map((organization) => {
    const organizationId = organization.tenant_id || DEFAULT_WORKSPACE_ID;
    return {
      organization_id: organizationId,
      organization_name: organization.name,
      workspaces: WORKSPACE_ENVIRONMENTS.map((environment) =>
        buildWorkspaceOption(organization, organizationId, environment.name, environment.suffix),
      ),
    };
  });
  const sourceWorkspaces = groups.flatMap((group) => group.workspaces);

  const workspaces = sourceWorkspaces.map((workspace): Workspace => {
    const resourceMatches = resources.filter((resource) => resourceWorkspaceId(resource) === workspace.id);
    const alertMatches = alerts.filter((alert) => alertWorkspaceId(alert) === workspace.id);
    const isPrimaryWorkspace = workspace.id === workspace.organization_id;
    const scopedResources = resourceMatches.length || !isPrimaryWorkspace ? resourceMatches : resources;
    const scopedAlerts = alertMatches.length || !isPrimaryWorkspace ? alertMatches : alerts;

    return {
      ...workspace,
      resource_count: scopedResources.length,
      alert_count: scopedAlerts.filter((alert) => alert.status === "open").length,
      health_score: calculateWorkspaceHealth(scopedResources, scopedAlerts),
    };
  });

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces.find((workspace) => workspace.organization_id === organizationIdFromWorkspace(activeWorkspaceId)) ??
    workspaces[0] ??
    {
      id: DEFAULT_WORKSPACE_ID,
      organization_id: DEFAULT_WORKSPACE_ID,
      organization_name: DEFAULT_ORGANIZATION_NAME,
      name: "Production",
      environment: "Production",
      status: "active",
      resource_count: resources.length,
      alert_count: alerts.filter((alert) => alert.status === "open").length,
      health_score: calculateWorkspaceHealth(resources, alerts),
    };

  return { activeWorkspace, groups, workspaces };
}

/**
 * Calculates a workspace-level health score from resource scores and open alerts.
 * Critical alerts have a larger penalty than warnings because they represent
 * current operational risk across the workspace.
 */
export function calculateWorkspaceHealth(resources: Resource[], alerts: AlertRecord[]) {
  if (!resources.length) return 100;

  const resourceScore =
    resources.reduce((total, resource) => total + (resource.health_score ?? 100), 0) / resources.length;
  const openCriticals = alerts.filter((alert) => alert.status === "open" && alert.severity === "critical").length;
  const openWarnings = alerts.filter((alert) => alert.status === "open" && alert.severity === "warning").length;

  return Math.max(0, Math.round(resourceScore - openCriticals * 8 - openWarnings * 3));
}

function resourceWorkspaceId(resource: Resource) {
  return resource.tenant_id ?? resource.organization_id ?? DEFAULT_WORKSPACE_ID;
}

function alertWorkspaceId(alert: AlertRecord) {
  return alert.tenant_id ?? alert.organization_id ?? DEFAULT_WORKSPACE_ID;
}

function buildWorkspaceOption(
  organization: Organization,
  organizationId: string,
  environmentName: string,
  suffix: string,
) {
  const workspaceId = suffix ? `${organizationId}:${suffix}` : organizationId;
  return {
    id: workspaceId,
    organization_id: organizationId,
    organization_name: organization.name,
    name: environmentName,
    environment: environmentName,
    status: organization.status,
    resource_count: 0,
    alert_count: 0,
    health_score: 100,
  };
}

export function organizationIdFromWorkspace(workspaceId: string) {
  return (workspaceId || DEFAULT_WORKSPACE_ID).split(":")[0] || DEFAULT_WORKSPACE_ID;
}

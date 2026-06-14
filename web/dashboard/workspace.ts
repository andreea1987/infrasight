import type { AlertRecord, Organization, Resource } from "@/types/infrasight";

const DEFAULT_WORKSPACE_ID = "internal";

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
  const sourceWorkspaces = organizations.length
    ? organizations.map((organization) => ({
        id: organization.tenant_id,
        name: organization.name,
        status: organization.status,
      }))
    : [
        {
          id: activeWorkspaceId || DEFAULT_WORKSPACE_ID,
          name: "Current workspace",
          status: "active",
        },
      ];

  const workspaces = sourceWorkspaces.map((workspace) => {
    const resourceMatches = resources.filter((resource) => resourceWorkspaceId(resource) === workspace.id);
    const alertMatches = alerts.filter((alert) => alertWorkspaceId(alert) === workspace.id);
    const scopedResources = resourceMatches.length || sourceWorkspaces.length > 1 ? resourceMatches : resources;
    const scopedAlerts = alertMatches.length || sourceWorkspaces.length > 1 ? alertMatches : alerts;

    return {
      ...workspace,
      resource_count: scopedResources.length,
      alert_count: scopedAlerts.filter((alert) => alert.status === "open").length,
      health_score: calculateWorkspaceHealth(scopedResources, scopedAlerts),
    };
  });

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0] ??
    {
      id: DEFAULT_WORKSPACE_ID,
      name: "Current workspace",
      status: "active",
      resource_count: resources.length,
      alert_count: alerts.filter((alert) => alert.status === "open").length,
      health_score: calculateWorkspaceHealth(resources, alerts),
    };

  return { activeWorkspace, workspaces };
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

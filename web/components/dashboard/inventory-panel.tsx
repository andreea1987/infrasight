import { EmptyState } from "@/components/dashboard/empty-state";
import { ResourceTable } from "@/components/dashboard/resource-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveFilterBanner, ControlToolbar, SearchField } from "@/components/ui/controls";
import { Select } from "@/components/ui/select";
import {
  HEALTH_OPTIONS,
  PLATFORM_OPTIONS,
  PROVIDER_OPTIONS,
  RESOURCE_TYPE_OPTIONS,
  STATUS_OPTIONS,
  labelFor,
  providerConfig,
} from "@/dashboard/resourceClassification";
import type { Resource } from "@/types/infrasight";

export function InventoryPanel({
  activeFilterLabel,
  clearActiveFilter,
  client,
  clients,
  health,
  healthStates,
  platform,
  platforms,
  provider,
  providerActionBusy,
  providerCounts = {},
  providers,
  onProviderAction,
  onSelectResource,
  query,
  resources,
  resourceType,
  resourceTypes,
  setClient,
  setHealth,
  setPlatform,
  setProvider,
  setQuery,
  setResourceType,
  setStatus,
  status,
  statuses,
}: {
  activeFilterLabel?: string | null;
  clearActiveFilter?: () => void;
  client: string;
  clients: string[];
  health: string;
  healthStates: string[];
  platform: string;
  platforms: string[];
  provider: string;
  providerActionBusy?: boolean;
  providerCounts?: Record<string, number>;
  providers: string[];
  onProviderAction?: (provider: string) => void;
  onSelectResource: (resource: Resource) => void;
  query: string;
  resources: Resource[];
  resourceType: string;
  resourceTypes: string[];
  setClient: (value: string) => void;
  setHealth: (value: string) => void;
  setPlatform: (value: string) => void;
  setProvider: (value: string) => void;
  setQuery: (value: string) => void;
  setResourceType: (value: string) => void;
  setStatus: (value: string) => void;
  status: string;
  statuses: string[];
}) {
  const selectedProvider = providerConfig(provider);
  const selectedProviderHasResources = provider === "all" || (providerCounts[provider] ?? 0) > 0;
  const providerEmptyState = provider !== "all" && !selectedProviderHasResources && selectedProvider;
  const providerActionDisabled = providerActionBusy || selectedProvider?.comingSoon || !selectedProvider?.actionPath;

  return (
    <Card className="console-line">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>Normalized Inventory</CardTitle>
        <ControlToolbar>
          <SearchField
            className="w-full sm:w-56"
            placeholder="Search resources"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {providers.map((item) => (
              <option key={item} value={item}>
                {providerFilterLabel(item, providerCounts)}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All statuses" : labelFor(item, STATUS_OPTIONS)}
              </option>
            ))}
          </Select>
          <Select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
            {resourceTypes.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All resource types" : labelFor(item, RESOURCE_TYPE_OPTIONS)}
              </option>
            ))}
          </Select>
          <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            {platforms.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All platforms" : labelFor(item, PLATFORM_OPTIONS)}
              </option>
            ))}
          </Select>
          <Select value={health} onChange={(event) => setHealth(event.target.value)}>
            {healthStates.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All health" : labelFor(item, HEALTH_OPTIONS)}
              </option>
            ))}
          </Select>
          <Select value={client} onChange={(event) => setClient(event.target.value)}>
            {clients.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All clients" : item}
              </option>
            ))}
          </Select>
        </ControlToolbar>
      </CardHeader>
      <CardContent>
        {activeFilterLabel && (
          <ActiveFilterBanner className="mb-4">
            <span>Active filter: {activeFilterLabel}</span>
            <Button
              onClick={clearActiveFilter}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          </ActiveFilterBanner>
        )}
        {resources.length ? (
          <ResourceTable onSelectResource={onSelectResource} resources={resources} />
        ) : (
          <div className="space-y-3">
            <EmptyState text={providerEmptyState ? providerEmptyState.emptyState : "No resources match the current filters."} />
            {providerEmptyState && (
              <Button
                disabled={providerActionDisabled}
                onClick={() => onProviderAction?.(provider)}
                type="button"
              >
                {providerEmptyState.actionLabel}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function providerFilterLabel(item: string, providerCounts: Record<string, number>) {
  if (item === "all") return "All providers";
  const provider = providerConfig(item);
  const label = provider?.label ?? labelFor(item, PROVIDER_OPTIONS);
  if (provider?.comingSoon) return `${label} (Coming Soon)`;
  return `${label} (${providerCounts[item] ?? 0})`;
}

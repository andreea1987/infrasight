import { Search } from "lucide-react";

import { ResourceTable } from "@/components/dashboard/resource-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Resource } from "@/types/infrasight";

export function InventoryPanel({
  activeFilterLabel,
  clearActiveFilter,
  client,
  clients,
  health,
  healthStates,
  provider,
  providers,
  onSelectResource,
  query,
  resources,
  resourceType,
  resourceTypes,
  setClient,
  setHealth,
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
  provider: string;
  providers: string[];
  onSelectResource: (resource: Resource) => void;
  query: string;
  resources: Resource[];
  resourceType: string;
  resourceTypes: string[];
  setClient: (value: string) => void;
  setHealth: (value: string) => void;
  setProvider: (value: string) => void;
  setQuery: (value: string) => void;
  setResourceType: (value: string) => void;
  setStatus: (value: string) => void;
  status: string;
  statuses: string[];
}) {
  return (
    <Card className="console-line">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>Normalized Inventory</CardTitle>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search resources"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {providers.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All providers" : item}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All statuses" : item}
              </option>
            ))}
          </Select>
          <Select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
            {resourceTypes.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All types" : item}
              </option>
            ))}
          </Select>
          <Select value={health} onChange={(event) => setHealth(event.target.value)}>
            {healthStates.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All health" : item}
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
        </div>
      </CardHeader>
      <CardContent>
        {activeFilterLabel && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">
            <span>Active filter: {activeFilterLabel}</span>
            <button
              className="rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
              onClick={clearActiveFilter}
              type="button"
            >
              Clear
            </button>
          </div>
        )}
        <ResourceTable onSelectResource={onSelectResource} resources={resources} />
      </CardContent>
    </Card>
  );
}

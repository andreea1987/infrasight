import type { Resource, ResourceMetadataValue } from "@/types/infrasight";

type Option = { value: string; label: string };

export type SupportedProvider = Option & {
  actionLabel: string;
  actionPath?: string;
  comingSoon?: boolean;
  emptyState: string;
};

export const PROVIDER_OPTIONS: readonly SupportedProvider[] = [
  {
    value: "azure",
    label: "Azure",
    emptyState: "No Azure resources have been discovered.",
    actionLabel: "Run Azure Discovery",
    actionPath: "/sync/azure/vms",
  },
  {
    value: "aws",
    label: "AWS",
    emptyState: "No AWS resources have been discovered.",
    actionLabel: "Run AWS Discovery",
    actionPath: "/sync/ec2",
  },
  {
    value: "on_prem",
    label: "On-Prem",
    emptyState: "No On-Prem resources have been discovered.",
    actionLabel: "Run On-Prem Discovery",
    actionPath: "/sync/onprem/local",
  },
  {
    value: "vmware",
    label: "VMware",
    emptyState: "No VMware resources have been discovered.",
    actionLabel: "Connect VMware",
  },
  {
    value: "google_cloud",
    label: "Google Cloud",
    emptyState: "No Google Cloud resources have been discovered.",
    actionLabel: "Google Cloud Coming Soon",
    comingSoon: true,
  },
] as const;

export const RESOURCE_TYPE_OPTIONS = [
  { value: "server", label: "Server" },
  { value: "database", label: "Database" },
  { value: "container", label: "Container" },
  { value: "kubernetes_cluster", label: "Kubernetes Cluster" },
  { value: "virtual_machine", label: "Virtual Machine" },
  { value: "storage", label: "Storage" },
  { value: "network_device", label: "Network Device" },
] as const;

export const PLATFORM_OPTIONS = [
  { value: "linux", label: "Linux" },
  { value: "windows", label: "Windows" },
  { value: "kubernetes", label: "Kubernetes" },
  { value: "docker", label: "Docker" },
  { value: "vmware", label: "VMware" },
  { value: "serverless", label: "Serverless" },
] as const;

export const STATUS_OPTIONS = [
  { value: "running", label: "Running" },
  { value: "stopped", label: "Stopped" },
  { value: "starting", label: "Starting" },
  { value: "stopping", label: "Stopping" },
  { value: "maintenance", label: "Maintenance" },
  { value: "unknown", label: "Unknown" },
] as const;

export const HEALTH_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
  { value: "unknown", label: "Unknown" },
] as const;

export const OPERATING_SYSTEM_OPTIONS = [
  { value: "windows", label: "Windows" },
  { value: "linux", label: "Linux" },
  { value: "ubuntu", label: "Ubuntu" },
  { value: "red_hat", label: "Red Hat" },
  { value: "debian", label: "Debian" },
  { value: "suse", label: "SUSE" },
  { value: "amazon_linux", label: "Amazon Linux" },
] as const;

export function resourceProvider(resource: Resource) {
  const raw = normalize(resource.provider || metadataString(resource, ["provider", "cloud_provider"]));
  if (matches(raw, ["azure", "microsoft_azure"])) return "azure";
  if (matches(raw, ["aws", "amazon", "amazon_web_services", "ec2", "rds"])) return "aws";
  if (matches(raw, ["gcp", "google", "google_cloud", "google_cloud_platform"])) return "google_cloud";
  if (matches(raw, ["vmware", "vsphere", "vcenter", "esxi"])) return "vmware";
  if (matches(raw, ["onprem", "on_prem", "local", "agent", "linux", "windows", "docker", "kubernetes", "mssql", "sql_server", "postgres", "postgresql", "mysql", "mongodb", "mongo", "redis"])) return "on_prem";
  return raw || "on_prem";
}

export function resourceType(resource: Resource) {
  const raw = normalize(resource.resource_type);
  const platform = resourcePlatform(resource);

  if (matches(raw, ["container", "docker_container"]) || platform === "docker") return "container";
  if (raw.includes("kubernetes") || raw.includes("k8s") || matches(raw, ["cluster", "node", "pod", "deployment", "service", "namespace"])) {
    return "kubernetes_cluster";
  }
  if (raw.includes("database") || raw.includes("postgres") || raw.includes("mysql") || raw.includes("mongo") || raw.includes("redis") || raw.includes("sql") || raw === "db" || raw.includes("rds")) {
    return "database";
  }
  if (raw.includes("storage") || raw.includes("bucket") || raw.includes("disk") || raw.includes("volume") || raw.includes("blob") || raw.includes("s3")) {
    return "storage";
  }
  if (raw.includes("network") || raw.includes("router") || raw.includes("switch") || raw.includes("firewall") || raw.includes("load_balancer") || raw.includes("loadbalancer") || raw.includes("lb")) {
    return "network_device";
  }
  if (raw.includes("vm") || raw.includes("virtual_machine") || raw.includes("ec2") || raw.includes("instance")) {
    return "virtual_machine";
  }
  if (raw.includes("server") || raw.includes("host") || raw.includes("local_host")) {
    return "server";
  }
  return raw || "server";
}

export function resourcePlatform(resource: Resource) {
  const raw = normalize(
    resource.platform ||
      metadataString(resource, [
        "platform",
        "technology",
        "engine",
        "database_engine",
        "db_engine",
        "os",
        "operating_system",
        "image",
      ]) ||
      resource.resource_type,
  );

  if (raw.includes("windows")) return "windows";
  if (raw.includes("linux") || raw.includes("ubuntu") || raw.includes("debian") || raw.includes("rhel") || raw.includes("centos")) return "linux";
  if (raw.includes("docker") || raw.includes("container")) return "docker";
  if (raw.includes("kubernetes") || raw.includes("k8s") || raw.includes("pod") || raw.includes("deployment")) return "kubernetes";
  if (raw.includes("vmware") || raw.includes("vsphere") || raw.includes("vcenter") || raw.includes("esxi")) return "vmware";
  if (raw.includes("lambda") || raw.includes("function") || raw.includes("serverless")) return "serverless";
  if (raw.includes("sql_server") || raw.includes("sqlserver") || raw.includes("mssql")) return "sql_server";
  if (raw.includes("postgres")) return "postgresql";
  if (raw.includes("mysql")) return "mysql";
  if (raw.includes("mongo")) return "mongodb";
  if (raw.includes("redis")) return "redis";
  return raw || "unknown";
}

export function resourceStatus(resource: Resource) {
  const raw = normalize(resource.status);
  if (matches(raw, ["running", "healthy", "available", "active", "ok", "success", "connected", "discovered"])) return "running";
  if (matches(raw, ["stopped", "terminated", "deallocated", "inactive", "disabled", "offline"])) return "stopped";
  if (matches(raw, ["starting", "pending", "pending_agent", "provisioning", "creating", "initializing"])) return "starting";
  if (matches(raw, ["stopping", "shutting_down", "terminating", "deallocating"])) return "stopping";
  if (matches(raw, ["maintenance", "paused", "draining", "suspended"])) return "maintenance";
  return "unknown";
}

export function resourceHealth(resource: Resource) {
  const raw = normalize(resource.health_status || resource.status);
  if (matches(raw, ["healthy", "running", "available", "active", "ok", "success"])) return "healthy";
  if (matches(raw, ["warning", "warn", "degraded", "stopped", "skipped", "maintenance", "paused"])) return "warning";
  if (matches(raw, ["critical", "failed", "error", "unhealthy", "terminated", "down"])) return "critical";
  return "unknown";
}

export function resourceOperatingSystem(resource: Resource) {
  const raw = normalize(
    metadataString(resource, [
      "os",
      "operating_system",
      "os_type",
      "os_name",
      "platform",
      "system",
      "image",
    ]) ||
      resource.platform ||
      resource.resource_type,
  );

  if (raw.includes("windows")) return "windows";
  if (raw.includes("amazon_linux") || raw.includes("amzn")) return "amazon_linux";
  if (raw.includes("ubuntu")) return "ubuntu";
  if (raw.includes("red_hat") || raw.includes("rhel")) return "red_hat";
  if (raw.includes("debian")) return "debian";
  if (raw.includes("suse") || raw.includes("sles")) return "suse";
  if (raw.includes("linux") || raw.includes("centos") || raw.includes("fedora")) return "linux";
  return "unknown";
}

export function providerLabel(resource: Resource) {
  return labelFor(resourceProvider(resource), PROVIDER_OPTIONS);
}

export function resourceTypeLabel(resource: Resource) {
  return labelFor(resourceType(resource), RESOURCE_TYPE_OPTIONS);
}

export function platformLabel(resource: Resource) {
  return labelFor(resourcePlatform(resource), PLATFORM_OPTIONS);
}

export function statusLabel(resource: Resource) {
  return labelFor(resourceStatus(resource), STATUS_OPTIONS);
}

export function healthLabel(resource: Resource) {
  return labelFor(resourceHealth(resource), HEALTH_OPTIONS);
}

export function operatingSystemLabel(resource: Resource) {
  return labelFor(resourceOperatingSystem(resource), OPERATING_SYSTEM_OPTIONS);
}

export function labelFor(value: string, options: readonly Option[]) {
  return options.find((option) => option.value === value)?.label ?? titleCase(value);
}

export function providerConfig(value: string) {
  return PROVIDER_OPTIONS.find((option) => option.value === value);
}

export function supportedProviderValues() {
  return PROVIDER_OPTIONS.map((option) => option.value);
}

function metadataString(resource: Resource, keys: string[]) {
  for (const key of keys) {
    const value = resource.metadata?.[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
      const first = value.find((item: ResourceMetadataValue) => typeof item === "string" && item.trim());
      if (typeof first === "string") return first;
    }
  }
  return "";
}

function matches(value: string, candidates: string[]) {
  return candidates.includes(value);
}

function normalize(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

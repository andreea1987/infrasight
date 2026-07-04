import { createElement, type ComponentType, type SVGProps } from "react";
import {
  AlertTriangle,
  Archive,
  Boxes,
  Bot,
  Cloud,
  Container,
  Database,
  GitBranch,
  Layers,
  Network,
  Server,
  Settings,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type IconSurface = "sidebar" | "table" | "card" | "tooltip" | "topology";
export type RegistryIcon = ComponentType<SVGProps<SVGSVGElement>>;

const SURFACE_SIZE: Record<IconSurface, string> = {
  sidebar: "size-5",
  table: "size-4",
  card: "size-7",
  tooltip: "size-5",
  topology: "size-5",
};

/**
 * Central icon registry for providers, technologies and resource categories.
 *
 * Inputs:
 * - provider/resource/connector names from inventory, topology and connector APIs
 *
 * Outputs:
 * - consistent SVG icon component and sizing helper for each UI surface
 *
 * Important assumptions:
 * - Product logos are simplified SVG marks for in-app identification.
 * - Missing or future technologies fall back to Lucide resource-category icons.
 */
export const technologyIcons: Record<string, RegistryIcon> = {
  aws: AwsLogo,
  amazon: AwsLogo,
  ec2: AwsLogo,
  rds: AwsLogo,
  azure: AzureLogo,
  microsoft_azure: AzureLogo,
  google_cloud: Cloud,
  gcp: Cloud,
  vmware: Server,
  vsphere: Server,
  kubernetes: KubernetesLogo,
  k8s: KubernetesLogo,
  docker: DockerLogo,
  container: DockerLogo,
  postgres: PostgreSqlLogo,
  postgresql: PostgreSqlLogo,
  sql_server: SqlServerLogo,
  sqlserver: SqlServerLogo,
  mssql: SqlServerLogo,
  mysql: MySqlLogo,
  mongodb: MongoDbLogo,
  mongo: MongoDbLogo,
  linux: LinuxLogo,
  ubuntu: LinuxLogo,
  windows: WindowsLogo,
};

export const resourceIcons: Record<string, RegistryIcon> = {
  server: Server,
  virtual_machine: Server,
  host: Server,
  vm: Server,
  instance: Server,
  database: Database,
  db: Database,
  container: Container,
  cluster: Layers,
  kubernetes: KubernetesLogo,
  alert: AlertTriangle,
  automation: Workflow,
  inventory: Archive,
  storage: Archive,
  topology: GitBranch,
  connector: Zap,
  openclaw: Bot,
  cloud: Cloud,
  health: ShieldCheck,
  network: Network,
  network_device: Network,
  settings: Settings,
};

export const connectorIcons: Record<string, RegistryIcon> = {
  aws: AwsLogo,
  azure: AzureLogo,
  agent: Server,
  linux: LinuxLogo,
  windows: WindowsLogo,
  docker: DockerLogo,
  kubernetes: KubernetesLogo,
  postgres: PostgreSqlLogo,
  postgresql: PostgreSqlLogo,
  sqlserver: SqlServerLogo,
  mssql: SqlServerLogo,
};

export function TechnologyIcon({
  className,
  name,
  surface = "table",
}: {
  className?: string;
  name?: string | null;
  surface?: IconSurface;
}) {
  const Icon = resolveIcon(name);
  return createElement(Icon, {
    "aria-hidden": true,
    className: cn(SURFACE_SIZE[surface], "shrink-0", className),
  });
}

export function getProviderIcon(provider?: string | null) {
  return resolveIcon(provider);
}

export function getConnectorIcon(connectorType?: string | null) {
  return connectorIcons[normalize(connectorType)] ?? resolveIcon(connectorType);
}

export function getResourceIcon(resourceType?: string | null, provider?: string | null) {
  const providerIcon = technologyIcons[normalize(provider)];
  if (providerIcon) return providerIcon;
  return resolveIcon(resourceType);
}

export function getCategoryIcon(category?: string | null) {
  return resourceIcons[normalize(category)] ?? Boxes;
}

function resolveIcon(name?: string | null): RegistryIcon {
  const key = normalize(name);
  if (!key) return Boxes;

  if (technologyIcons[key]) return technologyIcons[key];
  if (resourceIcons[key]) return resourceIcons[key];

  if (key.includes("aws") || key.includes("ec2") || key.includes("rds")) return AwsLogo;
  if (key.includes("azure")) return AzureLogo;
  if (key.includes("kubernetes") || key.includes("k8s") || key.includes("pod") || key.includes("deployment")) return KubernetesLogo;
  if (key.includes("docker") || key.includes("container")) return DockerLogo;
  if (key.includes("postgres")) return PostgreSqlLogo;
  if (key.includes("sqlserver") || key.includes("mssql") || key.includes("sql_server")) return SqlServerLogo;
  if (key.includes("mysql")) return MySqlLogo;
  if (key.includes("mongo")) return MongoDbLogo;
  if (key.includes("linux") || key.includes("ubuntu")) return LinuxLogo;
  if (key.includes("windows")) return WindowsLogo;
  if (key.includes("database") || key.includes("db")) return Database;
  if (key.includes("server") || key.includes("host") || key.includes("vm") || key.includes("instance")) return Server;
  if (key.includes("cluster")) return Layers;
  if (key.includes("alert")) return AlertTriangle;
  return Boxes;
}

function normalize(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function AwsLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <rect x="2" y="6" width="28" height="20" rx="4" fill="#111827" stroke="#FF9900" strokeWidth="1.5" />
      <path d="M8 18.4c4.5 2.6 10.7 2.8 15.8.5" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" />
      <path d="M22.2 16.3l2.7 2.1-3.1 1.2" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <text x="7" y="15.6" fill="#fff" fontSize="7" fontWeight="700">AWS</text>
    </svg>
  );
}

function AzureLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path d="M14.3 3.5 5 23.8h8.5L26.8 28 19.4 8.6 14.3 3.5Z" fill="#0078D4" />
      <path d="M15.9 7.8 10.5 20h7.9l-2.5-12.2Z" fill="#50A8E8" />
      <path d="m18.4 20 8.4 8-13.3-4.2 4.9-3.8Z" fill="#005BA1" />
    </svg>
  );
}

function KubernetesLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path d="m16 2.8 11.4 6.6v13.2L16 29.2 4.6 22.6V9.4L16 2.8Z" fill="#326CE5" />
      <circle cx="16" cy="16" r="4.2" fill="#fff" />
      {Array.from({ length: 6 }).map((_, index) => {
        const angle = (Math.PI * 2 * index) / 6;
        return (
          <path
            key={index}
            d={`M16 16 L${16 + Math.cos(angle) * 8.8} ${16 + Math.sin(angle) * 8.8}`}
            stroke="#fff"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="16" cy="16" r="2.2" fill="#326CE5" />
    </svg>
  );
}

function DockerLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path d="M6 16h18.5c1.4 0 2.5-.4 3.5-1.4.3 3.6-2.2 8.4-8.1 8.4H10.7C7.2 23 5 20.8 5 17.7c0-.6.4-1.7 1-1.7Z" fill="#2496ED" />
      <path d="M8 11h3v3H8v-3Zm4 0h3v3h-3v-3Zm4 0h3v3h-3v-3Zm-4-4h3v3h-3V7Zm4 0h3v3h-3V7Zm4 4h3v3h-3v-3Z" fill="#9BD7F5" />
      <circle cx="9" cy="19" r="1" fill="#0B3B5A" />
    </svg>
  );
}

function PostgreSqlLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path d="M9 23c-2.6-2.1-4-5.3-3.4-9.2C6.4 8 10.9 4.5 16.4 4.8c5.8.3 9.7 4.7 9.3 10.6-.3 4.5-3 7.4-7.1 8.2l-1.2 4-3.7-3.3c-1.6.2-3.2-.2-4.7-1.3Z" fill="#336791" />
      <path d="M13.7 13.8c0-1.4.9-2.4 2.3-2.4s2.3 1 2.3 2.4-.9 2.4-2.3 2.4-2.3-1-2.3-2.4Z" fill="#fff" />
      <path d="M18.2 17c2.5.5 4.1 1.6 5 3.2M13.8 17c-2.6.4-4.3 1.4-5 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SqlServerLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <ellipse cx="16" cy="8" rx="9.5" ry="4" fill="#E03A3E" />
      <path d="M6.5 8v12c0 2.2 4.3 4 9.5 4s9.5-1.8 9.5-4V8" fill="#B91C1C" />
      <path d="M6.5 14c0 2.2 4.3 4 9.5 4s9.5-1.8 9.5-4M6.5 20c0 2.2 4.3 4 9.5 4s9.5-1.8 9.5-4" stroke="#FCA5A5" strokeWidth="1.3" />
    </svg>
  );
}

function MySqlLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path d="M5 21c3.5-6.8 9.8-11.8 18.7-13.4 1.9-.3 3.7.9 3.9 2.8.2 1.4-.5 2.7-1.8 3.3-7.2 3.3-11.6 7.4-13.8 12.8-3.4-.3-5.7-2-7-5.5Z" fill="#00758F" />
      <path d="M19 10.8c2.7 1.8 4.5 4.4 5.3 7.6" stroke="#F29111" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="22.8" cy="10.7" r="1.3" fill="#F29111" />
    </svg>
  );
}

function MongoDbLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path d="M16.2 3.3c4.6 4.1 6.3 8.4 5.4 13.6-.7 4.3-2.9 7.4-5.4 11.8-2.7-4.2-5.5-7.5-5.7-12.6-.2-5 2.1-9.1 5.7-12.8Z" fill="#47A248" />
      <path d="M16.1 7.2c.3 5.6.2 12.1 0 19.5" stroke="#0B3D20" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function LinuxLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <ellipse cx="16" cy="17" rx="8.5" ry="10" fill="#111827" stroke="#FACC15" strokeWidth="1.5" />
      <circle cx="13.4" cy="12.5" r="1.1" fill="#fff" />
      <circle cx="18.6" cy="12.5" r="1.1" fill="#fff" />
      <path d="M13.5 18.5c1.4 1 3.6 1 5 0" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 24.5 5.8 28M23 24.5l3.2 3.5" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WindowsLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" {...props}>
      <path d="m4 7 10.5-1.5v9.8H4V7Zm12-1.7L28 3.6v11.7H16V5.3ZM4 16.8h10.5v9.8L4 25.1v-8.3Zm12 0h12v11.6l-12-1.7v-9.9Z" fill="#00A4EF" />
    </svg>
  );
}

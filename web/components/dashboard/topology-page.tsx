"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  GitBranch,
  Maximize2,
  RefreshCw,
  X,
  ZapOff,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ControlToolbar, FilterChip } from "@/components/ui/controls";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SeverityBadge } from "@/components/dashboard/severity-badge";
import { Select } from "@/components/ui/select";
import { fetchTopologyGraph } from "@/services/infrasight-api";
import { TechnologyIcon, getCategoryIcon } from "@/dashboard/resourceIcons";
import type { AlertRecord, Resource, TopologyEdge, TopologyGraph, TopologyNode } from "@/types/infrasight";

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 154;
const NODE_H = 62;
const EDGE_OFFSET = 58;
const ITERS = 180;
const CANVAS_H = 560;

// ── Type configs ─────────────────────────────────────────────────────────────

interface NodeTypeConfig {
  color: string;
  category: string;
  label: string;
}

function getNodeConfig(rt: string): NodeTypeConfig {
  const t = rt.toLowerCase().replace(/[-\s]/g, "_");

  if (t.includes("ec2") || t.includes("server") || t.includes("vm") || t.includes("host") || t.includes("instance"))
    return { color: "hsl(263 72% 66%)", category: "server", label: t.includes("ec2") ? "EC2 Instance" : "Server" };
  if (t.includes("rds") || t.includes("postgres") || t.includes("mysql") || t.includes("redis") || t.includes("mongo") || t.includes("database") || t === "db")
    return { color: "hsl(196 90% 55%)", category: "database", label: databaseLabel(t) };
  if (t.includes("container") || t.includes("docker"))
    return { color: "hsl(38 88% 60%)", category: "container", label: "Container" };
  if (t.includes("kubernetes") || t.includes("k8s") || t.includes("pod") || t.includes("deployment") || t.includes("ingress"))
    return { color: "hsl(217 80% 65%)", category: "kubernetes", label: kubernetesLabel(t) };
  if (t.includes("elb") || t.includes("alb") || t.includes("load_balancer") || t.includes("loadbalancer"))
    return { color: "hsl(160 70% 52%)", category: "cloud", label: "Load Balancer" };
  if (t.includes("s3") || t.includes("bucket"))
    return { color: "hsl(160 70% 52%)", category: "cloud", label: "Object Storage" };
  if (t.includes("lambda") || t.includes("function"))
    return { color: "hsl(160 70% 52%)", category: "cloud", label: "Function" };

  return { color: "hsl(225 14% 56%)", category: "other", label: titleCase(rt || "Resource") };
}

function databaseLabel(type: string) {
  if (type.includes("postgres")) return "PostgreSQL";
  if (type.includes("sqlserver") || type.includes("mssql") || type.includes("sql_server")) return "SQL Server";
  if (type.includes("mysql")) return "MySQL";
  if (type.includes("mongo")) return "MongoDB";
  if (type.includes("rds")) return "RDS Database";
  return "Database";
}

function kubernetesLabel(type: string) {
  if (type.includes("deployment") || type.includes("deploy")) return "Deployment";
  if (type.includes("service") || type.includes("svc")) return "Service";
  if (type.includes("pod")) return "Pod";
  if (type.includes("node")) return "Node";
  return "Kubernetes";
}

const CATEGORY_META: Record<string, { label: string; Icon: React.ElementType }> = {
  server:     { label: "Server",     Icon: getCategoryIcon("server") },
  database:   { label: "Database",   Icon: getCategoryIcon("database") },
  container:  { label: "Container",  Icon: getCategoryIcon("container") },
  kubernetes: { label: "Kubernetes", Icon: getCategoryIcon("kubernetes") },
  cloud:      { label: "Cloud",      Icon: getCategoryIcon("cloud") },
  other:      { label: "Other",      Icon: GitBranch },
};

function healthColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "healthy" || s === "running" || s === "available" || s === "active")
    return "hsl(142 70% 50%)";
  if (s === "warning") return "hsl(38 88% 60%)";
  if (s === "critical" || s === "failed" || s === "stopped" || s === "terminated")
    return "hsl(4 78% 65%)";
  return "hsl(225 14% 40%)";
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortLabel(value: string, n = 28): string {
  return value.length > n ? `${value.slice(0, n - 1)}…` : value;
}

// ── Layout ───────────────────────────────────────────────────────────────────

type Pos = Record<number, { x: number; y: number }>;

function computeLayout(nodes: TopologyNode[], edges: TopologyEdge[], W: number, H: number): Pos {
  if (nodes.length === 0) return {};
  if (nodes.length === 1) return { [nodes[0].id]: { x: W / 2, y: H / 2 } };

  const n = nodes.length;
  const k = Math.sqrt((W * H) / n) * 0.42;
  let temp = Math.min(W, H) / 5.5;
  const cool = temp / (ITERS + 1);
  const padX = NODE_W / 2 + 24;
  const padY = NODE_H / 2 + 34;
  const centers = clusterCenters(nodes, W, H);
  const degree = new Map<number, number>();
  for (const edge of edges) {
    degree.set(edge.source_id, (degree.get(edge.source_id) ?? 0) + 1);
    degree.set(edge.target_id, (degree.get(edge.target_id) ?? 0) + 1);
  }

  const pos: Record<number, { x: number; y: number; vx: number; vy: number }> = {};
  const perClusterIndex = new Map<string, number>();
  nodes.forEach((node) => {
    const cluster = clusterKey(node);
    const index = perClusterIndex.get(cluster) ?? 0;
    perClusterIndex.set(cluster, index + 1);
    const center = centers[cluster] ?? { x: W / 2, y: H / 2 };
    const a = index * 2.399963; // golden-angle packing keeps related nodes compact without exact overlap.
    const r = 20 + Math.sqrt(index) * 34;
    pos[node.id] = {
      x: center.x + Math.cos(a) * r,
      y: center.y + Math.sin(a) * r,
      vx: 0,
      vy: 0,
    };
  });

  const ids = nodes.map((nd) => nd.id);

  for (let it = 0; it < ITERS; it++) {
    // repulsion
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]], b = pos[ids[j]];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (k * k) / d * 0.9;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    // attraction
    for (const e of edges) {
      const a = pos[e.source_id], b = pos[e.target_id];
      if (!a || !b) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d * d) / k * (e.inferred ? 0.035 : 0.06);
      a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
      b.vx += (dx / d) * f; b.vy += (dy / d) * f;
    }
    // cluster gravity keeps related resources together while edges still
    // decide the final dependency shape.
    for (const node of nodes) {
      const p = pos[node.id];
      const center = centers[clusterKey(node)] ?? { x: W / 2, y: H / 2 };
      const weight = Math.max(1, degree.get(node.id) ?? 0);
      p.vx += (center.x - p.x) * (0.018 / weight);
      p.vy += (center.y - p.y) * (0.018 / weight);
    }
    // apply
    for (const id of ids) {
      const p = pos[id];
      const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 0.01;
      const s = Math.min(mag, temp) / mag;
      p.x = Math.max(padX, Math.min(W - padX, p.x + p.vx * s));
      p.y = Math.max(padY, Math.min(H - padY, p.y + p.vy * s));
      p.vx = 0; p.vy = 0;
    }
    temp -= cool;
  }

  return Object.fromEntries(Object.entries(pos).map(([id, { x, y }]) => [Number(id), { x, y }]));
}

function clusterKey(node: TopologyNode) {
  const group =
    metadataString(node, ["topology_group", "application", "app", "service", "resource_group", "namespace"]) ||
    getNodeConfig(node.resource_type).category ||
    node.provider ||
    "other";
  return group;
}

function clusterCenters(nodes: TopologyNode[], W: number, H: number) {
  const keys = [...new Set(nodes.map(clusterKey))];
  const center: Record<string, { x: number; y: number }> = {};
  if (keys.length === 1) {
    center[keys[0]] = { x: W / 2, y: H / 2 };
    return center;
  }

  const cols = Math.ceil(Math.sqrt(keys.length));
  const rows = Math.ceil(keys.length / cols);
  const cellW = W / cols;
  const cellH = H / rows;
  keys.forEach((key, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    center[key] = {
      x: cellW * col + cellW / 2,
      y: cellH * row + cellH / 2,
    };
  });
  return center;
}

function fitView(pos: Pos, W: number, H: number) {
  const pts = Object.values(pos);
  if (pts.length === 0) return { tx: 0, ty: 0, scale: 1 };
  const padX = NODE_W / 2 + 42;
  const padY = NODE_H / 2 + 48;
  const minX = Math.min(...pts.map((p) => p.x)) - padX;
  const maxX = Math.max(...pts.map((p) => p.x)) + padX;
  const minY = Math.min(...pts.map((p) => p.y)) - padY;
  const maxY = Math.max(...pts.map((p) => p.y)) + padY;
  const gw = maxX - minX, gh = maxY - minY;
  const scale = Math.min(W / gw, H / gh, 1.45) * 0.96;
  return {
    tx: (W - gw * scale) / 2 - minX * scale,
    ty: (H - gh * scale) / 2 - minY * scale,
    scale,
  };
}

/**
 * Finds resources that could be affected if the selected node becomes unavailable.
 *
 * The graph is directed from consumer/source to dependency/target, so blast
 * radius walks reverse edges to find every consumer of the failed dependency.
 */
function blastRadius(nodeId: number, edges: TopologyEdge[]): Set<number> {
  const rev = new Map<number, number[]>();
  for (const e of edges) {
    if (!rev.has(e.target_id)) rev.set(e.target_id, []);
    rev.get(e.target_id)!.push(e.source_id);
  }
  const hit = new Set<number>();
  const q = [nodeId];
  const seen = new Set([nodeId]);
  while (q.length) {
    const cur = q.shift()!;
    for (const dep of rev.get(cur) ?? []) {
      if (!seen.has(dep)) { seen.add(dep); hit.add(dep); q.push(dep); }
    }
  }
  return hit;
}

// Build a fallback graph from resources when the API is unavailable. String IDs
// from mock/example data are mapped onto stable numeric node IDs for the SVG.
function buildFallback(resources: Resource[], alerts: AlertRecord[] = []): TopologyGraph {
  const nodeIds = new Map(resources.map((resource, index) => [String(resource.id), index + 1]));
  const nodes: TopologyNode[] = resources.map((r) => ({
    id: nodeIds.get(String(r.id)) ?? Number(r.id),
    name: r.name,
    resource_type: r.resource_type,
    provider: r.provider,
    region: r.region,
    status: r.status,
    health_status: r.health_status ?? r.status,
    alert_count: alerts.filter((alert) => String(alert.resource_id) === String(r.id) && alert.status === "open").length,
    critical_alert_count: alerts.filter((alert) => String(alert.resource_id) === String(r.id) && alert.status === "open" && alert.severity === "critical").length,
    metadata: { ...(r.metadata ?? {}), resource_key: String(r.id) },
  }));
  return withInferredRelationships({ nodes, edges: [] }, resources);
}

/**
 * Enriches a topology graph with inferred dependency edges.
 *
 * Reasoning:
 * - Discovery often supplies partial relationships, especially in early setup.
 * - Operators still need a dependency view rather than a flat inventory.
 * - Inference uses conservative signals: metadata relationships, host names,
 *   application tags, Kubernetes namespaces and topology groups.
 *
 * Output:
 * - Original graph plus inferred edges marked with inferred=true.
 */
function withInferredRelationships(graph: TopologyGraph, resources: Resource[]): TopologyGraph {
  const nodes = graph.nodes.map((node) => ({
    ...node,
    metadata: { ...(node.metadata ?? {}), resource_key: String(resolveResourceForNode(node, resources)?.id ?? node.id) },
  }));
  const edges = [...graph.edges];
  const existing = new Set(edges.map((edge) => `${edge.source_id}->${edge.target_id}`));

  const addEdge = (source: TopologyNode, target: TopologyNode, relationshipType: string, metadata = {}) => {
    if (source.id === target.id) return;
    const key = `${source.id}->${target.id}`;
    if (existing.has(key)) return;
    existing.add(key);
    edges.push({
      id: `inf-${relationshipType}-${source.id}-${target.id}`,
      source_id: source.id,
      target_id: target.id,
      relationship_type: relationshipType,
      inferred: true,
      metadata,
    });
  };

  for (const source of nodes) {
    // Discovered metadata relationships are preferred when discovery supplied
    // target references but not concrete graph edges.
    for (const relationship of metadataRelationships(source)) {
      const target = nodes.find((node) =>
        [node.name, String(node.metadata?.resource_key), String(resolveResourceForNode(node, resources)?.resource_id ?? "")]
          .filter(Boolean)
          .some((candidate) => candidate === relationship.target_ref),
      );
      if (target) addEdge(source, target, relationship.relationship_type, { source: "metadata" });
    }

    const sourceKind = getNodeConfig(source.resource_type).category;
    const sourceApp = metadataString(source, ["app", "application", "service", "workload"]);
    const sourceGroup = metadataString(source, ["topology_group", "group", "resource_group", "vpc", "subnet"]);
    const sourceNamespace = metadataString(source, ["namespace"]);

    for (const target of nodes) {
      if (source.id === target.id) continue;
      const targetKind = getNodeConfig(target.resource_type).category;
      const targetApp = metadataString(target, ["app", "application", "service", "workload"]);
      const targetGroup = metadataString(target, ["topology_group", "group", "resource_group", "vpc", "subnet"]);
      const targetNamespace = metadataString(target, ["namespace"]);

      if (sourceKind === "server" && targetKind === "container" && hostMatches(source, target)) {
        addEdge(source, target, "hosts");
      }

      if (sourceKind === "container" && targetKind === "database" && (nameReferenced(source, target) || sameApp(sourceApp, targetApp))) {
        addEdge(source, target, "uses_database");
      }

      if (sourceKind === "kubernetes" && targetKind === "kubernetes" && sameNamespace(sourceNamespace, targetNamespace)) {
        const sourceType = source.resource_type.toLowerCase();
        const targetType = target.resource_type.toLowerCase();
        if (sourceType.includes("deployment") && targetType.includes("service") && sameApp(sourceApp, targetApp)) {
          addEdge(source, target, "uses_service");
        }
        if (sourceType.includes("service") && targetType.includes("pod") && sameApp(sourceApp, targetApp)) {
          addEdge(source, target, "routes_to");
        }
      }

      if (sourceKind === "database" && sourceApp && targetApp && sameApp(sourceApp, targetApp)) {
        addEdge(source, target, "belongs_to_application");
      }

      if (sourceGroup && targetGroup && sourceGroup === targetGroup) {
        addEdge(source, target, sourceKind === "cloud" || targetKind === "cloud" ? "belongs_to_topology_group" : "related_to");
      }
    }
  }

  return { nodes, edges };
}

function resolveResourceForNode(node: TopologyNode, resources: Resource[]) {
  const resourceKey = String(node.metadata?.resource_key ?? "");
  return resources.find((resource) => String(resource.id) === resourceKey) ??
    resources.find((resource) => Number(resource.id) === node.id) ??
    resources.find((resource) => resource.name === node.name);
}

function metadataRelationships(node: TopologyNode) {
  const relationships = node.metadata?.relationships;
  if (!Array.isArray(relationships)) return [];
  return relationships
    .map((item) => ({
      relationship_type: String(metadataRecordValue(item, "relationship_type") ?? "related_to"),
      target_ref: String(metadataRecordValue(item, "target_ref") ?? ""),
    }))
    .filter((item) => item.target_ref);
}

function metadataRecordValue(item: unknown, key: string) {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
  return (item as Record<string, unknown>)[key];
}

function metadataString(node: TopologyNode, keys: string[]) {
  for (const key of keys) {
    const value = node.metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function hostMatches(server: TopologyNode, container: TopologyNode) {
  const host = metadataString(container, ["host", "hostname", "node", "server", "container_host"]);
  if (!host) return false;
  const candidates = [
    server.name,
    metadataString(server, ["host", "hostname", "node"]),
    String(server.metadata?.private_ip ?? ""),
  ].map((candidate) => candidate.toLowerCase()).filter(Boolean);
  return candidates.includes(host);
}

function nameReferenced(source: TopologyNode, target: TopologyNode) {
  const text = [
    source.name,
    metadataString(source, ["database", "database_name", "db", "db_name", "connection", "connection_string"]),
  ].join(" ").toLowerCase();
  return text.includes(target.name.toLowerCase());
}

function sameApp(a: string, b: string) {
  return Boolean(a && b && a === b);
}

function sameNamespace(a: string, b: string) {
  return Boolean(a && b && a === b);
}

function filteredNodesForGraph(
  nodes: TopologyNode[],
  categoryFilter: Category | null,
  typeFilter: string,
  healthFilter: string,
  providerFilter: string,
) {
  return nodes.filter((node) => {
    const category = getNodeConfig(node.resource_type).category;
    return (
      (!categoryFilter || category === categoryFilter) &&
      (typeFilter === "all" || node.resource_type === typeFilter) &&
      (healthFilter === "all" || node.health_status === healthFilter) &&
      (providerFilter === "all" || node.provider === providerFilter)
    );
  });
}

// ── Dependency Panel ──────────────────────────────────────────────────────────

type PanelTab = "depends" | "usedby" | "related" | "alerts";

function DependencyPanel({
  node,
  graph,
  resources,
  alerts,
  blastIds,
  blastMode,
  onToggleBlast,
  onClose,
  onNavigate,
}: {
  node: TopologyNode;
  graph: TopologyGraph;
  resources: Resource[];
  alerts: AlertRecord[];
  blastIds: Set<number>;
  blastMode: boolean;
  onToggleBlast: () => void;
  onClose: () => void;
  onNavigate: (r: Resource) => void;
}) {
  const [tab, setTab] = useState<PanelTab>("depends");

  const resource = resolveResourceForNode(node, resources);
  const cfg = getNodeConfig(node.resource_type);

  const dependsOn = graph.edges.filter((e) => e.source_id === node.id);
  const usedBy    = graph.edges.filter((e) => e.target_id === node.id);
  const related   = graph.nodes.filter(
    (n) =>
      n.id !== node.id &&
      (n.provider === node.provider || n.region === node.region) &&
      !dependsOn.some((e) => e.target_id === n.id) &&
      !usedBy.some((e) => e.source_id === n.id),
  ).slice(0, 8);

  const nodeAlerts = alerts.filter((a) => String(a.resource_id) === String(resource?.id ?? node.id) && a.status === "open");
  const blastList = graph.nodes.filter((n) => blastIds.has(n.id));

  const healthScore =
    resource?.health_score ??
    (node.health_status === "Healthy"  ? 92 :
    node.health_status === "Warning"  ? 55 :
    node.health_status === "Critical" ? 18 : 40);

  function NodeRef({ nodeId, relType }: { nodeId: number; relType: string }) {
    const n = graph.nodes.find((nd) => nd.id === nodeId);
    const r = n ? resolveResourceForNode(n, resources) : undefined;
    if (!n) return null;
    const c = getNodeConfig(n.resource_type);
    return (
      <button
        className="flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors hover:bg-muted/60"
        onClick={() => r && onNavigate(r)}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold"
          style={{ background: c.color + "22", color: c.color, border: `1px solid ${c.color}44` }}
        >
          <TechnologyIcon name={n.resource_type || n.provider} surface="tooltip" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{n.name}</span>
          <span className="text-[10px] text-muted-foreground">{relType}</span>
        </span>
        <span
          className="ml-auto shrink-0 text-[9px] font-medium"
          style={{ color: healthColor(n.health_status) }}
        >
          {n.health_status}
        </span>
      </button>
    );
  }

  const tabs: { id: PanelTab; label: string; count: number }[] = [
    { id: "depends", label: "Depends On", count: dependsOn.length },
    { id: "usedby",  label: "Used By",    count: usedBy.length    },
    { id: "related", label: "Related",    count: related.length   },
    { id: "alerts",  label: "Alerts",     count: nodeAlerts.length },
  ];

  return (
    <div className="flex w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-card/60 px-4 py-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border"
              style={{ background: cfg.color + "22", color: cfg.color, borderColor: cfg.color + "55" }}
            >
              <TechnologyIcon name={node.resource_type || node.provider} surface="tooltip" />
            </span>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold leading-snug">{node.name}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{cfg.label}</p>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
              style={{ background: cfg.color + "22", color: cfg.color }}
            >
              {titleCase(node.resource_type)}
            </span>
            <SeverityBadge severity={node.health_status} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {node.provider} · {node.region}
          </p>
        </div>
        <button
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Health score */}
      <div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <MiniField label="Provider" value={node.provider} />
          <MiniField label="Resource Type" value={cfg.label} />
          <MiniField label="Open Alerts" value={nodeAlerts.length} />
          <MiniField label="Dependencies" value={dependsOn.length + usedBy.length} />
        </div>
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Health Score</span>
          <span className="font-semibold" style={{ color: healthColor(node.health_status) }}>
            {healthScore}%
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${healthScore}%`, background: healthColor(node.health_status) }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`flex-1 rounded px-1 py-1 text-[9px] font-semibold uppercase tracking-wide transition-colors ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1 opacity-70">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {tab === "depends" && (
          dependsOn.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No dependencies found.</p>
          ) : (
            dependsOn.map((e) => <NodeRef key={e.id} nodeId={e.target_id} relType={relationshipLabel(e.relationship_type)} />)
          )
        )}
        {tab === "usedby" && (
          usedBy.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No consumers found.</p>
          ) : (
            usedBy.map((e) => <NodeRef key={e.id} nodeId={e.source_id} relType={relationshipLabel(e.relationship_type)} />)
          )
        )}
        {tab === "related" && (
          related.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No related resources.</p>
          ) : (
            related.map((n) => <NodeRef key={n.id} nodeId={n.id} relType={`${n.provider} · ${n.region}`} />)
          )
        )}
        {tab === "alerts" && (
          nodeAlerts.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No active alerts.</p>
          ) : (
            nodeAlerts.map((a) => (
              <div key={a.id} className="rounded-md border border-border bg-background/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium">{a.title}</p>
                  <SeverityBadge severity={a.severity} />
                </div>
                {a.description && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{a.description}</p>
                )}
              </div>
            ))
          )
        )}
      </div>

      {/* Blast radius */}
      <div className="border-t border-border pt-3">
        <button
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60"
          onClick={onToggleBlast}
        >
          <span className="flex items-center gap-1.5">
            <ZapOff className="size-3" />
            Blast Radius Analysis
          </span>
          <ChevronRight
            className={`size-3 transition-transform ${blastMode ? "rotate-90" : ""}`}
          />
        </button>

        {blastMode && (
          <div className="mt-2 space-y-1">
            {blastList.length === 0 ? (
              <p className="rounded-md bg-muted/40 px-2 py-2 text-center text-[10px] text-muted-foreground">
                No affected resources detected.
              </p>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground">
                  <span className="font-semibold text-warning">{blastList.length} resource{blastList.length > 1 ? "s" : ""}</span> affected if this resource becomes unavailable.
                </p>
                {blastList.map((n) => {
                  const c = getNodeConfig(n.resource_type);
                  return (
                    <div key={n.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold"
                        style={{ background: c.color + "22", color: c.color }}
                      >
                        <TechnologyIcon name={n.resource_type || n.provider} surface="table" />
                      </span>
                      <span className="truncate">{n.name}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Open details */}
      {resource && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full text-xs"
          onClick={() => onNavigate(resource)}
        >
          Open Details Page
          <ChevronRight className="ml-1 size-3" />
        </Button>
      )}
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-foreground">{value}</p>
    </div>
  );
}

// ── SVG Edge ─────────────────────────────────────────────────────────────────

function GraphEdge({
  edge,
  positions,
  isHighlighted,
  isDimmed,
  isHovered,
  onHover,
}: {
  edge: TopologyEdge;
  positions: Pos;
  isHighlighted: boolean;
  isDimmed: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const src = positions[edge.source_id];
  const tgt = positions[edge.target_id];
  if (!src || !tgt) return null;

  const dx = tgt.x - src.x, dy = tgt.y - src.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / dist, uy = dy / dist;

  // Start near the node card edge and end before the arrowhead.
  const x1 = src.x + ux * EDGE_OFFSET;
  const y1 = src.y + uy * EDGE_OFFSET;
  const x2 = tgt.x - ux * EDGE_OFFSET;
  const y2 = tgt.y - uy * EDGE_OFFSET;

  // Slight curve: perpendicular offset at midpoint
  const mx = (x1 + x2) / 2 - uy * 18;
  const my = (y1 + y2) / 2 + ux * 18;

  const color = isHighlighted
    ? "hsl(38 88% 60%)"
    : edge.inferred
      ? "hsl(225 14% 52%)"
      : "hsl(196 90% 62%)";
  const opacity = isDimmed ? 0.12 : isHovered ? 1 : isHighlighted ? 0.95 : edge.inferred ? 0.48 : 0.72;
  const strokeWidth = isHovered || isHighlighted ? 3 : edge.inferred ? 1.6 : 2.2;

  return (
    <g
      onMouseEnter={() => onHover(edge.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "default" }}
    >
      <path
        d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
      />
      <path
        d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={edge.inferred ? "7 5" : undefined}
        markerEnd={`url(#arrow-${isHighlighted ? "warn" : "default"})`}
        opacity={opacity}
        style={{ transition: "opacity 0.2s, stroke-width 0.15s" }}
      />
      {isHovered && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={(x1 + mx + x2) / 3 - 54}
            y={(y1 + my + y2) / 3 - 22}
            width={108}
            height={18}
            rx={6}
            fill="hsl(228 32% 8% / 0.96)"
            stroke={edge.inferred ? "hsl(225 14% 52%)" : "hsl(196 90% 62%)"}
          />
          <text
            x={(x1 + mx + x2) / 3}
            y={(y1 + my + y2) / 3 - 9}
            textAnchor="middle"
            fill="hsl(220 30% 95%)"
            fontSize={9}
            fontWeight={700}
            style={{ userSelect: "none" }}
          >
            {relationshipLabel(edge.relationship_type)}{edge.inferred ? " · inferred" : ""}
          </text>
        </g>
      )}
    </g>
  );
}

function relationshipLabel(value: string) {
  return titleCase(value.replace(/^uses_/, "uses "));
}

// ── SVG Node ─────────────────────────────────────────────────────────────────

function GraphNode({
  node,
  x,
  y,
  isSelected,
  isBlast,
  isDimmed,
  onClick,
  onHover,
}: {
  node: TopologyNode;
  x: number;
  y: number;
  isSelected: boolean;
  isBlast: boolean;
  isDimmed: boolean;
  onClick: () => void;
  onHover: (id: number | null) => void;
}) {
  const cfg = getNodeConfig(node.resource_type);
  const hc = healthColor(node.health_status);
  const opacity = isDimmed ? 0.25 : 1;

  const glowFilter = isSelected ? "url(#glow-primary)" : isBlast ? "url(#glow-blast)" : undefined;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer", opacity, transition: "opacity 0.2s" }}
    >
      <rect
        x={-NODE_W / 2}
        y={-NODE_H / 2}
        width={NODE_W}
        height={NODE_H}
        rx={12}
        fill="hsl(228 32% 8% / 0.96)"
        stroke={isSelected ? "hsl(263 72% 66%)" : isBlast ? "hsl(38 88% 60%)" : cfg.color}
        strokeWidth={isSelected || isBlast ? 2 : 1.2}
        filter={glowFilter}
      />

      <rect
        x={-NODE_W / 2}
        y={-NODE_H / 2}
        width={4}
        height={NODE_H}
        rx={4}
        fill={hc}
        opacity={0.95}
      />

      <circle cx={-NODE_W / 2 + 24} cy={-6} r={17} fill={cfg.color + "20"} stroke={cfg.color} strokeWidth={1.2} />
      <foreignObject x={-NODE_W / 2 + 13} y={-17} width={22} height={22} style={{ pointerEvents: "none" }}>
        <div className="flex h-full w-full items-center justify-center">
          <TechnologyIcon name={node.resource_type || node.provider} surface="topology" />
        </div>
      </foreignObject>

      <foreignObject x={-NODE_W / 2 + 48} y={-24} width={NODE_W - 58} height={44} style={{ pointerEvents: "none" }}>
        <div className="flex h-full flex-col justify-center leading-tight">
          <div className="truncate text-[11px] font-semibold text-foreground" title={node.name}>
            {shortLabel(node.name, 30)}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1 text-[9px] text-muted-foreground">
            <span className="truncate">{cfg.label}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{node.provider}</span>
          </div>
        </div>
      </foreignObject>

      <circle cx={NODE_W / 2 - 13} cy={NODE_H / 2 - 12} r={4} fill={hc} />

      {/* Alert badge */}
      {node.alert_count > 0 && (
        <g transform={`translate(${NODE_W / 2 - 13}, ${-NODE_H / 2 + 13})`}>
          <circle r={8} fill={node.critical_alert_count > 0 ? "hsl(4 78% 65%)" : "hsl(38 88% 60%)"} />
          <text
            y={3.5}
            textAnchor="middle"
            fill="white"
            fontSize={8}
            fontWeight="700"
            style={{ userSelect: "none" }}
          >
            {node.alert_count > 9 ? "9+" : node.alert_count}
          </text>
        </g>
      )}
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Category = "server" | "database" | "container" | "kubernetes" | "cloud" | "other";

/**
 * Interactive workspace topology graph.
 *
 * Inputs:
 * - resources: active workspace resources
 * - alerts: active workspace alerts used for badges and the dependency panel
 *
 * Outputs:
 * - Clickable nodes that open resource details
 * - Dependency panel with depends-on, used-by, related resources and blast radius
 */
export function TopologyPage({
  onSelectResource,
  resources,
  alerts = [],
}: {
  onSelectResource: (resource: Resource) => void;
  resources: Resource[];
  alerts?: AlertRecord[];
}) {
  const [graph, setGraph]       = useState<TopologyGraph | null>(null);
  const [loading, setLoading]   = useState(true);
  const [positions, setPositions] = useState<Pos>({});
  const [transform, setTransform] = useState({ tx: 0, ty: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [blastMode, setBlastMode]   = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: CANVAS_H });
  const [dragging, setDragging] = useState(false);
  const isDragging = useRef(false);
  const dragStart  = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Track container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setDims({ w: e.contentRect.width || 900, h: CANVAS_H });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch topology
  useEffect(() => {
    let alive = true;
    fetchTopologyGraph()
      .then((g) => { if (alive) { setGraph(withInferredRelationships(g, resources)); setLoading(false); } })
      .catch(() => { if (alive) { setGraph(buildFallback(resources, alerts)); setLoading(false); } });
    return () => { alive = false; };
  }, [alerts, resources]);

  // Run force layout when graph or canvas dims change
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;
    const filtered = filteredNodesForGraph(graph.nodes, categoryFilter, typeFilter, healthFilter, providerFilter);
    const filteredEdges = graph.edges.filter(
      (e) => filtered.some((n) => n.id === e.source_id) && filtered.some((n) => n.id === e.target_id),
    );
    queueMicrotask(() => {
      const pos = computeLayout(filtered, filteredEdges, dims.w, dims.h);
      setPositions(pos);
      setTransform(fitView(pos, dims.w, dims.h));
      setSelectedId((current) => current && filtered.some((node) => node.id === current) ? current : null);
    });
  }, [graph, dims, categoryFilter, typeFilter, healthFilter, providerFilter]);

  // Visible nodes/edges after filter
  const visibleNodes = useMemo(
    () => graph ? filteredNodesForGraph(graph.nodes, categoryFilter, typeFilter, healthFilter, providerFilter) : [],
    [categoryFilter, graph, healthFilter, providerFilter, typeFilter],
  );
  const visibleEdges = useMemo(
    () =>
      graph
        ? graph.edges.filter(
            (e) => visibleNodes.some((n) => n.id === e.source_id) && visibleNodes.some((n) => n.id === e.target_id),
          )
        : [],
    [graph, visibleNodes],
  );

  // Blast radius set
  const blastIds = useMemo(() => {
    if (!selectedId || !blastMode || !graph) return new Set<number>();
    return blastRadius(selectedId, graph.edges);
  }, [selectedId, blastMode, graph]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId],
  );

  // Pan handlers
  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if ((e.target as SVGElement).closest("[data-node]")) return;
    isDragging.current = true;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.tx, ty: transform.ty };
  }
  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!isDragging.current) return;
    setTransform((t) => ({
      ...t,
      tx: dragStart.current.tx + e.clientX - dragStart.current.x,
      ty: dragStart.current.ty + e.clientY - dragStart.current.y,
    }));
  }
  function onMouseUp() {
    isDragging.current = false;
    setDragging(false);
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    const rect = (e.target as SVGSVGElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTransform((t) => ({
      scale: Math.min(3, Math.max(0.2, t.scale * factor)),
      tx: cx - (cx - t.tx) * factor,
      ty: cy - (cy - t.ty) * factor,
    }));
  }

  function resetView() {
    if (Object.keys(positions).length === 0) return;
    setTransform(fitView(positions, dims.w, dims.h));
  }

  function handleNodeClick(node: TopologyNode) {
    if (selectedId === node.id) {
      setSelectedId(null);
      setBlastMode(false);
    } else {
      setSelectedId(node.id);
      setBlastMode(false);
    }
  }

  const categories: Category[] = ["server", "database", "container", "kubernetes", "cloud"];
  const typeOptions = useMemo(
    () => ["all", ...new Set((graph?.nodes ?? []).map((node) => node.resource_type).filter(Boolean).sort())],
    [graph],
  );
  const healthOptions = useMemo(
    () => ["all", ...new Set((graph?.nodes ?? []).map((node) => node.health_status).filter(Boolean).sort())],
    [graph],
  );
  const providerOptions = useMemo(
    () => ["all", ...new Set((graph?.nodes ?? []).map((node) => node.provider).filter(Boolean).sort())],
    [graph],
  );
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    graph?.nodes.forEach((n) => {
      const cat = getNodeConfig(n.resource_type).category;
      counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return counts;
  }, [graph]);
  const hoveredEdgeRecord = useMemo(
    () => visibleEdges.find((edge) => edge.id === hoveredEdge) ?? null,
    [hoveredEdge, visibleEdges],
  );
  const activeNodeIds = useMemo(() => {
    const ids = new Set<number>();
    if (selectedId) ids.add(selectedId);
    if (hoveredNodeId) ids.add(hoveredNodeId);
    if (hoveredEdgeRecord) {
      ids.add(hoveredEdgeRecord.source_id);
      ids.add(hoveredEdgeRecord.target_id);
    }
    for (const edge of visibleEdges) {
      if (selectedId && (edge.source_id === selectedId || edge.target_id === selectedId)) {
        ids.add(edge.source_id);
        ids.add(edge.target_id);
      }
      if (hoveredNodeId && (edge.source_id === hoveredNodeId || edge.target_id === hoveredNodeId)) {
        ids.add(edge.source_id);
        ids.add(edge.target_id);
      }
    }
    return ids;
  }, [hoveredEdgeRecord, hoveredNodeId, selectedId, visibleEdges]);

  return (
    <Card className="console-line flex flex-col overflow-hidden">
      <CardHeader className="shrink-0 pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <GitBranch className="size-3.5 text-primary" />
            Infrastructure Topology
            {graph && (
              <span className="text-xs font-normal text-muted-foreground">
                {visibleNodes.length}/{graph.nodes.length} nodes · {visibleEdges.length}/{graph.edges.length} edges
              </span>
            )}
          </CardTitle>

          {/* Toolbar */}
          <ControlToolbar>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTransform((t) => ({ ...t, scale: Math.min(3, t.scale * 1.2) }))}
            >
              <ZoomIn className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.2, t.scale * 0.83) }))}
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={resetView}>
              <Maximize2 className="size-3.5" />
            </Button>
            {loading && <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />}
          </ControlToolbar>
          </div>

          <ControlToolbar>
            <ControlToolbar>
              {categories.map((cat) => {
                const { label, Icon } = CATEGORY_META[cat];
                const count = categoryCounts[cat] ?? 0;
                if (!count) return null;
                return (
                  <FilterChip
                    key={cat}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                    active={categoryFilter === cat}
                    className="text-[10px]"
                  >
                    <Icon className="size-3" />
                    {label}
                    <span className="opacity-60">{count}</span>
                  </FilterChip>
                );
              })}
            </ControlToolbar>
            <Select className="w-[180px] text-xs" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              {typeOptions.map((option) => (
                <option key={option} value={option}>{option === "all" ? "All resource types" : titleCase(option)}</option>
              ))}
            </Select>
            <Select className="w-[150px] text-xs" value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
              {healthOptions.map((option) => (
                <option key={option} value={option}>{option === "all" ? "All health" : option}</option>
              ))}
            </Select>
            <Select className="w-[150px] text-xs" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
              {providerOptions.map((option) => (
                <option key={option} value={option}>{option === "all" ? "All providers" : option}</option>
              ))}
            </Select>
            {(categoryFilter || typeFilter !== "all" || healthFilter !== "all" || providerFilter !== "all") && (
              <Button
                className="text-xs"
                onClick={() => {
                  setCategoryFilter(null);
                  setTypeFilter("all");
                  setHealthFilter("all");
                  setProviderFilter("all");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear filters
              </Button>
            )}
          </ControlToolbar>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {!graph || graph.nodes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8">
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading topology…</p>
            ) : (
              <EmptyState text="No topology nodes available. Run a discovery scan to populate the graph." />
            )}
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* SVG canvas */}
            <div ref={containerRef} className="relative flex-1 overflow-hidden">
              <svg
                width={dims.w}
                height={dims.h}
                style={{ display: "block", cursor: dragging ? "grabbing" : "grab" }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={onWheel}
              >
                <defs>
                  <marker id="arrow-default" markerWidth="7" markerHeight="7" refX="0" refY="3" orient="auto">
                    <polygon points="0 0, 7 3, 0 6" fill="hsl(196 90% 62%)" />
                  </marker>
                  <marker id="arrow-warn" markerWidth="7" markerHeight="7" refX="0" refY="3" orient="auto">
                    <polygon points="0 0, 7 3, 0 6" fill="hsl(38 88% 60%)" />
                  </marker>
                  <filter id="glow-primary" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="glow-blast" x="-50%" y="-50%" width="200%" height="200%">
                    <feColorMatrix type="matrix" values="1 0.5 0 0 0  0.5 0.4 0 0 0  0 0 0 0 0  0 0 0 1 0" result="orange" />
                    <feGaussianBlur stdDeviation="3" result="blur" in="orange" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g transform={`translate(${transform.tx}, ${transform.ty}) scale(${transform.scale})`}>
                  {/* Edges */}
                  {visibleEdges.map((edge) => {
                    const isHL =
                      blastMode && selectedId != null &&
                      (blastIds.has(edge.source_id) || blastIds.has(edge.target_id) ||
                        edge.source_id === selectedId || edge.target_id === selectedId);
                    const isConnectedToHover =
                      hoveredNodeId != null &&
                      (edge.source_id === hoveredNodeId || edge.target_id === hoveredNodeId);
                    const dim =
                      ((selectedId != null && !blastMode) || hoveredNodeId != null || hoveredEdge != null) &&
                      !isHL &&
                      !isConnectedToHover &&
                      hoveredEdge !== edge.id &&
                      edge.source_id !== selectedId &&
                      edge.target_id !== selectedId;
                    return (
                      <GraphEdge
                        key={edge.id}
                        edge={edge}
                        positions={positions}
                        isHighlighted={isHL || isConnectedToHover}
                        isDimmed={!!dim}
                        isHovered={hoveredEdge === edge.id}
                        onHover={setHoveredEdge}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {visibleNodes.map((node) => {
                    const pos = positions[node.id];
                    if (!pos) return null;
                    const isSelected = node.id === selectedId;
                    const isBlast = blastIds.has(node.id);
                    const isDimmed =
                      (selectedId != null || hoveredNodeId != null || hoveredEdge != null) &&
                      !isSelected &&
                      !isBlast &&
                      !activeNodeIds.has(node.id);
                    return (
                      <g key={node.id} data-node="true">
                        <GraphNode
                          node={node}
                          x={pos.x}
                          y={pos.y}
                          isSelected={isSelected}
                          isBlast={isBlast}
                          isDimmed={isDimmed}
                          onClick={() => handleNodeClick(node)}
                          onHover={setHoveredNodeId}
                        />
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Blast mode indicator */}
              {blastMode && selectedNode && (
                <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[10px] font-semibold text-warning">
                  Blast Radius: {blastIds.size} affected resource{blastIds.size !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* Dependency panel */}
            {selectedNode && (
              <DependencyPanel
                node={selectedNode}
                graph={{ nodes: graph.nodes, edges: graph.edges }}
                resources={resources}
                alerts={alerts}
                blastIds={blastIds}
                blastMode={blastMode}
                onToggleBlast={() => setBlastMode((b) => !b)}
                onClose={() => { setSelectedId(null); setBlastMode(false); }}
                onNavigate={onSelectResource}
              />
            )}
          </div>
        )}

        {/* Legend */}
        {graph && graph.nodes.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2">
            {categories
              .filter((c) => (categoryCounts[c] ?? 0) > 0)
              .map((cat) => {
                const { label } = CATEGORY_META[cat];
                const nodeColor = graph.nodes.find(
                  (n) => getNodeConfig(n.resource_type).category === cat,
                );
                const color = nodeColor ? getNodeConfig(nodeColor.resource_type).color : "hsl(225 14% 56%)";
                return (
                  <div key={cat} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    {label}
                  </div>
                );
              })}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground opacity-60" />
              Inferred
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="inline-block h-0 w-4 border-t border-muted-foreground opacity-60" />
              Discovered
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

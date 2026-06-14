/**
 * Sidebar Navigation
 * ==================
 * Defines the main navigation items rendered in the dashboard sidebar.
 * Each entry maps a Section name to a Lucide icon.
 */

import {
  Activity,
  Bot,
  Database,
  GitBranch,
  LayoutDashboard,
  Network,
  PlugZap,
  Server,
  ShieldAlert,
  ShipWheel,
  Zap,
} from "lucide-react";

import type { NavigationGroup } from "@/types/infrasight";

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Dashboard",
    items: [{ name: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operations",
    items: [
      { name: "Alerts", icon: ShieldAlert },
      { name: "OpenClaw", icon: Bot },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { name: "Servers", icon: Server },
      { name: "Databases", icon: Database },
      { name: "Containers", icon: Activity },
      { name: "Kubernetes", icon: ShipWheel },
      { name: "Topology", icon: GitBranch },
      { name: "Connectors", icon: PlugZap },
    ],
  },
  {
    label: "Inventory",
    items: [{ name: "Assets", icon: Network }],
  },
  {
    label: "Automation",
    items: [{ name: "Automation", icon: Zap }],
  },
  {
    label: "Settings",
    items: [{ name: "Settings", icon: LayoutDashboard }],
  },
];

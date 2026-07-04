# InfraSight Web

Next.js frontend for the InfraSight Hybrid Operations platform.

## Application Modules

The frontend uses a modular dashboard shell with these primary areas:

- Dashboard
- Operations
  - Alerts
- Infrastructure
  - Servers
  - Databases
  - Containers
  - Kubernetes
  - Topology
- Inventory
- Automation
- Notifications
- Administration
  - Connectors
  - Administration
- OpenClaw

Cloud providers are resource attributes rather than standalone pages. Provider-aware views use shared classification logic so AWS, Azure, On-Prem, and VMware resources can be displayed consistently across Inventory and Infrastructure modules.

## Connector UI

The Connectors page uses a shared connector framework. Supported connector types:

- AWS (API)
- Azure (API)
- Windows/Linux Agent (Agent)
- Docker (Agent / Docker Socket)
- Kubernetes (Helm)

The UI includes real onboarding forms and lifecycle actions backed by mocked backend APIs. Discovery and synchronization update local backend state and normalized inventory, but no real cloud or Kubernetes APIs are called yet.

## UI Components

Recent UI work standardized:

- Buttons and icon buttons
- Inputs and selects
- Badges
- Control toolbars
- Tables
- Info tiles
- Resource/provider badges
- Connector onboarding layouts

Use shared UI primitives and dashboard components before adding page-specific styles.

## Development

```bash
cd web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

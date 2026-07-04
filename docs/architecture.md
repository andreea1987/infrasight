# InfraSight Architecture

> **Release:** Hybrid Operations Early Access  
> **Last updated:** July 2026

InfraSight is a multi-tenant hybrid operations platform for managing infrastructure across multiple organizations and workspaces. Each organization can contain one or more workspaces. Operational data, connectors, inventory, alerts, notification settings, and user access are scoped to the active workspace.

---

## Modular Application Architecture

The application is organized around a shared dashboard shell, a modular navigation model, and reusable domain components. Cloud providers are treated as resource attributes, not as separate application modules. This allows a server, database, container, or Kubernetes workload to be viewed consistently whether it originated from AWS, Azure, on-premises infrastructure, or a future provider.

### Navigation Model

| Navigation area | Module | Responsibility |
|---|---|---|
| **Dashboard** | Dashboard | Workspace-level operational overview, health counts, provider/type breakdowns, AI insights, alert stream, and recent activity. |
| **Operations** | Alerts | Alert triage, lifecycle management, incident history, investigation notes, root cause, resolution details, and alert knowledge capture. |
| **Infrastructure** | Servers | Provider-aware server inventory for cloud VMs, EC2 instances, and on-prem Windows/Linux hosts. |
| **Infrastructure** | Databases | Database inventory across cloud-managed and discovered database resources. |
| **Infrastructure** | Containers | Docker/container inventory, status, health, restart context, and container metadata. |
| **Infrastructure** | Kubernetes | Kubernetes clusters, nodes, pods, deployments, services, namespaces, and operational state. |
| **Infrastructure** | Topology | Interactive dependency graph built from normalized inventory and inferred relationships. |
| **Inventory** | Inventory | Central resource catalogue containing all discovered/imported resources across providers and resource types. |
| **Automation** | Automation | Foundation for operational workflows, rule templates, scheduled tasks, and future remediation actions. |
| **Notifications** | Notifications | Notification channel management and operational alert delivery. Email notifications are implemented. |
| **Administration** | Connectors | Shared connector onboarding framework, lifecycle actions, mocked discovery/sync, and connector health. |
| **Administration** | Administration | Administrative settings including users, authentication configuration, AI providers, and platform settings. |
| **OpenClaw** | OpenClaw | Read-only AI operations assistant for infrastructure context, alert summaries, and operational analysis. |

---

## Hybrid Operations Platform

InfraSight is designed for hybrid operations across organizations, workspaces, and environments. The current provider taxonomy supports:

- AWS
- Azure
- On-Prem
- VMware

The current resource model supports:

- Servers
- Databases
- Containers
- Kubernetes

Provider is stored as metadata on each resource. A resource is first classified by what it is, then enriched with where it came from. For example:

- An AWS EC2 instance is shown as a server with provider `AWS`.
- An Azure SQL database is shown as a database with provider `Azure`.
- A Docker container is shown as a container with provider/platform metadata.
- A Kubernetes pod is shown in the Kubernetes module and central inventory.

This design keeps the application modular and avoids separate AWS, Azure, or on-prem pages for every resource workflow.

---

## Connector Framework

The connector framework uses a shared registry and shared onboarding UI. Every connector follows the same lifecycle while providing connector-specific configuration fields and workflow actions.

### Supported Connector Types

| Connector | Connection type | Current behavior |
|---|---|---|
| AWS | API | Mocked API workflow with IAM Role / Access Keys configuration. |
| Azure | API | Mocked API workflow with tenant, subscription, client ID, and client secret configuration. |
| Windows/Linux Agent | Agent | Mocked enrollment workflow with generated token, installer commands, connected-agent display, and verification. |
| Docker | Agent / Docker Socket | Mocked local-agent or socket workflow with container/image discovery. |
| Kubernetes | Helm | Mocked Helm workflow with namespace, workspace token, Helm command generation, verification, and discovery. |

### Generic Lifecycle

All connectors follow this lifecycle:

1. Disconnected
2. Configured
3. Credentials Saved
4. Connection Tested
5. Discovery
6. Synchronization
7. Resources Imported
8. Monitoring

The UI currently presents the lifecycle as: Disconnected -> Configured -> Credentials Saved -> Connection Tested -> Discovery Started -> Resources Imported -> Healthy.

### Mocked Workflow Boundary

Connector actions are backed by mocked backend APIs in this release. The mocked APIs persist connector records, encrypted credential records, sync runs, discovered resources, and normalized inventory resources locally so the UI behaves like a production workflow. They do not connect to real AWS, Azure, Docker, Kubernetes, or host-agent services yet.

Future real integrations should replace the mocked provider implementations behind the existing connector lifecycle API rather than creating new page-specific workflows.

---

## Inventory Model

Inventory is the central resource catalogue. It is the source used by Dashboard counts, Infrastructure pages, Topology, OpenClaw context, and resource detail views.

Each resource includes metadata such as:

- Provider
- Resource Type
- Platform / Operating System
- Health
- Status
- Workspace
- Environment
- Region, namespace, host, image, engine, or connector-specific metadata where available

Connector discovery imports mocked resources into both connector-specific discovery tables and the normalized inventory table. This keeps the application behavior consistent across Inventory, Servers, Databases, Containers, Kubernetes, Topology, and Dashboard counts.

---

## Automation

Automation is a core platform capability and currently provides the foundation for:

- Operational workflow templates
- Future scheduled tasks
- Future remediation actions
- Rule authoring and review UX

The current automation execution path is simulated/demo-oriented. Backend rule evaluation and remediation execution are planned future work.

---

## Notifications

Notifications are a dedicated module. Email notifications and SMTP configuration are implemented and operational. Additional channels are planned for future releases.

---

## OpenClaw

OpenClaw is currently a read-only AI operations assistant. It can use InfraSight resource, alert, incident, and operational context, but it cannot modify infrastructure or execute connector/automation actions.

The next release is planned to focus on deeper OpenClaw capabilities, including infrastructure-aware analysis, alert explanation, operational summaries, troubleshooting, runbook recommendations, knowledge base integration, and AI-assisted resource discovery.

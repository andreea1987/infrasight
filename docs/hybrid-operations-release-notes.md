# Hybrid Operations Release Notes

> **Release:** Hybrid Operations Early Access  
> **Last updated:** July 2026

This release positions InfraSight as a multi-tenant hybrid operations platform with modular navigation, a central inventory catalogue, provider-aware infrastructure views, and a reusable connector framework.

---

## What Changed

### Architecture

InfraSight now uses a modular application structure:

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

Each module owns a clear operational responsibility while sharing common data models, UI controls, tables, badges, filters, and resource classification logic.

### Hybrid Operations Platform

InfraSight is now documented and structured as a multi-tenant platform for managing infrastructure across multiple organizations and workspaces.

Supported provider taxonomy:

- AWS
- Azure
- On-Prem
- VMware

Supported resource types:

- Servers
- Databases
- Containers
- Kubernetes

Cloud providers are resource attributes rather than standalone application modules. This keeps workflows organized by operational concern instead of by vendor.

### Connector Framework

The Connectors module now uses a shared connector framework. Supported connector types:

- AWS (API)
- Azure (API)
- Windows/Linux Agent (Agent)
- Docker (Agent / Docker Socket)
- Kubernetes (Helm)

Every connector follows the same lifecycle:

Disconnected -> Configured -> Credentials Saved -> Connection Tested -> Discovery -> Synchronization -> Resources Imported -> Monitoring

The current UI presents the lifecycle as:

Disconnected -> Configured -> Credentials Saved -> Connection Tested -> Discovery Started -> Resources Imported -> Healthy

Each connector shares the same framework while supplying connector-specific configuration:

- AWS: IAM Role or Access Keys
- Azure: Tenant, subscription, client ID, client secret
- Windows/Linux Agent: Enrollment token, installer commands, connected agents, verification
- Docker: Local Agent or Docker Socket, socket configuration, container discovery
- Kubernetes: Namespace, workspace token, Helm command, cluster verification, resource discovery

Connector backend workflows are mocked in this release. They persist connector records, encrypted credential metadata, sync runs, discovered resources, and normalized inventory resources locally. No real AWS, Azure, Docker, Kubernetes, or host-agent calls are made.

### Inventory

Inventory is the central resource catalogue for the platform. Imported resources include metadata such as:

- Provider
- Resource Type
- Platform / Operating System
- Health
- Status
- Workspace
- Environment

Dashboard counts, Infrastructure pages, Topology, OpenClaw context, and resource details all consume the normalized inventory model.

### Automation

Automation is documented as a core platform capability. The current implementation provides the foundation for future operational workflows, scheduled tasks, and remediation actions. Rule execution remains simulated/demo-oriented in this release.

### Notifications

Notifications are now a dedicated module. Email notifications and SMTP configuration are implemented and operational. Additional notification channels are planned for future releases.

---

## UI Improvements

This release includes several UI consistency and maintainability improvements:

- Consistent navigation structure
- Improved filtering controls
- Provider-aware infrastructure pages
- Shared connector framework
- Improved button and control consistency
- Standardized page layouts
- Shared tables, badges, tiles, and toolbar patterns
- Responsive connector onboarding controls

---

## Known Limitations

- Cloud connectors currently use mocked backend implementations.
- Resource discovery through the connector framework is simulated.
- Connector actions persist local mocked data but do not call real provider APIs.
- RBAC and SSO are planned or partially scaffolded; full enterprise SSO/RBAC behavior is not complete.
- Automation rule execution is simulated/demo-oriented.
- OpenClaw is read-only and planned for deeper enhancements in the next release.
- VMware is represented in provider taxonomy and UI classification, but VMware connector integration is not implemented.

---

## Next Release: OpenClaw Improvements

The next release is planned to focus on OpenClaw as a deeper infrastructure-aware AI assistant.

Planned improvements:

- Infrastructure-aware AI assistant
- Alert analysis
- AI operational summaries
- Context-aware troubleshooting
- Runbook recommendations
- Knowledge base integration
- AI-assisted resource discovery

These are roadmap items and are not implemented in the current release.

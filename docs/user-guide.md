# InfraSight User Guide

> **Platform version:** Early Access  
> **Last updated:** July 2026

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Sign In and Workspace Selection](#sign-in-and-workspace-selection)
3. [Dashboard Overview](#dashboard-overview)
4. [Alerts](#alerts)
5. [OpenClaw AI Assistant](#openclaw-ai-assistant)
6. [Connectors and Data Sources](#connectors-and-data-sources)
7. [Servers](#servers)
8. [Databases](#databases)
9. [Containers](#containers)
10. [Kubernetes](#kubernetes)
11. [Topology](#topology)
12. [Inventory](#inventory)
13. [Automation](#automation)
14. [Notifications](#notifications-settings)
15. [Administration](#administration)
    - [Connectors](#connectors-and-data-sources)
    - [User Management](#user-management)
    - [Authentication / SSO](#authentication--sso)
16. [Common Workflows](#common-workflows)
17. [Troubleshooting](#troubleshooting)
18. [Known Limitations](#known-limitations)

---

## Product Overview

InfraSight is a multi-tenant hybrid operations platform designed for teams managing infrastructure across multiple organizations and workspaces. It provides a unified view of infrastructure health across cloud, on-premises, container, and Kubernetes environments.

**Core capabilities:**

| Capability | Status |
|---|---|
| Central inventory catalogue (Servers, DBs, Containers, Kubernetes) | Available |
| Health monitoring with severity alerts | Available |
| Email alert notifications | Available |
| AI operations assistant (OpenClaw) | Available (read-only; can reference previous incidents) |
| Dependency topology graph | Available |
| Automation rule templates | Available (frontend demo execution) |
| Multi-workspace support | Available |
| Local authentication | Available |
| SSO / SAML / OIDC | Configuration UI only — callback validation pending |
| User management | Available |
| Connector onboarding for AWS, Azure, Agent, Docker, and Kubernetes | Available with mocked backend workflows |

InfraSight is designed for **Managed Service Providers (MSPs)** and internal IT operations teams. Each **organization** can contain one or more **workspaces**, and operational data is scoped to the active workspace.

Supported providers are currently represented as resource attributes:

- AWS
- Azure
- On-Prem
- VMware

Supported resource types are:

- Servers
- Databases
- Containers
- Kubernetes

Cloud providers are not separate application modules. For example, AWS EC2 and Azure VM assets both appear in the Servers module and central Inventory with provider metadata.

---

## Sign In and Workspace Selection

[Screenshot: Sign-in page]

### Signing in with local credentials

1. Open the InfraSight dashboard in your browser (default: `http://localhost:3000`).
2. On the sign-in page, enter your **email address** and **password**.
3. If your account has access to multiple workspaces, enter the **Workspace ID** in the workspace field. Leave it blank to use the default workspace (`internal`).
4. Click **Sign In**.

> **Default admin credentials (demo environment):**  
> Email: `admin@infrasight.local`  
> Password: `AdminDemo123!`  
> Change these immediately in any non-demo deployment. See the [Admin Guide](admin-guide.md).

### Switching workspaces after sign-in

Once signed in, you can switch between workspaces using the workspace selector in the bottom-left sidebar:

1. Click the workspace name shown at the bottom of the sidebar.
2. A dropdown appears showing all workspaces you have access to, along with resource counts, alert counts, and a health score.
3. Click any workspace to switch to it. The dashboard reloads with data scoped to that workspace.

### Signing out

Click the **Log out** option at the bottom of the left sidebar.

### SSO sign-in (partially implemented)

> **Note:** SSO configuration can be set up by an administrator, but the actual SAML/OIDC sign-in flow (IdP callback validation) is not yet fully implemented. See [Authentication / SSO](#authentication--sso) and [Known Limitations](#known-limitations).

---

## Dashboard Overview

[Screenshot: Dashboard overview]

The dashboard is the first screen shown after sign-in. It provides a real-time summary of your entire workspace's infrastructure health.

### Summary metric cards

At the top of the dashboard, four metric cards show:

| Card | What it shows |
|---|---|
| **Total Resources** | Total discovered assets in the workspace |
| **Healthy** | Resources currently in a healthy state (percentage) |
| **Running** | Resources in an actively running/available state (percentage) |
| **Open Alerts** | Number of unresolved alerts, split by critical and warning |

**Click any card** to jump to the Inventory view pre-filtered by that metric (e.g., clicking "Open Alerts" shows only resources with active alerts).

### Charts

Three charts give a quick visual breakdown of your infrastructure:

- **Resource Status** (pie chart) — healthy vs. warning vs. critical proportions
- **Resources by Provider** (pie chart) — AWS vs. Azure vs. on-prem split
- **Resources by Type** (bar chart) — counts per resource type (EC2, VM, host, database, container, etc.)

### AI Insights

The AI Insights panel *(requires OpenClaw/OpenAI to be configured)* shows a short natural-language summary of your infrastructure health and any notable alerts. If OpenClaw is not configured, this panel shows a placeholder message.

### Alert Stream

Below the charts, a live alert stream shows the most recent open alerts across your workspace. Each alert card displays:
- Alert title and description
- Severity badge (Critical, Warning, Info)
- Source resource
- Timestamp

### Recent Activity

The Recent Activity panel logs notable events including new alerts triggered, alerts resolved, resources discovered, and monitoring state changes.

### Real-time connection

A green indicator in the top header shows that the dashboard has an active WebSocket connection to the backend. If the indicator is red or absent, the dashboard is operating in offline/cached mode.

---

## Alerts

[Screenshot: Alerts panel]

Navigate to **Alerts** in the sidebar to see the full alert management view.

### Alert summary cards

The top of the Alerts page shows:

- **Open Alerts** — total unresolved alerts
- **Critical** — open alerts at critical severity
- **Warnings** — open alerts at warning severity
- **Total Records** — all alerts ever recorded (open + resolved)

### Alert list

The alert list is split into lifecycle tabs:

- **Open**
- **Acknowledged**
- **Investigating**
- **Resolved**
- **Closed / Incident History**

By default, the page shows only active operational alerts: Open, Acknowledged, Investigating, and Resolved. Closed alerts are removed from the active list and remain available from **Closed / Incident History**.

The main table lists alerts with the following columns:

| Column | Description |
|---|---|
| Title | Alert name |
| Severity | Critical / Warning / Info |
| Status | Open / Acknowledged / Investigating / Resolved / Closed |
| Source | Which connector or monitoring rule generated it |
| Resource | The affected resource |
| Created | When the alert was first triggered |

Opening an active alert shows the same details view used by incident history, including metadata, timeline, investigation notes, root cause, resolution notes, category, success rating, and OpenClaw context where available.

When an alert is closed, InfraSight saves the investigation fields, writes an **Incident closed** timeline entry, removes the alert from the active list, and stores the closed record as a historical incident. Closed incidents open in read-only/history mode and can be reopened with **Reopen Incident**, which changes the status to Investigating, writes an **Incident reopened** timeline entry, and moves the alert back to the active list.

Resolved and closed alerts are also promoted into the incident knowledge base so OpenClaw can compare new incidents with previous successful resolutions.

### Filtering alerts

- Use the **search** field to filter active alerts by alert title, description, resource, source, severity, or status.
- In **Closed / Incident History**, search also matches category, root cause, resolution notes, and incident date text.
- Click the **Refresh** button to reload the latest alerts from the backend.
- If you navigated to Alerts by clicking a dashboard metric card, an active filter banner is shown at the top. Click **Clear filter** to return to all alerts.

### Alert notification routing

The **Alert Routing** panel (visible on the dashboard and Alerts page) shows which notification channels are configured to receive alert deliveries. See [Notifications Settings](#notifications-settings) for configuration.

---

## OpenClaw AI Assistant

[Screenshot: OpenClaw chat interface]

OpenClaw is InfraSight's built-in AI operations assistant. It can answer questions about your infrastructure, summarize alerts, and help you understand incidents — all in plain language.

> **Read-only mode:** OpenClaw can only read and analyze data. It cannot make changes to your infrastructure or acknowledge/resolve alerts.

> **Provider configuration:** OpenClaw can use an OpenAI-compatible provider when configured. If no provider is available, it falls back to a deterministic structured analyst response using the same read-only InfraSight context.

### Opening OpenClaw

- Click **OpenClaw** in the sidebar to open the full-page chat interface.
- A floating assistant button is also available on some dashboard pages.

### Using the chat interface

1. Type your question in the message box at the bottom of the screen.
2. Press **Enter** or click **Send**.
3. OpenClaw streams its response in real time. You can see which internal tools it is calling (e.g., "Fetching open alerts…") as it processes your request.

### Suggested prompts

The left panel shows suggested prompts to help you get started:

- Show top 5 unhealthiest resources
- Summarise all open critical alerts
- Which resources have been unreachable in the last 24 hours?
- What is the current infrastructure health score?
- Are there any database performance issues?
- Which containers have restarted more than 3 times today?
- Explain the most recent critical alert
- What monitoring gaps exist in my infrastructure?

Click any suggested prompt to send it immediately.

### Permissions and mode

OpenClaw operates in **read-only mode**. The permissions panel shows which data categories OpenClaw can access:
- Analyze alerts
- Explain incidents
- Suggest fixes (suggestions only — no execution)
- Correlate infrastructure events
- Cloud and on-prem analysis

### Conversation history

OpenClaw remembers the last 10 messages in your current session. Closing the page clears the conversation.

---

## Connectors and Data Sources

[Screenshot: Connectors page]

Navigate to **Connectors** in the sidebar to set up and monitor your data source connections.

> **Current scope:** Connector onboarding behaves like a production workflow using mocked backend APIs. Connector records, encrypted credential records, sync runs, discovered resources, and imported inventory records are persisted locally. No real AWS, Azure, Docker, Kubernetes, or agent service calls are made yet.

### Supported connector types

| Connector | Connection type | Current workflow |
|---|---|
| **AWS** | API | IAM Role or Access Keys form, save, test connection, discovery, resources |
| **Azure** | API | Tenant, subscription, client ID, client secret, save, test, discovery |
| **Windows/Linux Agent** | Agent | Generate enrollment token, installer commands, connected agents, verify agent |
| **Docker** | Agent / Docker Socket | Local Agent or Docker Socket configuration, save, test, discover containers |
| **Kubernetes** | Helm | Namespace, workspace token, Helm command, verify cluster, discover resources |

### Connector lifecycle

Every connector follows the same lifecycle:

Disconnected -> Configured -> Credentials Saved -> Connection Tested -> Discovery Started -> Resources Imported -> Healthy

The lifecycle strip on the Connectors page shows progress as you save configuration, test the connection, run discovery, and import resources.

### Connector status

The Connectors page shows a summary of connector health:

- **Connected** — connector is actively collecting data
- **Degraded** — connector is partially working (some data may be missing)
- **Failed** — connector cannot reach the data source

For each registered connector you can see:
- Last sync timestamp
- Number of resources collected
- Status message

Click **Refresh** to reload the current health status from the backend.

### Onboarding a connector

Select a connector card at the top of the page. The shared onboarding panel adapts to the selected connector and shows connector-specific fields while preserving the same workflow actions.

**AWS:**
1. Choose **IAM Role** or **Access Keys**.
2. Enter the IAM role ARN and external ID, or enter access key fields.
3. Click **Save**.
4. Click **Test Connection**.
5. Click **Run Discovery**.
6. Click **View Resources** to inspect discovered mock EC2, RDS, and EKS resources.

**Azure:**
1. Enter tenant ID, subscription, client ID, and client secret.
2. Click **Save**.
3. Click **Test Connection**.
4. Click **Run Discovery**.
5. Discovered resources are imported as mock Virtual Machines, Azure SQL, and AKS resources.

**Linux / Windows Agent:**
1. Generate an enrollment token.
2. Use the displayed Windows or Linux installation command.
3. Use **Download Windows Agent** or **Download Linux Agent** placeholders as needed.
4. Review the connected agents list.
5. Click **Verify Agent**.
6. Run discovery to import mock servers, services, and processes.

**Docker:**
1. Choose **Local Agent** or **Docker Socket**.
2. Enter socket or agent configuration.
3. Click **Save**.
4. Click **Test Connection**.
5. Click **Discover Containers** to import mock containers and images.

**Kubernetes:**
1. Enter the namespace and cluster ID.
2. Generate a workspace token.
3. Copy the generated Helm command.
4. Click **Verify Cluster**.
5. Click **Discover Resources** to import mock nodes, pods, and deployments.

After successful discovery, resources are automatically imported into the central Inventory and appear in the relevant Infrastructure pages, Topology, and Dashboard counts.

---

## Servers

[Screenshot: Servers page]

Navigate to **Servers** in the sidebar to view all discovered server resources — including AWS EC2 instances, Azure VMs, and on-premises Linux/Windows hosts.

### Discovery

At the top of the Servers page, click a discovery button to find new servers:

| Button | What it does |
|---|---|
| **Discover Linux** | Scans configured Linux hosts via SSH |
| **Discover Windows** | Scans configured Windows hosts via WinRM |
| **Sync EC2** | Pulls the current EC2 instance list from AWS |
| **Sync Azure VMs** | Pulls the current Azure VM list |

### Server inventory table

Each row shows a server with:

| Column | Description |
|---|---|
| Name | Server or instance name |
| OS | Operating system (from metadata) |
| Provider | AWS / Azure / On-prem |
| Status | Running / Stopped / Terminated |
| Health | Healthy / Warning / Critical |
| CPU | Last collected CPU utilisation |
| Memory | Last collected memory utilisation |
| Disk | Last collected disk utilisation |
| Services | Number of monitored services |
| Alerts | Number of open alerts |
| Last Checked | When metrics were last collected |

### Filtering servers

Use the filter bar above the table to narrow the list:

- **Search** — filter by name, type, or region
- **Provider** — filter by AWS, Azure, or on-prem
- **Status** — filter by running/stopped/terminated
- **Health** — filter by Healthy/Warning/Critical
- **OS** — filter by operating system

Click **Clear filters** to reset all filters.

### Server details

Click any row or the **Details** button to open the server detail view. The detail view shows:

- Full metadata (instance type, private IP, public IP, region)
- Historical metric charts (CPU, memory, disk over time)
- Open alerts for this resource
- Last discovery timestamp

---

## Databases

[Screenshot: Databases page]

Navigate to **Databases** in the sidebar to view all monitored database resources, including AWS RDS instances, PostgreSQL, MySQL, Redis, and MongoDB.

### Discovery

Click **Sync Databases** or **Discover Databases** to refresh database resources already known through cloud inventory or explicitly configured discovery payloads.

> **Partial implementation:** PostgreSQL and MSSQL discovery require host/database configuration in the backend API request. The database page button does not currently collect those connection details, so it may complete without importing new on-prem database assets.

### Database inventory table

Each row shows a database with:

| Column | Description |
|---|---|
| Name | Database name or instance identifier |
| Engine | Database engine (PostgreSQL, MySQL, Redis, etc.) |
| Provider | AWS RDS / Azure SQL / On-prem |
| Status | Available / Stopped / Maintenance |
| Health | Healthy / Warning / Critical |
| Alerts | Number of open alerts |

### Filtering and sorting

The database page supports the same search and filter controls as the Servers page. Additionally, you can **sort** by:
- Health score (worst first by default)
- Status
- Provider

### Database details

Click any row to open the database detail view, showing metadata, health metrics, and open alerts.

---

## Containers

[Screenshot: Containers page]

Navigate to **Containers** in the sidebar to view all discovered Docker containers.

### Discovery

Click **Discover Docker** to refresh the container inventory from any connected Docker hosts.

### Container inventory table

| Column | Description |
|---|---|
| Name | Container name |
| Image | Docker image and tag |
| Host | The host running this container |
| Status | Running / Stopped / Exited |
| Health | Healthy / Warning / Critical |
| CPU | Last CPU utilisation |
| Memory | Last memory utilisation |
| Restarts | How many times the container has restarted |
| Alerts | Open alerts count |
| Last Checked | Last metric collection time |

### Container details

Click a container row to see its full metadata, restart history, and open alerts.

---

## Kubernetes

[Screenshot: Kubernetes page]

Navigate to **Kubernetes** in the sidebar to view Kubernetes workloads across all connected clusters.

### Discovery

Click **Discover Kubernetes** to refresh Kubernetes inventory. In the current release, Kubernetes resources are populated through the mocked connector lifecycle and imported into Inventory after successful discovery.

### Kubernetes resource table

The Kubernetes view shows all resource kinds in a unified table:

| Column | Description |
|---|---|
| Name | Resource name |
| Kind | Pod / Deployment / Service / Ingress / Node |
| Cluster | Cluster name |
| Namespace | Kubernetes namespace |
| Status | Running / Pending / Failed / Available |
| Health | Healthy / Warning / Critical |
| Restarts | Restart count (Pods only) |
| Alerts | Open alerts count |

### Filtering

Filter by namespace, cluster, kind, status, and health using the filter bar.

---

## Topology

[Screenshot: Topology graph]

Navigate to **Topology** in the sidebar to view an interactive dependency graph of your infrastructure.

### What the graph shows

The topology graph displays all resources as nodes and draws edges between resources that have relationships:

| Node color | Resource type |
|---|---|
| Purple | Servers (EC2, VMs, hosts) |
| Blue | Databases (RDS, PostgreSQL, MySQL, Redis, etc.) |
| Orange | Docker containers |
| Light blue | Kubernetes resources (Pods, Deployments, Services) |
| Green | Cloud services (Load balancers, S3, Lambda) |
| Gray | Other / unclassified |

### Node health rings

Each node has a colored ring indicating health status:
- **Green** — Healthy / Running / Active
- **Orange** — Warning state
- **Red** — Critical / Failed / Stopped
- **Dark gray** — Unknown / no data

### Alert badges

Nodes with open alerts show a badge with the alert count. Critical alerts are highlighted.

### Navigating the graph

| Action | How |
|---|---|
| **Pan** | Click and drag on the background |
| **Zoom** | Scroll wheel or pinch gesture |
| **Select a node** | Click any node to open its detail panel |
| **Filter by category** | Use the category chips at the top of the graph |

### Dependency panel

Clicking a node opens a detail panel on the right with four tabs:

| Tab | Contents |
|---|---|
| **Depends On** | Resources this node relies on |
| **Used By** | Resources that rely on this node |
| **Related** | Resources in the same provider/region |
| **Alerts** | Open alerts for this resource |

### Blast radius analysis

The dependency panel shows a **Blast Radius** section, which uses graph traversal to identify which resources would be affected if the selected resource became unavailable. This is useful for impact assessment before maintenance windows.

### Relationship types

- **Solid lines** — discovered relationships (from real `ResourceRelationship` records in the database)
- **Dashed lines** — inferred relationships (automatically computed based on resource types, provider, and region)

---

## Inventory

[Screenshot: Inventory]

Navigate to **Inventory** in the sidebar to see the complete, unified inventory of all resources across all types.

### What is shown

The Inventory view lists every discovered resource regardless of type — servers, databases, containers, Kubernetes resources, and cloud services — in a single table.

### Filtering

| Filter | Options |
|---|---|
| Search | Name, type, or region |
| Provider | AWS / Azure / On-prem |
| Status | Running / Stopped / Available / etc. |
| Health | Healthy / Warning / Critical |
| Resource type | EC2 / VM / Host / Database / Container / etc. |
| Workspace (client) | Filter by workspace (MSP admins only) |

### Resource details

Click any resource to open the **Resource Details** view:

- Full metadata panel (region, provider, resource ID, private/public IP, instance type, OS, etc.)
- Health score
- Open alerts for this resource
- Link to the Topology view for this resource

---

## Automation

[Screenshot: Automation panel]

Navigate to **Automation** in the sidebar to manage automation rules that define conditions and actions for responding to infrastructure events.

> **Note:** Automation is currently **simulated** in the frontend. Rules can be created, configured, and triggered during the browser session, but they are not persisted by a backend automation service and no actions are sent to real systems. Rule execution is shown as a demonstration of the planned workflow.

### Rule categories

Rules are organized into seven categories:

| Category | Example use cases |
|---|---|
| **Infrastructure** | CPU/memory threshold alerts, unreachable host detection |
| **Monitoring** | Reboot recommendations, restart frequency alerts |
| **Database** | Backup failure detection, slow query alerts, replication lag |
| **Security** | Security group change detection, failed login monitoring |
| **Cost Management** | Budget threshold alerts, idle resource detection |
| **Compliance** | Configuration drift detection, CVE alerts |
| **Notifications** | Multi-channel alert forwarding |

### Rule list

The main automation view shows all configured rules. Each rule card displays:
- Rule name and category badge
- Trigger condition summary
- Status (Active / Warning / Disabled / Running)
- Run statistics (total runs, runs today, last run time)

Use the **category filter chips** and the **search bar** to find specific rules.

### Template library

Click **Templates** to browse the pre-built template library (32 templates across 7 technical categories). Click any template card to launch the creation wizard pre-populated with that template's settings.

### Creating a rule

Click **New Rule** to open the four-step creation wizard:

**Step 1 — Choose a template:** Browse and select a template, or click "Start from scratch." Templates are grouped by category (Infrastructure, Database, Container, Kubernetes, AWS, Azure, Security).

**Step 2 — Define conditions:** Set the rule name, category, trigger event, and one or more conditions (e.g., `cpu_percent > 90`). Conditions are combined with AND logic.

**Step 3 — Configure actions:** Add one or more actions the rule will take when conditions are met:
  - **Generate Alert** — creates an alert in InfraSight
  - **Send Notification** — sends a message to a configured notification channel
  - **Create Event** — logs an event record
  - **Log Activity** — writes to the activity log

**Step 4 — Review:** Review the full rule configuration, toggle the rule on or off, and confirm.

### Rule detail view

Click any rule card to open the rule detail view with three tabs:

| Tab | Contents |
|---|---|
| **Overview** | Trigger, conditions, and configured actions |
| **History** | Execution history table (timestamp, status, duration, target, result) |
| **Related Resources** | Resources matched by this rule's conditions |

### Running a rule manually

Click **Run Now** on any rule card or in the rule detail view to simulate an immediate execution. The UI shows the rule as "Running" for approximately 2 seconds, then adds a result to the execution history.

> **Demo note:** Manual execution is simulated in the frontend. No actions are sent to external systems.

---

## Administration

Navigate to **Administration** in the sidebar to access connector onboarding, notification configuration, user management, and authentication settings.

---

### Notifications Settings

[Screenshot: Notification settings]

The Notifications settings page has SMTP configuration, email destination management, and delivery history.

#### SMTP Configuration

Configure the outbound email server that InfraSight uses to send alert notification emails.

| Field | Description |
|---|---|
| Host | Your SMTP server hostname (e.g., `smtp.gmail.com`) |
| Port | SMTP port (default: 587) |
| Username | SMTP login username |
| Password | SMTP login password — **never displayed after saving** |
| Sender Address | The "From" email address for outgoing alerts |
| TLS | Enable STARTTLS encryption (recommended) |

1. Fill in the SMTP fields.
2. Click **Save Configuration**.
3. Click **Test Connection** to verify the server is reachable. The test opens a connection and authenticates without sending any email. The result (success/failure, response time, and any error message) is shown below the form.

> **Security:** Passwords are stored encrypted and are never returned by the API. The settings page shows only whether a password is configured (`has_password: true`), not the actual value. Leave the password field blank when saving to keep an existing password unchanged.

#### Email Destinations

The Email Destinations card manages individual email recipients for alert notifications.

To add a new destination:
1. Enter a **Name** (e.g., "On-call team").
2. Enter the **email address**.
3. Click **Add**.

Each configured destination shows its last test result and timestamp. Use the **Test**, **Disable**, and **Delete** buttons to manage individual destinations.

#### Future Channels

Additional channels such as Slack, Microsoft Teams, and webhooks are planned for future releases. Email is the implemented operational notification channel in the current release.

#### Delivery History

The delivery history table at the bottom of the Notifications page shows a log of all alert notification delivery attempts:

| Column | Description |
|---|---|
| Time | When the delivery was attempted |
| Channel | Name of the destination channel |
| Type | email |
| Destination | Masked destination address or URL |
| Status | Sent / Failed / Skipped |
| Response | Round-trip delivery time in milliseconds |
| Error | Error message if delivery failed |

Click **Show more** to load additional history records.

---

### User Management

[Screenshot: User management page]

Navigate to **Administration → Users** to manage user accounts.

> **Required role:** Admin

#### User roles

| Role | Permissions |
|---|---|
| **Admin** | Full access to all settings, user management, connector configuration |
| **Operator** | Read/write access to alerts, notifications, and resource views |
| **Viewer** | Read-only access to all dashboards and resource views |

#### Inviting a user

1. Fill in the **Email** field (required).
2. Optionally enter a **Display Name**.
3. Select a **Role** (Admin, Operator, or Viewer).
4. Select the **Auth type**: Local (email/password) or SSO (federated login).
5. Select which **Workspaces** the user should have access to.
6. Click **Invite User**.

The new user appears in the user list with a status of **Invited**.

#### Managing existing users

The user list shows all users with their current role, workspace access, auth type, status, and last login time.

| Action | Description |
|---|---|
| **Change role** | Select a new role from the dropdown in the user row |
| **Update workspace access** | Toggle workspace checkboxes in the user row |
| **Disable** | Deactivates the user account (they cannot log in) |
| **Reactivate** | Re-enables a previously disabled account |

> **Note:** Users are never permanently deleted — they are disabled instead. This preserves audit history.

#### SSO and SCIM provisioning

The user management page includes a reference section about SSO-based user provisioning. When SSO is fully configured (see [Authentication / SSO](#authentication--sso)), users can log in with their IdP credentials and be automatically assigned a role based on their IdP group membership.

> **Placeholder:** SCIM provisioning (automated user lifecycle management via an external identity provider) is not yet functional. The data model and configuration options are in place but the active sync is pending implementation.

---

### Authentication / SSO

[Screenshot: Authentication settings page]

Navigate to **Administration → Authentication** to configure Single Sign-On providers.

> **Required role:** Admin

> **Partially implemented:** The SSO provider configuration UI and storage are fully implemented. However, the actual SAML/OIDC sign-in callback (IdP assertion validation) is not yet functional. Configuring an SSO provider here will not enable real SSO logins at this time. See [Known Limitations](#known-limitations).

#### Adding an SSO provider

1. Click **Add Provider**.
2. Select the **Provider type**: SAML or OIDC.
3. Fill in the connection details:

**For SAML:**
| Field | Description |
|---|---|
| Display name | Friendly name shown on the login page |
| Metadata URL | URL to the IdP's SAML metadata XML |
| Entity ID | Your IdP's entity identifier |
| SSO URL | The IdP's SAML SSO endpoint |
| Certificate | The IdP's public signing certificate (masked after saving) |
| Callback URL | InfraSight's callback URL (default: `http://localhost:8000/auth/sso/callback`) |
| Allowed domains | Comma-separated list of email domains permitted to use this provider |
| Default role | Role assigned to new users on first login |

**For OIDC:**
| Field | Description |
|---|---|
| Display name | Friendly name shown on the login page |
| Authorization URL | OIDC authorization endpoint |
| Client ID | Your OIDC application client ID |
| Client Secret | Your OIDC application secret (masked after saving) |
| Allowed domains | Permitted email domains |
| Default role | Role for new users |

4. Configure **role mapping**: Map IdP group names to InfraSight roles (Admin, Operator, Viewer).
5. Toggle **Auto-provisioning** on to automatically create user accounts on first SSO login.
6. Click **Save Provider**.

#### Managing providers

The configured providers list shows each provider with its status, last test result, and certificate/secret configuration status.

| Action | Description |
|---|---|
| **Enable / Disable** | Toggle the provider on or off |
| **Test** | Run a configuration smoke test (validates the stored configuration structure, does not contact the IdP) |
| **Delete** | Remove the provider configuration |

---

## Common Workflows

### Responding to a critical alert

1. Open the **Dashboard**. A red alert badge on the metric card indicates critical alerts.
2. Click the **Open Alerts** card to jump to the Alerts panel filtered to open alerts.
3. Find the critical alert in the list. Note the affected resource name.
4. Navigate to **Inventory** and search for the resource name to see its current health and metrics.
5. Click the resource to open the detail view and review metric history.
6. Open **OpenClaw** and ask: *"Explain the most recent critical alert for [resource name]."*
7. Once the issue is resolved, the alert status will update to **Resolved** automatically (if monitoring rules detect recovery) or it can be noted via the alert detail view.

### Adding a new notification channel

1. Go to **Notifications**.
2. In the Email Destinations section, fill in the channel name and destination email address.
3. Click **Add**.
4. Click **Test** on the new channel to verify delivery.
5. Check **Delivery History** at the bottom of the page to confirm the test was sent.

### Onboarding an AWS connector

1. Navigate to **Administration → Connectors**.
2. Select **AWS**.
3. Choose **IAM Role** or **Access Keys** and complete the form.
4. Click **Save**.
5. Click **Test Connection**.
6. Click **Run Discovery**.
7. Navigate to **Inventory**, **Servers**, **Databases**, **Kubernetes**, or **Topology** to see the imported mocked resources.

### Setting up your first automation rule

1. Navigate to **Automation**.
2. Click **Templates** to browse the template library.
3. Find a relevant template (e.g., "High CPU Utilization Alert").
4. Click the template card and select **Use Template**.
5. Work through the 4-step wizard: confirm the trigger condition, adjust the threshold in Step 2, assign a notification channel in Step 3, and review in Step 4.
6. Click **Create Rule**.
7. The rule appears in the rule list with **Active** status.

### Checking infrastructure dependencies before maintenance

1. Navigate to **Topology**.
2. Find the resource you plan to take offline (use category chips to filter by type).
3. Click the resource node.
4. In the detail panel, review the **Blast Radius** section to see which other resources depend on it.
5. Check the **Depends On** tab to understand what the resource itself relies on.
6. Use this information to sequence your maintenance work appropriately.

---

## Troubleshooting

### "No resources found" — inventory is empty

- Check that at least one connector is configured and in **Connected** status on the Connectors page.
- Run discovery from **Administration → Connectors**. Successful mocked discovery imports resources into Inventory.
- Check the backend logs for discovery errors.

### OpenClaw returns no response or shows a connection error

- Verify that the backend API is running (the real-time connection indicator in the header should be green).
- Confirm that `OPENAI_API_KEY` is set in the backend environment.
- Check that the `OPENCLAW_MODEL` setting matches an available model in your OpenAI account.

### Email alerts are not being delivered

1. Go to **Notifications**.
2. Click **Test** on the relevant email destination.
3. If the test fails, review the error message shown beneath the channel entry.
4. Verify the SMTP configuration using **Test Connection**.
5. Check **Delivery History** for past error messages.

### Test SMTP connection fails

- Verify the hostname and port are correct.
- Ensure the backend server can reach the SMTP host (check firewall rules).
- For Gmail/Microsoft 365: make sure you are using an app-specific password rather than your account password.
- Try disabling TLS if the server does not support STARTTLS on the configured port.

### Dashboard charts are empty

- Charts require at least one connected data source with discovered resources.
- If resources exist but charts are empty, try refreshing the page (the snapshot is loaded on page mount).

### Sign-in fails with "Invalid credentials"

- Double-check your email and password.
- If using the default admin account, confirm the bootstrap credentials in the backend environment (`INFRASIGHT_BOOTSTRAP_ADMIN_EMAIL` / `INFRASIGHT_BOOTSTRAP_ADMIN_PASSWORD`).
- If your account has been disabled, contact an administrator.

---

## Known Limitations

See [known-limitations.md](known-limitations.md) for a full list of features that are partially implemented, simulated, or planned.

**Summary of key limitations:**

- **SSO / SAML / OIDC authentication** — Configuration UI is implemented, but the actual IdP callback (SAML assertion or OIDC token validation) returns a 501 Not Implemented error. SSO logins do not work end-to-end.
- **Automation rule execution** — Rule creation and configuration are browser-session demo state. When you click "Run Now," execution is simulated in the browser. No real actions, alerts, notifications, or persisted automation runs are triggered at this time.
- **SCIM provisioning** — The configuration UI and data model exist, but automated user sync from an external identity provider is not implemented.
- **Dashboard topology preview** — The dashboard shows a "Topology preview coming soon" placeholder. The full interactive topology graph is available on the dedicated Topology page.
- **Filtering is client-side** — All filtering on resource tables works against the snapshot loaded when you first open a page. It does not query the backend in real time. If resources change after the page loads, click **Refresh** (where available) or reload the page.
- **OpenClaw remediation** — By design, OpenClaw is read-only. It can analyze and explain, but cannot acknowledge alerts, modify resources, or trigger infrastructure changes.

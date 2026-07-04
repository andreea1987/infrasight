# InfraSight

Multi-tenant hybrid operations platform for infrastructure monitoring, observability, connector onboarding, and incident management.

InfraSight provides a unified workspace view across cloud, on-premises, container, and Kubernetes resources. It combines a central inventory catalogue, provider-aware infrastructure views, alert management, email notifications, a shared connector framework, topology, automation foundations, and the read-only OpenClaw operations assistant.

---
# InfraSight

Multi-tenant hybrid operations platform for infrastructure monitoring, observability, connector onboarding, and incident management.

InfraSight provides a unified workspace view across cloud, on-premises, container, and Kubernetes resources.

---

## Screenshots

### Dashboard

<img width="3836" height="2108" alt="image" src="https://github.com/user-attachments/assets/3ea94ae2-d89b-440e-99c3-1c555ab17a7e" />


### Inventory

<img width="3840" height="2114" alt="image" src="https://github.com/user-attachments/assets/bb1cddf1-8fbc-4aa5-82bd-b22409fb1174" />


### Connectors

<img width="3822" height="2116" alt="image" src="https://github.com/user-attachments/assets/2d461a2d-3ccd-4921-9d36-cfcfc64a765d" />
<img width="3832" height="2114" alt="image" src="https://github.com/user-attachments/assets/7a3f8491-cddc-4483-bdbc-e076c2caba7c" />



### Topology

<img width="3840" height="2104" alt="image" src="https://github.com/user-attachments/assets/e089c083-e875-4f14-82f0-ed80840145ea" />


### OpenClaw

<img width="3820" height="2116" alt="image" src="https://github.com/user-attachments/assets/b78d517f-ee22-4bb3-aab3-a26ca3a0a443" />


---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | Modular application architecture, navigation model, platform responsibilities, and connector framework |
| [Hybrid Operations Release Notes](docs/hybrid-operations-release-notes.md) | Current release summary, UI improvements, limitations, and next-release roadmap |
| [User Guide](docs/user-guide.md) | How to use the application — dashboards, alerts, topology, automation, settings |
| [Admin Guide](docs/admin-guide.md) | Deployment, environment configuration, connector setup, security hardening |
| [Alert Knowledge Architecture](docs/alert-knowledge-architecture.md) | Alert lifecycle storage, incident knowledge, OpenClaw retrieval, and retention |
| [Known Limitations](docs/known-limitations.md) | Features that are incomplete, simulated, or pending implementation |

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 14+ (or SQLite for local development)

### Backend

```bash
pip install -r requirements.txt

export DATABASE_URL="postgresql://user:password@localhost:5432/infrasight"
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"

uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd web
npm install

# Create web/.env.local:
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Default credentials:**
- Email: `admin@infrasight.local`
- Password: `AdminDemo123!`

> Change these before exposing the application to any network. See the [Admin Guide](docs/admin-guide.md).

### Docker Compose

```bash
docker compose up -d
```

---

## Current Capabilities

| Feature | Status |
|---|---|
| Multi-organization / multi-workspace dashboard | Available |
| Local email/password authentication | Available |
| Central inventory catalogue | Available |
| Provider-aware infrastructure views for Servers, Databases, Containers, Kubernetes, and Topology | Available |
| Connector framework for AWS, Azure, Windows/Linux Agent, Docker, and Kubernetes | Available with mocked backend workflows |
| AWS, Azure, On-Prem, and VMware provider taxonomy | Available as resource attributes |
| Alert management with severity levels | Available |
| Alert history and incident knowledge base | Available |
| Email notifications | Available |
| SMTP configuration management | Available |
| OpenClaw AI assistant (read-only) | Available (requires OpenAI API key) |
| Interactive dependency topology graph | Available |
| Automation rule templates and workflow foundation | UI available; execution is demo |
| User management and basic role checks | Available; full RBAC planned |
| SSO / SAML / OIDC | Planned / partial configuration only |

See [Known Limitations](docs/known-limitations.md) for a full list of incomplete and planned features.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Backend** | Python, FastAPI, SQLAlchemy, PostgreSQL |
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS |
| **AI** | OpenAI API (via OpenClaw assistant) |
| **Infrastructure** | Docker, Docker Compose |

---

## Project Status

Active development — Hybrid Operations Early Access.

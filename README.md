# InfraSight

AI-assisted infrastructure monitoring, observability, and incident management platform.

InfraSight provides a unified view of your infrastructure health across AWS, Azure, Linux/Windows servers, Docker containers, and Kubernetes clusters — with an AI operations assistant (OpenClaw), alert management, notification delivery, and an interactive dependency topology graph.

---

## Documentation

| Document | Description |
|---|---|
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
| Multi-workspace (multi-tenant) dashboard | Available |
| Local email/password authentication | Available |
| AWS EC2 / Azure VM discovery | Available |
| Linux / Windows / Docker / Kubernetes discovery | Available |
| Alert management with severity levels | Available |
| Alert history and incident knowledge base | Available |
| Email / Slack / Teams notifications | Available |
| SMTP configuration management | Available |
| OpenClaw AI assistant (read-only) | Available (requires OpenAI API key) |
| Interactive dependency topology graph | Available |
| Automation rule templates (32 templates) | UI available; execution is demo |
| User management and role-based access | Available |
| SSO / SAML / OIDC | Configuration UI available; callback pending |

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

Active development — Early Access.

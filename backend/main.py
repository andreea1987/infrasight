from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import HTMLResponse
from contextlib import asynccontextmanager

from backend.database.base import Base
from backend.database.schema import ensure_multi_tenant_schema
from backend.database.session import SessionLocal, engine

# ORM model imports — required so SQLAlchemy creates all tables on startup
from backend.models.user import User
from backend.models.resource import Resource
from backend.models.metric import MetricSample
from backend.models.alert import Alert, AlertHistory, IncidentKnowledge, OpenClawResolutionLibrary
from backend.models.ai_provider import OpenClawAiProvider
from backend.models.connector import ConnectorRegistration
from backend.models.discovery import (
    DiscoveryRun,
    MonitoringProfileAssignment,
    ResourceRelationship,
    ResourceTag,
)
from backend.models.notification import AlertDelivery, NotificationChannel, SmtpConfig
from backend.models.openclaw import OpenClawAuditLog
from backend.models.organization import IntegrationSecret, Organization, OrganizationMembership, SsoProviderConfig
from backend.models.telemetry import LogEntry, SyncRun

# API routers — each router owns a URL prefix and a logical domain
from backend.api.routes.aws import router as aws_router
from backend.api.routes.ai_providers import router as ai_providers_router
from backend.api.routes.auth import router as auth_router
from backend.api.routes.azure import router as azure_router
from backend.api.routes.connectors import router as connectors_router
from backend.api.routes.discovery import router as discovery_router
from backend.api.routes.inventory import router as inventory_router
from backend.api.routes.monitoring import router as monitoring_router
from backend.api.routes.notifications import router as notifications_router
from backend.api.routes.onprem import router as onprem_router
from backend.api.routes.openclaw import router as openclaw_router
from backend.api.routes.organizations import router as organizations_router
from backend.api.routes.realtime import router as realtime_router
from backend.api.routes.topology import router as topology_router
from backend.api.routes.users import router as users_router
from backend.workers.monitoring_worker import monitoring_worker
from fastapi.middleware.cors import CORSMiddleware


# Create all database tables and apply multi-tenant schema extensions on startup
Base.metadata.create_all(bind=engine)
ensure_multi_tenant_schema(engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background monitoring worker that periodically collects metrics and evaluates alerts
    monitoring_worker.start()
    yield
    await monitoring_worker.stop()


app = FastAPI(lifespan=lifespan)

# Register all domain routers
app.include_router(aws_router)
app.include_router(ai_providers_router)
app.include_router(auth_router)
app.include_router(azure_router)
app.include_router(connectors_router)
app.include_router(discovery_router)
app.include_router(inventory_router)
app.include_router(monitoring_router)
app.include_router(notifications_router)
app.include_router(onprem_router)
app.include_router(openclaw_router)
app.include_router(organizations_router)
app.include_router(realtime_router)
app.include_router(topology_router)
app.include_router(users_router)

templates = Jinja2Templates(directory="backend/templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    """Server-side rendered landing page showing synchronized EC2 inventory."""
    db = SessionLocal()

    try:
        resources = (
            db.query(Resource)
            .filter(
                Resource.provider == "aws",
                Resource.resource_type == "ec2",
            )
            .all()
        )

        instances = [
            {
                "name": resource.name,
                "instance_id": resource.resource_id,
                "instance_type": (resource.metadata_json or {}).get("instance_type"),
                "state": resource.status,
                "private_ip": (resource.metadata_json or {}).get("private_ip"),
                "public_ip": (resource.metadata_json or {}).get("public_ip"),
                "region": resource.region,
            }
            for resource in resources
        ]
    finally:
        db.close()

    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "instances": instances
        }
    )


@app.get("/health")
def health():
    """Liveness probe used by Docker, load balancers, and monitoring checks."""
    return {"status": "healthy"}

"""
Discovery API Routes
====================
Orchestrates infrastructure discovery runs and exposes discovery metadata.

Data flow:
  Client calls POST /discovery/run with desired discovery types
    → run_discovery() dispatches to the relevant provider service
       (AWS EC2, Azure VM, on-prem local)
    → Each discovered asset is upserted as a Resource row
    → Relationships and monitoring profiles are recorded
    → A DiscoveryRun record tracks status, counts, and errors
    → 'discovery_run_complete' WebSocket event is broadcast to the dashboard

Supported discovery types are returned by GET /discovery/types and include
AWS EC2, Azure VM, on-prem local, Docker containers, and databases.
"""

from fastapi import APIRouter, Depends

from backend.database.session import SessionLocal
from backend.discovery.connectors import supported_discovery_types
from backend.realtime.connection_manager import manager
from backend.schemas.discovery import DiscoveryRunRequest, DiscoveryRunResponse, DiscoverySummaryResponse
from backend.services.discovery_service import discovery_summary, run_discovery
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("/types")
def discovery_types():
    """
    Return the list of discovery types the backend currently supports, along
    with capability flags (agent-ready, event-driven-ready, Kubernetes-ready).
    Used by the dashboard Discovery panel to populate the type selector.
    """
    return {
        "supported_types": supported_discovery_types(),
        "primary_architecture": "api_ssh_winrm_docker_database",
        "snmp_only_primary": False,
        "event_driven_ready": True,
        "agent_ready": True,
        "kubernetes_ready": True,
    }


@router.post("/run", response_model=list[DiscoveryRunResponse])
async def post_discovery_run(
    payload: DiscoveryRunRequest,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Execute one or more discovery types and return the resulting DiscoveryRun records.
    Triggers asset upsert, relationship mapping, and monitoring profile assignment.
    Broadcasts 'discovery_run_complete' to all connected WebSocket clients when done.
    Requires the 'discovery:run' permission.
    """
    require_permission(context, "discovery:run")
    db = SessionLocal()

    try:
        result = run_discovery(
            db,
            discovery_types=payload.discovery_types,
            trigger=payload.trigger,
            config=payload.config,
            tenant_id=context.tenant_id,
            organization_id=payload.organization_id or context.organization_id,
        )
        await manager.broadcast_event("discovery_run_complete", {"runs": result})
        return result
    finally:
        db.close()


@router.get("/summary", response_model=DiscoverySummaryResponse)
def get_discovery_summary(context: TenantContext = Depends(get_tenant_context)):
    """
    Return a discovery coverage summary: supported types, recent run history,
    topology relationship count, and monitoring profile assignments.
    Also used by the OpenClaw discovery_summary tool.
    """
    db = SessionLocal()

    try:
        return discovery_summary(db, tenant_id=context.tenant_id)
    finally:
        db.close()

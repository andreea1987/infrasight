"""
OpenClaw API Routes
===================
Exposes the OpenClaw AI assistant over both REST and WebSocket.

Data flow overview:
  Dashboard / client
    → POST /openclaw/chat          (REST, returns full answer)
    → WS  /openclaw/ws/chat        (WebSocket, streams token events)
    → GET  /openclaw/tools/*       (direct tool endpoints for UI widgets)
    → POST /openclaw/tools/services/restart  (blocked; OpenClaw is read-only)
    → GET  /openclaw/audit         (audit trail for compliance)

All chat and tool calls are recorded in the OpenClawAuditLog table so that
every AI-driven action can be reviewed, attributed, and replayed.
"""

from fastapi import APIRouter, Depends, Header, WebSocket, WebSocketDisconnect

from backend.config.settings import OPENCLAW_MODE, OPENCLAW_PERMISSIONS
from backend.database.session import SessionLocal
from backend.models.openclaw import OpenClawAuditLog
from backend.schemas.openclaw import (
    OpenClawAuditLogResponse,
    OpenClawChatRequest,
    OpenClawChatResponse,
    RestartServiceRequest,
)
from backend.services.openclaw_audit import record_openclaw_audit_event
from backend.services.openclaw_service import complete_openclaw_chat, stream_openclaw_chat
from backend.services.openclaw_tools import (
    OPENCLAW_TOOL_DEFINITIONS,
    analyze_alerts,
    analyze_infrastructure_health,
    correlate_infrastructure_events,
    explain_incidents,
    get_alerts,
    get_copilot_context,
    get_docker_container_status,
    get_ec2_inventory,
    get_system_metrics,
    suggest_fixes,
)
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter(prefix="/openclaw", tags=["openclaw"])


@router.get("/status")
def openclaw_status(context: TenantContext = Depends(get_tenant_context)):
    """
    Return the current OpenClaw configuration: execution mode, active permissions,
    available tools, and whether direct cloud credentials are in use (they are not).
    Used by the dashboard to gate UI features based on what OpenClaw can do.
    """
    return {
        "service": "OpenClaw",
        "mode": OPENCLAW_MODE,
        "permissions": OPENCLAW_PERMISSIONS,
        "tools": OPENCLAW_TOOL_DEFINITIONS,
        "backend_only": True,
        "direct_cloud_credentials": False,
        "tenant_id": context.tenant_id,
        "organization_id": context.organization_id,
    }


@router.post("/chat", response_model=OpenClawChatResponse)
async def openclaw_chat(
    payload: OpenClawChatRequest,
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Non-streaming chat endpoint.  Executes all relevant tools, composes the
    answer via the LLM (or fallback), and returns the full response at once.
    Requires the 'openclaw:chat' permission.
    """
    require_permission(context, "openclaw:chat")
    db = SessionLocal()

    try:
        return await complete_openclaw_chat(
            db,
            message=payload.message,
            conversation_id=payload.conversation_id,
            history=payload.history,
            actor=x_openclaw_operator or "dashboard",
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
    finally:
        db.close()


@router.websocket("/ws/chat")
async def openclaw_chat_stream(websocket: WebSocket):
    """
    WebSocket streaming chat endpoint.

    The client sends JSON messages matching OpenClawChatRequest and receives a
    sequence of typed event dicts: start → tool_call → tool_result → token* → done.
    Tenant and organization IDs are read from headers or query params so that
    WebSocket connections can carry multi-tenant context without HTTP middleware.
    """
    await websocket.accept()
    # Prefer headers (set by the dashboard); fall back to query params for browser WebSocket clients
    tenant_id = websocket.headers.get("x-infrasight-tenant") or websocket.query_params.get("tenant") or "internal"
    organization_id = (
        websocket.headers.get("x-infrasight-organization")
        or websocket.query_params.get("organization")
        or tenant_id
    )
    db = SessionLocal()

    try:
        while True:
            payload = await websocket.receive_json()
            request = OpenClawChatRequest(**payload)

            async for event in stream_openclaw_chat(
                db,
                message=request.message,
                conversation_id=request.conversation_id,
                history=request.history,
                actor="dashboard",
                tenant_id=tenant_id,
                organization_id=organization_id,
            ):
                await websocket.send_json(event)
    except WebSocketDisconnect:
        return
    except Exception:
        await websocket.send_json(
            {
                "type": "error",
                "message": "OpenClaw stream failed. Check backend logs for details.",
            }
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Direct tool endpoints — these expose individual OpenClaw tools as REST
# endpoints so UI widgets can call them without going through the chat flow.
# Each endpoint records an audit event for traceability.
# ---------------------------------------------------------------------------

@router.get("/tools/ec2-inventory")
def openclaw_ec2_inventory(
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """Return synchronized EC2 inventory for the tenant."""
    db = SessionLocal()

    try:
        result = get_ec2_inventory(db, tenant_id=context.tenant_id)
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="ec2_inventory",
            response_payload={"count": result["count"]},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/docker/status")
def openclaw_docker_status(
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """Return local Docker container status via the backend host's Docker CLI."""
    db = SessionLocal()

    try:
        result = get_docker_container_status()
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="docker_container_status",
            response_payload={"count": result.get("count", 0), "message": result.get("message")},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/system/metrics")
def openclaw_system_metrics(
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """Return the InfraSight monitoring summary and latest per-resource metrics."""
    db = SessionLocal()

    try:
        result = get_system_metrics(db, tenant_id=context.tenant_id)
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="system_metrics",
            response_payload={"summary": result["summary"]},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/alerts")
def openclaw_alerts(
    status: str = "open",
    severity: str | None = None,
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """Return alert records filtered by status and optional severity."""
    db = SessionLocal()

    try:
        result = get_alerts(db, status=status, severity=severity, tenant_id=context.tenant_id)
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="alerts",
            request_payload={"status": status, "severity": severity},
            response_payload={"count": result["count"]},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/alerts/analyse")
def openclaw_analyze_alerts(
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Analyse all non-resolved alerts: aggregate by severity, source, and provider.
    Requires the 'analyze_alerts' OpenClaw permission.
    """
    db = SessionLocal()

    try:
        result = analyze_alerts(db, tenant_id=context.tenant_id)
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="analyze_alerts",
            response_payload={
                "active_alerts": result.get("open_or_acknowledged_alerts", 0),
                "by_severity": result.get("by_severity", {}),
            },
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/incidents/explain")
def openclaw_explain_incidents(
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Generate incident explanations for all open alerts using resource and metric context.
    Requires the 'explain_incidents' OpenClaw permission.
    """
    db = SessionLocal()

    try:
        result = explain_incidents(db, tenant_id=context.tenant_id)
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="explain_incidents",
            response_payload={"count": result.get("count", 0)},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/infrastructure/analyse")
def openclaw_infrastructure_analysis(
    resource_query: str | None = None,
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Analyse resource health from metrics, alerts, and resolved historical incidents.
    This endpoint is read-only and returns evidence, suggested checks, and confidence.
    """
    db = SessionLocal()

    try:
        result = analyze_infrastructure_health(
            db,
            resource_query=resource_query,
            tenant_id=context.tenant_id,
        )
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="infrastructure_health_analysis",
            request_payload={"resource_query": resource_query},
            response_payload={"analysis_count": result.get("analysis_count", 0)},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/fixes/suggest")
def openclaw_suggest_fixes(
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Suggest safe remediation steps for each open alert.
    Requires the 'suggest_fixes' OpenClaw permission.
    """
    db = SessionLocal()

    try:
        result = suggest_fixes(db, tenant_id=context.tenant_id)
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="suggest_fixes",
            response_payload={"count": result.get("count", 0)},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/events/correlate")
def openclaw_correlate_events(
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Correlate alerts with resources and recent metrics to surface related events.
    Requires the 'correlate_infrastructure_events' OpenClaw permission.
    """
    db = SessionLocal()

    try:
        result = correlate_infrastructure_events(db, tenant_id=context.tenant_id)
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="correlate_infrastructure_events",
            response_payload={"correlation_count": result.get("correlation_count", 0)},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/tools/copilot/context")
def openclaw_copilot_context(
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Build cloud/on-prem copilot context: resource counts, monitoring summary,
    and local system snapshot.
    Requires the 'cloud_onprem_copilot' OpenClaw permission.
    """
    db = SessionLocal()

    try:
        result = get_copilot_context(db, tenant_id=context.tenant_id)
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="cloud_onprem_copilot_context",
            response_payload={"resources": result.get("resources", {})},
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.post("/tools/services/restart")
def openclaw_restart_service(
    payload: RestartServiceRequest,
    x_openclaw_operator: str | None = Header(default="dashboard"),
    context: TenantContext = Depends(get_tenant_context),
):
    """Block service restarts because OpenClaw is read-only."""
    require_permission(context, "openclaw:chat")
    db = SessionLocal()

    try:
        result = {
            "status": "blocked",
            "message": "OpenClaw is read-only. Service restarts are not executed.",
            "service_name": payload.service_name,
            "mode": OPENCLAW_MODE,
        }
        record_openclaw_audit_event(
            db,
            event_type="tool_endpoint",
            status=result["status"],
            actor=x_openclaw_operator or "dashboard",
            tool_name="restart_approved_service",
            request_payload=payload.model_dump(),
            response_payload=result,
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        return result
    finally:
        db.close()


@router.get("/audit", response_model=list[OpenClawAuditLogResponse])
def openclaw_audit_log(
    limit: int = 100,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Return the most-recent OpenClaw audit events for the tenant.
    Capped at 500 records per request.  Used for compliance review and
    debugging AI-driven operations.
    """
    db = SessionLocal()

    try:
        return (
            db.query(OpenClawAuditLog)
            .filter(OpenClawAuditLog.tenant_id == context.tenant_id)
            .order_by(OpenClawAuditLog.created_at.desc())
            .limit(min(limit, 500))
            .all()
        )
    finally:
        db.close()

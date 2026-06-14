"""
Monitoring API Routes
=====================
Manages metric ingestion, alert lifecycle, and operational summaries.

Data flow:
  Background worker (monitoring_worker) calls POST /monitoring/collect on each
  interval → collect_resource_metrics() reads live data from connectors and
  writes MetricSample rows → evaluate_alerts() compares samples against
  thresholds and creates/updates Alert rows → real-time events are broadcast
  over WebSocket so connected dashboards update immediately.

Alert lifecycle: open → acknowledged → investigating → resolved → closed
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime

from backend.database.session import SessionLocal
from backend.models.alert import Alert
from backend.models.metric import MetricSample
from backend.models.resource import Resource
from backend.realtime.connection_manager import manager
from backend.schemas.monitoring import (
    AlertStatusUpdate,
    AlertResponse,
    MetricSampleCreate,
    MetricSampleResponse,
    MonitoringSummaryResponse,
)
from backend.services.monitoring_service import (
    alert_history_snapshot,
    collect_resource_metrics,
    create_metric_sample,
    evaluate_alerts,
    monitoring_summary,
    promote_alert_to_incident_knowledge,
    record_alert_history,
    serialize_alert,
    serialize_metric,
)
from backend.services.unified_monitoring_service import (
    collect_unified_monitoring,
    operational_summary,
)
from backend.services.notification_service import notify_alert
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter()


@router.get("/monitoring/summary", response_model=MonitoringSummaryResponse)
def get_monitoring_summary(context: TenantContext = Depends(get_tenant_context)):
    """
    Return aggregate health metrics for the tenant: resource count, healthy
    percentage, running percentage, and open/critical/warning alert counts.
    """
    db = SessionLocal()

    try:
        return monitoring_summary(db, tenant_id=context.tenant_id)
    finally:
        db.close()


@router.post("/monitoring/collect")
async def collect_monitoring_data(context: TenantContext = Depends(get_tenant_context)):
    """
    Trigger an immediate metric collection and alert evaluation cycle.
    Normally invoked by the background monitoring_worker; can also be called
    manually from the dashboard Sync menu.
    Broadcasts a 'monitoring_collect_complete' event to all connected WebSocket clients.
    Requires the 'monitoring:collect' permission.
    """
    require_permission(context, "monitoring:collect")
    db = SessionLocal()

    try:
        metrics_result = collect_resource_metrics(
            db,
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        alerts_result = evaluate_alerts(
            db,
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )

        result = {
            "status": "success",
            "metrics": metrics_result,
            "alerts": alerts_result,
        }
        await manager.broadcast_event("monitoring_collect_complete", result)

        return result
    finally:
        db.close()


@router.post("/monitoring/unified/collect")
async def collect_unified_monitoring_data(
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Run a unified monitoring collection pass that aggregates data from all
    active connectors (cloud, on-prem, containers, databases).
    Broadcasts 'unified_monitoring_collect_complete' when done.
    Requires the 'monitoring:collect' permission.
    """
    require_permission(context, "monitoring:collect")
    db = SessionLocal()

    try:
        result = collect_unified_monitoring(
            db,
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
        await manager.broadcast_event("unified_monitoring_collect_complete", result)

        return result
    finally:
        db.close()


@router.get("/monitoring/operational-summary")
def get_operational_summary(context: TenantContext = Depends(get_tenant_context)):
    """
    Return a cross-provider operational summary: total resources, open alerts
    grouped by connector and severity, and readiness flags for agent/Kubernetes.
    Used by OpenClaw and the dashboard Overview page.
    """
    db = SessionLocal()

    try:
        return operational_summary(db, tenant_id=context.tenant_id)
    finally:
        db.close()


@router.post("/monitoring/metrics", response_model=MetricSampleResponse)
def create_metric(
    payload: MetricSampleCreate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Ingest a single metric sample for a known resource.
    Returns 404 if the resource does not belong to the tenant.
    Requires the 'monitoring:collect' permission.
    """
    require_permission(context, "monitoring:collect")
    db = SessionLocal()

    try:
        resource = (
            db.query(Resource)
            .filter(Resource.id == payload.resource_id, Resource.tenant_id == context.tenant_id)
            .first()
        )
        if not resource:
            raise HTTPException(status_code=404, detail="Resource not found")
        return create_metric_sample(
            db,
            payload,
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
    finally:
        db.close()


@router.get("/monitoring/metrics", response_model=list[MetricSampleResponse])
def get_metrics(
    resource_id: int | None = None,
    metric_name: str | None = None,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Return up to 250 most-recent metric samples, optionally filtered by
    resource ID and/or metric name.
    """
    db = SessionLocal()

    try:
        query = db.query(MetricSample).filter(MetricSample.tenant_id == context.tenant_id)

        if resource_id:
            query = query.filter(MetricSample.resource_id == resource_id)

        if metric_name:
            query = query.filter(MetricSample.metric_name == metric_name)

        metrics = query.order_by(MetricSample.collected_at.desc()).limit(250).all()

        return [serialize_metric(metric) for metric in metrics]
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Alert lifecycle endpoints
# ---------------------------------------------------------------------------

@router.get("/alerts", response_model=list[AlertResponse])
def get_alerts(
    status: str = "open",
    severity: str | None = None,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    List alerts for the tenant, filtered by status
    (open/acknowledged/investigating/resolved/closed/active/all)
    and optional severity (critical/warning/info).
    """
    db = SessionLocal()

    try:
        query = db.query(Alert).filter(Alert.tenant_id == context.tenant_id)

        if status == "active":
            query = query.filter(Alert.status.in_(["open", "acknowledged", "investigating", "resolved"]))
        elif status != "all":
            query = query.filter(Alert.status == status)

        if severity:
            query = query.filter(Alert.severity == severity)

        alerts = query.order_by(Alert.created_at.desc()).all()

        return [serialize_alert(alert) for alert in alerts]
    finally:
        db.close()


@router.get("/alerts/resolution-library", response_model=list[AlertResponse])
def get_resolution_library(context: TenantContext = Depends(get_tenant_context)):
    """
    Return resolved and closed alerts as reusable incident knowledge.

    The library is read-only from this endpoint and feeds the dashboard's
    similar-incident and successful-resolution recommendations.
    """
    db = SessionLocal()

    try:
        alerts = (
            db.query(Alert)
            .filter(Alert.tenant_id == context.tenant_id, Alert.status.in_(["resolved", "closed"]))
            .order_by(Alert.resolved_at.desc().nullslast(), Alert.updated_at.desc())
            .all()
        )
        return [serialize_alert(alert) for alert in alerts]
    finally:
        db.close()


@router.post("/alerts/{alert_id}/ack", response_model=AlertResponse)
async def acknowledge_alert(alert_id: int, context: TenantContext = Depends(get_tenant_context)):
    """
    Acknowledge an open alert — transitions it from 'open' to 'acknowledged'.
    Broadcasts 'alert_acknowledged' to all WebSocket clients.
    Requires the 'alerts:write' permission.
    """
    require_permission(context, "alerts:write")
    db = SessionLocal()

    try:
        alert = db.query(Alert).filter(Alert.id == alert_id, Alert.tenant_id == context.tenant_id).first()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        alert = _apply_alert_status(db, alert, AlertStatusUpdate(status="acknowledged"), context.actor)
        db.commit()
        db.refresh(alert)
        serialized_alert = serialize_alert(alert)
        await manager.broadcast_event("alert_acknowledged", serialized_alert)

        return serialized_alert
    finally:
        db.close()


@router.post("/alerts/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(alert_id: int, context: TenantContext = Depends(get_tenant_context)):
    """
    Resolve an alert — transitions it to 'resolved' and stamps the resolved_at time.
    Broadcasts 'alert_resolved' to all WebSocket clients.
    Requires the 'alerts:write' permission.
    """
    require_permission(context, "alerts:write")
    db = SessionLocal()

    try:
        alert = db.query(Alert).filter(Alert.id == alert_id, Alert.tenant_id == context.tenant_id).first()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        alert = _apply_alert_status(db, alert, AlertStatusUpdate(status="resolved"), context.actor)
        db.commit()
        db.refresh(alert)
        serialized_alert = serialize_alert(alert)
        await manager.broadcast_event("alert_resolved", serialized_alert)

        return serialized_alert
    finally:
        db.close()


@router.put("/alerts/{alert_id}/status", response_model=AlertResponse)
async def update_alert_status(
    alert_id: int,
    payload: AlertStatusUpdate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Update alert workflow state and incident knowledge fields.

    Inputs:
    - status: open, acknowledged, investigating, resolved or closed
    - investigation notes, resolution notes, root cause, category and rating

    Safety:
    - This only updates alert/incident records. It never resolves
      infrastructure or performs OpenClaw remediation.
    """
    require_permission(context, "alerts:write")
    db = SessionLocal()

    try:
        alert = db.query(Alert).filter(Alert.id == alert_id, Alert.tenant_id == context.tenant_id).first()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        alert = _apply_alert_status(db, alert, payload, context.actor)
        db.commit()
        db.refresh(alert)
        serialized_alert = serialize_alert(alert)
        await manager.broadcast_event("alert_status_updated", serialized_alert)

        return serialized_alert
    finally:
        db.close()


def _apply_alert_status(db, alert: Alert, payload: AlertStatusUpdate, actor: str):
    """
    Apply alert lifecycle and incident-knowledge updates in one place.

    Inputs:
    - existing Alert row
    - requested status plus optional notes/root cause/resolution details
    - actor performing the update

    Outputs:
    - mutated Alert row ready for commit

    Assumption:
    - Status updates are record-only workflow changes. They never make
      infrastructure changes and never allow OpenClaw to auto-remediate.
    """
    allowed = {"open", "acknowledged", "investigating", "resolved", "closed"}
    status = payload.status.lower().strip()
    if status not in allowed:
        raise HTTPException(status_code=422, detail=f"Unsupported alert status: {payload.status}")

    before = alert_history_snapshot(alert)
    now = datetime.utcnow()
    alert.status = status
    alert.updated_at = now

    if status == "acknowledged" and not alert.acknowledged_at:
        alert.acknowledged_at = now
    previous_status = before.get("status")
    reopened = previous_status == "closed" and status == "investigating"

    if status == "investigating" and (reopened or not alert.investigating_at):
        alert.investigating_at = now
    if status == "resolved" and not alert.resolved_at:
        alert.resolved_at = now
    if status == "closed":
        if not alert.resolved_at:
            alert.resolved_at = now
        if not alert.closed_at:
            alert.closed_at = now
        if not alert.closed_by:
            alert.closed_by = actor

    if payload.investigation_notes is not None:
        alert.investigation_notes = payload.investigation_notes
    if payload.resolution_notes is not None:
        alert.resolution_notes = payload.resolution_notes
    if payload.root_cause is not None:
        alert.root_cause = payload.root_cause
    if payload.resolution_category is not None:
        alert.resolution_category = payload.resolution_category
    if payload.success_rating is not None:
        alert.success_rating = max(1, min(5, payload.success_rating))
    if status in {"resolved", "closed"}:
        alert.resolved_by = payload.resolved_by or actor

    metadata = alert.metadata_json or {}
    timeline = list(metadata.get("timeline", []))
    if reopened:
        timeline_event = "Incident reopened"
        event_type = "reopened"
        message = "Incident reopened."
    elif status == "closed":
        timeline_event = "Incident closed"
        event_type = "closed"
        message = "Incident closed."
    else:
        timeline_event = f"status_changed_to_{status}"
        event_type = "status_changed"
        message = f"Alert status changed to {status}."
    timeline.append({
        "at": now.isoformat(),
        "actor": actor,
        "event": timeline_event,
    })
    alert.metadata_json = {
        **metadata,
        "timeline": timeline[-25:],
    }

    record_alert_history(
        db,
        alert=alert,
        event_type=event_type,
        actor=actor,
        from_status=before.get("status"),
        to_status=status,
        message=message,
        before=before,
    )
    if status in {"resolved", "closed"}:
        promote_alert_to_incident_knowledge(db, alert, actor=actor)

    return alert


@router.post("/alerts/{alert_id}/notify")
async def notify_alert_now(alert_id: int, context: TenantContext = Depends(get_tenant_context)):
    """
    Immediately send notifications for an alert through all enabled channels
    (email, Slack, Teams).  Useful for escalation or testing.
    Broadcasts 'alert_notification_sent' when complete.
    Requires the 'notifications:write' permission.
    """
    require_permission(context, "notifications:write")
    db = SessionLocal()

    try:
        alert = db.query(Alert).filter(Alert.id == alert_id, Alert.tenant_id == context.tenant_id).first()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        deliveries = notify_alert(db, alert)
        result = {
            "status": "success",
            "deliveries": deliveries,
        }
        await manager.broadcast_event("alert_notification_sent", result)

        return result
    finally:
        db.close()

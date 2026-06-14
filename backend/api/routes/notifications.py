"""
Notifications API Routes
========================
Manages notification channels (email, Slack, Teams) and exposes the alert
delivery history.

Alert → notification flow:
  Alert is created/updated → notify_alert() iterates enabled channels
  → sends via SMTP / webhook → writes an AlertDelivery row per attempt
  → delivery history is visible in the dashboard Notification Centre.

Channel management is write-gated ('notifications:write' permission) so that
tenants cannot reconfigure delivery targets without authorization.
"""

from fastapi import APIRouter, Depends, HTTPException

from backend.database.session import SessionLocal
from backend.models.notification import AlertDelivery, NotificationChannel
from backend.schemas.notification import (
    AlertDeliveryResponse,
    NotificationChannelCreate,
    NotificationChannelResponse,
    SmtpConfigResponse,
    SmtpConfigUpdate,
)
from backend.services.notification_service import (
    create_channel,
    delete_channel,
    get_smtp_config,
    save_smtp_config,
    send_test_notification,
    serialize_channel,
    serialize_delivery,
    set_channel_enabled,
    test_smtp_connection,
)
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter()


@router.get("/notifications/channels", response_model=list[NotificationChannelResponse])
def get_notification_channels(context: TenantContext = Depends(get_tenant_context)):
    """Return all notification channels configured for the tenant."""
    db = SessionLocal()

    try:
        channels = (
            db.query(NotificationChannel)
            .filter(NotificationChannel.tenant_id == context.tenant_id)
            .order_by(NotificationChannel.created_at.desc())
            .all()
        )
        return [serialize_channel(channel) for channel in channels]
    finally:
        db.close()


@router.delete("/notifications/channels/{channel_id}")
def remove_notification_channel(
    channel_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Delete a notification destination so it no longer receives alerts."""
    require_permission(context, "notifications:write")
    db = SessionLocal()

    try:
        result = delete_channel(db, channel_id, tenant_id=context.tenant_id)

        if not result:
            raise HTTPException(status_code=404, detail="Notification channel not found")

        return result
    finally:
        db.close()


@router.post("/notifications/channels", response_model=NotificationChannelResponse)
def add_notification_channel(
    payload: NotificationChannelCreate,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Create a new notification channel (email, Slack, or Teams).
    Returns 400 if the channel type or target config is invalid.
    Requires the 'notifications:write' permission.
    """
    require_permission(context, "notifications:write")
    db = SessionLocal()

    try:
        try:
            return create_channel(
                db,
                payload,
                tenant_id=context.tenant_id,
                organization_id=context.organization_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        db.close()


@router.post("/notifications/channels/{channel_id}/enable", response_model=NotificationChannelResponse)
def enable_notification_channel(
    channel_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Enable a notification channel so it receives future alert deliveries."""
    require_permission(context, "notifications:write")
    db = SessionLocal()

    try:
        channel = set_channel_enabled(db, channel_id, True, tenant_id=context.tenant_id)

        if not channel:
            raise HTTPException(status_code=404, detail="Notification channel not found")

        return channel
    finally:
        db.close()


@router.post("/notifications/channels/{channel_id}/disable", response_model=NotificationChannelResponse)
def disable_notification_channel(
    channel_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """Disable a notification channel without deleting it."""
    require_permission(context, "notifications:write")
    db = SessionLocal()

    try:
        channel = set_channel_enabled(db, channel_id, False, tenant_id=context.tenant_id)

        if not channel:
            raise HTTPException(status_code=404, detail="Notification channel not found")

        return channel
    finally:
        db.close()


@router.post("/notifications/channels/{channel_id}/test")
def test_notification_channel(
    channel_id: int,
    context: TenantContext = Depends(get_tenant_context),
):
    """
    Send a test notification through the specified channel.
    Useful for validating SMTP credentials or webhook URLs after configuration.
    Requires the 'notifications:write' permission.
    """
    require_permission(context, "notifications:write")
    db = SessionLocal()

    try:
        channel = (
            db.query(NotificationChannel)
            .filter(NotificationChannel.id == channel_id, NotificationChannel.tenant_id == context.tenant_id)
            .first()
        )

        if not channel:
            raise HTTPException(status_code=404, detail="Notification channel not found")

        return send_test_notification(db, channel)
    finally:
        db.close()


@router.get("/notifications/smtp-config", response_model=SmtpConfigResponse)
def get_smtp_configuration(context: TenantContext = Depends(get_tenant_context)):
    """Return the SMTP configuration for the tenant. Password is never returned."""
    db = SessionLocal()
    try:
        return get_smtp_config(db, tenant_id=context.tenant_id)
    finally:
        db.close()


@router.put("/notifications/smtp-config", response_model=SmtpConfigResponse)
def update_smtp_configuration(
    payload: SmtpConfigUpdate,
    context: TenantContext = Depends(get_tenant_context),
):
    """Save SMTP credentials. Omit password to leave the existing value unchanged."""
    require_permission(context, "notifications:write")
    db = SessionLocal()
    try:
        return save_smtp_config(db, payload, tenant_id=context.tenant_id)
    finally:
        db.close()


@router.post("/notifications/smtp-config/test")
def test_smtp_configuration(context: TenantContext = Depends(get_tenant_context)):
    """Validate SMTP connectivity by opening a connection without sending any email."""
    require_permission(context, "notifications:write")
    db = SessionLocal()
    try:
        return test_smtp_connection(db, tenant_id=context.tenant_id)
    finally:
        db.close()


@router.get("/notifications/deliveries", response_model=list[AlertDeliveryResponse])
def get_alert_deliveries(context: TenantContext = Depends(get_tenant_context)):
    """Return the 100 most-recent alert delivery records for the tenant."""
    db = SessionLocal()

    try:
        deliveries = (
            db.query(AlertDelivery)
            .filter(AlertDelivery.tenant_id == context.tenant_id)
            .order_by(AlertDelivery.sent_at.desc())
            .limit(100)
            .all()
        )
        return [serialize_delivery(delivery) for delivery in deliveries]
    finally:
        db.close()

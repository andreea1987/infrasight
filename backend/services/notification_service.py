import json
import smtplib
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.error import URLError
from urllib.request import Request, urlopen

from backend.config.settings import (
    SMTP_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_USE_TLS,
)
from backend.models.notification import AlertDelivery, NotificationChannel, SmtpConfig

SUPPORTED_CHANNEL_TYPES = {"email", "slack", "teams"}


def serialize_channel(channel):
    return {
        "id": channel.id,
        "tenant_id": channel.tenant_id,
        "organization_id": channel.organization_id,
        "name": channel.name,
        "channel_type": channel.channel_type,
        "target": _mask_target(channel.channel_type, channel.target),
        "enabled": channel.enabled,
        "config": channel.config_json or {},
        "created_at": channel.created_at,
        "last_status": channel.last_status,
        "last_test_at": channel.last_test_at,
        "last_test_result": channel.last_test_result,
        "last_test_error": channel.last_test_error,
    }


def serialize_delivery(delivery):
    return {
        "id": delivery.id,
        "tenant_id": delivery.tenant_id,
        "organization_id": delivery.organization_id,
        "alert_id": delivery.alert_id,
        "channel_id": delivery.channel_id,
        "channel_type": delivery.channel_type,
        "target": _mask_target(delivery.channel_type, delivery.target),
        "status": delivery.status,
        "detail": delivery.detail,
        "response_time_ms": delivery.response_time_ms,
        "sent_at": delivery.sent_at,
    }


def create_channel(db, payload, tenant_id="internal", organization_id="internal"):
    """
    Create an Email, Slack or Teams alert destination for a workspace.

    Inputs:
    - payload with name, channel_type and target

    Output:
    - API-safe channel response with masked destination

    Assumption:
    - Validation happens before persistence; webhook/email targets are masked
      in serialized responses.
    """
    channel_type = payload.channel_type.lower()

    if channel_type not in SUPPORTED_CHANNEL_TYPES:
        raise ValueError("channel_type must be one of: email, slack, teams")

    if not payload.name.strip():
        raise ValueError("Channel name is required.")

    _validate_channel_target(channel_type, payload.target)

    channel = NotificationChannel(
        tenant_id=tenant_id,
        organization_id=organization_id,
        name=payload.name,
        channel_type=channel_type,
        target=payload.target,
        enabled=payload.enabled,
        config_json=payload.config,
    )

    db.add(channel)
    db.commit()
    db.refresh(channel)

    return serialize_channel(channel)


def delete_channel(db, channel_id, tenant_id="internal"):
    channel = (
        db.query(NotificationChannel)
        .filter(NotificationChannel.id == channel_id, NotificationChannel.tenant_id == tenant_id)
        .first()
    )

    if not channel:
        return None

    db.query(AlertDelivery).filter(
        AlertDelivery.channel_id == channel.id,
        AlertDelivery.tenant_id == tenant_id,
    ).update({AlertDelivery.channel_id: None})
    db.delete(channel)
    db.commit()

    return {"deleted": True, "id": channel_id}


def set_channel_enabled(db, channel_id, enabled, tenant_id="internal"):
    channel = (
        db.query(NotificationChannel)
        .filter(NotificationChannel.id == channel_id, NotificationChannel.tenant_id == tenant_id)
        .first()
    )

    if not channel:
        return None

    channel.enabled = enabled
    db.commit()
    db.refresh(channel)

    return serialize_channel(channel)


def notify_alert(db, alert):
    """
    Deliver an alert to every enabled destination in the alert's workspace.

    Outputs:
    - AlertDelivery rows with success/failure detail for audit history

    Assumption:
    - Delivery failures are recorded but do not prevent other destinations from
      being attempted.
    """
    channels = (
        db.query(NotificationChannel)
        .filter(
            NotificationChannel.enabled == True,
            NotificationChannel.tenant_id == alert.tenant_id,
        )
        .all()
    )

    deliveries = []

    for channel in channels:
        status, detail, response_time_ms = _send_to_channel(db, channel, alert)
        channel.last_status = status

        delivery = AlertDelivery(
            tenant_id=alert.tenant_id,
            organization_id=alert.organization_id,
            alert_id=alert.id,
            channel_id=channel.id,
            channel_type=channel.channel_type,
            target=channel.target,
            status=status,
            detail=detail,
            response_time_ms=response_time_ms,
        )
        db.add(delivery)
        deliveries.append(delivery)

    db.commit()

    return [serialize_delivery(delivery) for delivery in deliveries]


def send_test_notification(db, channel):
    """
    Send or simulate a test notification for one destination.

    Output:
    - Channel last_status update plus an AlertDelivery history row marked as test
    """
    class TestAlert:
        id = 0
        title = "InfraSight test alert"
        description = "This is a test notification from InfraSight."
        severity = "info"
        status = "test"
        source = "notification_test"
        metric_name = None
        metric_value = None
        threshold = None

    status, detail, response_time_ms = _send_to_channel(db, channel, TestAlert())

    now = datetime.now(timezone.utc)
    channel.last_status = status
    channel.last_test_at = now
    channel.last_test_result = status
    channel.last_test_error = detail if status == "failed" else None

    delivery = AlertDelivery(
        tenant_id=channel.tenant_id,
        organization_id=channel.organization_id,
        alert_id=None,  # test deliveries have no associated alert
        channel_id=channel.id,
        channel_type=channel.channel_type,
        target=channel.target,
        status=status,
        detail=f"Test delivery: {detail}",
        response_time_ms=response_time_ms,
    )
    db.add(delivery)

    db.commit()
    db.refresh(channel)
    db.refresh(delivery)

    return {
        "status": status,
        "detail": detail,
        "channel": serialize_channel(channel),
        "delivery": serialize_delivery(delivery),
    }


# ── SMTP config ───────────────────────────────────────────────────────────────

def get_smtp_config(db, tenant_id="internal"):
    row = db.query(SmtpConfig).filter(SmtpConfig.tenant_id == tenant_id).first()
    if not row:
        return {
            "is_configured": False,
            "host": None,
            "port": 587,
            "username": None,
            "has_password": False,
            "from_email": "alerts@infrasight.local",
            "use_tls": True,
            "last_test_at": None,
            "last_test_result": None,
            "last_test_error": None,
        }
    return {
        "is_configured": bool(row.host),
        "host": row.host,
        "port": row.port,
        "username": row.username,
        "has_password": bool(row.password),
        "from_email": row.from_email,
        "use_tls": row.use_tls,
        "last_test_at": row.last_test_at,
        "last_test_result": row.last_test_result,
        "last_test_error": row.last_test_error,
    }


def save_smtp_config(db, payload, tenant_id="internal"):
    row = db.query(SmtpConfig).filter(SmtpConfig.tenant_id == tenant_id).first()
    if not row:
        row = SmtpConfig(tenant_id=tenant_id)
        db.add(row)

    if payload.host is not None:
        row.host = payload.host
    if payload.username is not None:
        row.username = payload.username
    if payload.password is not None:
        row.password = payload.password
    if payload.from_email:
        row.from_email = payload.from_email
    row.port = payload.port
    row.use_tls = payload.use_tls

    db.commit()
    db.refresh(row)
    return get_smtp_config(db, tenant_id)


def test_smtp_connection(db, tenant_id="internal"):
    row = db.query(SmtpConfig).filter(SmtpConfig.tenant_id == tenant_id).first()

    host = (row.host if row else None) or SMTP_HOST
    port = (row.port if row else None) or SMTP_PORT
    username = (row.username if row else None) or SMTP_USERNAME
    password = (row.password if row else None) or SMTP_PASSWORD
    use_tls = (row.use_tls if row is not None else None)
    if use_tls is None:
        use_tls = SMTP_USE_TLS

    if not host:
        return {"status": "failed", "detail": "SMTP host is not configured"}

    t0 = time.monotonic()
    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            if use_tls:
                smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.ehlo_or_helo_if_needed()
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        status, detail = "sent", f"SMTP connection successful ({elapsed_ms}ms)"
    except Exception as exc:
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        status, detail = "failed", str(exc)

    now = datetime.now(timezone.utc)
    if row:
        row.last_test_at = now
        row.last_test_result = status
        row.last_test_error = detail if status == "failed" else None
        db.commit()
        db.refresh(row)

    return {
        "status": status,
        "detail": detail,
        "response_time_ms": elapsed_ms,
        "config": get_smtp_config(db, tenant_id),
    }


# ── Internal send helpers ─────────────────────────────────────────────────────

def _send_to_channel(db, channel, alert):
    t0 = time.monotonic()
    try:
        if channel.channel_type == "email":
            status, detail = _send_email(db, channel, alert)
        elif channel.channel_type == "slack":
            status, detail = _send_webhook(channel.target, _slack_payload(alert))
        elif channel.channel_type == "teams":
            status, detail = _send_webhook(channel.target, _teams_payload(alert))
        else:
            status, detail = "skipped", "Unsupported channel type"
    except Exception as exc:
        status, detail = "failed", str(exc)

    response_time_ms = int((time.monotonic() - t0) * 1000)
    return status, detail, response_time_ms


def _send_email(db, channel, alert):
    row = db.query(SmtpConfig).filter(SmtpConfig.tenant_id == channel.tenant_id).first()

    host = (row.host if row else None) or SMTP_HOST
    port = (row.port if row else None) or SMTP_PORT
    username = (row.username if row else None) or SMTP_USERNAME
    password = (row.password if row else None) or SMTP_PASSWORD
    from_email = (row.from_email if row else None) or SMTP_FROM_EMAIL
    use_tls = (row.use_tls if row is not None else None)
    if use_tls is None:
        use_tls = SMTP_USE_TLS

    if not host:
        return "skipped", "SMTP host is not configured"

    message = EmailMessage()
    message["Subject"] = f"[InfraSight] {alert.severity.upper()}: {alert.title}"
    message["From"] = from_email
    message["To"] = channel.target
    message.set_content(_alert_text(alert))

    with smtplib.SMTP(host, port, timeout=10) as smtp:
        if use_tls:
            smtp.starttls()
        if username and password:
            smtp.login(username, password)
        smtp.send_message(message)

    return "sent", "Email delivered"


def _send_webhook(url, payload):
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            return "sent", f"Webhook responded with HTTP {response.status}"
    except URLError as exc:
        return "failed", str(exc)


def _validate_channel_target(channel_type, target):
    target = target.strip()

    if channel_type == "email" and ("@" not in target or "." not in target.rsplit("@", 1)[-1]):
        raise ValueError("Email alert channels require an email address target.")

    if channel_type == "slack" and not target.startswith("https://hooks.slack.com/"):
        raise ValueError("Slack alert channels require a Slack incoming webhook URL.")

    if channel_type == "teams" and not target.startswith("https://"):
        raise ValueError("Slack and Teams alert channels require a webhook URL target.")


def _slack_payload(alert):
    return {
        "text": f"{alert.severity.upper()}: {alert.title}",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{alert.severity.upper()}* - {alert.title}\n{_alert_text(alert)}",
                },
            }
        ],
    }


def _teams_payload(alert):
    return {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "themeColor": "E36A5C" if alert.severity == "critical" else "F2B84B",
        "summary": alert.title,
        "title": f"InfraSight {alert.severity.upper()} alert",
        "text": _alert_text(alert),
    }


def _alert_text(alert):
    lines = [
        alert.title,
        alert.description or "No description provided.",
        f"Source: {alert.source}",
        f"Status: {alert.status}",
    ]

    if alert.metric_name:
        lines.append(f"Metric: {alert.metric_name}={alert.metric_value} threshold={alert.threshold}")

    return "\n".join(lines)


def _mask_target(channel_type, target):
    if not target:
        return ""

    if channel_type == "email" and "@" in target:
        user, domain = target.split("@", 1)
        masked_user = f"{user[:2]}***" if len(user) > 2 else "***"
        return f"{masked_user}@{domain}"

    if channel_type in {"slack", "teams"}:
        return f"{target[:24]}...{target[-6:]}" if len(target) > 34 else "masked webhook URL"

    return "masked destination"

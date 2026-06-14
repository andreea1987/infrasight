import json

from backend.config.settings import OPENCLAW_MODE
from backend.models.openclaw import OpenClawAuditLog


def record_openclaw_audit_event(
    db,
    *,
    event_type,
    status,
    actor="dashboard",
    conversation_id=None,
    tool_name=None,
    request_payload=None,
    response_payload=None,
    summary=None,
    tenant_id="internal",
    organization_id="internal",
):
    event = OpenClawAuditLog(
        tenant_id=tenant_id,
        organization_id=organization_id,
        conversation_id=conversation_id,
        actor=actor,
        event_type=event_type,
        mode=OPENCLAW_MODE,
        tool_name=tool_name,
        status=status,
        request_payload=_json_safe_payload(request_payload),
        response_payload=_json_safe_payload(response_payload),
        summary=summary,
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    return event


def _json_safe_payload(payload):
    if not payload:
        return {}

    return json.loads(json.dumps(payload, default=str))

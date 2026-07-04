"""
On-Premises Sync Routes
=======================
Discovers and syncs the local backend host as an on-prem resource into the
InfraSight inventory.  Uses psutil and platform APIs — no agents required.
"""

from fastapi import APIRouter, Depends

from backend.database.session import SessionLocal
from backend.discovery.onprem.local_service import discover_local_system
from backend.models.resource import Resource
from backend.realtime.connection_manager import manager
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter()


@router.post("/sync/onprem/local")
async def sync_local_system(context: TenantContext = Depends(get_tenant_context)):
    """
    Discover the local machine and upsert it as an on-prem Resource.
    Creates the resource on first sync; updates metadata on subsequent syncs.
    Broadcasts 'onprem_sync_complete' to WebSocket clients when done.
    Requires the 'discovery:run' permission.
    """
    require_permission(context, "discovery:run")
    db = SessionLocal()

    try:
        discovered = discover_local_system()

        existing = (
            db.query(Resource)
            .filter(
                Resource.resource_id == discovered["resource_id"],
                Resource.tenant_id == context.tenant_id,
            )
            .first()
        )

        if existing:
            existing.tenant_id = context.tenant_id
            existing.organization_id = context.organization_id
            existing.name = discovered["name"]
            existing.region = discovered["region"]
            existing.status = discovered["status"]
            existing.platform = discovered["metadata"].get("platform") or discovered["metadata"].get("os")
            existing.metadata_json = {
                **discovered["metadata"],
                "tenant_id": context.tenant_id,
                "organization_id": context.organization_id,
            }
            action = "updated"
        else:
            resource = Resource(
                tenant_id=context.tenant_id,
                organization_id=context.organization_id,
                provider=discovered["provider"],
                resource_id=discovered["resource_id"],
                resource_type=discovered["resource_type"],
                platform=discovered["metadata"].get("platform") or discovered["metadata"].get("os"),
                name=discovered["name"],
                region=discovered["region"],
                status=discovered["status"],
                metadata_json={
                    **discovered["metadata"],
                    "tenant_id": context.tenant_id,
                    "organization_id": context.organization_id,
                },
            )
            db.add(resource)
            action = "created"

        db.commit()

        result = {
            "status": "success",
            "resource": discovered,
            "action": action,
        }
        await manager.broadcast_event("onprem_sync_complete", result)

        return result
    finally:
        db.close()

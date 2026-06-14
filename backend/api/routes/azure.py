"""
Azure Sync Routes
=================
Syncs Azure Virtual Machines into the InfraSight resource inventory via the
azure-mgmt-compute SDK.  Requires AZURE_* environment variables to be set.
"""

from fastapi import APIRouter, Depends, HTTPException

from backend.database.session import SessionLocal
from backend.discovery.azure.vm_service import (
    AzureDiscoveryNotConfigured,
    get_azure_virtual_machines,
)
from backend.models.resource import Resource
from backend.realtime.connection_manager import manager
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter()


@router.post("/sync/azure/vms")
async def sync_azure_virtual_machines(context: TenantContext = Depends(get_tenant_context)):
    """
    Sync Azure VMs for the subscription into the InfraSight resource inventory.
    Returns 400 if Azure credentials are not configured.
    Broadcasts 'azure_sync_complete' to WebSocket clients when done.
    Requires the 'discovery:run' permission.
    """
    require_permission(context, "discovery:run")
    db = SessionLocal()

    try:
        try:
            virtual_machines = get_azure_virtual_machines()
        except AzureDiscoveryNotConfigured as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        created = 0
        updated = 0

        for virtual_machine in virtual_machines:
            existing = (
                db.query(Resource)
                .filter(
                    Resource.resource_id == virtual_machine["resource_id"],
                    Resource.tenant_id == context.tenant_id,
                )
                .first()
            )

            if existing:
                existing.tenant_id = context.tenant_id
                existing.organization_id = context.organization_id
                existing.provider = virtual_machine["provider"]
                existing.resource_type = virtual_machine["resource_type"]
                existing.name = virtual_machine["name"]
                existing.region = virtual_machine["region"]
                existing.status = virtual_machine["status"]
                existing.metadata_json = {
                    **virtual_machine["metadata"],
                    "tenant_id": context.tenant_id,
                    "organization_id": context.organization_id,
                }
                updated += 1
                continue

            db.add(
                Resource(
                    tenant_id=context.tenant_id,
                    organization_id=context.organization_id,
                    provider=virtual_machine["provider"],
                    resource_id=virtual_machine["resource_id"],
                    resource_type=virtual_machine["resource_type"],
                    name=virtual_machine["name"],
                    region=virtual_machine["region"],
                    status=virtual_machine["status"],
                    metadata_json={
                        **virtual_machine["metadata"],
                        "tenant_id": context.tenant_id,
                        "organization_id": context.organization_id,
                    },
                )
            )
            created += 1

        db.commit()

        result = {
            "status": "success",
            "resources_created": created,
            "resources_updated": updated,
        }
        await manager.broadcast_event("azure_sync_complete", result)

        return result
    finally:
        db.close()

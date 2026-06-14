"""
AWS Sync Routes
===============
Triggers synchronization of AWS resources into the InfraSight inventory.
The sync reads live data from the AWS API via boto3 and upserts Resource rows.
"""

from fastapi import APIRouter, Depends

from backend.realtime.connection_manager import manager
from backend.services.resource_service import sync_ec2_resources
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter()


@router.post("/sync/ec2")
async def sync_ec2(context: TenantContext = Depends(get_tenant_context)):
    """
    Sync EC2 instances from AWS into the InfraSight resource inventory.
    Broadcasts 'aws_sync_complete' to all WebSocket clients when done.
    Requires the 'discovery:run' permission.
    """
    require_permission(context, "discovery:run")
    result = sync_ec2_resources(
        tenant_id=context.tenant_id,
        organization_id=context.organization_id,
    )
    await manager.broadcast_event("aws_sync_complete", result)

    return result

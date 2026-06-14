"""
Inventory API Routes
====================
Exposes the unified resource inventory — all assets synchronized from cloud
providers (AWS, Azure) and on-prem discovery, regardless of type.

Resources are populated by the discovery and sync routes; this router provides
the read path used by the dashboard Assets view and OpenClaw tool queries.
"""

from fastapi import APIRouter, Depends

from backend.database.session import SessionLocal
from backend.models.resource import Resource
from backend.schemas.resource import ResourceResponse
from backend.tenancy.context import TenantContext, get_tenant_context

router = APIRouter()


@router.get("/inventory/resources", response_model=list[ResourceResponse])
def get_resources(context: TenantContext = Depends(get_tenant_context)):
    """
    Return all resources for the tenant, ordered by provider then name.
    Private and public IPs are extracted from metadata_json for convenience
    so callers do not need to parse the raw metadata blob.
    """
    db = SessionLocal()

    try:
        resources = (
            db.query(Resource)
            .filter(Resource.tenant_id == context.tenant_id)
            .order_by(Resource.provider, Resource.name)
            .all()
        )

        return [
            {
                "id": resource.id,
                "tenant_id": resource.tenant_id,
                "organization_id": resource.organization_id,
                "provider": resource.provider,
                "resource_id": resource.resource_id,
                "resource_type": resource.resource_type,
                "name": resource.name,
                "region": resource.region,
                "status": resource.status,
                # IPs are stored in metadata_json by the provider sync services
                "private_ip": (resource.metadata_json or {}).get("private_ip"),
                "public_ip": (resource.metadata_json or {}).get("public_ip"),
                "metadata": resource.metadata_json or {},
            }
            for resource in resources
        ]

    finally:
        db.close()

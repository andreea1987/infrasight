from backend.discovery.aws.ec2_service import get_ec2_instances
from backend.database.session import SessionLocal
from backend.models.resource import Resource


def sync_ec2_resources(tenant_id="internal", organization_id="internal"):
    db = SessionLocal()

    try:
        instances = get_ec2_instances()

        created = 0
        updated = 0

        for instance in instances:

            existing = (
                db.query(Resource)
                .filter(
                    Resource.resource_id == instance["instance_id"],
                    Resource.tenant_id == tenant_id,
                )
                .first()
            )

            if existing:
                existing.tenant_id = tenant_id
                existing.organization_id = organization_id
                existing.name = instance["name"]
                existing.region = instance["region"]
                existing.status = instance["state"]
                existing.platform = instance.get("platform") or instance.get("os")
                existing.metadata_json = {
                    **instance,
                    "tenant_id": tenant_id,
                    "organization_id": organization_id,
                }
                updated += 1
                continue

            resource = Resource(
                tenant_id=tenant_id,
                organization_id=organization_id,
                provider="aws",
                resource_id=instance["instance_id"],
                resource_type="ec2",
                platform=instance.get("platform") or instance.get("os"),
                name=instance["name"],
                region=instance.get("region", "unknown"),
                status=instance["state"],
                metadata_json={
                    **instance,
                    "tenant_id": tenant_id,
                    "organization_id": organization_id,
                },
            )

            db.add(resource)
            created += 1

        db.commit()

        return {
            "status": "success",
            "resources_created": created,
            "resources_updated": updated,
        }
    finally:
        db.close()

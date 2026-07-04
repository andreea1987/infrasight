from datetime import datetime
import json

from backend.discovery.connectors import build_discovery_connector, supported_discovery_types
from backend.discovery.profiles import assign_monitoring_profile
from backend.models.discovery import (
    DiscoveryRun,
    MonitoringProfileAssignment,
    ResourceRelationship,
    ResourceTag,
)
from backend.models.resource import Resource


def serialize_discovery_run(run):
    return {
        "id": run.id,
        "tenant_id": run.tenant_id,
        "organization_id": run.organization_id,
        "discovery_type": run.discovery_type,
        "trigger": run.trigger,
        "status": run.status,
        "assets_discovered": run.assets_discovered,
        "assets_created": run.assets_created,
        "assets_updated": run.assets_updated,
        "relationships_created": run.relationships_created,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "error": run.error,
        "metadata": run.metadata_json or {},
    }


def run_discovery(
    db,
    *,
    discovery_types=None,
    trigger="manual",
    config=None,
    tenant_id="internal",
    organization_id="internal",
):
    """
    Run read-only resource discovery for one or more discovery types.

    Inputs:
    - discovery_types: connector identifiers such as aws, azure, docker or kubernetes
    - tenant_id / organization_id: workspace scope for imported assets

    Outputs:
    - DiscoveryRun records with counts, errors and relationship totals

    Assumption:
    - Discovery may import or update InfraSight inventory rows, but it must not
      change external infrastructure.
    """
    config = config or {}
    discovery_types = discovery_types or supported_discovery_types()
    runs = []

    for discovery_type in discovery_types:
        run = DiscoveryRun(
            tenant_id=tenant_id,
            organization_id=organization_id,
            discovery_type=discovery_type,
            trigger=trigger,
            status="running",
            metadata_json={
                "event_driven_ready": True,
                "agent_ready": True,
                "kubernetes_ready": discovery_type == "kubernetes",
            },
        )
        db.add(run)
        db.flush()

        try:
            connector = build_discovery_connector(
                discovery_type,
                config=config.get(discovery_type, config),
                tenant_id=tenant_id,
                organization_id=organization_id,
            )
            assets = connector.discover()
            result = import_discovered_assets(
                db,
                assets,
                tenant_id=tenant_id,
                organization_id=organization_id,
            )
            run.status = "success"
            run.assets_discovered = len(assets)
            run.assets_created = result["created"]
            run.assets_updated = result["updated"]
            run.relationships_created = result["relationships_created"]
            run.completed_at = datetime.utcnow()
        except Exception as exc:
            run.status = "error"
            run.error = str(exc)
            run.completed_at = datetime.utcnow()

        runs.append(run)

    db.commit()

    return [serialize_discovery_run(run) for run in runs]


def import_discovered_assets(db, assets, tenant_id="internal", organization_id="internal"):
    """
    Upserts discovered assets into workspace inventory and relationship tables.

    Outputs:
    - counts of created resources, updated resources and relationships

    Important behavior:
    - tags, relationships and monitoring profile assignments are synchronized
      alongside the resource so topology and health views can use them.
    """
    created = 0
    updated = 0
    relationships_created = 0
    imported_resources = {}

    for asset in assets:
        resource = (
            db.query(Resource)
            .filter(Resource.resource_id == asset.resource_id, Resource.tenant_id == tenant_id)
            .first()
        )
        metadata = _json_safe(
            {
                **asset.metadata,
                "tags": asset.tags,
                "relationships": asset.relationships,
                "tenant_id": tenant_id,
                "organization_id": organization_id,
                "monitoring_profile": assign_monitoring_profile(asset),
            }
        )

        if resource:
            resource.tenant_id = tenant_id
            resource.organization_id = organization_id
            resource.provider = asset.provider
            resource.resource_type = asset.resource_type
            resource.platform = asset.metadata.get("platform") or asset.metadata.get("technology")
            resource.name = asset.name
            resource.region = asset.region
            resource.status = asset.status
            resource.metadata_json = metadata
            updated += 1
        else:
            resource = Resource(
                tenant_id=tenant_id,
                organization_id=organization_id,
                provider=asset.provider,
                resource_id=asset.resource_id,
                resource_type=asset.resource_type,
                platform=asset.metadata.get("platform") or asset.metadata.get("technology"),
                name=asset.name,
                region=asset.region,
                status=asset.status,
                metadata_json=metadata,
            )
            db.add(resource)
            db.flush()
            created += 1

        imported_resources[asset.resource_id] = resource
        _sync_tags(db, resource, asset.tags, tenant_id, organization_id)
        _sync_profile(db, resource, assign_monitoring_profile(asset), tenant_id, organization_id)

    for asset in assets:
        source = imported_resources.get(asset.resource_id)
        if not source:
            continue

        for relationship in asset.relationships:
            target = _ensure_relationship_target(
                db,
                relationship,
                tenant_id=tenant_id,
                organization_id=organization_id,
            )
            if target and _create_relationship(db, source, target, relationship, tenant_id):
                relationships_created += 1

    return {
        "created": created,
        "updated": updated,
        "relationships_created": relationships_created,
    }


def discovery_summary(db, tenant_id="internal"):
    runs = (
        db.query(DiscoveryRun)
        .filter(DiscoveryRun.tenant_id == tenant_id)
        .order_by(DiscoveryRun.started_at.desc())
        .limit(12)
        .all()
    )
    profiles = {}
    for assignment in db.query(MonitoringProfileAssignment).filter(
        MonitoringProfileAssignment.tenant_id == tenant_id
    ).all():
        profiles[assignment.profile_name] = profiles.get(assignment.profile_name, 0) + 1

    return {
        "supported_types": supported_discovery_types(),
        "recent_runs": [serialize_discovery_run(run) for run in runs],
        "topology_relationships": db.query(ResourceRelationship).filter(
            ResourceRelationship.tenant_id == tenant_id
        ).count(),
        "monitoring_profiles": profiles,
        "agent_ready": True,
        "event_driven_ready": True,
        "kubernetes_ready": True,
    }


def _sync_tags(db, resource, tags, tenant_id, organization_id):
    db.query(ResourceTag).filter(ResourceTag.resource_id == resource.id).delete()
    for key, value in tags.items():
        db.add(
            ResourceTag(
                resource_id=resource.id,
                tenant_id=tenant_id,
                organization_id=organization_id,
                key=str(key),
                value=str(value),
            )
        )


def _sync_profile(db, resource, profile_name, tenant_id, organization_id):
    existing = (
        db.query(MonitoringProfileAssignment)
        .filter(MonitoringProfileAssignment.resource_id == resource.id)
        .first()
    )
    if existing:
        existing.profile_name = profile_name
        existing.tenant_id = tenant_id
        existing.organization_id = organization_id
        existing.metadata_json = {"assigned_by": "discovery"}
        return

    db.add(
        MonitoringProfileAssignment(
            resource_id=resource.id,
            tenant_id=tenant_id,
            organization_id=organization_id,
            profile_name=profile_name,
            metadata_json={"assigned_by": "discovery"},
        )
    )


def _ensure_relationship_target(db, relationship, tenant_id, organization_id):
    target_ref = relationship.get("target_ref")
    if not target_ref:
        return None

    resource_id = f"topology:{relationship['relationship_type']}:{target_ref}"
    resource = (
        db.query(Resource)
        .filter(Resource.resource_id == resource_id, Resource.tenant_id == tenant_id)
        .first()
    )
    if resource:
        return resource

    resource = Resource(
        tenant_id=tenant_id,
        organization_id=organization_id,
        provider="topology",
        resource_id=resource_id,
        resource_type="topology_group",
        name=target_ref,
        region="global",
        status="active",
        metadata_json={
            "tenant_id": tenant_id,
            "organization_id": organization_id,
            "relationship_type": relationship["relationship_type"],
            **relationship.get("metadata", {}),
        },
    )
    db.add(resource)
    db.flush()

    return resource


def _create_relationship(db, source, target, relationship, tenant_id):
    existing = (
        db.query(ResourceRelationship)
        .filter(
            ResourceRelationship.source_resource_id == source.id,
            ResourceRelationship.target_resource_id == target.id,
            ResourceRelationship.relationship_type == relationship["relationship_type"],
            ResourceRelationship.tenant_id == tenant_id,
        )
        .first()
    )
    if existing:
        return False

    db.add(
        ResourceRelationship(
            tenant_id=tenant_id,
            organization_id=source.organization_id,
            source_resource_id=source.id,
            target_resource_id=target.id,
            relationship_type=relationship["relationship_type"],
            metadata_json=relationship.get("metadata", {}),
        )
    )
    return True


def _json_safe(payload):
    return json.loads(json.dumps(payload, default=str))

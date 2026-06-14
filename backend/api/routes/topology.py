"""
Topology API Routes
===================
Returns the infrastructure relationship graph as nodes (resources) and edges
(relationships) for the frontend topology visualiser.

Explicit relationships discovered via asset sync are returned as-is.
When no explicit relationships exist for a resource, basic relationships are
inferred from resource-type hierarchy patterns within the same provider/region.
"""

from fastapi import APIRouter, Depends

from backend.database.session import SessionLocal
from backend.models.alert import Alert
from backend.models.discovery import ResourceRelationship
from backend.models.resource import Resource
from backend.tenancy.context import TenantContext, get_tenant_context

router = APIRouter()

# Maps (source_type, target_type) → relationship_type for inferred edges.
# Only applied within the same provider + region.
_TYPE_HIERARCHY: list[tuple[tuple[str, str], str]] = [
    (("ec2", "container"),             "hosts"),
    (("ec2", "docker"),                "hosts"),
    (("vm", "container"),              "hosts"),
    (("vm", "docker"),                 "hosts"),
    (("kubernetes_node", "kubernetes_pod"),        "hosts"),
    (("kubernetes_deployment", "kubernetes_pod"),  "manages"),
    (("kubernetes_service", "kubernetes_pod"),     "routes_to"),
    (("elb", "ec2"),                   "routes_to"),
    (("alb", "ec2"),                   "routes_to"),
    (("load_balancer", "ec2"),         "routes_to"),
    (("ec2", "rds"),                   "uses"),
    (("ec2", "postgres"),              "uses"),
    (("ec2", "mysql"),                 "uses"),
    (("ec2", "redis"),                 "uses"),
    (("container", "rds"),             "uses"),
    (("container", "postgres"),        "uses"),
    (("container", "mysql"),           "uses"),
    (("container", "redis"),           "uses"),
    (("kubernetes_pod", "rds"),        "uses"),
    (("kubernetes_pod", "postgres"),   "uses"),
    (("kubernetes_pod", "redis"),      "uses"),
]


def _normalise_type(rt: str) -> str:
    return rt.lower().replace("-", "_").replace(" ", "_")


def _infer_edges(resources: list) -> list[dict]:
    by_type: dict[str, list] = {}
    for r in resources:
        rt = _normalise_type(r.resource_type)
        by_type.setdefault(rt, []).append(r)

    added: set[tuple[int, int]] = set()
    edges: list[dict] = []

    for (src_type, tgt_type), rel_type in _TYPE_HIERARCHY:
        for src in by_type.get(src_type, []):
            for tgt in by_type.get(tgt_type, []):
                if src.provider != tgt.provider or src.region != tgt.region:
                    continue
                pair = (src.id, tgt.id)
                if pair not in added:
                    added.add(pair)
                    edges.append(
                        {
                            "id": f"inf-{src.id}-{tgt.id}",
                            "source_id": src.id,
                            "target_id": tgt.id,
                            "relationship_type": rel_type,
                            "inferred": True,
                            "metadata": {},
                        }
                    )

    return edges


@router.get("/topology/graph")
def get_topology_graph(context: TenantContext = Depends(get_tenant_context)):
    """
    Return the topology graph for the current tenant.

    Response shape:
        {
          "nodes": [ { id, name, resource_type, provider, region, status,
                       health_status, alert_count, critical_alert_count } ],
          "edges": [ { id, source_id, target_id, relationship_type, inferred, metadata } ]
        }
    """
    db = SessionLocal()
    try:
        resources = (
            db.query(Resource)
            .filter(Resource.tenant_id == context.tenant_id)
            .order_by(Resource.provider, Resource.name)
            .all()
        )

        resource_ids = [r.id for r in resources]

        # ── Alert counts ──────────────────────────────────────────────────────
        alert_totals: dict[int, int] = {}
        alert_criticals: dict[int, int] = {}
        if resource_ids:
            rows = (
                db.query(Alert.resource_id, Alert.severity)
                .filter(
                    Alert.tenant_id == context.tenant_id,
                    Alert.status == "open",
                    Alert.resource_id.in_(resource_ids),
                )
                .all()
            )
            for row in rows:
                rid = row.resource_id
                alert_totals[rid] = alert_totals.get(rid, 0) + 1
                if row.severity == "critical":
                    alert_criticals[rid] = alert_criticals.get(rid, 0) + 1

        # ── Nodes ─────────────────────────────────────────────────────────────
        nodes = []
        for r in resources:
            total = alert_totals.get(r.id, 0)
            critical = alert_criticals.get(r.id, 0)

            if critical > 0:
                health_status = "Critical"
            elif total > 0:
                health_status = "Warning"
            elif r.status in ("running", "available", "active", "healthy"):
                health_status = "Healthy"
            else:
                health_status = "Unknown"

            nodes.append(
                {
                    "id": r.id,
                    "name": r.name,
                    "resource_type": r.resource_type,
                    "provider": r.provider,
                    "region": r.region,
                    "status": r.status,
                    "health_status": health_status,
                    "alert_count": total,
                    "critical_alert_count": critical,
                    "metadata": r.metadata_json or {},
                }
            )

        # ── Explicit edges ────────────────────────────────────────────────────
        explicit_rels = (
            db.query(ResourceRelationship)
            .filter(
                ResourceRelationship.tenant_id == context.tenant_id,
                ResourceRelationship.source_resource_id.in_(resource_ids),
            )
            .all()
        )

        existing_pairs: set[tuple[int, int]] = set()
        edges = []
        for rel in explicit_rels:
            pair = (rel.source_resource_id, rel.target_resource_id)
            existing_pairs.add(pair)
            edges.append(
                {
                    "id": f"e-{rel.id}",
                    "source_id": rel.source_resource_id,
                    "target_id": rel.target_resource_id,
                    "relationship_type": rel.relationship_type,
                    "inferred": False,
                    "metadata": rel.metadata_json or {},
                }
            )

        # ── Inferred edges ────────────────────────────────────────────────────
        for inf in _infer_edges(resources):
            pair = (inf["source_id"], inf["target_id"])
            if pair not in existing_pairs:
                existing_pairs.add(pair)
                edges.append(inf)

        return {"nodes": nodes, "edges": edges}

    finally:
        db.close()

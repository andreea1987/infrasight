"""
OpenClaw AI Provider Routes
===========================
Workspace-scoped provider management for OpenClaw.

These routes manage provider configuration only. They never send workspace
telemetry to a provider during setup/test, and they never allow providers to
perform write or remediation actions.
"""

from fastapi import APIRouter, Depends, HTTPException

from backend.database.session import SessionLocal
from backend.schemas.ai_provider import (
    AiProviderConfigPayload,
    AiProviderConfigResponse,
    AiProviderTestResponse,
)
from backend.services.ai_provider_service import (
    list_ai_providers,
    set_active_ai_provider,
    test_ai_provider,
    upsert_ai_provider,
)
from backend.tenancy.context import TenantContext, get_tenant_context, require_permission

router = APIRouter(prefix="/openclaw/ai-providers", tags=["openclaw-ai-providers"])


@router.get("", response_model=list[AiProviderConfigResponse])
def get_ai_providers(context: TenantContext = Depends(get_tenant_context)):
    """List masked AI provider configuration for the active workspace."""
    require_permission(context, "openclaw:read")
    db = SessionLocal()
    try:
        return list_ai_providers(db, tenant_id=context.tenant_id)
    finally:
        db.close()


@router.post("", response_model=AiProviderConfigResponse)
def create_ai_provider(
    payload: AiProviderConfigPayload,
    context: TenantContext = Depends(get_tenant_context),
):
    """Create a workspace-scoped AI provider. Secret values are masked in responses."""
    require_permission(context, "integrations:write")
    db = SessionLocal()
    try:
        return upsert_ai_provider(
            db,
            payload,
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
        )
    finally:
        db.close()


@router.put("/{provider_id}", response_model=AiProviderConfigResponse)
def update_ai_provider(
    provider_id: int,
    payload: AiProviderConfigPayload,
    context: TenantContext = Depends(get_tenant_context),
):
    """Update provider metadata and optionally replace the stored secret."""
    require_permission(context, "integrations:write")
    db = SessionLocal()
    try:
        provider = upsert_ai_provider(
            db,
            payload,
            tenant_id=context.tenant_id,
            organization_id=context.organization_id,
            provider_id=provider_id,
        )
        if not provider:
            raise HTTPException(status_code=404, detail="AI provider not found")
        return provider
    finally:
        db.close()


@router.post("/{provider_id}/activate", response_model=AiProviderConfigResponse)
def activate_ai_provider(provider_id: int, context: TenantContext = Depends(get_tenant_context)):
    """Select the active OpenClaw provider for this workspace."""
    require_permission(context, "integrations:write")
    db = SessionLocal()
    try:
        provider = set_active_ai_provider(db, provider_id, tenant_id=context.tenant_id)
        if not provider:
            raise HTTPException(status_code=404, detail="AI provider not found")
        return provider
    finally:
        db.close()


@router.post("/{provider_id}/test", response_model=AiProviderTestResponse)
def test_provider(provider_id: int, context: TenantContext = Depends(get_tenant_context)):
    """
    Test provider configuration without sending workspace telemetry.

    OpenClaw chat will fall back to the built-in provider if the selected
    provider is unavailable.
    """
    require_permission(context, "integrations:write")
    db = SessionLocal()
    try:
        result = test_ai_provider(db, provider_id, tenant_id=context.tenant_id)
        if not result:
            raise HTTPException(status_code=404, detail="AI provider not found")
        return result
    finally:
        db.close()

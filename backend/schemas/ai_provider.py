from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AiProviderConfigPayload(BaseModel):
    provider_name: str = Field(min_length=1)
    provider_type: str = Field(pattern=r"^(builtin|openai_compatible|azure_openai|anthropic|ollama|custom_http)$")
    base_url: Optional[str] = None
    api_secret: Optional[str] = None
    model_name: Optional[str] = None
    enabled: bool = True
    is_active: bool = False
    workspace_id: str = "internal"


class AiProviderConfigResponse(BaseModel):
    id: int
    provider_name: str
    provider_type: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    enabled: bool
    is_active: bool
    workspace_id: str
    has_secret: bool
    masked_secret: Optional[str] = None
    status: str
    last_test_at: Optional[datetime] = None
    last_test_result: Optional[str] = None
    last_test_error: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class AiProviderTestResponse(BaseModel):
    status: str
    detail: str
    checked_at: datetime
    provider: AiProviderConfigResponse

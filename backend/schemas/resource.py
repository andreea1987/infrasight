from pydantic import BaseModel, Field
from typing import Optional


class ResourceResponse(BaseModel):
    id: int
    tenant_id: str
    organization_id: str
    resource_id: str
    provider: str
    resource_type: str
    platform: Optional[str] = None
    name: str
    region: str
    status: str
    private_ip: Optional[str] = None
    public_ip: Optional[str] = None
    metadata: dict = Field(default_factory=dict)

    class Config:
        from_attributes = True

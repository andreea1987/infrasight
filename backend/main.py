from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import HTMLResponse

from backend.discovery.aws.ec2_service import get_ec2_instances

from backend.database.base import Base
from backend.database.session import engine

from backend.database.models.user import User
from backend.database.models.resource import Resource

Base.metadata.create_all(bind=engine)

app = FastAPI()

templates = Jinja2Templates(directory="backend/templates")


@app.get("/", response_class=HTMLResponse)
def home(request: Request):

    instances = get_ec2_instances()

    return templates.TemplateResponse(
    request=request,
    name="index.html",
    context={
        "instances": instances
    }
)


@app.get("/health")
def health():
    return {"status": "healthy"}


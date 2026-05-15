from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import HTMLResponse
from fastapi import FastAPI
import boto3

app = FastAPI()
templates = Jinja2Templates(directory="backend/templates")

@app.get("/", response_class=HTMLResponse)
def home(request: Request):

    ec2 = boto3.client("ec2")

    response = ec2.describe_instances()

    instances = []

    for reservation in response["Reservations"]:
        for instance in reservation["Instances"]:

            name = "Unknown"

            if "Tags" in instance:
                for tag in instance["Tags"]:
                    if tag["Key"] == "Name":
                        name = tag["Value"]

            instances.append({
                "name": name,
                "instance_id": instance.get("InstanceId"),
                "instance_type": instance.get("InstanceType"),
                "state": instance["State"]["Name"],
                "private_ip": instance.get("PrivateIpAddress"),
                "public_ip": instance.get("PublicIpAddress")
            })

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "instances": instances
        }
    )


@app.get("/instances")
def get_instances():

    ec2 = boto3.client("ec2")

    response = ec2.describe_instances()

    instances = []

    for reservation in response["Reservations"]:

        for instance in reservation["Instances"]:

            name = "Unknown"

            if "Tags" in instance:

                for tag in instance["Tags"]:

                    if tag["Key"] == "Name":
                        name = tag["Value"]

            instance_data = {
                "name": name,
                "instance_id": instance.get("InstanceId"),
                "instance_type": instance.get("InstanceType"),
                "state": instance["State"]["Name"],
                "private_ip": instance.get("PrivateIpAddress"),
                "public_ip": instance.get("PublicIpAddress"),
                "availability_zone": instance["Placement"]["AvailabilityZone"],
                "launch_time": str(instance.get("LaunchTime"))
            }

            instances.append(instance_data)

    return instances

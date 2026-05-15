import boto3
import os

def get_ec2_instances():

    ec2 = boto3.client(
        "ec2",
        region_name=os.getenv("AWS_DEFAULT_REGION")
    )

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
                "instance_id": instance["InstanceId"],
                "state": instance["State"]["Name"],
                "instance_type": instance["InstanceType"],
                "private_ip": instance.get("PrivateIpAddress"),
                "public_ip": instance.get("PublicIpAddress")
            })

    return instances

from backend.config.settings import AZURE_SUBSCRIPTION_ID


class AzureDiscoveryNotConfigured(RuntimeError):
    pass


def get_azure_virtual_machines():
    if not AZURE_SUBSCRIPTION_ID:
        raise AzureDiscoveryNotConfigured(
            "Set AZURE_SUBSCRIPTION_ID before running Azure discovery."
        )

    try:
        from azure.identity import DefaultAzureCredential
        from azure.mgmt.compute import ComputeManagementClient
    except ImportError as exc:
        raise AzureDiscoveryNotConfigured(
            "Install azure-identity and azure-mgmt-compute to enable Azure discovery."
        ) from exc

    credential = DefaultAzureCredential()
    compute_client = ComputeManagementClient(credential, AZURE_SUBSCRIPTION_ID)

    virtual_machines = []

    for vm in compute_client.virtual_machines.list_all():
        resource_group = _resource_group_from_id(vm.id)
        status = "unknown"

        try:
            instance_view = compute_client.virtual_machines.instance_view(
                resource_group,
                vm.name,
            )
            power_state = next(
                (
                    status.code
                    for status in instance_view.statuses
                    if status.code.startswith("PowerState/")
                ),
                None,
            )
            status = power_state.split("/", 1)[1] if power_state else "unknown"
        except Exception:
            status = "unknown"

        virtual_machines.append(
            {
                "provider": "azure",
                "resource_id": vm.id,
                "resource_type": "vm",
                "name": vm.name,
                "region": vm.location,
                "status": _normalize_power_state(status),
                "metadata": {
                    "azure_vm_id": vm.vm_id,
                    "resource_group": resource_group,
                    "vm_size": vm.hardware_profile.vm_size
                    if vm.hardware_profile
                    else None,
                    "os_type": vm.storage_profile.os_disk.os_type.value
                    if vm.storage_profile and vm.storage_profile.os_disk
                    else None,
                    "raw_power_state": status,
                    "tags": vm.tags or {},
                },
            }
        )

    return virtual_machines


def _resource_group_from_id(resource_id):
    parts = resource_id.split("/")

    try:
        return parts[parts.index("resourceGroups") + 1]
    except (ValueError, IndexError):
        return "unknown"


def _normalize_power_state(power_state):
    if power_state == "running":
        return "running"

    if power_state in {"stopped", "deallocated"}:
        return "stopped"

    return power_state or "unknown"

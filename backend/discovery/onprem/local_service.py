import os
import platform
import shutil
import socket
from datetime import timedelta


def _get_primary_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
            connection.connect(("8.8.8.8", 80))
            return connection.getsockname()[0]
    except OSError:
        return socket.gethostbyname(socket.gethostname())


def _get_memory_gb():
    if not hasattr(os, "sysconf"):
        return None

    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
    except (OSError, ValueError):
        return None

    return round((pages * page_size) / (1024 ** 3), 2)


def _get_uptime_seconds():
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as uptime_file:
            return int(float(uptime_file.readline().split()[0]))
    except (OSError, ValueError, IndexError):
        return None


def discover_local_system():
    hostname = socket.gethostname()
    disk = shutil.disk_usage("/")
    uptime_seconds = _get_uptime_seconds()
    system = platform.system().lower() or "unknown"

    return {
        "provider": "onprem",
        "resource_id": f"local:{hostname}",
        "resource_type": "local_host",
        "name": hostname,
        "region": "local",
        "status": "running",
        "metadata": {
            "hostname": hostname,
            "os": platform.platform(),
            "system": system,
            "release": platform.release(),
            "machine": platform.machine(),
            "cpu_count": os.cpu_count(),
            "memory_gb": _get_memory_gb(),
            "disk_total_gb": round(disk.total / (1024 ** 3), 2),
            "disk_used_percent": round((disk.used / disk.total) * 100, 1),
            "uptime_seconds": uptime_seconds,
            "uptime": str(timedelta(seconds=uptime_seconds)) if uptime_seconds else None,
            "private_ip": _get_primary_ip(),
        },
    }

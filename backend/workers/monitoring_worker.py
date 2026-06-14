import asyncio
from contextlib import suppress

from backend.config.settings import MONITORING_WORKER_INTERVAL_SECONDS
from backend.database.session import SessionLocal
from backend.realtime.connection_manager import manager
from backend.services.monitoring_service import collect_resource_metrics, evaluate_alerts


class MonitoringWorker:
    def __init__(self, interval_seconds=MONITORING_WORKER_INTERVAL_SECONDS):
        self.interval_seconds = interval_seconds
        self._task = None
        self._running = False

    def start(self):
        if self._task:
            return

        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._running = False

        if not self._task:
            return

        self._task.cancel()

        with suppress(asyncio.CancelledError):
            await self._task

        self._task = None

    async def _run(self):
        while self._running:
            await asyncio.sleep(self.interval_seconds)
            await self.run_once()

    async def run_once(self):
        db = SessionLocal()

        try:
            metrics_result = collect_resource_metrics(db)
            alerts_result = evaluate_alerts(db)
            await manager.broadcast_event(
                "monitoring_worker_complete",
                {
                    "metrics": metrics_result,
                    "alerts": alerts_result,
                },
            )
        finally:
            db.close()


monitoring_worker = MonitoringWorker()

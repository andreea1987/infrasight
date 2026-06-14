"""
Real-time Event Routes
======================
Provides the WebSocket endpoint that the dashboard connects to for live updates.

All write operations (sync, alert ack, monitoring collect, etc.) call
manager.broadcast_event() which fans the event out to every connected client.
The dashboard listens here and triggers a data refresh when it receives an event.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.realtime.connection_manager import manager

router = APIRouter()


@router.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """
    Accept a WebSocket connection and add it to the broadcast pool.
    Sends an initial 'client_connected' event to confirm the stream is live.
    The connection is kept open until the client disconnects; incoming messages
    from the client are accepted but ignored (the channel is server-to-client only).
    """
    await manager.connect(websocket)

    try:
        await websocket.send_json(
            {
                "type": "client_connected",
                "payload": {
                    "message": "Realtime event stream connected",
                },
            }
        )

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

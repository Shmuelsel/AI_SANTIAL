"""
Socket.IO event handlers for the video-stream namespace.
Kept separate from app.py so the app factory stays uncluttered.

Registered in app.py via:
    from central_server.api.stream_api import register_socket_events
    register_socket_events(socketio)
"""
from flask_socketio import SocketIO

from central_server import zone_store

# sid → camera_id subscriptions kept in memory (cleared on disconnect).
_subscriptions: dict = {}


def register_socket_events(socketio: SocketIO):

    @socketio.on("subscribe_camera")
    def on_subscribe(data):
        from flask import request as flask_req
        camera_id = data.get("camera_id")
        if camera_id:
            _subscriptions[flask_req.sid] = camera_id
            print(f"[INFO] Socket.IO: client {flask_req.sid} subscribed to {camera_id}")

    @socketio.on("update_restricted_zone")
    def on_update_restricted_zone(data):
        """
        Receive a new restricted zone polygon from the frontend.

        Expected payload:
            {"zone": [{"x": 0.1, "y": 0.2}, ...]}   (normalised [0,1] coords)

        Saves the zone to disk and broadcasts restricted_zone_updated to all
        clients so every connected frontend immediately reflects the change.
        """
        points = data.get("zone", [])
        zone_store.save(points)
        socketio.emit("restricted_zone_updated", {"zone": points})
        print(f"[INFO] Socket.IO: restricted zone updated ({len(points)} points).")
        return {"status": "success", "message": "Restricted zone updated successfully"}

    @socketio.on("disconnect")
    def on_disconnect():
        from flask import request as flask_req
        _subscriptions.pop(flask_req.sid, None)
        print(f"[INFO] Socket.IO: client {flask_req.sid} disconnected.")

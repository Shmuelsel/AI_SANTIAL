# Smart Eye — Frontend Integration Guide

This document is written for the **Frontend Developer**.
It covers environment setup, running the backend, and everything you need
to connect your React application to the live system.

---

## Repository Layout

```
F_project/
├── backend/                  ← Python backend (DO NOT MODIFY)
│   ├── shared/               ← Config + shared data schemas
│   ├── edge_node/            ← YOLO detection, camera capture
│   ├── central_server/       ← Flask, Socket.IO, Firebase, REST API
│   ├── debug/                ← Headless test runner
│   ├── models/               ← yolov8n.pt, tracker.yaml
│   ├── run_server.py         ← Start the Central Server
│   ├── run_edge.py           ← Start the Edge Node
│   └── requirements.txt
│
├── frontend/                 ← YOUR React app goes here  (create this folder)
│
├── API_CONTRACT.md           ← Full WebSocket + REST specification
└── README_FRONTEND.md        ← This file
```

---

## Step 1 — Clone and Backend Setup

```bash
git clone <repo-url>
cd F_project
```

### Create and activate the Python virtual environment

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### Install Python dependencies

```bash
pip install -r requirements.txt
```

> **Note:** PyTorch CPU wheels are used by default. The first run will also
> download the MobileNet V3 weights automatically (~10 MB).

---

## Step 2 — Start the Central Server

Open **Terminal 1** inside `backend/` with the venv active:

```bash
python run_server.py
```

Healthy startup output looks like this:

```
============================================================
  SMART EYE — Central Server
============================================================
[INFO] Host       : 0.0.0.0:5000
[INFO] Firebase DB: https://smart-eye-49d8b-default-rtdb.firebaseio.com

[INFO] FirebaseClient: *** LIVE MODE *** — writing to Firebase Realtime Database.
[INFO] RulesStore: no remote rules to import — starting with local state.

[INFO] Server ready. Waiting for Edge Node and Frontend connections …
[INFO] Frontend WebSocket : ws://localhost:5000
[INFO] Rules REST API     : http://localhost:5000/api/rules
[INFO] Health check       : http://localhost:5000/api/health
```

---

## Step 3 — Start the Edge Node

Open **Terminal 2** inside `backend/` with the venv active:

```bash
python run_edge.py
```

The Edge Node connects to the RTSP camera and starts sending annotated
frames to the Central Server. A local OpenCV preview window will appear.

---

## Step 4 — Connect Your React App

### Install the Socket.IO client

```bash
npm install socket.io-client
```

### Minimal connection boilerplate

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  transports: ['websocket', 'polling'],  // websocket preferred
  withCredentials: false,
});
```

### Receive the live video feed

```jsx
const [frameSrc, setFrameSrc] = useState('');

useEffect(() => {
  socket.on('processed_frame', (dataUri) => {
    // dataUri is a complete base64 JPEG: "data:image/jpeg;base64,..."
    setFrameSrc(dataUri);
  });
  return () => socket.off('processed_frame');
}, []);

// Render
<img src={frameSrc} alt="Live feed" style={{ width: '100%' }} />
```

### Receive tracking data (person list, risk scores)

```js
socket.on('tracking_update', (data) => {
  // data = {
  //   camera_id: "CAM_1001",
  //   timestamp: 1742301234.5,
  //   persons: [
  //     {
  //       global_id:             "G-1",
  //       local_id:              3,
  //       time_in_frame_seconds: 47,
  //       last_position:         { x: 640, y: 380 },
  //       alert_types:           ["loitering"],
  //       box:                   [580, 300, 720, 610],
  //       risk_score:            85
  //     }
  //   ]
  // }
  setPersonList(data.persons);
});
```

### Receive real-time alerts

```js
socket.on('alert_new', (alert) => {
  // alert matches the AlertDocument schema in API_CONTRACT.md §4.2
  // alert.status is always "open" when first received
  showToast(`ALERT: ${alert.alert_type} — ${alert.global_id}`);
  setAlerts(prev => [alert, ...prev]);
});
```

### Receive camera status changes

```js
socket.on('camera_status', ({ camera_id, status }) => {
  // status: "connected" | "disconnected" | "reconnecting"
  setCameraStatus(status);
});
```

### Request the stream for a specific camera

```js
socket.emit('subscribe_camera', { camera_id: 'CAM_1001' });
```

---

## Step 5 — Zone / Polygon REST API

The backend starts with an **empty ruleset**. Use these endpoints to define
restricted zones that trigger loitering and intrusion alerts.

### Create a zone (polygon)

```bash
curl -X POST http://localhost:5000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "camera_id":  "CAM_1001",
    "rule_type":  "zone",
    "name":       "Server Room Entrance",
    "alert_type": "loitering",
    "active":     true,
    "geometry": {
      "type": "polygon",
      "points": [
        { "x": 0.30, "y": 0.10 },
        { "x": 0.70, "y": 0.10 },
        { "x": 0.70, "y": 0.60 },
        { "x": 0.30, "y": 0.60 }
      ]
    },
    "conditions": {
      "min_dwell_seconds": 30,
      "loitering_zone_returns": 3
    }
  }'
```

> **Coordinate system:** All points are **normalised [0.0 – 1.0]** relative to
> the frame dimensions. `(0,0)` is the top-left corner, `(1,1)` is the
> bottom-right corner. This means zone geometry is resolution-independent.

### List all rules for a camera

```bash
curl http://localhost:5000/api/rules?camera_id=CAM_1001
```

### Toggle a rule on / off

```bash
curl -X PATCH http://localhost:5000/api/rules/<rule_id> \
  -H "Content-Type: application/json" \
  -d '{ "active": false }'
```

### Delete a rule

```bash
curl -X DELETE http://localhost:5000/api/rules/<rule_id>
```

Every create, update, and delete is automatically synced to Firebase under
`/rules/CAM_1001/<rule_id>` so your app can also listen for rule changes
directly from the Realtime Database if needed.

---

## Step 6 — Firebase Realtime Database (Alerts)

Alerts are written to Firebase under `/alerts/{camera_id}/{alert_id}`.
Your React app can subscribe using the Firebase JS SDK:

```js
import { initializeApp }          from 'firebase/app';
import { getDatabase, ref, onChildAdded, update } from 'firebase/database';

const app = initializeApp({
  apiKey:      "<your-web-api-key>",
  databaseURL: "https://smart-eye-49d8b-default-rtdb.firebaseio.com",
  projectId:   "smart-eye-49d8b",
});
const db = getDatabase(app);

// Stream new open alerts for CAM_1001
onChildAdded(ref(db, '/alerts/CAM_1001'), (snapshot) => {
  const alert = snapshot.val();
  if (alert.status === 'open') {
    console.log('New alert:', alert);
  }
});

// Acknowledge an alert
async function acknowledgeAlert(alertId, operatorName) {
  await update(ref(db, `/alerts/CAM_1001/${alertId}`), {
    status:           'acknowledged',
    acknowledged_by:  operatorName,
    acknowledged_at:  new Date().toISOString(),
  });
}
```

The **web API key** (safe for frontend use) is different from the service
account JSON (backend only). Get the web config from:
**Firebase Console → Project Settings → Your apps → Web app**.

---

## Step 7 — Adding Your Frontend Code to This Repo

Create a `frontend/` directory at the project root and initialise your
React app there:

```bash
# From the project root
npx create-react-app frontend
# or, if using Vite:
npm create vite@latest frontend -- --template react
```

Your final directory structure should look like:

```
F_project/
├── backend/
└── frontend/
    ├── src/
    ├── public/
    └── package.json
```

The `frontend/node_modules/` and `frontend/build/` directories are already
excluded from git by `.gitignore`.

### Running both together in development

```bash
# Terminal 1 — backend
cd backend && python run_server.py

# Terminal 2 — edge node
cd backend && python run_edge.py

# Terminal 3 — React dev server
cd frontend && npm start
```

The React dev server (`localhost:3000`) will connect to the backend at
`localhost:5000`. CORS is enabled for all origins on the backend.

---

## Quick Reference

| What | Where |
|---|---|
| Full API spec | `API_CONTRACT.md` in project root |
| WebSocket URL | `ws://localhost:5000` |
| Rules REST API | `http://localhost:5000/api/rules` |
| Health check | `http://localhost:5000/api/health` |
| Firebase DB | `https://smart-eye-49d8b-default-rtdb.firebaseio.com` |
| Alerts path | `/alerts/CAM_1001/{alert_id}` |
| Rules path | `/rules/CAM_1001/{rule_id}` |
| Camera ID | `CAM_1001` |

---

## Troubleshooting

**`Connection refused` on port 5000**
→ Make sure `run_server.py` is running in Terminal 1.

**No video frames received**
→ Make sure `run_edge.py` is running in Terminal 2 and the RTSP camera is online.

**`cors` error in browser**
→ The backend uses `cors_allowed_origins="*"`. Ensure you are connecting to
`http://localhost:5000` (not `https`).

**Socket.IO connects but no `processed_frame` events**
→ The server only emits frames when persons are detected. With no one in
frame the `processed_frame` event is still emitted but the annotation
overlay will be empty. Check the Edge Node terminal for FPS output.

**Rules I create via REST are not affecting detection**
→ Confirm with `GET /api/rules?camera_id=CAM_1001` that the rule was
created and `"active": true`. Risk scoring only triggers when a person's
centroid is inside the polygon — verify your normalised coordinates.

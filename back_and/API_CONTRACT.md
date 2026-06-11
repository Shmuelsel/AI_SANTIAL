# Smart Eye — Frontend ↔ Backend API Contract

**Version:** 2.1
**Date:** 2026-05-04
**Previous Version:** 1.0 (2026-03-18)
**Audience:** Backend Developer (Python/Flask) & Frontend Developer (ReactJS)

---

## Changelog (v1.0 → v2.0)

| # | Change | Type | Affected Section |
|---|---|---|---|
| 1 | Scoring schema decoupled: `climbing_score`, `loitering_score`, `total_person_score` added to `tracking_update` and alert documents | Additive | §2.3, §4.2 |
| 2 | Daily Activity Log: new Firebase path `/activity_log/` and `GET /api/activity-log` endpoint | New | §6 |
| 3 | Multiple sensitive zones: `sensitivity_level` (1–5) field added to zone rules | Additive | §3.2, §3.3 |
| 4 | Dynamic Camera Configuration: `POST/GET/DELETE /api/cameras` + edge push relay | New | §7 |
| 5 | Decoupled alert triggers: `trigger_type` field added to alert documents; `"combined"` added to `AlertType` | Additive | §4.2, §4.6, §5 |

**Migration note for v1.0 consumers:** All changes are **additive**. No existing fields were removed or renamed. Frontend code built against v1.0 will continue to function; new fields appear alongside existing ones.

---

## Table of Contents

1. [Overview & Layer Diagram](#overview)
2. [Workflow 1 — Video Relay (WebSocket)](#workflow-1)
3. [Workflow 2 — Rule Configuration (Polygons & Tripwires)](#workflow-2)
4. [Workflow 3 — Loitering & Re-ID Alerts (Firebase)](#workflow-3)
5. [Shared Types & Enums](#shared-types)
6. [Workflow 4 — Daily Activity Log](#workflow-4)
7. [Workflow 5 — Dynamic Camera Configuration](#workflow-5)
8. [Scoring KPI Specification](#scoring-kpi)
9. [Authentication Notes](#auth)
10. [Error Handling Contract](#errors)

---

<a name="overview"></a>
## 1. Overview & Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ReactJS Frontend                         │
│   • Displays live annotated video feed                          │
│   • Draws/submits zone polygons and tripwires                   │
│   • Configures cameras dynamically (NEW v2.0)                   │
│   • Displays live KPI scores per person (NEW v2.0)              │
│   • Displays daily activity log table (NEW v2.0)                │
│   • Listens for real-time alert notifications                   │
└───────────────┬────────────────┬───────────────┬───────────────┘
                │                │               │
          Socket.IO         REST API         Firebase
          (WSS)            (HTTPS)        Realtime DB
          Workflow 1       Workflow 2,      Workflow 3,
                           5 (cam cfg)      4 (activity log)
                │                │               │
┌───────────────▼────────────────▼───────────────▼───────────────┐
│                   Central Server (Flask / Python)               │
│   Port 5000   •   /api/*   •   Socket.IO namespace: /          │
└─────────────────────────────────┬───────────────────────────────┘
                                  │  HTTP POST /update (detections)
                                  │  Socket.IO push: camera_config (NEW)
┌─────────────────────────────────▼───────────────────────────────┐
│              Edge Node (client.py — YOLOv8 + ByteTrack)         │
│   Receives dynamic RTSP config from Central Server (NEW v2.0)   │
│   RTSP → detection → Re-ID → JSON payload → Central Server      │
│   All video processing stays strictly on the Edge               │
└─────────────────────────────────────────────────────────────────┘
```

**Base URL (development):** `http://localhost:5000`
**Base URL (production):** `https://<azure-domain>/` (TBD)

---

<a name="workflow-1"></a>
## 2. Workflow 1 — Video Relay (WebSocket / Socket.IO)

### 2.1 Why Socket.IO (not WebRTC)

The backend already uses **Flask-SocketIO** and the current `index.html` prototype
consumes the `processed_frame` event. WebRTC would require a signaling server and
adds significant infrastructure complexity with no benefit for a single-server,
single-viewer use case. Socket.IO is the correct choice here.

> **Important change for production:** The existing prototype connects with
> `transports: ['polling']` only. The React frontend **must** use
> `transports: ['websocket', 'polling']` (websocket first) to avoid the ~500ms
> polling latency that makes video feel choppy.

---

### 2.2 Connection

**Frontend connects to:**
```
ws://localhost:5000/
```

**React client setup (Socket.IO v4):**
```js
import { io } from 'socket.io-client';

const socket = io(process.env.REACT_APP_SERVER_URL, {
  transports: ['websocket', 'polling'],  // websocket preferred
  withCredentials: false,
});
```

---

### 2.3 Events — Server → Frontend

#### Event: `processed_frame`

Emitted by the Central Server each time a new annotated frame is ready.
The server encodes the OpenCV frame as a JPEG and sends it as a **base64 data URI**.

| Field | Type | Description |
|---|---|---|
| `data` | `string` | A complete base64 data URI: `"data:image/jpeg;base64,/9j/4AAQ..."` |

**React handler:**
```jsx
socket.on('processed_frame', (dataUri) => {
  setFrameSrc(dataUri);
  setFrameCount(n => n + 1);
});
```

**Backend emits (Flask-SocketIO):**
```python
_, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
b64 = base64.b64encode(buffer).decode('utf-8')
socketio.emit('processed_frame', f'data:image/jpeg;base64,{b64}')
```

> **Quality setting:** `JPEG_QUALITY = 75` is the recommended trade-off. Do not exceed 85 or the WebSocket will saturate at 1080p.

---

#### Event: `camera_status`

Emitted whenever a camera connects or disconnects.

```json
{
  "camera_id": "CAM_1001",
  "status": "connected",
  "timestamp": 1742301234.5
}
```

| Field | Type | Values |
|---|---|---|
| `camera_id` | `string` | e.g. `"CAM_1001"` |
| `status` | `string` | `"connected"` \| `"disconnected"` \| `"reconnecting"` |
| `timestamp` | `number` | Unix epoch (seconds, float) |

---

#### Event: `tracking_update`

Emitted every ~1 second alongside the video frame.

**v2.0 Change:** Each person object now includes a `scores` block with the three decoupled KPI scores. See §8 for the full KPI formula.

```json
{
  "camera_id": "CAM_1001",
  "timestamp": 1746350400.5,
  "persons": [
    {
      "global_id": "G-1",
      "local_id": 3,
      "time_in_frame_seconds": 47,
      "last_position": { "x": 640, "y": 380 },
      "alert_types": ["loitering"],
      "box": [580, 300, 720, 610],
      "scores": {
        "climbing_score":     0,
        "loitering_score":    80,
        "total_person_score": 48
      }
    }
  ]
}
```

**All fields in `persons[]`:**

| Field | Type | Description |
|---|---|---|
| `global_id` | `string` | Stable Re-ID assigned by server gallery (e.g. `"G-1"`) |
| `local_id` | `integer` | ByteTrack local ID (may change across reconnects) |
| `time_in_frame_seconds` | `integer` | Cumulative seconds this identity has been seen (Re-ID aware) |
| `last_position` | `{x, y}` | Centroid in original frame pixels |
| `alert_types` | `string[]` | Active alerts: `[]`, `["loitering"]`, `["climbing"]`, `["loitering","climbing"]` |
| `box` | `[x1,y1,x2,y2]` | Bounding box in original frame pixels |
| `scores.climbing_score` | `integer` | Climbing KPI score 0–100 **(NEW v2.0)** |
| `scores.loitering_score` | `integer` | Loitering KPI score 0–100, zone-sensitivity weighted **(NEW v2.0)** |
| `scores.total_person_score` | `integer` | Weighted total KPI score 0–100 **(NEW v2.0)** |

---

### 2.4 Events — Frontend → Server

#### Event: `subscribe_camera`

Frontend requests the stream for a specific camera.

```json
{ "camera_id": "CAM_1001" }
```

---

<a name="workflow-2"></a>
## 3. Workflow 2 — Rule Configuration (Polygons & Tripwires)

Rules define the spatial logic that the **Spatial Logic Engine** uses to trigger alerts and compute scores.

---

### 3.1 Coordinate System

All polygon/line coordinates are expressed in **normalized [0.0 – 1.0] space**
relative to the frame dimensions.

```
(0,0) ─────────────── (1,0)
  │                      │
  │    Frame Canvas       │
  │                      │
(0,1) ─────────────── (1,1)
```

The Central Server converts to pixel coordinates using `frame_height` and `frame_width` from the Edge Node payload.

---

### 3.2 POST `/api/rules` — Create a Rule

**v2.0 Change:** Zone rules now accept a `sensitivity_level` field (1–5). This value is used by the scoring engine to amplify or suppress the loitering score when a person is inside this zone. Default is `3` (neutral, no amplification).

**Request Body (zone with sensitivity):**

```json
{
  "camera_id": "CAM_1001",
  "rule_type": "zone",
  "name": "Server Room Entrance",
  "alert_type": "loitering",
  "active": true,
  "sensitivity_level": 4,
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
}
```

**All request fields:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `camera_id` | `string` | Yes | — | Which camera this rule applies to |
| `rule_type` | `string` | Yes | — | `"zone"` or `"tripwire"` |
| `name` | `string` | Yes | — | Human-readable label shown in the UI |
| `alert_type` | `string` | Yes | — | `"intrusion"` \| `"loitering"` \| `"climbing"` |
| `active` | `boolean` | Yes | — | Whether the rule is currently enforced |
| `sensitivity_level` | `integer` | No | `3` | Zone sensitivity 1–5. Only meaningful for `rule_type: "zone"`. See §8.2. **(NEW v2.0)** |
| `geometry.type` | `string` | Yes | — | `"polygon"` for zones, `"line"` for tripwires |
| `geometry.points` | `Point[]` | Yes | — | Min 3 points for polygon; exactly 2 for line |
| `conditions` | `object` | No | — | Optional thresholds (see below) |

**`conditions` fields (all optional):**

| Field | Type | Default | Description |
|---|---|---|---|
| `min_dwell_seconds` | `integer` | `30` | Seconds inside zone before loitering alert |
| `loitering_zone_returns` | `integer` | `3` | Zone return count threshold |
| `crossing_direction` | `string` | `"any"` | For tripwires: `"any"` \| `"left_to_right"` \| `"right_to_left"` |

**Tripwire example body:**
```json
{
  "camera_id": "CAM_1001",
  "rule_type": "tripwire",
  "name": "Perimeter Fence Line",
  "alert_type": "intrusion",
  "active": true,
  "geometry": {
    "type": "line",
    "points": [
      { "x": 0.0, "y": 0.55 },
      { "x": 1.0, "y": 0.55 }
    ]
  },
  "conditions": {
    "crossing_direction": "any"
  }
}
```

**Success Response — `201 Created`:**
```json
{
  "rule_id": "rule_8f3a2c",
  "camera_id": "CAM_1001",
  "sensitivity_level": 4,
  "created_at": "2026-05-04T10:00:00Z",
  "message": "Rule created successfully"
}
```

---

### 3.3 GET `/api/rules` — List All Rules

Returns all rules, optionally filtered by camera.

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `camera_id` | `string` | No | Filter to a specific camera |

**Example:** `GET /api/rules?camera_id=CAM_1001`

**v2.0 Change:** `sensitivity_level` is now included in every zone rule returned.

**Response — `200 OK`:**
```json
{
  "rules": [
    {
      "rule_id": "rule_8f3a2c",
      "camera_id": "CAM_1001",
      "rule_type": "zone",
      "name": "Server Room Entrance",
      "alert_type": "loitering",
      "active": true,
      "sensitivity_level": 4,
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
      },
      "created_at": "2026-05-04T10:00:00Z"
    }
  ]
}
```

---

### 3.4 PATCH `/api/rules/:rule_id` — Update a Rule

Used to toggle a rule active/inactive, update geometry, or change sensitivity.

**v2.0 Change:** `sensitivity_level` is now a patchable field.

**Request Body (partial update, send only changed fields):**
```json
{
  "active": false,
  "sensitivity_level": 5
}
```

**Response — `200 OK`:**
```json
{
  "rule_id": "rule_8f3a2c",
  "updated_at": "2026-05-04T11:00:00Z",
  "message": "Rule updated"
}
```

---

### 3.5 DELETE `/api/rules/:rule_id` — Delete a Rule

**Response — `200 OK`:**
```json
{
  "rule_id": "rule_8f3a2c",
  "message": "Rule deleted"
}
```

---

### 3.6 How the Backend Uses These Rules

When the Central Server receives a detection payload from the Edge Node (via `POST /update`), the **Spatial Logic Engine** must:

1. Load all active rules for `camera_id` from the database.
2. Convert normalized polygon points → pixel coordinates using `frame_width` / `frame_height`.
3. For each detected person, run a point-in-polygon test on their `last_position` centroid against every active zone rule.
4. For tripwires, check if the movement vector crossed the line segment between previous and current centroid.
5. Read `sensitivity_level` from the triggered zone rule and pass it to the scoring engine (§8).
6. If a rule is triggered, write an alert document to Firebase (§4) and include `alerts`, `alert_types`, and `scores` in the `/update` response.

**Updated `/update` response schema (v2.0):**
```json
{
  "global_ids":      { "3": "G-1", "7": "G-4" },
  "effective_times": { "3": 47, "7": 12 },
  "alerts":          [3],
  "alert_types":     { "3": ["loitering"] },
  "scores":          {
    "3": {
      "climbing_score":     0,
      "loitering_score":    80,
      "total_person_score": 48
    },
    "7": {
      "climbing_score":     0,
      "loitering_score":    0,
      "total_person_score": 0
    }
  }
}
```

---

<a name="workflow-3"></a>
## 4. Workflow 3 — Loitering & Re-ID Alerts (Firebase)

### 4.1 Loitering Detection Logic (Backend)

The Edge Node computes behavioral metrics per person. The Central Server applies threshold rules:

| Metric (from Edge payload) | What it measures | Loitering threshold |
|---|---|---|
| `time_in_frame_seconds` | Cumulative seconds the global identity has been visible | `>= 30s` (configurable via `min_dwell_seconds`) |
| `zone_returns` | How many times the person returned to a previously visited zone cluster | `>= 3` (configurable via `loitering_zone_returns`) |
| `area_spread_pixels` | Diagonal spread of all positions — small spread = confined movement | `< 150px` |
| `avg_movement_pixels` | Average velocity in pixels/frame | `< 5.0 px/frame` |

**Decision logic:**
```python
def is_loitering(person, rule):
    dwell_ok    = effective_time >= rule.conditions.min_dwell_seconds
    returns_ok  = person.zone_returns >= rule.conditions.loitering_zone_returns
    confined_ok = person.area_spread_pixels < 150
    slow_ok     = person.avg_movement_pixels < 5.0
    return dwell_ok and (returns_ok or (confined_ok and slow_ok))
```

---

### 4.2 Firebase Realtime Database — Alert Document Schema

**Database path:** `/alerts/{camera_id}/{alert_id}`

**v2.0 Changes:**
- `location` now includes `zone_sensitivity` (the level of the triggered zone)
- New top-level `scores` object with the three decoupled KPI scores

**v2.1 Change:** New `trigger_type` field. See §4.6 for full trigger semantics.

```json
{
  "alert_id":         "alert_20260504_100000_G1",
  "camera_id":        "CAM_1001",
  "global_id":        "G-1",
  "alert_type":       "loitering",
  "trigger_type":     "LOITERING",
  "severity":         "medium",
  "status":           "open",

  "timestamp_iso":    "2026-05-04T10:00:00.000Z",
  "timestamp_unix":   1746350400.0,

  "location": {
    "last_position":    { "x": 640, "y": 380 },
    "bounding_box":     [580, 300, 720, 610],
    "zone_name":        "Server Room Entrance",
    "rule_id":          "rule_8f3a2c",
    "zone_sensitivity": 4
  },

  "scores": {
    "climbing_score":     0,
    "loitering_score":    80,
    "total_person_score": 48
  },

  "metrics": {
    "time_in_frame_seconds": 47,
    "zone_returns":          4,
    "area_spread_pixels":    95.3,
    "avg_movement_pixels":   2.1
  },

  "snapshot_url":     null,

  "acknowledged_by":  null,
  "acknowledged_at":  null,
  "resolved_at":      null
}
```

**Full field reference:**

| Field | Type | Description |
|---|---|---|
| `alert_id` | `string` | Format: `alert_{YYYYMMDD}_{HHMMSS}_{global_id_no_dash}` |
| `camera_id` | `string` | Source camera |
| `global_id` | `string` | Re-ID stable identity (e.g. `"G-1"`) |
| `alert_type` | `string` | `"loitering"` \| `"climbing"` \| `"combined"` \| `"intrusion"` |
| `trigger_type` | `string` | `"CLIMBING"` \| `"LOITERING"` \| `"COMBINED"` \| `"INTRUSION"` — see §4.6 **(NEW v2.1)** |
| `severity` | `string` | `"low"` \| `"medium"` \| `"high"` |
| `status` | `string` | `"open"` \| `"acknowledged"` \| `"resolved"` |
| `timestamp_iso` | `string` | ISO 8601 UTC |
| `timestamp_unix` | `number` | Unix epoch float |
| `location.last_position` | `{x, y}` | Pixel coordinates at time of alert |
| `location.bounding_box` | `[x1,y1,x2,y2]` | Bounding box at time of alert |
| `location.zone_name` | `string` \| `null` | Name of the triggered zone |
| `location.rule_id` | `string` \| `null` | ID of the rule that fired |
| `location.zone_sensitivity` | `integer` \| `null` | Zone sensitivity level 1–5; `null` for tripwire alerts **(NEW v2.0)** |
| `scores.climbing_score` | `integer` | Climbing KPI at moment of alert **(NEW v2.0)** |
| `scores.loitering_score` | `integer` | Loitering KPI at moment of alert **(NEW v2.0)** |
| `scores.total_person_score` | `integer` | Weighted total KPI at moment of alert **(NEW v2.0)** |
| `metrics` | `object` | Raw behavioral values that triggered this alert |
| `snapshot_url` | `string` \| `null` | Alert image in Firebase Storage |
| `acknowledged_by` | `string` \| `null` | Operator username |
| `acknowledged_at` | `string` \| `null` | ISO 8601 UTC |
| `resolved_at` | `string` \| `null` | ISO 8601 UTC |

---

### 4.3 Backend — Writing the Alert to Firebase

```python
import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime, timezone

cred = credentials.Certificate('smart-eye-49d8b-firebase-adminsdk-fbsvc-*.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://smart-eye-49d8b-default-rtdb.firebaseio.com'
})

def push_alert(camera_id, global_id, alert_type, metrics, location, scores):
    now = datetime.now(timezone.utc)
    gid_clean = global_id.replace('-', '')
    alert_id = f"alert_{now.strftime('%Y%m%d_%H%M%S')}_{gid_clean}"

    severity_map = {"loitering": "medium", "climbing": "high", "intrusion": "high"}

    alert_doc = {
        "alert_id":         alert_id,
        "camera_id":        camera_id,
        "global_id":        global_id,
        "alert_type":       alert_type,
        "severity":         severity_map.get(alert_type, "medium"),
        "status":           "open",
        "timestamp_iso":    now.isoformat(),
        "timestamp_unix":   now.timestamp(),
        "location":         location,   # must include zone_sensitivity
        "scores":           scores,     # climbing_score, loitering_score, total_person_score
        "metrics":          metrics,
        "snapshot_url":     None,
        "acknowledged_by":  None,
        "acknowledged_at":  None,
        "resolved_at":      None,
    }

    ref = db.reference(f'/alerts/{camera_id}/{alert_id}')
    ref.set(alert_doc)
    return alert_id
```

---

### 4.4 Frontend — Listening to Firebase Alerts (React)

```jsx
import { ref, onChildAdded, update } from 'firebase/database';

function subscribeToAlerts(cameraId, onNewAlert) {
  const alertsRef = ref(db, `/alerts/${cameraId}`);
  onChildAdded(alertsRef, (snapshot) => {
    const alert = snapshot.val();
    if (alert.status === 'open') {
      onNewAlert(alert);
    }
  });
}

async function acknowledgeAlert(cameraId, alertId, operatorName) {
  const alertRef = ref(db, `/alerts/${cameraId}/${alertId}`);
  await update(alertRef, {
    status:          'acknowledged',
    acknowledged_by: operatorName,
    acknowledged_at: new Date().toISOString(),
  });
}
```

---

### 4.5 Alert Deduplication Rule

The backend **must not** re-fire an alert for the same `global_id` + `alert_type`
combination within a **60-second cooldown window**.

```python
_alert_cooldowns = {}   # key: f"{camera_id}:{global_id}:{alert_type}"

def should_fire_alert(camera_id, global_id, alert_type, cooldown_seconds=60):
    key = f"{camera_id}:{global_id}:{alert_type}"
    last_fired = _alert_cooldowns.get(key, 0)
    if time.time() - last_fired > cooldown_seconds:
        _alert_cooldowns[key] = time.time()
        return True
    return False
```

---

### 4.6 Decoupled Alert Trigger Logic (NEW in v2.1)

The backend evaluates **three independent KPI-based alert conditions** per tracked identity on every ingest cycle. Conditions do not block each other — multiple can fire simultaneously.

| Condition | `alert_type` | `trigger_type` | Fires when |
|---|---|---|---|
| Pure Climbing | `"climbing"` | `"CLIMBING"` | `climbing_score ≥ 50` (≥ 2 confirmed climbing events), regardless of loitering state |
| Pure Loitering | `"loitering"` | `"LOITERING"` | `loitering_score ≥ 70` (zone dwell exceeded threshold), regardless of climbing state |
| Combined Partial | `"combined"` | `"COMBINED"` | `total_person_score ≥ 50` AND neither individual threshold is met — partial overlap of both behaviors |
| Spatial Intrusion | `"intrusion"` | `"INTRUSION"` | Tripwire crossed (pure spatial event — no KPI threshold, fires immediately) |

**Threshold defaults (configurable via environment variables):**

| Variable | Default | Meaning |
|---|---|---|
| `CLIMBING_ALERT_THRESHOLD` | `50` | Minimum `climbing_score` for a pure climbing alert |
| `LOITERING_ALERT_THRESHOLD` | `70` | Minimum `loitering_score` for a pure loitering alert |
| `COMBINED_ALERT_THRESHOLD` | `50` | Minimum `total_person_score` for a combined alert |

**Example scenarios:**

```
Scenario A — Pure Climbing:
  climbing_score=75, loitering_score=20, total_person_score=42
  → fires alert_type="climbing", trigger_type="CLIMBING"
  → does NOT fire LOITERING or COMBINED

Scenario B — Pure Loitering:
  climbing_score=0, loitering_score=80, total_person_score=48
  → fires alert_type="loitering", trigger_type="LOITERING"

Scenario C — Combined:
  climbing_score=40, loitering_score=40, total_person_score=40
  → neither individual threshold met, combined threshold met
  → fires alert_type="combined", trigger_type="COMBINED"

Scenario D — Both simultaneously:
  climbing_score=75, loitering_score=80, total_person_score=78
  → fires CLIMBING + LOITERING as two separate alert documents
  → COMBINED does NOT fire (suppressed when either individual threshold is met)
```

**Severity mapping:**

| `alert_type` | `severity` |
|---|---|
| `"climbing"` | `"high"` |
| `"loitering"` | `"medium"` |
| `"combined"` | `"high"` |
| `"intrusion"` | `"high"` |

---

<a name="shared-types"></a>
## 5. Shared Types & Enums

### AlertType
```ts
type AlertType = 'loitering' | 'climbing' | 'combined' | 'intrusion';
// combined = partial overlap of climbing + loitering (added v2.1)
```

### TriggerType (NEW v2.1)
```ts
type TriggerType = 'CLIMBING' | 'LOITERING' | 'COMBINED' | 'INTRUSION';
// Identifies WHY the alert fired. See §4.6 for full semantics.
```

### AlertStatus
```ts
type AlertStatus = 'open' | 'acknowledged' | 'resolved';
```

### Severity
```ts
type Severity = 'low' | 'medium' | 'high';
```

### RuleType
```ts
type RuleType = 'zone' | 'tripwire';
```

### GeometryType
```ts
type GeometryType = 'polygon' | 'line';
```

### Point (normalized)
```ts
interface Point {
  x: number;  // 0.0 – 1.0
  y: number;  // 0.0 – 1.0
}
```

### CameraStatus
```ts
type CameraStatus = 'connected' | 'disconnected' | 'reconnecting';
```

### ZoneSensitivity (NEW v2.0)
```ts
type ZoneSensitivity = 1 | 2 | 3 | 4 | 5;
// 1 = Low  |  2 = Guarded  |  3 = Elevated (default)  |  4 = High  |  5 = Critical
```

### PersonScores (NEW v2.0)
```ts
interface PersonScores {
  climbing_score:     number;  // 0–100
  loitering_score:    number;  // 0–100
  total_person_score: number;  // 0–100
}
```

### ActivityLogEntry (NEW v2.0)
```ts
interface ActivityLogEntry {
  log_id:              string;
  date:                string;       // "YYYY-MM-DD"
  camera_id:           string;
  global_id:           string;
  first_seen_iso:      string;       // ISO 8601 UTC
  last_seen_iso:       string;       // ISO 8601 UTC
  total_time_seconds:  number;
  alerts_triggered:    AlertType[];
  alert_count:         number;
  peak_scores:         PersonScores;
  zones_visited:       string[];
  snapshot_url:        string | null;
}
```

### CameraConfig (NEW v2.0)
```ts
interface CameraConfig {
  camera_id:     string;
  rtsp_url:      string;
  rtsp_username: string | null;
  rtsp_password: string | null;  // always "***" in GET responses
  resolution:    string | null;  // e.g. "1920x1080"
  fps_cap:       number | null;
  registered_at: string;         // ISO 8601 UTC
  status:        CameraStatus;
}
```

---

<a name="workflow-4"></a>
## 6. Workflow 4 — Daily Activity Log (NEW in v2.0)

The Daily Activity Log provides a per-person, per-camera, per-day summary of all behavioral activity. The Central Server writes it continuously; the Frontend reads it on demand or via real-time subscription.

---

### 6.1 Firebase Storage Path

**Database path:** `/activity_log/{YYYYMMDD}/{camera_id}/{log_id}`

**Example path:** `/activity_log/20260504/CAM_1001/log_20260504_G1_CAM1001`

```json
{
  "log_id":             "log_20260504_G1_CAM1001",
  "date":               "2026-05-04",
  "camera_id":          "CAM_1001",
  "global_id":          "G-1",
  "first_seen_iso":     "2026-05-04T08:15:00.000Z",
  "last_seen_iso":      "2026-05-04T14:32:00.000Z",
  "total_time_seconds": 1847,
  "alerts_triggered":   ["loitering"],
  "alert_count":        2,
  "peak_scores": {
    "climbing_score":     0,
    "loitering_score":    90,
    "total_person_score": 54
  },
  "zones_visited":      ["Server Room Entrance"],
  "snapshot_url":       null
}
```

**Field Reference:**

| Field | Type | Description |
|---|---|---|
| `log_id` | `string` | Format: `log_{YYYYMMDD}_{global_id_no_dash}_{camera_id_no_underscore}` |
| `date` | `string` | `YYYY-MM-DD` local date |
| `camera_id` | `string` | Source camera |
| `global_id` | `string` | Re-ID stable identity |
| `first_seen_iso` | `string` | ISO 8601 UTC — first detection of this identity today |
| `last_seen_iso` | `string` | ISO 8601 UTC — most recent detection today (updated on each payload) |
| `total_time_seconds` | `integer` | Cumulative seconds visible today (Re-ID aware) |
| `alerts_triggered` | `AlertType[]` | Distinct alert types triggered today |
| `alert_count` | `integer` | Total alert documents written for this identity today |
| `peak_scores` | `PersonScores` | Highest score values reached at any point today |
| `zones_visited` | `string[]` | Names of zones this person entered today |
| `snapshot_url` | `string` \| `null` | Representative snapshot (from first or highest-severity alert today) |

---

### 6.2 REST Endpoint — `GET /api/activity-log`

Returns activity log entries for a given date, optionally filtered by camera.

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `date` | `string` | Yes | `YYYY-MM-DD` format |
| `camera_id` | `string` | No | Filter to a specific camera |

**Example:** `GET /api/activity-log?date=2026-05-04&camera_id=CAM_1001`

**Response — `200 OK`:**
```json
{
  "date": "2026-05-04",
  "camera_id": "CAM_1001",
  "entries": [
    {
      "log_id":             "log_20260504_G1_CAM1001",
      "date":               "2026-05-04",
      "camera_id":          "CAM_1001",
      "global_id":          "G-1",
      "first_seen_iso":     "2026-05-04T08:15:00.000Z",
      "last_seen_iso":      "2026-05-04T14:32:00.000Z",
      "total_time_seconds": 1847,
      "alerts_triggered":   ["loitering"],
      "alert_count":        2,
      "peak_scores": {
        "climbing_score":     0,
        "loitering_score":    90,
        "total_person_score": 54
      },
      "zones_visited":      ["Server Room Entrance"],
      "snapshot_url":       null
    }
  ],
  "total_entries": 1
}
```

**Error — `400 INVALID_PAYLOAD`:** Missing or malformed `date` parameter.

---

### 6.3 Backend — Upsert Logic (Python)

The Central Server upserts one log document per `(date, camera_id, global_id)` on each `/update` call received from the Edge Node.

```python
from datetime import datetime, timezone

def upsert_activity_log(camera_id, global_id, time_in_frame_seconds, zones_visited, alert_types, scores):
    now = datetime.now(timezone.utc)
    date_str = now.strftime('%Y-%m-%d')
    date_key = now.strftime('%Y%m%d')
    gid_clean = global_id.replace('-', '')
    cam_clean = camera_id.replace('_', '')
    log_id = f"log_{date_key}_{gid_clean}_{cam_clean}"

    ref = db.reference(f'/activity_log/{date_key}/{camera_id}/{log_id}')
    existing = ref.get() or {}

    existing_peaks = existing.get('peak_scores', {})
    ref.set({
        "log_id":             log_id,
        "date":               date_str,
        "camera_id":          camera_id,
        "global_id":          global_id,
        "first_seen_iso":     existing.get("first_seen_iso") or now.isoformat(),
        "last_seen_iso":      now.isoformat(),
        "total_time_seconds": time_in_frame_seconds,
        "alerts_triggered":   list(set(existing.get("alerts_triggered", []) + alert_types)),
        "alert_count":        existing.get("alert_count", 0) + len(alert_types),
        "peak_scores": {
            "climbing_score":     max(existing_peaks.get("climbing_score", 0),     scores["climbing_score"]),
            "loitering_score":    max(existing_peaks.get("loitering_score", 0),    scores["loitering_score"]),
            "total_person_score": max(existing_peaks.get("total_person_score", 0), scores["total_person_score"]),
        },
        "zones_visited":      list(set(existing.get("zones_visited", []) + zones_visited)),
        "snapshot_url":       existing.get("snapshot_url"),
    })
```

---

### 6.4 Frontend — Reading the Activity Log

```jsx
import { ref, onValue } from 'firebase/database';

// Option A: Real-time subscription (auto-updates as people enter/leave)
function subscribeToActivityLog(dateStr, cameraId, onUpdate) {
  const dateKey = dateStr.replace(/-/g, '');
  const logRef = ref(db, `/activity_log/${dateKey}/${cameraId}`);
  return onValue(logRef, (snapshot) => {
    const entries = snapshot.val() ? Object.values(snapshot.val()) : [];
    onUpdate(entries);
  });
}

// Option B: One-time REST fetch (for historical dates)
async function fetchActivityLog(date, cameraId) {
  const params = new URLSearchParams({ date });
  if (cameraId) params.append('camera_id', cameraId);
  const res = await fetch(`/api/activity-log?${params}`);
  return res.json();  // { date, camera_id, entries[], total_entries }
}
```

> **Guidance:** Use Option A (Firebase real-time) when displaying today's live activity table. Use Option B (REST) for historical date queries.

---

<a name="workflow-5"></a>
## 7. Workflow 5 — Dynamic Camera Configuration (NEW in v2.0)

### 7.1 Overview & Flow

Previously, RTSP connection details were hardcoded in the Edge Node. In v2.0, the Frontend sends configuration to the Central Server, which relays it to the Edge Node via a Socket.IO push event. **The Central Server never handles video — only the configuration handshake.**

```
Frontend
  └─► POST /api/cameras ──► Central Server
                                  │
                          stores config in DB
                                  │
                     emit 'camera_config' (Socket.IO)
                                  ▼
                             Edge Node
                                  │
                   connects to RTSP stream locally
                                  │
               POST /update (detections) ──► Central Server
```

---

### 7.2 POST `/api/cameras` — Register / Update Camera Config

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "camera_id":     "CAM_1001",
  "rtsp_url":      "rtsp://192.168.1.100:554/stream",
  "rtsp_username": "admin",
  "rtsp_password": "password123",
  "resolution":    "1920x1080",
  "fps_cap":       25
}
```

**Field Reference:**

| Field | Type | Required | Description |
|---|---|---|---|
| `camera_id` | `string` | Yes | Unique camera identifier |
| `rtsp_url` | `string` | Yes | Full RTSP URL. Do not embed credentials in the URL string. |
| `rtsp_username` | `string` | No | RTSP auth username |
| `rtsp_password` | `string` | No | RTSP auth password |
| `resolution` | `string` | No | Capture resolution hint, e.g. `"1920x1080"` |
| `fps_cap` | `integer` | No | Max frames per second for Edge capture |

**Success Response — `201 Created`:**
```json
{
  "camera_id":    "CAM_1001",
  "registered_at": "2026-05-04T10:00:00Z",
  "relay_status": "sent",
  "message":      "Camera config registered and relayed to edge node"
}
```

**`relay_status` values:**

| Value | Meaning |
|---|---|
| `"sent"` | Edge Node is currently connected; config was pushed immediately |
| `"queued"` | Edge Node is offline; config will be pushed on next reconnect |

---

### 7.3 GET `/api/cameras` — List Registered Cameras

**Response — `200 OK`:**
```json
{
  "cameras": [
    {
      "camera_id":     "CAM_1001",
      "rtsp_url":      "rtsp://192.168.1.100:554/stream",
      "rtsp_username": "admin",
      "rtsp_password": "***",
      "resolution":    "1920x1080",
      "fps_cap":       25,
      "registered_at": "2026-05-04T10:00:00Z",
      "status":        "connected"
    }
  ]
}
```

> **Security:** `rtsp_password` is always masked as `"***"` in GET responses. The full credential is only pushed to the Edge Node over the secure internal Socket.IO channel.

---

### 7.4 DELETE `/api/cameras/:camera_id` — Remove a Camera Config

**Response — `200 OK`:**
```json
{
  "camera_id": "CAM_1001",
  "message":   "Camera config removed"
}
```

---

### 7.5 Edge Node — Receiving the Config (Internal Socket.IO)

The Edge Node connects to the Central Server via Socket.IO. On receiving `camera_config`, it tears down the existing capture and opens a new RTSP connection locally.

**Event: `camera_config` (Central Server → Edge Node, internal)**

```json
{
  "camera_id":     "CAM_1001",
  "rtsp_url":      "rtsp://192.168.1.100:554/stream",
  "rtsp_username": "admin",
  "rtsp_password": "password123",
  "resolution":    "1920x1080",
  "fps_cap":       25
}
```

**Edge Node handler (Python):**
```python
import urllib.parse

@sio.on('camera_config')
def on_camera_config(data):
    camera_id = data['camera_id']
    rtsp_url   = data['rtsp_url']
    username   = data.get('rtsp_username')
    password   = data.get('rtsp_password')

    if username and password:
        # Embed credentials at the edge only — never transmitted publicly
        parsed = urllib.parse.urlparse(rtsp_url)
        rtsp_url = parsed._replace(
            netloc=f"{username}:{password}@{parsed.hostname}:{parsed.port}"
        ).geturl()

    # Tear down existing capture and reinitialize
    if camera_id in cameras and cameras[camera_id].isOpened():
        cameras[camera_id].release()

    cameras[camera_id] = cv2.VideoCapture(rtsp_url)
    print(f"[Edge] Camera {camera_id} configured from server push")
```

**Central Server relay (Python):**
```python
_edge_sessions = {}   # camera_id → socket_id, populated when edge connects

@app.route('/api/cameras', methods=['POST'])
def register_camera():
    config = request.get_json()
    camera_id = config.get('camera_id')
    if not camera_id or not config.get('rtsp_url'):
        return jsonify({"error": {"code": "INVALID_PAYLOAD", "message": "camera_id and rtsp_url are required", "http_status": 400}}), 400

    save_camera_config(camera_id, config)

    edge_sid = _edge_sessions.get(camera_id)
    if edge_sid:
        socketio.emit('camera_config', config, to=edge_sid)
        relay_status = "sent"
    else:
        relay_status = "queued"

    return jsonify({
        "camera_id":     camera_id,
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "relay_status":  relay_status,
        "message":       "Camera config registered and relayed to edge node"
    }), 201
```

---

<a name="scoring-kpi"></a>
## 8. Scoring KPI Specification (NEW in v2.0)

The scoring engine runs on the **Central Server** every time it processes a detection payload. Scores are computed per person, included in the `/update` response to the Edge Node, pushed to the Frontend via `tracking_update`, and stored in alert and activity-log documents in Firebase.

---

### 8.1 Climbing Score (0–100)

Measures the severity of climbing behavior.

```
climbing_score = min(climbing_event_count × 25, 100)
```

- `climbing_event_count`: server-side counter incremented for each consecutive frame where the person is classified as climbing, per `global_id`.
- Counter **resets to 0** if no climbing is detected for `climbing_decay_seconds = 120` seconds.
- 4 or more climbing detections → maximum score of 100.

**Interpretation:**

| Score | Label |
|---|---|
| 0 | None |
| 1–25 | Low |
| 26–50 | Moderate |
| 51–75 | Elevated |
| 76–100 | Critical |

---

### 8.2 Loitering Score (0–100)

Measures dwell time within a defined zone, scaled by the zone's sensitivity level.

```
raw_loitering    = min((dwell_seconds / rule.min_dwell_seconds) × 100, 100)
loitering_score  = min(round(raw_loitering × (zone_sensitivity / 3.0)), 100)
```

- `dwell_seconds`: seconds the person has spent inside the current zone during this visit.
- `zone_sensitivity / 3.0` normalizes around the default level 3 (neutral multiplier = 1.0).
- If the person is not inside any defined loitering zone, `loitering_score = 0`.

**Zone sensitivity multiplier table:**

| Sensitivity Level | Label | Multiplier | Effect on Score |
|---|---|---|---|
| 1 | Low | 0.33× | Strongly suppressed |
| 2 | Guarded | 0.67× | Reduced |
| 3 | Elevated (default) | 1.00× | Unchanged |
| 4 | High | 1.33× | Amplified |
| 5 | Critical | 1.67× | Strongly amplified |

---

### 8.3 Total Person Score (0–100)

Weighted combination of the two behavioral sub-scores.

```
total_person_score = round(0.4 × climbing_score + 0.6 × loitering_score)
```

Loitering in sensitive zones accounts for **60%** of the total risk assessment; climbing accounts for **40%**. This weighting reflects that sustained, zone-aware loitering is the primary security concern in most fixed-camera deployments.

---

### 8.4 Python Implementation

```python
def compute_scores(
    climbing_event_count: int,
    dwell_seconds: float,
    min_dwell_seconds: int,
    zone_sensitivity: int,   # 1–5; pass 0 if person is not in any loitering zone
) -> dict:

    # Climbing sub-score
    climbing_score = min(climbing_event_count * 25, 100)

    # Loitering sub-score
    if zone_sensitivity and zone_sensitivity > 0:
        raw = min((dwell_seconds / max(min_dwell_seconds, 1)) * 100.0, 100.0)
        loitering_score = min(round(raw * (zone_sensitivity / 3.0)), 100)
    else:
        loitering_score = 0

    # Weighted total
    total_person_score = round(0.4 * climbing_score + 0.6 * loitering_score)

    return {
        "climbing_score":     climbing_score,
        "loitering_score":    loitering_score,
        "total_person_score": total_person_score,
    }
```

---

<a name="auth"></a>
## 9. Authentication Notes

> Authentication is **not yet implemented**. This section defines the intended contract for when it is added (recommended before any cloud deployment).

- All REST endpoints under `/api/*` will require an `Authorization: Bearer <jwt>` header.
- The Socket.IO connection will pass the JWT in the `auth` handshake option:
  ```js
  io(SERVER_URL, { auth: { token: jwtToken } })
  ```
- Firebase client-side access should use Firebase Auth with custom tokens minted by the Central Server, **not** the service account key directly in frontend code.

---

<a name="errors"></a>
## 10. Error Handling Contract

All REST endpoints return errors in this unified format:

```json
{
  "error": {
    "code": "RULE_NOT_FOUND",
    "message": "No rule with id 'rule_xyz' exists for camera CAM_1001",
    "http_status": 404
  }
}
```

**Standard error codes:**

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | Malformed JSON or missing required field |
| 400 | `INVALID_GEOMETRY` | Polygon has fewer than 3 points; line does not have exactly 2 |
| 400 | `INVALID_DATE` | `date` parameter is missing or not in `YYYY-MM-DD` format |
| 404 | `RULE_NOT_FOUND` | Rule ID does not exist |
| 404 | `CAMERA_NOT_FOUND` | Camera ID is not registered |
| 404 | `CAMERA_CONFIG_NOT_FOUND` | Camera ID has no registered configuration **(NEW v2.0)** |
| 409 | `DUPLICATE_RULE` | A rule with the same name already exists for this camera |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

**Socket.IO disconnection codes the frontend must handle:**

| Reason | Frontend Action |
|---|---|
| `"transport error"` | Show "Reconnecting…" spinner; Socket.IO auto-reconnects |
| `"server namespace disconnect"` | Show "Session ended" message; do not auto-reconnect |
| `"ping timeout"` | Show "Connection lost" banner; Socket.IO auto-reconnects |

---

*This document is the source of truth for frontend ↔ backend integration.
All schema changes must be reflected here before being implemented on either side.*

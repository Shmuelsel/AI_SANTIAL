# Smart Eye — Frontend Integration Guide (v1.0 → v2.1)

**For:** Frontend Developer (React/Node.js)
**From:** Backend Developer
**Date:** 2026-05-04
**Contract Version:** 2.1

---

## Summary

Contract v2.1 adds one new field (`trigger_type`) to alert documents on top of the four features from v2.0. There are **no breaking changes**.

You have five areas of work:

| # | Feature | Work Required |
|---|---|---|
| 1 | Live KPI Scores per Person | Read 3 new fields from an existing Socket.IO event |
| 2 | Daily Activity Log | New UI table backed by Firebase or a new REST endpoint |
| 3 | Zone Sensitivity Level | Add a 1–5 slider to the zone creation form |
| 4 | Dynamic Camera Configuration | New settings form + 3 new REST calls |
| 5 | Alert `trigger_type` field | Display WHY an alert fired in the alert card **(NEW v2.1)** |

---

## Change 1 — Live KPI Scores in `tracking_update`

### What changed

Each person object in the `tracking_update` Socket.IO event now includes a `scores` field:

```json
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
```

All three scores are integers in the range **0–100**.

### What the scores mean

| Score | What it represents |
|---|---|
| `climbing_score` | How severe the climbing activity is (0 = none, 100 = 4+ events) |
| `loitering_score` | How long the person has been in a restricted zone, scaled by the zone's danger level |
| `total_person_score` | Overall risk score (60% loitering, 40% climbing) |

### What you need to build

Display these scores in the live person tracking panel. A suggested colour scale:

| Score Range | Colour |
|---|---|
| 0 | Grey (no risk) |
| 1–33 | Green |
| 34–66 | Yellow |
| 67–100 | Red |

**React handler update (no change to the subscription — just read the new field):**

```jsx
socket.on('tracking_update', ({ camera_id, timestamp, persons }) => {
  setPersons(persons.map(p => ({
    ...p,
    climbingScore:    p.scores?.climbing_score     ?? 0,
    loiteringScore:   p.scores?.loitering_score    ?? 0,
    totalScore:       p.scores?.total_person_score ?? 0,
  })));
});
```

### Scores also appear in Firebase alerts

When an alert fires, its document in `/alerts/{camera_id}/{alert_id}` now includes:

```json
"scores": {
  "climbing_score":     0,
  "loitering_score":    80,
  "total_person_score": 48
},
"location": {
  ...,
  "zone_sensitivity": 4
}
```

You can display these on the alert detail card if you wish — no subscription change needed.

---

## Change 2 — Daily Activity Log

### What's new

A new Firebase path and a new REST endpoint are available. Both expose a per-person, per-camera, per-day activity summary.

### Firebase path (real-time)

```
/activity_log/{YYYYMMDD}/{camera_id}/{log_id}
```

**Example for today, CAM_1001:**
```
/activity_log/20260504/CAM_1001/
```

Each child document looks like:

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

### REST endpoint (historical dates)

```
GET /api/activity-log?date=YYYY-MM-DD&camera_id=CAM_1001
```

Returns:
```json
{
  "date": "2026-05-04",
  "camera_id": "CAM_1001",
  "entries": [ ...ActivityLogEntry objects... ],
  "total_entries": 1
}
```

### What you need to build

An **Activity Log page / tab** with a data table. Suggested columns:

| Column | Source Field |
|---|---|
| Person ID | `global_id` |
| First Seen | `first_seen_iso` (format to local time) |
| Last Seen | `last_seen_iso` |
| Time on Camera | `total_time_seconds` → format as `HH:MM:SS` |
| Alerts | `alert_count` + `alerts_triggered` (badge per type) |
| Peak Risk Score | `peak_scores.total_person_score` (coloured chip) |
| Zones Visited | `zones_visited` (comma-separated) |

**React subscription for today's live table:**

```jsx
import { ref, onValue } from 'firebase/database';

function useActivityLog(cameraId) {
  const [entries, setEntries] = React.useState([]);

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const logRef = ref(db, `/activity_log/${today}/${cameraId}`);
    const unsub = onValue(logRef, (snap) => {
      setEntries(snap.val() ? Object.values(snap.val()) : []);
    });
    return () => unsub();
  }, [cameraId]);

  return entries;
}
```

**REST fetch for a historical date:**

```jsx
async function loadHistoricalLog(date, cameraId) {
  const res = await fetch(`/api/activity-log?date=${date}&camera_id=${cameraId}`);
  const json = await res.json();
  return json.entries;
}
```

---

## Change 3 — Zone Sensitivity Level

### What changed

When creating or editing a zone rule, you can now send a `sensitivity_level` field (integer 1–5). The backend uses this to multiply the loitering risk score for anyone detected inside that zone.

The field is **optional** — if omitted, the backend defaults to `3` (neutral). Existing zones already saved without this field behave as if they have `sensitivity_level: 3`.

### Updated POST `/api/rules` request body

Add `sensitivity_level` alongside the existing fields:

```json
{
  "camera_id":       "CAM_1001",
  "rule_type":       "zone",
  "name":            "Server Room Entrance",
  "alert_type":      "loitering",
  "active":          true,
  "sensitivity_level": 4,
  "geometry":        { ... },
  "conditions":      { ... }
}
```

It is also patchable via `PATCH /api/rules/:rule_id`:

```json
{ "sensitivity_level": 5 }
```

### `sensitivity_level` is returned in GET `/api/rules`

Every zone rule in the list response now includes `sensitivity_level`. You can use it to display a severity badge next to each zone in the rules table.

### What you need to build

In the **zone creation / edit form**, add a sensitivity selector. A 5-step slider or segmented control works well:

| Value | Label | Suggested colour |
|---|---|---|
| 1 | Low | Blue |
| 2 | Guarded | Green |
| 3 | Elevated (default) | Yellow |
| 4 | High | Orange |
| 5 | Critical | Red |

No other form changes are needed.

---

## Change 4 — Dynamic Camera Configuration

### What changed

Camera RTSP connection details are no longer hardcoded on the server. The operator now configures them through the UI. Three new endpoints handle this.

### New endpoints

#### Register or update a camera

```
POST /api/cameras
Content-Type: application/json
```

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

Response:
```json
{
  "camera_id":     "CAM_1001",
  "registered_at": "2026-05-04T10:00:00Z",
  "relay_status":  "sent",
  "message":       "Camera config registered and relayed to edge node"
}
```

Check `relay_status` in the response:
- `"sent"` → the edge node received the config immediately; show a success toast.
- `"queued"` → the edge node is offline; show a warning: _"Config saved. Will be applied when the edge node reconnects."_

#### List all registered cameras

```
GET /api/cameras
```

Response:
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

> `rtsp_password` is always `"***"` in GET responses. Never try to read back the real password.

#### Remove a camera

```
DELETE /api/cameras/CAM_1001
```

Response:
```json
{ "camera_id": "CAM_1001", "message": "Camera config removed" }
```

### What you need to build

A **Camera Management page / section** with:

1. **Camera list table** — pulls from `GET /api/cameras`. Columns: Camera ID, RTSP URL, Resolution, FPS Cap, Status (connected/disconnected), Registered At.

2. **Add / Edit camera form** with fields:
   - Camera ID (text, required)
   - RTSP URL (text, required) — validate it starts with `rtsp://`
   - Username (text, optional)
   - Password (password input, optional) — show only on entry, never populate from GET
   - Resolution (text, optional, placeholder `"1920x1080"`)
   - FPS Cap (number, optional)

3. **Submit** sends `POST /api/cameras`. Show the `relay_status` in the confirmation message.

4. **Delete** button calls `DELETE /api/cameras/:camera_id` with a confirmation dialog.

**Example fetch (add camera):**

```jsx
async function registerCamera(formData) {
  const res = await fetch('/api/cameras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });
  const json = await res.json();

  if (!res.ok) throw new Error(json.error?.message ?? 'Unknown error');

  if (json.relay_status === 'queued') {
    showWarning('Config saved. Edge node is offline — will apply on reconnect.');
  } else {
    showSuccess('Camera configured successfully.');
  }
  return json;
}
```

---

## Change 5 — Alert `trigger_type` Field (NEW in v2.1)

### What changed

Every alert document in Firebase now includes a `trigger_type` field that explains exactly **why** the alert was fired. This is in addition to the existing `alert_type` field.

```json
{
  "alert_id":    "alert_20260504_100000_G1",
  "alert_type":  "loitering",
  "trigger_type": "LOITERING",
  ...
}
```

### The four trigger types

| `trigger_type` | `alert_type` | Meaning |
|---|---|---|
| `"CLIMBING"` | `"climbing"` | Person triggered ≥ 2 climbing detections. Fires regardless of loitering state. |
| `"LOITERING"` | `"loitering"` | Person's zone-dwell score crossed the loitering threshold. Fires regardless of climbing state. |
| `"COMBINED"` | `"combined"` | Neither climbing nor loitering alone crossed their threshold, but the weighted combination (total score ≥ 50) indicates meaningful risk. Both behaviors are partially present. |
| `"INTRUSION"` | `"intrusion"` | Person crossed a tripwire. Pure spatial event — fires immediately regardless of scores. |

### Key rules for the UI

1. **Multiple alerts can fire in the same cycle.** A person who climbs into a restricted zone can fire both `CLIMBING` and `LOITERING` as separate alert documents within the same minute (each on its own 60-second cooldown).

2. **`COMBINED` is mutually exclusive with `CLIMBING` and `LOITERING`.** If either pure threshold is met, `COMBINED` is suppressed. Only show `COMBINED` when both individual scores are below their thresholds.

3. **Don't rely solely on `alert_type` for display.** Use `trigger_type` for the badge/reason label; use `alert_type` to decide icon and routing.

### Suggested UI treatment

```jsx
const TRIGGER_LABELS = {
  CLIMBING:  { label: 'Climbing Detected',      color: 'red',    icon: '⚠️' },
  LOITERING: { label: 'Loitering in Zone',       color: 'orange', icon: '⏱️' },
  COMBINED:  { label: 'Combined Risk Detected',  color: 'purple', icon: '🔗' },
  INTRUSION: { label: 'Perimeter Crossed',       color: 'red',    icon: '🚨' },
};

function AlertCard({ alert }) {
  const trigger = TRIGGER_LABELS[alert.trigger_type] ?? { label: alert.alert_type, color: 'grey' };
  return (
    <div className={`alert-card alert-card--${trigger.color}`}>
      <span className="alert-badge">{trigger.label}</span>
      <p>Identity: {alert.global_id}</p>
      {alert.scores && (
        <p>
          Climbing: {alert.scores.climbing_score} |
          Loitering: {alert.scores.loitering_score} |
          Total: {alert.scores.total_person_score}
        </p>
      )}
    </div>
  );
}
```

### How to filter alerts by trigger type (Firebase)

```jsx
// Listen to all alerts for a camera, filter to COMBINED only
function subscribeToCombinedAlerts(cameraId, onAlert) {
  const alertsRef = ref(db, `/alerts/${cameraId}`);
  onChildAdded(alertsRef, (snap) => {
    const alert = snap.val();
    if (alert.trigger_type === 'COMBINED' && alert.status === 'open') {
      onAlert(alert);
    }
  });
}
```

---

## New Error Code to Handle

One new error code was added to the standard error schema:

| Code | HTTP | When you'll see it |
|---|---|---|
| `CAMERA_CONFIG_NOT_FOUND` | 404 | `DELETE /api/cameras/:id` for an ID that doesn't exist |
| `INVALID_DATE` | 400 | `GET /api/activity-log` with a bad `date` param |

Handle these the same way as existing error codes.

---

## Quick Reference — What You Need to Implement

| Task | Type | Priority |
|---|---|---|
| Read `scores` from `tracking_update` and display in person panel | Read existing event | High |
| Display `scores` and `zone_sensitivity` in alert detail card | Read existing Firebase | Low |
| Activity log table (today, live via Firebase) | New Firebase subscription | High |
| Activity log table (historical, via REST) | New REST call | Medium |
| Add `sensitivity_level` slider to zone creation form | Form change + existing POST | Medium |
| Show `sensitivity_level` badge in rules list | Read existing GET field | Low |
| Camera management page (list, add, delete) | New page + 3 REST calls | High |
| Display `trigger_type` badge on alert cards | Read existing Firebase field | High |
| Filter alert panel by `trigger_type` | Read existing Firebase field | Medium |

---

*Questions about this guide? Raise them with the backend developer before implementation — the contract is the source of truth.*

# SecureGuard AI — Front-End Engineering Report
### Knowledge base for the final-project defense presentation (Front-End track)

> **Author's role on the team:** Front-End Development (React SPA — the "operator console" of the SecureGuard AI surveillance platform).
> **Teammates:** Israel (Server-side / Back-end, Flask + REST + Socket.IO + Azure hosting), Yonatan (AI/Detection Logic — computer-vision pipeline that produces detections, tracking data and alerts).
> **Purpose of this document:** A long-form, structured transcription of the Front-End codebase, intended as source material for NotebookLM to generate presentation slides. Every section below maps to a concrete part of the codebase (file paths included) so that claims can be traced back to real code during Q&A.

---

## 1. Project Overview

**SecureGuard AI** is a web-based **video-surveillance operator console**. It is the human-facing layer of an AI-powered security system: cameras stream video to a back-end, an AI pipeline (built by Yonatan) detects people, tracks them, scores their behaviour (e.g., climbing, loitering), and raises alerts; the back-end (built by Israel) exposes this data over REST and WebSocket channels and stores alerts in a real-time database. **My job was to design and build the entire Front-End** — the dashboard, the live monitoring room, the investigation tools, camera administration, system settings, and the authentication layer that ties it all together.

The application is branded **"SecureGuard AI"** with a dark "security operations center" aesthetic (deep slate background, indigo accent colour, status pills, glassmorphism panels) consistent across every screen.

---

## 2. Architecture & Tech Stack

### 2.1 Core framework & build tooling
- **React 19.2** — function components with Hooks exclusively (no class components). The whole UI is a Single-Page Application (SPA).
- **Vite 7** — the build tool and dev server (`vite.config.js`, scripts in `package.json`: `dev`, `build`, `lint`, `preview`).
- **@vitejs/plugin-react-swc** — uses the Rust-based SWC compiler for fast refresh / compilation instead of Babel, for faster local dev cycles.
- **ESLint 9** (flat config, `eslint.config.js`) with `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh` to enforce Hooks rules and Fast-Refresh-friendly exports.

### 2.2 Styling / UI
- **Tailwind CSS v4** via the official `@tailwindcss/vite` plugin — utility-first styling with **no separate config file** (Tailwind v4's CSS-first approach; the only "entry" is `@import "tailwindcss";` in `src/style.css`, which is linked directly from `index.html`).
- A consistent **dark theme design system** built entirely from Tailwind utility classes: `slate-950/900/800` backgrounds, `indigo-600` as the primary accent, semantic colours for status (emerald = success/online, red = danger/critical, amber/yellow = warning, purple = combined risk, cyan = zone heat).
- **lucide-react** — icon library used throughout (e.g., `ShieldCheck`, `LayoutDashboard`, `Video`, `AlertTriangle`, `Cctv`, `Users`, `LogOut`, etc.) for crisp, consistent SVG iconography.
- **recharts** — charting library (Area, Pie, Bar charts) used to visualise alert statistics on the Dashboard.
- Legacy/template CSS files (`index.css`, `App.css`) are remnants of the original Vite+React scaffold and are largely superseded by Tailwind; `test.css` is a small leftover experimental file.

### 2.3 Real-time & data communication
- **firebase v12** (modular SDK) — `firebase/app`, `firebase/auth`, `firebase/analytics`, `firebase/firestore`, and (the actively used one) `firebase/database` (Realtime Database). Configured in `src/firebase.js` from environment variables.
- **socket.io-client** — maintains a persistent WebSocket (with polling fallback) connection to the back-end for the live video room (frames, detections, tracking updates, zone configuration).
- **Native Fetch API** — all REST calls use the browser's built-in `fetch`, not Axios. Wrapped in `try/catch` with consistent error logging and graceful fallback UI.
- **react-router-dom v7** — client-side routing (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `NavLink`, `Outlet`).

### 2.4 Overall architectural style
The Front-End follows a **layered, page-oriented SPA architecture**:

```
main.jsx  →  App.jsx (auth gate + router)
                 │
                 ├── Login (public)
                 └── MainLayout (protected shell: Sidebar + Header + <Outlet/>)
                          ├── Dashboard
                          ├── LiveRoom
                          ├── Logs
                          ├── ActivityLog
                          ├── CameraManagement
                          ├── Users (placeholder)
                          └── Settings
```

There is **no global state-management library** (no Redux/MobX/Zustand/React Query). Instead, the architecture relies on:
1. **Component-local state** (`useState`/`useReducer`-free, `useEffect`, `useMemo`, `useRef`, `useCallback`) for UI state.
2. **Firebase Realtime Database listeners** acting as a de-facto shared, real-time "data backbone" — multiple pages independently subscribe to the same `/alerts` node and stay in sync without any client-side store.
3. **REST polling + WebSocket push** for everything that isn't naturally real-time (stats, camera lists, historical data).

This is a deliberate, pragmatic choice for a project of this size: real-time consistency is delegated to Firebase/Socket.IO rather than re-implemented in a client store, which avoids an entire category of cache-invalidation bugs while keeping the codebase approachable.

---

## 3. Project Structure

```
src/
├── main.jsx              # React entry point — mounts <App/> in StrictMode
├── App.jsx               # Root component: Firebase auth listener, route table, backend health banner
├── firebase.js           # Firebase app initialisation (auth, Firestore, Realtime DB, analytics)
├── config.js             # SERVER_URL — single source of truth for the backend base URL
│
├── layouts/
│   └── MainLayout.jsx    # Shared app shell: Sidebar + top header + <Outlet/> for routed pages
│
├── components/           # Reusable, cross-page UI building blocks
│   ├── Sidebar.jsx       # Left navigation menu (route links, active-state highlighting, logout)
│   ├── DrawingOverlay.jsx# Canvas-based interactive tool for drawing restricted zones (VCA rules)
│   └── CameraStream.jsx  # Early/experimental local-webcam viewer (getUserMedia) — exploratory module
│
├── pages/                # Route-level "screen" components (one per nav item)
│   ├── Login.jsx
│   ├── Dashboard.jsx
│   ├── LiveRoom.jsx
│   ├── Logs.jsx
│   ├── ActivityLog.jsx
│   ├── CameraManagement.jsx
│   └── Settings.jsx
│
├── utils/
│   └── alertHelpers.js   # Shared, framework-agnostic display helpers (score colours, trigger labels)
│
├── assets/               # Static assets (e.g., react.svg)
└── *.css                 # style.css (Tailwind entry), index.css/App.css (Vite template remnants), test.css
```

**Organisational philosophy:**
- **`pages/`** holds one component per route — each owns its data-fetching, local state, and renders a full screen.
- **`components/`** holds genuinely reusable pieces that are either shared across pages (Sidebar, used by `MainLayout`) or are complex enough to be extracted from a page (DrawingOverlay, extracted from `LiveRoom`).
- **`layouts/`** isolates the "chrome" (navigation shell) from the routed content via React Router's nested-route `<Outlet/>` mechanism, so every protected page automatically gets the sidebar/header without repeating markup.
- **`utils/`** contains pure, React-free helper functions — explicitly documented in the file's header comment as "free of React imports so it can be used in plain JS too," ensuring they can be unit-tested or reused outside the component tree.
- **`config.js` / `firebase.js`** centralise environment-driven configuration so that no component ever talks to `import.meta.env` directly — a single, documented "source of truth" pattern that makes switching between local development (Vite proxy) and production (direct Azure URL) a one-line change.

---

## 4. Key Components & Views

The application has **7 routed screens** plus a shared layout/navigation shell. Below is a detailed walkthrough of each, in order of complexity.

### 4.1 `Login` (`pages/Login.jsx`) — Authentication Gateway
A polished, centred card-style login form ("SecureGuard AI — Operator Authentication Required") with:
- Email + password fields with icon prefixes (`User`, `Lock` from lucide-react), focus-ring styling, and placeholder text.
- Calls Firebase's `signInWithEmailAndPassword(auth, email, password)` directly — **no custom backend auth endpoint**; authentication is fully delegated to Firebase Auth.
- **Mapped, human-readable error messages** keyed off Firebase error codes (`auth/invalid-credential` → "Incorrect email or password.", `auth/too-many-requests` → "Access temporarily blocked due to too many failed attempts.", generic fallback otherwise).
- A loading spinner state (`isLoading`) that disables the submit button and swaps its label/icon to "Verifying Credentials…".
- **No explicit navigation on success** — by design, the redirect back to the app is handled centrally by `App.jsx`'s `onAuthStateChanged` listener, keeping the login form a "dumb" presentational+submission component.

### 4.2 `Dashboard` (`pages/Dashboard.jsx`) — System Overview (Home/Index Route)
The most **data-visualisation-heavy** page — effectively the security operations "mission control" view. It combines **three independent data sources** into one cohesive view:

1. **Live Firebase Realtime Database listener** on `/alerts` (via `onValue`) — flattens the nested `{camera_id: {alert_id: alert}}` structure into a flat list and derives, **entirely client-side**:
   - KPI counts: total alerts, resolved ("false alarms"), acknowledged ("threats").
   - An hourly **detection-trend bucket** (groups alerts by hour-of-day for the area chart).
   - A **trigger-type distribution** (counts per `CLIMBING` / `LOITERING` / `COMBINED` / `INTRUSION`).
   - **Alerts-per-camera** counts (for the bar chart).
   - **Top-6 zones by alert frequency** (filters and ranks by `location.zone_name`).
2. **REST polling of `GET /api/stats`** every 30 seconds — supplies the *authoritative* total-alert count, system-health percentages (CPU load, DB storage, AI latency, network), and an optional server-computed detection trend that overrides the client-computed one when present.
3. **REST fetch of `GET /api/cameras`** — used purely to compute an "Online / Total" camera ratio for a KPI card.

**Visualisations (via Recharts):**
- An **`AreaChart`** with a gradient fill showing total vs. resolved alerts per hour, plus a custom dark-themed tooltip (`DarkTooltip`) and an `EmptyChart` placeholder for the no-data state.
- A **donut `PieChart`** of trigger-type distribution with a custom legend renderer (`renderPieLegend`) and colour-coded "quick count chips" below it, using a dedicated `TRIGGER_PALETTE` colour map that mirrors the shared `alertHelpers` labels.
- A **vertical `BarChart`** of alerts-per-camera that dynamically highlights the busiest camera with a brighter fill colour (computed via `Math.max` over the dataset).
- A **horizontal `BarChart`** of top alert zones with a **computed colour-intensity gradient** — bar opacity is interpolated between a dim and bright cyan based on each zone's share of the maximum count (`0.4 + intensity * 0.6`), giving an intuitive "heat" visual without needing a colour-scale library.
- Four **`StatCard`** KPI tiles (Total Alerts, Resolved Alerts, Acknowledged Threats, Active Cameras) and four **`HealthBar`** progress bars (Server Load, DB Storage, AI Latency, Network Traffic), both implemented as small reusable internal sub-components with colour-coded variants.
- A **live wall clock** (`setInterval` ticking every second) displayed as "Last system check."

This page is a strong example of **fusing a push-based real-time feed with pull-based REST polling**, reconciling them into one consistent view, and turning raw alert documents into multiple derived chart-ready datasets purely with `Array.reduce`/`map`/`filter`/`sort` — no data-viz backend endpoint was required for most of these breakdowns.

### 4.3 `LiveRoom` (`pages/LiveRoom.jsx`) — Real-Time Monitoring Console ⭐ *Most complex screen*
This is the **operational heart of the app** — a live video-monitoring station where an operator watches a camera feed annotated by the AI in real time and makes "confirm / dismiss" decisions on detected threats. It is built almost entirely around a **Socket.IO connection** plus a **canvas-based rendering pipeline**:

- **WebSocket lifecycle** (`useEffect` + `useRef` to hold the socket instance):
  - Connects via `io(SERVER_URL || undefined, { transports: ['websocket','polling'], reconnectionAttempts: 5 })`. The `undefined` fallback is a deliberate detail — it lets Socket.IO connect to "the page's own origin" when running through the Vite dev proxy (so `SERVER_URL` can stay an empty string without breaking the connection).
  - On `connect`, immediately emits `subscribe_camera` to start receiving a specific camera's stream (`CAM_1001`).
  - Listens for **`processed_frame`** — a base64 data-URI representing each AI-annotated video frame, rendered into an `<img>` element (an MJPEG-like "frame push" pattern rather than `<video>`/WebRTC).
  - Listens for **`restricted_zone_updated`** — receives the operator-confirmed VCA (Video Content Analysis) zone polygon and renders it as a persistent translucent SVG overlay on top of the video.
  - Listens for **`alert_batch`** — a batch of newly detected objects; stores them as `activeDetections` (drives the bounding-box overlay and the decision buttons) and prepends the first one to a rolling 10-item `alerts` history.
  - Listens for **`tracking_update`** — live per-person tracking data; **decouples raw scores from the wire format** into a flat, render-friendly shape (`climbingScore`, `loiteringScore`, `totalScore`) with safe optional-chaining defaults.
- **Canvas overlay rendering** (`useEffect` synced to `activeDetections`): a hand-written `drawSingleBox` function converts **normalised bounding-box coordinates** (`x, y, w, h` in the 0–1 range) into pixel rectangles sized to the actual rendered `<img>` dimensions, draws a green rectangle, and overlays a label + confidence percentage — entirely with the Canvas 2D API (`ctx.rect`, `ctx.fillRect`, `ctx.fillText`). The canvas is automatically resized to match the image's `clientWidth/clientHeight` to stay pixel-accurate at any viewport size, and is hidden (`opacity-0`) while the operator is in zone-drawing mode so it doesn't intercept clicks.
- **Dual-channel alert ingestion**: in addition to the `alert_batch` socket event, the page **independently subscribes to Firebase Realtime Database** (`onChildAdded` on `/alerts/CAM_1001`) so that alerts persisted by the back-end also surface in the "Recent Alerts" panel — a deliberate redundancy that keeps the UI populated even if one channel lags.
- **Operator decision workflow** (`handleDecision`): when the operator clicks **"Confirm Alarm"** or **"Mark as False"**, the app does **two things simultaneously** — emits a `feedback` event over the live socket (for immediate AI feedback-loop use) **and** `POST`s the same payload to `REST /api/feedback` (for durable persistence) — then clears the active detection queue.
- **Two stacked side panels:**
  - **"Live Tracking"** — a real-time roster of tracked persons, each rendered as a card with a global ID, a colour-coded total-risk badge, and three KPI "score pills" (Climb / Loiter / Total) rendered via the shared `ScorePill` sub-component and `getScoreStyle` helper, plus chips for any active alert types.
  - **"Recent Alerts"** — a scrollable feed of the latest alerts, each showing the alert type, a precise HH:MM:SS timestamp parsed out of an ISO string, a colour-coded **trigger-type badge** (via the shared `TRIGGER_LABELS` map), a severity chip, compact `C/L/T` KPI score chips, and the zone name if present.
- **VCA Zone Drawing toggle**: a button that switches the canvas into "drawing mode," mounting the `DrawingOverlay` component (see §4.7) on top of the video feed and wiring its `onSubmitZone` callback to broadcast the new zone live over the socket (`update_restricted_zone`).
- **Status bar & decision buttons**: a live "Scanning Area…" / "⚠️ DETECTED: N Objects Moving" status line with a pulsing "MOTION" badge, and two large action buttons that are conditionally enabled/styled based on whether there is an active detection and whether the operator is currently drawing a zone.

### 4.4 `Logs` (`pages/Logs.jsx`) — Events Log & Investigation Workspace
A full **searchable, filterable, exportable audit table** for historical alerts, plus a rich **investigation modal**:

- **Two-source data loading**: seeds the table from `GET /api/events` on mount (normalising inconsistent field names from the back-end — e.g. `event_type ?? alert_type`, `timestamp ?? timestamp_iso`, `person_id ?? global_id` — into one canonical shape), **then** layers a live Firebase Realtime Database `onValue` listener on `/alerts` on top, which becomes the source of truth once it fires (the REST result is only kept if Firebase hasn't responded yet — `setLogs(prev => prev.length === 0 ? normalized : prev)`).
- **Multi-criteria client-side filtering** via `useMemo`: free-text search (matches camera ID or alert ID, case-insensitive), status filter (`all`/`acknowledged`/`resolved`/`open`), **trigger-type filter** (`all`/`CLIMBING`/`LOITERING`/`COMBINED`/`INTRUSION`), and a date filter (matches the ISO date prefix of the timestamp). All four predicates are combined with logical AND, recomputed only when their dependencies change (`useMemo` for performance).
- **CSV export** (`handleExportCSV`): builds a CSV string client-side from the *currently filtered* rows — including correct quoting/escaping of embedded quotes (`cell.replace(/"/g, '""')`) — wraps it in a `Blob`, creates an object URL, and programmatically triggers a download named with today's date (`secureguard-events-YYYY-MM-DD.csv`), then revokes the object URL to avoid memory leaks. No external library used.
- **`EventModal`** — a full investigation detail view triggered by an "eye" icon per row:
  - Displays a large snapshot image (with a placeholder fallback), an "AI Detected: <type>" badge, and a trigger-type badge.
  - A details grid: timestamp (localised), source camera, severity, current status (colour-coded text per state), KPI scores (via the shared `ScoreRow` sub-component), and zone info including a numeric "sensitivity" indicator.
  - **Operator actions**: "Mark as Resolved" / "Acknowledge Threat" buttons that call `handleUpdateStatus`, which performs an **optimistic UI update** (updates local state immediately for both the table row and the open modal) and then persists the change with Firebase's `update(ref(database, '/alerts/{cameraId}/{alertId}'), { status })`.
- **Status badges & severity chips**: colour-coded pill components (`getStatusBadge`) differentiating "Acknowledged" (red), "Resolved" (emerald), and "Open" (yellow) states, each with a matching icon.
- A polished **filter bar** with icon-prefixed search input, status dropdown, trigger-type dropdown (with emoji-enhanced option labels: "⚠️ Climbing", "⏱ Loitering", "🔀 Combined Risk", "🚨 Intrusion"), and a native date picker styled for dark mode (`scheme-dark`).
- Loading and empty states are explicitly designed (spinner row, "No logs found matching your filters" with a `Ban` icon).

### 4.5 `ActivityLog` (`pages/ActivityLog.jsx`) — Per-Person Daily Activity Audit
A reporting screen that answers "who was seen on which camera, for how long, and how risky were they, on a given day?" Notable engineering decisions:

- **Hybrid "live vs. historical" data-source switching**: the component computes `isToday = dateFilter === todayISO` and conditionally runs **one of two mutually exclusive `useEffect` hooks**:
  - *Today* → subscribes live to Firebase Realtime Database at a date-and-camera-scoped path (`/activity_log/{YYYYMMDD}/{camera_id}`) via `onValue`, so the table updates in real time as the day progresses (shown with a pulsing green "Live" badge).
  - *Past dates* → calls `GET /api/activity-log?date=...&camera_id=...` (with a `cancelled` flag guard to avoid race conditions/state updates after unmount), parses structured server error bodies (`body.error.message`), and populates the table from the REST response.
- **Filter controls**: a date picker capped at "today" (`max={todayISO}`) and a camera selector populated from a small constant array (`CAM_1001/1002/1003`).
v- **Custom duration formatter** (`formatDuration`) — converts a raw seconds count into an `HH:MM:SS` string with zero-padding, written from scratch with `Math.floor`/modulo arithmetic.
- **Rich per-row rendering**: first-seen/last-seen timestamps (split into localized date + time), total time on camera, an alert-count badge plus a row of colour-coded alert-type chips (via the shared `ALERT_TYPE_COLORS` map), a **`RiskChip`** showing the person's peak `total_person_score` (colour graded via `getScoreStyle`), and a comma-joined list of visited zones.
- Carefully designed loading/empty states, including a contextual empty message that names the selected camera and date.

### 4.6 `CameraManagement` (`pages/CameraManagement.jsx`) — Device Administration (Full CRUD)
A complete **create / read / update / delete** interface for camera devices, demonstrating the most form-heavy and feedback-rich UI in the app:

- **`fetchCameras`** loads `GET /api/cameras` and maps the response into a table with **live status badges** (`StatusBadge`: Connected / Disconnected / Reconnecting, each with a coloured, optionally pulsing/glowing dot).
- **`CameraFormModal`** — a dual-purpose Add/Edit modal:
  - **Client-side validation** (`validate`): required Camera ID and RTSP URL, RTSP URL must start with `rtsp://`, FPS cap must be a positive number if provided — all enforced *before* hitting the network, with field-level error messages rendered by a small reusable `Field` wrapper component.
  - On edit, the **Camera ID field is locked** (`disabled` — IDs are immutable post-creation) and the password field is intentionally left blank (the back-end never returns stored passwords — "masked as ***").
  - Builds a **sparse request body** — optional fields (`username`, `password`, `resolution`, `fps_cap`) are only included via conditional spread (`...(value && { key: value })`) if the operator actually filled them in, avoiding overwriting server-side data with empty strings.
  - Submits via `POST /api/cameras`, surfaces server-side validation errors inline, and reports success back up via an `onSaved(json)` callback that carries the server's `relay_status`.
- **Delete confirmation modal** — a dedicated "Delete Camera?" dialog (rather than a native `confirm()`), explaining the consequence ("the edge node will stop streaming…") before calling `DELETE /api/cameras/:id`, with explicit handling of the `CAMERA_CONFIG_NOT_FOUND` API error code.
- **Custom toast notification system** (`ToastList`/`pushToast`/`dismissToast`) — built from scratch with a module-level incrementing ID counter, an array of `{id, message, type}` objects in state, colour-coded styling per type (`success`/`warning`/`error`) with matching icons, auto-dismissal via `setTimeout` (6 seconds), and manual dismissal via a close button. Used to report outcomes such as **"Config saved — Edge node is offline, will apply on reconnect"** (a `relay_status === 'queued'` warning state) versus a hard success.
- A **legend** at the bottom explaining the status-dot colour coding and the password-masking policy, improving discoverability for non-technical operators.
- A small scoped `<style>` block defines a reusable `.input-base` utility class to avoid repeating the same long Tailwind class string across every form field.

### 4.7 `DrawingOverlay` (`components/DrawingOverlay.jsx`) — Interactive VCA Zone Editor ⭐
An advanced, **hand-built canvas drawing tool** mounted as an overlay on the live video feed (extracted into its own reusable component). Highlights:

- **Click-to-place polygon drawing**: each click on the canvas is converted from pixel coordinates into **normalised coordinates** (`nx = px / canvas.width`, `ny = py / canvas.height`) so the resulting zone definition is **resolution-independent** and portable across devices/screen sizes — explicitly documented in the component's header comment as a deliberate contract with the back-end.
- **Live re-rendering on every point change**: redraws a semi-transparent fill polygon, a solid outline, a **dashed "closing" preview line** back to the first point (once ≥3 points exist, hinting that the shape is ready to close), and individually styled vertex dots — all drawn manually with the Canvas 2D path API (`beginPath`, `moveTo`, `lineTo`, `closePath`, `setLineDash`, `arc`).
- **Responsive canvas sizing** via a native **`ResizeObserver`** on the parent video container — keeps the drawing surface pixel-perfect aligned with the underlying video at any viewport size, cleaning up the observer on unmount.
- **Zone sensitivity selector**: a custom segmented control (levels 1–5: Low/Guarded/Elevated/High/Critical) with colour-graded active states and a live textual readout, allowing the operator to tune how aggressively the AI should react to intrusions in that specific zone.
- **Dual submission path**: on save, it (a) **broadcasts the new zone live** over the existing Socket.IO connection via the `onSubmitZone` callback (so the back-end starts enforcing it immediately) and (b) **persists the rule** via `POST /api/rules` with a structured payload (geometry type auto-detected as `'polygon'` vs `'line'` based on point count, plus default dwell-time/loitering conditions) — surfacing inline success/error feedback states with auto-clearing timers.
- Bottom-left contextual hint text that updates dynamically ("Click on the feed to start drawing a zone" → "N points placed · polygon ready").

### 4.8 `Settings` (`pages/Settings.jsx`) — System Configuration
A configuration dashboard for AI behaviour and notification preferences:

- **AI sensitivity thresholds** — three custom range sliders (`ThresholdSlider` sub-component) for Person/Vehicle/Animal detection confidence, each with a live percentage readout in a colour matching its category.
- **Notification preferences** — three animated toggle switches (`ToggleOption` sub-component) for sound alerts, email reports, and desktop notifications, each with an icon, label, description, and a smoothly animated pill-style switch (built with Tailwind transition utilities, no external switch library).
- **Connected cameras table** — a simple read-only overview (separate from the full CRUD in `CameraManagement`; this view focuses on quick status-at-a-glance).
- **"Danger zone" maintenance panel** — visually distinguished with a red-tinted border and a soft red glow effect, containing system-level actions (Reboot, Clear Logs, Check Updates).
- **Persistence**: `handleSave` bundles `{ thresholds, notifications }` and `PUT`s it to `/api/settings`, with `isSaving`/`saveStatus` state driving a spinner and a transient inline success/error confirmation message that auto-clears after 4 seconds.

### 4.9 `Sidebar` & `MainLayout` — Navigation Shell
- **`Sidebar`** renders the brand mark ("SecureGuard" with a shield icon), a navigation list driven by a declarative array of `{path, icon, label}` objects (making it trivial to add/remove nav items), uses React Router's **`NavLink`** with a function-as-className pattern to apply active-route styling (indigo background + glow shadow) automatically, and an exact-match (`end`) rule so the Dashboard link isn't permanently "active" on every nested route. It also renders the logout button, receiving `onLogout` as a prop drilled down from `App` → `MainLayout` → `Sidebar`.
- **`MainLayout`** assembles the persistent app shell: a fixed-width sidebar, a sticky translucent header with a page title and a pulsing "SYSTEM ONLINE" status indicator, and a scrollable content area that renders the active route via React Router's **`<Outlet/>`**.

### 4.10 `CameraStream` (`components/CameraStream.jsx`) — Exploratory Module
An early/experimental component (not wired into any route) that accesses the **local device webcam directly via `navigator.mediaDevices.getUserMedia`** and renders it in a styled `<video>` element with a "Live Feed" badge. It represents an early exploration of client-side camera capture before the team settled on the server-streamed (`processed_frame`/Socket.IO) architecture used in the final `LiveRoom`. Worth mentioning in the presentation as evidence of iterative design exploration.

---

## 5. State Management

**There is intentionally no global state-management library** (no Redux, MobX, Zustand, Recoil, or React Query/TanStack Query, and no custom Context providers for app-wide data). The state strategy instead rests on three pillars:

### 5.1 Local component state (the default)
Every page manages its own state with `useState`, derives computed values with `useMemo` (e.g., `filteredLogs` in `Logs`, `resolvedPct` in `Dashboard`), handles imperative DOM/canvas/socket references with `useRef`, and stabilises callbacks with `useCallback` (e.g., `fetchCameras`, `pushToast` in `CameraManagement`). This keeps each screen self-contained and easy to reason about in isolation — a sensible default for a project of this scope where most state genuinely is page-local (filters, modals, form fields, toasts).

### 5.2 "Lift state up" for cross-cutting concerns
The one piece of truly global client state — **the authenticated user** — lives at the very top, in `App.jsx` (`currentUser`, populated by Firebase's `onAuthStateChanged`). It is **threaded down explicitly via props** (`onLogout` passed from `App` → `MainLayout` → `Sidebar`), rather than via Context — a deliberate, simple choice appropriate for a shallow component tree where prop-drilling adds negligible friction but keeps data flow fully traceable.

A `DEV_BYPASS` flag (`VITE_DEV_BYPASS_AUTH` env var) lets the auth state be short-circuited to a fake `{ uid: 'dev' }` user during local development, avoiding the need to log in on every refresh — a small but practical developer-experience touch.

### 5.3 Firebase Realtime Database as a shared, real-time "data backbone"
Rather than fetching alert data once and manually keeping multiple views in sync, **`Dashboard`, `LiveRoom`, and `Logs` each independently open their own `onValue`/`onChildAdded` subscriptions** to the same `/alerts` (or camera-scoped) paths in the Realtime Database. Firebase's client SDK handles the subscription, diffing, and push-update mechanics; each component simply re-renders whenever the underlying data changes. This effectively turns Firebase into the application's **single source of truth for alert data**, eliminating the need for a client-side cache/store while still guaranteeing that, e.g., resolving an alert in the `Logs` investigation modal is immediately reflected in the `Dashboard` KPI counts and the `LiveRoom` alert feed — all without any custom pub/sub code.

### 5.4 What "global" data effectively exists on the client
- **Authenticated user / session** (`App.jsx`, sourced from Firebase Auth).
- **Live alert stream** (`/alerts` in Realtime DB — read by Dashboard, LiveRoom, Logs).
- **Live activity log** (`/activity_log/{date}/{camera}` — read by ActivityLog for "today").
- **Live restricted-zone configuration** (broadcast over Socket.IO, consumed by LiveRoom/DrawingOverlay).
- **Backend connectivity status** (polled centrally by `BackendStatusBanner` in `App.jsx` and surfaced as a sticky banner app-wide).

Everything else (filters, form drafts, modal visibility, toast queues, chart-derived datasets) is page-local and ephemeral by design.

---

## 6. API Integration

The Front-End communicates with **Israel's back-end** through **three complementary channels**, each chosen for the nature of the data it carries:

### 6.1 REST over `fetch` (request/response, CRUD-style data)
No Axios — the project uses the **native Fetch API** directly, wrapped consistently in `try/catch` blocks with `console.error` logging and graceful UI fallbacks. Endpoints consumed include:

| Endpoint | Method | Used by | Purpose |
|---|---|---|---|
| `/api/stats` | GET | Dashboard, BackendStatusBanner | KPI totals, system-health metrics, detection trend |
| `/api/cameras` | GET | Dashboard, CameraManagement | Camera list + online/offline status |
| `/api/cameras` | POST | CameraManagement (Add/Edit modal) | Register / update a camera |
| `/api/cameras/:id` | DELETE | CameraManagement | Remove a camera |
| `/api/events` | GET | Logs | Seed historical alert/event table |
| `/api/feedback` | POST | LiveRoom | Persist operator confirm/dismiss decisions |
| `/api/activity-log` | GET (`?date=&camera_id=`) | ActivityLog | Historical per-person daily activity |
| `/api/rules` | POST | DrawingOverlay | Persist a drawn restricted-zone rule |
| `/api/settings` | PUT | Settings | Persist AI thresholds + notification preferences |

A **single configuration constant, `SERVER_URL`** (in `src/config.js`), is imported everywhere a network call is made — this was specifically engineered (see the file's documentation comment) to correctly support an **empty-string value** using nullish coalescing (`??`) instead of `||`, so that relative paths flow through the **Vite dev-server proxy** (configured in `vite.config.js` to forward `/api/*` and `/socket.io/*` to the Flask backend, eliminating CORS issues entirely in development) while still allowing a fully-qualified URL to be used directly in production/staging.

### 6.2 WebSocket via Socket.IO (real-time, bidirectional, streaming)
Used exclusively by `LiveRoom` (and indirectly `DrawingOverlay`) for the live monitoring experience — the one part of the app where REST polling would be far too slow:

**Server → Client events consumed:** `processed_frame` (annotated video frame as a data URI), `restricted_zone_updated` (confirmed VCA zone polygon), `alert_batch` (batch of newly detected objects with bounding boxes), `tracking_update` (live per-person tracking + KPI scores).

**Client → Server events emitted:** `subscribe_camera` (start receiving a given camera's stream), `feedback` (operator's confirm/dismiss decision, mirrored to REST), `update_restricted_zone` (broadcast a freshly drawn zone for immediate enforcement).

The connection is configured with an explicit transport preference (`['websocket', 'polling']`) and a reconnection policy (`reconnectionAttempts: 5`), and is properly torn down (`socket.disconnect()`) in the `useEffect` cleanup function to prevent leaks across remounts.

### 6.3 Firebase Realtime Database (real-time, shared, persisted state)
Used as a **bidirectional real-time data layer**: the app both **reads** live alert/activity data (`onValue`, `onChildAdded`) and **writes** status updates back (`update(ref(database, '/alerts/{cam}/{id}'), { status })` in the `Logs` investigation modal) — meaning operator actions performed in one browser tab/session are instantly visible to any other connected client, with zero custom synchronisation code.

### 6.4 Error handling & loading-state conventions
A consistent set of patterns is applied across the entire codebase:
- **Every** network call is wrapped in `try/catch`/`.catch`, logs a contextual, prefixed error message (`console.error('[ComponentName] ...')`) for debuggability, and degrades gracefully (placeholder values like `'—'`/`'N/A'`, empty arrays, retained previous state, or a user-facing toast/banner) rather than crashing the UI.
- **Boolean loading flags** (`loading`, `isLoading`, `saving`, `isSaving`) drive spinner icons (`RefreshCw` with a `animate-spin` class), disabled button states, and dedicated loading rows/placeholders in tables.
- **Structured server error parsing** — several call-sites attempt to read a structured `{ error: { code, message } }` body from failed responses (e.g., `CAMERA_CONFIG_NOT_FOUND` in `CameraManagement`, generic `body.error.message` in `ActivityLog`) and branch the UI response accordingly, rather than showing a generic "something went wrong."
- A **dedicated, app-wide connectivity watchdog** — `BackendStatusBanner` (defined inline in `App.jsx`) — polls `/api/stats` every 30 seconds with a 5-second timeout (`AbortSignal.timeout(5000)`) and renders a sticky amber banner with a direct link to the Azure Kudu log viewer whenever the backend is unreachable, so that "nothing is loading" never becomes a silent mystery for the operator (or the developer during a demo).

---

## 7. Routing

Routing is implemented with **React Router v7**, structured as a clean two-tier system: a public route and a protected route subtree.

### 7.1 Route table (declared in `App.jsx`)
```
/login                → Login                       (public)
/                     → MainLayout (protected)
   ├── /        (index) → Dashboard
   ├── /live           → LiveRoom
   ├── /logs           → Logs
   ├── /activity       → ActivityLog
   ├── /cameras        → CameraManagement
   ├── /users          → Users (placeholder — future module)
   └── /settings       → Settings
```

### 7.2 Authentication-aware route guarding ("Protected Routes")
Rather than a separate `<PrivateRoute>` wrapper component, the project implements guarding **inline at the route-definition level** using `react-router-dom`'s `<Navigate/>`:

- The `/login` route renders `<Login/>` **unless** the user is already authenticated, in which case it redirects to `/` (`isAuthenticated ? <Navigate to="/"/> : <Login/>`).
- The root `/` route (and therefore its entire nested subtree) renders `<MainLayout/>` **only if** authenticated; otherwise it redirects to `/login` (`isAuthenticated ? <MainLayout .../> : <Navigate to="/login"/>`).

This means **every single page under `MainLayout` is automatically protected** — a new route added under `/` inherits the guard "for free" simply by being nested in the route tree, with no risk of a developer forgetting to wrap an individual page.

### 7.3 Authentication state machine
`currentUser` cycles through **three distinct states**, each rendered differently:
1. **`null`** — Firebase is still resolving the persisted session → renders a full-screen branded loading spinner ("Verifying session…") so the app never "flashes" the login page on a refresh while a valid session is being restored.
2. **`false`** — No authenticated user → public/redirect behaviour as described above.
3. **A user object** (real Firebase `User`, or the `{ uid: 'dev' }` dev-bypass sentinel) → `isAuthenticated = true`, full app access.

The transition between these states is driven entirely by Firebase's `onAuthStateChanged` subscription (registered once, cleaned up on unmount), and `handleLogout` calls Firebase's `signOut`, letting the same listener naturally drive the UI back to the login screen — there is no manual "set page to login" logic anywhere, which eliminates a whole class of state-desync bugs.

### 7.4 Navigation UX
- `Sidebar` uses **`NavLink`** (not plain `Link`) specifically so the currently active route can be styled distinctly (solid indigo background + glow) versus inactive items (slate text with hover states), with an `end` prop on the Dashboard link to prevent it from matching every nested path.
- Logged-out users attempting to deep-link to a protected URL are transparently redirected to `/login`; logged-in users hitting `/login` directly are bounced back to `/` — both directions are handled declaratively by the route table itself, not by imperative `useNavigate()` calls scattered through the codebase.

---

## 8. Custom Logic, Challenges & UI/UX Craftsmanship

This section highlights the pieces of work that went meaningfully beyond "wire up a form to an endpoint" — the parts of the project that required original problem-solving.

### 8.1 Canvas-based real-time overlays (two independent implementations)
The project required **two distinct canvas systems**, each solving a different problem:
1. **Read-only annotation overlay** (`LiveRoom`'s `drawSingleBox`) — converts AI-supplied normalised bounding boxes into pixel rectangles synced to a constantly-changing `<img>` size, redrawn on every new detection batch.
2. **Interactive drawing tool** (`DrawingOverlay`) — captures operator clicks, converts them to normalised polygon vertices, live-renders a richly styled polygon (fill + outline + dashed closing hint + vertex handles), and stays perfectly aligned with the video using a `ResizeObserver`.

Both systems independently solve the same underlying challenge — **"map between screen pixels and resolution-independent normalised coordinates so the system works at any video resolution or window size"** — demonstrating a solid grasp of canvas geometry and coordinate-space transformations, a topic rarely covered in standard React tutorials.

### 8.2 Real-time data fusion from heterogeneous sources
`LiveRoom`, `Dashboard`, and `Logs` each blend **multiple asynchronous, independently-updating data sources** (Socket.IO push events, Firebase Realtime Database listeners, and REST polling/fetch-on-mount) into a single coherent view, with explicit tie-breaking rules for precedence (e.g., in `Logs`, the REST-seeded list is only retained "if Firebase hasn't responded yet"; in `Dashboard`, the server-computed detection trend overrides the client-computed one only when present and non-empty). Designing and reasoning about this kind of multi-source reconciliation — without a dedicated state-management/cache library — is one of the more advanced aspects of the Front-End work.

### 8.3 Client-side data transformation & analytics
Large portions of the Dashboard's "Alert Intelligence" section are powered by **purely client-side aggregation** of raw alert documents into chart-ready shapes: hour-bucketing for trend lines, frequency counting and ranking for trigger types/cameras/zones (including a "top 6" slice), and dynamic colour-intensity interpolation for heat-style bar charts — all written from scratch with vanilla JS array methods (`reduce`-style accumulation via plain objects, `Object.entries`, `map`, `filter`, `sort`, `slice`).

### 8.4 Custom form validation & defensive UX
`CameraFormModal` implements **hand-rolled client-side validation** (required fields, URL-scheme checking, numeric-range checking) that runs before any network request, surfaces field-level error messages, and constructs a **sparse update payload** (only sends fields the operator actually changed/filled) to avoid accidentally clobbering server-side data — a subtle but important real-world correctness concern that's easy to overlook.

### 8.5 Client-side filtering, sorting, search & export
`Logs` combines **four simultaneous filter dimensions** (free-text search, status, trigger type, date) using a single memoised predicate pipeline, and offers a fully **client-generated CSV export** (with correct quote-escaping and a date-stamped filename) using nothing but the `Blob`/`URL.createObjectURL` browser APIs — no charting or export library dependency required.

### 8.6 Hand-built UI primitives (no component library)
Rather than pulling in a component library (e.g., MUI, Chakra, Headless UI), several common UI patterns were **built from scratch using only Tailwind + React state**:
- A **toast notification queue** with auto-dismiss timers and manual dismissal (`CameraManagement`).
- **Animated toggle switches** and **range sliders** with live readouts (`Settings`).
- **Modal dialogs** (investigation modal, add/edit camera modal, delete-confirmation modal) with backdrop-click-to-close and consistent entrance styling.
- **Status badges, severity chips, and KPI score pills** with a shared colour-grading system (`getScoreStyle` in `utils/alertHelpers.js`, reused across `LiveRoom`, `Logs`, and `ActivityLog` to guarantee visual consistency).

### 8.7 UI/UX & responsiveness
- **Consistent dark "SOC" (Security Operations Center) visual language** — a deliberate slate/indigo palette, glassmorphism (`backdrop-blur`), subtle glows/shadows on interactive elements, and pulsing indicators for "live"/"online"/"motion" states — applied uniformly across every screen to create a cohesive, professional product feel rather than a collection of disconnected pages.
- **Responsive grid layouts** throughout, using Tailwind's breakpoint utilities (e.g., `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` on the Dashboard KPI row, `xl:grid-cols-3` on the analytics row) so the app reflows gracefully from a single column on small screens up to a dense multi-column layout on wide monitors — appropriate for an operator console likely to be viewed on large desk monitors but still functional on laptops/tablets.
- **Thoughtful empty/loading/error states everywhere** — every data table, chart, and panel has an explicit "loading…", "no data yet", or "no results match your filters" treatment (with matching icon and copy), rather than showing blank space or raw `undefined`s — a strong signal of UX maturity.
- **Micro-interactions** — hover states that reveal row actions (`opacity-0 group-hover:opacity-100`), button press feedback (`active:scale-[0.98]`), animated spinners, pulsing live/motion indicators, and smoothly transitioning toggle switches all contribute to a "polished product" feel rather than a "student project" feel.
- **Accessibility-conscious touches** — semantic labelling of form fields, `title` attributes on icon-only buttons, `disabled` states clearly distinguished visually, and sufficient colour contrast against the dark background palette.

---

## 9. Suggested Talking Points for the Defense

When presenting this work, the following angles tend to land well with an evaluation committee:

1. **"I built a real-time operator console, not just a CRUD app."** Emphasise the WebSocket + Firebase + REST fusion in `LiveRoom` and `Dashboard` — this is meaningfully harder than a typical form-and-table student project.
2. **"I designed my own visual design system from utility classes."** No UI kit was used — the consistent dark theme, badges, modals, toasts, and charts were all hand-crafted with Tailwind, demonstrating both design sensibility and CSS/Tailwind proficiency.
3. **"I solved real coordinate-geometry problems."** The dual canvas systems (bounding-box overlay + interactive zone-drawing tool) and the normalised-coordinate contract with the back-end show genuine algorithmic/graphics thinking beyond typical React work.
4. **"I made deliberate architecture trade-offs."** Explicitly call out the decision to *not* adopt Redux/Context — instead leaning on Firebase Realtime Database as a shared real-time data layer — and be ready to explain *why* that was the right call for this project's scope and timeline.
5. **"I handled the unhappy paths."** Loading states, error banners, structured server-error parsing, optimistic updates, retry/backoff on sockets, and the dedicated backend-connectivity watchdog (`BackendStatusBanner`) all show production-mindedness, not just "happy path" demo code.
6. **"I worked at the integration boundary with the back-end."** Point to the normalisation logic in `Logs` (`ev.event_type ?? ev.alert_type`) and the documented `SERVER_URL`/proxy setup as evidence of close, careful collaboration with Israel's API contracts — including defensively handling inconsistent field names from the server.

---

## Appendix A — Domain Glossary (for slide footnotes / Q&A prep)

| Term | Meaning in this system |
|---|---|
| **Alert** | A record of an AI-detected security event (e.g., a person climbing a fence), with status `open` / `acknowledged` / `resolved`, a severity (`low`/`medium`/`high`), a `trigger_type`, and optional KPI `scores` and `location`. |
| **Trigger type** | Categorises *why* an alert fired: `CLIMBING`, `LOITERING`, `COMBINED` (multiple risk factors), `INTRUSION` (perimeter/zone crossing). |
| **KPI scores** | Per-person behavioural risk scores computed by the AI pipeline: `climbing_score`, `loitering_score`, `total_person_score` (0–100, colour-graded green→yellow→red by `getScoreStyle`). |
| **VCA (Video Content Analysis) zone** | An operator-defined polygon/line region on the camera feed; the AI raises alerts when tracked persons interact with it (the `DrawingOverlay` tool defines these). |
| **Tracking update** | A live snapshot of all currently-tracked persons in a camera's frame, including their global ID, bounding box, and current KPI scores. |
| **Restricted zone sensitivity** | A 1–5 operator-tunable setting (Low → Critical) controlling how aggressively the AI reacts to activity inside a given VCA zone. |
| **Edge node** | The on-site hardware/software responsible for streaming a physical camera to the back-end; can be "offline," in which case configuration changes are queued (`relay_status: 'queued'`) until it reconnects. |
| **Activity log entry** | A daily, per-person, per-camera summary record: first/last seen times, total time on camera, alerts triggered, peak risk score, and zones visited. |

---

*Document generated by scanning the Front-End source tree (`src/`) of the SecureGuard AI project. File references throughout this document point to the actual implementation for verification during Q&A.*

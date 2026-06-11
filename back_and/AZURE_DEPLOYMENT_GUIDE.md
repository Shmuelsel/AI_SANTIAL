# Azure Deployment Guide — Smart Eye (Merged Cloud Architecture)

**Audience:** Israel (Azure / DevOps)
**Goal:** Decommission the old Edge Node + Central Server deployment and point
Azure at this new, merged repository — one Flask + Socket.IO container that
does everything (video ingestion, YOLOv8 inference, scoring/alerts), plus a
static React frontend.

---

## 0. Architecture summary (what you're deploying)

| Component | Tech | Where it lives | Azure target |
|---|---|---|---|
| Backend | Flask + Flask-SocketIO (`async_mode="threading"`) + YOLOv8 | `back_and/backend/` | Azure App Service (Linux, **container**) |
| Frontend | React + Vite | `front_and/` | Azure Static Web Apps |
| Video scenarios | Local `.mp4` files | `back_and/backend/assets/videos/` | Baked into the container image |
| Alerts / events / rules DB | Firebase Realtime Database | external (Google) | unchanged |

There is **no Edge Node anymore** and **no Firebase Storage dependency** —
everything (including demo videos) is bundled in the backend container, so the
old "Edge Node" App Service / pipeline can be retired once this is live.

---

## 1. Repository switch

The old deployment pipeline points at a different folder/repo. Re-point it to
this repository:

1. **GitHub Actions backend workflow** already exists in this repo at
   [`back_and/.github/workflows/azure-container-webapp.yml`](.github/workflows/azure-container-webapp.yml).
   - ⚠️ For GitHub Actions to pick this up, the **`.github/` folder must live at
     the repository root**, not inside `back_and/`. If `back_and/` is the root
     of this GitHub repo (i.e. `back_and/` content was pushed as the repo root),
     this is already correct — just confirm `.github/workflows/azure-container-webapp.yml`
     exists at the repo root on GitHub.
   - If the repo root is actually the parent folder (containing both
     `back_and/` and `front_and/`), move `back_and/.github/` →
     `<repo-root>/.github/` and update the `context`/`file` paths in the
     workflow from `./backend` to `./back_and/backend`.

2. **Disable/delete the old pipeline**:
   - In the **old** App Service, go to **Deployment Center** and disconnect
     the old GitHub repo/branch (or delete the old workflow file from the old
     repo so it stops triggering).
   - Note the old App Service's name/URL — you'll either reuse it (Section 2)
     or retire it after cutover.

3. **Connect the new repo**:
   - You can either reuse the existing App Service and just repoint its
     Deployment Center → GitHub source to **this repo**, branch `main`, or
     create a brand-new App Service (recommended for a clean cutover — see
     Section 2) and decommission the old one once verified.

---

## 2. Backend deployment — Azure App Service (Linux, Docker)

### 2.1 Create the App Service Plan + Web App

1. **App Service Plan**:
   - OS: **Linux**
   - SKU: **minimum B1 (Basic)** — required because YOLOv8 + OpenCV + the
     ultralytics/torch stack need ≥ 1.75 GB RAM to load the model without
     being OOM-killed. (If alerts/health checks show frequent restarts under
     load, consider B2/P1v3.)
2. **Web App**:
   - Publish: **Docker Container**
   - Operating System: **Linux**
   - Region: same region as your Firebase RTDB region if possible (reduces
     latency), e.g. `europe-west1`-adjacent Azure region.

```bash
# Example via Azure CLI
az group create --name smart-eye-rg --location westeurope

az appservice plan create \
  --name smart-eye-plan \
  --resource-group smart-eye-rg \
  --is-linux \
  --sku B1

az webapp create \
  --name smart-eye-backend \
  --resource-group smart-eye-rg \
  --plan smart-eye-plan \
  --deployment-container-image-name nginx  # placeholder, replaced by CI
```

### 2.2 GitHub Actions: build & deploy via the provided Dockerfile

The Dockerfile at [`backend/Dockerfile`](backend/Dockerfile) is **server-only**
(build context = `backend/`, excludes `edge_node`/`venv`) and already:
- installs `requirements.server.txt` (torch CPU wheels, ultralytics, OpenCV
  headless, Flask-SocketIO, gunicorn, firebase-admin, etc.)
- copies the full `backend/` source — **including `assets/videos/*.mp4`**, so
  make sure the demo `.mp4` files are committed (or added to the image via a
  build step) before building, since `*.mp4` is currently git-ignored. Either:
  - remove the `backend/assets/videos/*.mp4` line from `back_and/.gitignore`
    and commit the actual video files (simplest), **or**
  - add a CI step that downloads/copies the `.mp4` files into
    `backend/assets/videos/` before `docker build` runs.
- starts gunicorn with the `gthread` worker (required for Flask-SocketIO
  threading mode + WebSockets):
  ```
  gunicorn --worker-class gthread --threads 8 -w 1 --timeout 120 --bind 0.0.0.0:${PORT:-8000} wsgi:app
  ```

The workflow [`azure-container-webapp.yml`](.github/workflows/azure-container-webapp.yml)
already builds this image and pushes it to **GitHub Container Registry
(ghcr.io)**, then deploys it to the App Service via `azure/webapps-deploy`.

**Required setup (one-time):**

1. **GitHub repo secrets** (Settings → Secrets and variables → Actions):
   | Secret | Value |
   |---|---|
   | `AZURE_WEBAPP_NAME` | the App Service name, e.g. `smart-eye-backend` |
   | `AZURE_WEBAPP_PUBLISH_PROFILE` | download from the App Service **Overview → Get publish profile** (XML file contents) |

2. **App Service → Configuration → Application settings** — add the registry
   credentials so the App Service can pull the image from `ghcr.io`:
   | Name | Value |
   |---|---|
   | `DOCKER_REGISTRY_SERVER_URL` | `https://ghcr.io` |
   | `DOCKER_REGISTRY_SERVER_USERNAME` | the GitHub org/user that owns the repo |
   | `DOCKER_REGISTRY_SERVER_PASSWORD` | a GitHub PAT with `read:packages` scope |

3. Push to `main` → Actions builds the image, tags it
   `ghcr.io/<org>/<repo>:<sha>`, and deploys it to the Web App automatically.

### 2.3 Critical App Settings (Configuration → Application settings)

| Name | Value | Notes |
|---|---|---|
| `WEBSITES_PORT` | `5000` | Tells App Service which container port to route traffic to. *(Note: the Dockerfile's gunicorn binds to `${PORT:-8000}`, and Azure injects `PORT` itself. Set `WEBSITES_PORT=5000` **and** also set `PORT=5000` as an app setting so both the platform's reverse proxy and gunicorn agree on the same port — see callout below.)* |
| `PORT` | `5000` | Ensures gunicorn binds to the same port advertised via `WEBSITES_PORT`. |
| `FIREBASE_DB_URL` | `https://smart-eye-49d8b-default-rtdb.europe-west1.firebasedatabase.app` | Realtime Database URL (from `shared/config.py` default — confirm it matches the live Firebase project). |
| `FIREBASE_CREDENTIALS_JSON` | *(paste the full service-account JSON as a single-line string)* | **Preferred on Azure** — avoids needing to bundle the credentials file in the image. Takes priority over `FIREBASE_CRED_PATH` in `shared/config.py`. |
| `DEFAULT_VIDEO_MODE` | `live` (or `demo`) | Which mode the worker starts in on boot. |
| `LIVE_VIDEO_PATH` | *(leave unset)* | Defaults to `backend/assets/videos/live_demo.mp4` inside the image — only set this if using a different path. |
| `DEFAULT_DEMO_VIDEO_FILENAME` | *(optional)* | Pin a specific demo `.mp4`; otherwise the first file alphabetically in `assets/videos/` (excluding `live_demo.mp4`) is used. |

> ⚠️ **Port consistency callout:** `WEBSITES_PORT` tells Azure's front-end
> proxy which port your container listens on. Gunicorn in the Dockerfile
> listens on `$PORT` (Azure sets this automatically, default `8000`, but
> Flask reads it via `shared/config.py`'s `SERVER_PORT = int(os.environ.get("PORT", 5000))`
> for app-internal URL building). To keep everything aligned, **set both
> `WEBSITES_PORT=5000` and `PORT=5000`** as App Settings — this guarantees
> gunicorn binds to 5000 and Azure routes to 5000.

### 2.4 Enable WebSockets (required for Socket.IO)

- App Service → **Configuration → General settings** → **Web sockets** → **On**.
- Also recommended: **Always On** → **On** (prevents the app from idling and
  reloading the YOLO model repeatedly on cold starts).

### 2.5 Logs / sanity checks

- **Log stream** (App Service → Log stream) — on first boot you should see:
  ```
  [INFO] ModelManager: loading .../yolov8n.pt …
  [INFO] ModelManager: model ready.
  [INFO] FirebaseClient: *** LIVE MODE *** — writing to Firebase Realtime Database.
  [INFO] VideoWorkerManager: switched to 'live' mode (source=.../live_demo.mp4).
  ```
- If you see `falling back to dry-run mode` for Firebase, double-check
  `FIREBASE_CREDENTIALS_JSON` is valid JSON (no line breaks / properly escaped).
- If the app restarts repeatedly / OOMs during model load → bump the App
  Service Plan SKU (B1 → B2 or P1v3).

---

## 3. Frontend deployment — Azure Static Web Apps

### 3.1 Create the Static Web App

1. In the Azure Portal: **Create a resource → Static Web App**.
2. **Source**: GitHub → select this repository, branch `main`.
3. Build presets / paths:
   | Setting | Value |
   |---|---|
   | App location | `/front_and` |
   | Api location | *(leave empty — no Azure Functions API)* |
   | Output location | `dist` |

Azure will auto-generate a GitHub Actions workflow file
(`.github/workflows/azure-static-web-apps-<random-name>.yml`) at the repo root
and add the deployment token as a repo secret
(`AZURE_STATIC_WEB_APPS_API_TOKEN_<...>`) automatically — no manual secret
setup needed for this part.

The generated workflow's `app_build_command` will run `npm run build` (i.e.
`vite build`), which is correct given `front_and/package.json`'s
`"build": "vite build"` script.

### 3.2 Configure Vite build-time environment variables

Vite environment variables (`VITE_*`) are **baked into the JS bundle at build
time** — they must be available to the GitHub Actions build step, **not** set
as Static Web App runtime "Application settings" (those only apply to the
optional Functions API, which this project doesn't use).

**Where to set them:** GitHub repo → **Settings → Secrets and variables →
Actions → Variables (or Secrets) tab**, then reference them in the
auto-generated SWA workflow's build step as `env:` entries. Example addition
to the `Azure/static-web-apps-deploy@v1` step (or a preceding `Build` step if
you split it out):

```yaml
      - name: Build And Deploy
        uses: Azure/static-web-apps-deploy@v1
        env:
          VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
          VITE_WS_URL: ${{ vars.VITE_WS_URL }}
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ vars.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_DATABASE_URL: ${{ vars.VITE_FIREBASE_DATABASE_URL }}
          VITE_FIREBASE_PROJECT_ID: ${{ vars.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ vars.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ vars.VITE_FIREBASE_APP_ID }}
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_... }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/front_and"
          output_location: "dist"
```

**Required values** (see [`front_and/.env.example`](../front_and/.env.example)
for the full list):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://smart-eye-backend.azurewebsites.net` (the backend App Service URL from Section 2) |
| `VITE_WS_URL` | same as `VITE_API_BASE_URL` (Socket.IO connects to the same host) |
| `VITE_FIREBASE_*` | copy from the Firebase project console (Project Settings → General → Your apps → SDK config) — used for frontend auth/Realtime DB reads |
| `VITE_DEV_BYPASS_AUTH` | `false` (must be false in production) |

> 🔒 Treat `VITE_FIREBASE_API_KEY` etc. as low-sensitivity (they're public in
> any client bundle anyway), but still store them as repo **Secrets/Variables**
> rather than hardcoding, so they can be rotated without code changes.

### 3.3 Custom domain / CORS

- Note the Static Web App's default URL (e.g. `https://<random>.azurestaticapps.net`).
- Confirm the backend's CORS config (Flask-SocketIO `cors_allowed_origins`)
  allows this origin — if it's currently `"*"` this is fine; if it's
  restricted to specific origins, add the SWA URL.

---

## 4. Post-deployment verification

### 4.1 Backend health check

```bash
curl https://smart-eye-backend.azurewebsites.net/api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "smart-eye-central-server",
  "model": { "loaded": true, "path": ".../yolov8n.pt" },
  "video_source": {
    "mode": "live",
    "running": true,
    "camera_id": "CAM_1001",
    "source": ".../assets/videos/live_demo.mp4",
    "filename": null
  },
  "firebase_live": true
}
```

Checklist:
- `status: "ok"` and `model.loaded: true` → YOLO model loaded successfully
  (if `"degraded"`, the model failed to load — check logs / RAM / SKU).
- `video_source.running: true` → the video worker thread started.
- `firebase_live: true` → `FIREBASE_CREDENTIALS_JSON` is valid and the RTDB
  connection succeeded (if `false`, alerts/events are only printed to logs,
  not persisted).

### 4.2 Available demo videos

```bash
curl https://smart-eye-backend.azurewebsites.net/api/available-videos
```

Should return the `.mp4` files present in `backend/assets/videos/` (excluding
`live_demo.mp4`), e.g.:

```json
{ "videos": ["alert_behavior.mp4", "normal_baseline.mp4"] }
```

### 4.3 Frontend ↔ backend integration

1. Open the Static Web App URL in a browser.
2. Log in (or confirm `VITE_DEV_BYPASS_AUTH=false` routes to the login page).
3. Go to **Live Room** — confirm the annotated video stream renders (proves
   the Socket.IO `processed_frame`/`tracking_update` events reach the
   browser over `VITE_WS_URL`).
4. Go to **Settings → Video Source**:
   - Confirm the "Demo Scenario" dropdown is populated from
     `/api/available-videos`.
   - Toggle **Live Feed ↔ Demo Mode** and confirm `/api/health`'s
     `video_source.mode`/`filename` updates accordingly and the stream
     switches video within ~1-2 seconds.
5. Trigger an alert scenario (or use `alert_behavior.mp4`) and confirm it
   appears in **Logs** (proves `firebase_live: true` end-to-end write/read).

### 4.4 Decommission the old deployment

Once the above checks pass:
- Stop/delete the old Edge Node + old Central Server App Service(s).
- Remove the old GitHub Actions workflow / Deployment Center connection from
  the old repo (if it's a separate repo, it can be archived).

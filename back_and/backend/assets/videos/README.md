# Video Sources

The merged cloud server no longer connects to a real RTSP camera. Instead, both
the "Live" and "Demo" video sources are pre-recorded video files that are looped
continuously to simulate a live feed.

## Live mode

Place a video file at:

```
back_and/backend/assets/videos/live_demo.mp4
```

This file is looped forever (`LoopingFileSource`) to simulate a continuous
camera stream. The path can be overridden with the `LIVE_VIDEO_PATH`
environment variable.

This file is git-ignored — every environment (local dev, Azure) needs its own
copy placed at this path, or `LIVE_VIDEO_PATH` pointed at an existing file.

## Demo mode

Demo Mode scenarios are discovered dynamically — there is no static catalog to
maintain in code. Any other `.mp4` file placed in this directory
(`back_and/backend/assets/videos/`, alongside `live_demo.mp4`) is automatically
listed by `GET /api/available-videos` and becomes selectable in the frontend's
Demo Mode dropdown after a refresh — no code changes or redeploys needed.

Two example scenarios to start with:

```
back_and/backend/assets/videos/alert_behavior.mp4
back_and/backend/assets/videos/normal_baseline.mp4
```

`alert_behavior.mp4` should depict a "True Positive" scenario (e.g. someone
climbing or loitering inside the restricted zone) so the alert pipeline can be
verified end-to-end. `normal_baseline.mp4` should depict normal "True Negative"
activity (people walking through, no zone intrusion) so you can confirm the
pipeline does NOT raise false alerts.

To add more scenarios, just drop another `.mp4` into this folder and refresh
the frontend — it will appear in the Demo Mode dropdown automatically.

These files are git-ignored — every environment (local dev, Azure) needs its
own copies placed in this directory. On Azure App Service, upload them to the
app's persistent storage (e.g. via Kudu/SCM, FTP, or by including them in the
deployment package) at this path.

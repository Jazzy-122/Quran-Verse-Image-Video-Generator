# Quran Video Converter Backend

This is the Railway backend for `index (13).html`. The browser records the canvas/audio as WebM or MP4, uploads it to `/convert`, and the backend returns a WhatsApp-friendly MP4 using H.264 video and AAC audio.

## Local test

1. Install Docker Desktop.
2. Open a terminal in this `converter-backend` folder.
3. Build and run:

```bash
docker build -t quran-video-converter .
docker run --rm -p 3000:3000 -e CORS_ORIGIN=http://localhost:8000 quran-video-converter
```

4. Open `http://localhost:3000/health`. You should see `{ "ok": true }`.

## Railway environment variables

Set these in Railway:

```text
CORS_ORIGIN=https://YOUR-GITHUB-USERNAME.github.io
MAX_UPLOAD_MB=250
CONVERT_TIMEOUT_MS=600000
MAX_ACTIVE_CONVERSIONS=2
```

Use the exact GitHub Pages origin. If your page is at `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO/`, the origin is only `https://YOUR-GITHUB-USERNAME.github.io`.

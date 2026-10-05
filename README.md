# Pokémon Photobooth

A polaroid-style photobooth web app for a 12.9" iPad Pro. Pure HTML/CSS/JS — no build step, no dependencies. Installable from Safari with **Add to Home Screen** and hostable on **GitHub Pages**.

## How it works

1. Pick a Pokémon (and frame) on the right. Toggle the **Pose guide** on/off.
2. Tap **Start Shooting!!** — the polaroid centres, counts down from 5, and takes 3 shots (flash + 1.5 s freeze on each).
3. Pick the shots you like (tap to toggle), or **Retake**.
4. Tap **AirDrop** — the iOS share sheet opens with the selected polaroid JPEGs **plus** a silent 9:16 MP4 of the session (polaroid centred on light grey, freezing on each shot).

The pose guide is screen-only; it never appears in photos or the video. Photos are 1332 × 2049 (3:4 window inside the frame) with the date, event name and @duanato stamp baked in.

## Hosting on GitHub Pages

1. Create a repo and push this folder's contents to it (keep the folder structure).
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/` on the iPad in Safari.

GitHub Pages serves over HTTPS, which the camera, MediaRecorder and Web Share APIs all require.

## Installing on the iPad

1. Open the URL in **Safari**, allow camera access.
2. Share button → **Add to Home Screen** → Add.
3. Launch from the Home Screen. It runs full-screen in landscape and, after one load, works offline (service worker cache).

> iPadOS 16.4+ recommended (camera in Home Screen web apps, Web Share with files, MP4 MediaRecorder). If a feature is missing the app degrades: no video → photos only; no share sheet → files are downloaded.

## Configuring

Everything lives in **`js/config.js`**:

| Key | What |
|-----|------|
| `eventName` | small text under the date (currently `ART RIOT`) |
| `countdownSeconds`, `shotsPerSession`, `shotHoldMs` | shooting timings |
| `mirror` | selfie-style mirroring (preview + output) |
| `stamp` / `text` | position/size of the watermark and caption |
| `frames[]` | polaroid frames + where the photo window sits |
| `pokemon[]` | Pokémon list: `icon`, `overlay` (full-window PNG, 3:4), `guide` (pose guide PNG) |

### Adding a Pokémon

1. Drop `assets/pokemon/<name>.png` (1875 × 2500, transparent, Pokémon at the bottom) and optionally `<name>-guide.png` (same size).
2. Add an entry to `pokemon[]` in `js/config.js`. Entries with `overlay: null` show as *coming soon*.
3. Add the new files to the `ASSETS` list in `sw.js` and bump `CACHE_VERSION` so installed iPads pick them up.

### Adding a frame

Add a PNG with a transparent photo window to `assets/frames/`, then add an entry to `frames[]` with the window rectangle as fractions of the image (measure the transparent cut-out).

## Project layout

```
index.html              app shell
manifest.webmanifest    PWA manifest (standalone, landscape)
sw.js                   offline cache
css/style.css           UI styles
js/config.js            ← edit this
js/app.js               camera, countdown, rendering, recording, sharing
assets/
  frames/classic.png    polaroid frame
  pokemon/              overlays, pose guides, pixel icons
  fonts/                SmoothMarker (caption) + Pixelify Sans (UI, OFL)
  stamp.png             @duanato watermark
  cursor.gif            pixel hand cursor (selected item)
  icons/                home-screen icons
```

## Testing on a laptop

Any static server works, e.g. `python3 -m http.server 8000` then open `http://localhost:8000`. Chrome will record a WebM/MP4 depending on the version; the share sheet falls back to downloads.

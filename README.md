# Upcoming · Events

A phone-first web app to track upcoming events. Dark, poster-forward interface with a live countdown to whatever's next.

First event seeded: **The Odyssey** 🎬 (16 July 2026).

## Features

- Live countdown to the next event (days / hrs / min / sec), paused while the tab is hidden
- **Movie search** in the Add Event sheet (powered by TMDB) — pick a film and it auto-fills the title, poster, and release date
- Add / edit / delete events with confirmation (dev mode only)
- Sorted soonest-first, past events dimmed under their own tab
- Installable as a home-screen app (PWA), full-screen on iOS with safe-area support

## Responsive behaviour

The front end is built to work on any screen from a 280px folded phone to a wide desktop:

- **Fluid everything** — type, spacing and component sizes scale with `clamp()`; no fixed-width layout anywhere
- **Poster grid** steps 2 → 3 → 4 → 5 → 6 columns as width allows
- **Sheets** are bottom sheets (with swipe-to-dismiss) on phones and centred dialogs from 640px up
- **Detail view** is full-screen on phones and a centred modal card from 900px up; the hero shrinks in landscape so the title stays on screen
- **Safe areas** — notch, home indicator and landscape side insets are honoured on every fixed element
- **Keyboard-aware** — `visualViewport` measures the on-screen keyboard so sheets lift above it; all inputs are 16px so iOS never zooms on focus
- **Responsive images** — TMDB posters are served via `srcset` at w185/w342/w500 so phones don't download desktop-sized art
- **Accessible** — pinch-zoom stays enabled, dialogs trap focus and restore it, Escape and the browser back button close overlays, tap targets are at least 32px, and `prefers-reduced-motion` is respected

## Setup: TMDB API key (for movie search)

The movie search proxies through the server so your API key stays secret.

1. Create a free TMDB account and request an API key at
   https://www.themoviedb.org/settings/api
2. Locally: copy `.env.example` to `.env` and set `TMDB_API_KEY=` your key
   (a v3 API key or a v4 Read Access Token both work).
3. On Railway: add `TMDB_API_KEY` in the service **Variables** tab.

Without a key, the app still works — the search box just reports the key isn't set, and you can fill the fields in manually.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000 on your phone or browser (use your machine's LAN IP to test on a real phone).

## Deploy on Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** and pick this repo.
3. Railway auto-detects Node via Nixpacks and runs `npm start`. The `PORT` env var is provided automatically.
4. Open the generated domain on your phone and "Add to Home Screen".

> Note: events are stored in a JSON file on disk. **Railway's filesystem is ephemeral**, so without a Volume your live edits are wiped on every redeploy and the app falls back to the seed events.

### Make events persist across redeploys (IMPORTANT)

To keep events you add/edit on the live site, attach a persistent **Volume** and point the app at it:

1. In your Railway service → **Variables** tab, add:
   - `DATA_DIR` = `/data`
   - (optional) `DEV_PASSWORD` = a strong password instead of the default `123123`
2. In the service settings → **Volumes** → **New Volume**, set the **Mount path** to `/data` (must match `DATA_DIR`).
3. Redeploy. Events now live on the volume and survive all future deploys.

The seed events are only written **once**, the first time the file is missing. After that your live edits are preserved.

## Tech

- Node + Express (single file `server.js`)
- Vanilla HTML/CSS/JS front end in `public/`
- JSON file storage in `data/`

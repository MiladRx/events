# Crew · Upcoming Events

A mobile-first web app to track upcoming events with your group. Built with an iOS 26 "Liquid Glass" look — frosted glass cards, ambient aurora background, and a live countdown to your next event.

First event seeded: **The Odyssey** 🎬 (16 July 2026).

## Features

- Live countdown to the next event (days / hrs / min / sec)
- Add events from a swipe-up glass sheet (title, emoji, category, location, date, notes)
- Delete events
- Sorted soonest-first, past events dimmed
- Installable as a home-screen app (PWA), full-screen on iOS with safe-area support

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

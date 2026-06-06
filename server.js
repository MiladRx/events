import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Data is stored on disk. On Railway, set DATA_DIR to a mounted Volume path
// (e.g. /data) so events survive redeploys. Falls back to a local ./data folder.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "events.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Dev password gate for write operations (read stays public).
// Override in production via the DEV_PASSWORD env var.
const DEV_PASSWORD = process.env.DEV_PASSWORD || "123123";

function requireDev(req, res, next) {
  const key = req.get("x-dev-key") || "";
  if (key !== DEV_PASSWORD) {
    return res.status(401).json({ error: "Dev access required" });
  }
  next();
}

// Verify a password without exposing it (used by the Dev unlock button)
app.post("/api/auth", (req, res) => {
  const ok = (req.body && req.body.password) === DEV_PASSWORD;
  res.status(ok ? 200 : 401).json({ ok });
});

// Ensure the data directory and seed file exist
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const seed = [
      {
        id: "odyssey-2026",
        title: "The Odyssey",
        category: "Cinema",
        emoji: "🎬",
        poster: "https://image.tmdb.org/t/p/w500/9C9PAnrZcB8x7YHNlBs4PUv0Z7K.jpg",
        location: "Local Cinema",
        date: "2026-07-16T19:00:00",
        notes: "Christopher Nolan's epic. Grab tickets early!"
      },
      {
        id: "spiderman-bnd-2026",
        title: "Spider-Man: Brand New Day",
        category: "Cinema",
        emoji: "🕷️",
        poster: "https://image.tmdb.org/t/p/w500/yyB2VJEW3an2xCdcYCPQhn9QERR.jpg",
        location: "Local Cinema",
        date: "2026-07-29T19:00:00",
        notes: "Tom Holland is back!"
      }
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
  }
}
ensureData();

function readEvents() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeEvents(events) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2));
}

// API: list events (sorted by date, soonest first)
app.get("/api/events", (req, res) => {
  const events = readEvents().sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  res.json(events);
});

// API: create event (dev only)
app.post("/api/events", requireDev, (req, res) => {
  const { title, category, emoji, location, date, notes, poster } = req.body || {};
  if (!title || !date) {
    return res.status(400).json({ error: "title and date are required" });
  }
  const events = readEvents();
  const newEvent = {
    id: `evt-${Date.now()}`,
    title,
    category: category || "Hangout",
    emoji: emoji || "📅",
    poster: poster || "",
    location: location || "",
    date,
    notes: notes || ""
  };
  events.push(newEvent);
  writeEvents(events);
  res.status(201).json(newEvent);
});

// API: update event (dev only)
app.put("/api/events/:id", requireDev, (req, res) => {
  const events = readEvents();
  const idx = events.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });

  const { title, category, emoji, location, date, notes, poster } = req.body || {};
  if (!title || !date) {
    return res.status(400).json({ error: "title and date are required" });
  }
  events[idx] = {
    ...events[idx],
    title,
    category: category || "Hangout",
    emoji: emoji || "📅",
    poster: poster || "",
    location: location || "",
    date,
    notes: notes || ""
  };
  writeEvents(events);
  res.json(events[idx]);
});

// API: delete event (dev only)
app.delete("/api/events/:id", requireDev, (req, res) => {
  const events = readEvents();
  const filtered = events.filter((e) => e.id !== req.params.id);
  if (filtered.length === events.length) {
    return res.status(404).json({ error: "not found" });
  }
  writeEvents(filtered);
  res.status(204).end();
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Upcoming Events running on port ${PORT}`);
});

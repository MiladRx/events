import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from a local .env file if present (no dependency).
// On Railway, use the Variables tab instead.
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) {
          let val = m[2].trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          process.env[m[1]] = val;
        }
      }
    }
  } catch {
    /* ignore */
  }
})();

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

// TMDB movie search (dev only). The API key stays on the server.
// Set TMDB_API_KEY in the environment (Railway Variables / local env).
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

app.get("/api/search", requireDev, async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.json([]);
  if (!TMDB_API_KEY) {
    return res.status(503).json({ error: "TMDB_API_KEY not configured on the server" });
  }
  try {
    const url =
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}` +
      `&include_adult=false&language=en-US&page=1`;
    const headers = {};
    // Support both v4 bearer tokens and v3 api keys
    if (TMDB_API_KEY.startsWith("ey")) {
      headers.Authorization = `Bearer ${TMDB_API_KEY}`;
    }
    const finalUrl = headers.Authorization
      ? url
      : `${url}&api_key=${encodeURIComponent(TMDB_API_KEY)}`;

    const r = await fetch(finalUrl, { headers });
    if (!r.ok) {
      return res.status(502).json({ error: "TMDB request failed" });
    }
    const data = await r.json();
    const results = (data.results || []).slice(0, 12).map((m) => ({
      id: m.id,
      title: m.title,
      year: m.release_date ? m.release_date.slice(0, 4) : "",
      date: m.release_date || "",
      poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : "",
      overview: m.overview || ""
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

// TMDB movie details + cast (public read so everyone can view details).
app.get("/api/movie/:id", async (req, res) => {
  if (!TMDB_API_KEY) {
    return res.status(503).json({ error: "TMDB_API_KEY not configured" });
  }
  const id = encodeURIComponent(req.params.id);
  try {
    const headers = {};
    let auth = "";
    if (TMDB_API_KEY.startsWith("ey")) {
      headers.Authorization = `Bearer ${TMDB_API_KEY}`;
    } else {
      auth = `&api_key=${encodeURIComponent(TMDB_API_KEY)}`;
    }
    const url =
      `https://api.themoviedb.org/3/movie/${id}` +
      `?language=en-US&append_to_response=credits${auth}`;
    const r = await fetch(url, { headers });
    if (!r.ok) return res.status(502).json({ error: "TMDB request failed" });
    const m = await r.json();
    const cast = (m.credits?.cast || []).slice(0, 12).map((c) => ({
      name: c.name,
      character: c.character || "",
      photo: c.profile_path ? `${TMDB_IMG}${c.profile_path}` : ""
    }));
    const director = (m.credits?.crew || []).find((c) => c.job === "Director");
    res.json({
      id: m.id,
      title: m.title,
      tagline: m.tagline || "",
      overview: m.overview || "",
      poster: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : "",
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : "",
      releaseDate: m.release_date || "",
      runtime: m.runtime || 0,
      rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : 0,
      genres: (m.genres || []).map((g) => g.name),
      director: director ? director.name : "",
      cast
    });
  } catch (err) {
    res.status(500).json({ error: "Details failed" });
  }
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
        tmdbId: 1368337,
        poster: "https://image.tmdb.org/t/p/w500/9C9PAnrZcB8x7YHNlBs4PUv0Z7K.jpg",
        location: "",
        date: "2026-07-16T19:00:00",
        notes: "Christopher Nolan's epic. Grab tickets early!"
      },
      {
        id: "spiderman-bnd-2026",
        title: "Spider-Man: Brand New Day",
        category: "Cinema",
        emoji: "🕷️",
        tmdbId: 969681,
        poster: "https://image.tmdb.org/t/p/w500/yyB2VJEW3an2xCdcYCPQhn9QERR.jpg",
        location: "",
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
  const { title, category, emoji, location, date, notes, poster, tmdbId } = req.body || {};
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
    tmdbId: tmdbId || null,
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

  const { title, category, emoji, location, date, notes, poster, tmdbId } = req.body || {};
  if (!title || !date) {
    return res.status(400).json({ error: "title and date are required" });
  }
  events[idx] = {
    ...events[idx],
    title,
    category: category || "Hangout",
    emoji: emoji || "📅",
    poster: poster || "",
    tmdbId: tmdbId !== undefined ? tmdbId : events[idx].tmdbId || null,
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

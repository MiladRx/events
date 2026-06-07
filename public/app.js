const list = document.getElementById("list");
const empty = document.getElementById("empty");
const hero = document.getElementById("hero");
const sheet = document.getElementById("sheet");
const form = document.getElementById("form");
const addBtn = document.getElementById("addBtn");
const devBtn = document.getElementById("devBtn");
const devSheet = document.getElementById("devSheet");
const devForm = document.getElementById("devForm");
const devError = document.getElementById("devError");
const sheetTitle = document.getElementById("sheetTitle");
const submitBtn = document.getElementById("submitBtn");
const movieSearch = document.getElementById("movieSearch");
const searchResults = document.getElementById("searchResults");

let events = [];
let countdownTimer = null;
let editingId = null; // null = adding, otherwise editing this event id
let selectedTmdbId = null; // TMDB id captured when a movie is picked
// Dev password held only for this browser session. Unlocks add/remove.
let devKey = sessionStorage.getItem("devKey") || null;

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function relative(iso) {
  const diff = new Date(iso) - new Date();
  if (diff < 0) return "Past";
  const days = Math.floor(diff / 86400000);
  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  const hrs = Math.floor(diff / 3600000);
  if (hrs >= 1) return `in ${hrs} hr`;
  return "soon";
}

async function load() {
  try {
    const res = await fetch("/api/events");
    events = await res.json();
  } catch {
    events = [];
  }
  render();
  prefetchDetails();
}

function render() {
  list.innerHTML = "";
  const upcoming = events.filter((e) => new Date(e.date) >= new Date());

  // Hero = soonest upcoming
  if (upcoming.length) {
    const next = upcoming[0];
    hero.hidden = false;
    document.getElementById("heroEmoji").textContent = next.emoji || "📅";
    document.getElementById("heroTitle").textContent = next.title;
    document.getElementById("heroMeta").textContent =
      `${fmtDate(next.date)}${next.location ? " · " + next.location : ""}`;
    setHeroPoster(next.poster);
    startCountdown(next.date);
    hero.onclick = () => openDetail(next);
    hero.style.cursor = "pointer";
  } else {
    hero.hidden = true;
    hero.onclick = null;
    if (countdownTimer) clearInterval(countdownTimer);
  }

  empty.hidden = events.length > 0;

  events.forEach((e) => {
    const li = document.createElement("li");
    li.className = "card";
    const past = new Date(e.date) < new Date();
    li.style.opacity = past ? "0.5" : "1";
    li.style.cursor = "pointer";
    const thumb = e.poster
      ? `<img class="card-poster" src="${escapeHtml(e.poster)}" alt="" decoding="async" onload="this.classList.add('loaded')" onerror="this.outerHTML='<div class=&quot;card-emoji&quot;>${e.emoji || "📅"}</div>'" />`
      : `<div class="card-emoji">${e.emoji || "📅"}</div>`;
    li.innerHTML = `
      ${thumb}
      <div class="card-body">
        <div class="card-title">${escapeHtml(e.title)}</div>
        <div class="card-sub">
          <span class="pill">${escapeHtml(e.category || "Event")}</span>
          ${e.location ? `<span>📍 ${escapeHtml(e.location)}</span>` : ""}
        </div>
        <div class="card-when">${fmtDate(e.date)} · ${relative(e.date)}</div>
      </div>
      ${isDev() ? `<div class="card-actions">
        <button class="act-btn edit-btn" aria-label="Edit" data-id="${e.id}">✎</button>
        <button class="act-btn del-btn" aria-label="Delete" data-id="${e.id}">✕</button>
      </div>` : ""}
    `;
    li.addEventListener("click", () => openDetail(e));
    list.appendChild(li);
  });

  if (isDev()) {
    document.querySelectorAll(".del-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeEvent(btn.dataset.id);
      });
    });
    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openEditSheet(btn.dataset.id);
      });
    });
  }
}

function isDev() {
  return !!devKey;
}

// Reflect dev state in the UI (add button + dev button styling)
function applyDevState() {
  addBtn.hidden = !isDev();
  devBtn.textContent = isDev() ? "Dev ✓" : "Dev";
  devBtn.classList.toggle("active", isDev());
}

function setHeroPoster(url) {
  const el = document.getElementById("heroPoster");
  el.classList.remove("loaded");
  if (url) {
    const img = new Image();
    img.onload = () => {
      el.style.backgroundImage = `url("${url}")`;
      el.classList.add("loaded");
      hero.classList.add("has-poster");
    };
    img.onerror = () => {
      el.style.backgroundImage = "";
      hero.classList.remove("has-poster");
    };
    img.src = url;
  } else {
    el.style.backgroundImage = "";
    hero.classList.remove("has-poster");
  }
}

function startCountdown(iso) {
  if (countdownTimer) clearInterval(countdownTimer);
  const tick = () => {
    const diff = new Date(iso) - new Date();
    const d = Math.max(0, diff);
    document.getElementById("cdDays").textContent = Math.floor(d / 86400000);
    document.getElementById("cdHours").textContent = Math.floor((d % 86400000) / 3600000);
    document.getElementById("cdMins").textContent = Math.floor((d % 3600000) / 60000);
    document.getElementById("cdSecs").textContent = Math.floor((d % 60000) / 1000);
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function removeEvent(id) {
  if (!isDev()) return;
  const res = await fetch(`/api/events/${id}`, {
    method: "DELETE",
    headers: { "x-dev-key": devKey }
  });
  if (res.status === 401) {
    lockDev();
    return;
  }
  events = events.filter((e) => e.id !== id);
  render();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Sheet controls
function openSheet() {
  editingId = null;
  sheetTitle.textContent = "New event";
  submitBtn.textContent = "Add event";
  form.reset();
  resetSearch();
  sheet.hidden = false;
  document.body.style.overflow = "hidden";
}
function openEditSheet(id) {
  const e = events.find((ev) => ev.id === id);
  if (!e) return;
  editingId = id;
  sheetTitle.textContent = "Edit event";
  submitBtn.textContent = "Save changes";
  form.title.value = e.title || "";
  form.emoji.value = e.emoji || "";
  form.category.value = e.category || "";
  form.location.value = e.location || "";
  form.poster.value = e.poster || "";
  form.date.value = toInputDate(e.date);
  form.notes.value = e.notes || "";
  resetSearch();
  sheet.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  sheet.hidden = true;
  document.body.style.overflow = "";
  editingId = null;
  form.reset();
}

// Convert an ISO/stored date into the value a datetime-local input expects
function toInputDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

document.getElementById("addBtn").addEventListener("click", () => {
  if (isDev()) openSheet();
});
document.getElementById("cancelBtn").addEventListener("click", closeSheet);
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) closeSheet();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isDev()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  if (selectedTmdbId) data.tmdbId = selectedTmdbId;
  const editing = editingId !== null;
  const res = await fetch(
    editing ? `/api/events/${editingId}` : "/api/events",
    {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", "x-dev-key": devKey },
      body: JSON.stringify(data)
    }
  );
  if (res.status === 401) {
    closeSheet();
    lockDev();
    return;
  }
  if (res.ok) {
    closeSheet();
    await load();
  }
});

// --- Dev access ---
function openDevSheet() {
  devError.hidden = true;
  devForm.reset();
  devSheet.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => devForm.querySelector("input").focus(), 100);
}
function closeDevSheet() {
  devSheet.hidden = true;
  document.body.style.overflow = "";
}
function unlockDev(key) {
  devKey = key;
  sessionStorage.setItem("devKey", key);
  applyDevState();
  render();
}
function lockDev() {
  devKey = null;
  sessionStorage.removeItem("devKey");
  applyDevState();
  render();
}

devBtn.addEventListener("click", () => {
  if (isDev()) {
    lockDev(); // tap again to log out
  } else {
    openDevSheet();
  }
});
document.getElementById("devCancelBtn").addEventListener("click", closeDevSheet);
devSheet.addEventListener("click", (e) => {
  if (e.target === devSheet) closeDevSheet();
});

devForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = new FormData(devForm).get("password");
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (res.ok) {
    closeDevSheet();
    unlockDev(password);
  } else {
    devError.hidden = false;
  }
});

// --- TMDB movie search ---
let searchTimer = null;

function resetSearch() {
  if (movieSearch) movieSearch.value = "";
  selectedTmdbId = null;
  if (searchResults) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
  }
}

function showResultsMessage(cls, text) {
  searchResults.hidden = false;
  searchResults.innerHTML = `<div class="${cls}">${escapeHtml(text)}</div>`;
}

async function doSearch(q) {
  if (!isDev()) return;
  showResultsMessage("search-loading", "Searching…");
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      headers: { "x-dev-key": devKey }
    });
    if (res.status === 401) { lockDev(); return; }
    if (res.status === 503) {
      showResultsMessage("search-empty", "TMDB key not set on the server.");
      return;
    }
    if (!res.ok) {
      showResultsMessage("search-empty", "Search failed. Try again.");
      return;
    }
    const results = await res.json();
    if (!results.length) {
      showResultsMessage("search-empty", "No movies found.");
      return;
    }
    renderResults(results);
  } catch {
    showResultsMessage("search-empty", "Search failed. Try again.");
  }
}

function renderResults(results) {
  searchResults.hidden = false;
  searchResults.innerHTML = "";
  results.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-item";
    const img = m.poster
      ? `<img src="${escapeHtml(m.poster)}" alt="" />`
      : `<div class="si-noimg">🎬</div>`;
    btn.innerHTML = `
      ${img}
      <div class="si-info">
        <div class="si-title">${escapeHtml(m.title)}</div>
        <div class="si-year">${escapeHtml(m.year || "—")}</div>
      </div>
    `;
    btn.addEventListener("click", () => pickMovie(m));
    searchResults.appendChild(btn);
  });
}

function pickMovie(m) {
  form.title.value = m.title || "";
  form.emoji.value = "🎬";
  form.category.value = "Cinema";
  if (m.poster) form.poster.value = m.poster;
  // TMDB gives a date only; default the showtime to 19:00
  if (m.date) form.date.value = `${m.date}T19:00`;
  selectedTmdbId = m.id || null;
  resetSearch();
  movieSearch.value = m.title || "";
}

if (movieSearch) {
  movieSearch.addEventListener("input", () => {
    const q = movieSearch.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
      return;
    }
    searchTimer = setTimeout(() => doSearch(q), 350);
  });
}

// --- Movie / event detail modal ---
const detailModal = document.getElementById("detailModal");

function openDetail(e) {
  // Reset
  document.getElementById("detailTitle").textContent = e.title || "";
  document.getElementById("detailTagline").textContent = "";
  document.getElementById("detailMeta").innerHTML = "";
  document.getElementById("detailGenres").innerHTML = "";
  document.getElementById("detailOverview").textContent = e.notes || "";
  document.getElementById("detailCastWrap").hidden = true;
  document.getElementById("detailCast").innerHTML = "";

  const posterEl = document.getElementById("detailPoster");
  if (e.poster) {
    posterEl.src = e.poster;
    posterEl.hidden = false;
  } else {
    posterEl.hidden = true;
  }
  const bd = document.getElementById("detailBackdrop");
  bd.style.backgroundImage = e.poster ? `url("${e.poster}")` : "";

  // Event-specific info (date, location)
  const past = new Date(e.date) < new Date();
  document.getElementById("detailEventInfo").innerHTML = `
    <div class="detail-when">📅 ${escapeHtml(fmtDate(e.date))} · ${past ? "Past" : relative(e.date)}</div>
    ${e.location ? `<div class="detail-loc">📍 ${escapeHtml(e.location)}</div>` : ""}
  `;

  detailModal.hidden = false;
  document.body.style.overflow = "hidden";

  // If it has a TMDB id, fetch rich details. Otherwise try resolving by title.
  if (e.tmdbId) {
    if (movieCache.has(e.tmdbId)) {
      document.getElementById("detailLoading").hidden = true;
      renderMovieDetails(movieCache.get(e.tmdbId));
    } else {
      document.getElementById("detailLoading").hidden = false;
      loadMovieDetails(e.tmdbId);
    }
  } else {
    const cachedId = resolveCache.get((e.title || "").trim());
    if (cachedId && movieCache.has(cachedId)) {
      document.getElementById("detailLoading").hidden = true;
      renderMovieDetails(movieCache.get(cachedId));
    } else {
      document.getElementById("detailLoading").hidden = false;
      resolveAndLoad(e);
    }
  }
}

// For events without a stored TMDB id, look it up by title.
async function resolveAndLoad(e) {
  const id = await resolveTitle(e.title);
  if (id) {
    loadMovieDetails(id);
  } else {
    document.getElementById("detailLoading").hidden = true;
  }
}

async function loadMovieDetails(tmdbId) {
  const m = await fetchMovie(tmdbId);
  document.getElementById("detailLoading").hidden = true;
  if (m) renderMovieDetails(m);
}

// In-memory cache for this session (server already caches across the system)
const movieCache = new Map();
const resolveCache = new Map();

async function fetchMovie(tmdbId) {
  if (movieCache.has(tmdbId)) return movieCache.get(tmdbId);
  try {
    const res = await fetch(`/api/movie/${tmdbId}`);
    if (!res.ok) return null;
    const m = await res.json();
    movieCache.set(tmdbId, m);
    if (m.backdrop) new Image().src = m.backdrop;
    return m;
  } catch {
    return null;
  }
}

async function resolveTitle(title) {
  const key = (title || "").trim();
  if (!key) return null;
  if (resolveCache.has(key)) return resolveCache.get(key);
  try {
    const res = await fetch(`/api/resolve?title=${encodeURIComponent(key)}`);
    const data = await res.json();
    const id = data && data.id ? data.id : null;
    resolveCache.set(key, id);
    return id;
  } catch {
    return null;
  }
}

// Warm the cache so detail views open instantly
async function prefetchDetails() {
  for (const e of events) {
    let id = e.tmdbId;
    if (!id) id = await resolveTitle(e.title);
    if (id) fetchMovie(id);
  }
}

function renderMovieDetails(m) {
    if (m.backdrop) {
      document.getElementById("detailBackdrop").style.backgroundImage = `url("${m.backdrop}")`;
    }
    if (m.tagline) {
      document.getElementById("detailTagline").textContent = m.tagline;
    }
    if (m.overview) {
      document.getElementById("detailOverview").textContent = m.overview;
    }

    const meta = [];
    if (m.releaseDate) meta.push(new Date(m.releaseDate).getFullYear());
    if (m.runtime) meta.push(`${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m`);
    if (m.rating) meta.push(`★ ${m.rating}`);
    if (m.director) meta.push(` ${m.director}`);
    document.getElementById("detailMeta").innerHTML = meta
      .map((x) => `<span class="meta-chip">${escapeHtml(String(x))}</span>`)
      .join("");

    document.getElementById("detailGenres").innerHTML = (m.genres || [])
      .map((g) => `<span class="genre-tag">${escapeHtml(g)}</span>`)
      .join("");

    if (m.cast && m.cast.length) {
      document.getElementById("detailCastWrap").hidden = false;
      document.getElementById("detailCast").innerHTML = m.cast
        .map((c) => `
          <div class="cast-row-item">
            ${c.photo
              ? `<img class="cast-avatar" src="${escapeHtml(c.photo)}" alt="" loading="lazy" />`
              : `<div class="cast-avatar cast-avatar-empty">🎭</div>`}
            <div class="cast-text">
              <div class="cast-name">${escapeHtml(c.name)}</div>
              ${c.character ? `<div class="cast-char">${escapeHtml(c.character)}</div>` : ""}
            </div>
          </div>
        `)
        .join("");
    }
}

function closeDetail() {
  detailModal.hidden = true;
  document.body.style.overflow = "";
}

document.getElementById("detailClose").addEventListener("click", closeDetail);
detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) closeDetail();
});

applyDevState();
load();

// Lock scrolling while the splash is up, then hide it after 2 seconds
document.body.classList.add("splash-active");
setTimeout(() => {
  const splash = document.getElementById("splash");
  document.body.classList.remove("splash-active");
  if (splash) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 600);
  }
}, 2000);

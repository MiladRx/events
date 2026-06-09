// ---------- State ----------
let events = [];
let activeTab = "upcoming";
let editingId = null;
let selectedTmdbId = null;
let devKey = sessionStorage.getItem("devKey") || null;
const countdownTimers = [];

const movieCache = new Map();
const resolveCache = new Map();

// ---------- Elements ----------
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const emptyText = document.getElementById("emptyText");
const featured = document.getElementById("featured");
const featuredTrack = document.getElementById("featuredTrack");
const featuredDots = document.getElementById("featuredDots");
const addBtn = document.getElementById("addBtn");
const devBtn = document.getElementById("devBtn");
const sheet = document.getElementById("sheet");
const form = document.getElementById("form");
const sheetTitle = document.getElementById("sheetTitle");
const submitBtn = document.getElementById("submitBtn");
const devSheet = document.getElementById("devSheet");
const devForm = document.getElementById("devForm");
const devError = document.getElementById("devError");
const movieSearch = document.getElementById("movieSearch");
const searchResults = document.getElementById("searchResults");
const detailModal = document.getElementById("detailModal");

// ---------- Helpers ----------
function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
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
function isDev() { return !!devKey; }
function isPast(e) { return new Date(e.date) < new Date(); }

// ---------- Load ----------
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

function clearCountdowns() {
  while (countdownTimers.length) clearInterval(countdownTimers.pop());
}

function render() {
  clearCountdowns();
  const upcoming = events.filter((e) => !isPast(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = events.filter(isPast).sort((a, b) => new Date(b.date) - new Date(a.date));

  renderFeatured(upcoming);

  const shown = activeTab === "upcoming" ? upcoming : past;
  grid.innerHTML = "";
  empty.hidden = shown.length > 0;
  emptyText.textContent = activeTab === "upcoming" ? "No upcoming events yet." : "Nothing in the past yet.";

  shown.forEach((e, i) => {
    const card = document.createElement("div");
    card.className = "poster-card";
    card.style.animationDelay = `${Math.min(i * 0.04, 0.4)}s`;
    const img = e.poster
      ? `<img class="pc-img" src="${esc(e.poster)}" alt="" decoding="async" onload="this.classList.add('loaded')" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'pc-fallback',textContent:'${e.emoji || "🎬"}'}))" />`
      : `<div class="pc-fallback">${e.emoji || "🎬"}</div>`;
    card.innerHTML = `
      <div class="pc-poster">
        ${img}
        <span class="pc-badge">${esc(relative(e.date))}</span>
        ${isDev() ? `<div class="pc-actions">
          <button class="pc-act edit-btn" data-id="${e.id}" aria-label="Edit">✎</button>
          <button class="pc-act del-btn" data-id="${e.id}" aria-label="Delete">✕</button>
        </div>` : ""}
      </div>
      <div class="pc-title">${esc(e.title)}</div>
      <div class="pc-date">${esc(fmtDate(e.date))}</div>
    `;
    card.querySelector(".pc-poster").addEventListener("click", () => openDetail(e));
    card.querySelector(".pc-title").addEventListener("click", () => openDetail(e));
    grid.appendChild(card);
  });

  if (isDev()) {
    grid.querySelectorAll(".del-btn").forEach((b) =>
      b.addEventListener("click", (ev) => { ev.stopPropagation(); removeEvent(b.dataset.id); })
    );
    grid.querySelectorAll(".edit-btn").forEach((b) =>
      b.addEventListener("click", (ev) => { ev.stopPropagation(); openEditSheet(b.dataset.id); })
    );
  }
}

// ---------- Featured carousel ----------
let featuredIndex = 0;
function renderFeatured(upcoming) {
  const top = upcoming.slice(0, 5);
  if (!top.length) { featured.hidden = true; featuredTrack.innerHTML = ""; featuredDots.innerHTML = ""; return; }
  featured.hidden = false;
  featuredTrack.innerHTML = "";
  featuredDots.innerHTML = "";

  top.forEach((e) => {
    const slide = document.createElement("div");
    slide.className = "fslide";
    slide.innerHTML = `
      <div class="fslide-bg" style="background-image:url('${esc(e.poster || "")}')"></div>
      <div class="fslide-grad"></div>
      <div class="fslide-content">
        <span class="fslide-kicker">Next up</span>
        <h2 class="fslide-title">${esc(e.title)}</h2>
        <p class="fslide-meta">${esc(fmtDate(e.date))}</p>
        <div class="fslide-cd" data-date="${esc(e.date)}"></div>
      </div>
    `;
    slide.addEventListener("click", () => openDetail(e));
    featuredTrack.appendChild(slide);

    const dot = document.createElement("span");
    dot.className = "fdot";
    featuredDots.appendChild(dot);
  });

  // Live countdown for each slide
  featuredTrack.querySelectorAll(".fslide-cd").forEach((el) => {
    const tick = () => {
      const diff = Math.max(0, new Date(el.dataset.date) - new Date());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.innerHTML = `
        <div class="cd"><b>${d}</b><i>days</i></div>
        <div class="cd"><b>${h}</b><i>hrs</i></div>
        <div class="cd"><b>${m}</b><i>min</i></div>
        <div class="cd"><b>${s}</b><i>sec</i></div>`;
    };
    tick();
    countdownTimers.push(setInterval(tick, 1000));
  });

  featuredIndex = Math.min(featuredIndex, top.length - 1);
  updateDots();
}

function updateDots() {
  featuredDots.querySelectorAll(".fdot").forEach((d, i) =>
    d.classList.toggle("active", i === featuredIndex)
  );
}
featuredTrack.addEventListener("scroll", () => {
  const i = Math.round(featuredTrack.scrollLeft / featuredTrack.clientWidth);
  if (i !== featuredIndex) { featuredIndex = i; updateDots(); }
});

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("is-active"));
    t.classList.add("is-active");
    activeTab = t.dataset.tab;
    render();
  });
});

// ---------- Dev ----------
function applyDevState() {
  addBtn.hidden = !isDev();
  devBtn.textContent = isDev() ? "Dev ✓" : "Dev";
  devBtn.classList.toggle("active", isDev());
}
function unlockDev(key) { devKey = key; sessionStorage.setItem("devKey", key); applyDevState(); render(); }
function lockDev() { devKey = null; sessionStorage.removeItem("devKey"); applyDevState(); render(); }

devBtn.addEventListener("click", () => { isDev() ? lockDev() : openDevSheet(); });
function openDevSheet() {
  devError.hidden = true; devForm.reset(); devSheet.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => devForm.querySelector("input").focus(), 100);
}
function closeDevSheet() { devSheet.hidden = true; document.body.style.overflow = ""; }
document.getElementById("devCancelBtn").addEventListener("click", closeDevSheet);
devSheet.addEventListener("click", (e) => { if (e.target === devSheet) closeDevSheet(); });
devForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = new FormData(devForm).get("password");
  const res = await fetch("/api/auth", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password })
  });
  if (res.ok) { closeDevSheet(); unlockDev(password); } else { devError.hidden = false; }
});

// ---------- Add / edit sheet ----------
function openSheet() {
  editingId = null;
  sheetTitle.textContent = "New event";
  submitBtn.textContent = "Add event";
  form.reset(); resetSearch();
  sheet.hidden = false; document.body.style.overflow = "hidden";
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
  selectedTmdbId = e.tmdbId || null;
  resetSearch();
  sheet.hidden = false; document.body.style.overflow = "hidden";
}
function closeSheet() {
  sheet.hidden = true; document.body.style.overflow = "";
  editingId = null; form.reset();
}
function toInputDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
addBtn.addEventListener("click", () => { if (isDev()) openSheet(); });
document.getElementById("cancelBtn").addEventListener("click", closeSheet);
sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isDev()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  if (selectedTmdbId) data.tmdbId = selectedTmdbId;
  const editing = editingId !== null;
  const res = await fetch(editing ? `/api/events/${editingId}` : "/api/events", {
    method: editing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", "x-dev-key": devKey },
    body: JSON.stringify(data)
  });
  if (res.status === 401) { closeSheet(); lockDev(); return; }
  if (res.ok) { closeSheet(); await load(); }
});

async function removeEvent(id) {
  if (!isDev()) return;
  const res = await fetch(`/api/events/${id}`, { method: "DELETE", headers: { "x-dev-key": devKey } });
  if (res.status === 401) { lockDev(); return; }
  events = events.filter((e) => e.id !== id);
  render();
}

// ---------- TMDB search ----------
let searchTimer = null;
function resetSearch() {
  if (movieSearch) movieSearch.value = "";
  selectedTmdbId = null;
  if (searchResults) { searchResults.hidden = true; searchResults.innerHTML = ""; }
}
function searchMsg(cls, text) { searchResults.hidden = false; searchResults.innerHTML = `<div class="${cls}">${esc(text)}</div>`; }
async function doSearch(q) {
  if (!isDev()) return;
  searchMsg("search-loading", "Searching…");
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { headers: { "x-dev-key": devKey } });
    if (res.status === 401) { lockDev(); return; }
    if (res.status === 503) { searchMsg("search-empty", "TMDB key not set on the server."); return; }
    if (!res.ok) { searchMsg("search-empty", "Search failed. Try again."); return; }
    const results = await res.json();
    if (!results.length) { searchMsg("search-empty", "No movies found."); return; }
    renderResults(results);
  } catch { searchMsg("search-empty", "Search failed. Try again."); }
}
function renderResults(results) {
  searchResults.hidden = false;
  searchResults.innerHTML = "";
  results.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "search-item";
    btn.innerHTML = `
      ${m.poster ? `<img src="${esc(m.poster)}" alt="" />` : `<div class="si-noimg">🎬</div>`}
      <div class="si-info"><div class="si-title">${esc(m.title)}</div><div class="si-year">${esc(m.year || "—")}</div></div>`;
    btn.addEventListener("click", () => pickMovie(m));
    searchResults.appendChild(btn);
  });
}
function pickMovie(m) {
  form.title.value = m.title || "";
  form.emoji.value = "🎬";
  form.category.value = "Cinema";
  if (m.poster) form.poster.value = m.poster;
  if (m.date) form.date.value = `${m.date}T19:00`;
  selectedTmdbId = m.id || null;
  resetSearch();
  movieSearch.value = m.title || "";
}
if (movieSearch) {
  movieSearch.addEventListener("input", () => {
    const q = movieSearch.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { searchResults.hidden = true; searchResults.innerHTML = ""; return; }
    searchTimer = setTimeout(() => doSearch(q), 350);
  });
}

// ---------- Detail ----------
function openDetail(e) {
  document.getElementById("detailTitle").textContent = e.title || "";
  document.getElementById("detailTagline").textContent = "";
  document.getElementById("detailMeta").innerHTML = "";
  document.getElementById("detailGenres").innerHTML = "";
  document.getElementById("detailOverview").textContent = e.notes || "";
  document.getElementById("detailOverview").classList.remove("expanded");
  document.getElementById("detailCastWrap").hidden = true;
  document.getElementById("detailCast").innerHTML = "";
  document.getElementById("trailerBtn").hidden = true;

  const posterEl = document.getElementById("detailPoster");
  if (e.poster) { posterEl.src = e.poster; posterEl.hidden = false; } else { posterEl.hidden = true; }
  document.getElementById("detailBackdrop").style.backgroundImage = e.poster ? `url("${e.poster}")` : "";

  document.getElementById("detailEventInfo").innerHTML = `
    <div class="detail-when">📅 ${esc(fmtDate(e.date))} · ${isPast(e) ? "Past" : relative(e.date)}</div>
    ${e.location ? `<div class="detail-loc">📍 ${esc(e.location)}</div>` : ""}`;

  detailModal.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("detailScroll").scrollTop = 0;

  if (e.tmdbId) {
    if (movieCache.has(e.tmdbId)) { document.getElementById("detailLoading").hidden = true; renderMovieDetails(movieCache.get(e.tmdbId)); }
    else { document.getElementById("detailLoading").hidden = false; loadMovieDetails(e.tmdbId); }
  } else {
    const cid = resolveCache.get((e.title || "").trim());
    if (cid && movieCache.has(cid)) { document.getElementById("detailLoading").hidden = true; renderMovieDetails(movieCache.get(cid)); }
    else { document.getElementById("detailLoading").hidden = false; resolveAndLoad(e); }
  }
}
async function resolveAndLoad(e) {
  const id = await resolveTitle(e.title);
  if (id) loadMovieDetails(id);
  else document.getElementById("detailLoading").hidden = true;
}
async function loadMovieDetails(id) {
  const m = await fetchMovie(id);
  document.getElementById("detailLoading").hidden = true;
  if (m) renderMovieDetails(m);
}
async function fetchMovie(id) {
  if (movieCache.has(id)) return movieCache.get(id);
  try {
    const res = await fetch(`/api/movie/${id}`);
    if (!res.ok) return null;
    const m = await res.json();
    movieCache.set(id, m);
    if (m.backdrop) new Image().src = m.backdrop;
    return m;
  } catch { return null; }
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
  } catch { return null; }
}
async function prefetchDetails() {
  for (const e of events) {
    let id = e.tmdbId;
    if (!id) id = await resolveTitle(e.title);
    if (id) fetchMovie(id);
  }
}
function renderMovieDetails(m) {
  if (m.backdrop) document.getElementById("detailBackdrop").style.backgroundImage = `url("${m.backdrop}")`;
  if (m.tagline) document.getElementById("detailTagline").textContent = m.tagline;
  if (m.overview) document.getElementById("detailOverview").textContent = m.overview;

  const meta = [];
  if (m.releaseDate) meta.push(new Date(m.releaseDate).getFullYear());
  if (m.runtime) meta.push(`${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m`);
  if (m.rating) meta.push(`★ ${m.rating}`);
  if (m.director) meta.push(m.director);
  document.getElementById("detailMeta").innerHTML = meta.map((x) => `<span class="meta-chip">${esc(String(x))}</span>`).join("");

  document.getElementById("detailGenres").innerHTML = (m.genres || []).map((g) => `<span class="genre-tag">${esc(g)}</span>`).join("");

  const trailer = document.getElementById("trailerBtn");
  if (m.trailer) { trailer.href = m.trailer; trailer.hidden = false; } else { trailer.hidden = true; }

  if (m.cast && m.cast.length) {
    document.getElementById("detailCastWrap").hidden = false;
    document.getElementById("detailCast").innerHTML = m.cast.map((c) => `
      <div class="cast-item">
        ${c.photo ? `<img class="cast-avatar" src="${esc(c.photo)}" alt="" loading="lazy" />` : `<div class="cast-avatar cast-avatar-empty">🎭</div>`}
        <div class="cast-name">${esc(c.name)}</div>
        ${c.character ? `<div class="cast-char">${esc(c.character)}</div>` : ""}
      </div>`).join("");
  }
}
function closeDetail() {
  detailModal.hidden = true;
  document.body.style.overflow = "";
  document.getElementById("detailScroll").scrollTop = 0;
}
document.getElementById("detailClose").addEventListener("click", closeDetail);
document.getElementById("detailOverview").addEventListener("click", function () { this.classList.toggle("expanded"); });

// ---------- Init ----------
applyDevState();
load();

document.body.classList.add("splash-active");
setTimeout(() => {
  const splash = document.getElementById("splash");
  document.body.classList.remove("splash-active");
  if (splash) { splash.classList.add("hide"); setTimeout(() => splash.remove(), 600); }
}, 1500);

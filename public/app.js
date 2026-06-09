// ========== STATE ==========
let events = [];
let activeTab = "upcoming";
let editingId = null;
let selectedTmdbId = null;
let devKey = sessionStorage.getItem("devKey") || null;
let countdownTimer = null;

const movieCache = new Map();
const resolveCache = new Map();

// ========== ELEMENTS ==========
const $hero = document.getElementById("hero");
const $grid = document.getElementById("grid");
const $empty = document.getElementById("empty");
const $emptyText = document.getElementById("emptyText");
const $fab = document.getElementById("fab");
const $devBtn = document.getElementById("devBtn");
const $sheet = document.getElementById("sheet");
const $sheetTitle = document.getElementById("sheetTitle");
const $submitBtn = document.getElementById("submitBtn");
const $form = document.getElementById("form");
const $devSheet = document.getElementById("devSheet");
const $devForm = document.getElementById("devForm");
const $devError = document.getElementById("devError");
const $movieSearch = document.getElementById("movieSearch");
const $searchResults = document.getElementById("searchResults");
const $detail = document.getElementById("detail");
const $splash = document.getElementById("splash");

// ========== HELPERS ==========
function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
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

function isDev() {
  return !!devKey;
}

function isPast(e) {
  return new Date(e.date) < new Date();
}

function toInputDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ========== API ==========
async function loadEvents() {
  try {
    const res = await fetch("/api/events");
    events = await res.json();
  } catch {
    events = [];
  }
  render();
  prefetchDetails();
}

// ========== RENDER ==========
function render() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;

  const upcoming = events.filter((e) => !isPast(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = events.filter(isPast).sort((a, b) => new Date(b.date) - new Date(a.date));

  renderHero(upcoming);

  const shown = activeTab === "upcoming" ? upcoming : past;
  $grid.innerHTML = "";
  $empty.hidden = shown.length > 0;
  $emptyText.textContent = activeTab === "upcoming" ? "No upcoming events" : "Nothing in the past";

  shown.forEach((e, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.animationDelay = `${Math.min(i * 0.05, 0.4)}s`;

    const img = e.poster
      ? `<img class="card-img" src="${esc(e.poster)}" alt="" decoding="async" onload="this.classList.add('loaded')" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-fallback',textContent:'${e.emoji || "🎬"}'}))" />`
      : `<div class="card-fallback">${e.emoji || "🎬"}</div>`;

    card.innerHTML = `
      <div class="card-poster">
        ${img}
        <span class="card-badge">${esc(relative(e.date))}</span>
        ${isDev() ? `<div class="card-actions">
          <button class="card-btn edit" data-id="${e.id}">✎</button>
          <button class="card-btn del" data-id="${e.id}">✕</button>
        </div>` : ""}
      </div>
      <div class="card-title">${esc(e.title)}</div>
      <div class="card-date">${esc(fmtDate(e.date))}</div>
    `;

    card.querySelector(".card-poster").addEventListener("click", () => openDetail(e));
    card.querySelector(".card-title").addEventListener("click", () => openDetail(e));

    if (isDev()) {
      card.querySelector(".edit")?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openEditSheet(e.id);
      });
      card.querySelector(".del")?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeEvent(e.id);
      });
    }

    $grid.appendChild(card);
  });
}

function renderHero(upcoming) {
  if (!upcoming.length) {
    $hero.hidden = true;
    return;
  }

  const top = upcoming[0];
  $hero.hidden = false;
  $hero.innerHTML = `
    <div class="hero-bg" style="background-image:url('${esc(top.poster || "")}')"></div>
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <span class="hero-badge">Next up</span>
      <h2 class="hero-title">${esc(top.title)}</h2>
      <p class="hero-date">${esc(fmtDate(top.date))}</p>
      <div class="hero-countdown"></div>
    </div>
  `;

  $hero.addEventListener("click", () => openDetail(top));

  const cdEl = $hero.querySelector(".hero-countdown");
  const tick = () => {
    const diff = Math.max(0, new Date(top.date) - new Date());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    cdEl.innerHTML = `
      <div class="cd-box"><span class="cd-num">${d}</span><span class="cd-label">days</span></div>
      <div class="cd-box"><span class="cd-num">${h}</span><span class="cd-label">hrs</span></div>
      <div class="cd-box"><span class="cd-num">${m}</span><span class="cd-label">min</span></div>
      <div class="cd-box"><span class="cd-num">${s}</span><span class="cd-label">sec</span></div>
    `;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ========== TABS ==========
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    activeTab = t.dataset.tab;
    render();
  });
});

// ========== DEV ==========
function updateDevUI() {
  $fab.hidden = !isDev();
  $devBtn.textContent = isDev() ? "Dev ✓" : "Dev";
  $devBtn.classList.toggle("is-dev", isDev());
}

function unlockDev(key) {
  devKey = key;
  sessionStorage.setItem("devKey", key);
  updateDevUI();
  render();
}

function lockDev() {
  devKey = null;
  sessionStorage.removeItem("devKey");
  updateDevUI();
  render();
}

$devBtn.addEventListener("click", () => {
  if (isDev()) lockDev();
  else openDevSheet();
});

function openDevSheet() {
  $devError.hidden = true;
  $devForm.reset();
  $devSheet.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $devForm.querySelector("input").focus(), 100);
}

function closeDevSheet() {
  $devSheet.hidden = true;
  document.body.style.overflow = "";
}

document.getElementById("devCancelBtn").addEventListener("click", closeDevSheet);
$devSheet.addEventListener("click", (e) => {
  if (e.target === $devSheet) closeDevSheet();
});

$devForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = new FormData($devForm).get("password");
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (res.ok) {
    closeDevSheet();
    unlockDev(password);
  } else {
    $devError.hidden = false;
  }
});

// ========== ADD/EDIT SHEET ==========
function openAddSheet() {
  editingId = null;
  $sheetTitle.textContent = "New event";
  $submitBtn.textContent = "Add event";
  $form.reset();
  resetSearch();
  $sheet.hidden = false;
  document.body.style.overflow = "hidden";
}

function openEditSheet(id) {
  const e = events.find((ev) => ev.id === id);
  if (!e) return;
  editingId = id;
  $sheetTitle.textContent = "Edit event";
  $submitBtn.textContent = "Save changes";
  $form.title.value = e.title || "";
  $form.emoji.value = e.emoji || "";
  $form.category.value = e.category || "";
  $form.location.value = e.location || "";
  $form.poster.value = e.poster || "";
  $form.date.value = toInputDate(e.date);
  $form.notes.value = e.notes || "";
  selectedTmdbId = e.tmdbId || null;
  resetSearch();
  $sheet.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  $sheet.hidden = true;
  document.body.style.overflow = "";
  editingId = null;
  $form.reset();
}

$fab.addEventListener("click", () => {
  if (isDev()) openAddSheet();
});

document.getElementById("cancelBtn").addEventListener("click", closeSheet);
$sheet.addEventListener("click", (e) => {
  if (e.target === $sheet) closeSheet();
});

$form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isDev()) return;

  const data = Object.fromEntries(new FormData($form).entries());
  if (selectedTmdbId) data.tmdbId = selectedTmdbId;

  const editing = editingId !== null;
  const res = await fetch(editing ? `/api/events/${editingId}` : "/api/events", {
    method: editing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", "x-dev-key": devKey },
    body: JSON.stringify(data)
  });

  if (res.status === 401) {
    closeSheet();
    lockDev();
    return;
  }

  if (res.ok) {
    closeSheet();
    await loadEvents();
  }
});

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

// ========== TMDB SEARCH ==========
let searchTimer = null;

function resetSearch() {
  if ($movieSearch) $movieSearch.value = "";
  selectedTmdbId = null;
  if ($searchResults) {
    $searchResults.hidden = true;
    $searchResults.innerHTML = "";
  }
}

function searchMsg(cls, text) {
  $searchResults.hidden = false;
  $searchResults.innerHTML = `<div class="${cls}">${esc(text)}</div>`;
}

async function doSearch(q) {
  if (!isDev()) return;
  searchMsg("search-loading", "Searching…");
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      headers: { "x-dev-key": devKey }
    });
    if (res.status === 401) {
      lockDev();
      return;
    }
    if (res.status === 503) {
      searchMsg("search-empty", "TMDB key not set");
      return;
    }
    if (!res.ok) {
      searchMsg("search-empty", "Search failed");
      return;
    }
    const results = await res.json();
    if (!results.length) {
      searchMsg("search-empty", "No movies found");
      return;
    }
    renderSearchResults(results);
  } catch {
    searchMsg("search-empty", "Search failed");
  }
}

function renderSearchResults(results) {
  $searchResults.hidden = false;
  $searchResults.innerHTML = "";
  results.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-item";
    btn.innerHTML = `
      ${m.poster ? `<img src="${esc(m.poster)}" alt="" />` : `<div class="search-noimg">🎬</div>`}
      <div class="search-info">
        <div class="search-title">${esc(m.title)}</div>
        <div class="search-year">${esc(m.year || "—")}</div>
      </div>
    `;
    btn.addEventListener("click", () => pickMovie(m));
    $searchResults.appendChild(btn);
  });
}

function pickMovie(m) {
  $form.title.value = m.title || "";
  $form.emoji.value = "🎬";
  $form.category.value = "Cinema";
  if (m.poster) $form.poster.value = m.poster;
  if (m.date) $form.date.value = `${m.date}T19:00`;
  selectedTmdbId = m.id || null;
  resetSearch();
  $movieSearch.value = m.title || "";
}

if ($movieSearch) {
  $movieSearch.addEventListener("input", () => {
    const q = $movieSearch.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) {
      $searchResults.hidden = true;
      $searchResults.innerHTML = "";
      return;
    }
    searchTimer = setTimeout(() => doSearch(q), 350);
  });
}

// ========== DETAIL MODAL ==========
function openDetail(e) {
  const $title = document.getElementById("detailTitle");
  const $tagline = document.getElementById("detailTagline");
  const $meta = document.getElementById("detailMeta");
  const $poster = document.getElementById("detailPoster");
  const $backdrop = document.getElementById("detailBackdrop");
  const $event = document.getElementById("detailEvent");
  const $genres = document.getElementById("detailGenres");
  const $overview = document.getElementById("detailOverview");
  const $castSection = document.getElementById("castSection");
  const $cast = document.getElementById("cast");
  const $trailer = document.getElementById("trailerBtn");
  const $loading = document.getElementById("detailLoading");

  $title.textContent = e.title || "";
  $tagline.textContent = "";
  $meta.innerHTML = "";
  $genres.innerHTML = "";
  $overview.textContent = e.notes || "";
  $overview.classList.remove("expanded");
  $castSection.hidden = true;
  $cast.innerHTML = "";
  $trailer.hidden = true;
  $loading.hidden = true;

  if (e.poster) {
    $poster.src = e.poster;
    $poster.hidden = false;
  } else {
    $poster.hidden = true;
  }

  $backdrop.style.backgroundImage = e.poster ? `url("${e.poster}")` : "";

  $event.innerHTML = `
    <div class="detail-when">📅 ${esc(fmtDate(e.date))} · ${isPast(e) ? "Past" : relative(e.date)}</div>
    ${e.location ? `<div class="detail-loc">📍 ${esc(e.location)}</div>` : ""}
  `;

  $detail.hidden = false;
  document.body.style.overflow = "hidden";
  document.querySelector(".detail-content").scrollTop = 0;

  if (e.tmdbId) {
    if (movieCache.has(e.tmdbId)) {
      renderMovieDetails(movieCache.get(e.tmdbId));
    } else {
      $loading.hidden = false;
      loadMovieDetails(e.tmdbId);
    }
  } else {
    const cid = resolveCache.get((e.title || "").trim());
    if (cid && movieCache.has(cid)) {
      renderMovieDetails(movieCache.get(cid));
    } else {
      $loading.hidden = false;
      resolveAndLoad(e);
    }
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

async function prefetchDetails() {
  for (const e of events) {
    let id = e.tmdbId;
    if (!id) id = await resolveTitle(e.title);
    if (id) fetchMovie(id);
  }
}

function renderMovieDetails(m) {
  const $backdrop = document.getElementById("detailBackdrop");
  const $tagline = document.getElementById("detailTagline");
  const $meta = document.getElementById("detailMeta");
  const $genres = document.getElementById("detailGenres");
  const $overview = document.getElementById("detailOverview");
  const $trailer = document.getElementById("trailerBtn");
  const $castSection = document.getElementById("castSection");
  const $cast = document.getElementById("cast");

  if (m.backdrop) $backdrop.style.backgroundImage = `url("${m.backdrop}")`;
  if (m.tagline) $tagline.textContent = m.tagline;
  if (m.overview) $overview.textContent = m.overview;

  const meta = [];
  if (m.releaseDate) meta.push(new Date(m.releaseDate).getFullYear());
  if (m.runtime) meta.push(`${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m`);
  if (m.rating) meta.push(`★ ${m.rating}`);
  if (m.director) meta.push(m.director);
  $meta.innerHTML = meta.map((x) => `<span class="meta-tag">${esc(String(x))}</span>`).join("");

  $genres.innerHTML = (m.genres || []).map((g) => `<span class="genre">${esc(g)}</span>`).join("");

  if (m.trailer) {
    $trailer.href = m.trailer;
    $trailer.hidden = false;
  } else {
    $trailer.hidden = true;
  }

  if (m.cast && m.cast.length) {
    $castSection.hidden = false;
    $cast.innerHTML = m.cast
      .map(
        (c) => `
      <div class="cast-member">
        ${
          c.photo
            ? `<img class="cast-photo" src="${esc(c.photo)}" alt="" loading="lazy" />`
            : `<div class="cast-photo cast-photo-empty">🎭</div>`
        }
        <div class="cast-name">${esc(c.name)}</div>
        ${c.character ? `<div class="cast-role">${esc(c.character)}</div>` : ""}
      </div>
    `
      )
      .join("");
  }
}

function closeDetail() {
  $detail.hidden = true;
  document.body.style.overflow = "";
  document.querySelector(".detail-content").scrollTop = 0;
}

document.getElementById("closeDetail").addEventListener("click", closeDetail);
document.getElementById("detailOverview").addEventListener("click", function () {
  this.classList.toggle("expanded");
});

// ========== INIT ==========
updateDevUI();
loadEvents();

setTimeout(() => {
  $splash.classList.add("hide");
  document.body.classList.remove("splash-active");
  setTimeout(() => $splash.remove(), 600);
}, 1500);

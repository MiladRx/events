/* ==========================================================================
   Upcoming — client
   ========================================================================== */

// ---------- State ----------
let events = [];
let activeTab = "upcoming";
let editingId = null;
let selectedTmdbId = null;
let devKey = null;
try { devKey = sessionStorage.getItem("devKey"); } catch { devKey = null; }

const movieCache = new Map();   // tmdbId -> payload
const resolveCache = new Map(); // title   -> tmdbId | null

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);

const el = {
  splash: $("splash"),
  hero: $("hero"),
  grid: $("grid"),
  empty: $("empty"),
  emptyText: $("emptyText"),
  loadError: $("loadError"),
  retryBtn: $("retryBtn"),
  fab: $("fab"),
  devBtn: $("devBtn"),
  devBtnLabel: $("devBtnLabel"),
  tabs: document.querySelector(".tabs"),
  sheet: $("sheet"),
  sheetTitle: $("sheetTitle"),
  form: $("form"),
  submitBtn: $("submitBtn"),
  formError: $("formError"),
  devSheet: $("devSheet"),
  devForm: $("devForm"),
  devError: $("devError"),
  fPass: $("f-pass"),
  confirm: $("confirm"),
  confirmTitle: $("confirmTitle"),
  confirmText: $("confirmText"),
  confirmOk: $("confirmOk"),
  confirmCancel: $("confirmCancel"),
  movieSearch: $("movieSearch"),
  fTitle: $("f-title"),
  fEmoji: $("f-emoji"),
  fCategory: $("f-category"),
  fLocation: $("f-location"),
  fPoster: $("f-poster"),
  fDate: $("f-date"),
  fNotes: $("f-notes"),
  searchResults: $("searchResults"),
  searchStatus: $("searchStatus"),
  detail: $("detail"),
  detailPanel: $("detailPanel"),
  detailBackdrop: $("detailBackdrop"),
  detailPoster: $("detailPoster"),
  detailTitle: $("detailTitle"),
  detailTagline: $("detailTagline"),
  detailMeta: $("detailMeta"),
  detailEvent: $("detailEvent"),
  detailGenres: $("detailGenres"),
  detailOverview: $("detailOverview"),
  overviewToggle: $("overviewToggle"),
  castSection: $("castSection"),
  cast: $("cast"),
  trailerBtn: $("trailerBtn"),
  detailLoading: $("detailLoading"),
  detailDevActions: $("detailDevActions"),
  detailEdit: $("detailEdit"),
  detailDelete: $("detailDelete"),
  closeDetail: $("closeDetail"),
  toast: $("toast")
};

// ---------- Small helpers ----------
const isDev = () => !!devKey;
const isPast = (e) => new Date(e.date).getTime() < Date.now();

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "Date TBC";
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

function relative(iso) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "TBC";
  const diff = t - Date.now();
  if (diff <= 0) return "Past";
  const days = Math.floor(diff / 86400000);
  if (days >= 2) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  const hrs = Math.floor(diff / 3600000);
  if (hrs >= 1) return `in ${hrs} ${hrs === 1 ? "hr" : "hrs"}`;
  const mins = Math.floor(diff / 60000);
  if (mins >= 1) return `in ${mins} min`;
  return "now";
}

function toInputDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
         `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Serve phones a smaller poster than desktops. TMDB exposes fixed widths in
   the path, so we can build a srcset without touching the API. */
const TMDB_PATH = /^(https:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/.+)$/;
function tmdbSize(url, size) {
  const m = TMDB_PATH.exec(url || "");
  return m ? `${m[1]}${size}${m[3]}` : url;
}
function posterSrc(url) {
  if (!TMDB_PATH.test(url || "")) return { src: url, srcset: "" };
  return {
    src: tmdbSize(url, "w342"),
    srcset: `${tmdbSize(url, "w185")} 185w, ${tmdbSize(url, "w342")} 342w, ${tmdbSize(url, "w500")} 500w`
  };
}

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    let data = null;
    if (res.status !== 204) {
      data = await res.json().catch(() => null);
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

let toastTimer = null;
function toast(message, kind = "") {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.toggle("is-error", kind === "error");
  el.toast.hidden = false;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => el.toast.classList.add("is-on"))
  );
  toastTimer = setTimeout(() => {
    el.toast.classList.remove("is-on");
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 300);
  }, 2600);
}

// ---------- Scroll lock ----------
/* Fixing the body is the only lock iOS Safari respects. Reference-counted so
   nested opens/closes can't leave the page stuck. */
const scrollLock = (() => {
  let depth = 0;
  let savedY = 0;
  return {
    lock() {
      if (depth++ > 0) return;
      savedY = window.scrollY || window.pageYOffset || 0;
      const b = document.body.style;
      b.position = "fixed";
      b.top = `-${savedY}px`;
      b.left = "0";
      b.right = "0";
      b.width = "100%";
    },
    unlock() {
      if (depth === 0 || --depth > 0) return;
      const b = document.body.style;
      b.position = ""; b.top = ""; b.left = ""; b.right = ""; b.width = "";
      window.scrollTo(0, savedY);
    }
  };
})();

// ---------- Overlay manager ----------
/* One overlay at a time. Each session owns exactly one history entry so the
   Android/browser back button closes the overlay instead of leaving the app. */
let activeOverlay = null;   // { id, root, dialog, onClose, lastFocus }
let ownsHistory = false;
let ignoreNextPop = false;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),' +
  'select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function openOverlay(id, root, dialog, opts = {}) {
  const replacing = !!activeOverlay;
  const lastFocus = replacing ? activeOverlay.lastFocus : document.activeElement;
  if (replacing) teardownOverlay({ keepFocus: true });

  activeOverlay = { id, root, dialog, onClose: opts.onClose || null, lastFocus };
  root.hidden = false;
  scrollLock.lock();

  if (!replacing) {
    try {
      history.pushState({ ovl: id }, "");
      ownsHistory = true;
    } catch {
      ownsHistory = false;
    }
  }

  requestAnimationFrame(() => {
    if (!activeOverlay || activeOverlay.id !== id) return;
    const target = opts.focus || dialog.querySelector(FOCUSABLE);
    if (target) {
      try { target.focus({ preventScroll: true }); } catch { target.focus(); }
    }
  });
}

function teardownOverlay({ keepFocus = false } = {}) {
  const o = activeOverlay;
  if (!o) return;
  activeOverlay = null;
  o.root.hidden = true;
  scrollLock.unlock();
  if (o.onClose) o.onClose();
  if (!keepFocus && o.lastFocus && document.contains(o.lastFocus)) {
    try { o.lastFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
}

function closeOverlay() {
  if (!activeOverlay) return;
  const owned = ownsHistory;
  ownsHistory = false;
  teardownOverlay();
  if (owned) {
    ignoreNextPop = true;
    history.back();
    // Safety valve: never leave the flag set if popstate doesn't arrive.
    setTimeout(() => { ignoreNextPop = false; }, 500);
  }
}

window.addEventListener("popstate", () => {
  if (ignoreNextPop) { ignoreNextPop = false; return; }
  if (activeOverlay) { ownsHistory = false; teardownOverlay(); }
});

document.addEventListener("keydown", (ev) => {
  if (!activeOverlay) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    closeOverlay();
    return;
  }
  if (ev.key !== "Tab") return;

  const items = [...activeOverlay.dialog.querySelectorAll(FOCUSABLE)]
    .filter((n) => !n.hidden && n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (ev.shiftKey && document.activeElement === first) {
    ev.preventDefault(); last.focus();
  } else if (!ev.shiftKey && document.activeElement === last) {
    ev.preventDefault(); first.focus();
  } else if (!activeOverlay.dialog.contains(document.activeElement)) {
    ev.preventDefault(); first.focus();
  }
});

// Backdrop taps close the overlay.
[el.sheet, el.devSheet, el.confirm, el.detail].forEach((root) => {
  root.addEventListener("click", (ev) => {
    if (ev.target === root) closeOverlay();
  });
});
document.querySelectorAll("[data-close]").forEach((btn) =>
  btn.addEventListener("click", closeOverlay)
);
el.closeDetail.addEventListener("click", closeOverlay);

// Swipe the grab handle down to dismiss a sheet (phones only).
document.querySelectorAll(".sheet-grab").forEach((grab) => {
  const sheet = grab.closest(".sheet");
  let startY = 0;
  let dy = 0;
  let dragging = false;

  grab.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse") return;
    dragging = true; startY = ev.clientY; dy = 0;
    sheet.style.transition = "none";
    grab.setPointerCapture(ev.pointerId);
  });
  grab.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    dy = Math.max(0, ev.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (dy > 90) {
      sheet.style.transition = "";
      sheet.style.transform = "";
      closeOverlay();
      return;
    }
    // Spring back instead of snapping.
    sheet.style.transition = "transform .24s cubic-bezier(.22,1,.36,1)";
    sheet.style.transform = "";
    setTimeout(() => { sheet.style.transition = ""; }, 260);
  };
  grab.addEventListener("pointerup", end);
  grab.addEventListener("pointercancel", end);
});

// ---------- Data ----------
async function loadEvents({ showError = true } = {}) {
  const { ok, data } = await fetchJSON("/api/events");
  if (!ok || !Array.isArray(data)) {
    if (showError && !events.length) {
      el.loadError.hidden = false;
      el.empty.hidden = true;
      el.grid.innerHTML = "";
    }
    return false;
  }
  el.loadError.hidden = true;
  events = data;
  render();
  prefetchDetails();
  return true;
}

// ---------- Render ----------
function splitEvents() {
  const upcoming = [];
  const past = [];
  for (const e of events) (isPast(e) ? past : upcoming).push(e);
  upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
  past.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { upcoming, past };
}

let heroEventId = null;
let heroDeadline = null;

function render() {
  const { upcoming, past } = splitEvents();

  document.querySelector('[data-count="upcoming"]').textContent = upcoming.length;
  document.querySelector('[data-count="past"]').textContent = past.length;

  renderHero(upcoming[0] || null);

  const shown = activeTab === "upcoming" ? upcoming : past;
  el.grid.replaceChildren();
  shown.forEach((e, i) => el.grid.appendChild(buildCard(e, i)));

  el.empty.hidden = shown.length > 0 || !el.loadError.hidden;
  el.emptyText.textContent =
    activeTab === "upcoming" ? "No upcoming events" : "Nothing in the past";
}

function buildCard(e, index) {
  const card = document.createElement("div");
  card.className = "card" + (isPast(e) ? " is-past" : "");
  card.style.animationDelay = `${Math.min(index * 0.04, 0.32)}s`;

  /* The whole card is one button — poster, title and date together — so the
     tap target is the full tile rather than a line of text. Dev actions sit
     alongside it (buttons can't legally nest). */
  const shot = document.createElement("button");
  shot.type = "button";
  shot.className = "card-shot";
  shot.setAttribute("aria-label", `${e.title || "Untitled"} — ${fmtDate(e.date)}`);

  const frame = document.createElement("span");
  frame.className = "card-frame";

  if (e.poster) {
    const { src, srcset } = posterSrc(e.poster);
    const img = document.createElement("img");
    img.className = "card-img";
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.sizes =
      "(max-width:519px) 46vw, (max-width:759px) 30vw, (max-width:999px) 23vw, (max-width:1239px) 18vw, 190px";
    if (srcset) img.srcset = srcset;
    img.src = src;
    img.addEventListener("load", () => img.classList.add("is-loaded"));
    img.addEventListener("error", () => img.replaceWith(fallbackTile(e.emoji)));
    frame.appendChild(img);
  } else {
    frame.appendChild(fallbackTile(e.emoji));
  }

  const badge = document.createElement("span");
  badge.className = "card-badge";
  badge.dataset.rel = e.date;
  badge.textContent = relative(e.date);
  frame.appendChild(badge);

  const meta = document.createElement("span");
  meta.className = "card-meta";
  const title = document.createElement("span");
  title.className = "card-title";
  title.textContent = e.title || "Untitled";
  const date = document.createElement("span");
  date.className = "card-date";
  date.textContent = fmtDate(e.date);
  meta.append(title, date);

  shot.append(frame, meta);
  shot.addEventListener("click", () => openDetail(e));
  card.appendChild(shot);

  if (isDev()) {
    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.appendChild(cardButton("edit", "\u270e", `Edit ${e.title}`, (ev) => {
      ev.stopPropagation();
      openEditSheet(e.id);
    }));
    actions.appendChild(cardButton("del", "\u2715", `Delete ${e.title}`, (ev) => {
      ev.stopPropagation();
      askDelete(e);
    }));
    card.appendChild(actions);
  }

  return card;
}

function cardButton(kind, glyph, label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `card-btn ${kind}`;
  b.textContent = glyph;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}

function fallbackTile(emoji) {
  const d = document.createElement("div");
  d.className = "card-fallback";
  d.textContent = emoji || "🎬";
  return d;
}

function renderHero(top) {
  heroEventId = top ? top.id : null;
  heroDeadline = top ? new Date(top.date).getTime() : null;

  if (!top) {
    el.hero.hidden = true;
    el.hero.replaceChildren();
    stopClock();
    return;
  }

  el.hero.hidden = false;
  el.hero.replaceChildren();

  const media = document.createElement("div");
  media.className = "hero-media";
  const art = heroArtFor(top);
  if (art) media.style.backgroundImage = `url("${encodeURI(art)}")`;

  const body = document.createElement("div");
  body.className = "hero-body";

  if (top.poster) {
    const poster = document.createElement("img");
    poster.className = "hero-poster";
    poster.alt = "";
    poster.decoding = "async";
    const { src, srcset } = posterSrc(top.poster);
    if (srcset) poster.srcset = srcset;
    poster.sizes = "(max-width:640px) 22vw, 108px";
    poster.src = src;
    poster.addEventListener("error", () => poster.remove());
    body.appendChild(poster);
  }

  const text = document.createElement("div");
  text.className = "hero-text";

  const badge = document.createElement("span");
  badge.className = "hero-badge";
  badge.textContent = "Next up";

  const h2 = document.createElement("h2");
  h2.className = "hero-title";
  h2.textContent = top.title || "Untitled";

  const when = document.createElement("p");
  when.className = "hero-date";
  when.textContent = fmtDate(top.date);

  const cd = document.createElement("div");
  cd.className = "hero-countdown";
  cd.append(...["days", "hrs", "min", "sec"].map(cdBox));

  text.append(badge, h2, when, cd);
  body.append(text);
  el.hero.append(media, body);

  // Rebuilt every render, so exactly one listener exists at any time.
  el.hero.onclick = () => openDetail(top);
  el.hero.setAttribute("role", "button");
  el.hero.setAttribute("tabindex", "0");
  el.hero.onkeydown = (ev) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDetail(top); }
  };

  startClock();
}

function cdBox(label) {
  const box = document.createElement("div");
  box.className = "cd-box";
  const num = document.createElement("span");
  num.className = "cd-num";
  num.dataset.unit = label;
  num.textContent = "0";
  const cap = document.createElement("span");
  cap.className = "cd-label";
  cap.textContent = label;
  box.append(num, cap);
  return box;
}

/* Prefer the movie's wide backdrop for the hero; fall back to the poster. */
function heroArtFor(e) {
  const id = e.tmdbId || resolveCache.get((e.title || "").trim());
  const m = id ? movieCache.get(id) : null;
  return (m && m.backdrop) || e.poster || "";
}

// ---------- Countdown ----------
let clockTimer = null;
let tickCount = 0;

function startClock() {
  stopClock();
  if (!heroDeadline) return;
  clockTick();
  if (!document.hidden) clockTimer = setInterval(clockTick, 1000);
}
function stopClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
}

function clockTick() {
  if (!heroDeadline) return;
  const diff = heroDeadline - Date.now();

  if (diff <= 0) {
    // The next event just started — move it to Past and promote the one after.
    stopClock();
    render();
    return;
  }

  const parts = {
    days: Math.floor(diff / 86400000),
    hrs: Math.floor((diff % 86400000) / 3600000),
    min: Math.floor((diff % 3600000) / 60000),
    sec: Math.floor((diff % 60000) / 1000)
  };
  el.hero.querySelectorAll(".cd-num").forEach((n) => {
    const v = String(parts[n.dataset.unit]);
    if (n.textContent !== v) n.textContent = v;
  });

  // Relative badges drift over a long session — refresh them every 30s.
  if (++tickCount % 30 === 0) {
    el.grid.querySelectorAll(".card-badge").forEach((b) => {
      const v = relative(b.dataset.rel);
      if (b.textContent !== v) b.textContent = v;
    });
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopClock();
  } else {
    startClock();
    loadEvents({ showError: false });
  }
});

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  tab.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    selectTab(activeTab === "upcoming" ? "past" : "upcoming", { focus: true });
  });
});

function selectTab(name, { focus = false } = {}) {
  if (name !== "upcoming" && name !== "past") return;
  activeTab = name;
  el.tabs.dataset.active = name;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
    if (on) el.grid.setAttribute("aria-labelledby", t.id);
  });
  render();
}

// ---------- Dev mode ----------
function updateDevUI() {
  const on = isDev();
  el.fab.hidden = !on;
  el.devBtn.setAttribute("aria-pressed", String(on));
  el.devBtnLabel.textContent = on ? "Dev on" : "Dev";
  el.detailDevActions.hidden = !on || el.detail.hidden;
}

function unlockDev(key) {
  devKey = key;
  try { sessionStorage.setItem("devKey", key); } catch { /* private mode */ }
  updateDevUI();
  render();
}

function lockDev(message) {
  devKey = null;
  try { sessionStorage.removeItem("devKey"); } catch { /* ignore */ }
  updateDevUI();
  render();
  if (message) toast(message, "error");
}

el.devBtn.addEventListener("click", () => {
  if (isDev()) {
    lockDev();
    toast("Dev mode off");
  } else {
    el.devError.hidden = true;
    el.devForm.reset();
    openOverlay("devSheet", el.devSheet, el.devSheet.querySelector(".sheet"), {
      focus: el.fPass
    });
  }
});

el.devForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const password = String(new FormData(el.devForm).get("password") || "");
  const submit = el.devForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  const { ok, status } = await fetchJSON("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  submit.disabled = false;

  if (ok) {
    closeOverlay();
    unlockDev(password);
    toast("Dev mode on");
  } else {
    el.devError.textContent = status === 0
      ? "Network error — try again"
      : "Incorrect password";
    el.devError.hidden = false;
  }
});

// ---------- Add / edit ----------
function openAddSheet() {
  editingId = null;
  selectedTmdbId = null;
  el.sheetTitle.textContent = "New event";
  el.submitBtn.textContent = "Add event";
  el.form.reset();
  el.formError.hidden = true;
  resetSearch();
  openOverlay("sheet", el.sheet, el.sheet.querySelector(".sheet"), {
    focus: el.movieSearch
  });
}

function openEditSheet(id) {
  const e = events.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  selectedTmdbId = e.tmdbId || null;
  el.sheetTitle.textContent = "Edit event";
  el.submitBtn.textContent = "Save changes";
  el.form.reset();
  el.fTitle.value = e.title || "";
  el.fEmoji.value = e.emoji || "";
  el.fCategory.value = e.category || "";
  el.fLocation.value = e.location || "";
  el.fPoster.value = e.poster || "";
  el.fDate.value = toInputDate(e.date);
  el.fNotes.value = e.notes || "";
  el.formError.hidden = true;
  resetSearch();
  openOverlay("sheet", el.sheet, el.sheet.querySelector(".sheet"), {
    focus: el.fTitle
  });
}

el.fab.addEventListener("click", () => {
  if (isDev()) openAddSheet();
});

el.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!isDev()) return;

  const data = Object.fromEntries(new FormData(el.form).entries());
  data.title = String(data.title || "").trim();
  data.date = String(data.date || "").trim();

  if (!data.title) return showFormError("Give the event a title.");
  if (!data.date) return showFormError("Pick a date and time.");
  if (isNaN(new Date(data.date))) return showFormError("That date isn’t valid.");
  data.tmdbId = selectedTmdbId || null;

  const editing = editingId !== null;
  el.submitBtn.disabled = true;
  const { ok, status } = await fetchJSON(
    editing ? `/api/events/${encodeURIComponent(editingId)}` : "/api/events",
    {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", "x-dev-key": devKey },
      body: JSON.stringify(data)
    }
  );
  el.submitBtn.disabled = false;

  if (status === 401) {
    closeOverlay();
    lockDev("Dev session expired — unlock again");
    return;
  }
  if (!ok) {
    return showFormError(
      status === 0 ? "Network error — try again." : "Couldn’t save the event."
    );
  }

  closeOverlay();
  await loadEvents();
  toast(editing ? "Event updated" : "Event added");
});

function showFormError(message) {
  el.formError.textContent = message;
  el.formError.hidden = false;
}

// ---------- Delete ----------
let pendingDelete = null;

function askDelete(event) {
  pendingDelete = event;
  el.confirmText.textContent = `“${event.title}” will be removed. This can’t be undone.`;
  openOverlay("confirm", el.confirm, el.confirm.querySelector(".sheet"), {
    focus: el.confirmCancel,
    onClose: () => { pendingDelete = null; }
  });
}

el.confirmCancel.addEventListener("click", closeOverlay);

el.confirmOk.addEventListener("click", async () => {
  const target = pendingDelete;   // read before closeOverlay clears it
  closeOverlay();
  if (!target || !isDev()) return;

  const { ok, status } = await fetchJSON(`/api/events/${encodeURIComponent(target.id)}`, {
    method: "DELETE",
    headers: { "x-dev-key": devKey }
  });

  if (status === 401) return lockDev("Dev session expired — unlock again");
  // 404 means it's already gone, which is the outcome we wanted anyway.
  if (!ok && status !== 404) {
    return toast(status === 0 ? "Network error — not deleted" : "Couldn’t delete", "error");
  }

  events = events.filter((e) => e.id !== target.id);
  render();
  toast("Event deleted");
});

// ---------- TMDB search ----------
let searchTimer = null;
let searchSeq = 0;

function resetSearch() {
  clearTimeout(searchTimer);
  searchSeq++;
  el.movieSearch.value = "";
  el.searchResults.hidden = true;
  el.searchResults.replaceChildren();
  el.searchStatus.textContent = "";
}

function searchMessage(text) {
  el.searchResults.hidden = false;
  el.searchResults.replaceChildren();
  const p = document.createElement("p");
  p.className = "result-msg";
  p.textContent = text;
  el.searchResults.appendChild(p);
  el.searchStatus.textContent = text;
}

async function doSearch(q, seq) {
  if (!isDev()) return;
  searchMessage("Searching…");
  const { ok, status, data } = await fetchJSON(
    `/api/search?q=${encodeURIComponent(q)}`,
    { headers: { "x-dev-key": devKey } }
  );
  if (seq !== searchSeq) return; // a newer query already went out

  if (status === 401) { closeOverlay(); return lockDev("Dev session expired"); }
  if (status === 503) return searchMessage("TMDB key isn’t set on the server");
  if (!ok) return searchMessage(status === 0 ? "Network error" : "Search failed");
  if (!Array.isArray(data) || !data.length) return searchMessage("No movies found");

  el.searchResults.hidden = false;
  el.searchResults.replaceChildren();
  data.forEach((m) => el.searchResults.appendChild(buildResult(m)));
  el.searchStatus.textContent = `${data.length} results`;
}

function buildResult(m) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "result";

  if (m.poster) {
    const img = document.createElement("img");
    img.className = "result-img";
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = tmdbSize(m.poster, "w92");
    img.addEventListener("error", () => img.replaceWith(noPoster()));
    btn.appendChild(img);
  } else {
    btn.appendChild(noPoster());
  }

  const info = document.createElement("div");
  info.className = "result-info";
  const t = document.createElement("div");
  t.className = "result-title";
  t.textContent = m.title || "Untitled";
  const y = document.createElement("div");
  y.className = "result-year";
  y.textContent = m.year || "—";
  info.append(t, y);
  btn.appendChild(info);

  btn.addEventListener("click", () => pickMovie(m));
  return btn;
}

function noPoster() {
  const d = document.createElement("div");
  d.className = "result-noimg";
  d.textContent = "🎬";
  return d;
}

function pickMovie(m) {
  el.fTitle.value = m.title || "";
  if (!el.fEmoji.value) el.fEmoji.value = "🎬";
  if (!el.fCategory.value) el.fCategory.value = "Cinema";
  if (m.poster) el.fPoster.value = m.poster;
  if (m.date && !el.fDate.value) el.fDate.value = `${m.date}T19:00`;
  selectedTmdbId = m.id || null;
  const title = m.title || "";
  resetSearch();
  el.movieSearch.value = title;
  el.formError.hidden = true;
  el.fDate.focus({ preventScroll: true });
}

el.movieSearch.addEventListener("input", () => {
  const q = el.movieSearch.value.trim();
  clearTimeout(searchTimer);
  searchSeq++;
  if (q.length < 2) {
    el.searchResults.hidden = true;
    el.searchResults.replaceChildren();
    return;
  }
  const seq = searchSeq;
  searchTimer = setTimeout(() => doSearch(q, seq), 350);
});

// Arrow keys walk the result list.
el.movieSearch.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") ev.preventDefault();
  if (ev.key !== "ArrowDown") return;
  const first = el.searchResults.querySelector(".result");
  if (first) { ev.preventDefault(); first.focus(); }
});
el.searchResults.addEventListener("keydown", (ev) => {
  if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
  const items = [...el.searchResults.querySelectorAll(".result")];
  const i = items.indexOf(document.activeElement);
  if (i === -1) return;
  ev.preventDefault();
  if (ev.key === "ArrowDown") {
    (items[i + 1] || items[0]).focus();
  } else if (i === 0) {
    el.movieSearch.focus();
  } else {
    items[i - 1].focus();
  }
});

// ---------- Detail ----------
let detailEvent = null;
let detailSeq = 0;

function openDetail(e) {
  detailEvent = e;
  const seq = ++detailSeq;

  el.detailTitle.textContent = e.title || "Untitled";
  el.detailTagline.hidden = true;
  el.detailTagline.textContent = "";
  el.detailMeta.replaceChildren();
  el.detailGenres.replaceChildren();
  el.detailOverview.textContent = e.notes || "";
  el.detailOverview.classList.remove("is-open");
  el.overviewToggle.hidden = true;
  el.overviewToggle.textContent = "Read more";
  el.overviewToggle.setAttribute("aria-expanded", "false");
  el.castSection.hidden = true;
  el.cast.replaceChildren();
  el.trailerBtn.hidden = true;
  el.trailerBtn.removeAttribute("href");
  el.detailLoading.hidden = true;

  if (e.poster) {
    el.detailPoster.src = tmdbSize(e.poster, "w342");
    el.detailPoster.hidden = false;
  } else {
    el.detailPoster.hidden = true;
    el.detailPoster.removeAttribute("src");
  }

  setBackdrop(e.poster || "");

  el.detailEvent.replaceChildren(
    line("detail-when", `📅 ${fmtDate(e.date)} · ${isPast(e) ? "Past" : relative(e.date)}`),
    ...(e.location ? [line("detail-loc", `📍 ${e.location}`)] : []),
    ...(e.category ? [line("detail-cat", `🏷️ ${e.category}`)] : [])
  );

  el.detailDevActions.hidden = !isDev();

  openOverlay("detail", el.detail, el.detail.querySelector(".detail-shell"), {
    focus: el.closeDetail,
    onClose: () => { detailEvent = null; }
  });
  el.detailPanel.scrollTop = 0;

  const cachedId = e.tmdbId || resolveCache.get((e.title || "").trim());
  if (cachedId && movieCache.has(cachedId)) {
    applyMovie(movieCache.get(cachedId));
    fitOverview();
  } else {
    el.detailLoading.hidden = false;
    hydrateDetail(e, seq);
  }
}

function line(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
}

function setBackdrop(url) {
  if (url) {
    el.detailBackdrop.src = url;
    el.detailBackdrop.hidden = false;
  } else {
    el.detailBackdrop.hidden = true;
    el.detailBackdrop.removeAttribute("src");
  }
}

async function hydrateDetail(e, seq) {
  const id = e.tmdbId || (await resolveTitle(e.title));
  if (seq !== detailSeq) return;
  const movie = id ? await fetchMovie(id) : null;
  if (seq !== detailSeq || el.detail.hidden) return;
  el.detailLoading.hidden = true;
  if (movie) { applyMovie(movie); fitOverview(); }
}

function applyMovie(m) {
  if (m.backdrop) setBackdrop(m.backdrop);
  if (m.tagline) {
    el.detailTagline.textContent = m.tagline;
    el.detailTagline.hidden = false;
  }
  if (m.overview) el.detailOverview.textContent = m.overview;

  const meta = [];
  if (m.releaseDate) {
    const y = new Date(m.releaseDate).getFullYear();
    if (!isNaN(y)) meta.push(String(y));
  }
  if (m.runtime) meta.push(`${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m`);
  if (m.rating) meta.push(`★ ${m.rating}`);
  if (m.director) meta.push(m.director);
  el.detailMeta.replaceChildren(...meta.map((x) => chip(x)));
  el.detailGenres.replaceChildren(...(m.genres || []).map((g) => chip(g)));

  if (m.trailer) {
    el.trailerBtn.href = m.trailer;
    el.trailerBtn.hidden = false;
  }

  if (Array.isArray(m.cast) && m.cast.length) {
    el.cast.replaceChildren(...m.cast.map(castMember));
    el.castSection.hidden = false;
  }
}

function chip(text) {
  const s = document.createElement("span");
  s.className = "chip";
  s.textContent = text;
  return s;
}

function castMember(c) {
  const wrap = document.createElement("div");
  wrap.className = "cast-member";
  if (c.photo) {
    const img = document.createElement("img");
    img.className = "cast-photo";
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = tmdbSize(c.photo, "w185");
    img.addEventListener("error", () => img.replaceWith(emptyFace()));
    wrap.appendChild(img);
  } else {
    wrap.appendChild(emptyFace());
  }
  const name = document.createElement("div");
  name.className = "cast-name";
  name.textContent = c.name || "";
  wrap.appendChild(name);
  if (c.character) {
    const role = document.createElement("div");
    role.className = "cast-role";
    role.textContent = c.character;
    wrap.appendChild(role);
  }
  return wrap;
}

function emptyFace() {
  const d = document.createElement("div");
  d.className = "cast-photo cast-photo-empty";
  d.textContent = "🎭";
  return d;
}

/* Only offer "Read more" when the text is genuinely clipped. */
function fitOverview() {
  requestAnimationFrame(() => {
    const o = el.detailOverview;
    const clipped = o.scrollHeight - o.clientHeight > 4;
    el.overviewToggle.hidden = !clipped;
  });
}

el.overviewToggle.addEventListener("click", () => {
  const open = el.detailOverview.classList.toggle("is-open");
  el.overviewToggle.textContent = open ? "Show less" : "Read more";
  el.overviewToggle.setAttribute("aria-expanded", String(open));
});

el.detailEdit.addEventListener("click", () => {
  const e = detailEvent;
  if (e) openEditSheet(e.id);
});
el.detailDelete.addEventListener("click", () => {
  const e = detailEvent;
  if (e) askDelete(e);
});

// ---------- TMDB fetches ----------
async function fetchMovie(id) {
  if (movieCache.has(id)) return movieCache.get(id);
  const { ok, data } = await fetchJSON(`/api/movie/${encodeURIComponent(id)}`);
  if (!ok || !data || data.error) return null;
  movieCache.set(id, data);
  return data;
}

async function resolveTitle(title) {
  const key = String(title || "").trim();
  if (!key) return null;
  if (resolveCache.has(key)) return resolveCache.get(key);
  const { ok, data } = await fetchJSON(`/api/resolve?title=${encodeURIComponent(key)}`);
  const id = ok && data && data.id ? data.id : null;
  resolveCache.set(key, id);
  return id;
}

/* Warm the cache in the background, a few at a time, so tapping a poster
   opens instantly. Never blocks the first paint. */
async function prefetchDetails() {
  const queue = events.slice();
  const worker = async () => {
    while (queue.length) {
      const e = queue.shift();
      const id = e.tmdbId || (await resolveTitle(e.title));
      if (!id) continue;
      const movie = await fetchMovie(id);
      // Upgrade the hero to a proper wide backdrop once we have one.
      if (movie && movie.backdrop && e.id === heroEventId) {
        const media = el.hero.querySelector(".hero-media");
        if (media) media.style.backgroundImage = `url("${encodeURI(movie.backdrop)}")`;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

// ---------- Keyboard-aware sheets ----------
/* iOS doesn't resize the layout viewport for the keyboard, so measure it and
   let CSS lift the sheet above it. */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const sync = () => {
    const overlap = window.innerHeight - vv.height - vv.offsetTop;
    // Anything smaller than this is a URL bar or scrollbar, not a keyboard.
    const kb = overlap > 80 ? Math.round(overlap) : 0;
    document.documentElement.style.setProperty("--kb", `${kb}px`);
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
}

// ---------- Boot ----------
el.retryBtn.addEventListener("click", async () => {
  el.retryBtn.disabled = true;
  await loadEvents();
  el.retryBtn.disabled = false;
});

function hideSplash() {
  el.splash.classList.add("is-hidden");
  document.body.classList.remove("is-booting");
  setTimeout(() => el.splash.remove(), 500);
}

(async function boot() {
  updateDevUI();
  selectTab("upcoming");
  const started = Date.now();
  await loadEvents();
  // Show the splash long enough not to flash, but never longer than needed.
  const wait = Math.max(0, 450 - (Date.now() - started));
  setTimeout(hideSplash, wait);
})();

// Whatever happens, never leave the user staring at the splash.
setTimeout(() => {
  if (document.body.classList.contains("is-booting")) hideSplash();
}, 6000);

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

let events = [];
let countdownTimer = null;
let editingId = null; // null = adding, otherwise editing this event id
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
  } else {
    hero.hidden = true;
    if (countdownTimer) clearInterval(countdownTimer);
  }

  empty.hidden = events.length > 0;

  events.forEach((e) => {
    const li = document.createElement("li");
    li.className = "card";
    const past = new Date(e.date) < new Date();
    li.style.opacity = past ? "0.5" : "1";
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
    list.appendChild(li);
  });

  if (isDev()) {
    document.querySelectorAll(".del-btn").forEach((btn) => {
      btn.addEventListener("click", () => removeEvent(btn.dataset.id));
    });
    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => openEditSheet(btn.dataset.id));
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

applyDevState();
load();

// Hide the splash screen after 2 seconds
setTimeout(() => {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 600);
  }
}, 2000);

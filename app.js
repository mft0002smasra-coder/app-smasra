/* ============================================================
   APP SMASRA — konfigurasi & logik kongsi (dipakai semua muka)
   ============================================================ */

const SCHOOL_LOGO_URL = "https://lh3.googleusercontent.com/d/1JFlMpX8nCN4ZKW9SRiNdtFT-UC8D3nlN";

// GANTI dengan URL Web App selepas awak deploy Code.gs (Deploy > New deployment > Web app)
const API_URL = "https://script.google.com/macros/s/AKfycbxNMX-PHWy4t8PdQhj-jekw9T8V7b1lN2M8sQ9d8jybfeSLvKS9jB8XuKbjjYRwshcz/exec";

// GANTI dengan OAuth Client ID dari Google Cloud Console untuk aktifkan "Sign in with Google"
const GOOGLE_CLIENT_ID = "702368440468-u7uoc6396frmum2j0mllbc3llqi4tgbn.apps.googleusercontent.com";

const USER_KEY = "smasra_user";

/* ---------------- Ikon SVG (garis nipis, seragam) ---------------- */

const ICONS = {
  home: '<path d="M4 11.5L12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>',
  profile: '<circle cx="12" cy="8" r="3.2"/><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
  announce: '<path d="M3 10v4a1 1 0 0 0 1 1h2l5 3V6L6 9H4a1 1 0 0 0-1 1z"/><path d="M15 8.3a4 4 0 0 1 0 7.4"/><path d="M18 5.7a7.5 7.5 0 0 1 0 12.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/><path d="M9 14.3l2 2 4-4.1"/>',
  folder: '<path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h3.6l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  chart: '<path d="M4.5 20V10.5"/><path d="M10 20V4"/><path d="M15.5 20v-7"/><path d="M21 20H3"/>',
  power: '<path d="M12 3.5v8"/><path d="M6.7 6.7a8 8 0 1 0 10.6 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};

function iconSvg(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function renderIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = iconSvg(el.getAttribute("data-icon"));
  });
}

/* ---------------- Session ---------------- */

function getSavedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveUser(user) { localStorage.setItem(USER_KEY, JSON.stringify(user)); }
function logout() { localStorage.removeItem(USER_KEY); location.href = "index.html"; }
function apiConfigured() { return API_URL && API_URL.indexOf("PASTE_") !== 0; }
function googleConfigured() { return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.indexOf("PASTE_") !== 0; }

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

/* ---------------- Login (kongsi oleh borang emel & Google) ---------------- */

async function loginWithEmail(email, btn, btnLabel) {
  if (!apiConfigured()) {
    showLoginError("Sistem belum disambungkan ke Apps Script (API_URL belum diisi).");
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = "Mengesahkan..."; }
  try {
    const res = await fetch(`${API_URL}?action=getUser&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.found) {
      saveUser({ email, nama: data.nama, jawatan: data.jawatan, gambar: data.gambar, role: data.role || "" });
      location.reload();
    } else {
      showLoginError("Emel tidak berdaftar dalam sistem. Hubungi admin sekolah.");
      if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
    }
  } catch (err) {
    showLoginError("Ralat sambungan ke server. Cuba lagi.");
    if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
  }
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  if (!email) { showLoginError("Sila masukkan emel awak."); return; }
  const btn = document.getElementById("login-btn");
  loginWithEmail(email, btn, "Log Masuk");
}

function decodeJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
    return JSON.parse(json);
  } catch (e) { return null; }
}

function handleGoogleCredential(response) {
  const payload = decodeJwt(response.credential);
  if (!payload || !payload.email) { showLoginError("Gagal baca akaun Google."); return; }
  loginWithEmail(payload.email, null, "");
}

function initGoogleSignIn() {
  if (!googleConfigured() || !window.google || !window.google.accounts) return;
  const container = document.getElementById("google-btn-container");
  if (!container) return;
  try {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
    google.accounts.id.renderButton(container, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", width: 260 });
  } catch (e) { /* domain belum dibenarkan / GSI belum sedia */ }
}

/* ---------------- Header hero / Drawer / Bottom nav / Jam ---------------- */

function toggleDrawer() {
  document.getElementById("drawer").classList.toggle("open");
  document.getElementById("drawer-overlay").classList.toggle("open");
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-overlay").classList.remove("open");
}

function updateClock() {
  const el = document.getElementById("live-clock");
  if (!el) return;
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const suffix = h < 12 ? "PG" : "PTG";
  h = h % 12; if (h === 0) h = 12;
  el.textContent = `${String(h).padStart(2, "0")}:${m}:${s} ${suffix}`;
}

function renderHeader(user) {
  document.querySelectorAll(".school-logo-img").forEach((img) => { img.src = SCHOOL_LOGO_URL; });
  document.querySelectorAll(".user-avatar-img").forEach((img) => { img.src = user.gambar || SCHOOL_LOGO_URL; });
  const greet = document.getElementById("header-greet");
  if (greet) greet.textContent = "Hai, " + (user.nama || user.email);
  updateClock();
  setInterval(updateClock, 1000);
}

/**
 * Dipanggil oleh setiap halaman untuk semak login & papar skrin yang betul.
 * onReady(user) dipanggil sekali user sah log masuk.
 */
function initApp(onReady) {
  renderIcons();
  document.querySelectorAll(".school-logo-img").forEach((img) => { img.src = SCHOOL_LOGO_URL; });

  const user = getSavedUser();
  const loginScreen = document.getElementById("login-screen");
  const appContent = document.getElementById("app-content");

  if (!user) {
    loginScreen.classList.remove("hidden");
    appContent.classList.add("hidden");
    const form = document.getElementById("login-form");
    if (form) form.addEventListener("submit", handleLogin);
    initGoogleSignIn();
    if (googleConfigured()) {
      const t = setInterval(() => {
        if (window.google && window.google.accounts) { initGoogleSignIn(); clearInterval(t); }
      }, 300);
      setTimeout(() => clearInterval(t), 5000);
    }
  } else {
    loginScreen.classList.add("hidden");
    appContent.classList.remove("hidden");
    renderHeader(user);
    if (typeof onReady === "function") onReady(user);
  }
}

/* ---------------- Pengumuman (dikongsi index.html & pengumuman.html) ---------------- */

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(str) { return String(str).replace(/"/g, "&quot;"); }

function renderAnnounceCard(item) {
  const img = item.gambar
    ? `<img class="announce-img" src="${escapeAttr(item.gambar)}" alt="Gambar pengumuman" loading="lazy">`
    : "";
  return `<div class="glass announce-card">${img}<div class="announce-body"><div class="announce-text">${escapeHtml(item.teks || "")}</div></div></div>`;
}

async function loadPengumumanList(targetId) {
  const listEl = document.getElementById(targetId);
  if (!listEl) return;
  if (!apiConfigured()) {
    listEl.innerHTML = '<div class="empty-state">API belum disambungkan (API_URL belum diisi dalam app.js).</div>';
    return;
  }
  try {
    const res = await fetch(`${API_URL}?action=getPengumuman`);
    const items = await res.json();
    if (!items || items.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Belum ada pengumuman lagi.</div>';
      return;
    }
    listEl.innerHTML = items.map(renderAnnounceCard).join("");
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state">Gagal muatkan pengumuman. Cuba lagi.</div>';
  }
}

/* ---------------- Banner carousel (index.html sahaja) ---------------- */

let bannerImages = [];
let bannerIndex = 0;
let bannerTimer = null;

async function loadBanner() {
  const track = document.getElementById("banner-track");
  const dots = document.getElementById("banner-dots");
  if (!track) return;
  if (!apiConfigured()) {
    track.innerHTML = '<div class="banner-empty">API belum disambungkan (API_URL belum diisi).</div>';
    return;
  }
  try {
    const res = await fetch(`${API_URL}?action=getBanner`);
    bannerImages = await res.json();
    if (!bannerImages || bannerImages.length === 0) {
      track.innerHTML = '<div class="banner-empty">Belum ada banner. Tambah link gambar di tab "Banner", lajur A.</div>';
      return;
    }
    track.innerHTML = bannerImages
      .map((url) => `<div class="banner-slide"><img src="${escapeAttr(url)}" alt="Banner sekolah" loading="lazy"></div>`)
      .join("");
    dots.innerHTML = bannerImages
      .map((_, i) => `<button class="banner-dot${i === 0 ? " active" : ""}" onclick="event.stopPropagation();goToBanner(${i})" aria-label="Slaid ${i + 1}"></button>`)
      .join("");
    bannerIndex = 0;
    if (bannerImages.length > 1) {
      bannerTimer = setInterval(() => goToBanner((bannerIndex + 1) % bannerImages.length), 5000);
    }
  } catch (err) {
    track.innerHTML = '<div class="banner-empty">Gagal muatkan banner.</div>';
  }
}

function goToBanner(i) {
  bannerIndex = i;
  const track = document.getElementById("banner-track");
  if (track) track.style.transform = `translateX(-${i * 100}%)`;
  document.querySelectorAll(".banner-dot").forEach((d, idx) => d.classList.toggle("active", idx === i));
}

function expandBanner() {
  if (!bannerImages.length) return;
  document.getElementById("lightbox-img").src = bannerImages[bannerIndex];
  document.getElementById("lightbox-overlay").classList.remove("hidden");
}
function closeLightbox() { document.getElementById("lightbox-overlay").classList.add("hidden"); }

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

/* ============================================================
   APP SMASRA — konfigurasi & logik kongsi (dipakai semua muka)
   ============================================================ */

// Logo sekolah (Google Drive) — dipakai untuk hologram logo & ikon PWA
const SCHOOL_LOGO_URL = "https://lh3.googleusercontent.com/d/1JFlMpX8nCN4ZKW9SRiNdtFT-UC8D3nlN";

// GANTI dengan URL Web App selepas awak deploy Code.gs (Deploy > New deployment > Web app)
const API_URL = "PASTE_URL_APPS_SCRIPT_ANDA_DI_SINI";

// GANTI dengan OAuth Client ID dari Google Cloud Console untuk aktifkan "Sign in with Google"
// (Client ID jenis "Web application", tambah domain GitHub Pages awak dalam Authorized JavaScript origins)
const GOOGLE_CLIENT_ID = "PASTE_GOOGLE_CLIENT_ID_ANDA_DI_SINI.apps.googleusercontent.com";

const USER_KEY = "smasra_user";

function getSavedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function logout() {
  localStorage.removeItem(USER_KEY);
  location.href = "index.html";
}

function apiConfigured() {
  return API_URL && API_URL.indexOf("PASTE_") !== 0;
}

function googleConfigured() {
  return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.indexOf("PASTE_") !== 0;
}

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
      saveUser({
        email: email,
        nama: data.nama,
        jawatan: data.jawatan,
        gambar: data.gambar,
        role: data.role || "",
      });
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
  } catch (e) {
    return null;
  }
}

function handleGoogleCredential(response) {
  const payload = decodeJwt(response.credential);
  if (!payload || !payload.email) {
    showLoginError("Gagal baca akaun Google.");
    return;
  }
  loginWithEmail(payload.email, null, "");
}

function initGoogleSignIn() {
  if (!googleConfigured() || !window.google || !window.google.accounts) return;
  const container = document.getElementById("google-btn-container");
  if (!container) return;
  try {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    });
    google.accounts.id.renderButton(container, {
      theme: "filled_black",
      size: "large",
      shape: "pill",
      text: "signin_with",
      width: 260,
    });
  } catch (e) {
    /* Google Identity Services belum sedia / domain tak dibenarkan */
  }
}

/* ---------------- Header / Drawer / Bottom nav (dikongsi semua muka) ---------------- */

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
  h = h % 12;
  if (h === 0) h = 12;
  el.textContent = `${String(h).padStart(2, "0")}:${m}:${s} ${suffix}`;
}

function renderHeader(user) {
  document.querySelectorAll(".school-logo-img").forEach((img) => { img.src = SCHOOL_LOGO_URL; });
  const avatar = document.getElementById("header-avatar");
  if (avatar) avatar.src = user.gambar || SCHOOL_LOGO_URL;
  const greet = document.getElementById("header-greet");
  if (greet) greet.textContent = "Hai, " + (user.nama ? user.nama.split(" ")[0] : user.email);
  updateClock();
  setInterval(updateClock, 1000);
}

/**
 * Dipanggil oleh setiap halaman untuk semak login & papar skrin yang betul.
 * onReady(user) dipanggil sekali user sah log masuk.
 */
function initApp(onReady) {
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

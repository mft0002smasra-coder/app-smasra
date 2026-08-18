/* ============================================================
   APP SMASRA — konfigurasi & logik kongsi (dipakai semua muka)
   ============================================================ */

// Logo sekolah (Google Drive) — dipakai untuk hologram logo & ikon PWA
const SCHOOL_LOGO_URL = "https://lh3.googleusercontent.com/d/1JFlMpX8nCN4ZKW9SRiNdtFT-UC8D3nlN";

// GANTI dengan URL Web App selepas awak deploy Code.gs (Deploy > New deployment > Web app)
// Contoh: "https://script.google.com/macros/s/AKfycb.../exec"
const API_URL = "https://script.google.com/macros/s/AKfycbxNMX-PHWy4t8PdQhj-jekw9T8V7b1lN2M8sQ9d8jybfeSLvKS9jB8XuKbjjYRwshcz/exec";

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

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

async function handleLogin(e) {
  e.preventDefault();
  const emailInput = document.getElementById("login-email");
  const email = emailInput.value.trim();
  if (!email) {
    showLoginError("Sila masukkan emel awak.");
    return;
  }
  if (!apiConfigured()) {
    showLoginError("Sistem belum disambungkan ke Apps Script (API_URL belum diisi).");
    return;
  }
  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  btn.textContent = "Mengesahkan...";
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
      btn.disabled = false;
      btn.textContent = "Log Masuk";
    }
  } catch (err) {
    showLoginError("Ralat sambungan ke server. Cuba lagi.");
    btn.disabled = false;
    btn.textContent = "Log Masuk";
  }
}

/**
 * Dipanggil oleh setiap halaman untuk semak login & papar skrin yang betul.
 * onReady(user) dipanggil sekali user sah log masuk.
 */
function initApp(onReady) {
  document.querySelectorAll(".school-logo-img").forEach((img) => {
    img.src = SCHOOL_LOGO_URL;
  });

  const user = getSavedUser();
  const loginScreen = document.getElementById("login-screen");
  const appContent = document.getElementById("app-content");

  if (!user) {
    loginScreen.classList.remove("hidden");
    appContent.classList.add("hidden");
    const form = document.getElementById("login-form");
    if (form) form.addEventListener("submit", handleLogin);
  } else {
    loginScreen.classList.add("hidden");
    appContent.classList.remove("hidden");
    if (typeof onReady === "function") onReady(user);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

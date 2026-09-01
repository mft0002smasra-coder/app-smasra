/* ============================================================
   eRKS — Borang Kehadiran / Keberadaan + Buku Kehadiran Staf
   Semua pengecam global dinamakan awalan "db" (Database) supaya tak
   berlanggar dengan skrip rks-analysis (ma-/rks- sudah dipakai di muka sama).
   ============================================================ */

const DB_API_URL = "PASTE_URL_APPS_SCRIPT_DATABASE_ANDA_DI_SINI";
function dbApiConfigured() { return DB_API_URL && DB_API_URL.indexOf("PASTE_") !== 0; }

const DB_SHEET_ID_READ = "1gCC26pdp5dqMwEYg6gzuGaiXhq6iA1M3gruLkkIzO5s";
const DB_KEBERADAAN_TUJUAN = [
  "Cuti Rehat", "Cuti Rehat Khas", "Cuti Sakit", "Cuti Tanpa Rekod",
  "Urusan Rasmi", "Temu Janji Klinik/Hospital", "Kebenaran Meninggalkan Pejabat", "Lain-lain",
];

let dbStaff = null; // {noKP, nama, jawatan} — staf yang sedang log masuk
let dbLeafletReady = false;
let _dbLeafletPromise = null;
let dbKehadiranMap = null, dbKehadiranMarker = null;
let dbKeberadaanMap = null, dbKeberadaanMarker = null;
let dbCurrentLatLng = { lat: null, lng: null };

function dbEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/* ---------------- Muat Leaflet (peta) secara dinamik ---------------- */
function dbLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("gagal " + src));
    document.head.appendChild(s);
  });
}
function dbLoadCss(href) {
  return new Promise((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href; l.onload = resolve; l.onerror = resolve;
    document.head.appendChild(l);
  });
}
async function dbEnsureLeaflet() {
  if (dbLeafletReady || typeof L !== "undefined") { dbLeafletReady = true; return; }
  if (_dbLeafletPromise) return _dbLeafletPromise;
  _dbLeafletPromise = (async () => {
    await dbLoadCss("https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css");
    const cdns = [
      "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    ];
    for (const url of cdns) {
      try { await dbLoadScript(url); if (typeof L !== "undefined") { dbLeafletReady = true; return; } } catch (e) {}
    }
  })();
  return _dbLeafletPromise;
}

/* ---------------- Kesan lokasi semasa (snapshot, bukan live) ---------------- */
function dbGetLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

/* ---------------- Muat maklumat staf (auto-detect emel log masuk) ---------------- */
async function dbLoadStaff(user) {
  if (dbStaff) return dbStaff;
  if (!dbApiConfigured()) return null;
  try {
    const res = await fetch(`${DB_API_URL}?action=getStaffByEmail&email=${encodeURIComponent(user.email)}`);
    const data = await res.json();
    if (data.found) {
      dbStaff = { noKP: data.noKP, nama: data.nama, jawatan: data.jawatan };
    }
  } catch (e) { /* biar null, borang akan papar amaran */ }
  return dbStaff;
}

function dbFillReadonlyFields(prefix) {
  document.getElementById(`${prefix}-nama`).value = dbStaff ? dbStaff.nama : "(gagal muat — cuba lagi)";
  document.getElementById(`${prefix}-nokp`).value = dbStaff ? dbStaff.noKP : "-";
  document.getElementById(`${prefix}-jawatan`).value = dbStaff ? dbStaff.jawatan : "-";
}

function dbNowLabel() {
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  return `${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()}, ${p2(now.getHours())}:${p2(now.getMinutes())}`;
}

/* ================= Kad pilihan (eRKS landing) ================= */
async function dbOpenKehadiranForm() {
  document.getElementById("db-kehadiran-overlay").classList.remove("hidden");
  document.getElementById("db-kehadiran-masa").textContent = dbNowLabel();
  document.getElementById("db-kehadiran-latlong").textContent = "Mengesan lokasi...";
  document.getElementById("db-kehadiran-error").classList.add("hidden");
  dbFillReadonlyFields("db-kehadiran");

  const loc = await dbGetLocation();
  if (loc) {
    dbCurrentLatLng = loc;
    document.getElementById("db-kehadiran-latlong").textContent = `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
    await dbEnsureLeaflet();
    dbRenderKehadiranMap(loc);
  } else {
    dbCurrentLatLng = { lat: null, lng: null };
    document.getElementById("db-kehadiran-latlong").textContent = "Lokasi tidak dibenarkan/tiada — akan hantar tanpa lokasi.";
  }
}
function dbCloseKehadiranForm() {
  document.getElementById("db-kehadiran-overlay").classList.add("hidden");
}

function dbRenderKehadiranMap(loc) {
  if (typeof L === "undefined") return;
  const mapEl = document.getElementById("db-kehadiran-map");
  mapEl.classList.remove("hidden");
  if (dbKehadiranMap) { dbKehadiranMap.remove(); dbKehadiranMap = null; }
  dbKehadiranMap = L.map(mapEl, { zoomControl: false, attributionControl: false }).setView([loc.lat, loc.lng], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(dbKehadiranMap);
  dbKehadiranMarker = L.marker([loc.lat, loc.lng]).addTo(dbKehadiranMap);
}

function dbSetTujuanKehadiran(val, btnEl) {
  document.querySelectorAll("#db-kehadiran-overlay .db-tujuan-btn").forEach((b) => b.classList.remove("active"));
  btnEl.classList.add("active");
  document.getElementById("db-kehadiran-tujuan-value").value = val;
}

async function dbSubmitKehadiran() {
  const tujuan = document.getElementById("db-kehadiran-tujuan-value").value;
  const errEl = document.getElementById("db-kehadiran-error");
  errEl.classList.add("hidden");
  if (!dbStaff) { errEl.textContent = "Maklumat staf gagal dimuat. Cuba tutup dan buka semula."; errEl.classList.remove("hidden"); return; }
  if (!tujuan) { errEl.textContent = "Sila pilih Masa Masuk atau Masa Keluar."; errEl.classList.remove("hidden"); return; }
  if (!dbApiConfigured()) { errEl.textContent = "API Database belum disambungkan (DB_API_URL belum diisi)."; errEl.classList.remove("hidden"); return; }

  const btn = document.getElementById("db-kehadiran-submit-btn");
  btn.disabled = true; btn.textContent = "Menghantar...";
  const latLongStr = dbCurrentLatLng.lat !== null ? `${dbCurrentLatLng.lat.toFixed(6)}, ${dbCurrentLatLng.lng.toFixed(6)}` : "0.000000, 0.000000";
  try {
    const res = await fetch(DB_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "addKehadiran", noKP: dbStaff.noKP, nama: dbStaff.nama, jawatan: dbStaff.jawatan, tujuan, latLong: latLongStr }),
    });
    const data = await res.json();
    if (data.success) {
      dbCloseKehadiranForm();
      alert("Kehadiran berjaya direkodkan!");
    } else {
      errEl.textContent = data.message || "Gagal hantar rekod.";
      errEl.classList.remove("hidden");
    }
  } catch (e) {
    errEl.textContent = "Ralat sambungan ke server.";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false; btn.textContent = "Hantar Rekod";
}

/* ================= Keberadaan ================= */
async function dbOpenKeberadaanForm() {
  document.getElementById("db-keberadaan-overlay").classList.remove("hidden");
  document.getElementById("db-keberadaan-error").classList.add("hidden");
  dbFillReadonlyFields("db-keberadaan");

  const tujuanSel = document.getElementById("db-keberadaan-tujuan");
  if (!tujuanSel.dataset.built) {
    tujuanSel.innerHTML = `<option value="">Pilih tujuan</option>` + DB_KEBERADAAN_TUJUAN.map((t) => `<option value="${t}">${t}</option>`).join("");
    tujuanSel.dataset.built = "1";
  }
  document.getElementById("db-keberadaan-perkara").value = "";
  document.getElementById("db-keberadaan-tempat").value = "";
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("db-keberadaan-mula").value = today;
  document.getElementById("db-keberadaan-tamat").value = today;
  document.getElementById("db-keberadaan-masa-mula").value = "";
  document.getElementById("db-keberadaan-masa-tamat").value = "";

  document.getElementById("db-keberadaan-latlong").textContent = "Mengesan lokasi...";
  const loc = await dbGetLocation();
  await dbEnsureLeaflet();
  const startLoc = loc || { lat: 2.4366, lng: 102.2399 }; // fallback: sekitar sekolah
  dbCurrentLatLng = startLoc;
  document.getElementById("db-keberadaan-latlong").textContent = `${startLoc.lat.toFixed(6)}, ${startLoc.lng.toFixed(6)}`;
  dbRenderKeberadaanMap(startLoc);
}
function dbCloseKeberadaanForm() {
  document.getElementById("db-keberadaan-overlay").classList.add("hidden");
}

function dbRenderKeberadaanMap(loc) {
  if (typeof L === "undefined") return;
  const mapEl = document.getElementById("db-keberadaan-map");
  if (dbKeberadaanMap) { dbKeberadaanMap.remove(); dbKeberadaanMap = null; }
  dbKeberadaanMap = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([loc.lat, loc.lng], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(dbKeberadaanMap);
  dbKeberadaanMarker = L.marker([loc.lat, loc.lng], { draggable: true }).addTo(dbKeberadaanMap);
  dbKeberadaanMarker.on("dragend", () => {
    const p = dbKeberadaanMarker.getLatLng();
    dbCurrentLatLng = { lat: p.lat, lng: p.lng };
    document.getElementById("db-keberadaan-latlong").textContent = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
  });
  dbKeberadaanMap.on("click", (e) => {
    dbKeberadaanMarker.setLatLng(e.latlng);
    dbCurrentLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    document.getElementById("db-keberadaan-latlong").textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
  });
}

async function dbSubmitKeberadaan() {
  const errEl = document.getElementById("db-keberadaan-error");
  errEl.classList.add("hidden");
  const tujuan = document.getElementById("db-keberadaan-tujuan").value;
  const perkara = document.getElementById("db-keberadaan-perkara").value.trim();
  const tempat = document.getElementById("db-keberadaan-tempat").value.trim();
  const mula = document.getElementById("db-keberadaan-mula").value;
  const tamat = document.getElementById("db-keberadaan-tamat").value;
  const masaMula = document.getElementById("db-keberadaan-masa-mula").value;
  const masaTamat = document.getElementById("db-keberadaan-masa-tamat").value;

  if (!dbStaff) { errEl.textContent = "Maklumat staf gagal dimuat. Cuba tutup dan buka semula."; errEl.classList.remove("hidden"); return; }
  if (!tujuan || !mula || !tamat) { errEl.textContent = "Sila lengkapkan tujuan, tarikh mula, dan tarikh tamat."; errEl.classList.remove("hidden"); return; }
  if (tamat < mula) { errEl.textContent = "Tarikh tamat mesti sama atau selepas tarikh mula."; errEl.classList.remove("hidden"); return; }
  if (!dbApiConfigured()) { errEl.textContent = "API Database belum disambungkan (DB_API_URL belum diisi)."; errEl.classList.remove("hidden"); return; }

  const btn = document.getElementById("db-keberadaan-submit-btn");
  btn.disabled = true; btn.textContent = "Menghantar...";
  const latLongStr = dbCurrentLatLng.lat !== null ? `${dbCurrentLatLng.lat.toFixed(6)}, ${dbCurrentLatLng.lng.toFixed(6)}` : "0.000000, 0.000000";
  try {
    const res = await fetch(DB_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "addKeberadaan", noKP: dbStaff.noKP, nama: dbStaff.nama, jawatan: dbStaff.jawatan,
        tujuan, perkara, tempat, latLong: latLongStr, mula, tamat, masaMula, masaTamat,
      }),
    });
    const data = await res.json();
    if (data.success) {
      dbCloseKeberadaanForm();
      alert("Keberadaan berjaya direkodkan!");
    } else {
      errEl.textContent = data.message || "Gagal hantar rekod.";
      errEl.classList.remove("hidden");
    }
  } catch (e) {
    errEl.textContent = "Ralat sambungan ke server.";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false; btn.textContent = "Hantar Rekod";
}

/* ================= Buku Kehadiran Staf (flip book) ================= */
const DB_BULAN = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];
let dbBookRecords = [];
let dbBookFlipping = false;

async function dbFetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${DB_SHEET_ID_READ}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&_ts=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(jsonStr).table.rows;
}
function dbParseGDate(cellValue) {
  if (!cellValue) return null;
  if (typeof cellValue === "string" && cellValue.indexOf("Date(") === 0) {
    const m = cellValue.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?/);
    if (m) return new Date(+m[1], +m[2], +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  }
  return null;
}
function dbYmd(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

async function dbLoadBookRecords() {
  const rows = await dbFetchSheet("Kehadiran");
  dbBookRecords = rows.map((r) => {
    const c = r.c || [];
    const ts = dbParseGDate(c[1] && c[1].v);
    return {
      tarikhKey: ts ? dbYmd(ts) : null,
      masa: ts ? `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}` : "-",
      noKP: (c[2] && c[2].v) || "",
      nama: (c[3] && c[3].v) || "",
      jawatan: (c[4] && c[4].v) || "",
      tujuan: (c[5] && c[5].v) || "",
    };
  }).filter((r) => r.tarikhKey && r.nama);
}

function dbInitBookFilters() {
  const today = new Date();
  const years = Array.from(new Set(dbBookRecords.map((r) => r.tarikhKey.slice(0,4))));
  const yearSet = new Set(years); yearSet.add(String(today.getFullYear()));
  const yearArr = Array.from(yearSet).sort((a,b)=>b-a);

  const yearSel = document.getElementById("db-book-year");
  yearSel.innerHTML = yearArr.map((y) => `<option value="${y}">${y}</option>`).join("");
  yearSel.value = String(today.getFullYear());

  const monthSel = document.getElementById("db-book-month");
  monthSel.innerHTML = DB_BULAN.map((b,i) => `<option value="${i+1}">${b}</option>`).join("");
  monthSel.value = String(today.getMonth()+1);

  document.getElementById("db-book-date").value = dbYmd(today);

  yearSel.addEventListener("change", dbSyncBookMonthToDate);
  monthSel.addEventListener("change", dbSyncBookMonthToDate);
  document.getElementById("db-book-date").addEventListener("change", dbRenderBook);
}
function dbSyncBookMonthToDate() {
  const y = document.getElementById("db-book-year").value;
  const m = document.getElementById("db-book-month").value;
  const dateInput = document.getElementById("db-book-date");
  const currentDay = dateInput.value ? dateInput.value.slice(8,10) : "01";
  dateInput.value = `${y}-${String(m).padStart(2,"0")}-${currentDay}`;
  dbRenderBook();
}

function dbRenderBook() {
  const dateStr = document.getElementById("db-book-date").value;
  if (!dateStr) return;
  const [y,m,d] = dateStr.split("-");
  document.getElementById("db-book-year").value = y;
  document.getElementById("db-book-month").value = String(parseInt(m,10));

  const dayRecords = dbBookRecords.filter((r) => r.tarikhKey === dateStr).sort((a,b)=>a.masa.localeCompare(b.masa));
  const dateLabel = `${d} ${DB_BULAN[parseInt(m,10)-1]} ${y}`;

  const half = Math.ceil(dayRecords.length / 2);
  const leftItems = dayRecords.slice(0, half);
  const rightItems = dayRecords.slice(half);

  document.getElementById("db-book-date-label-left").textContent = dateLabel;
  document.getElementById("db-book-date-label-right").textContent = dateLabel;
  document.getElementById("db-book-left").innerHTML = dbBuildBookPage(leftItems, 1);
  document.getElementById("db-book-right").innerHTML = dbBuildBookPage(rightItems, half + 1);
  document.getElementById("db-book-count").textContent = `${dayRecords.length} rekod`;
}

function dbBuildBookPage(items, startNo) {
  if (!items.length) return `<div class="db-book-empty">Tiada rekod</div>`;
  return items.map((r, i) => `
    <div class="db-book-row">
      <span class="db-book-no">${startNo + i}</span>
      <div class="db-book-info">
        <div class="db-book-nama">${dbEscape(r.nama)}</div>
        <div class="db-book-meta">${dbEscape(r.jawatan)} &middot; ${r.masa}</div>
      </div>
      <span class="db-book-tujuan ${r.tujuan.includes("KELUAR") ? "out" : "in"}">${dbEscape(r.tujuan)}</span>
    </div>`).join("");
}

function dbChangeBookDay(delta) {
  if (dbBookFlipping) return;
  const dateInput = document.getElementById("db-book-date");
  const d = new Date(dateInput.value + "T00:00:00");
  d.setDate(d.getDate() + delta);
  dateInput.value = dbYmd(d);

  const book = document.getElementById("db-book");
  dbBookFlipping = true;
  book.classList.add(delta > 0 ? "flip-next" : "flip-prev");
  setTimeout(() => {
    dbRenderBook();
    book.classList.remove("flip-next", "flip-prev");
    dbBookFlipping = false;
  }, 260);
}

let dbBookLoaded = false;
async function dbBootBook() {
  if (dbBookLoaded) { dbRenderBook(); return; }
  dbBookLoaded = true;
  document.getElementById("db-book-loading").classList.remove("hidden");
  await dbLoadBookRecords();
  dbInitBookFilters();
  dbRenderBook();
  document.getElementById("db-book-loading").classList.add("hidden");
}

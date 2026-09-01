/* ============================================================
   eRKS — Borang Kehadiran / Keberadaan + Buku Kehadiran Staf
   Semua pengecam global dinamakan awalan "db" (Database) supaya tak
   berlanggar dengan skrip rks-analysis (ma-/rks- sudah dipakai di muka sama).
   ============================================================ */

const DB_API_URL = "https://script.google.com/macros/s/AKfycbzpMRGdwOUp9h6WagE04JMsZHajgIqd08BSL-9_oQdLOKk1FLC9PpsWyzCU1Irqbv9o/exec";
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

/* ================= Buku Kehadiran Staf (senarai penuh, 30/muka) ================= */
const DB_BULAN = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];
const DB_ROWS_PER_PAGE = 30;
let dbBookKehadiranRows = [];  // raw rows tab Kehadiran (untuk bina peta ikut tahun/bulan dipilih)
let dbBookRekodRows = [];      // raw rows tab Rekod
let dbBookKehadiranMap = new Map();
let dbBookRekodMap = new Map();
let dbStaffRoster = [];   // semua staf dari tab Database
let dbBookPages = [];     // senarai "muka" hasil pagination (ikut tarikh + chunk 30)
let dbBookPageIdx = 0;
let dbBookFlipping = false;
let dbTouchStartX = null;

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

const DB_MONTH_ABBR = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
function dbParseDDMMMYY(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})/);
  if (!m) return null;
  const mon = DB_MONTH_ABBR[m[2].charAt(0).toUpperCase() + m[2].slice(1,3).toLowerCase()];
  if (mon === undefined) return null;
  return new Date(2000 + parseInt(m[3], 10), mon, parseInt(m[1], 10));
}

/**
 * Parser tarikh fleksibel — sel gviz boleh datang dalam pelbagai bentuk
 * (objek Date terbalut "Date(y,m,d,...)", teks "dd/mm/yyyy", atau teks
 * "dd-MMM-yy"). Cuba semua bentuk supaya tak bergantung andaian tunggal.
 */
function dbParseFlexibleDate(cell) {
  if (!cell) return null;
  let d = dbParseGDate(cell.v);
  if (d) return d;
  const str = String(cell.f || cell.v || "").trim();
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  d = dbParseDDMMMYY(str);
  if (d) return d;
  return null;
}

/* ================= Bantuan kongsi: cross-reference Kehadiran + Rekod ================= */
const DB_AWAL_730 = [
  "PENGETUA", "PK PENTADBIRAN", "PK HAL EHWAL MURID", "PK KOKURIKULUM", "PK TINGKATAN 6",
  "GKMP SAINS & MATEMATIK", "GKMP T&V", "GKMP KEMANUSIAAN", "GKMP BAHASA", "GKMP PAIBA",
  "PPP", "GURU", "PEMBANTU MAKMAL",
];

function dbMasaMasukClean(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = s.match(/Date\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d+)\s*,\s*(\d+)\s*/);
  if (m) return `${m[1]}:${m[2]}`;
  return s;
}
function dbFormatAmPm(timeStr) {
  if (!timeStr || timeStr === "-") return "-";
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  const mins = parts[1].padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; h = h || 12;
  return `${h}:${mins} ${ampm}`;
}

/**
 * Bina peta Kehadiran (kunci "noKP|yyyy-mm-dd" -> "H:M") dan Rekod/Keberadaan
 * (kunci "nama|yyyy-mm-dd" -> {tujuan,perkara,masaMula}) untuk SATU
 * tahun+bulan sahaja (cekap, elak proses data bulan lain).
 */
function dbBuildKehadiranRekodMaps(kehadiranRows, rekodRows, tahun, bulan) {
  const kehadiranMap = new Map();
  kehadiranRows.forEach((r) => {
    const c = r.c || [];
    const ts = dbParseGDate(c[1] && c[1].v) || dbParseGDate(c[0] && c[0].v);
    if (!ts || ts.getFullYear() !== tahun || ts.getMonth() + 1 !== bulan) return;
    const noKP = String((c[2] && c[2].v) || "").trim();
    if (!noKP) return;
    const hm = `${ts.getHours()}:${String(ts.getMinutes()).padStart(2, "0")}`;
    kehadiranMap.set(`${noKP}|${dbYmd(ts)}`, hm);
  });

  const rekodMap = new Map();
  rekodRows.forEach((r) => {
    const c = r.c || [];
    const nama = String((c[4] && c[4].v) || "").trim();
    if (!nama) return;
    const mula = dbParseFlexibleDate(c[10]);
    const tamat = dbParseFlexibleDate(c[11]) || mula;
    if (!mula) return;
    const mulaD = new Date(mula); mulaD.setHours(0, 0, 0, 0);
    const tamatD = new Date(tamat); tamatD.setHours(23, 59, 59, 999);
    const info = {
      tujuan: (c[6] && c[6].v) || "",
      perkara: (c[7] && c[7].v) || "",
      masaMula: dbMasaMasukClean((c[12] && (c[12].f || c[12].v)) || ""),
      masaTamat: dbMasaMasukClean((c[13] && (c[13].f || c[13].v)) || ""),
    };
    let cur = new Date(mulaD);
    while (cur <= tamatD) {
      if (cur.getFullYear() === tahun && cur.getMonth() + 1 === bulan) {
        rekodMap.set(`${nama}|${dbYmd(cur)}`, info);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  return { kehadiranMap, rekodMap };
}

/**
 * Cross-reference SATU staf pada SATU tarikh. Keutamaan: Kehadiran (LEWAT/
 * TEPAT MASA ikut jawatan) sebagai catatan utama; kalau Rekod Keberadaan
 * WUJUD SEKALI pada hari sama, tambah perkara + masa mula/tamat sekali.
 * Kalau cuma Rekod Keberadaan sahaja (tiada Kehadiran) -> badge tersendiri.
 */
function dbCrossRefDay(noKP, nama, jawatan, dateKey, kehadiranMap, rekodMap) {
  const masaMasuk = kehadiranMap.get(`${noKP}|${dateKey}`);
  const rekodInfo = rekodMap.get(`${String(nama).trim()}|${dateKey}`);
  const jUpper = String(jawatan || "").toUpperCase().trim();
  const isAwal = DB_AWAL_730.some((k) => jUpper.includes(k));
  const hadMinit = isAwal ? 450 : 480;

  let masaDisplay = "-", catatanHtml = "";

  if (masaMasuk) {
    masaDisplay = dbFormatAmPm(masaMasuk);
    const parts = masaMasuk.split(":").map(Number);
    const totalMinit = parts[0] * 60 + parts[1];
    catatanHtml = totalMinit > hadMinit
      ? `<span class="db-badge db-badge-lewat">LEWAT</span>`
      : `<span class="db-badge db-badge-tepat">TEPAT MASA</span>`;
    if (rekodInfo) {
      catatanHtml += ` <span class="db-badge db-badge-rekod">${dbEscape(rekodInfo.tujuan)}</span>`;
      if (rekodInfo.perkara) catatanHtml += ` ${dbEscape(rekodInfo.perkara)}`;
      if (rekodInfo.masaMula || rekodInfo.masaTamat) {
        const mm = rekodInfo.masaMula ? dbFormatAmPm(rekodInfo.masaMula) : "-";
        const mt = rekodInfo.masaTamat ? dbFormatAmPm(rekodInfo.masaTamat) : "-";
        catatanHtml += ` <span class="db-my-masa-range">(${mm} &ndash; ${mt})</span>`;
      }
    }
  } else if (rekodInfo) {
    catatanHtml = `<span class="db-badge db-badge-rekod">REKOD KEBERADAAN</span> <b>[${dbEscape(rekodInfo.tujuan)}]</b> ${dbEscape(rekodInfo.perkara)}`;
    if (rekodInfo.masaMula) masaDisplay = dbFormatAmPm(rekodInfo.masaMula);
  } else {
    catatanHtml = `<span class="db-badge db-badge-belum">TIDAK / BELUM MENGISI eRKS</span>`;
  }
  return { masaDisplay, catatanHtml };
}

/* ================= Kad "Analisis Kehadiran Saya" (Home) ================= */
let dbHomeKehadiranRows = [];
let dbHomeRekodRows = [];
let dbHomeYear = new Date().getFullYear();
let dbHomeMonth = new Date().getMonth() + 1;
let dbHomeDataReady = false;

async function dbLoadHomeAnalysis(user) {
  const wrap = document.getElementById("db-home-analysis-wrap");
  if (!wrap) return;
  wrap.classList.remove("hidden");
  document.getElementById("db-my-kehadiran-list").innerHTML = `<div class="empty-state" style="padding:14px 2px;font-size:11px">Memuatkan...</div>`;

  const today = new Date();
  dbHomeYear = today.getFullYear();
  dbHomeMonth = today.getMonth() + 1;
  dbUpdateHomeMonthLabel();

  if (!dbApiConfigured()) {
    dbShowHomeAnalysisError("DB_API_URL belum diisi dalam erks-database.js — tak dapat kesan staf.");
    return;
  }
  await dbLoadStaff(user);
  if (!dbStaff) {
    dbShowHomeAnalysisError(`Gagal kesan staf untuk emel "${user.email}". Semak emel tu wujud dalam tab Database (lajur F) dan Apps Script Database dah redeploy.`);
    return;
  }

  try {
    const [kehadiranRows, rekodRows] = await Promise.all([
      dbFetchSheet("Kehadiran"),
      dbFetchSheet("Rekod"),
    ]);
    dbHomeKehadiranRows = kehadiranRows;
    dbHomeRekodRows = rekodRows;
    dbHomeDataReady = true;
    dbRenderHomeMonth();
  } catch (e) {
    dbShowHomeAnalysisError("Ralat baca Sheet: " + e.message);
  }
}

function dbUpdateHomeMonthLabel() {
  const el = document.getElementById("db-my-month-label");
  if (el) el.textContent = `${DB_BULAN[dbHomeMonth - 1]} ${dbHomeYear}`;
}

function dbChangeHomeMonth(delta) {
  if (!dbHomeDataReady) return;
  dbHomeMonth += delta;
  if (dbHomeMonth < 1) { dbHomeMonth = 12; dbHomeYear--; }
  if (dbHomeMonth > 12) { dbHomeMonth = 1; dbHomeYear++; }
  dbUpdateHomeMonthLabel();
  dbRenderHomeMonth();
}

function dbRenderHomeMonth() {
  if (!dbStaff) return;
  const tahun = dbHomeYear, bulan = dbHomeMonth;
  const { kehadiranMap, rekodMap } = dbBuildKehadiranRekodMaps(dbHomeKehadiranRows, dbHomeRekodRows, tahun, bulan);

  const today = new Date();
  const isCurrentMonth = tahun === today.getFullYear() && bulan === today.getMonth() + 1;
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  const startDay = isCurrentMonth ? today.getDate() : daysInMonth;

  const p2 = (n) => String(n).padStart(2, "0");
  const rowsHtml = [];
  for (let d = startDay; d >= 1; d--) {
    const dateObj = new Date(tahun, bulan - 1, d);
    const dow = dateObj.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateKey = dbYmd(dateObj);
    const { masaDisplay, catatanHtml } = dbCrossRefDay(dbStaff.noKP, dbStaff.nama, dbStaff.jawatan, dateKey, kehadiranMap, rekodMap);
    const dLabel = `${p2(d)}/${p2(bulan)}`;
    rowsHtml.push(`<div class="db-my-kh-row">
      <span class="db-my-kh-date">${dLabel}</span>
      <span class="db-my-kh-masa">${masaDisplay}</span>
      <span class="db-my-kh-catatan">${catatanHtml}</span>
    </div>`);
  }

  document.getElementById("db-my-kehadiran-list").innerHTML = rowsHtml.length
    ? rowsHtml.join("")
    : `<div class="empty-state" style="padding:14px 2px;font-size:11px">Tiada hari bekerja bulan ini.</div>`;

  dbSizeHomeAnalysisCard();
}

function dbShowHomeAnalysisError(msg) {
  document.getElementById("db-my-kehadiran-list").innerHTML =
    `<div class="empty-state" style="padding:14px 2px;font-size:10.5px;color:var(--danger)">${dbEscape(msg)}</div>`;
}

async function dbLoadBookRecords() {
  const [kehadiranRows, rekodRows, staffRows] = await Promise.all([
    dbFetchSheet("Kehadiran"),
    dbFetchSheet("Rekod"),
    dbFetchSheet("Database"),
  ]);

  dbBookKehadiranRows = kehadiranRows;
  dbBookRekodRows = rekodRows;

  dbStaffRoster = staffRows.map((r) => {
    const c = r.c || [];
    return {
      noKP: String((c[1] && c[1].v) || "").trim(),
      nama: (c[2] && c[2].v) || "",
      jawatan: (c[3] && c[3].v) || "",
    };
  }).filter((s) => s.nama);
}

function dbChunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dbInitBookFilters() {
  const today = new Date();
  const yearSel = document.getElementById("db-book-year");
  const y = today.getFullYear();
  yearSel.innerHTML = [y-1, y, y+1].map((v) => `<option value="${v}">${v}</option>`).join("");
  yearSel.value = String(y);

  const monthSel = document.getElementById("db-book-month");
  monthSel.innerHTML = `<option value="">— Bulan —</option>` + DB_BULAN.map((b,i) => `<option value="${i+1}">${b}</option>`).join("");
  monthSel.value = String(today.getMonth()+1);

  document.getElementById("db-book-date").value = dbYmd(today);

  yearSel.addEventListener("change", dbBuildAndRenderPages);
  monthSel.addEventListener("change", dbBuildAndRenderPages);
  document.getElementById("db-book-date").addEventListener("change", dbBuildAndRenderPages);
  document.getElementById("db-book-date-clear").addEventListener("click", () => {
    document.getElementById("db-book-date").value = "";
    dbBuildAndRenderPages();
  });
}

function dbBuildAndRenderPages() {
  const year = document.getElementById("db-book-year").value;
  const month = document.getElementById("db-book-month").value; // "" boleh kosong
  const dateStr = document.getElementById("db-book-date").value; // "" boleh kosong

  let dateList = [];
  if (dateStr) {
    dateList = [dateStr];
  } else if (month) {
    const daysInMonth = new Date(parseInt(year,10), parseInt(month,10), 0).getDate();
    dateList = Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);
  }

  // Bina peta cross-reference untuk tahun+bulan yang relevan (ikut tarikh pertama dalam senarai)
  const refYear = dateList.length ? parseInt(dateList[0].slice(0,4), 10) : parseInt(year, 10);
  const refMonth = dateList.length ? parseInt(dateList[0].slice(5,7), 10) : parseInt(month || (new Date().getMonth()+1), 10);
  const maps = dbBuildKehadiranRekodMaps(dbBookKehadiranRows, dbBookRekodRows, refYear, refMonth);
  dbBookKehadiranMap = maps.kehadiranMap;
  dbBookRekodMap = maps.rekodMap;

  dbBookPages = [];
  dateList.forEach((d) => {
    const chunks = dbChunk(dbStaffRoster, DB_ROWS_PER_PAGE);
    (chunks.length ? chunks : [[]]).forEach((chunk, idx) => {
      dbBookPages.push({ dateStr: d, staffChunk: chunk, chunkIndex: idx, totalChunks: chunks.length || 1, startNo: idx * DB_ROWS_PER_PAGE + 1 });
    });
  });

  // Cuba kekal pada tarikh yang sama bila boleh (contoh: tukar tahun/bulan)
  dbBookPageIdx = 0;
  dbRenderBookPage();
}

function dbRenderBookPage() {
  const wrap = document.getElementById("db-book-page-wrap");
  const emptyEl = document.getElementById("db-book-empty-state");

  if (!dbBookPages.length) {
    wrap.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    document.getElementById("db-book-count").textContent = "";
    return;
  }
  emptyEl.classList.add("hidden");
  wrap.classList.remove("hidden");

  if (dbBookPageIdx < 0) dbBookPageIdx = 0;
  if (dbBookPageIdx >= dbBookPages.length) dbBookPageIdx = dbBookPages.length - 1;
  const page = dbBookPages[dbBookPageIdx];

  const [y,m,d] = page.dateStr.split("-");
  const dateLabel = `${d} ${DB_BULAN[parseInt(m,10)-1]} ${y}`;
  const pageLabel = page.totalChunks > 1 ? ` &middot; Muka ${page.chunkIndex+1}/${page.totalChunks}` : "";
  document.getElementById("db-book-date-label").innerHTML = dateLabel + pageLabel;
  document.getElementById("db-book-count").textContent = `${dbBookPageIdx+1} / ${dbBookPages.length}`;

  const rows = page.staffChunk.map((s, i) => {
    const { masaDisplay, catatanHtml } = dbCrossRefDay(s.noKP, s.nama, s.jawatan, page.dateStr, dbBookKehadiranMap, dbBookRekodMap);
    return `<tr>
      <td class="db-book-bil">${String(page.startNo + i).padStart(2, "0")}</td>
      <td class="db-book-nama-cell">${dbEscape(s.nama)}</td>
      <td class="db-book-jawatan-cell">${dbEscape(s.jawatan)}</td>
      <td class="db-book-masa-cell">${masaDisplay}</td>
      <td class="db-book-catatan-cell">${catatanHtml}</td>
    </tr>`;
  }).join("");

  document.getElementById("db-book-tbody").innerHTML = rows || `<tr><td colspan="5" class="db-book-empty">Tiada staf dalam senarai.</td></tr>`;
}

function dbChangeBookPage(delta) {
  if (dbBookFlipping || !dbBookPages.length) return;
  dbBookFlipping = true;
  const spread = document.getElementById("db-book-spread");
  spread.classList.add(delta > 0 ? "flip-next" : "flip-prev");
  setTimeout(() => {
    dbBookPageIdx += delta;
    dbRenderBookPage();
    spread.classList.remove("flip-next", "flip-prev");
    dbBookFlipping = false;
  }, 220);
}

function dbBookTouchStart(e) { dbTouchStartX = e.touches[0].clientX; }
function dbBookTouchEnd(e) {
  if (dbTouchStartX === null) return;
  const dx = e.changedTouches[0].clientX - dbTouchStartX;
  if (Math.abs(dx) > 50) dbChangeBookPage(dx < 0 ? 1 : -1);
  dbTouchStartX = null;
}

let dbBookLoaded = false;
async function dbBootBook() {
  if (dbBookLoaded) { dbRenderBookPage(); return; }
  dbBookLoaded = true;
  document.getElementById("db-book-loading").classList.remove("hidden");
  await dbLoadBookRecords();
  dbInitBookFilters();
  dbBuildAndRenderPages();
  document.getElementById("db-book-loading").classList.add("hidden");

  const spread = document.getElementById("db-book-spread");
  spread.addEventListener("touchstart", dbBookTouchStart, { passive: true });
  spread.addEventListener("touchend", dbBookTouchEnd, { passive: true });
}

/* ---------------- Tinggi kad Analisis Kehadiran Saya (Home) ---------------- */
function dbSizeHomeAnalysisCard() {
  const card = document.getElementById("db-home-analysis-wrap");
  if (!card || card.classList.contains("hidden")) return;
  const bottomNav = document.querySelector(".bottom-nav-wrap");
  const navHeight = bottomNav ? bottomNav.offsetHeight : 60;
  const cardTop = card.getBoundingClientRect().top;
  const available = window.innerHeight - cardTop - navHeight - 16;
  card.style.height = Math.max(180, available) + "px";
}
window.addEventListener("resize", dbSizeHomeAnalysisCard);

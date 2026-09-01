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
let dbBookRecords = [];   // rekod Kehadiran (kehadiran sahaja, MASA MASUK)
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

/* ================= Kad "Analisis Kehadiran Saya" (Home) ================= */
async function dbLoadHomeAnalysis(user) {
  const wrap = document.getElementById("db-home-analysis-wrap");
  if (!wrap) return;
  await dbLoadStaff(user);
  if (!dbStaff) { wrap.classList.add("hidden"); return; }

  try {
    const [kehadiranRows, rekodRows] = await Promise.all([
      dbFetchSheet("Kehadiran"),
      dbFetchSheet("Rekod"),
    ]);

    const myKehadiran = kehadiranRows.map((r) => {
      const c = r.c || [];
      const ts = dbParseGDate(c[1] && c[1].v);
      return {
        tarikhKey: ts ? dbYmd(ts) : null,
        masa: ts ? `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}` : "-",
        noKP: String((c[2] && c[2].v) || "").trim(),
        tujuan: (c[5] && c[5].v) || "",
      };
    }).filter((r) => r.tarikhKey && r.noKP === dbStaff.noKP);

    const myRekod = rekodRows.map((r) => {
      const c = r.c || [];
      return {
        noKP: String((c[3] && c[3].v) || "").trim(),
        tujuan: (c[6] && c[6].v) || "",
        mula: dbParseDDMMMYY(c[10] && c[10].v),
        tamat: dbParseDDMMMYY(c[11] && c[11].v),
      };
    }).filter((r) => r.noKP === dbStaff.noKP && r.mula);

    dbRenderHomeAnalysis(myKehadiran, myRekod);
    wrap.classList.remove("hidden");
  } catch (e) {
    wrap.classList.add("hidden");
  }
}

function dbRenderHomeAnalysis(myKehadiran, myRekod) {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const p2 = (n) => String(n).padStart(2, "0");

  // ---- Kiri: Rekod Kehadiran (Isnin-Jumaat, hari ini ke belakang, terkini atas) ----
  const kehadiranRows = [];
  for (let d = today.getDate(); d >= 1; d--) {
    const dateObj = new Date(y, m, d);
    const dow = dateObj.getDay();
    if (dow === 0 || dow === 6) continue; // langkau Sabtu/Ahad
    const dateKey = dbYmd(dateObj);
    const rec = myKehadiran.find((r) => r.tarikhKey === dateKey && r.tujuan.toUpperCase().includes("MASUK"));
    kehadiranRows.push({ dateObj, masaMasuk: rec ? rec.masa : null });
  }
  const kehadiranHtml = kehadiranRows.length
    ? kehadiranRows.map((r) => {
        const dLabel = `${p2(r.dateObj.getDate())}/${p2(r.dateObj.getMonth()+1)}`;
        return r.masaMasuk
          ? `<div class="db-my-row"><span class="db-my-date">${dLabel}</span><span class="db-my-ok">${r.masaMasuk}</span></div>`
          : `<div class="db-my-row"><span class="db-my-date">${dLabel}</span><span class="db-my-bad">Tidak Mengisi eRKS</span></div>`;
      }).join("")
    : `<div class="empty-state" style="padding:14px 2px;font-size:11px">Tiada hari bekerja setakat ini.</div>`;

  // ---- Kanan: Rekod Keberadaan (bertindih bulan semasa, terkini atas) ----
  const monthStart = new Date(y, m, 1);
  const monthEnd = new Date(y, m + 1, 0, 23, 59, 59);
  const keberadaanFiltered = myRekod
    .filter((r) => r.mula <= monthEnd && (r.tamat || r.mula) >= monthStart)
    .sort((a, b) => b.mula - a.mula);
  const keberadaanHtml = keberadaanFiltered.length
    ? keberadaanFiltered.map((r) => {
        const mLabel = `${p2(r.mula.getDate())}/${p2(r.mula.getMonth()+1)}`;
        const tLabel = r.tamat ? `${p2(r.tamat.getDate())}/${p2(r.tamat.getMonth()+1)}` : mLabel;
        const rangeLabel = mLabel === tLabel ? mLabel : `${mLabel}-${tLabel}`;
        return `<div class="db-my-row"><span class="db-my-date">${rangeLabel}</span><span class="db-my-tujuan">${dbEscape(r.tujuan)}</span></div>`;
      }).join("")
    : `<div class="empty-state" style="padding:14px 2px;font-size:11px">Tiada rekod keberadaan bulan ini.</div>`;

  document.getElementById("db-my-kehadiran-list").innerHTML = kehadiranHtml;
  document.getElementById("db-my-keberadaan-list").innerHTML = keberadaanHtml;
}

async function dbLoadBookRecords() {
  const [kehadiranRows, staffRows] = await Promise.all([
    dbFetchSheet("Kehadiran"),
    dbFetchSheet("Database"),
  ]);

  dbBookRecords = kehadiranRows.map((r) => {
    const c = r.c || [];
    const ts = dbParseGDate(c[1] && c[1].v);
    return {
      tarikhKey: ts ? dbYmd(ts) : null,
      masa: ts ? `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}` : "-",
      noKP: String((c[2] && c[2].v) || "").trim(),
      tujuan: (c[5] && c[5].v) || "",
    };
  }).filter((r) => r.tarikhKey && r.noKP);

  dbStaffRoster = staffRows.map((r) => {
    const c = r.c || [];
    return {
      noKP: String((c[1] && c[1].v) || "").trim(),
      nama: (c[2] && c[2].v) || "",
      jawatan: (c[3] && c[3].v) || "",
    };
  }).filter((s) => s.nama);
}

function dbMasaMasukFor(noKP, tarikhKey) {
  const rec = dbBookRecords.find((r) => r.noKP === noKP && r.tarikhKey === tarikhKey && r.tujuan.toUpperCase().includes("MASUK"));
  return rec ? rec.masa : null;
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
    const masaMasuk = dbMasaMasukFor(s.noKP, page.dateStr);
    const catatan = masaMasuk
      ? `<span class="db-book-ok">Hadir</span>`
      : `<span class="db-book-badge">Belum Mengisi Sistem eRKS</span>`;
    return `<tr>
      <td class="db-book-bil">${page.startNo + i}</td>
      <td class="db-book-nama-cell">${dbEscape(s.nama)}</td>
      <td class="db-book-jawatan-cell">${dbEscape(s.jawatan)}</td>
      <td class="db-book-masa-cell">${masaMasuk || "-"}</td>
      <td class="db-book-catatan-cell">${catatan}</td>
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

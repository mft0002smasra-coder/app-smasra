/* ============================================================
   LAPORAN GURU BERTUGAS — flow SAMA macam bot rujukan:

   MENU UTAMA
   ├─ Laporan Baru -> Borang Butiran -> Simpan DATABOT -> SECTION VIEW
   └─ Semak Laporan -> Pilih Minggu -> Pilih Tarikh -> SECTION VIEW

   SECTION VIEW (hub utama, papar 1 seksyen, macam reviewSectionPage):
     Prev/Next Seksyen | Edit Seksyen Ini | Semak Laporan Ini | PDF
     | Pilih Seksyen | Pilih Tarikh Lain | Menu Utama

   Semak -> Pilih Penyemak (senarai statik lajur G "DATA SEMAKAN")
          -> Taip Ulasan -> Simpan -> PAPAR SEMULA SENARAI TARIKH
   ============================================================ */

const LGB_SPREADSHEET_ID = "1cmYZlMRGXZB4LmrCowJcmfnbY4LiKhuvE9FIoamWl2s"; // Spreadsheet SEBENAR bot
const LGB_SHEET_NAME = "DATABOT";       // sasaran TULIS (simpan jawapan)

const LGB_SECTIONS = [
  {
    key: "kehadiran", title: "Kehadiran",
    fields: [
      { key: "kehadiranGuru", label: "Kehadiran Guru", type: "text" },
      { key: "namaGuruTidakHadir", label: "Nama Guru Tidak Hadir", type: "textarea" },
      { key: "kehadiranAkp", label: "Kehadiran AKP", type: "text" },
      { key: "namaAkpTidakHadir", label: "Nama AKP Tidak Hadir", type: "textarea" },
    ],
  },
  {
    key: "blokA", title: "Blok A",
    fields: [
      { key: "laporanBlokA", label: "Laporan Tempat Bertugas Blok A", type: "textarea" },
      { key: "tindakanBlokA", label: "Tindakan", type: "textarea" },
    ],
    gambarField: "gambarBlokA",
  },
  {
    key: "blokB", title: "Blok B",
    fields: [
      { key: "laporanBlokB", label: "Laporan Tempat Bertugas Blok B", type: "textarea" },
      { key: "tindakanBlokB", label: "Tindakan", type: "textarea" },
    ],
    gambarField: "gambarBlokB",
  },
  {
    key: "blokC", title: "Blok C",
    fields: [
      { key: "laporanBlokC", label: "Laporan Tempat Bertugas Blok C", type: "textarea" },
      { key: "tindakanBlokC", label: "Tindakan", type: "textarea" },
    ],
    gambarField: "gambarBlokC",
  },
  {
    key: "blokKantin", title: "Blok Kantin",
    fields: [
      { key: "laporanBlokKantin", label: "Laporan Tempat Bertugas Blok Kantin", type: "textarea" },
      { key: "tindakanBlokKantin", label: "Tindakan", type: "textarea" },
    ],
    gambarField: "gambarBlokKantin",
  },
  {
    key: "keselamatan", title: "Keselamatan & Peristiwa",
    fields: [
      { key: "laporanKeselamatan", label: "Laporan Keselamatan", type: "textarea" },
      { key: "tindakanKeselamatan", label: "Tindakan Bagi Laporan Keselamatan", type: "textarea" },
      { key: "peristiwaProgram", label: "Peristiwa / Program", type: "textarea" },
      { key: "tindakanPeristiwa", label: "Tindakan", type: "textarea" },
    ],
    gambarField: "gambarKeselamatan",
  },
];
const LGB_HEADER_FIELDS = [
  { key: "namaPelapor", label: "Nama Pelapor", type: "text" },
  { key: "namaGuruBertugas", label: "Nama-Nama Guru Bertugas", type: "textarea" },
];

let lgbCurrentUser = null;
let lgbMinggu = "";
let lgbTarikh = "";
let lgbCurrentRow = null;
let lgbSecIndex = 0;
let lgbEditingSection = null;
let lgbPendingImage = null;
let lgbRecords = [];
let lgbPenyemakNames = [];
let lgbSelectedPenyemak = "";
let lgbWeeksCache = [];

function lgbEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function lgbSleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** Betulkan URL gambar: kalau ia link Google Drive biasa (bukan lh3), ambil
 * FILE ID dan tukar jadi format lh3.googleusercontent.com — punca "gambar
 * crash" ialah link Drive biasa (drive.google.com/file/d/ID/view) tak boleh
 * terus dipapar dalam <img>, perlu ditukar dahulu. */
function lgbFixImageUrl(url) {
  if (!url) return "";
  const raw = String(url).trim();
  if (!raw) return "";
  if (raw.indexOf("lh3.googleusercontent.com") !== -1) return raw; // dah betul
  // Corak biasa: /file/d/FILE_ID/... ATAU ?id=FILE_ID ATAU /d/FILE_ID
  let m = raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || raw.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m && m[1]) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  return raw; // bukan link Drive dikenali — biar apa adanya
}

/** Format tarikh YYYY-MM-DD (storan) -> dd-mm-YYYY (paparan) */
function lgbFormatDate(isoStr) {
  if (!isoStr) return "-";
  const m = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoStr;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Satu SEL data boleh ada BEBERAPA link gambar dipisah koma — pecah semua,
 * betulkan setiap satu (Drive -> lh3), pulangkan senarai URL sah. */
function lgbFixImageUrls(cellValue) {
  if (!cellValue) return [];
  return String(cellValue).split(",")
    .map((s) => lgbFixImageUrl(s.trim()))
    .filter((u) => u);
}

/* ================= Navigasi skrin (satu container, toggle) ================= */
const LGB_SCREENS = ["menu", "start", "weeks", "dates", "view", "picker", "edit", "penyemak", "ulasan"];
function lgbShowScreen(name) {
  LGB_SCREENS.forEach((s) => document.getElementById(`lgb-screen-${s}`).classList.toggle("hidden", s !== name));
}

function lgbInit(user) {
  lgbCurrentUser = user;
  lgbShowMenu();
  lgbLoadAnalisis();
}

/* ================= Analisis Penghantaran (kad di Menu Utama) ================= */
async function lgbLoadAnalisis() {
  await lgbFetchRecords();
  if (!lgbRecords.length) {
    document.getElementById("lgb-analisis-wrap").classList.add("hidden");
    return;
  }
  document.getElementById("lgb-analisis-wrap").classList.remove("hidden");

  // Kira bilangan tarikh UNIK setiap minggu
  const byWeek = {};
  lgbRecords.forEach((r) => {
    const w = String(r.minggu).trim();
    if (!byWeek[w]) byWeek[w] = new Set();
    byWeek[w].add(r.tarikh);
  });
  const weekNums = Object.keys(byWeek)
    .map((w) => parseInt(String(w).replace(/[^0-9]/g, ""), 10))
    .filter((n) => !isNaN(n));
  const maxWeekNum = weekNums.length ? Math.max(...weekNums) : null;

  // Jumlah keseluruhan
  document.getElementById("lgb-analisis-total").textContent = lgbRecords.length;

  // Prestasi minggu TERKINI (minggu tertinggi dijumpai dalam data)
  const currentWeekKey = Object.keys(byWeek).find((w) => parseInt(String(w).replace(/[^0-9]/g, ""), 10) === maxWeekNum);
  const currentCount = currentWeekKey ? byWeek[currentWeekKey].size : 0;
  const pct = Math.min(100, Math.round((currentCount / 5) * 100));
  document.getElementById("lgb-analisis-minggu-label").textContent = `Prestasi ${currentWeekKey || "-"}`;
  document.getElementById("lgb-analisis-progress-bar").style.width = `${pct}%`;
  document.getElementById("lgb-analisis-progress-text").textContent = `${pct}%`;
  document.getElementById("lgb-analisis-progress-sub").textContent = `${currentCount}/5 Hari Selesai`;

  // Minggu TIADA laporan langsung (dalam julat 1..maxWeekNum, tak wujud dalam data)
  const missing = [];
  const incomplete = [];
  if (maxWeekNum) {
    for (let n = 1; n <= maxWeekNum; n++) {
      const key = Object.keys(byWeek).find((w) => parseInt(String(w).replace(/[^0-9]/g, ""), 10) === n);
      if (!key) { missing.push(`Minggu ${n}`); continue; }
      const count = byWeek[key].size;
      if (count < 5) incomplete.push({ label: key, count });
    }
  }

  document.getElementById("lgb-analisis-missing-count").textContent = missing.length;
  document.getElementById("lgb-analisis-incomplete-count").textContent = incomplete.length;
  lgbMissingList = missing;
  lgbIncompleteList = incomplete;
}

let lgbMissingList = [];
let lgbIncompleteList = [];

function lgbOpenAnalisisPopup(kind) {
  const title = kind === "missing" ? "⚠ Minggu Tiada Laporan" : "⏱ Minggu Belum Cukup 5 Hari";
  const list = kind === "missing" ? lgbMissingList : lgbIncompleteList;
  document.getElementById("lgb-popup-title").textContent = title;
  document.getElementById("lgb-popup-body").innerHTML = list.length
    ? (kind === "missing"
        ? `<div class="lgb-pill-wrap">${list.map((m) => `<span class="lgb-week-pill lgb-week-pill-red">${lgbEscape(m)}</span>`).join("")}</div>`
        : list.map((it) => `<div class="lgb-incomplete-row"><span>${lgbEscape(it.label)}</span><span class="lgb-week-pill lgb-week-pill-amber">${it.count}/5 Hari Selesai</span></div>`).join(""))
    : `<span class="sub-dim">Tiada rekod.</span>`;
  document.getElementById("lgb-popup-overlay").classList.remove("hidden");
}
function lgbCloseAnalisisPopup() {
  document.getElementById("lgb-popup-overlay").classList.add("hidden");
}

/* ================= MENU UTAMA ================= */
function lgbShowMenu() {
  lgbShowScreen("menu");
}
function lgbGoNewReport() {
  const today = new Date();
  lgbMinggu = "";
  lgbTarikh = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  document.getElementById("lgb-start-minggu").value = "";
  document.getElementById("lgb-start-tarikh").value = lgbTarikh;
  document.getElementById("lgb-start-pelapor").value = (lgbCurrentUser && lgbCurrentUser.nama) || "";
  document.getElementById("lgb-start-guru").value = "";
  document.getElementById("lgb-start-error").classList.add("hidden");
  lgbShowScreen("start");
}
async function lgbGoSemakLaporan() {
  lgbShowScreen("weeks");
  document.getElementById("lgb-weeks-list").innerHTML = `<div class="empty-state">Memuatkan...</div>`;
  await lgbFetchRecords();
  const weeks = [...new Set(lgbRecords.map((r) => String(r.minggu).trim()))];
  // Susun minggu TERKINI di atas — ambil nombor dalam teks (cth "Minggu 31" -> 31)
  // untuk susun betul secara numerik, jatuh balik ke susun teks kalau tiada nombor.
  weeks.sort((a, b) => {
    const na = parseInt(String(a).replace(/[^0-9]/g, ""), 10);
    const nb = parseInt(String(b).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(na) && !isNaN(nb)) return nb - na;
    return String(b).localeCompare(String(a));
  });
  lgbWeeksCache = weeks;
  document.getElementById("lgb-weeks-list").innerHTML = weeks.length
    ? `<div class="lgb-week-grid">${weeks.map((w) => `<button class="lgb-week-box" onclick="lgbGoDates('${lgbEscape(w)}')">${lgbEscape(w)}</button>`).join("")}</div>`
    : `<div class="empty-state">Belum ada laporan lagi.</div>`;
}
function lgbGoDates(minggu) {
  lgbMinggu = String(minggu).trim();
  lgbShowScreen("dates");
  const dates = lgbRecords.filter((r) => String(r.minggu).trim() === lgbMinggu).map((r) => r.tarikh);
  document.getElementById("lgb-dates-subtitle").textContent = lgbMinggu;
  document.getElementById("lgb-dates-list").innerHTML = dates.length
    ? dates.map((d) => `<button class="lgb-list-item" onclick="lgbOpenSectionView('${lgbEscape(d)}',0)">${lgbEscape(lgbFormatDate(d))}</button>`).join("")
    : `<div class="empty-state">Tiada tarikh untuk minggu ini.</div>`;
}

/* ================= Langkah 1: Borang Butiran (Minggu/Tarikh/Pelapor) ================= */
async function lgbStartOrResume() {
  const minggu = document.getElementById("lgb-start-minggu").value.trim();
  const tarikh = document.getElementById("lgb-start-tarikh").value;
  const namaPelapor = document.getElementById("lgb-start-pelapor").value.trim();
  const namaGuruBertugas = document.getElementById("lgb-start-guru").value.trim();
  const errEl = document.getElementById("lgb-start-error");

  if (!minggu || !tarikh || !namaPelapor) {
    errEl.textContent = "Sila lengkapkan Minggu, Tarikh, dan Nama Pelapor.";
    errEl.classList.remove("hidden");
    return;
  }
  const btn = document.getElementById("lgb-start-btn");
  btn.disabled = true; btn.textContent = "Menyimpan...";

  const ok = await lgbSaveSection("butiran", [namaPelapor, namaGuruBertugas], null, minggu, tarikh);

  if (!ok) {
    btn.disabled = false; btn.textContent = "Simpan & Mula";
    errEl.textContent = "Gagal simpan. Cuba lagi.";
    errEl.classList.remove("hidden");
    return;
  }
  lgbMinggu = minggu;
  lgbTarikh = tarikh;
  btn.textContent = "Menunggu kemaskini...";
  await lgbSleep(1200); // bagi cache gviz Google sempat "sejuk" sebelum baca semula
  await lgbFetchRecords(true); // paksa segar — jangan guna cache lepas simpan
  lgbOpenSectionView(tarikh, 0);
  btn.disabled = false; btn.textContent = "Simpan & Mula";
}

/* ================= SECTION VIEW — hub utama (macam reviewSectionPage) ================= */
function lgbLoadCurrentRow() {
  lgbCurrentRow = lgbRecords.find((r) => String(r.minggu).trim() === lgbMinggu && String(r.tarikh).trim() === lgbTarikh) || null;
  const keyList = lgbRecords.map((r) => `'${r.minggu}'|'${r.tarikh}'`).join(", ");
  console.log("[LGB] Cari: lgbMinggu='" + lgbMinggu + "' lgbTarikh='" + lgbTarikh + "' -> " + (lgbCurrentRow ? "JUMPA" : "TIDAK JUMPA"));
  console.log("[LGB] Semua kunci sedia ada (" + lgbRecords.length + "): " + keyList);
}

async function lgbOpenSectionView(tarikh, secIndex) {
  lgbTarikh = tarikh;
  lgbSecIndex = secIndex;
  if (!lgbRecords.length) await lgbFetchRecords();
  lgbLoadCurrentRow();
  lgbRenderSectionView();
  lgbShowScreen("view");
}

function lgbRenderSectionView() {
  const sec = LGB_SECTIONS[lgbSecIndex];
  const r = lgbCurrentRow || {};

  document.getElementById("lgb-view-minggu").textContent = lgbMinggu;
  document.getElementById("lgb-view-tarikh").textContent = lgbFormatDate(lgbTarikh);
  document.getElementById("lgb-view-pelapor").textContent = r.namaPelapor || "-";
  document.getElementById("lgb-view-penyemak").textContent = r.penyemak || "-";
  const ulasanLine = document.getElementById("lgb-view-ulasan-line");
  if (r.catatanSemakan) {
    document.getElementById("lgb-view-ulasan").textContent = r.catatanSemakan;
    ulasanLine.classList.remove("hidden");
  } else {
    ulasanLine.classList.add("hidden");
  }
  document.getElementById("lgb-view-secname").textContent = sec.title;

  const fieldsHtml = sec.fields.map((f) => {
    const val = r[f.key] || "-";
    return `<div class="lgb-view-row"><span class="lgb-view-label">${lgbEscape(f.label)}</span><span class="lgb-view-val">${lgbEscape(val)}</span></div>`;
  }).join("");

  // Satu sel gambar boleh ada BEBERAPA link dipisah koma — papar SEMUA,
  // klik mana-mana satu untuk besarkan (lightbox).
  const imgUrls = sec.gambarField ? lgbFixImageUrls(r[sec.gambarField]) : [];
  const imgHtml = imgUrls.length
    ? `<div class="lgb-view-img-grid">${imgUrls.map((u) => `<div class="lgb-view-img-wrap"><img src="${lgbEscape(u)}" onerror="this.parentElement.style.display='none'" onclick="openImageLightbox('${lgbEscape(u)}')"></div>`).join("")}</div>`
    : "";
  document.getElementById("lgb-view-fields").innerHTML = fieldsHtml + imgHtml;

  document.getElementById("lgb-view-prev").classList.toggle("hidden", lgbSecIndex <= 0);
  document.getElementById("lgb-view-next").classList.toggle("hidden", lgbSecIndex >= LGB_SECTIONS.length - 1);
}
function lgbViewNav(dir) {
  const next = lgbSecIndex + dir;
  if (next < 0 || next >= LGB_SECTIONS.length) return;
  lgbSecIndex = next;
  lgbRenderSectionView();
}
function lgbBackToMenu() {
  lgbShowMenu();
}
function lgbBackToDates() {
  lgbGoDates(lgbMinggu);
}

/* ================= Pilih Seksyen (senarai bernombor — jump) ================= */
function lgbOpenPicker() {
  document.getElementById("lgb-picker-list").innerHTML = LGB_SECTIONS.map((sec, i) =>
    `<button class="lgb-list-item" onclick="lgbPickerGo(${i})">${i + 1}. ${lgbEscape(sec.title)}</button>`).join("");
  lgbShowScreen("picker");
}
function lgbPickerGo(idx) {
  lgbSecIndex = idx;
  lgbRenderSectionView();
  lgbShowScreen("view");
}

/* ================= Edit Seksyen Ini ================= */
function lgbOpenEdit() {
  const sec = LGB_SECTIONS[lgbSecIndex];
  lgbEditingSection = sec;
  lgbPendingImage = null;
  const r = lgbCurrentRow || {};

  document.getElementById("lgb-edit-title").textContent = sec.title;
  const fieldsHtml = sec.fields.map((f) => {
    const val = r[f.key] || "";
    if (f.type === "textarea") {
      return `<label class="lgb-field-label">${lgbEscape(f.label)}</label><textarea class="lgb-field" id="lgb-f-${f.key}">${lgbEscape(val)}</textarea>`;
    }
    return `<label class="lgb-field-label">${lgbEscape(f.label)}</label><input class="lgb-field" type="text" id="lgb-f-${f.key}" value="${lgbEscape(val)}">`;
  }).join("");

  let imgHtml = "";
  if (sec.gambarField) {
    const existingUrl = lgbFixImageUrl(r[sec.gambarField]);
    imgHtml = `
      <label class="lgb-field-label" style="margin-top:14px">Lampiran Gambar (pilihan)</label>
      <div class="lgb-img-slot" id="lgb-img-slot" onclick="document.getElementById('lgb-img-input').click()">
        ${existingUrl ? `<img id="lgb-img-preview" src="${lgbEscape(existingUrl)}" onerror="this.parentElement.innerHTML='<div class=\\'lgb-img-empty\\'>📷<br>Ketik untuk pilih gambar</div>'">` : `<div class="lgb-img-empty">📷<br>Ketik untuk pilih gambar</div>`}
      </div>
      <input type="file" id="lgb-img-input" accept="image/*" class="hidden" onchange="lgbHandleImagePick(this)">
    `;
  }
  document.getElementById("lgb-edit-fields").innerHTML = fieldsHtml + imgHtml;
  document.getElementById("lgb-edit-error").classList.add("hidden");
  lgbShowScreen("edit");
}
function lgbHandleImagePick(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1000;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      lgbPendingImage = canvas.toDataURL("image/jpeg", 0.75);
      document.getElementById("lgb-img-slot").innerHTML = `<img id="lgb-img-preview" src="${lgbPendingImage}">`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
async function lgbSaveEdit() {
  const sec = lgbEditingSection;
  const values = sec.fields.map((f) => document.getElementById(`lgb-f-${f.key}`).value.trim());
  const errEl = document.getElementById("lgb-edit-error");
  const btn = document.getElementById("lgb-edit-save-btn");
  btn.disabled = true; btn.textContent = "Menyimpan...";

  const ok = await lgbSaveSection(sec.key, values, lgbPendingImage, lgbMinggu, lgbTarikh, lgbCurrentRow);

  if (!ok) {
    btn.disabled = false; btn.textContent = "Simpan";
    errEl.textContent = "Gagal simpan. Cuba lagi.";
    errEl.classList.remove("hidden");
    return;
  }
  btn.textContent = "Menunggu kemaskini...";
  await lgbSleep(1200); // bagi cache gviz Google sempat "sejuk" sebelum baca semula
  await lgbFetchRecords(true); // paksa segar — jangan guna cache lepas simpan
  lgbLoadCurrentRow();
  lgbRenderSectionView();
  lgbShowScreen("view");
  btn.disabled = false; btn.textContent = "Simpan";
}
function lgbCancelEdit() {
  lgbShowScreen("view");
}

/** Fungsi simpan generik — SATU seksyen sahaja setiap panggilan. */
async function lgbSaveSection(sectionKey, values, gambarBase64, minggu, tarikh, fullRecord) {
  if (!apiConfigured()) return false;
  try {
    const payload = { action: "saveLaporanGuruBertugasSection", email: lgbCurrentUser.email, sectionKey, values, minggu, tarikh };
    if (gambarBase64) payload.gambar = gambarBase64;
    if (fullRecord) payload.fullRecord = fullRecord; // untuk migrate PENUH ke DATABOT kalau baris belum wujud di situ
    const data = await postToAppsScript(API_URL, payload);
    return !!data.success;
  } catch (e) {
    return false;
  }
}

/* ================= Semak Laporan Ini — Pilih Penyemak -> Ulasan ================= */
async function lgbOpenSemak() {
  if (!lgbPenyemakNames.length) await lgbFetchPenyemakList();
  document.getElementById("lgb-penyemak-list").innerHTML = lgbPenyemakNames.length
    ? lgbPenyemakNames.map((n) => `<button class="lgb-list-item" onclick="lgbSelectPenyemak('${lgbEscape(n)}')">${lgbEscape(n)}</button>`).join("")
    : `<div class="empty-state">Sila isi senarai nama penyemak di Lajur G tab DATA SEMAKAN.</div>`;
  lgbShowScreen("penyemak");
}
function lgbSelectPenyemak(nama) {
  lgbSelectedPenyemak = nama;
  document.getElementById("lgb-ulasan-summary").innerHTML =
    `Minggu: <b>${lgbEscape(lgbMinggu)}</b><br>Tarikh: <b>${lgbEscape(lgbTarikh)}</b><br>Pelapor: <b>${lgbEscape((lgbCurrentRow && lgbCurrentRow.namaPelapor) || "-")}</b><br>Penyemak: <b>${lgbEscape(nama)}</b>`;
  document.getElementById("lgb-ulasan-text").value = "";
  document.getElementById("lgb-ulasan-error").classList.add("hidden");
  lgbShowScreen("ulasan");
}
async function lgbSubmitUlasan() {
  const ulasan = document.getElementById("lgb-ulasan-text").value.trim();
  const errEl = document.getElementById("lgb-ulasan-error");
  if (!ulasan) {
    errEl.textContent = "Sila taip ulasan/catatan.";
    errEl.classList.remove("hidden");
    return;
  }
  const btn = document.getElementById("lgb-ulasan-submit-btn");
  btn.disabled = true; btn.textContent = "Menyimpan...";
  const ok = await lgbSaveSemakan(lgbMinggu, lgbTarikh, (lgbCurrentRow && lgbCurrentRow.namaPelapor) || "", lgbSelectedPenyemak, ulasan);
  btn.disabled = false; btn.textContent = "Simpan Semakan";
  if (!ok) {
    errEl.textContent = "Gagal simpan. Cuba lagi.";
    errEl.classList.remove("hidden");
    return;
  }
  // PAPAR SEMULA SENARAI TARIKH — sama macam bot rujukan (bukan balik ke laporan)
  await lgbGoSemakLaporan();
  lgbGoDates(lgbMinggu);
}
function lgbCancelUlasan() {
  lgbShowScreen("view");
}

/* ================= Cetak / PDF — LAPORAN PENUH (semua seksyen) ================= */
function lgbPrintReport() {
  const r = lgbCurrentRow || {};
  const allSections = [
    { title: "Butiran Laporan", fields: LGB_HEADER_FIELDS },
    ...LGB_SECTIONS,
  ];
  const bodyHtml = allSections.map((sec) => {
    const fieldsHtml = sec.fields.map((f) => `<div class="lgb-print-row"><span class="lgb-print-label">${lgbEscape(f.label)}</span><span class="lgb-print-val">${lgbEscape(r[f.key] || "-")}</span></div>`).join("");
    const imgUrls = sec.gambarField ? lgbFixImageUrls(r[sec.gambarField]) : [];
    const imgHtml = imgUrls.length
      ? `<div class="lgb-print-img-grid">${imgUrls.map((u) => `<img class="lgb-print-img" src="${lgbEscape(u)}">`).join("")}</div>`
      : "";
    return `<div class="lgb-print-section"><div class="lgb-print-section-title">${lgbEscape(sec.title)}</div>${fieldsHtml}${imgHtml}</div>`;
  }).join("");

  const printArea = document.getElementById("lgb-print-area");
  printArea.innerHTML = `
    <div class="lgb-print-header">
      <div class="lgb-print-main-title">LAPORAN GURU BERTUGAS</div>
      <div>Minggu: <b>${lgbEscape(lgbMinggu)}</b> &nbsp; Tarikh: <b>${lgbEscape(lgbFormatDate(lgbTarikh))}</b> &nbsp; Pelapor: <b>${lgbEscape(r.namaPelapor || "-")}</b></div>
    </div>
    <div class="lgb-print-semakan">Penyemak: <b>${lgbEscape(r.penyemak || "-")}</b><br>Ulasan: <b>${lgbEscape(r.catatanSemakan || "-")}</b></div>
    ${bodyHtml}`;
  window.print();
}

/* ================= Fetch: Data2 (gviz, formula gabungan DATABOT+DATA) ================= */
// Tab "Data2" = SORTN(VSTACK(DATABOT!A3:Y, DATA!A560:Y), ...) — baris 1-2
// seksyen/header, DATA MULA BARIS 3. Baca terus dari sini (bukan gabung
// sendiri) — formula Google yang uruskan penggabungan.
const LGB_READ_SHEET_NAME = "Data2";

const LGB_CACHE_KEY = "lgb_records_cache";
const LGB_CACHE_TTL_MS = 90 * 1000; // 90 saat — cukup pendek untuk kekal segar, cukup panjang elak app "hang"

/** Parser CSV ringkas (kendali medan bertanda petikan "..." yang ada koma
 * dalam kandungannya sendiri) — perlu sebab guna tqx=out:csv, bukan JSON. */
function lgbParseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\r") { /* abaikan, tunggu \n */ }
      else if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Normalkan TARIKH ke storan dalaman ISO (yyyy-mm-dd), APA SAHAJA format ia
 * ditaip/dipapar dalam Sheet — sebab CSV pulangkan nilai PAPARAN (ikut
 * locale sel), bukan mentah, dan format boleh berbeza-beza (dd/mm/yyyy,
 * yyyy-mm-dd, dd-mm-yyyy). Kalau tak padan corak tarikh langsung (cth
 * teks status "CUTI"), pulangkan asal (bukan tarikh, biar apa adanya). */
function lgbNormalizeTarikh(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // yyyy-mm-dd (dah ISO)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // dd/mm/yyyy ATAU dd-mm-yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s; // bukan corak tarikh dikenali (cth "CUTI") — biar apa adanya
}

/** Baca satu Sheet (julat A3:Y5000, guna CSV — lebih literal, elak gviz
 * keliru dengan lajur bercampur jenis) dan pulangkan senarai rekod. */
async function lgbFetchSheetAsRecords(sheetName) {
  const cacheBust = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const url = `https://docs.google.com/spreadsheets/d/${LGB_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&range=A3:Y5000&_ts=${cacheBust}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const rows = lgbParseCsv(text);
  return rows.map((c) => {
    const get = (i) => (c[i] != null ? String(c[i]).trim() : "");
    return {
      minggu: get(0), tarikh: lgbNormalizeTarikh(get(1)),
      namaPelapor: get(2), namaGuruBertugas: get(3),
      kehadiranGuru: get(4), namaGuruTidakHadir: get(5), kehadiranAkp: get(6), namaAkpTidakHadir: get(7),
      laporanBlokA: get(8), tindakanBlokA: get(9), laporanBlokB: get(10), tindakanBlokB: get(11),
      laporanBlokC: get(12), tindakanBlokC: get(13), laporanBlokKantin: get(14), tindakanBlokKantin: get(15),
      laporanKeselamatan: get(16), tindakanKeselamatan: get(17), peristiwaProgram: get(18), tindakanPeristiwa: get(19),
      gambarBlokA: get(20), gambarBlokB: get(21), gambarBlokC: get(22), gambarBlokKantin: get(23), gambarKeselamatan: get(24),
    };
  }).filter((r) => r.minggu && r.tarikh);
}

/** Gabung Data2 (formula, mungkin ada lag) + DATABOT (sumber TERUS, tiada
 * formula) ikut kunci Minggu+Tarikh. DATABOT MENANG untuk setiap medan
 * yang ADA nilai — sebab ia baca terus, jadi lebih boleh dipercayai
 * berbanding Data2 yang kadang tertinggal (had cache formula gviz). */
function lgbMergeWithDatabot(data2List, databotList) {
  const mergeKey = (r) => `${String(r.minggu).trim()}|${String(r.tarikh).trim()}`;
  const merged = {};
  const order = [];
  data2List.forEach((r) => {
    const key = mergeKey(r);
    merged[key] = Object.assign({}, r);
    order.push(key);
  });
  databotList.forEach((r) => {
    const key = mergeKey(r);
    if (!merged[key]) { merged[key] = Object.assign({}, r); order.push(key); return; }
    Object.keys(r).forEach((field) => { if (r[field]) merged[key][field] = r[field]; });
  });
  return order.map((key) => merged[key]);
}

async function lgbFetchRecords(forceRefresh) {
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(LGB_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < LGB_CACHE_TTL_MS) {
          lgbRecords = parsed.data;
          return;
        }
      }
    } catch (e) { /* storan tak boleh diakses — teruskan fetch biasa */ }
  }
  // Baca Data2 & DATABOT SECARA BERASINGAN — satu gagal takkan hapuskan yang
  // lain. console.log dedah bilangan rekod setiap sumber untuk diagnostik.
  let data2List = [];
  let databotList = [];
  try {
    data2List = await lgbFetchSheetAsRecords(LGB_READ_SHEET_NAME);
    console.log("[LGB] Data2: " + data2List.length + " rekod sah");
  } catch (e) {
    console.error("[LGB] Gagal baca Data2:", e);
  }
  try {
    databotList = await lgbFetchSheetAsRecords(LGB_SHEET_NAME);
    console.log("[LGB] DATABOT: " + databotList.length + " rekod sah");
  } catch (e) {
    console.error("[LGB] Gagal baca DATABOT:", e);
  }
  lgbRecords = lgbMergeWithDatabot(data2List, databotList);
  console.log("[LGB] Selepas cross-check: " + lgbRecords.length + " rekod unik");

  try {
    await lgbFetchSemakan();
    try { sessionStorage.setItem(LGB_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: lgbRecords })); } catch (e) {}
  } catch (e) {
    console.error("[LGB] Gagal baca DATA SEMAKAN:", e);
  }
}

/** DATA SEMAKAN lajur A-E (Minggu/Tarikh/Pelapor/Penyemak/Catatan) — cantum
 * rekod TERAKHIR yang padan Minggu+Tarikh ke setiap laporan DATABOT. */
async function lgbFetchSemakan() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${LGB_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("DATA SEMAKAN")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;
    const gvizDateToIso = (v) => {
      if (!v) return "";
      const m = String(v).match(/Date\((\d+),(\d+),(\d+)/);
      if (!m) return String(v).replace(/^'/, "").trim();
      const y = parseInt(m[1]), mo = parseInt(m[2]) + 1, d = parseInt(m[3]);
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    const semakByKey = {};
    (table.rows || []).forEach((r) => {
      const c = r.c || [];
      const get = (i) => (c[i] && c[i].v != null ? c[i].v : "");
      const key = `${get(0)}|${gvizDateToIso(get(1)) || String(get(1))}`;
      semakByKey[key] = { penyemak: get(3) || "", catatan: get(4) || "" }; // rekod TERAKHIR menang
    });
    lgbRecords.forEach((r) => {
      const info = semakByKey[`${r.minggu}|${r.tarikh}`];
      r.penyemak = info ? info.penyemak : "";
      r.catatanSemakan = info ? info.catatan : "";
    });
  } catch (e) { /* tak kritikal */ }
}

/** Senarai NAMA PENYEMAK — senarai RUJUKAN STATIK, Lajur G "DATA SEMAKAN"
 * (BUKAN diambil dari rekod semakan lepas — ikut kod bot rujukan tepat). */
async function lgbFetchPenyemakList() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${LGB_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("DATA SEMAKAN")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;
    lgbPenyemakNames = (table.rows || [])
      .map((r) => (r.c[6] && r.c[6].v) || "") // Lajur G = indeks 6
      .filter((n) => n && String(n).trim());
  } catch (e) {
    lgbPenyemakNames = [];
  }
}

/** Simpan semakan baharu — appendRow terus (gunakan action write generik). */
async function lgbSaveSemakan(minggu, tarikh, pelapor, penyemak, catatan) {
  if (!apiConfigured()) return false;
  try {
    const data = await postToAppsScript(API_URL, { action: "saveLaporanGuruBertugasSemakan", minggu, tarikh, pelapor, penyemak, catatan });
    return !!data.success;
  } catch (e) {
    return false;
  }
}

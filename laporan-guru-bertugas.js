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
const LGB_READ_SHEET_NAME = "Data2";    // sasaran BACA (formula gabungan, auto-sync dari DATABOT)

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

/* ================= Navigasi skrin (satu container, toggle) ================= */
const LGB_SCREENS = ["menu", "start", "weeks", "dates", "view", "picker", "edit", "penyemak", "ulasan"];
function lgbShowScreen(name) {
  LGB_SCREENS.forEach((s) => document.getElementById(`lgb-screen-${s}`).classList.toggle("hidden", s !== name));
}

function lgbInit(user) {
  lgbCurrentUser = user;
  lgbShowMenu();
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
  const weeks = [...new Set(lgbRecords.map((r) => r.minggu))];
  lgbWeeksCache = weeks;
  document.getElementById("lgb-weeks-list").innerHTML = weeks.length
    ? weeks.map((w) => `<button class="lgb-list-item" onclick="lgbGoDates('${lgbEscape(w)}')">${lgbEscape(w)}</button>`).join("")
    : `<div class="empty-state">Belum ada laporan lagi.</div>`;
}
function lgbGoDates(minggu) {
  lgbMinggu = minggu;
  lgbShowScreen("dates");
  const dates = lgbRecords.filter((r) => r.minggu === minggu).map((r) => r.tarikh);
  document.getElementById("lgb-dates-subtitle").textContent = minggu;
  document.getElementById("lgb-dates-list").innerHTML = dates.length
    ? dates.map((d) => `<button class="lgb-list-item" onclick="lgbOpenSectionView('${lgbEscape(d)}',0)">${lgbEscape(d)}</button>`).join("")
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
  btn.disabled = false; btn.textContent = "Simpan & Mula";

  if (!ok) {
    errEl.textContent = "Gagal simpan. Cuba lagi.";
    errEl.classList.remove("hidden");
    return;
  }
  lgbMinggu = minggu;
  lgbTarikh = tarikh;
  await lgbFetchRecords();
  lgbOpenSectionView(tarikh, 0);
}

/* ================= SECTION VIEW — hub utama (macam reviewSectionPage) ================= */
function lgbLoadCurrentRow() {
  lgbCurrentRow = lgbRecords.find((r) => String(r.minggu).trim() === lgbMinggu && String(r.tarikh).trim() === lgbTarikh) || null;
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
  document.getElementById("lgb-view-tarikh").textContent = lgbTarikh;
  document.getElementById("lgb-view-penyemak").textContent = r.penyemak || "-";
  document.getElementById("lgb-view-ulasan").textContent = r.catatanSemakan || "-";
  document.getElementById("lgb-view-secname").textContent = sec.title;

  const fieldsHtml = sec.fields.map((f) => {
    const val = r[f.key] || "-";
    return `<div class="lgb-view-row"><span class="lgb-view-label">${lgbEscape(f.label)}</span><span class="lgb-view-val">${lgbEscape(val)}</span></div>`;
  }).join("");
  const imgUrl = sec.gambarField ? r[sec.gambarField] : "";
  const imgHtml = imgUrl ? `<div class="lgb-view-img-wrap"><img src="${lgbEscape(imgUrl)}" onclick="openImageLightbox('${lgbEscape(imgUrl)}')"></div>` : "";
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
    const existingUrl = r[sec.gambarField];
    imgHtml = `
      <label class="lgb-field-label" style="margin-top:14px">Lampiran Gambar (pilihan)</label>
      <div class="lgb-img-slot" id="lgb-img-slot" onclick="document.getElementById('lgb-img-input').click()">
        ${existingUrl ? `<img id="lgb-img-preview" src="${lgbEscape(existingUrl)}">` : `<div class="lgb-img-empty">📷<br>Ketik untuk pilih gambar</div>`}
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

  const ok = await lgbSaveSection(sec.key, values, lgbPendingImage, lgbMinggu, lgbTarikh);
  btn.disabled = false; btn.textContent = "Simpan";

  if (!ok) {
    errEl.textContent = "Gagal simpan. Cuba lagi.";
    errEl.classList.remove("hidden");
    return;
  }
  await lgbFetchRecords();
  lgbLoadCurrentRow();
  lgbRenderSectionView();
  lgbShowScreen("view");
}
function lgbCancelEdit() {
  lgbShowScreen("view");
}

/** Fungsi simpan generik — SATU seksyen sahaja setiap panggilan. */
async function lgbSaveSection(sectionKey, values, gambarBase64, minggu, tarikh) {
  if (!apiConfigured()) return false;
  try {
    const payload = { action: "saveLaporanGuruBertugasSection", email: lgbCurrentUser.email, sectionKey, values, minggu, tarikh };
    if (gambarBase64) payload.gambar = gambarBase64;
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    return !!data.success;
  } catch (e) {
    return false;
  }
}

/* ================= Semak Laporan Ini — Pilih Penyemak -> Ulasan ================= */
async function lgbOpenSemak() {
  if (!lgbPenyemakNames.length) await lgbFetchPenyemakList();
  document.getElementById("lgb-penyemak-list").innerHTML = lgbPenyemakNames.length
    ? lgbPenyemakNames.map((n) => `<button class="lgb-list-item" onclick="lgbSelectPenyemak('${lgbEscape(n)}')">👤 ${lgbEscape(n)}</button>`).join("")
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

/* ================= Cetak / PDF ================= */
function lgbPrintReport() {
  window.print();
}

/* ================= Fetch: DATABOT (gviz, data mula baris 3) ================= */
async function lgbFetchRecords() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${LGB_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(LGB_READ_SHEET_NAME)}&_ts=${Date.now()}`;
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
    const allRows = table.rows || [];
    lgbRecords = allRows.slice(2).map((r) => { // langkau baris 1 & 2 (konvensyen bot: data mula baris 3)
      const c = r.c || [];
      const get = (i) => (c[i] && c[i].v != null ? c[i].v : "");
      return {
        minggu: get(0), tarikh: gvizDateToIso(get(1)) || String(get(1)), namaPelapor: get(2), namaGuruBertugas: get(3),
        kehadiranGuru: get(4), namaGuruTidakHadir: get(5), kehadiranAkp: get(6), namaAkpTidakHadir: get(7),
        laporanBlokA: get(8), tindakanBlokA: get(9), laporanBlokB: get(10), tindakanBlokB: get(11),
        laporanBlokC: get(12), tindakanBlokC: get(13), laporanBlokKantin: get(14), tindakanBlokKantin: get(15),
        laporanKeselamatan: get(16), tindakanKeselamatan: get(17), peristiwaProgram: get(18), tindakanPeristiwa: get(19),
        gambarBlokA: get(20), gambarBlokB: get(21), gambarBlokC: get(22), gambarBlokKantin: get(23), gambarKeselamatan: get(24),
      };
    }).filter((r) => r.minggu && r.tarikh);

    await lgbFetchSemakan();
  } catch (e) {
    lgbRecords = [];
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
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "saveLaporanGuruBertugasSemakan", minggu, tarikh, pelapor, penyemak, catatan }),
    });
    const data = await res.json();
    return !!data.success;
  } catch (e) {
    return false;
  }
}

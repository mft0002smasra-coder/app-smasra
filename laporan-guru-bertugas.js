/* ============================================================
   LAPORAN GURU BERTUGAS — ikut aliran bot rujukan:
   1) Isi Minggu+Tarikh+Pelapor -> SIMPAN (cipta/cari baris)
   2) Masuk MOD PEMILIH SEKSYEN -> pilih seksyen -> isi -> SIMPAN seksyen tu
      sahaja -> balik ke pemilih (boleh ulang, mana-mana susunan)
   3) Sheet SAMA dipakai untuk simpan (Code.gs) & baca (gviz).
   ============================================================ */

const LGB_SPREADSHEET_ID = "1cmYZlMRGXZB4LmrCowJcmfnbY4LiKhuvE9FIoamWl2s"; // Spreadsheet SEBENAR bot
const LGB_SHEET_NAME = "DATABOT";

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
// Semua seksyen (termasuk "butiran" — langkah 1) untuk paparan laporan penuh
const LGB_ALL_SECTIONS = [
  { key: "butiran", title: "Butiran Laporan", fields: [
    { key: "namaPelapor", label: "Nama Pelapor", type: "text" },
    { key: "namaGuruBertugas", label: "Nama-Nama Guru Bertugas", type: "textarea" },
  ] },
  ...LGB_SECTIONS,
];

let lgbCurrentUser = null;
let lgbMinggu = "";
let lgbTarikh = "";
let lgbCurrentRow = null;   // rekod semasa (dari gviz) — untuk pre-fill semasa edit seksyen
let lgbEditingSection = null;
let lgbPendingImage = null;
let lgbRecords = [];

function lgbEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/* ================= Navigasi tab utama ================= */
function lgbSwitchTab(name) {
  document.getElementById("lgb-panel-borang").classList.toggle("hidden", name !== "borang");
  document.getElementById("lgb-panel-senarai").classList.toggle("hidden", name !== "senarai");
  document.getElementById("lgb-nav-borang").classList.toggle("active", name === "borang");
  document.getElementById("lgb-nav-senarai").classList.toggle("active", name === "senarai");
  if (name === "senarai") lgbLoadSenarai();
  if (name === "borang") lgbShowStart();
}

/* ================= Skrin 1: Mula (Minggu/Tarikh/Pelapor) ================= */
function lgbShowStart() {
  document.getElementById("lgb-screen-start").classList.remove("hidden");
  document.getElementById("lgb-screen-picker").classList.add("hidden");
  document.getElementById("lgb-screen-section").classList.add("hidden");

  const today = new Date();
  const todayIsoStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  document.getElementById("lgb-start-minggu").value = lgbMinggu || "";
  document.getElementById("lgb-start-tarikh").value = lgbTarikh || todayIsoStr;
  document.getElementById("lgb-start-pelapor").value = (lgbCurrentUser && lgbCurrentUser.nama) || "";
  document.getElementById("lgb-start-guru").value = "";
  document.getElementById("lgb-start-error").classList.add("hidden");
}

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
  await lgbLoadCurrentRow();
  lgbShowPicker();
}

/* ================= Skrin 2: Pemilih Seksyen (mod edit) ================= */
async function lgbLoadCurrentRow() {
  await lgbFetchRecords();
  lgbCurrentRow = lgbRecords.find((r) => String(r.minggu).trim() === lgbMinggu && String(r.tarikh).trim() === lgbTarikh) || null;
}

function lgbShowPicker() {
  document.getElementById("lgb-screen-start").classList.add("hidden");
  document.getElementById("lgb-screen-picker").classList.remove("hidden");
  document.getElementById("lgb-screen-section").classList.add("hidden");

  document.getElementById("lgb-picker-subtitle").textContent = `${lgbMinggu} — ${lgbTarikh}`;

  const listEl = document.getElementById("lgb-picker-list");
  listEl.innerHTML = LGB_SECTIONS.map((sec) => {
    const filled = lgbCurrentRow && sec.fields.some((f) => lgbCurrentRow[f.key]);
    return `
      <button class="lgb-picker-item" onclick="lgbOpenSection('${sec.key}')">
        <span class="lgb-picker-item-title">${lgbEscape(sec.title)}</span>
        <span class="lgb-picker-item-status ${filled ? "done" : ""}">${filled ? "✓ Ada Data" : "Belum Diisi"}</span>
      </button>`;
  }).join("");
}

function lgbBackToStart() {
  lgbMinggu = ""; lgbTarikh = ""; lgbCurrentRow = null;
  lgbShowStart();
}

/* ================= Skrin 3: Borang Seksyen ================= */
function lgbOpenSection(sectionKey) {
  const sec = LGB_SECTIONS.find((s) => s.key === sectionKey);
  if (!sec) return;
  lgbEditingSection = sec;
  lgbPendingImage = null;

  document.getElementById("lgb-screen-picker").classList.add("hidden");
  document.getElementById("lgb-screen-section").classList.remove("hidden");
  document.getElementById("lgb-section-title").textContent = sec.title;

  const fieldsHtml = sec.fields.map((f) => {
    const val = (lgbCurrentRow && lgbCurrentRow[f.key]) || "";
    if (f.type === "textarea") {
      return `<label class="lgb-field-label">${lgbEscape(f.label)}</label><textarea class="lgb-field" id="lgb-f-${f.key}">${lgbEscape(val)}</textarea>`;
    }
    return `<label class="lgb-field-label">${lgbEscape(f.label)}</label><input class="lgb-field" type="text" id="lgb-f-${f.key}" value="${lgbEscape(val)}">`;
  }).join("");

  let imgHtml = "";
  if (sec.gambarField) {
    const existingUrl = lgbCurrentRow && lgbCurrentRow[sec.gambarField];
    imgHtml = `
      <label class="lgb-field-label" style="margin-top:14px">Lampiran Gambar (pilihan)</label>
      <div class="lgb-img-slot" id="lgb-img-slot" onclick="document.getElementById('lgb-img-input').click()">
        ${existingUrl ? `<img id="lgb-img-preview" src="${lgbEscape(existingUrl)}">` : `<div class="lgb-img-empty" id="lgb-img-empty">📷<br>Ketik untuk pilih gambar</div>`}
      </div>
      <input type="file" id="lgb-img-input" accept="image/*" class="hidden" onchange="lgbHandleImagePick(this)">
    `;
  }

  document.getElementById("lgb-section-fields").innerHTML = fieldsHtml + imgHtml;
  document.getElementById("lgb-section-error").classList.add("hidden");
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
      const slot = document.getElementById("lgb-img-slot");
      slot.innerHTML = `<img id="lgb-img-preview" src="${lgbPendingImage}">`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function lgbSaveCurrentSection() {
  const sec = lgbEditingSection;
  const values = sec.fields.map((f) => document.getElementById(`lgb-f-${f.key}`).value.trim());
  const errEl = document.getElementById("lgb-section-error");
  const btn = document.getElementById("lgb-section-save-btn");
  btn.disabled = true; btn.textContent = "Menyimpan...";

  const ok = await lgbSaveSection(sec.key, values, lgbPendingImage, lgbMinggu, lgbTarikh);
  btn.disabled = false; btn.textContent = "Simpan Seksyen";

  if (!ok) {
    errEl.textContent = "Gagal simpan. Cuba lagi.";
    errEl.classList.remove("hidden");
    return;
  }
  await lgbLoadCurrentRow();
  lgbShowPicker();
}
function lgbCancelSection() {
  lgbShowPicker();
}

/** Fungsi simpan generik — dipanggil setiap kali SATU seksyen selesai
 * (bukan hantar semua borang sekali gus). */
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

/* ================= Senarai Laporan (gviz — SAMA sheet dgn simpan) ================= */
async function lgbFetchRecords() {
  try {
    // TIADA "headers=" param — kod kita sendiri langkau 2 baris pertama secara
    // eksplisit, sebab data bot SEBENAR bermula pada BARIS 3 (bukan 2).
    const url = `https://docs.google.com/spreadsheets/d/${LGB_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(LGB_SHEET_NAME)}&_ts=${Date.now()}`;
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
    lgbRecords = allRows.slice(2).map((r) => { // langkau baris 1 & 2
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
    lgbRecords.reverse(); // terbaru dahulu

    await lgbFetchSemakan();
  } catch (e) {
    lgbRecords = [];
  }
}

/** DATA SEMAKAN: Minggu, Tarikh, Nama Pelapor, Penyemak, Catatan — cantum
 * ke rekod DATABOT yang padan (Minggu+Tarikh), rekod TERAKHIR menang kalau berbilang. */
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
      semakByKey[key] = { penyemak: get(3) || "", catatan: get(4) || "" }; // rekod TERAKHIR menang (timpa)
    });
    lgbRecords.forEach((r) => {
      const info = semakByKey[`${r.minggu}|${r.tarikh}`];
      r.penyemak = info ? info.penyemak : "";
      r.catatanSemakan = info ? info.catatan : "";
    });
  } catch (e) { /* tak kritikal — biar penyemak/catatan kosong */ }
}

async function lgbLoadSenarai() {
  document.getElementById("lgb-senarai-list").innerHTML = `<div class="empty-state">Memuatkan...</div>`;
  await lgbFetchRecords();
  lgbRenderSenarai();
}

function lgbRenderSenarai() {
  const box = document.getElementById("lgb-senarai-list");
  if (!lgbRecords.length) {
    box.innerHTML = `<div class="empty-state">Belum ada laporan lagi.</div>`;
    return;
  }
  box.innerHTML = lgbRecords.map((r, i) => `
    <div class="lgb-report-card" onclick="lgbOpenReport(${i})">
      <div class="lgb-report-top">
        <span class="lgb-report-minggu">${lgbEscape(r.minggu)}</span>
        <span class="lgb-report-tarikh">${lgbEscape(r.tarikh)}</span>
      </div>
      <div class="lgb-report-pelapor">${lgbEscape(r.namaPelapor)}</div>
      <button class="lgb-report-edit" onclick="event.stopPropagation();lgbResumeEdit(${i})">Sambung Edit</button>
    </div>`).join("");
}

function lgbResumeEdit(idx) {
  const r = lgbRecords[idx];
  lgbMinggu = r.minggu; lgbTarikh = r.tarikh; lgbCurrentRow = r;
  lgbSwitchTab("borang");
  lgbShowPicker();
}

function lgbOpenReport(idx) {
  const r = lgbRecords[idx];
  const semakHtml = `
    <div class="lgb-semakan-box">
      <div class="lgb-view-row"><span class="lgb-view-label">Penyemak</span><span class="lgb-view-val">${lgbEscape(r.penyemak || "-")}</span></div>
      <div class="lgb-view-row"><span class="lgb-view-label">Catatan / Ulasan</span><span class="lgb-view-val">${lgbEscape(r.catatanSemakan || "-")}</span></div>
    </div>`;
  const sectionsHtml = LGB_ALL_SECTIONS.map((sec) => {
    const fieldsHtml = sec.fields.map((f) => `<div class="lgb-view-row"><span class="lgb-view-label">${lgbEscape(f.label)}</span><span class="lgb-view-val">${lgbEscape(r[f.key] || "-")}</span></div>`).join("");
    const imgUrl = sec.gambarField ? r[sec.gambarField] : "";
    const imgHtml = imgUrl ? `<div class="lgb-view-img-wrap"><img src="${lgbEscape(imgUrl)}" onclick="openImageLightbox('${lgbEscape(imgUrl)}')"></div>` : "";
    return `<div class="lgb-view-section"><div class="lgb-view-section-title">${lgbEscape(sec.title)}</div>${fieldsHtml}${imgHtml}</div>`;
  }).join("");
  document.getElementById("lgb-view-title").textContent = `${r.minggu} — ${r.tarikh}`;
  document.getElementById("lgb-view-body").innerHTML = semakHtml + sectionsHtml;
  document.getElementById("lgb-view-overlay").classList.remove("hidden");
}
function lgbCloseReport() {
  document.getElementById("lgb-view-overlay").classList.add("hidden");
}

/* ================= Init ================= */
function lgbInit(user) {
  lgbCurrentUser = user;
  lgbShowStart();
}

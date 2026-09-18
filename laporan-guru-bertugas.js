/* ============================================================
   LAPORAN GURU BERTUGAS — Borang berperingkat (ikut aliran bot rujukan)
   Pengecam awalan "lgb" (Laporan Guru Bertugas).
   ============================================================ */

const LGB_SPREADSHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";

/**
 * Struktur seksyen — SAMA ikut Data2 bot rujukan. Setiap "field" key
 * sepadan terus dengan kunci yang dihantar ke Code.gs (addLaporanGuruBertugas).
 */
const LGB_STEPS = [
  {
    key: "butiran", title: "Butiran Laporan", icon: "clipboard",
    fields: [
      { key: "minggu", label: "Minggu", type: "text", placeholder: "Cth: Minggu 3" },
      { key: "tarikh", label: "Tarikh", type: "date" },
      { key: "namaPelapor", label: "Nama Pelapor", type: "text" },
      { key: "namaGuruBertugas", label: "Nama-Nama Guru Bertugas", type: "textarea" },
    ],
  },
  {
    key: "kehadiran", title: "Kehadiran", icon: "calendar",
    fields: [
      { key: "kehadiranGuru", label: "Kehadiran Guru", type: "text" },
      { key: "namaGuruTidakHadir", label: "Nama Guru Tidak Hadir", type: "textarea" },
      { key: "kehadiranAkp", label: "Kehadiran AKP", type: "text" },
      { key: "namaAkpTidakHadir", label: "Nama AKP Tidak Hadir", type: "textarea" },
    ],
  },
  {
    key: "blokA", title: "Blok A", icon: "door",
    fields: [
      { key: "laporanBlokA", label: "Laporan Tempat Bertugas Blok A", type: "textarea" },
      { key: "tindakanBlokA", label: "Tindakan", type: "textarea" },
    ],
    gambarKey: "gambarBlokA",
  },
  {
    key: "blokB", title: "Blok B", icon: "door",
    fields: [
      { key: "laporanBlokB", label: "Laporan Tempat Bertugas Blok B", type: "textarea" },
      { key: "tindakanBlokB", label: "Tindakan", type: "textarea" },
    ],
    gambarKey: "gambarBlokB",
  },
  {
    key: "blokC", title: "Blok C", icon: "door",
    fields: [
      { key: "laporanBlokC", label: "Laporan Tempat Bertugas Blok C", type: "textarea" },
      { key: "tindakanBlokC", label: "Tindakan", type: "textarea" },
    ],
    gambarKey: "gambarBlokC",
  },
  {
    key: "blokKantin", title: "Blok Kantin", icon: "door",
    fields: [
      { key: "laporanBlokKantin", label: "Laporan Tempat Bertugas Blok Kantin", type: "textarea" },
      { key: "tindakanBlokKantin", label: "Tindakan", type: "textarea" },
    ],
    gambarKey: "gambarBlokKantin",
  },
  {
    key: "keselamatan", title: "Keselamatan & Peristiwa", icon: "folder",
    fields: [
      { key: "laporanKeselamatan", label: "Laporan Keselamatan", type: "textarea" },
      { key: "tindakanKeselamatan", label: "Tindakan Bagi Laporan Keselamatan", type: "textarea" },
      { key: "peristiwaProgram", label: "Peristiwa / Program", type: "textarea" },
      { key: "tindakanPeristiwa", label: "Tindakan", type: "textarea" },
    ],
    gambarKey: "gambarKeselamatan",
  },
];

let lgbCurrentUser = null;
let lgbStepIndex = 0;
let lgbFormData = {};
let lgbImageData = {}; // { gambarBlokA: base64, ... }
let lgbRecords = [];

function lgbEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/* ================= Navigasi tab utama ================= */
function lgbSwitchTab(name) {
  document.getElementById("lgb-panel-borang").classList.toggle("hidden", name !== "borang");
  document.getElementById("lgb-panel-senarai").classList.toggle("hidden", name !== "senarai");
  document.getElementById("lgb-nav-borang").classList.toggle("active", name === "borang");
  document.getElementById("lgb-nav-senarai").classList.toggle("active", name === "senarai");
  if (name === "senarai") lgbLoadSenarai();
}

/* ================= Borang berperingkat (wizard) ================= */
function lgbInitForm() {
  lgbStepIndex = 0;
  lgbFormData = {};
  lgbImageData = {};
  const today = new Date();
  lgbFormData.tarikh = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  lgbFormData.namaPelapor = (lgbCurrentUser && lgbCurrentUser.nama) || "";
  lgbRenderStep();
}

function lgbRenderStep() {
  const step = LGB_STEPS[lgbStepIndex];
  document.getElementById("lgb-step-title").textContent = step.title;
  document.getElementById("lgb-step-progress").textContent = `Langkah ${lgbStepIndex + 1} / ${LGB_STEPS.length}`;
  document.getElementById("lgb-step-dots").innerHTML = LGB_STEPS.map((_, i) =>
    `<span class="lgb-step-dot${i === lgbStepIndex ? " active" : ""}${i < lgbStepIndex ? " done" : ""}"></span>`).join("");

  const fieldsHtml = step.fields.map((f) => {
    const val = lgbFormData[f.key] || "";
    if (f.type === "textarea") {
      return `<label class="lgb-field-label">${lgbEscape(f.label)}</label><textarea class="lgb-field" data-key="${f.key}" oninput="lgbFormData['${f.key}']=this.value">${lgbEscape(val)}</textarea>`;
    }
    return `<label class="lgb-field-label">${lgbEscape(f.label)}</label><input class="lgb-field" type="${f.type}" data-key="${f.key}" value="${lgbEscape(val)}" placeholder="${lgbEscape(f.placeholder || "")}" oninput="lgbFormData['${f.key}']=this.value">`;
  }).join("");

  let imgHtml = "";
  if (step.gambarKey) {
    const preview = lgbImageData[step.gambarKey];
    imgHtml = `
      <label class="lgb-field-label" style="margin-top:14px">Lampiran Gambar (pilihan)</label>
      <div class="lgb-img-slot" onclick="document.getElementById('lgb-img-input').click()">
        ${preview ? `<img src="${preview}" alt="Pratonton">` : `<div class="lgb-img-empty">📷<br>Ketik untuk pilih gambar</div>`}
        ${preview ? `<div class="lgb-img-remove" onclick="event.stopPropagation();lgbRemoveImage()">✕</div>` : ""}
      </div>
      <input type="file" id="lgb-img-input" accept="image/*" class="hidden" onchange="lgbHandleImagePick(this,'${step.gambarKey}')">
    `;
  }

  document.getElementById("lgb-step-fields").innerHTML = fieldsHtml + imgHtml;
  document.getElementById("lgb-btn-prev").classList.toggle("hidden", lgbStepIndex === 0);
  document.getElementById("lgb-btn-next").classList.toggle("hidden", lgbStepIndex === LGB_STEPS.length - 1);
  document.getElementById("lgb-btn-submit").classList.toggle("hidden", lgbStepIndex !== LGB_STEPS.length - 1);
  document.getElementById("lgb-form-error").classList.add("hidden");
}

function lgbNextStep() {
  if (lgbStepIndex < LGB_STEPS.length - 1) { lgbStepIndex++; lgbRenderStep(); }
}
function lgbPrevStep() {
  if (lgbStepIndex > 0) { lgbStepIndex--; lgbRenderStep(); }
}

function lgbHandleImagePick(input, gambarKey) {
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
      lgbImageData[gambarKey] = canvas.toDataURL("image/jpeg", 0.75);
      lgbRenderStep();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function lgbRemoveImage() {
  const step = LGB_STEPS[lgbStepIndex];
  delete lgbImageData[step.gambarKey];
  lgbRenderStep();
}

async function lgbSubmit() {
  const errEl = document.getElementById("lgb-form-error");
  errEl.classList.add("hidden");
  if (!lgbFormData.minggu || !lgbFormData.tarikh || !lgbFormData.namaPelapor) {
    errEl.textContent = "Sila lengkapkan Minggu, Tarikh, dan Nama Pelapor (Langkah 1).";
    errEl.classList.remove("hidden");
    lgbStepIndex = 0; lgbRenderStep();
    return;
  }
  if (!apiConfigured()) { errEl.textContent = "API belum disambungkan."; errEl.classList.remove("hidden"); return; }

  const btn = document.getElementById("lgb-btn-submit");
  btn.disabled = true; btn.textContent = "Menghantar...";
  try {
    const payload = Object.assign({}, lgbFormData, lgbImageData, { email: lgbCurrentUser.email });
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(Object.assign({ action: "addLaporanGuruBertugas" }, payload)) });
    const data = await res.json();
    if (data.success) {
      document.getElementById("lgb-success-overlay").classList.remove("hidden");
      lgbInitForm();
    } else {
      errEl.textContent = data.message || "Gagal hantar laporan.";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "Ralat sambungan ke server (" + err.message + ").";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false; btn.textContent = "Hantar Laporan";
}
function lgbCloseSuccess() {
  document.getElementById("lgb-success-overlay").classList.add("hidden");
}

/* ================= Senarai Laporan (gviz terus) ================= */
async function lgbFetchRecords() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${LGB_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("LaporanGuruBertugas")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;
    const gvizDateToIso = (v) => {
      if (!v) return "";
      const m = String(v).match(/Date\((\d+),(\d+),(\d+)/);
      if (!m) return String(v).trim();
      const y = parseInt(m[1]), mo = parseInt(m[2]) + 1, d = parseInt(m[3]);
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    lgbRecords = (table.rows || []).map((r) => {
      const c = r.c || [];
      const get = (i) => (c[i] && c[i].v != null ? c[i].v : "");
      return {
        minggu: get(0), tarikh: gvizDateToIso(get(1)) || String(get(1)), namaPelapor: get(2), namaGuruBertugas: get(3),
        kehadiranGuru: get(4), namaGuruTidakHadir: get(5), kehadiranAkp: get(6), namaAkpTidakHadir: get(7),
        laporanBlokA: get(8), tindakanBlokA: get(9), laporanBlokB: get(10), tindakanBlokB: get(11),
        laporanBlokC: get(12), tindakanBlokC: get(13), laporanBlokKantin: get(14), tindakanBlokKantin: get(15),
        laporanKeselamatan: get(16), tindakanKeselamatan: get(17), peristiwaProgram: get(18), tindakanPeristiwa: get(19),
        gambarBlokA: get(20), gambarBlokB: get(21), gambarBlokC: get(22), gambarBlokKantin: get(23), gambarKeselamatan: get(24),
        dicatatOleh: get(25),
      };
    }).filter((r) => r.minggu && r.tarikh);
    lgbRecords.reverse(); // terbaru dahulu
  } catch (e) {
    lgbRecords = [];
  }
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
      <div class="lgb-report-pelapor">👤 ${lgbEscape(r.namaPelapor)}</div>
    </div>`).join("");
}

function lgbOpenReport(idx) {
  const r = lgbRecords[idx];
  const sectionsHtml = LGB_STEPS.map((step) => {
    const fieldsHtml = step.fields.map((f) => `<div class="lgb-view-row"><span class="lgb-view-label">${lgbEscape(f.label)}</span><span class="lgb-view-val">${lgbEscape(r[f.key] || "-")}</span></div>`).join("");
    const imgUrl = step.gambarKey ? r[step.gambarKey] : "";
    const imgHtml = imgUrl ? `<div class="lgb-view-img-wrap"><img src="${lgbEscape(imgUrl)}" alt="Lampiran" onclick="openImageLightbox('${lgbEscape(imgUrl)}')"></div>` : "";
    return `<div class="lgb-view-section"><div class="lgb-view-section-title">${lgbEscape(step.title)}</div>${fieldsHtml}${imgHtml}</div>`;
  }).join("");
  document.getElementById("lgb-view-title").textContent = `${r.minggu} — ${r.tarikh}`;
  document.getElementById("lgb-view-body").innerHTML = sectionsHtml;
  document.getElementById("lgb-view-overlay").classList.remove("hidden");
}
function lgbCloseReport() {
  document.getElementById("lgb-view-overlay").classList.add("hidden");
}

/* ================= Init ================= */
function lgbInit(user) {
  lgbCurrentUser = user;
  lgbInitForm();
}

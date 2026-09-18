/* ============================================================
   KEBERADAAN MURID — Senarai & Borang
   Pengecam awalan "kb" (Keberadaan).
   ============================================================ */

const KB_SPREADSHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";
const KB_KATEGORI_LIST = ["Program", "Kesihatan", "Peperiksaan", "Lain-Lain"];

let kbCurrentUser = null;
let kbAllStudents = [];   // dari tab DatabaseMurid — untuk pilihan Tingkatan/Nama
let kbRecords = [];       // dari tab KeberadaanMurid
let kbTingkatanList = []; // senarai unik Tingkatan/Kelas dari DatabaseMurid

function kbEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function kbNorm(str) { return String(str || "").trim().toUpperCase().replace(/\s+/g, " "); }

/* ---------------- Fetch data murid (untuk borang) ---------------- */
async function kbFetchStudents() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${KB_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("DatabaseMurid")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;
    const cols = table.cols || [];
    let namaIdx = -1, kelasIdx = -1;
    cols.forEach((c, i) => {
      const label = kbNorm(c.label || "");
      if (label === "NAMA") namaIdx = i;
      if (label === "KELAS") kelasIdx = i;
    });
    kbAllStudents = (table.rows || []).map((r) => {
      const c = r.c || [];
      return {
        nama: namaIdx !== -1 && c[namaIdx] ? String(c[namaIdx].v || "") : "",
        kelas: kelasIdx !== -1 && c[kelasIdx] ? String(c[kelasIdx].v || "") : "",
      };
    }).filter((s) => s.nama && s.kelas);

    const tingkatanSet = new Set(kbAllStudents.map((s) => s.kelas));
    kbTingkatanList = Array.from(tingkatanSet).sort();
  } catch (e) {
    kbAllStudents = [];
    kbTingkatanList = [];
  }
}

/* ---------------- Fetch rekod keberadaan (untuk senarai) — gviz terus ---------------- */
async function kbFetchRecords() {
  try {
    const { rows } = await gvizFetch(KB_SPREADSHEET_ID, "KeberadaanMurid");
    const gvizDateToIso = (v) => {
      if (!v) return "";
      const m = String(v).match(/Date\((\d+),(\d+),(\d+)/);
      if (!m) return String(v).slice(0, 10);
      // Bina string TERUS dari komponen y/m/d — JANGAN guna new Date().toISOString()
      // sebab ia tukar ke UTC dan sebabkan tarikh tersasar 1 hari (GMT+8).
      const y = parseInt(m[1]), mo = parseInt(m[2]) + 1, d = parseInt(m[3]);
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    kbRecords = rows.map((r, i) => {
      const c = r.c || [];
      const get = (idx) => (c[idx] && c[idx].v != null ? c[idx].v : "");
      const tarikh = gvizDateToIso(get(2));
      const nama = get(5);
      if (!tarikh || !nama) return null; // perlu tarikh + nama murid
      return {
        rowId: i + 2, // baris data gviz sepadan terus dgn baris Sheet sebenar (header=baris1)
        tarikh, kategori: get(3) || "", tingkatan: get(4) || "", nama,
        tempat: get(6) || "", catatan: get(7) || "", dicatatOleh: get(8) || "",
      };
    }).filter(Boolean);
  } catch (e) {
    kbRecords = [];
  }
}

/* ---------------- Kad Home: Keberadaan Murid (hari ini sahaja, bersyarat) ---------------- */
async function kbRenderHomeCard() {
  const pageEl = document.getElementById("home-kb-page");
  if (!pageEl) return;
  if (!kbRecords.length) await kbFetchRecords();

  const todayStr = todayIso();
  const todayItems = kbRecords.filter((r) => r.tarikh === todayStr);

  if (!todayItems.length) {
    pageEl.remove(); // tiada data hari ini — buang terus kad ni dari swipe
    return;
  }

  const dateEl = document.getElementById("home-kb-date");
  if (dateEl) {
    const today = new Date();
    const hariNames = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
    dateEl.textContent = `${hariNames[today.getDay()]}, ${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
  }

  const groups = {};
  todayItems.forEach((r) => { if (!groups[r.kategori]) groups[r.kategori] = []; groups[r.kategori].push(r); });

  const listEl = document.getElementById("home-kb-list");
  listEl.innerHTML = Object.keys(groups).map((kategori) => `
    <div class="home-kb-group">
      <div class="home-kb-group-title">${kbEscape(kategori)} <span class="home-kb-count">${groups[kategori].length}</span></div>
      ${groups[kategori].map((r) => `
        <div class="home-kb-row">
          <div class="home-kb-row-top">
            <span class="home-kb-nama">${kbEscape(r.nama)}</span>
            <span class="home-kb-kelas">${kbEscape(r.tingkatan)}</span>
          </div>
          <div class="home-kb-tempat">📍 ${kbEscape(r.tempat || "-")}</div>
          ${r.catatan ? `<div class="home-kb-catatan">📝 ${kbEscape(r.catatan)}</div>` : ""}
        </div>`).join("")}
    </div>`).join("");
}

/* ================= Navigasi tab ================= */
function kbSwitchTab(name) {
  document.getElementById("kb-panel-senarai").classList.toggle("hidden", name !== "senarai");
  document.getElementById("kb-panel-borang").classList.toggle("hidden", name !== "borang");
  document.getElementById("kb-nav-senarai").classList.toggle("active", name === "senarai");
  document.getElementById("kb-nav-borang").classList.toggle("active", name === "borang");
  if (name === "senarai") kbLoadSenarai();
}

/* ================= Senarai Keberadaan Murid ================= */
function kbInitSenariaFilters() {
  const yearSel = document.getElementById("kb-filter-year");
  if (yearSel.dataset.built) return;
  const today = new Date();
  const yearsInData = new Set(kbRecords.map((r) => (r.tarikh || "").slice(0, 4)).filter(Boolean));
  yearsInData.add(String(today.getFullYear()));
  const years = Array.from(yearsInData).sort((a, b) => b - a);
  yearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
  yearSel.value = String(today.getFullYear());
  yearSel.dataset.built = "1";

  document.getElementById("kb-filter-date").value = todayIso();

  yearSel.addEventListener("change", kbRenderSenarai);
  document.getElementById("kb-filter-date").addEventListener("change", kbRenderSenarai);
}

async function kbLoadSenarai() {
  document.getElementById("kb-senarai-list").innerHTML = `<div class="kb-empty">Memuatkan...</div>`;
  await kbFetchRecords();
  kbInitSenariaFilters();
  kbRenderSenarai();
}

function kbRenderSenarai() {
  const dateStr = document.getElementById("kb-filter-date").value;
  if (!dateStr) return;
  const filtered = kbRecords.filter((r) => r.tarikh === dateStr);

  const groups = {};
  KB_KATEGORI_LIST.forEach((k) => { groups[k] = []; });
  filtered.forEach((r) => {
    if (!groups[r.kategori]) groups[r.kategori] = [];
    groups[r.kategori].push(r);
  });

  const box = document.getElementById("kb-senarai-list");
  const nonEmpty = Object.keys(groups).filter((k) => groups[k].length);
  if (!nonEmpty.length) {
    box.innerHTML = `<div class="kb-empty">Tiada rekod keberadaan murid untuk tarikh ini.</div>`;
    return;
  }

  box.innerHTML = nonEmpty.map((kategori) => {
    const rows = groups[kategori].map((r) => {
      const catatan = r.catatan || "";
      const displayText = catatan ? kbEscape(catatan) : "Tiada catatan";
      const emptyClass = catatan ? "" : " kb-catatan-empty";
      return `
      <div class="kb-row">
        <div class="kb-row-main">
          <div class="kb-row-nama">${kbEscape(r.nama)}</div>
          <div class="kb-row-kelas">${kbEscape(r.tingkatan)}</div>
        </div>
        <div class="kb-row-tempat">📍 ${kbEscape(r.tempat || "-")}</div>
        <div class="kb-catatan-row" id="kb-catatan-row-${r.rowId}">
          <div class="kb-catatan-display${emptyClass}" id="kb-catatan-display-${r.rowId}">${displayText}</div>
          <button class="kb-update-btn" onclick="kbToggleEdit(${r.rowId})">Kemaskini</button>
        </div>
      </div>`;
    }).join("");
    return `<div class="kb-kategori-card">
      <div class="kb-kategori-title">${kbEscape(kategori)} <span class="kb-kategori-count">${groups[kategori].length}</span></div>
      ${rows}
    </div>`;
  }).join("");
}

function kbToggleEdit(rowId) {
  const wrap = document.getElementById(`kb-catatan-row-${rowId}`);
  const rec = kbRecords.find((r) => r.rowId === rowId);
  const currentVal = rec ? (rec.catatan || "") : "";
  wrap.innerHTML = `
    <input type="text" class="kb-catatan-input" id="kb-catatan-input-${rowId}" value="${kbEscape(currentVal)}" placeholder="Catatan / kemaskini...">
    <button class="kb-save-btn" onclick="kbSaveCatatan(${rowId})">Simpan</button>
  `;
  document.getElementById(`kb-catatan-input-${rowId}`).focus();
}

async function kbSaveCatatan(rowId) {
  const input = document.getElementById(`kb-catatan-input-${rowId}`);
  const catatan = input.value.trim();
  if (!apiConfigured()) { alert("API belum disambungkan."); return; }
  const btn = input.nextElementSibling;
  btn.disabled = true; btn.textContent = "Menyimpan...";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "editKeberadaanCatatan", rowId, catatan }),
    });
    const data = await res.json();
    if (data.success) {
      const rec = kbRecords.find((r) => r.rowId === rowId);
      if (rec) rec.catatan = catatan;
      kbRevertToDisplay(rowId, catatan);
      kbShowToast("✓ Catatan disimpan");
    } else {
      alert(data.message || "Gagal simpan catatan.");
      btn.disabled = false; btn.textContent = "Simpan";
    }
  } catch (err) {
    alert("Ralat sambungan ke server.");
    btn.disabled = false; btn.textContent = "Simpan";
  }
}

function kbRevertToDisplay(rowId, catatan) {
  const wrap = document.getElementById(`kb-catatan-row-${rowId}`);
  const displayText = catatan ? kbEscape(catatan) : "Tiada catatan";
  const emptyClass = catatan ? "" : " kb-catatan-empty";
  wrap.innerHTML = `
    <div class="kb-catatan-display${emptyClass}" id="kb-catatan-display-${rowId}">${displayText}</div>
    <button class="kb-update-btn" onclick="kbToggleEdit(${rowId})">Kemaskini</button>
  `;
}

function kbShowToast(msg) {
  let toast = document.getElementById("kb-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "kb-toast";
    toast.className = "kb-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(kbShowToast._t);
  kbShowToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ================= Borang Keberadaan ================= */
let kbStudentRowCount = 0;

function kbInitBorang() {
  document.getElementById("kb-f-tarikh").value = todayIso();
  document.getElementById("kb-f-tempat").value = "";
  document.getElementById("kb-f-kategori").value = "";
  document.getElementById("kb-student-rows").innerHTML = "";
  document.getElementById("kb-form-error").classList.add("hidden");
  kbStudentRowCount = 0;
  kbAddStudentRow();
  kbUpdateAddStudentBtn();
}

function kbUpdateAddStudentBtn() {
  const isProgram = document.getElementById("kb-f-kategori").value === "Program";
  document.getElementById("kb-add-student-btn").classList.toggle("hidden", !isProgram);
  // Kalau bukan Program, kekalkan cuma 1 baris murid
  if (!isProgram) {
    const rows = document.querySelectorAll(".kb-student-row");
    rows.forEach((r, i) => { if (i > 0) r.remove(); });
  }
}

function kbAddStudentRow() {
  kbStudentRowCount++;
  const id = kbStudentRowCount;
  const wrap = document.getElementById("kb-student-rows");
  const div = document.createElement("div");
  div.className = "kb-student-row";
  div.id = `kb-student-row-${id}`;
  div.innerHTML = `
    <div class="kb-student-row-head">
      <span>Murid ${id}</span>
      <button type="button" class="kb-remove-student-btn" onclick="kbRemoveStudentRow(${id})">✕</button>
    </div>
    <select class="kb-field kb-student-tingkatan" onchange="kbPopulateStudentNames(${id})">
      <option value="">Pilih Tingkatan</option>
      ${kbTingkatanList.map((t) => `<option value="${t}">${t}</option>`).join("")}
    </select>
    <select class="kb-field kb-student-nama"><option value="">Pilih Tingkatan dahulu</option></select>
  `;
  wrap.appendChild(div);
  kbUpdateRemoveButtons();
}
function kbRemoveStudentRow(id) {
  const el = document.getElementById(`kb-student-row-${id}`);
  if (el) el.remove();
  kbUpdateRemoveButtons();
}
function kbUpdateRemoveButtons() {
  const rows = document.querySelectorAll(".kb-student-row");
  rows.forEach((r) => {
    const btn = r.querySelector(".kb-remove-student-btn");
    if (btn) btn.classList.toggle("hidden", rows.length <= 1);
  });
}
function kbPopulateStudentNames(id) {
  const row = document.getElementById(`kb-student-row-${id}`);
  const tingkatan = row.querySelector(".kb-student-tingkatan").value;
  const namaSel = row.querySelector(".kb-student-nama");
  if (!tingkatan) { namaSel.innerHTML = `<option value="">Pilih Tingkatan dahulu</option>`; return; }
  const names = kbAllStudents.filter((s) => s.kelas === tingkatan).map((s) => s.nama).sort();
  namaSel.innerHTML = `<option value="">Pilih Murid</option>` + names.map((n) => `<option value="${n}">${n}</option>`).join("");
}

async function kbSubmitBorang() {
  const errBox = document.getElementById("kb-form-error");
  errBox.classList.add("hidden");

  const kategori = document.getElementById("kb-f-kategori").value;
  const tarikh = document.getElementById("kb-f-tarikh").value;
  const tempat = document.getElementById("kb-f-tempat").value.trim();

  const muridRows = Array.from(document.querySelectorAll(".kb-student-row")).map((row) => ({
    tingkatan: row.querySelector(".kb-student-tingkatan").value,
    nama: row.querySelector(".kb-student-nama").value,
  })).filter((m) => m.nama);

  if (!kategori || !tarikh || !muridRows.length) {
    errBox.textContent = "Sila lengkapkan kategori, tarikh, dan sekurang-kurangnya seorang murid.";
    errBox.classList.remove("hidden");
    return;
  }
  if (!apiConfigured()) {
    errBox.textContent = "API belum disambungkan.";
    errBox.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("kb-submit-btn");
  btn.disabled = true; btn.textContent = "Menghantar...";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "addKeberadaanMurid", email: kbCurrentUser.email, kategori, tarikh, tempat, murid: muridRows }),
    });
    const data = await res.json();
    if (data.success) {
      kbShowToast(`✓ ${data.count} rekod disimpan`);
      kbInitBorang();
    } else {
      errBox.textContent = data.message || "Gagal hantar rekod.";
      errBox.classList.remove("hidden");
    }
  } catch (err) {
    errBox.textContent = "Ralat sambungan ke server (" + err.message + ").";
    errBox.classList.remove("hidden");
  }
  btn.disabled = false; btn.textContent = "Hantar Rekod";
}

/* ================= Init ================= */
async function kbInit(user) {
  kbCurrentUser = user;
  await kbFetchStudents();
  kbInitBorang();
  kbLoadSenarai();
}

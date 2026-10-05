/* ============================================================
   LAPORAN PENTADBIR BERTUGAS
   ============================================================ */

const LP_SPREADSHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";
const LP_BLOK_LIST = [
  "BLOK A", "BLOK B", "BLOK C", "KANTIN",
  "1 Ar-Razi", "1 Ibnu Rushd", "1 Al-Farabi",
  "2 Ar-Razi", "2 Ibnu Rushd", "2 Al-Farabi",
  "3 Ar-Razi", "3 Ibnu Rushd", "3 Al-Farabi",
  "4 Ar-Razi", "4 Ibnu Rushd", "4 Al-Farabi",
  "5 Ar-Razi", "5 Ibnu Rushd", "5 Al-Farabi",
  "6 Al-Ghazali", "6 Al Bukhari",
  "ASPURA", "ASPURI", "DEWAN MAKAN", "KAWASAN SEKOLAH", "KAWASAN ASRAMA",
];
const LP_BULAN = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];

let lpRecords = [];
let lpCurrentUser = null;
let lpImageData = { 1: null, 2: null };
let lpHtml2canvasReady = false;
let lpDeleteTarget = null;

function lpEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function lpPad2(n) { return String(n).padStart(2, "0"); }

/* ---------------- Navigasi dalam-page (Borang / Senarai) ---------------- */
function lpSwitchPage(name) {
  document.getElementById("lp-page-borang").classList.toggle("hidden", name !== "borang");
  document.getElementById("lp-page-senarai").classList.toggle("hidden", name !== "senarai");
  document.getElementById("lp-nav-borang").classList.toggle("active", name === "borang");
  document.getElementById("lp-nav-senarai").classList.toggle("active", name === "senarai");
  if (name === "senarai") lpRenderList();
}

/* ---------------- Borang: mampat & pratonton gambar ---------------- */
function lpHandleImagePick(slot, input) {
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
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      lpImageData[slot] = dataUrl;
      const preview = document.getElementById(`lp-preview-${slot}`);
      preview.src = dataUrl;
      preview.classList.remove("hidden");
      document.getElementById(`lp-preview-empty-${slot}`).classList.add("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function lpRemoveImage(slot) {
  lpImageData[slot] = null;
  document.getElementById(`lp-file-${slot}`).value = "";
  document.getElementById(`lp-preview-${slot}`).classList.add("hidden");
  document.getElementById(`lp-preview-empty-${slot}`).classList.remove("hidden");
}

function lpResetForm() {
  const form = document.getElementById("lp-form");
  form.reset();
  lpImageData = { 1: null, 2: null };
  [1, 2].forEach((slot) => {
    document.getElementById(`lp-preview-${slot}`).classList.add("hidden");
    document.getElementById(`lp-preview-empty-${slot}`).classList.remove("hidden");
  });
  const now = new Date();
  document.getElementById("lp-tarikh").value = `${now.getFullYear()}-${lpPad2(now.getMonth() + 1)}-${lpPad2(now.getDate())}`;
  document.getElementById("lp-masa").value = `${lpPad2(now.getHours())}:${lpPad2(now.getMinutes())}`;
  if (lpCurrentUser) document.getElementById("lp-nama").value = lpCurrentUser.nama || "";
}

async function lpSubmitForm(e) {
  e.preventDefault();
  const errEl = document.getElementById("lp-form-error");
  errEl.classList.add("hidden");

  const nama = document.getElementById("lp-nama").value.trim();
  const tarikh = document.getElementById("lp-tarikh").value;
  const masa = document.getElementById("lp-masa").value;
  const blok = document.getElementById("lp-blok").value;
  const catatan = document.getElementById("lp-catatan").value.trim();

  if (!nama || !tarikh || !blok) {
    errEl.textContent = "Sila lengkapkan nama pentadbir, tarikh, dan blok/kelas.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!apiConfigured()) {
    errEl.textContent = "API belum disambungkan (API_URL belum diisi dalam app.js).";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("lp-submit-btn");
  btn.disabled = true;
  btn.textContent = "Menghantar...";
  try {
    const data = await postToAppsScript(API_URL, {
      action: "addLaporanPentadbir",
      email: lpCurrentUser.email,
      namaPentadbir: nama,
      tarikh, masa, blokKelas: blok, catatan,
      gambar1: lpImageData[1] || "",
      gambar2: lpImageData[2] || "",
    });
    if (data.success) {
      lpResetForm();
      alert(data.warning ? `Rekod dihantar, tapi ada masalah gambar:\n${data.warning}` : "Rekod pemantauan berjaya dihantar!");
      await lpLoadRecords();
    } else {
      errEl.textContent = data.message || "Gagal hantar rekod.";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "Ralat sambungan ke server.";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false;
  btn.textContent = "Hantar Rekod";
}

/* ---------------- Senarai laporan (dikumpul ikut Nama + Tarikh) — gviz terus ---------------- */
async function lpLoadRecords() {
  try {
    const { rows } = await gvizFetch(LP_SPREADSHEET_ID, "LaporanPentadbirBertugas");
    const gvizDateToIso = (v) => {
      if (!v) return "";
      const m = String(v).match(/Date\((\d+),(\d+),(\d+)/);
      if (!m) return String(v).slice(0, 10);
      // Bina string TERUS dari komponen y/m/d — JANGAN guna new Date().toISOString()
      // sebab ia tukar ke UTC dan sebabkan tarikh tersasar 1 hari (GMT+8).
      const y = parseInt(m[1]), mo = parseInt(m[2]) + 1, d = parseInt(m[3]);
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    lpRecords = rows.map((r, i) => {
      const c = r.c || [];
      const getRaw = (idx) => (c[idx] && c[idx].v != null ? c[idx].v : "");
      const getFmt = (idx) => (c[idx] && (c[idx].f != null ? c[idx].f : c[idx].v)) || "";
      const tarikh = gvizDateToIso(getRaw(0));
      const blokKelas = getRaw(2);
      if (!tarikh || !blokKelas) return null; // perlu tarikh + blok/kelas
      return {
        rowNum: i + 2,
        tarikh, masa: getFmt(1) || "", blokKelas,
        catatan: getRaw(3) || "", gambar1: getRaw(4) || "", gambar2: getRaw(5) || "",
        namaPentadbir: getRaw(6) || "",
      };
    }).filter(Boolean);
  } catch (e) {
    lpRecords = [];
  }
}

function lpGroupedReports() {
  const map = new Map();
  lpRecords.forEach((r) => {
    const key = r.namaPentadbir + "|" + r.tarikh;
    if (!map.has(key)) map.set(key, { namaPentadbir: r.namaPentadbir, tarikh: r.tarikh, items: [] });
    map.get(key).items.push(r);
  });
  const groups = Array.from(map.values());
  groups.forEach((g) => g.items.sort((a, b) => a.masa.localeCompare(b.masa)));
  groups.sort((a, b) => b.tarikh.localeCompare(a.tarikh));
  return groups;
}

function lpInitFilters() {
  const years = Array.from(new Set(lpRecords.map((r) => r.tarikh.slice(0, 4))));
  years.add ? null : null;
  const yearSet = new Set(years);
  yearSet.add(String(new Date().getFullYear()));
  const yearArr = Array.from(yearSet).sort((a, b) => b - a);

  const yearSel = document.getElementById("lp-filter-year");
  yearSel.innerHTML = `<option value="">Semua Tahun</option>` + yearArr.map((y) => `<option value="${y}">${y}</option>`).join("");

  const monthSel = document.getElementById("lp-filter-month");
  monthSel.innerHTML = `<option value="">Semua Bulan</option>` + LP_BULAN.map((b, i) => `<option value="${i + 1}">${b}</option>`).join("");
}

function lpRenderList() {
  if (!lpRecords.length) {
    lpLoadRecords().then(() => { lpInitFilters(); lpRenderListInner(); });
  } else {
    lpRenderListInner();
  }
}

function lpRenderListInner() {
  const year = document.getElementById("lp-filter-year").value;
  const month = document.getElementById("lp-filter-month").value;

  let groups = lpGroupedReports();
  if (year) groups = groups.filter((g) => g.tarikh.slice(0, 4) === year);
  if (month) groups = groups.filter((g) => String(parseInt(g.tarikh.slice(5, 7), 10)) === month);

  const listEl = document.getElementById("lp-list");
  if (!groups.length) {
    listEl.innerHTML = `<div class="empty-state">Tiada laporan dijumpai.</div>`;
    return;
  }
  listEl.innerHTML = groups.map((g) => {
    const [y, m, d] = g.tarikh.split("-");
    return `<div class="lp-list-item" onclick="lpOpenReport('${lpEscape(g.namaPentadbir)}','${g.tarikh}')">
      <div class="lp-list-main">
        <div class="lp-list-nama">${lpEscape(g.namaPentadbir)}</div>
        <div class="lp-list-sub">${d}/${m}/${y} &middot; ${g.items.length} rekod</div>
      </div>
      <span class="lp-list-arrow">&rsaquo;</span>
    </div>`;
  }).join("");
}

/* ---------------- Popup laporan (format A4, formal) ---------------- */
function lpOpenReport(namaPentadbir, tarikh) {
  const items = lpRecords.filter((r) => r.namaPentadbir === namaPentadbir && r.tarikh === tarikh)
    .sort((a, b) => a.masa.localeCompare(b.masa));
  const [y, m, d] = tarikh.split("-");
  const tarikhFmt = `${d}/${m}/${y}`;

  const rows = items.map((r) => {
    const imgs = [r.gambar1, r.gambar2].filter(Boolean)
      .map((url) => `<img src="${lpEscape(url)}" class="lp-report-img">`).join("");
    return `<tr>
      <td>${lpEscape(r.masa || "-")}</td>
      <td>${lpEscape(r.blokKelas)}</td>
      <td style="white-space:pre-wrap">${lpEscape(r.catatan || "-")}</td>
      <td>${imgs || "-"}</td>
    </tr>`;
  }).join("");

  document.getElementById("lp-report-content").innerHTML = `
    <div class="lp-report-header">
      <img src="${SCHOOL_LOGO_URL}" class="lp-report-logo" crossorigin="anonymous">
      <div class="lp-report-title">PEMANTAUAN PENTADBIR BERTUGAS<br>("MANAGEMENT BY WALKING AROUND")<br>SM ARAB (JAIM) AL-ASYRAF</div>
    </div>
    <div class="lp-report-meta">
      <div><b>Nama Pentadbir Bertugas:</b> ${lpEscape(namaPentadbir)}</div>
      <div><b>Tarikh:</b> ${tarikhFmt}</div>
    </div>
    <table class="lp-report-table">
      <thead><tr><th>Masa</th><th>Blok/Kelas</th><th>Catatan/Ulasan Pemantau</th><th>Gambar</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  lpDeleteTarget = { namaPentadbir, tarikh };
  document.getElementById("lp-report-overlay").classList.remove("hidden");
}
function lpCloseReport() {
  document.getElementById("lp-report-overlay").classList.add("hidden");
}

/* ---------------- Muat turun PNG (html2canvas, CDN dinamik) ---------------- */
function lpLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("gagal muat " + src));
    document.head.appendChild(s);
  });
}
async function lpEnsureHtml2Canvas() {
  if (lpHtml2canvasReady || typeof html2canvas !== "undefined") { lpHtml2canvasReady = true; return; }
  const cdns = [
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",
  ];
  for (const url of cdns) {
    try { await lpLoadScript(url); if (typeof html2canvas !== "undefined") { lpHtml2canvasReady = true; return; } } catch (e) {}
  }
}
async function lpDownloadPng() {
  const btn = document.getElementById("lp-download-btn");
  btn.disabled = true;
  btn.textContent = "Menyediakan...";
  await lpEnsureHtml2Canvas();
  if (typeof html2canvas === "undefined") {
    alert("Gagal muatkan pustaka export. Cuba lagi bila ada sambungan internet.");
    btn.disabled = false;
    btn.textContent = "Muat Turun PNG";
    return;
  }
  const el = document.getElementById("lp-report-content");
  try {
    const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = `Laporan_Pentadbir_${(lpDeleteTarget.namaPentadbir || "").replace(/\s+/g, "_")}_${lpDeleteTarget.tarikh}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    alert("Gagal jana PNG: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Muat Turun PNG";
}

/* ---------------- Padam laporan (dengan pengesahan) ---------------- */
function lpConfirmDelete() {
  document.getElementById("lp-confirm-overlay").classList.remove("hidden");
}
function lpCancelDelete() {
  document.getElementById("lp-confirm-overlay").classList.add("hidden");
}
async function lpDoDelete() {
  if (!lpDeleteTarget) return;
  const btn = document.getElementById("lp-confirm-delete-btn");
  btn.disabled = true;
  btn.textContent = "Memadam...";
  try {
    const data = await postToAppsScript(API_URL, { action: "deleteLaporanPentadbir", namaPentadbir: lpDeleteTarget.namaPentadbir, tarikh: lpDeleteTarget.tarikh });
    if (data.success) {
      lpCancelDelete();
      lpCloseReport();
      await lpLoadRecords();
      lpRenderListInner();
    } else {
      alert(data.message || "Gagal padam laporan.");
    }
  } catch (err) {
    alert("Ralat sambungan ke server.");
  }
  btn.disabled = false;
  btn.textContent = "Ya, Padam";
}

/* ---------------- Edit laporan ---------------- */
// Nombor baris diambil TERUS dari server (getLaporanPentadbir) semasa butang Edit ditekan —
// bukan dari paparan gviz — supaya rujukan baris tepat & data semasa. Server turut menolak
// simpanan kalau baris sudah diubah orang lain.
let lpEdit = null; // { orig:{namaPentadbir,tarikh}, entries:[{rowNum,del,init,gambar:[{url,mode,data}x2]}] }
let lpEditPickTarget = null;

function lpEscapeAttr(str) { return lpEscape(str).replace(/"/g, "&quot;"); }

/** "09:30" | "9:30 AM" | "9:30 PM" | "21:05" -> "HH:mm" untuk <input type=time>; "" kalau tak dikenali. */
function lpMasaToInput(str) {
  const m = String(str || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  if (m[3]) {
    const pm = m[3].toLowerCase() === "pm";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return h > 23 ? "" : `${lpPad2(h)}:${m[2]}`;
}

function lpCompressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal baca fail"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Fail bukan gambar sah"));
      img.onload = () => {
        const scale = Math.min(1, 1000 / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function lpOpenEdit() {
  if (!lpDeleteTarget) return;
  if (!apiConfigured()) { alert("API belum disambungkan."); return; }
  const btn = document.getElementById("lp-edit-btn");
  const oldLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Memuatkan...";
  try {
    const res = await fetch(`${API_URL}?action=getLaporanPentadbir&_ts=${Date.now()}`, { cache: "no-store" });
    const list = JSON.parse(await res.text());
    if (!Array.isArray(list)) throw new Error("Respons pelayan tidak sah");
    const t = lpDeleteTarget;
    const items = list
      .filter((r) => r.tarikh === t.tarikh && String(r.namaPentadbir || "").trim() === String(t.namaPentadbir || "").trim())
      .sort((a, b) => a.rowNum - b.rowNum);
    if (!items.length) { alert("Laporan tak dijumpai di pelayan (mungkin telah diubah). Sila muat semula senarai."); return; }
    lpEdit = {
      orig: { namaPentadbir: String(t.namaPentadbir).trim(), tarikh: t.tarikh },
      entries: items.map((r) => ({
        rowNum: r.rowNum, del: false,
        init: { masa: lpMasaToInput(r.masa), blokKelas: String(r.blokKelas || ""), catatan: String(r.catatan || "").trim() },
        gambar: [r.gambar1, r.gambar2].map((u) => ({ url: u || "", mode: "keep", data: "" })),
      })),
    };
    lpRenderEdit();
    document.getElementById("lp-edit-error").classList.add("hidden");
    document.getElementById("lp-edit-overlay").classList.remove("hidden");
  } catch (err) {
    alert("Gagal memuatkan data untuk edit: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = oldLabel;
  }
}
function lpCloseEdit() {
  document.getElementById("lp-edit-overlay").classList.add("hidden");
  lpEdit = null;
  lpEditPickTarget = null;
}

function lpEditSlotHtml(i, k) {
  const s = lpEdit.entries[i].gambar[k];
  const src = s.mode === "replace" ? s.data : (s.mode === "remove" ? "" : s.url);
  const thumb = src ? `<img src="${lpEscapeAttr(src)}" alt="Gambar ${k + 1}">` : `<span>＋<br>Gambar ${k + 1}</span>`;
  const btns = src
    ? `<button type="button" onclick="lpEditPickImage(${i},${k})">Tukar</button><button type="button" onclick="lpEditClearImage(${i},${k})">Buang</button>`
    : `<button type="button" onclick="lpEditPickImage(${i},${k})">Tambah</button>`;
  return `<div class="lp-edit-img"><div class="lp-edit-thumb" onclick="lpEditPickImage(${i},${k})">${thumb}</div><div class="lp-edit-img-btns">${btns}</div></div>`;
}
function lpEditRefreshImgs(i) {
  document.getElementById(`lp-e-imgs-${i}`).innerHTML = [0, 1].map((k) => lpEditSlotHtml(i, k)).join("");
}

function lpRenderEdit() {
  const { orig, entries } = lpEdit;
  const blokOptions = (cur) => {
    // Nilai semasa mungkin tiada dalam senarai standard (data lama) — masukkan supaya tak hilang senyap
    const list = LP_BLOK_LIST.includes(cur) ? LP_BLOK_LIST : [cur].concat(LP_BLOK_LIST);
    return list.map((b) => `<option value="${lpEscapeAttr(b)}"${b === cur ? " selected" : ""}>${lpEscape(b)}</option>`).join("");
  };
  const cards = entries.map((e, i) => `
    <div class="lp-edit-entry" id="lp-e-card-${i}">
      <div class="lp-edit-entry-head">
        <span>Rekod ${i + 1}</span>
        <button type="button" class="lp-e-del" id="lp-e-delbtn-${i}" onclick="lpEditToggleDel(${i})">Padam rekod ini</button>
      </div>
      <div class="lp-edit-fields">
        <label class="field-label">Masa</label>
        <input class="field-input" type="time" id="lp-e-masa-${i}" value="${lpEscapeAttr(e.init.masa)}">
        <label class="field-label">Blok/Kelas</label>
        <select class="field-input" id="lp-e-blok-${i}">${blokOptions(e.init.blokKelas)}</select>
        <label class="field-label">Catatan/Ulasan</label>
        <textarea class="field-input" id="lp-e-catatan-${i}">${lpEscape(e.init.catatan)}</textarea>
        <label class="field-label">Gambar</label>
        <div class="lp-edit-imgs" id="lp-e-imgs-${i}">${[0, 1].map((k) => lpEditSlotHtml(i, k)).join("")}</div>
      </div>
    </div>`).join("");
  document.getElementById("lp-edit-body").innerHTML = `
    <div class="lp-edit-section">Maklumat Laporan</div>
    <label class="field-label">Nama Pentadbir Bertugas</label>
    <input class="field-input" id="lp-e-nama" value="${lpEscapeAttr(orig.namaPentadbir)}">
    <label class="field-label">Tarikh</label>
    <input class="field-input" type="date" id="lp-e-tarikh" value="${lpEscapeAttr(orig.tarikh)}">
    <div class="lp-edit-section">Rekod Pemantauan (${entries.length})</div>
    ${cards}`;
}

function lpEditToggleDel(i) {
  const e = lpEdit.entries[i];
  e.del = !e.del;
  document.getElementById(`lp-e-card-${i}`).classList.toggle("lp-edit-entry-del", e.del);
  document.getElementById(`lp-e-delbtn-${i}`).textContent = e.del ? "Batal padam" : "Padam rekod ini";
}
function lpEditPickImage(i, k) {
  lpEditPickTarget = { i, k };
  const f = document.getElementById("lp-edit-file");
  f.value = "";
  f.click();
}
async function lpEditOnFile(input) {
  const file = input.files && input.files[0];
  if (!file || !lpEdit || !lpEditPickTarget) return;
  const { i, k } = lpEditPickTarget;
  try {
    const dataUrl = await lpCompressImage(file);
    if (!lpEdit) return; // editor ditutup semasa memampat
    lpEdit.entries[i].gambar[k] = { url: lpEdit.entries[i].gambar[k].url, mode: "replace", data: dataUrl };
    lpEditRefreshImgs(i);
  } catch (err) {
    alert("Gagal memproses gambar: " + err.message);
  }
  input.value = "";
}
function lpEditClearImage(i, k) {
  const s = lpEdit.entries[i].gambar[k];
  // Slot asalnya kosong -> "buang" bermaksud batal tambahan (tiada perubahan sebenar)
  lpEdit.entries[i].gambar[k] = { url: s.url, mode: s.url ? "remove" : "keep", data: "" };
  lpEditRefreshImgs(i);
}

async function lpSaveEdit() {
  const errEl = document.getElementById("lp-edit-error");
  errEl.classList.add("hidden");
  const showErr = (m) => { errEl.textContent = m; errEl.classList.remove("hidden"); };
  if (!lpEdit) return;

  const nama = document.getElementById("lp-e-nama").value.trim();
  const tarikh = document.getElementById("lp-e-tarikh").value;
  if (!nama || !tarikh) { showErr("Sila lengkapkan nama pentadbir dan tarikh."); return; }

  // Kumpul HANYA medan yang berubah (selebihnya dibiarkan tak disentuh di Sheet)
  const entries = lpEdit.entries.map((e, i) => {
    if (e.del) return { rowNum: e.rowNum, del: true };
    const masa = document.getElementById(`lp-e-masa-${i}`).value;
    const blok = document.getElementById(`lp-e-blok-${i}`).value;
    const catatan = document.getElementById(`lp-e-catatan-${i}`).value.trim();
    const changes = {};
    if (masa !== e.init.masa) changes.masa = masa;
    if (blok !== e.init.blokKelas) changes.blokKelas = blok;
    if (catatan !== e.init.catatan) changes.catatan = catatan;
    const out = { rowNum: e.rowNum, del: false, changes };
    e.gambar.forEach((s, k) => {
      if (s.mode === "replace" && s.data) out["gambar" + (k + 1)] = { mode: "replace", data: s.data };
      else if (s.mode === "remove") out["gambar" + (k + 1)] = { mode: "remove" };
    });
    return out;
  });

  if (!entries.some((x) => !x.del)) { showErr('Sekurang-kurangnya satu rekod mesti kekal. Guna "Padam Laporan" untuk memadam keseluruhan laporan.'); return; }
  const unchanged = nama === lpEdit.orig.namaPentadbir && tarikh === lpEdit.orig.tarikh
    && entries.every((x) => !x.del && !Object.keys(x.changes).length && !x.gambar1 && !x.gambar2);
  if (unchanged) { showErr("Tiada perubahan untuk disimpan."); return; }
  if (!apiConfigured()) { showErr("API belum disambungkan."); return; }

  const btn = document.getElementById("lp-edit-save-btn");
  const btnReset = () => { btn.disabled = false; btn.textContent = "Simpan Perubahan"; };
  btn.disabled = true;
  btn.textContent = "Menyimpan...";
  try {
    const data = await postToAppsScript(API_URL, {
      action: "editLaporanPentadbir",
      email: lpCurrentUser.email,
      original: lpEdit.orig,
      namaPentadbir: nama, tarikh, entries,
    });
    if (data.success) {
      const unclear = !!data._fallbackParse; // respons bukan JSON — tak pasti hasil sebenar
      lpCloseEdit();
      lpCloseReport();
      await new Promise((r) => setTimeout(r, 700)); // bagi gviz sempat segar
      await lpLoadRecords();
      lpRenderListInner();
      const visible = lpRecords.some((r) => r.namaPentadbir === nama && r.tarikh === tarikh);
      if (visible) lpOpenReport(nama, tarikh); // buka semula laporan yang dikemas kini
      else if (!unclear) { alert("Perubahan telah disimpan. Senarai mungkin mengambil beberapa saat untuk dikemas kini — muat semula halaman kalau belum kelihatan."); return btnReset(); }
      if (unclear) alert("Respons pelayan tidak jelas. Sila semak laporan untuk pastikan perubahan tersimpan.");
      else alert(data.warning ? `Laporan dikemas kini, tapi ada masalah gambar:\n${data.warning}` : "Laporan berjaya dikemas kini.");
    } else {
      showErr(data.message || "Gagal menyimpan perubahan.");
    }
  } catch (err) {
    showErr("Ralat sambungan ke server.");
  }
  btn.disabled = false;
  btn.textContent = "Simpan Perubahan";
}

/* ---------------- Init ---------------- */
function lpInit(user) {
  lpCurrentUser = user;

  const hasAccess = checkModuleAccess(user, "laporan_pentadbir");
  if (!hasAccess) {
    document.getElementById("lp-access-denied-overlay").classList.remove("hidden");
    document.getElementById("lp-main-content").classList.add("hidden");
    return;
  }

  const blokSel = document.getElementById("lp-blok");
  blokSel.innerHTML = `<option value="">Pilih Blok/Kelas</option>` + LP_BLOK_LIST.map((b) => `<option value="${b}">${b}</option>`).join("");

  lpResetForm();
  document.getElementById("lp-form").addEventListener("submit", lpSubmitForm);
  document.getElementById("lp-filter-year").addEventListener("change", lpRenderListInner);
  document.getElementById("lp-filter-month").addEventListener("change", lpRenderListInner);

  lpInitFilters();
}

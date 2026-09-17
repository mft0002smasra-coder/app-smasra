/* ============================================================
   JADUAL GURU — Jadual Semua Guru, Analisis, Update
   Pengecam awalan "jg" (Jadual Guru).
   ============================================================ */

const JG_HARI_LIST = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
const JG_MAX_SLOTS = 15;

let jgCurrentUser = null;
let jgIsPentadbir = false;
let jgCanUpload = false;
let jgRecords = [];
let jgLastUpdate = "";
let jgTeacherNames = [];

/** Jana kod guru dari nama penuh (huruf awalan tiap perkataan, abaikan bin/binti).
 * Cth: "Abdul Malek bin Mat Yasin" -> "AMMY" */
function jgGenerateKodFromName(namaGuru) {
  const words = String(namaGuru || "").trim().split(/\s+/);
  const initials = words
    .filter((w) => w.toLowerCase() !== "bin" && w.toLowerCase() !== "binti")
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return initials || "-";
}

function jgEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function jgNorm(str) { return String(str || "").trim().toUpperCase().replace(/\s+/g, " "); }

const JG_SUBJ_PALETTE = ["#DBEAFE", "#DCFCE7", "#FEF3C7", "#FCE7F3", "#EDE9FE", "#CCFBF1", "#FEE2E2", "#E0E7FF"];
const JG_SUBJ_TEXT_PALETTE = ["#1D4ED8", "#047857", "#B45309", "#BE185D", "#6D28D9", "#0F766E", "#DC2626", "#4338CA"];
function jgHashStr(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
function jgColorForSubjek(subjek) {
  const idx = jgHashStr(jgNorm(subjek)) % JG_SUBJ_PALETTE.length;
  return { bg: JG_SUBJ_PALETTE[idx], text: JG_SUBJ_TEXT_PALETTE[idx] };
}

/* ---------------- Tukar format masa "7.3"/"12.3" -> "7:30"/"12:30" ---------------- */
function jgFmtWaktu(val) {
  if (val === null || val === undefined || val === "") return "";
  const num = parseFloat(val);
  if (isNaN(num)) return String(val);
  const hour = Math.floor(num);
  const minute = Math.round((num - hour) * 100);
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

/* ---------------- Akses ---------------- */
function jgCheckAccess(user) {
  jgIsPentadbir = String(user.role2 || "").trim().toLowerCase() === "pentadbir";
  const jawatanUpper = String(user.jawatan || "").trim().toUpperCase();
  const isJadualGuru = jawatanUpper === "PPP (GURU JADUAL WAKTU)";
  const isAdmin = String(user.role || "").trim().toLowerCase() === "admin";
  jgCanUpload = isJadualGuru || isAdmin;
}

const JG_SPREADSHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";
const JG_CACHE_KEY = "jg_cache_jadualGuru";
const JG_CACHE_TTL_MS = 3 * 60 * 1000;

/**
 * Fetch data jadual guru — guna gviz TERUS (bukan lalui Apps Script) untuk
 * kelajuan maksimum (elak "cold start"/overhead pelaksanaan skrip untuk
 * bacaan besar ~800 baris). lastUpdate diambil berasingan (tak tahan render).
 */
async function jgFetchRecords(forceRefresh) {
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(JG_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < JG_CACHE_TTL_MS) {
          jgRecords = parsed.data;
          jgLastUpdate = parsed.lastUpdate || "";
          jgTeacherNames = Array.from(new Set(jgRecords.map((r) => r.guru))).sort();
          jgFetchLastUpdateBackground();
          return;
        }
      }
    } catch (e) { /* storan tak boleh diakses — teruskan fetch biasa */ }
  }
  try {
    const url = `https://docs.google.com/spreadsheets/d/${JG_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("JadualGuru")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;
    const cols = (table.cols || []).map((c) => jgNorm(c.label || ""));
    const idx = { hari: cols.indexOf("HARI"), guru: cols.indexOf("NAMAGURU"), kodGuru: cols.indexOf("KODGURU"), slot: cols.indexOf("SLOT"), waktuMula: cols.indexOf("WAKTUMULA"), waktuTamat: cols.indexOf("WAKTUTAMAT"), subjek: cols.indexOf("SUBJEK"), kelas: cols.indexOf("KELAS") };

    jgRecords = (table.rows || []).map((r) => {
      const c = r.c || [];
      const get = (i) => (i !== -1 && c[i] && c[i].v != null ? c[i].v : "");
      return { hari: get(idx.hari), guru: get(idx.guru), kodGuru: get(idx.kodGuru), slot: get(idx.slot), waktuMula: get(idx.waktuMula), waktuTamat: get(idx.waktuTamat), subjek: get(idx.subjek), kelas: get(idx.kelas) };
    }).filter((r) => r.hari && r.guru);

    const names = new Set(jgRecords.map((r) => r.guru));
    jgTeacherNames = Array.from(names).sort();
    try { sessionStorage.setItem(JG_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: jgRecords, lastUpdate: jgLastUpdate })); } catch (e) {}
  } catch (e) {
    jgRecords = [];
  }
  jgFetchLastUpdateBackground();
}

/* Ambil "Terakhir dikemaskini" berasingan (tak halang render jadual utama) */
async function jgFetchLastUpdateBackground() {
  if (!apiConfigured()) return;
  try {
    const res = await fetch(`${API_URL}?action=getJadualGuru`);
    const json = await res.json();
    jgLastUpdate = json.lastUpdate || "";
    const el = document.getElementById("jg-last-update");
    if (el) el.textContent = jgLastUpdate || "Belum pernah dikemaskini";
  } catch (e) { /* tak kritikal */ }
}

/* ================= Bina jadual mingguan (transposed: Waktu baris, Hari lajur) ================= */
function jgBuildWeeklyTable(guruName) {
  const nameNorm = jgNorm(guruName);
  const mine = jgRecords.filter((r) => jgNorm(r.guru) === nameNorm);

  const bySlotDay = {}; // "slot-hari" -> record
  mine.forEach((r) => { bySlotDay[`${r.slot}-${r.hari}`] = r; });

  const thead = `<thead><tr><th>Waktu</th>${JG_HARI_LIST.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
  const rows = [];
  for (let slot = 1; slot <= JG_MAX_SLOTS; slot++) {
    const cells = JG_HARI_LIST.map((hari) => {
      const rec = bySlotDay[`${slot}-${hari}`];
      if (!rec || !rec.subjek) return `<td></td>`;
      const col = jgColorForSubjek(rec.subjek);
      const dataJson = jgEscape(JSON.stringify(rec)).replace(/'/g, "&apos;");
      return `<td><div class="jg-cell" style="background:${col.bg};color:${col.text}" onclick='jgOpenCellDetail(${dataJson})'><span class="jg-cell-time" style="color:${col.text};opacity:.75">${jgFmtWaktu(rec.waktuMula)}-${jgFmtWaktu(rec.waktuTamat)}</span><span class="jg-cell-subj" style="color:${col.text}">${jgEscape(rec.subjek)}</span><span class="jg-cell-kelas" style="color:${col.text}">${jgEscape(rec.kelas)}</span></div></td>`;
    }).join("");
    rows.push(`<tr><td class="jg-slot-cell">${slot}</td>${cells}</tr>`);
  }
  return thead + "<tbody>" + rows.join("") + "</tbody>";
}

function jgRenderIndividual(guruName, tableElId, titleElId) {
  if (titleElId) document.getElementById(titleElId).textContent = guruName || "-";
  document.getElementById(tableElId).innerHTML = jgBuildWeeklyTable(guruName);
}

/* ---------------- Popup: butiran penuh + nama guru penuh bila klik sel ---------------- */
function jgOpenCellDetail(rec) {
  const box = document.getElementById("jg-detail-overlay");
  document.getElementById("jg-detail-guru").textContent = rec.guru || "-";
  document.getElementById("jg-detail-hari").textContent = rec.hari || "-";
  document.getElementById("jg-detail-waktu").textContent = `Waktu ${rec.slot} (${jgFmtWaktu(rec.waktuMula)} - ${jgFmtWaktu(rec.waktuTamat)})`;
  document.getElementById("jg-detail-subjek").textContent = rec.subjek || "-";
  document.getElementById("jg-detail-kelas").textContent = rec.kelas || "-";
  box.classList.remove("hidden");
}
function jgCloseCellDetail() {
  document.getElementById("jg-detail-overlay").classList.add("hidden");
}

/* ---------------- Jadual Kelas: guru+subjek per slot untuk satu kelas ---------------- */
function jgBuildClassWeeklyTable(kelasName) {
  const nameNorm = jgNorm(kelasName);
  const mine = jgRecords.filter((r) => jgNorm(r.kelas) === nameNorm);

  const bySlotDay = {};
  mine.forEach((r) => { bySlotDay[`${r.slot}-${r.hari}`] = r; });

  const thead = `<thead><tr><th>Waktu</th>${JG_HARI_LIST.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
  const rows = [];
  for (let slot = 1; slot <= JG_MAX_SLOTS; slot++) {
    const cells = JG_HARI_LIST.map((hari) => {
      const rec = bySlotDay[`${slot}-${hari}`];
      if (!rec || !rec.subjek) return `<td></td>`;
      const col = jgColorForSubjek(rec.subjek);
      const kodPaparan = rec.kodGuru || jgGenerateKodFromName(rec.guru); // jana dari nama kalau data lama tiada kod
      const dataJson = jgEscape(JSON.stringify(rec)).replace(/'/g, "&apos;");
      return `<td><div class="jg-cell" style="background:${col.bg};color:${col.text}" onclick='jgOpenCellDetail(${dataJson})'><span class="jg-cell-time" style="color:${col.text};opacity:.75">${jgFmtWaktu(rec.waktuMula)}-${jgFmtWaktu(rec.waktuTamat)}</span><span class="jg-cell-subj" style="color:${col.text}">${jgEscape(rec.subjek)}</span><span class="jg-cell-kelas" style="color:${col.text}">${jgEscape(kodPaparan)}</span></div></td>`;
    }).join("");
    rows.push(`<tr><td class="jg-slot-cell">${slot}</td>${cells}</tr>`);
  }
  return thead + "<tbody>" + rows.join("") + "</tbody>";
}

function jgOnClassSelect() {
  const sel = document.getElementById("jg-class-select");
  document.getElementById("jg-kelas-table").innerHTML = jgBuildClassWeeklyTable(sel.value);
}

/* ================= Analisis Jadual Guru ================= */
function jgComputeAnalysis() {
  // Kumpul ikut Guru -> (Subjek|Kelas) -> kiraan waktu, elak kira slot sama berulang
  // merentasi hari berlainan tapi subjek+kelas sama (kekalkan per-hari, kira genap)
  const byGuru = {};
  jgRecords.forEach((r) => {
    if (!r.subjek) return;
    if (!byGuru[r.guru]) byGuru[r.guru] = { rows: {}, jumlah: 0 };
    const key = `${r.subjek}|||${r.kelas}`;
    if (!byGuru[r.guru].rows[key]) byGuru[r.guru].rows[key] = { subjek: r.subjek, kelas: r.kelas, waktu: 0 };
    byGuru[r.guru].rows[key].waktu++;
    byGuru[r.guru].jumlah++;
  });
  return byGuru;
}

function jgRenderAnalysis() {
  const byGuru = jgComputeAnalysis();
  const names = Object.keys(byGuru).sort();
  let bil = 1;
  const rowsHtml = names.map((guru) => {
    const info = byGuru[guru];
    const subjRows = Object.values(info.rows).sort((a, b) => a.subjek.localeCompare(b.subjek));
    const first = subjRows[0];
    let html = `<tr>
      <td rowspan="${subjRows.length}">${bil}</td>
      <td rowspan="${subjRows.length}" class="jg-guru-cell">${jgEscape(guru)}</td>
      <td>${jgEscape(first.subjek)}</td><td>${jgEscape(first.kelas)}</td><td>${first.waktu}</td>
      <td rowspan="${subjRows.length}" class="jg-jumlah-cell">${info.jumlah}</td>
    </tr>`;
    for (let i = 1; i < subjRows.length; i++) {
      html += `<tr><td>${jgEscape(subjRows[i].subjek)}</td><td>${jgEscape(subjRows[i].kelas)}</td><td>${subjRows[i].waktu}</td></tr>`;
    }
    bil++;
    return html;
  }).join("");

  document.getElementById("jg-analysis-body").innerHTML = rowsHtml || `<tr><td colspan="6" class="jg-empty-row">Tiada data jadual guru lagi.</td></tr>`;
}

/* ================= Navigasi tab (dinamik ikut kebenaran) ================= */
function jgSwitchTab(name) {
  ["saya", "semua", "kelas", "analisis", "update"].forEach((n) => {
    const panel = document.getElementById(`jg-panel-${n}`);
    const nav = document.getElementById(`jg-nav-${n}`);
    if (panel) panel.classList.toggle("hidden", n !== name);
    if (nav) nav.classList.toggle("active", n === name);
  });
  if (name === "analisis") jgRenderAnalysis();
}

function jgOnTeacherSelect() {
  const sel = document.getElementById("jg-teacher-select");
  jgRenderIndividual(sel.value, "jg-semua-table");
}

/* ================= Upload / Update Jadual ================= */
let jgParsedRows = [];
let jgXlsxReady = false;

function jgLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("gagal " + src));
    document.head.appendChild(s);
  });
}
async function jgEnsureXlsxLib() {
  if (jgXlsxReady || typeof XLSX !== "undefined") { jgXlsxReady = true; return; }
  const cdns = [
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
  ];
  for (const url of cdns) {
    try { await jgLoadScript(url); if (typeof XLSX !== "undefined") { jgXlsxReady = true; return; } } catch (e) {}
  }
}

function jgSplitSubjekKelas(raw) {
  const s = String(raw || "").trim();
  const idx = s.lastIndexOf("-");
  if (idx === -1) return { subjek: s, kelas: "" };
  return { subjek: s.slice(0, idx).trim(), kelas: s.slice(idx + 1).trim() };
}

/**
 * Parse struktur "JADUAL INDUK <HARI>" berulang menegak dalam satu sheet:
 * baris tajuk hari -> +2 baris nombor slot -> +1 MULA -> +1 TAMAT -> baris guru seterusnya.
 */
function jgRowsFromAoa(aoa) {
  const rows = [];
  for (let i = 0; i < aoa.length; i++) {
    const cellA = String((aoa[i] && aoa[i][0]) || "").toUpperCase();
    if (cellA.indexOf("JADUAL INDUK") === -1) continue;

    const hariMatch = JG_HARI_LIST.find((h) => cellA.indexOf(h.toUpperCase()) !== -1);
    if (!hariMatch) continue;

    const mulaRow = aoa[i + 3] || [];
    const tamatRow = aoa[i + 4] || [];

    // Cari baris seterusnya "JADUAL INDUK" untuk hadkan skop guru hari ini
    let nextBlockIdx = aoa.length;
    for (let j = i + 5; j < aoa.length; j++) {
      const c = String((aoa[j] && aoa[j][0]) || "").toUpperCase();
      if (c.indexOf("JADUAL INDUK") !== -1) { nextBlockIdx = j; break; }
    }

    for (let r = i + 5; r < nextBlockIdx; r++) {
      const row = aoa[r];
      if (!row) continue;
      const namaGuru = String(row[2] || "").trim();
      const kodGuruRaw = String(row[3] || "").trim();
      const kodGuru = kodGuruRaw || jgGenerateKodFromName(namaGuru);
      if (!namaGuru) continue;

      for (let slot = 1; slot <= JG_MAX_SLOTS; slot++) {
        const col = 3 + slot; // E(indeks4)=slot1, F(indeks5)=slot2, dst.
        const raw = row[col];
        if (!raw || raw === 0 || raw === "0") continue;
        const { subjek, kelas } = jgSplitSubjekKelas(raw);
        if (!subjek) continue;
        rows.push({
          hari: hariMatch, guru: namaGuru, kodGuru, slot,
          waktuMula: mulaRow[col], waktuTamat: tamatRow[col],
          subjek, kelas,
        });
      }
    }
  }
  return rows;
}

async function jgHandleFilePick(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const statusEl = document.getElementById("jg-upload-status");
  statusEl.textContent = `Membaca fail "${file.name}"...`;
  statusEl.classList.remove("hidden");

  const isXlsx = /\.xlsx?$/i.test(file.name);
  try {
    let aoa;
    if (isXlsx) {
      await jgEnsureXlsxLib();
      if (typeof XLSX === "undefined") throw new Error("Gagal muatkan pustaka XLSX.");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    } else {
      const text = await file.text();
      aoa = text.split(/\r\n|\n/).map((l) => l.split(","));
    }
    jgParsedRows = jgRowsFromAoa(aoa);
    if (!jgParsedRows.length) {
      statusEl.textContent = "Tiada rekod dikesan. Pastikan fail ikut format 'JADUAL INDUK <HARI>' berulang.";
      document.getElementById("jg-confirm-upload-btn").classList.add("hidden");
      return;
    }
    const teacherCount = new Set(jgParsedRows.map((r) => r.guru)).size;
    statusEl.textContent = `Jumpa ${jgParsedRows.length} slot kelas merentasi ${teacherCount} guru, 5 hari. Sahkan untuk simpan.`;
    document.getElementById("jg-confirm-upload-btn").classList.remove("hidden");
  } catch (err) {
    statusEl.textContent = "Gagal baca fail: " + err.message;
  }
}

async function jgConfirmUpload() {
  const statusEl = document.getElementById("jg-upload-status");
  const btn = document.getElementById("jg-confirm-upload-btn");
  if (!apiConfigured()) { statusEl.textContent = "API_URL belum disambung."; return; }
  btn.disabled = true; btn.textContent = "Menyimpan...";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "uploadJadualGuru", email: jgCurrentUser.email, rows: jgParsedRows }),
    });
    const result = await res.json();
    if (result.success) {
      statusEl.textContent = `✓ Berjaya! ${result.count} slot kelas disimpan.`;
      btn.classList.add("hidden");
      document.getElementById("jg-file-input").value = "";
      jgLastUpdate = result.lastUpdate;
      document.getElementById("jg-last-update").textContent = jgLastUpdate || "-";
      await jgFetchRecords(true);
    } else {
      statusEl.textContent = result.message || "Gagal simpan jadual.";
    }
  } catch (err) {
    statusEl.textContent = "Respons lambat/terputus — menyemak jika data sebenarnya tersimpan...";
    await new Promise((r) => setTimeout(r, 2500));
    const before = jgLastUpdate;
    await jgFetchRecords(true);
    if (jgLastUpdate && jgLastUpdate !== before) {
      statusEl.textContent = `✓ Disahkan — data BERJAYA disimpan (${jgRecords.length} rekod). Sambungan cuma lambat balas.`;
      document.getElementById("jg-last-update").textContent = jgLastUpdate;
      btn.classList.add("hidden");
      document.getElementById("jg-file-input").value = "";
    } else {
      statusEl.textContent = "Ralat sambungan ke server (" + err.message + "). Sila cuba lagi.";
    }
  }
  btn.disabled = false; btn.textContent = "Sahkan & Simpan ke Sheet";
}

/* ================= TO DO LIST (staf sokongan tanpa jadual mengajar) ================= */
const JG_TODO_JAWATAN = [
  "PEMBANTU TADBIR (ASRAMA)", "PEMBANTU KHIDMAT AM", "PEMBANTU TADBIR (P/O)", "PEMBANTU MAKMAL",
];
let todoCurrentUser = null;
let todoItems = [];

function todoIsEligible(user) {
  return JG_TODO_JAWATAN.indexOf(jgNorm(user.jawatan)) !== -1;
}

async function todoFetchItems(namaUser) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${JG_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("To Do List")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;
    const cols = (table.cols || []).map((c) => jgNorm(c.label || ""));
    const idx = { id: cols.indexOf("ID"), nama: cols.indexOf("NAMA"), tarikhMula: cols.indexOf("TARIKHMULA"), tarikhAkhir: cols.indexOf("TARIKHAKHIR"), perkara: cols.indexOf("PERKARA") };
    const gvizDateToIso = (v) => {
      if (!v) return "";
      const m = String(v).match(/Date\((\d+),(\d+),(\d+)/);
      if (!m) return String(v).slice(0, 10);
      const y = parseInt(m[1]), mo = parseInt(m[2]) + 1, d = parseInt(m[3]);
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    const all = (table.rows || []).map((r) => {
      const c = r.c || [];
      const get = (i) => (i !== -1 && c[i] ? c[i].v : "");
      return {
        id: get(idx.id), nama: get(idx.nama),
        tarikhMula: gvizDateToIso(get(idx.tarikhMula)), tarikhAkhir: gvizDateToIso(get(idx.tarikhAkhir)),
        perkara: get(idx.perkara),
      };
    }).filter((r) => r.id && r.nama);

    const todayStr = todayIso();
    todoItems = all.filter((r) => jgNorm(r.nama) === jgNorm(namaUser) && r.tarikhAkhir >= todayStr)
      .sort((a, b) => a.tarikhMula.localeCompare(b.tarikhMula));
  } catch (e) {
    todoItems = [];
  }
}

function todoRenderCard() {
  const listEl = document.getElementById("jg-home-list");
  const dateEl = document.getElementById("jg-home-date");
  if (dateEl) dateEl.textContent = "Senarai Tugasan";
  if (!listEl) return;

  if (!todoItems.length) {
    listEl.innerHTML = `<div class="empty-state" style="padding:14px 2px;font-size:11px">Tiada tugasan buat masa ini.</div>`;
  } else {
    listEl.innerHTML = todoItems.map((t) => `
      <div class="todo-row">
        <div class="todo-row-main">
          <div class="todo-perkara">${jgEscape(t.perkara)}</div>
          <div class="todo-tarikh">${t.tarikhMula} &rarr; ${t.tarikhAkhir}</div>
        </div>
        <div class="todo-row-actions">
          <button class="todo-icon-btn" onclick="todoOpenForm('${t.id}')" aria-label="Edit">✎</button>
          <button class="todo-icon-btn todo-del" onclick="todoDeleteItem('${t.id}')" aria-label="Padam">🗑</button>
        </div>
      </div>`).join("");
  }
  listEl.innerHTML += `<button class="todo-add-btn" onclick="todoOpenForm(null)">+ Tambah Tugasan</button>`;
}

function todoOpenForm(id) {
  const item = id ? todoItems.find((t) => t.id === id) : null;
  document.getElementById("todo-form-id").value = id || "";
  document.getElementById("todo-form-title").textContent = id ? "Kemaskini Tugasan" : "Tambah Tugasan";
  document.getElementById("todo-f-tarikh-mula").value = item ? item.tarikhMula : todayIso();
  document.getElementById("todo-f-tarikh-akhir").value = item ? item.tarikhAkhir : "";
  document.getElementById("todo-f-perkara").value = item ? item.perkara : "";
  document.getElementById("todo-form-error").classList.add("hidden");
  document.getElementById("todo-modal-overlay").classList.remove("hidden");
}
function todoCloseForm() {
  document.getElementById("todo-modal-overlay").classList.add("hidden");
}

async function todoSubmitForm() {
  const errEl = document.getElementById("todo-form-error");
  errEl.classList.add("hidden");
  const id = document.getElementById("todo-form-id").value;
  const tarikhMula = document.getElementById("todo-f-tarikh-mula").value;
  const tarikhAkhir = document.getElementById("todo-f-tarikh-akhir").value;
  const perkara = document.getElementById("todo-f-perkara").value.trim();

  if (!tarikhMula || !tarikhAkhir || !perkara) {
    errEl.textContent = "Sila lengkapkan semua medan.";
    errEl.classList.remove("hidden");
    return;
  }
  if (tarikhAkhir < tarikhMula) {
    errEl.textContent = "Tarikh Akhir mesti sama atau selepas Tarikh Mula.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!apiConfigured()) { errEl.textContent = "API belum disambungkan."; errEl.classList.remove("hidden"); return; }

  const btn = document.getElementById("todo-submit-btn");
  btn.disabled = true; btn.textContent = "Menyimpan...";
  try {
    const action = id ? "editTodoItem" : "addTodoItem";
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action, id, email: todoCurrentUser.email, tarikhMula, tarikhAkhir, perkara }),
    });
    const data = await res.json();
    if (data.success) {
      todoCloseForm();
      await todoFetchItems(todoCurrentUser.nama);
      todoRenderCard();
    } else {
      errEl.textContent = data.message || "Gagal simpan tugasan.";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "Ralat sambungan ke server.";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false; btn.textContent = "Simpan";
}

async function todoDeleteItem(id) {
  if (!confirm("Padam tugasan ini?")) return;
  if (!apiConfigured()) return;
  try {
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "deleteTodoItem", id }) });
    const data = await res.json();
    if (data.success) {
      await todoFetchItems(todoCurrentUser.nama);
      todoRenderCard();
    } else {
      alert(data.message || "Gagal padam tugasan.");
    }
  } catch (err) {
    alert("Ralat sambungan ke server.");
  }
}

/* ================= Kad Home: Jadual Waktu Saya (hari semasa) ================= */
const JG_DAY_BY_GETDAY = [null, "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", null]; // 0=Ahad,6=Sabtu

async function jgRenderHomeCard(user) {
  todoCurrentUser = user;
  if (todoIsEligible(user)) {
    await todoFetchItems(user.nama);
    todoRenderCard();
    return;
  }

  const listEl = document.getElementById("jg-home-list");
  const dateEl = document.getElementById("jg-home-date");
  if (!listEl) return;

  const today = new Date();
  const hariNames = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
  const dateLabel = `${hariNames[today.getDay()]}, ${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
  if (dateEl) dateEl.textContent = dateLabel;

  const hariIni = JG_DAY_BY_GETDAY[today.getDay()];
  if (!hariIni) {
    listEl.innerHTML = `<div class="empty-state" style="padding:14px 2px;font-size:11px">Hujung minggu — tiada jadual waktu.</div>`;
    return;
  }

  listEl.innerHTML = `<div class="empty-state" style="padding:14px 2px;font-size:11px">Memuatkan...</div>`;
  if (!jgRecords.length) await jgFetchRecords();

  const nameNorm = jgNorm(user.nama);
  const mine = jgRecords
    .filter((r) => jgNorm(r.guru) === nameNorm && r.hari === hariIni && r.subjek)
    .sort((a, b) => a.slot - b.slot);

  if (!mine.length) {
    listEl.innerHTML = `<div class="empty-state" style="padding:14px 2px;font-size:11px">Tiada jadual waktu untuk hari ini.</div>`;
    return;
  }

  listEl.innerHTML = mine.map((r) => `
    <div class="jg-home-row">
      <span class="jg-home-waktu">Waktu ${r.slot}</span>
      <span class="jg-home-masa">${jgFmtWaktu(r.waktuMula)}&ndash;${jgFmtWaktu(r.waktuTamat)}</span>
      <span class="jg-home-subj">${jgEscape(r.subjek)}${r.kelas ? " (" + jgEscape(r.kelas) + ")" : ""}</span>
    </div>`).join("");
}

/* ================= Init ================= */
async function jgInit(user) {
  jgCurrentUser = user;
  jgCheckAccess(user);
  await jgFetchRecords();

  // "Jadual Saya" — sembunyikan untuk staf yang TIADA jadual mengajar
  // langsung (cth anggota kumpulan sokongan) — papar hanya untuk guru
  // yang wujud dalam data jadual (jgTeacherNames).
  const userNameNorm = jgNorm(user.nama);
  const hasScheduleData = jgTeacherNames.some((n) => jgNorm(n) === userNameNorm);
  document.getElementById("jg-nav-saya").classList.toggle("hidden", !hasScheduleData);
  if (hasScheduleData) {
    jgRenderIndividual(user.nama, "jg-individual-table", "jg-individual-title");
  }

  // "Jadual Kelas" — terbuka untuk SEMUA user juga
  const kelasSet = new Set(jgRecords.map((r) => r.kelas).filter(Boolean));
  const kelasList = Array.from(kelasSet).sort();
  const classSel = document.getElementById("jg-class-select");
  classSel.innerHTML = kelasList.map((k) => `<option value="${k}">${k}</option>`).join("");
  if (kelasList.length) document.getElementById("jg-kelas-table").innerHTML = jgBuildClassWeeklyTable(kelasList[0]);

  document.getElementById("jg-nav-semua").classList.toggle("hidden", !jgIsPentadbir);
  document.getElementById("jg-nav-analisis").classList.toggle("hidden", !jgIsPentadbir);
  document.getElementById("jg-nav-update").classList.toggle("hidden", !jgCanUpload);

  if (jgIsPentadbir) {
    const sel = document.getElementById("jg-teacher-select");
    sel.innerHTML = jgTeacherNames.map((n) => `<option value="${n}">${n}</option>`).join("");
    if (jgTeacherNames.length) jgRenderIndividual(jgTeacherNames[0], "jg-semua-table");
  }

  document.getElementById("jg-last-update").textContent = jgLastUpdate || "Belum pernah dikemaskini";

  jgSwitchTab(hasScheduleData ? "saya" : "kelas");
}

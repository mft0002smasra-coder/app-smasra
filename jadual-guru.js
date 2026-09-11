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

function jgEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function jgNorm(str) { return String(str || "").trim().toUpperCase().replace(/\s+/g, " "); }

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

/* ---------------- Fetch data jadual guru ---------------- */
async function jgFetchRecords() {
  if (!apiConfigured()) return;
  try {
    const res = await fetch(`${API_URL}?action=getJadualGuru`);
    const json = await res.json();
    jgRecords = json.data || [];
    jgLastUpdate = json.lastUpdate || "";
    const names = new Set(jgRecords.map((r) => r.guru));
    jgTeacherNames = Array.from(names).sort();
  } catch (e) {
    jgRecords = [];
    jgLastUpdate = "";
  }
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
      return `<td><div class="jg-cell"><span class="jg-cell-time">${jgFmtWaktu(rec.waktuMula)}-${jgFmtWaktu(rec.waktuTamat)}</span><span class="jg-cell-subj">${jgEscape(rec.subjek)}</span><span class="jg-cell-kelas">${jgEscape(rec.kelas)}</span></div></td>`;
    }).join("");
    rows.push(`<tr><td class="jg-slot-cell">${slot}</td>${cells}</tr>`);
  }
  return thead + "<tbody>" + rows.join("") + "</tbody>";
}

function jgRenderIndividual(guruName, tableElId, titleElId) {
  if (titleElId) document.getElementById(titleElId).textContent = guruName || "-";
  document.getElementById(tableElId).innerHTML = jgBuildWeeklyTable(guruName);
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
  ["saya", "semua", "analisis", "update"].forEach((n) => {
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
      if (!namaGuru) continue;

      for (let slot = 1; slot <= JG_MAX_SLOTS; slot++) {
        const col = 3 + slot; // E(indeks4)=slot1, F(indeks5)=slot2, dst.
        const raw = row[col];
        if (!raw || raw === 0 || raw === "0") continue;
        const { subjek, kelas } = jgSplitSubjekKelas(raw);
        if (!subjek) continue;
        rows.push({
          hari: hariMatch, guru: namaGuru, slot,
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
      await jgFetchRecords();
    } else {
      statusEl.textContent = result.message || "Gagal simpan jadual.";
    }
  } catch (err) {
    statusEl.textContent = "Ralat sambungan ke server (" + err.message + ").";
  }
  btn.disabled = false; btn.textContent = "Sahkan & Simpan ke Sheet";
}

/* ================= Kad Home: Jadual Waktu Saya (hari semasa) ================= */
const JG_DAY_BY_GETDAY = [null, "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", null]; // 0=Ahad,6=Sabtu

async function jgRenderHomeCard(user) {
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
    <div class="db-my-kh-row">
      <span class="db-my-kh-date">Waktu ${r.slot}</span>
      <span class="db-my-kh-masa">${jgFmtWaktu(r.waktuMula)}&ndash;${jgFmtWaktu(r.waktuTamat)}</span>
      <span class="db-my-kh-catatan">${jgEscape(r.subjek)}${r.kelas ? " (" + jgEscape(r.kelas) + ")" : ""}</span>
    </div>`).join("");
}

/* ================= Init ================= */
async function jgInit(user) {
  jgCurrentUser = user;
  jgCheckAccess(user);
  await jgFetchRecords();

  // "Jadual Saya" — asas untuk SEMUA user, tak kira kebenaran lain
  jgRenderIndividual(user.nama, "jg-individual-table", "jg-individual-title");

  document.getElementById("jg-nav-semua").classList.toggle("hidden", !jgIsPentadbir);
  document.getElementById("jg-nav-analisis").classList.toggle("hidden", !jgIsPentadbir);
  document.getElementById("jg-nav-update").classList.toggle("hidden", !jgCanUpload);

  if (jgIsPentadbir) {
    const sel = document.getElementById("jg-teacher-select");
    sel.innerHTML = jgTeacherNames.map((n) => `<option value="${n}">${n}</option>`).join("");
    if (jgTeacherNames.length) jgRenderIndividual(jgTeacherNames[0], "jg-semua-table");
  }

  document.getElementById("jg-last-update").textContent = jgLastUpdate || "Belum pernah dikemaskini";

  jgSwitchTab("saya");
}

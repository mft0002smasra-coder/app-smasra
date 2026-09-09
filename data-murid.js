/* ============================================================
   DATA MURID — Enrolmen, Senarai Murid, Analisis (upload CSV/XLSX)
   Pengecam awalan "dm" (Data Murid).
   ============================================================ */

const DM_SPREADSHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";

const DM_CLASS_LIST = [
  "1 Ar-Razi", "1 Ibnu Rushd", "1 Al-Farabi",
  "2 Ar-Razi", "2 Ibnu Rushd", "2 Al-Farabi",
  "3 Ar-Razi", "3 Ibnu Rushd", "3 Al-Farabi",
  "4 Ar-Razi", "4 Ibnu Rushd", "4 Al-Farabi",
  "5 Ar-Razi", "5 Ibnu Rushd", "5 Al-Farabi",
  "6 Al-Ghazali", "6 Al Bukhari",
];
function dmNorm(str) { return String(str || "").trim().toUpperCase().replace(/\s+/g, " "); }
function dmTingkatanOf(kelas) { const m = String(kelas).match(/^(\d)/); return m ? m[1] : "?"; }
function dmEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

let dmCurrentUser = null;
let dmCanUpload = false;
let dmStudents = [];

/* ---------------- Akses (Analisis/Upload) ---------------- */
function dmCheckUploadAccess(user) {
  const jawatanUpper = String(user.jawatan || "").trim().toUpperCase();
  const isDataMuridGuru = jawatanUpper === "PPP (GURU DATA MURID)";
  const isAdmin = String(user.role || "").trim().toLowerCase() === "admin";
  return isDataMuridGuru || isAdmin;
}

/* ---------------- Fetch data murid (gviz, baca awam) ---------------- */
async function dmFetchStudents() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${DM_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("DatabaseMurid")}&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const rows = JSON.parse(jsonStr).table.rows;
    dmStudents = rows.map((r) => {
      const c = r.c || [];
      return {
        nama: (c[0] && c[0].v) || "",
        noKP: String((c[1] && c[1].v) || ""),
        kelas: (c[2] && c[2].v) || "",
        jantina: (c[3] && c[3].v) || "",
        asrama: (c[4] && c[4].v) || "",
        catatan: (c[5] && c[5].v) || "",
      };
    }).filter((s) => s.nama && s.kelas);
  } catch (e) {
    dmStudents = [];
  }
  return dmStudents;
}

/* ================= Tab 1: Enrolmen Murid ================= */
function dmComputeEnrolment() {
  const byClass = {};
  DM_CLASS_LIST.forEach((k) => { byClass[k] = { L: 0, P: 0, jumlah: 0, asramaL: 0, asramaP: 0, asramaJumlah: 0 }; });

  dmStudents.forEach((s) => {
    // Padan nama kelas fleksibel (trim/case/spasi)
    const match = DM_CLASS_LIST.find((k) => dmNorm(k) === dmNorm(s.kelas));
    if (!match) return;
    const isL = String(s.jantina).trim().toUpperCase() === "L";
    // LA = Lelaki Asrama, PA = Perempuan Asrama (kedua-dua bermaksud DALAM asrama)
    // T = Tanpa Asrama / Luar Asrama (BUKAN asrama)
    const asramaCode = dmNorm(s.asrama);
    const isAsrama = asramaCode === "LA" || asramaCode === "PA";
    const bucket = byClass[match];
    if (isL) bucket.L++; else bucket.P++;
    bucket.jumlah++;
    if (isAsrama) {
      if (isL) bucket.asramaL++; else bucket.asramaP++;
      bucket.asramaJumlah++;
    }
  });
  return byClass;
}

function dmRenderEnrolment() {
  const byClass = dmComputeEnrolment();
  const tingkatanGroups = {};
  DM_CLASS_LIST.forEach((k) => {
    const t = dmTingkatanOf(k);
    if (!tingkatanGroups[t]) tingkatanGroups[t] = [];
    tingkatanGroups[t].push(k);
  });

  let bil = 1;
  let rowsHtml = "";
  const grand = { L: 0, P: 0, jumlah: 0, asramaL: 0, asramaP: 0, asramaJumlah: 0 };

  Object.keys(tingkatanGroups).sort().forEach((t) => {
    const sub = { L: 0, P: 0, jumlah: 0, asramaL: 0, asramaP: 0, asramaJumlah: 0 };
    tingkatanGroups[t].forEach((k) => {
      const d = byClass[k];
      sub.L += d.L; sub.P += d.P; sub.jumlah += d.jumlah;
      sub.asramaL += d.asramaL; sub.asramaP += d.asramaP; sub.asramaJumlah += d.asramaJumlah;
      rowsHtml += `<tr>
        <td>${bil++}</td><td class="dm-kelas-cell">${dmEscape(k)}</td>
        <td>${d.L}</td><td>${d.P}</td><td class="dm-b">${d.jumlah}</td>
        <td>${d.asramaL}</td><td>${d.asramaP}</td><td class="dm-b">${d.asramaJumlah}</td>
      </tr>`;
    });
    rowsHtml += `<tr class="dm-subtotal">
      <td></td><td>JUMLAH</td>
      <td>${sub.L}</td><td>${sub.P}</td><td class="dm-b">${sub.jumlah}</td>
      <td>${sub.asramaL}</td><td>${sub.asramaP}</td><td class="dm-b">${sub.asramaJumlah}</td>
    </tr>`;
    grand.L += sub.L; grand.P += sub.P; grand.jumlah += sub.jumlah;
    grand.asramaL += sub.asramaL; grand.asramaP += sub.asramaP; grand.asramaJumlah += sub.asramaJumlah;
  });

  rowsHtml += `<tr class="dm-grandtotal">
    <td colspan="2">JUMLAH BESAR</td>
    <td>${grand.L}</td><td>${grand.P}</td><td class="dm-b">${grand.jumlah}</td>
    <td>${grand.asramaL}</td><td>${grand.asramaP}</td><td class="dm-b">${grand.asramaJumlah}</td>
  </tr>`;

  document.getElementById("dm-enrolment-table-body").innerHTML = rowsHtml;
  document.getElementById("dm-summary-lelaki").textContent = `${grand.L} / ${grand.asramaL}`;
  document.getElementById("dm-summary-perempuan").textContent = `${grand.P} / ${grand.asramaP}`;
  document.getElementById("dm-summary-jumlah").textContent = `${grand.jumlah} / ${grand.asramaJumlah}`;
  document.getElementById("dm-total-note").textContent = dmStudents.length
    ? `Jumlah rekod murid dalam pangkalan data: ${dmStudents.length}`
    : "Tiada data murid lagi — sila muat naik data di tab Analisis.";
}

/* ================= Tab 2: Senarai Murid ================= */
function dmInitClassSelect() {
  const sel = document.getElementById("dm-class-select");
  if (sel.dataset.built) return;
  sel.innerHTML = DM_CLASS_LIST.map((k) => `<option value="${k}">${k}</option>`).join("");
  sel.dataset.built = "1";
  sel.addEventListener("change", dmRenderSenarai);
}
function dmRenderSenarai() {
  const kelas = document.getElementById("dm-class-select").value;
  const list = dmStudents.filter((s) => dmNorm(s.kelas) === dmNorm(kelas)).sort((a, b) => a.nama.localeCompare(b.nama));
  document.getElementById("dm-senarai-title").textContent = `Tingkatan: ${kelas}`;
  document.getElementById("dm-senarai-count").textContent = `${list.length} murid`;

  document.getElementById("dm-senarai-body").innerHTML = list.length
    ? list.map((s, i) => `<tr>
        <td>${i + 1}</td>
        <td class="dm-nama-cell">${dmEscape(s.nama)}</td>
        <td>${dmEscape(s.noKP)}</td>
        <td>${dmEscape(s.jantina)}</td>
        <td>${dmEscape(s.asrama)}</td>
        <td>${dmEscape(s.catatan)}</td>
      </tr>`).join("")
    : `<tr><td colspan="6" class="dm-empty-row">Tiada murid direkodkan untuk kelas ini.</td></tr>`;
}

/* ================= Tab 3: Analisis Data Murid (upload) ================= */
let dmParsedRows = [];
let dmXlsxReady = false;

function dmLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("gagal " + src));
    document.head.appendChild(s);
  });
}
async function dmEnsureXlsxLib() {
  if (dmXlsxReady || typeof XLSX !== "undefined") { dmXlsxReady = true; return; }
  const cdns = [
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
  ];
  for (const url of cdns) {
    try { await dmLoadScript(url); if (typeof XLSX !== "undefined") { dmXlsxReady = true; return; } } catch (e) {}
  }
}

const DM_HEADER_MAP = {
  NAMA: "nama",
  "NO PENGENALAN": "noKP", "NOMBOR PENGENALAN": "noKP", "NO KP": "noKP", NOKP: "noKP", "NO KAD PENGENALAN": "noKP",
  KELAS: "kelas", "NAMA KELAS": "kelasNama",
  TINGKATAN: "tingkatan", "TAHUN TINGKATAN": "tingkatan",
  JAN: "jantina", JANTINA: "jantina",
  ASRAMA: "asrama", "STATUS ASRAMA": "statusAsrama",
  CATATAN: "catatan",
};
const DM_TINGKATAN_WORD = {
  SATU: "1", DUA: "2", TIGA: "3", EMPAT: "4", LIMA: "5", ENAM: "6", STAM: "6",
};

// Buang tanda baca/simbol, tinggal huruf+nombor+spasi sahaja — untuk padanan
// header/kelas yang fleksibel (elak masalah "AL FARABI" vs "AL-FARABI" dsb.)
function dmNormHeader(h) {
  return String(h || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function dmFindHeaderRowIndex(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const row = aoa[i] || [];
    const normalized = row.map((c) => dmNormHeader(c));
    const hasNama = normalized.indexOf("NAMA") !== -1;
    const hasNoKp = normalized.some((h) => h.indexOf("PENGENALAN") !== -1 || h === "NO KP" || h === "NOKP");
    if (hasNama && hasNoKp) return i;
  }
  return 0; // fallback — andaian baris pertama ialah header
}

function dmExtractTingkatanDigit(raw) {
  const s = dmNormHeader(raw);
  for (const word in DM_TINGKATAN_WORD) {
    if (s.indexOf(word) !== -1) return DM_TINGKATAN_WORD[word];
  }
  const m = s.match(/(\d)/);
  return m ? m[1] : "";
}

function dmNormJantina(raw) {
  const s = dmNormHeader(raw);
  if (s === "LELAKI" || s === "L") return "L";
  if (s === "PEREMPUAN" || s === "P") return "P";
  return s.charAt(0) || "";
}

// Padankan "nama kelas" mentah (cth "AL FARABI") + digit tingkatan (cth "1")
// dengan entri DM_CLASS_LIST yang betul (cth "1 Al-Farabi") — abaikan sengkang/spasi.
function dmResolveKelas(tingkatanDigit, kelasNamaRaw) {
  const namaNorm = dmNormHeader(kelasNamaRaw);
  const found = DM_CLASS_LIST.find((k) => {
    const kDigit = dmTingkatanOf(k);
    const kNameNorm = dmNormHeader(k.replace(/^\d+\s*/, ""));
    return kDigit === tingkatanDigit && kNameNorm === namaNorm;
  });
  return found || `${tingkatanDigit} ${kelasNamaRaw}`.trim();
}

// LA = Lelaki Asrama, PA = Perempuan Asrama, T = Tanpa Asrama.
// Terima terus kod (LA/PA/T) ATAU "STATUS ASRAMA" (YA/kosong) + Jantina.
function dmDeriveAsrama(directRaw, statusAsramaRaw, jantinaNorm) {
  if (directRaw) {
    const s = dmNormHeader(directRaw);
    if (s === "LA" || s === "PA" || s === "T") return s;
  }
  if (statusAsramaRaw !== undefined) {
    const s = dmNormHeader(statusAsramaRaw);
    const inAsrama = s === "YA" || s === "Y" || s === "YES";
    if (!inAsrama) return "T";
    if (jantinaNorm === "L") return "LA";
    if (jantinaNorm === "P") return "PA";
  }
  return "";
}

function dmRowsFromAoa(aoa) {
  if (!aoa.length) return [];
  const headerIdx = dmFindHeaderRowIndex(aoa);
  const header = (aoa[headerIdx] || []).map((h) => dmNormHeader(h));
  const colIdx = {};
  header.forEach((h, i) => { if (DM_HEADER_MAP[h] && colIdx[DM_HEADER_MAP[h]] === undefined) colIdx[DM_HEADER_MAP[h]] = i; });

  const rows = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r.length) continue;
    const nama = colIdx.nama !== undefined ? String(r[colIdx.nama] || "").trim() : "";
    if (!nama) continue;

    const jantina = colIdx.jantina !== undefined ? dmNormJantina(r[colIdx.jantina]) : "";

    let kelas = "";
    if (colIdx.kelas !== undefined) {
      kelas = String(r[colIdx.kelas] || "").trim();
    } else if (colIdx.kelasNama !== undefined) {
      const tingkatanDigit = colIdx.tingkatan !== undefined ? dmExtractTingkatanDigit(r[colIdx.tingkatan]) : "";
      kelas = dmResolveKelas(tingkatanDigit, r[colIdx.kelasNama]);
    }

    let asrama = "";
    const directAsramaRaw = colIdx.asrama !== undefined ? r[colIdx.asrama] : null;
    const statusAsramaRaw = colIdx.statusAsrama !== undefined ? r[colIdx.statusAsrama] : undefined;
    asrama = dmDeriveAsrama(directAsramaRaw, statusAsramaRaw, jantina);

    rows.push({
      nama,
      noKP: colIdx.noKP !== undefined ? String(r[colIdx.noKP] || "").trim() : "",
      kelas,
      jantina,
      asrama,
      catatan: colIdx.catatan !== undefined ? String(r[colIdx.catatan] || "").trim() : "",
    });
  }
  return rows;
}

function dmParseCsvText(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  return lines.map((line) => {
    // Pemisah CSV ringkas — tak sokong koma dalam petikan (cukup untuk kes biasa)
    return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
  });
}

async function dmHandleFilePick(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const statusEl = document.getElementById("dm-upload-status");
  statusEl.textContent = "Membaca fail...";
  statusEl.classList.remove("hidden");

  const isXlsx = /\.xlsx?$/i.test(file.name);
  try {
    let aoa;
    if (isXlsx) {
      await dmEnsureXlsxLib();
      if (typeof XLSX === "undefined") throw new Error("Gagal muatkan pustaka XLSX. Cuba lagi bila ada internet.");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    } else {
      const text = await file.text();
      aoa = dmParseCsvText(text);
    }
    dmParsedRows = dmRowsFromAoa(aoa);
    dmRenderPreview();
  } catch (err) {
    statusEl.textContent = "Gagal baca fail: " + err.message;
  }
}

function dmRenderPreview() {
  const statusEl = document.getElementById("dm-upload-status");
  const previewBox = document.getElementById("dm-preview-box");
  if (!dmParsedRows.length) {
    statusEl.textContent = "Tiada rekod dikesan. Semak lajur header (Nama, No KP, Kelas, Jantina, Asrama, Catatan).";
    previewBox.classList.add("hidden");
    document.getElementById("dm-confirm-upload-btn").classList.add("hidden");
    return;
  }
  statusEl.textContent = `Jumpa ${dmParsedRows.length} rekod murid. Semak pratonton di bawah sebelum simpan.`;
  const previewRows = dmParsedRows.slice(0, 8);
  document.getElementById("dm-preview-body").innerHTML = previewRows.map((r) => `<tr>
      <td class="dm-nama-cell">${dmEscape(r.nama)}</td><td>${dmEscape(r.noKP)}</td>
      <td>${dmEscape(r.kelas)}</td><td>${dmEscape(r.jantina)}</td><td>${dmEscape(r.asrama)}</td>
    </tr>`).join("");
  document.getElementById("dm-preview-more").textContent = dmParsedRows.length > 8 ? `...dan ${dmParsedRows.length - 8} lagi` : "";
  previewBox.classList.remove("hidden");
  document.getElementById("dm-confirm-upload-btn").classList.remove("hidden");
}

async function dmConfirmUpload() {
  const statusEl = document.getElementById("dm-upload-status");
  const btn = document.getElementById("dm-confirm-upload-btn");
  if (!apiConfigured()) { statusEl.textContent = "API_URL belum disambung."; return; }
  btn.disabled = true; btn.textContent = "Menyimpan...";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "uploadDataMurid", email: dmCurrentUser.email, murid: dmParsedRows }),
    });
    const result = await res.json();
    if (result.success) {
      statusEl.textContent = `Berjaya! ${result.added} rekod baharu ditambah, ${result.updated} dikemaskini${result.skipped ? `, ${result.skipped} dilangkau (data tak lengkap)` : ""}.`;
      dmParsedRows = [];
      document.getElementById("dm-preview-box").classList.add("hidden");
      btn.classList.add("hidden");
      document.getElementById("dm-file-input").value = "";
      await dmFetchStudents();
      dmRenderEnrolment();
    } else {
      statusEl.textContent = result.message || "Gagal simpan data murid.";
    }
  } catch (err) {
    statusEl.textContent = "Ralat sambungan ke server (" + err.message + ").";
  }
  btn.disabled = false; btn.textContent = "Sahkan & Simpan ke Sheet";
}

/* ================= Navigasi tab ================= */
function dmSwitchTab(name) {
  ["enrolmen", "senarai", "analisis"].forEach((n) => {
    document.getElementById(`dm-panel-${n}`).classList.toggle("hidden", n !== name);
    document.getElementById(`dm-nav-${n}`).classList.toggle("active", n === name);
  });
  if (name === "senarai") { dmInitClassSelect(); dmRenderSenarai(); }
}

/* ================= Init ================= */
async function dmInit(user) {
  dmCurrentUser = user;
  dmCanUpload = dmCheckUploadAccess(user);

  const analisisNav = document.getElementById("dm-nav-analisis");
  if (!dmCanUpload) {
    analisisNav.classList.add("kn-disabled");
    analisisNav.setAttribute("onclick", "dmShowNoPermission()");
  }

  await dmFetchStudents();
  dmRenderEnrolment();
}
function dmShowNoPermission() {
  alert("Muat naik data murid hanya untuk Guru Data Murid atau Admin.");
}

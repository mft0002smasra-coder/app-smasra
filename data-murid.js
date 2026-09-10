/* ============================================================
   DATA MURID — Enrolmen, Senarai Murid, Analisis (upload CSV/XLSX)
   Pengecam awalan "dm" (Data Murid).
   [Versi: 61-lajur-KPM + auto-detect header row + smart-read-by-header]
   ============================================================ */
console.log("[Data Murid] data-murid.js dimuat — versi 61-lajur-KPM");

const DM_SPREADSHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";

/**
 * SEMUA lajur data murid — 61 lajur ikut eksport KPM/APDM sepenuhnya, +3
 * lajur terbitan (Kelas Gabungan/Asrama Kod/Catatan) yang dikira automatik
 * untuk memudahkan app papar (Enrolmen/Senarai). Disimpan SEMUA dalam Sheet
 * untuk kegunaan projek akan datang, walaupun app buat masa ini cuma
 * memaparkan sebahagian.
 */
const DM_CANONICAL_FIELDS = [
  { key: "idMurid", header: "ID MURID" },
  { key: "nama", header: "NAMA" },
  { key: "noPengenalan", header: "NO. PENGENALAN" },
  { key: "jenisPengenalan", header: "JENIS PENGENALAN" },
  { key: "tarikhLahir", header: "TARIKH LAHIR" },
  { key: "statusPengajian", header: "STATUS PENGAJIAN" },
  { key: "tarikhMasukSekolah", header: "TARIKH MASUK SEKOLAH" },
  { key: "tarikhMasukKelas", header: "TARIKH MASUK KELAS" },
  { key: "tahunTingkatan", header: "TAHUN / TINGKATAN" },
  { key: "namaKelas", header: "NAMA KELAS" },
  { key: "statusDlp", header: "STATUS DLP" },
  { key: "jenisKelas", header: "JENIS KELAS" },
  { key: "keteranganAliran", header: "KETERANGAN ALIRAN" },
  { key: "keteranganBidang", header: "KETERANGAN BIDANG" },
  { key: "namaGuruKelas", header: "NAMA GURU KELAS" },
  { key: "jantina", header: "JANTINA" },
  { key: "kaum", header: "KAUM" },
  { key: "agama", header: "AGAMA" },
  { key: "warganegara", header: "WARGANEGARA" },
  { key: "negaraAsal", header: "NEGARA ASAL" },
  { key: "statusAsrama", header: "STATUS ASRAMA" },
  { key: "namaAsrama", header: "NAMA ASRAMA" },
  { key: "statusOku", header: "STATUS OKU" },
  { key: "tarikhSahOku", header: "TARIKH SAH OKU" },
  { key: "noPendaftaranOku", header: "NO. PENDAFTARAN OKU" },
  { key: "tarikhDaftarOku", header: "TARIKH DAFTAR OKU" },
  { key: "tarikhKadOku", header: "TARIKH KAD OKU" },
  { key: "kategoriKetidakupayaan", header: "KATEGORI KETIDAKUPAYAAN" },
  { key: "subkategoriKetidakupayaan", header: "SUBKATEGORI KETIDAKUPAYAAN" },
  { key: "statusYatim", header: "STATUS YATIM" },
  { key: "noAkaunBank", header: "NO. AKAUN BANK" },
  { key: "namaBank", header: "NAMA BANK" },
  { key: "penjaga1", header: "PENJAGA 1" },
  { key: "noPengenalanPenjaga1", header: "NO. PENGENALAN PENJAGA 1" },
  { key: "jnsPengenalanPenjaga1", header: "JNS. PENGENALAN PENJAGA 1" },
  { key: "hubunganPenjaga1", header: "HUBUNGAN PENJAGA 1" },
  { key: "pekerjaanPenjaga1", header: "PEKERJAAN PENJAGA 1" },
  { key: "statusKerjaPenjaga1", header: "STATUS KERJA PENJAGA 1" },
  { key: "namaMajikanPenjaga1", header: "NAMA MAJIKAN PENJAGA 1" },
  { key: "pendapatanPenjaga1", header: "PENDAPATAN PENJAGA 1" },
  { key: "noTelPejabatPenjaga1", header: "NO. TEL. PEJABAT PENJAGA 1" },
  { key: "noTelBimbitPenjaga1", header: "NO. TEL. BIMBIT PENJAGA 1" },
  { key: "tanggungan", header: "TANGGUNGAN" },
  { key: "penjaga2", header: "PENJAGA 2" },
  { key: "noPengenalanPenjaga2", header: "NO. PENGENALAN PENJAGA 2" },
  { key: "jnsPengenalanPenjaga2", header: "JNS. PENGENALAN PENJAGA 2" },
  { key: "hubunganPenjaga2", header: "HUBUNGAN PENJAGA 2" },
  { key: "pekerjaanPenjaga2", header: "PEKERJAAN PENJAGA 2" },
  { key: "statusKerjaPenjaga2", header: "STATUS KERJA PENJAGA 2" },
  { key: "namaMajikanPenjaga2", header: "NAMA MAJIKAN PENJAGA 2" },
  { key: "pendapatanPenjaga2", header: "PENDAPATAN PENJAGA 2" },
  { key: "noTelPejabatPenjaga2", header: "NO. TEL. PEJABAT PENJAGA 2" },
  { key: "noTelBimbitPenjaga2", header: "NO. TEL. BIMBIT PENJAGA 2" },
  { key: "alamat1", header: "ALAMAT 1" },
  { key: "alamat2", header: "ALAMAT 2" },
  { key: "alamat3", header: "ALAMAT 3" },
  { key: "poskod", header: "POSKOD" },
  { key: "bandar", header: "BANDAR" },
  { key: "daerah", header: "DAERAH" },
  { key: "negeri", header: "NEGERI" },
  // Medan TERBITAN — dikira automatik, memudahkan paparan app
  { key: "kelas", header: "Kelas" },
  { key: "asramaKod", header: "Asrama" },
  { key: "catatan", header: "Catatan" },
];

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
let dmH2cReady = false;

function dmLoadScriptTag(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("gagal " + src));
    document.head.appendChild(s);
  });
}
async function dmEnsureHtml2Canvas() {
  if (dmH2cReady || typeof html2canvas !== "undefined") { dmH2cReady = true; return; }
  const cdns = [
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",
  ];
  for (const url of cdns) {
    try { await dmLoadScriptTag(url); if (typeof html2canvas !== "undefined") { dmH2cReady = true; return; } } catch (e) {}
  }
}
async function dmDownloadPng(elId, filenamePrefix, btn) {
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = "Menyediakan...";
  await dmEnsureHtml2Canvas();
  if (typeof html2canvas === "undefined") {
    alert("Gagal muatkan pustaka export. Cuba lagi bila ada sambungan internet.");
    btn.disabled = false; btn.textContent = originalText;
    return;
  }
  try {
    const el = document.getElementById(elId);
    const canvas = await html2canvas(el, { backgroundColor: "#F3E7D3", scale: 2, useCORS: true });
    const filename = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.png`;
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
    dmShowToast(`✓ Berjaya dimuat turun: ${filename}`);
  } catch (err) {
    alert("Gagal jana PNG: " + err.message);
  }
  btn.disabled = false; btn.textContent = originalText;
}

function dmShowToast(msg) {
  let toast = document.getElementById("dm-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "dm-toast";
    toast.className = "dm-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(dmShowToast._t);
  dmShowToast._t = setTimeout(() => toast.classList.remove("show"), 2800);
}

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
    const url = `https://docs.google.com/spreadsheets/d/${DM_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("DatabaseMurid")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;

    // "Kod bijak" — detect setiap lajur ikut NAMA header (bukan kedudukan tetap),
    // supaya susunan lajur dalam Sheet boleh berubah tanpa pecahkan paparan app.
    const cols = table.cols || [];
    const colKeyByIndex = {};
    cols.forEach((col, i) => {
      const label = dmNormHeader(col.label || "");
      if (DM_HEADER_TO_KEY[label]) colKeyByIndex[i] = DM_HEADER_TO_KEY[label];
    });

    dmStudents = (table.rows || []).map((r) => {
      const c = r.c || [];
      const rec = {};
      Object.keys(colKeyByIndex).forEach((i) => {
        const key = colKeyByIndex[i];
        const cell = c[i];
        rec[key] = cell && cell.v != null ? String(cell.v) : "";
      });
      return rec;
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
    const asramaCode = dmNorm(s.asramaKod);
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
  document.getElementById("dm-summary-lelaki-k").textContent = grand.L;
  document.getElementById("dm-summary-lelaki-a").textContent = grand.asramaL;
  document.getElementById("dm-summary-perempuan-k").textContent = grand.P;
  document.getElementById("dm-summary-perempuan-a").textContent = grand.asramaP;
  document.getElementById("dm-summary-jumlah-k").textContent = grand.jumlah;
  document.getElementById("dm-summary-jumlah-a").textContent = grand.asramaJumlah;
  document.getElementById("dm-total-note").textContent = dmStudents.length
    ? `Jumlah rekod murid dalam pangkalan data: ${dmStudents.length}`
    : "Tiada data murid lagi — sila muat naik data di tab Data.";
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
        <td>${dmEscape(s.noPengenalan)}</td>
        <td>${dmEscape(s.jantina)}</td>
        <td>${dmEscape(s.asramaKod)}</td>
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

// Buang tanda baca/simbol, tinggal huruf+nombor+spasi sahaja — untuk padanan
// header/kelas yang fleksibel (elak masalah "AL FARABI" vs "AL-FARABI" dsb.)
function dmNormHeader(h) {
  return String(h || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Peta terbalik: header ternormal -> kunci kanonikal (auto dari senarai atas)
const DM_HEADER_TO_KEY = {};
DM_CANONICAL_FIELDS.forEach((f) => { DM_HEADER_TO_KEY[dmNormHeader(f.header)] = f.key; });
// Alias tambahan — format ringkas sendiri (bukan eksport KPM terus)
DM_HEADER_TO_KEY[dmNormHeader("NO KP")] = "noPengenalan";
DM_HEADER_TO_KEY[dmNormHeader("NOKP")] = "noPengenalan";
DM_HEADER_TO_KEY[dmNormHeader("NO KAD PENGENALAN")] = "noPengenalan";
DM_HEADER_TO_KEY[dmNormHeader("KELAS")] = "kelas";
DM_HEADER_TO_KEY[dmNormHeader("TINGKATAN")] = "tahunTingkatan";
DM_HEADER_TO_KEY[dmNormHeader("JAN")] = "jantina";
DM_HEADER_TO_KEY[dmNormHeader("ASRAMA")] = "asramaKod";

const DM_TINGKATAN_WORD = {
  SATU: "1", DUA: "2", TIGA: "3", EMPAT: "4", LIMA: "5", ENAM: "6", STAM: "6",
};

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

/**
 * Baca SEMUA lajur yang dikenali dari fail (ikut nama header, fleksibel),
 * bukan hanya 6 medan asas — supaya SEMUA data KPM tersimpan untuk
 * kegunaan projek akan datang.
 */
function dmRowsFromAoa(aoa) {
  if (!aoa.length) return [];
  const headerIdx = dmFindHeaderRowIndex(aoa);
  const rawHeader = aoa[headerIdx] || [];
  const normHeader = rawHeader.map((h) => dmNormHeader(h));

  // colIdx: kunci kanonikal -> indeks lajur dalam fail dimuat naik
  const colIdx = {};
  normHeader.forEach((h, i) => { if (DM_HEADER_TO_KEY[h] && colIdx[DM_HEADER_TO_KEY[h]] === undefined) colIdx[DM_HEADER_TO_KEY[h]] = i; });

  const rows = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || !r.length) continue;
    const namaRaw = colIdx.nama !== undefined ? String(r[colIdx.nama] || "").trim() : "";
    if (!namaRaw) continue;

    const rec = {};
    DM_CANONICAL_FIELDS.forEach((f) => {
      if (colIdx[f.key] !== undefined) rec[f.key] = String(r[colIdx[f.key]] == null ? "" : r[colIdx[f.key]]).trim();
    });

    // Normalisasi jantina ke L/P (walaupun asal LELAKI/PEREMPUAN atau L/P terus)
    if (rec.jantina) rec.jantina = dmNormJantina(rec.jantina);

    // Terbitkan "kelas" (gabungan) kalau tak diberi terus tapi ada bahan mentah
    if (!rec.kelas && rec.namaKelas) {
      const tingkatanDigit = rec.tahunTingkatan ? dmExtractTingkatanDigit(rec.tahunTingkatan) : "";
      rec.kelas = dmResolveKelas(tingkatanDigit, rec.namaKelas);
    }

    // Terbitkan kod Asrama (LA/PA/T) kalau tak diberi kod terus
    if (!rec.asramaKod || !["LA", "PA", "T"].includes(dmNormHeader(rec.asramaKod))) {
      rec.asramaKod = dmDeriveAsrama(rec.asramaKod, rec.statusAsrama, rec.jantina);
    } else {
      rec.asramaKod = dmNormHeader(rec.asramaKod);
    }

    rows.push(rec);
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
  statusEl.textContent = `Membaca fail "${file.name}" (${(file.size / 1024).toFixed(0)} KB)...`;
  statusEl.classList.remove("hidden");

  const isXlsx = /\.xlsx?$/i.test(file.name);
  try {
    let aoa;
    if (isXlsx) {
      await dmEnsureXlsxLib();
      if (typeof XLSX === "undefined") throw new Error("Gagal muatkan pustaka XLSX (semak sambungan internet / cuba fail CSV sebagai alternatif).");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    } else {
      const text = await file.text();
      aoa = dmParseCsvText(text);
    }
    if (!aoa.length) throw new Error("Fail kosong atau format tak dikenali.");
    const headerIdx = dmFindHeaderRowIndex(aoa);
    console.log("[Data Murid] Baris dibaca:", aoa.length, "| Baris header dikesan pada indeks:", headerIdx, "| Kandungan header:", aoa[headerIdx]);
    dmParsedRows = dmRowsFromAoa(aoa);
    console.log("[Data Murid] Rekod berjaya diproses:", dmParsedRows.length);
    dmRenderPreview();
  } catch (err) {
    console.error("[Data Murid] Ralat baca fail:", err);
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
      <td class="dm-nama-cell">${dmEscape(r.nama)}</td><td>${dmEscape(r.noPengenalan)}</td>
      <td>${dmEscape(r.kelas)}</td><td>${dmEscape(r.jantina)}</td><td>${dmEscape(r.asramaKod)}</td>
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

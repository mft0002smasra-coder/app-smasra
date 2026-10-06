/* ============================================================
   ANALISIS INDIVIDU STAF — Kehadiran Staf -> Analisis eRKS -> "Individu"
   Untuk Pentadbir & Admin App. Satu pegawai, satu bulan: jumlah Kehadiran, Lewat,
   Tidak Mengisi eRKS dan Keberadaan. Klik kad -> popup senarai (kad yang boleh
   dimuat turun sebagai PNG, dengan nama pegawai, tajuk analisis, bulan & tahun di atas).

   Peraturan Lewat/Tepat/Rekod/Belum datang daripada dbClassifyDay (erks-database.js) —
   SUMBER YANG SAMA dengan kad "Rekod Kehadiran Saya" di Home dan Buku Kehadiran, jadi
   angka di sini sentiasa sepadan dengan apa yang pegawai itu nampak sendiri.
   Data: dbBookKehadiranRows / dbBookRekodRows / dbStaffRoster (dimuat oleh dbLoadBookRecords).
   ============================================================ */

const IND_MON = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
const IND_HARI = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const IND_SEKOLAH = "SM ARAB (JAIM) AL-ASYRAF";

// "Tidak mengisi" hanya dikira pada HARI BEKERJA. Cuti umum/sekolah tiada senarai dalam app, jadi dikesan
// automatik: hari Isnin–Jumaat di mana sekurang-kurangnya IND_MIN_PERATUS daripada staf (minimum IND_MIN_BIL
// orang) mengisi Kehadiran. Tanpa ini, setiap cuti umum akan dikira "tidak mengisi" untuk SEMUA staf.
const IND_MIN_PERATUS = 0.10;
const IND_MIN_BIL = 3;

const IND_CARDS = {
  hadir: { judul: "Analisis Kehadiran", label: "Jumlah Kehadiran", kelas: "green", fail: "Kehadiran" },
  lewat: { judul: "Analisis Kelewatan", label: "Lewat", kelas: "gold", fail: "Lewat" },
  belum: { judul: "Analisis Tidak Mengisi eRKS", label: "Tidak Mengisi", kelas: "red", fail: "Tidak_Mengisi" },
  rekod: { judul: "Analisis Keberadaan", label: "Keberadaan", kelas: "blue", fail: "Keberadaan" },
};

let indUser = null;
let indAllowed = false;
let indSelKey = "";     // kunci pegawai terpilih (noKP|nama) — kekal walaupun senarai staf disegarkan
let indLast = null;     // hasil pengiraan terkini
let indOpenKey = null;  // kad popup yang sedang dibuka

/* ---------------- Akses ---------------- */
/** Pentadbir = jawatan PENGETUA / PK ... / GKMP ..., ATAU Role2 = Pentadbir; Admin App sentiasa dibenarkan. */
function indCanView(user) {
  if (!user) return false;
  if (String(user.role3 || "").trim().toLowerCase() === "admin app") return true;
  if (String(user.role2 || "").trim().toLowerCase() === "pentadbir") return true;
  const j = String(user.jawatan || "").trim().toUpperCase();
  return /^(PENGETUA|PK|GKMP)(\s|$)/.test(j);
}

/* ---------------- Pembantu tarikh ---------------- */
function indPad2(n) { return String(n).padStart(2, "0"); }
/** "2026-10-05" -> "05/Okt/2026" */
function indFmtDate(key) {
  const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${IND_MON[parseInt(m[2], 10) - 1]}/${m[1]}` : String(key);
}
/** Nama hari — bina Date guna komponen (bukan string) supaya tak terkesan zon waktu peranti. */
function indDayName(key) {
  const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? IND_HARI[new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getDay()] : "";
}

/* ---------------- Pengiraan (fungsi tulen — boleh diuji tanpa DOM) ---------------- */
/**
 * opts: { staff:{noKP,nama,jawatan}, kehadiranRows, rekodRows, rosterSize, tahun, bulan, today?:Date }
 * Pulang: { hadir[], lewat[], belum[], rekod[], hariBekerja[], pendingHariIni, ambang, tiadaNoKP }
 * Hanya hari Isnin–Jumaat sehingga hari ini (macam kad Home). Hari ini TIDAK dikira "tidak mengisi"
 * kalau belum ada rekod (hari belum tamat).
 */
function indComputeMonth(opts) {
  const { staff, kehadiranRows, rekodRows, rosterSize, tahun, bulan } = opts;
  const today = opts.today || new Date();
  const { kehadiranMap, rekodMap } = dbBuildKehadiranRekodMaps(kehadiranRows, rekodRows, tahun, bulan);

  // Bilangan staf (seluruh sekolah) yang mengisi Kehadiran pada setiap tarikh
  const perDate = new Map();
  kehadiranMap.forEach((_, k) => {
    const d = k.slice(k.lastIndexOf("|") + 1);
    perDate.set(d, (perDate.get(d) || 0) + 1);
  });
  const ambang = Math.max(IND_MIN_BIL, Math.ceil((rosterSize || 0) * IND_MIN_PERATUS));

  const todayKey = dbYmd(today);
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  const res = { staff, tahun, bulan, hadir: [], lewat: [], belum: [], rekod: [], hariBekerja: [], pendingHariIni: false, ambang, tiadaNoKP: !String(staff.noKP || "").trim() };

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(tahun, bulan - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const key = dbYmd(dt);
    if (key > todayKey) break; // hari akan datang tak dikira
    const isToday = key === todayKey;
    const hariKerja = (perDate.get(key) || 0) >= ambang;
    if (hariKerja) res.hariBekerja.push(key);

    const c = dbClassifyDay(staff.noKP, staff.nama, staff.jawatan, key, kehadiranMap, rekodMap);
    if (c.masaMasuk) {
      res.hadir.push({ key, masa: c.masaMasuk, lewat: c.lewat, lewatMinit: c.lewatMinit });
      if (c.lewat) res.lewat.push({ key, masa: c.masaMasuk, lewatMinit: c.lewatMinit });
    }
    if (c.rekod) {
      res.rekod.push({ key, tujuan: c.rekod.tujuan, perkara: c.rekod.perkara, masaMula: c.rekod.masaMula, masaTamat: c.rekod.masaTamat, sertaHadir: !!c.masaMasuk });
    }
    if (!c.masaMasuk && !c.rekod) {
      if (isToday) res.pendingHariIni = true;
      else if (hariKerja) res.belum.push({ key });
    }
  }
  return res;
}

/* ---------------- Senarai pegawai (carian + pilihan) ---------------- */
function indStaffKey(s) { return `${s.noKP}|${s.nama}`; }

function indRebuildStaffOptions() {
  const sel = document.getElementById("ind-staff");
  if (!sel) return;
  const q = dbNorm((document.getElementById("ind-search") || {}).value || "");
  const tokens = q ? q.split(" ") : [];
  const opts = ['<option value="">— Pilih pegawai —</option>'];
  let stillThere = false;
  dbStaffRoster.forEach((s, i) => {
    if (tokens.length) {
      const n = dbNorm(s.nama);
      if (!tokens.every((t) => n.includes(t))) return;
    }
    if (indStaffKey(s) === indSelKey) stillThere = true;
    opts.push(`<option value="${i}"${indStaffKey(s) === indSelKey ? " selected" : ""}>${dbEscape(s.nama)}</option>`);
  });
  sel.innerHTML = opts.join("");
  if (!stillThere) sel.value = "";
}

function indSelectedStaff() {
  return dbStaffRoster.find((s) => indStaffKey(s) === indSelKey) || null;
}

function indOnStaffChange() {
  const v = document.getElementById("ind-staff").value;
  indSelKey = v === "" ? "" : indStaffKey(dbStaffRoster[parseInt(v, 10)]);
  indRender();
}

/* ---------------- Paparan utama ---------------- */
function indPeriod() {
  return { bulan: parseInt(document.getElementById("ind-month").value, 10), tahun: parseInt(document.getElementById("ind-year").value, 10) };
}

function indRender() {
  const empty = document.getElementById("ind-empty");
  const result = document.getElementById("ind-result");
  if (!empty || !result) return;
  const staff = indSelectedStaff();
  if (!dbStaffRoster.length) { empty.textContent = "Memuatkan senarai pegawai..."; empty.classList.remove("hidden"); result.classList.add("hidden"); return; }
  if (!staff) {
    empty.textContent = "Pilih pegawai untuk melihat analisis individu.";
    empty.classList.remove("hidden"); result.classList.add("hidden");
    indLast = null;
    return;
  }
  const { bulan, tahun } = indPeriod();
  indLast = indComputeMonth({ staff, kehadiranRows: dbBookKehadiranRows, rekodRows: dbBookRekodRows, rosterSize: dbStaffRoster.length, tahun, bulan });

  empty.classList.add("hidden");
  result.classList.remove("hidden");
  document.getElementById("ind-who-name").textContent = staff.nama;
  document.getElementById("ind-who-sub").textContent = `${staff.jawatan || "-"} · ${DB_BULAN[bulan - 1]} ${tahun}`;
  Object.keys(IND_CARDS).forEach((k) => { document.getElementById("ind-val-" + k).textContent = indLast[k].length; });

  const notes = [`Hari bekerja dikesan: <b>${indLast.hariBekerja.length}</b> hari (Isnin–Jumaat; cuti umum/sekolah dikecualikan automatik).`];
  if (indLast.pendingHariIni) notes.push("Hari ini belum dikira sebagai “tidak mengisi”.");
  if (indLast.tiadaNoKP) notes.push('<span class="ind-warn">⚠️ No. KP pegawai ini tiada dalam Database eRKS — kehadiran tak dapat dipadankan.</span>');
  document.getElementById("ind-note").innerHTML = notes.join("<br>");
}

/* ---------------- Popup kad senarai ---------------- */
function indRowsHtml(key, r) {
  const list = r[key];
  if (!list.length) {
    const msg = { hadir: "Tiada rekod kehadiran bulan ini.", lewat: "Tiada kelewatan bulan ini. 🎉", belum: "Semua hari bekerja telah diisi. 🎉", rekod: "Tiada rekod keberadaan bulan ini." }[key];
    return `<div class="ind-empty-row">${msg}</div>`;
  }
  const dateCell = (k) => `<div class="ind-row-date"><b>${indFmtDate(k)}</b><small>${indDayName(k)}</small></div>`;
  return list.map((x) => {
    if (key === "hadir") {
      const badge = x.lewat ? `<span class="db-badge db-badge-lewat">LEWAT</span>` : `<span class="db-badge db-badge-tepat">TEPAT MASA</span>`;
      return `<div class="ind-row">${dateCell(x.key)}<div class="ind-row-mid">${dbFormatAmPm(x.masa)}</div><div class="ind-row-end">${badge}</div></div>`;
    }
    if (key === "lewat") {
      return `<div class="ind-row">${dateCell(x.key)}<div class="ind-row-mid">${dbFormatAmPm(x.masa)}</div><div class="ind-row-end"><span class="db-badge db-badge-lewat">+${x.lewatMinit} MINIT</span></div></div>`;
    }
    if (key === "belum") {
      return `<div class="ind-row">${dateCell(x.key)}<div class="ind-row-mid"></div><div class="ind-row-end"><span class="db-badge db-badge-belum">TIDAK MENGISI</span></div></div>`;
    }
    const masa = (x.masaMula || x.masaTamat) ? `<div class="ind-row-sub">${x.masaMula ? dbFormatAmPm(x.masaMula) : "-"} &ndash; ${x.masaTamat ? dbFormatAmPm(x.masaTamat) : "-"}</div>` : "";
    return `<div class="ind-row ind-row-rekod">${dateCell(x.key)}<div class="ind-row-wide"><span class="db-badge db-badge-rekod">${dbEscape(x.tujuan || "-")}</span>${x.perkara ? ` <span class="ind-row-perkara">${dbEscape(x.perkara)}</span>` : ""}${masa}</div></div>`;
  }).join("");
}

function indFillCard(key) {
  const r = indLast;
  if (!r) return false;
  const meta = IND_CARDS[key];
  const dijana = new Date();
  document.getElementById("ind-card").innerHTML = `
    <div class="ind-card-school">${IND_SEKOLAH}</div>
    <div class="ind-card-name">${dbEscape(r.staff.nama)}</div>
    <div class="ind-card-jawatan">${dbEscape(r.staff.jawatan || "-")}</div>
    <div class="ind-card-title">${meta.judul}</div>
    <div class="ind-card-period"><span>Bulan: <b>${DB_BULAN[r.bulan - 1]}</b></span><span>Tahun: <b>${r.tahun}</b></span></div>
    <div class="ind-card-total">Jumlah: <b>${r[key].length}</b> hari</div>
    <div class="ind-card-list">${indRowsHtml(key, r)}</div>
    <div class="ind-card-foot">Sumber: eRKS · dijana ${indFmtDate(dbYmd(dijana))} ${indPad2(dijana.getHours())}:${indPad2(dijana.getMinutes())}</div>`;
  return true;
}

function indOpenCard(key) {
  if (!IND_CARDS[key] || !indFillCard(key)) return;
  indOpenKey = key;
  document.getElementById("ind-modal-overlay").classList.add("active");
}
function indCloseModal() {
  document.getElementById("ind-modal-overlay").classList.remove("active");
  indOpenKey = null;
}
function indCloseModalOutside(e) { if (e.target === document.getElementById("ind-modal-overlay")) indCloseModal(); }

/* ---------------- Muat turun PNG (html2canvas, CDN dinamik — corak sama macam Laporan Pentadbir) ---------------- */
let indH2cReady = false;
function indLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function indEnsureHtml2Canvas() {
  if (indH2cReady || typeof html2canvas !== "undefined") { indH2cReady = true; return; }
  const sources = [
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",
  ];
  for (const url of sources) {
    try { await indLoadScript(url); if (typeof html2canvas !== "undefined") { indH2cReady = true; return; } } catch (e) { /* cuba sumber seterusnya */ }
  }
}

function indPngFileName() {
  const meta = IND_CARDS[indOpenKey];
  const clean = (s) => String(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `Analisis_${meta.fail}_${clean(indLast.staff.nama)}_${DB_BULAN[indLast.bulan - 1]}_${indLast.tahun}.png`;
}

async function indDownloadPng() {
  if (!indOpenKey || !indLast) return;
  const btn = document.getElementById("ind-png-btn");
  btn.disabled = true;
  btn.textContent = "Menyediakan...";
  let host = null;
  try {
    await indEnsureHtml2Canvas();
    if (typeof html2canvas === "undefined") { alert("Gagal muatkan pustaka export. Cuba lagi bila ada sambungan internet."); return; }
    // Klon di luar skrin pada lebar tetap: PNG penuh (tak terpotong oleh kawasan skrol popup) dan saiz sama pada semua peranti
    const src = document.getElementById("ind-card");
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:440px;";
    const clone = src.cloneNode(true);
    clone.removeAttribute("id");
    host.appendChild(clone);
    document.body.appendChild(host);
    const canvas = await html2canvas(clone, { backgroundColor: "#0a1228", scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = indPngFileName();
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    alert("Gagal jana PNG: " + err.message);
  } finally {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    btn.disabled = false;
    btn.textContent = "Muat Turun PNG";
  }
}

/* ---------------- Paparan Harian / Individu ---------------- */
function indSwitchView(name) {
  if (name === "individu" && !indAllowed) name = "harian";
  document.getElementById("rks-view-harian").classList.toggle("hidden", name !== "harian");
  document.getElementById("rks-view-individu").classList.toggle("hidden", name !== "individu");
  document.getElementById("rks-subtab-harian").classList.toggle("active", name === "harian");
  document.getElementById("rks-subtab-individu").classList.toggle("active", name === "individu");
  if (name === "individu") indOnData();
}

/** Dipanggil selepas data (senarai staf, kehadiran, rekod) dimuat / disegarkan. */
function indOnData() {
  if (!indAllowed) return;
  indRebuildStaffOptions();
  indRender();
  if (indOpenKey) { if (!indFillCard(indOpenKey)) indCloseModal(); } // popup terbuka: kemas kini kandungannya
}

/* ---------------- Mula ---------------- */
function indInit(user) {
  indUser = user;
  indAllowed = indCanView(user);
  const bar = document.getElementById("rks-subtabs");
  if (bar) bar.classList.toggle("hidden", !indAllowed);
  if (!indAllowed) return;

  const today = new Date();
  const monthSel = document.getElementById("ind-month");
  const yearSel = document.getElementById("ind-year");
  monthSel.innerHTML = DB_BULAN.map((b, i) => `<option value="${i + 1}">${b}</option>`).join("");
  monthSel.value = String(today.getMonth() + 1);
  const y = today.getFullYear();
  yearSel.innerHTML = [y - 1, y].map((v) => `<option value="${v}">${v}</option>`).join("");
  yearSel.value = String(y);

  document.getElementById("ind-search").addEventListener("input", indRebuildStaffOptions);
  document.getElementById("ind-staff").addEventListener("change", indOnStaffChange);
  monthSel.addEventListener("change", indRender);
  yearSel.addEventListener("change", indRender);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && indOpenKey) indCloseModal(); });
}

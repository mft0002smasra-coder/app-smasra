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

// "Tidak mengisi" hanya dikira pada HARI BEKERJA. Sebuah hari BUKAN hari bekerja bila:
//  (1) kalendar cuti (tab "Cuti", lihat hari-cuti.js) menyatakan cuti yang TERPAKAI untuk staf itu — cuti umum untuk semua;
//      cuti sekolah / perayaan KPM untuk GURU sahaja (staf sokongan lazimnya masih bertugas semasa cuti sekolah), ATAU
//  (2) ANGGARAN: kurang daripada IND_MIN_PERATUS staf (minimum IND_MIN_BIL orang) mengisi Kehadiran pada hari Isnin–Jumaat itu.
// Anggaran kekal sebagai jaring keselamatan: kalau kalendar tertinggal sesuatu, lebih baik KURANG menuduh pegawai tidak mengisi.
// Anggaran tersasar bila (a) hari cuti tetapi ramai tetap datang, atau (b) hari bekerja tetapi ramai staf tiada (kursus/gangguan).
const IND_MIN_PERATUS = 0.10;
const IND_MIN_BIL = 3;

const IND_CARDS = {
  hadir: { judul: "Analisis Kehadiran", label: "Jumlah Kehadiran", kelas: "green", fail: "Kehadiran" },
  lewat: { judul: "Analisis Kelewatan", label: "Lewat", kelas: "gold", fail: "Lewat" },
  belum: { judul: "Analisis Tidak Mengisi eRKS", label: "Tidak Mengisi", kelas: "red", fail: "Tidak_Mengisi" },
  rekod: { judul: "Analisis Keberadaan", label: "Keberadaan", kelas: "blue", fail: "Keberadaan" },
};

/* Fungsi daripada erks-database.js yang diperlukan modul ini. Fail-fail dimuat naik secara manual, jadi versi boleh tak sepadan
   (cth erks-database.js lama masih di pelayan / tersangkut dalam cache). Semak awal & beritahu dengan jelas — jangan biar
   ReferenceError senyap yang menghalang kad daripada keluar. */
const IND_DEPS = ["dbClassifyDay", "dbBuildKehadiranRekodMaps", "dbYmd", "dbNorm", "dbFormatAmPm", "dbEscape", "dbLoadBookRecords", "dbFetchSheet"];
function indMissingDeps() {
  const missing = IND_DEPS.filter((n) => typeof window[n] !== "function");
  if (typeof DB_BULAN === "undefined") missing.push("DB_BULAN");
  return missing;
}
function indSetEmpty(html, cls) {
  const el = document.getElementById("ind-empty");
  if (!el) return;
  el.innerHTML = html;
  el.classList.toggle("ind-broken", !!cls);
  el.classList.remove("hidden");
  const r = document.getElementById("ind-result");
  if (r) r.classList.add("hidden");
}
function indShowBroken(missing) {
  indSetEmpty(`<div class="ind-broken-title">⚠️ Fail aplikasi tidak sepadan</div>Fail <b>erks-database.js</b> di laman ini ialah versi lama (tiada: ${missing.join(", ")}).<br>Muat naik <b>erks-database.js</b> yang terkini ke GitHub, kemudian muat semula halaman.`, true);
  const input = document.getElementById("ind-search");
  if (input) input.disabled = true;
}

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

/** "2026-10-09" -> "09/Okt (Jumaat)" */
function indFmtShort(key) { return `${indFmtDate(key).slice(0, 6)} (${indDayName(key)})`; }

/** Sama dengan kategori "guru" dalam paparan Harian (PENGETUA / PK / GKMP / PPP). */
function indIsGuru(jawatan) {
  const j = String(jawatan || "").toUpperCase();
  return j.includes("PENGETUA") || j.includes("PK") || j.includes("GKMP") || j.includes("PPP");
}
function indNextWeekday(key) {
  const [y, m, d] = key.split("-").map(Number);
  let t = new Date(Date.UTC(y, m - 1, d + 1));
  while (t.getUTCDay() === 0 || t.getUTCDay() === 6) t = new Date(t.getTime() + 86400000);
  return t.toISOString().slice(0, 10);
}
/** Gabungkan hari bekerja BERTURUT-TURUT (Jumaat -> Isnin dikira berturut) dengan sebab yang sama -> julat ringkas. */
function indGroupExcluded(list) {
  const groups = [];
  list.slice().sort((a, b) => (a.key < b.key ? -1 : 1)).forEach((x) => {
    const g = groups[groups.length - 1];
    if (g && g.sebab === x.sebab && g.nama === x.nama && indNextWeekday(g.to) === x.key) g.to = x.key;
    else groups.push({ from: x.key, to: x.key, sebab: x.sebab, nama: x.nama });
  });
  return groups;
}
/** [{label, why}] — label ringkas ("09/Okt (Jumaat)" atau "07/Dis–31/Dis"), why = nama cuti atau "anggaran". */
function indExcludedItems(r) {
  return indGroupExcluded(r.dikecualikan).map((g) => ({
    label: g.from === g.to ? indFmtShort(g.from) : `${indFmtDate(g.from).slice(0, 6)}–${indFmtDate(g.to).slice(0, 6)}`,
    why: g.sebab === "kalendar" ? g.nama : `anggaran (kurang daripada ${r.ambang} staf mengisi)`,
  }));
}

/* ---------------- Pengiraan (fungsi tulen — boleh diuji tanpa DOM) ---------------- */
/**
 * opts: { staff:{noKP,nama,jawatan}, kehadiranRows, rekodRows, rosterSize, tahun, bulan, today?:Date }
 * opts tambahan: cutiMap (Map "yyyy-mm-dd" -> [entri cuti]), guru (boolean)
 * Pulang: { hadir[], lewat[], belum[], rekod[], hariBekerja[], dikecualikan[{key,sebab:"kalendar"|"anggaran",nama}], pendingHariIni, ambang, tiadaNoKP }
 * Hanya hari Isnin–Jumaat sehingga hari ini (macam kad Home). Hari ini TIDAK dikira "tidak mengisi"
 * kalau belum ada rekod (hari belum tamat).
 */
function indComputeMonth(opts) {
  const { staff, kehadiranRows, rekodRows, rosterSize, tahun, bulan } = opts;
  const today = opts.today || new Date();
  const applies = typeof hcApplies === "function" ? hcApplies : () => true; // hari-cuti.js tiada -> anggaran sahaja
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
  const res = { staff, tahun, bulan, hadir: [], lewat: [], belum: [], rekod: [], hariBekerja: [], dikecualikan: [], pendingHariIni: false, ambang, tiadaNoKP: !String(staff.noKP || "").trim() };

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(tahun, bulan - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const key = dbYmd(dt);
    if (key > todayKey) break; // hari akan datang tak dikira
    const isToday = key === todayKey;
    const cutiHari = ((opts.cutiMap && opts.cutiMap.get(key)) || []).filter((e) => applies(e, opts.guru));
    const anggaranOk = (perDate.get(key) || 0) >= ambang;
    const hariKerja = !cutiHari.length && anggaranOk;
    if (hariKerja) res.hariBekerja.push(key);
    else if (!isToday) {
      // bukan hari bekerja — dipaparkan beserta SEBAB supaya boleh disemak
      res.dikecualikan.push(cutiHari.length
        ? { key, sebab: "kalendar", nama: [...new Set(cutiHari.map((e) => e.nama).filter(Boolean))].join(" / ") || cutiHari[0].jenis }
        : { key, sebab: "anggaran", nama: "" });
    }

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

/* ---------------- Carian pegawai: hasil DIPAPARKAN sebagai senarai di bawah kotak ---------------- */
// (Versi awal menapis pilihan dalam <select> tertutup — hasil tak kelihatan langsung kepada pengguna.)
let indQueryDirty = false; // pengguna sedang menaip? (kalau tidak, senarai penuh dipaparkan walaupun kotak berisi nama terpilih)
let indShown = [];         // indeks roster bagi baris yang sedang dipaparkan
let indActive = -1;        // baris yang diserlahkan (papan kekunci)

function indStaffKey(s) { return `${s.noKP}|${s.nama}`; }
function indSelectedStaff() { return dbStaffRoster.find((s) => indStaffKey(s) === indSelKey) || null; }

/** Semua token carian mesti ada dalam nama (huruf besar/kecil & susunan tak penting): "fadly othman" -> MOHD FADLY BIN OTHMAN */
function indMatches(q) {
  const tokens = dbNorm(q).split(" ").filter(Boolean);
  const out = [];
  dbStaffRoster.forEach((s, i) => {
    if (!tokens.length) { out.push(i); return; }
    const n = dbNorm(s.nama);
    if (tokens.every((t) => n.includes(t))) out.push(i);
  });
  return out;
}

function indRenderResults() {
  const box = document.getElementById("ind-results");
  const input = document.getElementById("ind-search");
  if (!box || !input) return;
  if (!dbStaffRoster.length) { box.innerHTML = '<div class="ind-res-msg">Memuatkan senarai pegawai...</div>'; indShown = []; return; }
  const q = indQueryDirty ? input.value : "";
  indShown = indMatches(q);
  if (!indShown.length) {
    box.innerHTML = `<div class="ind-res-msg">Tiada pegawai sepadan dengan “${dbEscape(q.trim())}”.</div>`;
    return;
  }
  if (indActive >= indShown.length) indActive = indShown.length - 1;
  const count = indQueryDirty && q.trim() ? `${indShown.length} padanan` : `${indShown.length} pegawai`;
  box.innerHTML = `<div class="ind-res-count">${count}</div>` + indShown.map((ri, k) => {
    const st = dbStaffRoster[ri];
    const cls = (k === indActive ? " is-active" : "") + (indStaffKey(st) === indSelKey ? " is-selected" : "");
    return `<div class="ind-res-item${cls}" role="option" data-ri="${ri}"><span class="ind-res-name">${dbEscape(st.nama)}</span><span class="ind-res-sub">${dbEscape(st.jawatan || "-")}</span></div>`;
  }).join("");
}

/** Had tinggi senarai = kawasan yang BENAR-BENAR kelihatan: di atas bar navigasi, atau di atas papan kekunci telefon
 * bila ia terbuka (visualViewport mengecil). Tanpa ini senarai 260px tertutup sebahagiannya pada telefon pendek /
 * terbenam di belakang papan kekunci. Minimum 120px (sekurang-kurangnya dua baris + kepala). */
function indFitResults() {
  const box = document.getElementById("ind-results");
  const input = document.getElementById("ind-search");
  if (!box || !input) return;
  const vv = window.visualViewport;
  const viewH = vv ? vv.height : window.innerHeight;
  const keyboard = !!vv && window.innerHeight - vv.height > 120;
  const nav = document.querySelector(".bottom-nav-wrap");
  const reserve = keyboard ? 8 : ((nav ? nav.offsetHeight : 0) + 8);
  const inputBottom = input.getBoundingClientRect().bottom - (vv ? vv.offsetTop : 0);
  const avail = viewH - inputBottom - 6 - reserve;
  box.style.maxHeight = Math.max(120, Math.min(260, Math.floor(avail))) + "px";
}

/** Naikkan kotak carian ke bahagian atas skrin (di bawah pengepala tetap) supaya senarai hasil mendapat ruang
 * di atas papan kekunci telefon. Ruang skrol tambahan diberi sementara senarai terbuka, kerana halaman yang pendek
 * (belum pilih pegawai) tak cukup panjang untuk diskrol sejauh itu. */
function indRevealCombo() {
  const view = document.getElementById("rks-view-individu");
  if (view) view.style.paddingBottom = "320px";
  const combo = document.getElementById("ind-combo");
  if (combo && combo.scrollIntoView) combo.scrollIntoView({ block: "start", behavior: "smooth" });
}

function indOpenResults() {
  const box = document.getElementById("ind-results");
  box.classList.remove("hidden");
  document.getElementById("ind-search").setAttribute("aria-expanded", "true");
  indRenderResults();
  indFitResults();
}
/** revert=true: batalkan taipan yang tak dipilih — kotak kembali menunjukkan pegawai terpilih (atau kosong). */
function indCloseResults(revert) {
  document.getElementById("ind-results").classList.add("hidden");
  const view = document.getElementById("rks-view-individu");
  if (view) view.style.paddingBottom = "";
  const input = document.getElementById("ind-search");
  input.setAttribute("aria-expanded", "false");
  indQueryDirty = false;
  indActive = -1;
  if (revert) { const st = indSelectedStaff(); input.value = st ? st.nama : ""; }
}
function indResultsOpen() { return !document.getElementById("ind-results").classList.contains("hidden"); }

function indPick(ri) {
  const st = dbStaffRoster[ri];
  if (!st || indMissingDeps().length) return;
  indSelKey = indStaffKey(st);
  const input = document.getElementById("ind-search");
  input.value = st.nama;
  indCloseResults(false);
  document.getElementById("ind-clear").classList.remove("hidden");
  input.blur(); // tutup papan kekunci telefon supaya keputusan kelihatan
  indRender();
}
function indClearSelection() {
  indSelKey = "";
  const input = document.getElementById("ind-search");
  input.value = "";
  document.getElementById("ind-clear").classList.add("hidden");
  indQueryDirty = false;
  indRender();
  input.focus();
  indOpenResults();
}

function indOnSearchFocus() { indQueryDirty = false; indActive = -1; const i = document.getElementById("ind-search"); if (i.select) i.select(); indRevealCombo(); indOpenResults(); }
function indOnSearchInput() { indQueryDirty = true; indActive = 0; indOpenResults(); }
function indOnSearchKey(e) {
  if (e.key === "Escape") { if (indResultsOpen()) { indCloseResults(true); e.stopPropagation(); } return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!indResultsOpen()) { indOpenResults(); return; }
    if (!indShown.length) return;
    indActive = e.key === "ArrowDown" ? Math.min(indActive + 1, indShown.length - 1) : Math.max(indActive - 1, 0);
    indRenderResults();
    const el = document.querySelector("#ind-results .ind-res-item.is-active");
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    return;
  }
  if (e.key === "Enter") {
    if (indResultsOpen() && indShown.length) { e.preventDefault(); indPick(indShown[indActive >= 0 ? indActive : 0]); }
  }
}
function indOnResultsClick(e) {
  const item = e.target.closest ? e.target.closest(".ind-res-item") : null;
  if (item) indPick(parseInt(item.dataset.ri, 10));
}
/** Klik/sentuh di luar kotak carian menutup senarai. */
function indOnDocPointer(e) {
  if (!indResultsOpen()) return;
  const combo = document.getElementById("ind-combo");
  if (combo && !combo.contains(e.target)) indCloseResults(true);
}

/** Selepas data dimuat/disegarkan: selaraskan kotak dengan pegawai terpilih & segarkan senarai yang sedang terbuka. */
function indSyncSearch() {
  const input = document.getElementById("ind-search");
  if (!input) return;
  const st = indSelectedStaff();
  if (indSelKey && !st && dbStaffRoster.length) { indSelKey = ""; document.getElementById("ind-clear").classList.add("hidden"); } // pegawai sudah tiada dalam senarai
  const typing = document.activeElement === input && indQueryDirty;
  if (!typing) input.value = st ? st.nama : "";
  document.getElementById("ind-clear").classList.toggle("hidden", !indSelKey);
  if (indResultsOpen()) indRenderResults();
}

/* ---------------- Paparan utama ---------------- */
function indPeriod() {
  return { bulan: parseInt(document.getElementById("ind-month").value, 10), tahun: parseInt(document.getElementById("ind-year").value, 10) };
}

function indRender() {
  const empty = document.getElementById("ind-empty");
  const result = document.getElementById("ind-result");
  if (!empty || !result) return;
  const missing = indMissingDeps();
  if (missing.length) { indLast = null; indShowBroken(missing); return; }
  const staff = indSelectedStaff();
  if (!dbStaffRoster.length) { indSetEmpty("Memuatkan senarai pegawai..."); return; }
  if (!staff) { indLast = null; indSetEmpty("Pilih pegawai untuk melihat analisis individu."); return; }
  const { bulan, tahun } = indPeriod();
  try {
    const first = `${tahun}-${indPad2(bulan)}-01`, last = `${tahun}-${indPad2(bulan)}-${indPad2(new Date(tahun, bulan, 0).getDate())}`;
    const cutiMap = typeof hcDayMap === "function" ? hcDayMap(first, last) : new Map();
    indLast = indComputeMonth({ staff, kehadiranRows: dbBookKehadiranRows, rekodRows: dbBookRekodRows, rosterSize: dbStaffRoster.length, tahun, bulan, cutiMap, guru: indIsGuru(staff.jawatan) });
    indLast.kalendarAda = typeof hcMeta !== "undefined" && hcMeta.ok && hcMeta.count > 0;
    indLast.guru = indIsGuru(staff.jawatan);
    indLast.adaCutiSekolah = [...cutiMap.values()].some((arr) => arr.some((e) => typeof hcIsSekolah === "function" && hcIsSekolah(e)));
  } catch (err) {
    // Ralat pengiraan dipaparkan di sini (bukan senyap / bukan sebagai "gagal segar data Sheet")
    console.error("indComputeMonth:", err);
    indLast = null;
    indSetEmpty(`<div class="ind-broken-title">⚠️ Ralat mengira analisis</div>${dbEscape(err && err.message ? err.message : String(err))}`, true);
    return;
  }
  empty.classList.remove("ind-broken");

  empty.classList.add("hidden");
  result.classList.remove("hidden");
  document.getElementById("ind-who-name").textContent = staff.nama;
  document.getElementById("ind-who-sub").textContent = `${staff.jawatan || "-"} · ${DB_BULAN[bulan - 1]} ${tahun}`;
  Object.keys(IND_CARDS).forEach((k) => { document.getElementById("ind-val-" + k).textContent = indLast[k].length; });

  const notes = [indLast.kalendarAda
    ? `Hari bekerja: <b>${indLast.hariBekerja.length}</b> hari — mengikut <b>kalendar cuti</b> dan anggaran kehadiran (hari yang kurang daripada ${indLast.ambang} staf mengisi).`
    : `Hari bekerja (<b>anggaran</b>): <b>${indLast.hariBekerja.length}</b> hari. Kalendar cuti belum ada, jadi hari Isnin–Jumaat yang kurang daripada ${indLast.ambang} staf mengisi kehadiran dianggap bukan hari bekerja.`];
  if (indLast.dikecualikan.length) notes.push(`Dianggap bukan hari bekerja: ${indExcludedItems(indLast).map((x) => `<b>${dbEscape(x.label)}</b> — ${dbEscape(x.why)}`).join("; ")}.`);
  if (indLast.kalendarAda && !indLast.guru && indLast.adaCutiSekolah) notes.push("Cuti sekolah (penggal / perayaan KPM) dikira untuk guru sahaja; staf sokongan mengikut anggaran.");
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
    ${key === "belum" && r.dikecualikan.length ? `<div class="ind-card-foot ind-card-foot-note">Tidak termasuk hari yang bukan hari bekerja: ${indExcludedItems(r).map((x) => `${dbEscape(x.label)} — ${dbEscape(x.why)}`).join("; ")}</div>` : ""}
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
  indSyncSearch();
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

  const search = document.getElementById("ind-search");
  search.addEventListener("focus", indOnSearchFocus);
  search.addEventListener("click", () => { if (!indResultsOpen()) { indRevealCombo(); indOpenResults(); } });
  search.addEventListener("input", indOnSearchInput);
  search.addEventListener("keydown", indOnSearchKey);
  document.getElementById("ind-results").addEventListener("click", indOnResultsClick);
  document.getElementById("ind-clear").addEventListener("click", indClearSelection);
  document.addEventListener("pointerdown", indOnDocPointer);
  // Papan kekunci dibuka/ditutup atau skrin diputar: sesuaikan tinggi senarai yang sedang terbuka
  const refit = () => { if (indResultsOpen()) indFitResults(); };
  window.addEventListener("resize", refit);
  document.body.addEventListener("scroll", refit, { passive: true });
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", refit); window.visualViewport.addEventListener("scroll", refit); }
  monthSel.addEventListener("change", indRender);
  yearSel.addEventListener("change", indRender);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && indOpenKey) indCloseModal(); });
  const missing = indMissingDeps();
  if (missing.length) { console.error("kehadiran-staf-individu: fungsi tiada daripada erks-database.js:", missing.join(", ")); indShowBroken(missing); }
  // Bar status kalendar cuti (butang "Kemaskini Cuti" hanya untuk Admin App — dirender oleh hari-cuti.js)
  if (typeof hcRenderBar === "function") hcRenderBar(document.getElementById("ind-cuti-bar"), user, async () => indOnData());
}

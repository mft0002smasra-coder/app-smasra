/* ============================================================
   e-RPH ATAS TALIAN (embed Google Sites)
   - BACA  : gviz terus daripada Sheet e-RPH (tab eRPH_Minggu/eRPH_Hari/eRPH_Slot, RPT, RPT_Cadangan, eRPH_Tetapan, eRPH_Penyemak)
   - TULIS : Apps Script berasingan (Code-eRPH.gs) — gviz hanya boleh membaca
   - Guru  : senarai minggu, borang harian (slot kelas/masa ikut Jadual Guru), dropdown RPT, salin RPH sendiri,
             hantar (ke penyemak + pangkalan data sekali gus; RPH TIDAK dikunci), cetak/PDF
   - Penyemak (Pentadbir): semak SATU kali untuk satu hari, hantar semakan minggu
   - Tema cerah / gelap
   Bergantung: app.js (initApp, postToAppsScript, escapeHtml), jadual-guru.js (jgFetchRecords, jgRecords, jgNorm, jgFmtWaktuRekod, jgMinsOf)
   ============================================================ */

const ERP_SHEET_ID = "1u5sK1oy179PI8Lc0x8eWBQ_SR_W8qWMUXVAhDEhgo7w";
// Tampal URL Web App (.../exec) projek Apps Script e-RPH di sini selepas Deploy (lihat Code-eRPH.gs)
const ERP_API_URL = "https://script.google.com/macros/s/AKfycbz1guqEIMvyhlCPuKV5V33nntli3CKEsrEr5wIuSWJJi2eSDMBXG8nEsu9zjmTgwEc6/exec";

const ERP_HARI = ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat"];
const ERP_ELEMEN = ["Penyayang", "Berdaya Tahan", "Berupaya Memimpin", "Warganegara Aktif"];
const ERP_MAX_SLOT = 10;
const ERP_K = [
  ["tema", "Tema / Bidang Pembelajaran"],
  ["tajuk", "Tajuk"],
  ["stdKandungan", "Standard Kandungan"],
  ["stdPembelajaran", "Standard Pembelajaran"],
  ["objektif", "Objektif Pembelajaran"],
  ["ringkasan", "Ringkasan Aktiviti"],
];
// Susunan lajur tab (mesti sama dengan Code-eRPH.gs)
const ERP_MCOL = ["key", "emel", "nama", "minggu", "awal", "akhir", "status", "tarikhHantar", "penyemak", "tarikhSemak", "kemaskini"];
const ERP_HCOL = ["key", "emel", "nama", "minggu", "hariNo", "tarikh", "status", "karAda", "karMula", "karAkhir", "karElemen", "karCatatan", "semakan", "semakOleh", "semakTarikh", "ulasan", "kemaskini"];
const ERP_SCOL = ["key", "emel", "nama", "minggu", "tarikh", "hariNo", "slotNo", "kelas", "tingkatan", "subjek", "mula", "akhir", "ujian", "pentakAda", "tema", "tajuk", "stdKandungan", "stdPembelajaran", "objektif", "ringkasan", "pentaksiran", "refleksi", "kehadiran", "kemaskini"];

let S = {
  user: null, isPny: false, tab: "saya", view: "senarai", minggu: 0, weeks1: null,
  mine: { minggu: {}, hari: {}, slot: {} }, // minggu[n] ; hari["n|h"] ; slot["n|h"] = [..]
  rpt: [], cad: [], pnyMap: [], jadual: [], cur: null, busy: false,
  cal: { rows: [], ok: false }, cuti: [],
  hd: { loaded: false, busy: false, staff: [], rows: [], tahun: 0, minggu: 0, guru: "", at: "" },
  tet: { loaded: false, rows: [], staff: [], pnyList: [], asg: {}, q: "", cal: { tahun: 0, rows: [], dirty: false } },
  rev: { list: [], sel: null, days: {}, slots: {}, hari: 1, filter: "tunggu", loaded: false },
};

/* ================= Pembantu umum ================= */
const E = (s) => escapeHtml(s == null ? "" : String(s));
const A = (s) => escapeAttr(s == null ? "" : String(s));
const norm = (s) => String(s == null ? "" : s).toUpperCase().replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");
const isPC = () => window.matchMedia("(min-width:760px)").matches;
const erpConfigured = () => ERP_API_URL && ERP_API_URL.indexOf("PASTE_") !== 0;

function isoOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function dateOf(iso) { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function addDays(iso, n) { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); }
function dmy(iso) { const d = dateOf(iso); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() : ""; }
function dmyHari(iso, hariNo) { return dmy(iso) + " (" + ERP_HARI[hariNo - 1] + ")"; }
function dm(iso) { const d = dateOf(iso); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) : ""; }
function toMin(t) { const m = String(t || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
function fromMin(n) { n = ((n % 1440) + 1440) % 1440; return pad(Math.floor(n / 60)) + ":" + pad(n % 60); }
function t12(t) { const m = toMin(t); if (m === null) return ""; const h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + ":" + pad(mm) + " " + (h < 12 ? "AM" : "PM"); }
/* Dialog pengesahan dalam aplikasi: confirm() asal disekat senyap dalam iframe Google Sites (tiada allow-modals), jadi butang tidak berfungsi */
function ask(msg) {
  return new Promise((res) => {
    const w = document.createElement("div"); w.className = "erp-ask";
    w.innerHTML = '<div class="erp-ask-box" role="dialog" aria-modal="true"><p></p><div class="erp-ask-bt"><button type="button" class="erp-ask-no">Batal</button><button type="button" class="erp-ask-ok">Ya, teruskan</button></div></div>';
    w.querySelector("p").textContent = msg;
    const done = (v) => { w.remove(); res(v); };
    w.querySelector(".erp-ask-ok").onclick = () => done(true);
    w.querySelector(".erp-ask-no").onclick = () => done(false);
    w.addEventListener("click", (e) => { if (e.target === w) done(false); });
    document.body.appendChild(w); w.querySelector(".erp-ask-ok").focus();
  });
}
function toast(msg, err, sticky) {
  const el = document.getElementById("erp-toast"); if (!el) return;
  el.textContent = msg; el.classList.toggle("err", !!err); el.classList.toggle("busy", !!sticky); el.classList.remove("hidden");
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  clearTimeout(el._t); if (!sticky) el._t = setTimeout(() => el.classList.add("hidden"), err ? 6500 : 3000);
}
function tingOf(kelas) {
  const m = String(kelas || "").match(/(?:^|[^0-9])([1-6])(?![0-9])/);
  return m ? m[1] : "";
}
function isPentadbir(u) {
  if (String(u.role3 || "").trim().toLowerCase() === "admin app") return true;
  const j = String(u.jawatan || "").trim().toUpperCase();
  return j === "PK" || ["PENGETUA", "PK ", "GKMP"].some((k) => j.startsWith(k));
}
const isAdminApp = (u) => String(u.role3 || "").trim().toLowerCase() === "admin app";

/* ================= gviz ================= */
async function erpGviz(sheet, tq, sid) {
  let url = `https://docs.google.com/spreadsheets/d/${sid || ERP_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}&headers=1&_ts=${Date.now()}`;
  if (tq) url += "&tq=" + encodeURIComponent(tq);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const parsed = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (parsed.status === "error") throw new Error("Tab '" + sheet + "' tidak dapat dibaca");
  return ((parsed.table && parsed.table.rows) || []).map((r) => (r.c || []).map((c) => (c && c.v != null ? String(c.f != null && /^Date\(/.test(String(c.v)) ? c.f : c.v) : "")));
}
function rowObj(arr, cols) { const o = {}; cols.forEach((k, i) => { o[k] = arr[i] == null ? "" : String(arr[i]); }); return o; }
/** Seperti erpGviz tetapi pulang {cols, rows} dengan nilai mentah (tarikh "Date(y,m,d)") — untuk tab yang perlu disahkan tajuk lajurnya. */
async function erpGvizTable(sheet, sid) {
  const url = `https://docs.google.com/spreadsheets/d/${sid || ERP_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}&headers=1&_ts=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const parsed = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (parsed.status === "error") throw new Error("Tab '" + sheet + "' tidak dapat dibaca");
  const t = parsed.table || {};
  return { cols: (t.cols || []).map((c) => String(c.label || "").trim().toUpperCase()), rows: (t.rows || []).map((r) => (r.c || []).map((c) => (c && c.v != null ? String(c.v) : ""))) };
}
function normDate(v) {
  const s = String(v == null ? "" : v).trim(); let m;
  if ((m = s.match(/^Date\((\d+),(\d+),(\d+)/))) return m[1] + "-" + pad(+m[2] + 1) + "-" + pad(+m[3]);
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + "-" + m[2] + "-" + m[3];
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1]);
  return "";
}
async function erpGvizSafe(sheet, tq, sid) { try { return await erpGviz(sheet, tq, sid); } catch (e) { return []; } }

async function erpPost(payload) {
  if (!erpConfigured()) throw new Error("API e-RPH belum dipasang (ERP_API_URL belum diisi dalam erph.js).");
  const r = await postToAppsScript(ERP_API_URL, payload);
  if (!r || r.success === false) throw new Error((r && r.message) || "Gagal menyimpan.");
  return r;
}
// Panggil Apps Script sekali untuk wujudkan tab yang belum ada (senyap; gagal tidak mengapa)
async function erpInitTabs() {
  if (!erpConfigured()) return;
  try { await fetch(ERP_API_URL + "?action=init"); } catch (e) { /* senyap */ }
}

/* ================= Minggu (ikut Kalendar Akademik; lalai ke MINGGU1_MULA jika kalendar tahun itu belum dimuat naik) =================
 * ID minggu disimpan dalam Sheet: tahun asas (2026) = 1..53 (sama seperti data sedia ada); tahun lain = (tahun-2026)*100 + nombor
 * (cth 2027 Minggu 1 = 100+1 = 101) supaya kunci data tidak bertindih antara tahun. */
let ERP_W1 = "2026-02-09"; // lalai; diganti oleh eRPH_Tetapan MINGGU1_MULA
const ERP_BASE_Y = 2026;
let ERP_WK = { list: [], byId: {}, years: [] };
const wkId = (y, no) => (y === ERP_BASE_Y ? no : (y - ERP_BASE_Y) * 100 + no);
const wkYear = (id) => (id >= 100 ? ERP_BASE_Y + Math.floor(id / 100) : ERP_BASE_Y);
const wkNo = (id) => (id >= 100 ? id % 100 : id);
const wkLbl = (id) => "Minggu " + wkNo(id);
function monOf(iso) { const d = dateOf(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); }
/** Senarai Isnin bagi minggu persekolahan: minggu yang ada sekurang-kurangnya satu hari Isn-Jum dalam [mula,tamat] yang BUKAN cuti penggal. */
function calWeeks(mula, tamat, cuti) {
  const out = []; let m = monOf(mula);
  for (let i = 0; i < 70 && m <= tamat; i++, m = addDays(m, 7)) {
    let sekolah = false;
    for (let h = 0; h < 5 && !sekolah; h++) {
      const d = addDays(m, h);
      if (d >= mula && d <= tamat && !cuti.some((c) => d >= c.mula && d <= (c.akhir || c.mula))) sekolah = true;
    }
    if (sekolah) out.push(m);
  }
  return out;
}
function calYearRows(rows) {
  const by = {}; rows.forEach((r) => { (by[r.tahun] = by[r.tahun] || []).push(r); }); return by;
}
function calSpan(rs) {
  const mula = rs.filter((r) => r.jenis === "Mula Sesi" && r.mula).map((r) => r.mula).sort()[0];
  const tamat = rs.filter((r) => r.jenis === "Tamat Sesi" && (r.akhir || r.mula)).map((r) => r.akhir || r.mula).sort().pop();
  return mula && tamat && mula <= tamat ? { mula, tamat, cuti: rs.filter((r) => r.jenis === "Cuti Penggal" && r.mula) } : null;
}
function calBuild() {
  const by = calYearRows(S.cal.rows), list = [], years = [];
  Object.keys(by).map(Number).sort().forEach((y) => {
    const sp = calSpan(by[y]); if (!sp) return;
    years.push(y); calWeeks(sp.mula, sp.tamat, sp.cuti).forEach((w, i) => list.push({ id: wkId(y, i + 1), no: i + 1, year: y, start: w }));
  });
  ERP_WK = { list, byId: {}, years }; list.forEach((w) => { ERP_WK.byId[w.id] = w; });
}
function weekStart(id) {
  const w = ERP_WK.byId[id]; if (w) return w.start;
  const y = wkYear(id), no = wkNo(id);
  return y === ERP_BASE_Y ? addDays(ERP_W1, (no - 1) * 7) : addDays(monOf(y + "-01-04"), (no - 1) * 7);
}
function weekEnd(n) { return addDays(weekStart(n), 4); }
function dayIso(n, h) { return addDays(weekStart(n), h - 1); }
function currentWeekNo() {
  const t = new Date(); const dow = t.getDay(); // 0=Ahad
  const mon = isoOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((dow + 6) % 7) + (dow === 0 || dow === 6 ? 7 : 0)));
  const L = ERP_WK.list;
  if (L.length) {
    const ex = L.find((w) => w.start === mon); if (ex) return ex.id;
    const nx = L.find((w) => w.start > mon); if (nx) return nx.id; // dalam cuti penggal: minggu persekolahan seterusnya
    if (mon <= addDays(L[L.length - 1].start, 28)) return L[L.length - 1].id;
  }
  const y = +mon.slice(0, 4);
  if (y > ERP_BASE_Y) return wkId(y, Math.max(1, Math.round((dateOf(mon) - dateOf(monOf(y + "-01-04"))) / (7 * 864e5)) + 1));
  return Math.max(1, Math.round((dateOf(mon) - dateOf(ERP_W1)) / (7 * 864e5)) + 1);
}
function weekRangeTxt(n) { return dmy(weekStart(n)) + " – " + dmy(weekEnd(n)); }

/* ---- Cuti: kalendar akademik (cuti penggal / cuti lain) + tab "Cuti" sheet utama (cuti umum Melaka + cuti perayaan KPM) ---- */
async function erpLoadCal() {
  try {
    const t = await erpGvizTable("eRPH_Kalendar");
    S.cal.rows = [];
    if (["TAHUN", "JENIS", "MULA"].every((c) => t.cols.includes(c))) {
      const ix = (c) => t.cols.indexOf(c);
      t.rows.forEach((r) => {
        const tahun = parseInt(r[ix("TAHUN")], 10), mula = normDate(r[ix("MULA")]), akhir = normDate(r[ix("AKHIR")]) || mula;
        if (tahun && mula) S.cal.rows.push({ tahun, jenis: String(r[ix("JENIS")] || "").trim(), nama: String(r[ix("NAMA")] || "").trim(), mula, akhir });
      });
      S.cal.ok = true;
    }
  } catch (e) { /* kalendar belum ada: guna MINGGU1_MULA */ }
  calBuild();
  try {
    const t = await erpGvizTable("Cuti", typeof SPREADSHEET_ID !== "undefined" ? SPREADSHEET_ID : "");
    S.cuti = [];
    if (["MULA", "TAMAT", "JENIS"].every((c) => t.cols.includes(c))) {
      const ix = (c) => t.cols.indexOf(c);
      t.rows.forEach((r) => {
        const mula = normDate(r[ix("MULA")]); if (!mula || /^(y|ya|yes|1|true)$/i.test(String(r[ix("ABAIKAN")] || "").trim())) return;
        let tamat = normDate(r[ix("TAMAT")]) || mula; if (tamat < mula) tamat = mula;
        S.cuti.push({ mula, tamat, jenis: String(r[ix("JENIS")] || "").trim(), nama: String(r[ix("NAMA")] || "").trim() });
      });
    }
  } catch (e) { /* tab Cuti tiada: abaikan */ }
}
/** Nama cuti bagi satu tarikh (cuti penggal, cuti lain, cuti umum, cuti perayaan KPM) atau null. */
function cutiOf(iso) {
  const hit = [];
  S.cuti.forEach((e) => { if (iso >= e.mula && iso <= e.tamat) hit.push(e); });
  S.cal.rows.forEach((r) => { if ((r.jenis === "Cuti Penggal" || r.jenis === "Cuti Lain") && iso >= r.mula && iso <= (r.akhir || r.mula)) hit.push(r); });
  if (!hit.length) return null;
  const p = hit.find((h) => h.nama) || hit[0];
  return { nama: p.nama || p.jenis || "Cuti" };
}

/* ================= Muat data ================= */
async function erpLoadCommon() {
  const [tet, rpt, cad, pny] = await Promise.all([
    erpGvizSafe("eRPH_Tetapan"), erpGvizSafe("RPT"), erpGvizSafe("RPT_Cadangan"), erpGvizSafe("eRPH_Penyemak"),
  ]);
  tet.forEach((r) => { if (String(r[0]).trim() === "MINGGU1_MULA" && /^\d{4}-\d{2}-\d{2}/.test(String(r[1]))) ERP_W1 = String(r[1]).slice(0, 10); });
  const mapRow = (r) => {
    const o = { subjek: r[0] || "", ting: String(r[1] == null ? "" : r[1]).trim(), tema: r[2] || "", tajuk: r[3] || "", stdKandungan: r[4] || "", stdPembelajaran: r[5] || "", objektif: r[6] || "", kriteria: r[7] || "", akt1: r[8] || "", akt2: r[9] || "", refleksi: r[10] || "" };
    o.ringkasan = [o.akt1, o.akt2].filter((x) => String(x).trim()).join("\n");
    return o;
  };
  S.rpt = rpt.map(mapRow).filter((o) => norm(o.subjek) && (o.tema || o.tajuk || o.stdKandungan || o.stdPembelajaran));
  S.cad = cad.map(mapRow).filter((o) => norm(o.subjek));
  S.pnyMap = pny.map((r) => ({ guru: norm(r[0]), pny: norm(r[1]) })).filter((x) => x.guru && x.pny);
}
async function erpLoadMine() {
  const em = String(S.user.email).toLowerCase().replace(/'/g, "");
  const q = `select * where lower(B) = '${em}'`;
  const [m, h, s] = await Promise.all([erpGvizSafe("eRPH_Minggu", q), erpGvizSafe("eRPH_Hari", q), erpGvizSafe("eRPH_Slot", q)]);
  S.mine = { minggu: {}, hari: {}, slot: {} };
  m.forEach((r) => { const o = rowObj(r, ERP_MCOL); S.mine.minggu[+o.minggu] = o; });
  h.forEach((r) => { const o = rowObj(r, ERP_HCOL); S.mine.hari[+o.minggu + "|" + +o.hariNo] = o; });
  s.forEach((r) => { const o = rowObj(r, ERP_SCOL); (S.mine.slot[+o.minggu + "|" + +o.hariNo] = S.mine.slot[+o.minggu + "|" + +o.hariNo] || []).push(o); });
  Object.keys(S.mine.slot).forEach((k) => S.mine.slot[k].sort((a, b) => +a.slotNo - +b.slotNo));
}
async function erpLoadJadual() {
  try { await jgFetchRecords(false); } catch (e) { /* jadual tidak kritikal */ }
}

/* ================= Jadual Guru -> slot hari ini ================= */
function jadualDay(hariNo) {
  const nama = norm(S.user.nama), hari = ERP_HARI[hariNo - 1];
  if (typeof jgRecords === "undefined") return [];
  let mine = jgRecords.filter((r) => norm(r.hari) === norm(hari) && norm(r.guru) === nama);
  if (!mine.length) mine = jgRecords.filter((r) => norm(r.hari) === norm(hari) && norm(r.guru) && (norm(r.guru).indexOf(nama) !== -1 || nama.indexOf(norm(r.guru)) !== -1) && nama.length > 5);
  mine.sort((a, b) => +a.slot - +b.slot);
  const out = [];
  mine.forEach((r) => {
    if (!norm(r.kelas) && !norm(r.subjek)) return;
    const mula = jgMinsOf(jgFmtWaktuRekod(r, "mula")), tamat = jgMinsOf(jgFmtWaktuRekod(r, "tamat"));
    const last = out[out.length - 1];
    if (last && norm(last.kelas) === norm(r.kelas) && norm(last.subjek) === norm(r.subjek) && +r.slot === last._slot + 1) {
      if (tamat !== null) last.akhir = fromMin(tamat);
      last._slot = +r.slot;
    } else {
      out.push({ kelas: typeof emCanonKelas === "function" ? emCanonKelas(r.kelas) : String(r.kelas || ""), subjek: String(r.subjek || ""), mula: mula === null ? "" : fromMin(mula), akhir: tamat === null ? "" : fromMin(tamat), _slot: +r.slot });
    }
  });
  return out;
}
function allKelas() {
  if (typeof emClasses === "function") { const em = emClasses().map((k) => k.nama); if (em.length) return em; }
  const set = new Set();
  if (typeof jgRecords !== "undefined") jgRecords.forEach((r) => { if (norm(r.kelas)) set.add(String(r.kelas).trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, "ms", { numeric: true }));
}
function allSubjek() {
  const set = new Set();
  S.rpt.forEach((r) => set.add(String(r.subjek).trim()));
  S.cad.forEach((r) => set.add(String(r.subjek).trim()));
  if (typeof jgRecords !== "undefined") jgRecords.forEach((r) => { if (norm(r.subjek)) set.add(String(r.subjek).trim()); });
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, "ms"));
}

/* ================= Model slot / hari ================= */
function blankSlot(o) {
  const s = Object.assign({ kelas: "", tingkatan: "", subjek: "", mula: "", akhir: "", ujian: false, pentakAda: false, tema: "", tajuk: "", stdKandungan: "", stdPembelajaran: "", objektif: "", ringkasan: "", pentaksiran: [], refleksi: "", kehadiran: "" }, o || {});
  if (!s.tingkatan) s.tingkatan = tingOf(s.kelas);
  return s;
}
function slotFromRow(r) {
  return blankSlot({ kelas: r.kelas, tingkatan: r.tingkatan, subjek: r.subjek, mula: r.mula, akhir: r.akhir, ujian: r.ujian === "YA", pentakAda: r.pentakAda === "YA", tema: r.tema, tajuk: r.tajuk, stdKandungan: r.stdKandungan, stdPembelajaran: r.stdPembelajaran, objektif: r.objektif, ringkasan: r.ringkasan, pentaksiran: String(r.pentaksiran || "").split(",").map((x) => x.trim()).filter(Boolean), refleksi: r.refleksi, kehadiran: r.kehadiran });
}
function dayFromRows(minggu, h, hRow, sRows) {
  return {
    minggu, hariNo: h, tarikh: dayIso(minggu, h), status: hRow ? hRow.status || "Draf" : "Draf", saved: !!hRow,
    semakan: hRow ? hRow.semakan : "", ulasan: hRow ? hRow.ulasan : "", semakOleh: hRow ? hRow.semakOleh : "",
    karakter: { ada: hRow ? hRow.karAda === "YA" : false, mula: hRow ? hRow.karMula : "", akhir: hRow ? hRow.karAkhir : "", elemen: hRow ? String(hRow.karElemen || "").split(",").map((x) => x.trim()).filter(Boolean) : [], catatan: hRow ? hRow.karCatatan : "" },
    slots: (sRows || []).map(slotFromRow),
  };
}
function loadDay(n, h) {
  const k = n + "|" + h, hr = S.mine.hari[k];
  const d = dayFromRows(n, h, hr, S.mine.slot[k]);
  if (!hr || (!d.slots.length && d.status !== "Cuti")) {
    const jd = jadualDay(h);
    d.slots = jd.length ? jd.map((j) => blankSlot(j)) : [blankSlot()];
  }
  if (!d.slots.length) d.slots = [blankSlot()];
  return d;
}
const dayStatus = (n, h) => { const r = S.mine.hari[n + "|" + h]; return r ? r.status : ""; };

/* ================= Padanan RPT ================= */
function rptPool() { return S.rpt.concat(S.cad); }
function subjMatch(a, b) { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.indexOf(b) !== -1 || b.indexOf(a) !== -1); }
function tingMatch(rt, st) { rt = String(rt || "").trim(); if (!st || !rt || rt === "0") return true; return rt.replace(/\D/g, "") === String(st); }
function candRows(slot, upto) {
  const base = rptPool().filter((r) => subjMatch(r.subjek, slot.subjek) && tingMatch(r.ting, slot.tingkatan));
  const idx = ERP_K.findIndex((k) => k[0] === upto);
  const earlier = ERP_K.slice(0, idx).map((k) => k[0]).filter((f) => f !== "ringkasan");
  const strict = base.filter((r) => earlier.every((f) => !norm(slot[f]) || norm(r[f]) === norm(slot[f])));
  return { rows: strict, base };
}
function optionsFor(slot, field) {
  const key = field === "refleksi" ? "refleksi" : field;
  const idx = field === "refleksi" ? ERP_K.length : ERP_K.findIndex((k) => k[0] === field);
  const base = rptPool().filter((r) => subjMatch(r.subjek, slot.subjek) && tingMatch(r.ting, slot.tingkatan));
  const earlier = ERP_K.slice(0, idx).map((k) => k[0]).filter((f) => f !== "ringkasan");
  let rows = base.filter((r) => earlier.every((f) => !norm(slot[f]) || norm(r[f]) === norm(slot[f])));
  let relaxed = false;
  if (!rows.length && base.length) { rows = base; relaxed = true; }
  const seen = new Set(), vals = [];
  rows.forEach((r) => { const v = String(r[key] || "").trim(); if (v && !seen.has(norm(v))) { seen.add(norm(v)); vals.push(v); } });
  return { vals, relaxed, none: !base.length };
}
function autoFillAfter(slot, field) {
  const start = ERP_K.findIndex((k) => k[0] === field) + 1;
  for (let i = start; i < ERP_K.length; i++) {
    const f = ERP_K[i][0];
    if (norm(slot[f])) continue;
    const o = optionsFor(slot, f);
    if (!o.relaxed && o.vals.length === 1) slot[f] = o.vals[0];
  }
  if (!norm(slot.refleksi)) { const o = optionsFor(slot, "refleksi"); if (!o.relaxed && o.vals.length === 1) slot.refleksi = o.vals[0]; }
}

/* ================= Tema cerah / gelap ================= */
function erpTemaGet() { try { return localStorage.getItem("erph_tema") === "gelap" ? "gelap" : "cerah"; } catch (e) { return "cerah"; } }
function erpTemaApply(t) {
  document.body.setAttribute("data-erp", t);
  try { localStorage.setItem("erph_tema", t); } catch (e) { /* senyap */ }
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "gelap" ? "#0e1626" : "#1d4fb8";
}
function erpTemaToggle() { erpTemaApply(erpTemaGet() === "gelap" ? "cerah" : "gelap"); render(); }

/* ================= Render: kerangka ================= */
function head() {
  const g = erpTemaGet() === "gelap";
  const bor = S.tab === "saya" && S.view === "borang" && S.cur && !isPC();
  const tools = `<div class="erp-head-tools"><button class="out" data-act="tema" type="button">${g ? "☀ Cerah" : "☾ Gelap"}</button><button class="out" data-act="logout" type="button">Log keluar</button></div>`;
  const inner = bor
    ? `<div class="hl bor"><span class="t">e-RPH</span><span class="wk"><span>${wkLbl(S.cur.minggu)}</span><span>${E(dmyHari(S.cur.tarikh, S.cur.hariNo))}</span></span></div>`
    : `<div class="hl"><span class="t">e-RPH</span><span class="t sch">SM ARAB (JAIM) AL-ASYRAF</span></div><div class="n">${E(S.user.nama)}</div>`;
  return `<div class="erp-head">${inner}${tools}</div>
    ${S.isPny ? `<div class="erp-tabs"><button class="erp-tab ${S.tab === "saya" ? "on" : ""}" data-act="tab" data-t="saya" type="button">RPH Saya</button><button class="erp-tab g ${S.tab === "semak" ? "on" : ""}" data-act="tab" data-t="semak" type="button">Semakan</button><button class="erp-tab g ${S.tab === "hantar" ? "on" : ""}" data-act="tab" data-t="hantar" type="button">Penghantaran</button>${isAdminApp(S.user) ? `<button class="erp-tab g ${S.tab === "tetapan" ? "on" : ""}" data-act="tab" data-t="tetapan" type="button">Tetapan</button>` : ""}</div>` : ""}`;
}
function render() {
  const root = document.getElementById("erp-root"); if (!root) return;
  root.classList.toggle("erp-semak", S.tab === "semak" || S.tab === "tetapan" || S.tab === "hantar");
  let body = "";
  if (S.tab === "semak") body = vSemak();
  else if (S.tab === "tetapan") body = vTetapan();
  else if (S.tab === "hantar") body = vHantar();
  else body = S.view === "borang" ? vBorang() : S.view === "dash" && isPC() ? vDash() : vSenarai();
  const y = window.scrollY;
  root.innerHTML = head() + `<div class="erp-main">${body}</div>`;
  if (S._keepScroll) window.scrollTo(0, y);
  S._keepScroll = false;
  S._dd = null; ddFitAll();
}
const pill = (cls, t) => `<span class="erp-pill ${cls}">${E(t)}</span>`;
function dayPill(n, h) {
  const r = S.mine.hari[n + "|" + h], wk = S.mine.minggu[n];
  if (!r) return { cls: "s-belum", t: "Belum", aksi: "Mula" };
  if (r.semakan === "Dipulang") return { cls: "s-pulang", t: "Dipulang", aksi: "Betulkan" };
  if (r.semakan === "Disemak") return { cls: "s-siap", t: "Disemak", aksi: "Buka" };
  if (r.status === "Cuti") return { cls: "s-belum", t: "Cuti", aksi: "Buka" };
  if (r.status === "Siap") return { cls: "s-siap", t: wk && wk.status === "Dihantar" ? "Dihantar" : "Siap", aksi: "Buka" };
  return { cls: "s-draf", t: "Draf", aksi: "Sambung" };
}

/* ================= Dashboard (PC) ================= */
const ERP_DN_C = 2 * Math.PI * 40;
function erpDonut(p, c, label, sub) {
  p = Math.max(0, Math.min(100, Math.round(p)));
  return `<div class="erp-dn"><svg width="88" height="88" viewBox="0 0 100 100" role="img" aria-label="${A(label)}"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--bar)" stroke-width="12"/><circle cx="50" cy="50" r="40" fill="none" stroke="${c}" stroke-width="12" stroke-dasharray="${(ERP_DN_C * p / 100).toFixed(1)} ${ERP_DN_C.toFixed(1)}" transform="rotate(-90 50 50)"/><text x="50" y="56" text-anchor="middle" font-size="20" font-weight="700" fill="var(--text)" font-family="Source Sans 3, sans-serif">${p}%</text></svg><b>${E(label)}</b><span>${E(sub)}</span></div>`;
}
function erpWeekInfo(n) {
  const wk = S.mine.minggu[n]; let siap = 0, pulang = null;
  for (let h = 1; h <= 5; h++) { const r = S.mine.hari[n + "|" + h]; if (!r) continue; if (r.status === "Siap" || r.status === "Cuti") siap++; if (r.semakan === "Dipulang") pulang = r; }
  let st = wk ? wk.status || "Draf" : "Draf";
  if (pulang) st = "Dipulang";
  const cls = { Draf: "s-draf", Dihantar: "s-belum", Disemak: "s-siap", Dipulang: "s-pulang" }[st] || "s-draf";
  const pny = st === "Dipulang" ? (pulang.semakOleh || "Penyemak") + " (perlu pembetulan)" : st === "Disemak" ? (wk && wk.penyemak) || "—" : st === "Dihantar" ? "Menunggu semakan" : "—";
  const aksi = st === "Dipulang" ? "Betulkan" : st === "Draf" ? "Sambung" : "Buka";
  return { n, siap, st, cls, pny, aksi };
}
function vDash() {
  const cur = currentWeekNo();
  const nums = [...new Set(Object.keys(S.mine.minggu).map(Number).concat(Object.keys(S.mine.hari).map((k) => +k.split("|")[0])))].filter((x) => x > 0).sort((a, b) => b - a);
  const infos = nums.map(erpWeekInfo);
  const adaCur = nums.indexOf(cur) !== -1;
  const rows = infos.slice(0, 20).map((w) => `<div class="erp-dr" data-act="buka-minggu" data-n="${w.n}"><span class="c1">${wkLbl(w.n)}</span><span class="c2">${E(dm(weekStart(w.n)) + " – " + dmy(weekEnd(w.n)))}</span><span class="c3">${w.siap} / 5</span><span class="c4">${pill(w.cls, w.st)}</span><span class="c5">${E(w.pny)}</span><span class="c6">${w.aksi} ›</span></div>`).join("");
  const total = infos.length, hantar = infos.filter((w) => w.st === "Dihantar" || w.st === "Disemak").length, semak = infos.filter((w) => w.st === "Disemak").length;
  const proses = infos.filter((w) => w.st === "Dihantar").length, draf = infos.filter((w) => w.st === "Draf" || w.st === "Dipulang").length;
  const pct = (a, b) => (b ? (a * 100) / b : 0);
  return `<div class="erp-dash">
    <div class="erp-card erp-dwk"><div><div class="lb">MINGGU SEMASA</div><div class="bg">${wkLbl(cur)} · ${E(weekRangeTxt(cur))}</div><div class="erp-hint">${adaCur ? "RPH minggu ini sudah dimulakan." : "RPH untuk minggu ini belum diwujudkan."}</div></div>
      <button class="erp-btn solid" style="height:54px;padding:0 28px;font-size:16px" data-act="buka-minggu" data-n="${cur}" type="button">${adaCur ? "Buka RPH " + wkLbl(cur) : "+ Wujudkan RPH " + wkLbl(cur)}</button></div>
    <div class="erp-dcols"><div class="erp-card erp-dlist"><h3>Rekod RPH saya</h3>
        <div class="erp-dr hd"><span class="c1">MINGGU</span><span class="c2">TEMPOH</span><span class="c3">HARI SIAP</span><span class="c4">STATUS</span><span class="c5">PENYEMAK</span><span class="c6">TINDAKAN</span></div>
        ${rows || `<div class="erp-empty">Belum ada RPH. Tekan butang di atas untuk memulakan.</div>`}</div>
      <div class="erp-card"><h3>Prestasi saya</h3><div class="erp-dns">${erpDonut(pct(hantar, total), "#1e8e5a", "Kadar Hantar", hantar + " / " + total + " minggu")}${erpDonut(pct(semak, hantar), "#1d7fa8", "Kadar Semak", semak + " / " + hantar)}${erpDonut(pct(semak, total), "#b7791f", "Selesai · Proses", semak + " · " + proses + " · " + draf)}</div>
        <div class="erp-hint" style="margin-top:10px">Belum hantar <b style="color:#c23b6a">${draf}</b> · Belum semak <b style="color:#6a4bd8">${proses}</b></div></div></div></div>`;
}
function revStatsHtml() {
  const L = S.rev.list, me = norm(S.user.nama);
  const done = L.filter((x) => x.status === "Disemak" && norm(x.penyemak) === me), tunggu = L.filter((x) => x.status === "Dihantar"), pulang = L.filter((x) => x.status === "Dipulang");
  const guru = new Set(done.map((x) => norm(x.nama))).size;
  const byW = {}; done.forEach((x) => { byW[+x.minggu] = (byW[+x.minggu] || 0) + 1; });
  const ws = Object.keys(byW).map(Number).sort((a, b) => b - a).slice(0, 6), mx = Math.max(1, ...ws.map((w) => byW[w]));
  const bars = ws.map((w) => `<div class="erp-bw"><span>M${wkNo(w)}</span><div class="erp-bar"><i style="width:${(byW[w] * 100) / mx}%"></i></div><b>${byW[w]}</b></div>`).join("") || `<div class="erp-hint">Belum ada semakan.</div>`;
  const tot = done.length + tunggu.length + pulang.length;
  return `<div class="erp-card erp-rstats"><h3>Prestasi semakan saya</h3>
    <div class="erp-kpis"><div><span>Jumlah disemak</span><b>${done.length}</b></div><div><span>Guru</span><b>${guru}</b></div><div><span>Menunggu</span><b style="color:#6a4bd8">${tunggu.length}</b></div></div>
    <div class="erp-dns" style="margin:10px 0">${erpDonut(tot ? (done.length * 100) / tot : 0, "#1e8e5a", "Selesai", done.length + " daripada " + tot)}${erpDonut(tot ? (tunggu.length * 100) / tot : 0, "#b7791f", "Proses", String(tunggu.length))}${erpDonut(tot ? (pulang.length * 100) / tot : 0, "#c23b4a", "Dipulang", String(pulang.length))}</div>
    <h3 style="margin-top:6px">Semakan mengikut minggu</h3>${bars}</div>`;
}

/* ================= Senarai minggu ================= */
function weekOptions() {
  const cur = currentWeekNo(), L = ERP_WK.list, i = L.findIndex((w) => w.id === cur);
  if (i !== -1) return L.slice(0, i + 2).map((w) => w.id).reverse();
  const out = [], lo = cur >= 100 ? Math.floor(cur / 100) * 100 + 1 : 1;
  for (let n = cur + 1; n >= lo; n--) out.push(n);
  return out;
}
function vSenarai() {
  const n = S.minggu, cur = currentWeekNo(), wk = S.mine.minggu[n];
  let siap = 0; const belum = [];
  for (let h = 1; h <= 5; h++) { const st = dayStatus(n, h); if (st === "Siap" || st === "Cuti") siap++; else belum.push("H" + h); }
  const pulang = []; for (let h = 1; h <= 5; h++) { const r = S.mine.hari[n + "|" + h]; if (r && r.semakan === "Dipulang") pulang.push(r); }
  const opts = weekOptions().map((w) => `<option value="${w}" ${w === n ? "selected" : ""}>${wkLbl(w)}${wkYear(w) !== wkYear(cur) ? " (" + wkYear(w) + ")" : ""} · ${weekRangeTxt(w)}${w === cur ? " · minggu semasa" : ""}</option>`).join("");
  const days = [1, 2, 3, 4, 5].map((h) => {
    const p = dayPill(n, h), k = n + "|" + h, nk = (S.mine.slot[k] || []).length;
    const ct = cutiOf(dayIso(n, h));
    const info = S.mine.hari[k] ? (S.mine.hari[k].status === "Cuti" ? "Cuti" + (ct ? ": " + ct.nama : " / tiada RPH") : nk + " kelas") : ct ? "Cuti: " + ct.nama : "Belum ditulis";
    return `<div class="erp-day" data-act="open-day" data-h="${h}" style="cursor:pointer"><div class="k ${p.cls}">H${h}</div><div class="m"><b>${ERP_HARI[h - 1]} <span style="display:inline;font-weight:400">· ${dm(dayIso(n, h))}</span></b><span>${E(info)}</span></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${pill(p.cls, p.t)}<span class="erp-link">${p.aksi} ›</span></div></div>`;
  }).join("");
  const wkBadge = wk ? { Draf: "s-draf", Dihantar: "s-belum", Disemak: "s-siap", Dipulang: "s-pulang" }[wk.status] || "s-draf" : "";
  const pulangBox = pulang.length ? `<div class="erp-card" style="border-color:#e3a0a0"><h3 style="color:#a12020">Dipulangkan untuk pembetulan</h3>${pulang.map((r) => `<div class="erp-hint"><b>H${r.hariNo} ${ERP_HARI[r.hariNo - 1]}</b>: ${E(r.ulasan || "(tiada ulasan)")}</div>`).join("")}</div>` : "";
  const can = siap === 5;
  const adaData = !!wk || [1, 2, 3, 4, 5].some((h) => S.mine.hari[n + "|" + h]);
  const ctList = [1, 2, 3, 4, 5].map((h) => ({ h, c: cutiOf(dayIso(n, h)) })).filter((x) => x.c);
  const wujudBox = adaData ? "" : `<div class="erp-card erp-wujud"><h3>RPH ${E(wkLbl(n))} belum diwujudkan</h3>
    <div class="erp-hint" style="margin-bottom:10px">Isnin hingga Jumaat akan dicipta sekali gus mengikut <b>Jadual Guru</b> anda (kelas, subjek, masa mula dan hingga). Hari cuti ditanda automatik${ctList.length ? ": " + E(ctList.map((x) => ERP_HARI[x.h - 1] + " (" + x.c.nama + ")").join(", ")) : ""}.</div>
    <button class="erp-btn solid" style="width:100%;height:46px" data-act="wujud-minggu" type="button">+ Wujudkan RPH ${E(wkLbl(n))}</button></div>`;
  return `<div class="erp-senarai">
  <div class="a-week"><div class="erp-card"><div class="erp-f" style="margin:0"><label class="erp-lbl" for="erp-wk">Pilih minggu</label><select id="erp-wk" class="erp-sel" data-act-change="minggu">${opts}</select></div>
    <div class="erp-between" style="margin-top:12px"><span style="font-weight:600">Kemajuan RPH minggu ini</span><span style="font-weight:700;color:var(--acc)">${siap} / 5 hari siap</span></div>
    <div class="erp-bar" style="margin-top:8px"><i style="width:${siap * 20}%"></i></div>
    ${wk ? `<div class="erp-hint" style="margin-top:8px">Status minggu: ${pill(wkBadge, wk.status)}${wk.tarikhHantar ? " · dihantar " + E(wk.tarikhHantar.slice(0, 16)) : ""}</div>` : ""}</div>
  ${wujudBox}${pulangBox}</div>
  <div class="a-days" style="display:flex;flex-direction:column;gap:10px">${days}</div>
  <div class="a-hantar erp-card dash"><button class="erp-btn ${can ? "ok" : ""}" style="width:100%;height:48px" data-act="hantar" type="button" ${can ? "" : "disabled"}>Hantar RPH ${wkLbl(n)}</button>
    <div class="erp-hint" style="text-align:center;margin-top:8px">${can ? "Semua hari siap." : "Butang aktif selepas H1–H5 semuanya ditanda siap. Belum siap: <b>" + E(belum.join(", ")) + "</b>."}</div></div>
  <div class="a-salin erp-card"><button class="erp-btn" style="width:100%" data-act="salin-minggu" type="button">⧉ Salin daripada RPH lama saya</button>
    <div class="erp-hint" style="margin-top:6px">Hanya RPH anda sendiri. Kandungan disalin bila tingkatan dan subjek sama; kelas dan waktu ikut Jadual Guru semasa.</div></div>
  <div class="a-muat erp-right">${isPC() ? `<button class="erp-btn sm" data-act="dash" type="button">‹ Dashboard</button>` : ""}<button class="erp-btn sm" data-act="muat" type="button">↻ Muat semula</button></div></div>`;
}

/* ================= Borang harian ================= */
function ddBox(f, lbl, val) {
  const ph = "Klik atau taip di sini…", simple = f === "kelas" || f === "subjek";
  const fld = simple ? `<input class="erp-dd-in" data-dd="${f}" value="${A(val)}" placeholder="${ph}" autocomplete="off">` : `<textarea class="erp-dd-in" data-dd="${f}" rows="1" placeholder="${ph}" autocomplete="off">${E(val)}</textarea>`;
  return `<div class="erp-f erp-ddf"><label class="erp-lbl">${lbl}</label><div class="erp-ddbox">${fld}<span class="arr" data-act="dd-arr" data-f="${f}">▾</span></div><div class="erp-ddlist hidden" id="erp-dd-${f}"></div></div>`;
}
function pickBox(f, lbl, val) {
  if (isPC()) return ddBox(f, lbl, val);
  const has = norm(val) !== "";
  return `<div class="erp-f">${`<label class="erp-lbl">${lbl}</label>`}<div class="erp-pickbox" data-act="pick" data-f="${f}" role="button" tabindex="0"><div class="pv ${has ? "" : "ph"}">${has ? E(val) : "Klik untuk pilih atau taip sendiri…"}</div><span class="arr">▾</span></div></div>`;
}
function dirty() { if (S.cur) S.cur.dirty = true; }
function vBorang() {
  const d = S.cur; if (!d) return "";
  const n = d.minggu;
  const tabs = [1, 2, 3, 4, 5].map((h) => {
    const st = h === d.hariNo ? "" : dayStatus(n, h);
    const cls = h === d.hariNo ? "cur" : st === "Siap" || st === "Cuti" ? "" : st === "Draf" ? "d" : "";
    const sub = h === d.hariNo ? "dibuka" : st === "Siap" ? "siap" : st === "Cuti" ? "cuti" : st === "Draf" ? "draf" : "belum";
    return `<button class="${cls}" data-act="goto-day" data-h="${h}" type="button">H${h}<small>${sub}</small></button>`;
  }).join("");
  const top = `<div class="erp-trow"><div class="erp-tabs-h">${tabs}</div>
    <div class="erp-right kem"><button class="erp-btn sm" data-act="kembali" type="button">‹ Kembali ke senarai</button></div></div>`;
  if (d.status === "Cuti") {
    return top + `<div class="erp-card"><h3>Hari cuti / tiada RPH</h3><div class="erp-hint">Hari ini ditandakan cuti. Tidak perlu RPH untuk hari ini.</div><div class="erp-right" style="margin-top:10px"><button class="erp-btn solid" data-act="batal-cuti" type="button">Batal cuti</button></div></div>`;
  }
  const ret = d.semakan === "Dipulang" ? `<div class="erp-card" style="border-color:#e3a0a0"><h3 style="color:#a12020">Dipulangkan oleh ${E(d.semakOleh || "penyemak")}</h3><div>${E(d.ulasan || "(tiada ulasan)")}</div></div>` : "";
  const chips = `<span class="erp-hint cnt">SLOT KELAS · ${d.slots.length} / ${ERP_MAX_SLOT}</span>` + d.slots.map((s, i) => `<button class="erp-chip ${i === d.idx ? "on" : ""}" data-act="slot" data-i="${i}" type="button"><b>Kelas ${i + 1}</b><small>${E(s.kelas || "—")}${s.mula ? " · " + t12(s.mula) : ""}</small></button>`).join("")
    + (d.slots.length < ERP_MAX_SLOT ? `<button class="erp-chip add" data-act="tambah-slot" type="button">+ Tambah kelas</button>` : "");
  const i = d.idx, s = d.slots[i];
  const jd = jadualDay(d.hariNo);
  const fieldsHtml = ERP_K.map(([f, lbl]) => {
    return pickBox(f, lbl, s[f]);
  }).join("");
  const pent = ["Pemerhatian", "Lisan", "Penulisan"].map((x) => `<label class="erp-chk"><input type="checkbox" data-pt="${x}" ${s.pentaksiran.indexOf(x) !== -1 ? "checked" : ""}>${x}</label>`).join("");
  const kar = d.karakter;
  const karBody = kar.ada ? `
    <div class="erp-f"><label class="erp-lbl">Tarikh</label><input class="erp-in" readonly value="${A(dmyHari(d.tarikh, d.hariNo))}"></div>
    <div class="erp-row"><div class="erp-f"><label class="erp-lbl">Masa mula</label><input class="erp-in" type="time" data-kf="mula" value="${A(kar.mula)}"></div>
      <div class="erp-f"><label class="erp-lbl">Masa akhir (+15 minit)</label><input class="erp-in" readonly data-kakhir value="${A(t12(kar.akhir))}"></div></div>
    <div class="erp-f"><label class="erp-lbl">Elemen Teras Karakter (boleh pilih lebih daripada satu)</label><div class="erp-opts">${ERP_ELEMEN.map((x) => `<label class="erp-opt2 ${kar.elemen.indexOf(x) !== -1 ? "on" : ""}"><input type="checkbox" data-el="${A(x)}" ${kar.elemen.indexOf(x) !== -1 ? "checked" : ""}>${x}</label>`).join("")}</div></div>
    <div class="erp-f"><label class="erp-lbl">Catatan Aktiviti</label><textarea class="erp-ta" rows="3" data-kf="catatan" placeholder="Contoh: Murid lelaki meletakkan tangan pada dada semasa bertegur sapa dengan rakan atau guru perempuan…">${E(kar.catatan)}</textarea></div>` : "";
  const siapKept = d.status === "Siap";
  return top + ret + `
  <div class="erp-bcols"><div class="erp-bl">${isPC() ? `<div class="erp-card erp-wkcard"><div class="lb">MINGGU</div><div class="b">${wkLbl(d.minggu)}</div><div class="dt">${E(dmyHari(d.tarikh, d.hariNo))}</div></div>` : ""}<div class="erp-chips slots">${chips}</div></div><div class="erp-br">
  <div><div class="erp-slothead"><span>MASA / KELAS : ${i + 1}</span><span>${d.slots.length > 1 ? `<button data-act="buang-slot" type="button">Buang</button>` : ""}</span></div>
    <div class="erp-slotbody">
      ${jd.length ? `<button class="erp-pick" style="margin:0 0 10px" data-act="pilih-jadual" type="button">▾ Pilih kelas &amp; waktu daripada Jadual Guru (${jd.length})</button>` : `<div class="erp-hint" style="margin-bottom:10px">Tiada Jadual Guru untuk ${ERP_HARI[d.hariNo - 1]}. Isi kelas dan waktu sendiri.</div>`}
      <div class="erp-slotrow">${pickBox("kelas", "Kelas", s.kelas)}${pickBox("subjek", "Subjek", s.subjek)}
        <div class="erp-f"><label class="erp-lbl">Masa mula</label><input class="erp-in" type="time" data-f="mula" value="${A(s.mula)}"></div>
        <div class="erp-f"><label class="erp-lbl">Hingga</label><input class="erp-in" type="time" data-f="akhir" value="${A(s.akhir)}"></div>
      <div class="erp-checks"><label class="erp-chk"><input type="checkbox" data-c="ujian" ${s.ujian ? "checked" : ""}>Ada Ujian</label><label class="erp-chk"><input type="checkbox" data-c="pentakAda" ${s.pentakAda ? "checked" : ""}>Ada Pentaksiran</label></div></div>
    </div></div>
  <div class="erp-card"><h3>Kandungan Pembelajaran</h3>
    <div class="erp-hint" style="margin:-4px 0 10px"><span id="erp-ts">Tingkatan ${s.tingkatan || "?"} · ${E(s.subjek || "subjek belum diisi")}.</span> <button class="erp-pick" style="display:inline;margin:0" data-act="salin-slot" type="button">⧉ Salin daripada RPH lama saya</button></div>
    ${fieldsHtml}
    <div class="erp-f"><label class="erp-lbl">Pentaksiran</label><div>${pent}</div></div></div>
  <div class="erp-card"><h3>Impak / Refleksi</h3>${pickBox("refleksi", "", s.refleksi).replace('<label class="erp-lbl"></label>', "").replace('class="erp-f"', 'class="erp-f" style="margin:0"')}</div>
  <div class="erp-card"><h3>Program Pembentukan Karakter (15 minit)</h3>
    <label class="erp-chk"><input type="checkbox" data-kar="ada" ${kar.ada ? "checked" : ""}>Pelaksanaan Aktiviti: ADA</label>${kar.ada ? `<div class="erp-sub">${karBody}</div>` : ""}</div>
  <div class="erp-right"><button class="erp-btn" data-act="cetak" type="button">Cetak / PDF</button><button class="erp-btn warn" data-act="cuti" type="button">Tandakan cuti</button><button class="erp-btn" data-act="simpan" type="button">${siapKept ? "Simpan perubahan" : "Simpan draf"}</button>${siapKept ? "" : `<button class="erp-btn solid" data-act="siap" type="button">Tanda hari ini siap</button>`}</div>
  <div class="erp-hint" style="text-align:center">“Hantar” hanya aktif di halaman senarai bila H1–H5 siap.</div>
  </div></div>`;
}

/* ================= Aksi borang ================= */
function syncKarAkhir() {
  const k = S.cur.karakter, m = toMin(k.mula);
  k.akhir = m === null ? "" : fromMin(m + 15);
  const el = document.querySelector("[data-kakhir]"); if (el) el.value = t12(k.akhir);
}
function onInput(e) {
  const t = e.target;
  if (S.tab === "tetapan") {
    if (t.dataset.ck !== undefined) { const r = S.tet.cal.rows[+t.dataset.ci]; if (r) { r[t.dataset.ck] = t.value; S.tet.cal.dirty = true; const pv = document.getElementById("cal-prev"); if (pv) pv.innerHTML = calPreviewHtml(); } return; }
    if (t.dataset.tk !== undefined) S.tet.rows[+t.dataset.tk].k = t.value;
    else if (t.dataset.tv !== undefined) S.tet.rows[+t.dataset.tv].v = t.value;
    else if (t.dataset.tq !== undefined) { S.tet.q = t.value; document.getElementById("tet-glist").innerHTML = tetGuruHtml(); }
    return;
  }
  if (!S.cur || S.view !== "borang") return;
  const s = S.cur.slots[S.cur.idx];
  if (t.dataset.dd !== undefined) {
    const f = t.dataset.dd; s[f] = t.value;
    if (f === "kelas") s.tingkatan = tingOf(t.value);
    dirty(); ddFit(t); ddRefresh(f, t.value);
    if (f === "kelas" || f === "subjek") { const ts = document.getElementById("erp-ts"); if (ts) ts.textContent = "Tingkatan " + (s.tingkatan || "?") + " · " + (s.subjek || "subjek belum diisi") + "."; }
  } else if (t.dataset.f !== undefined) {
    s[t.dataset.f] = t.value;
    if (t.dataset.f === "kelas") { s.tingkatan = tingOf(t.value); }
    dirty();
  } else if (t.dataset.kf !== undefined) {
    S.cur.karakter[t.dataset.kf] = t.value;
    if (t.dataset.kf === "mula") syncKarAkhir();
    dirty();
  }
}
function onChange(e) {
  const t = e.target;
  if (t.dataset.tg !== undefined) { const k = norm(t.dataset.tg); if (t.value) S.tet.asg[k] = t.value; else delete S.tet.asg[k]; return; }
  if (t.dataset.actChange === "minggu") { S.minggu = +t.value; render(); return; }
  if (t.dataset.actChange === "hd-tahun") { S.hd.tahun = +t.value; const ws = hdWeeks(S.hd.tahun); S.hd.minggu = ws.indexOf(S.hd.minggu) !== -1 ? S.hd.minggu : (ws[0] || 0); return render(); }
  if (t.dataset.actChange === "hd-minggu") { S.hd.minggu = +t.value; return render(); }
  if (t.dataset.actChange === "hd-guru") { S.hd.guru = t.value; return render(); }
  if (t.dataset.actChange === "cal-tahun") { calSelectYear(+t.value); return render(); }
  if (t.dataset.ck !== undefined && t.tagName === "SELECT") { const r = S.tet.cal.rows[+t.dataset.ci]; if (r) { r[t.dataset.ck] = t.value; S.tet.cal.dirty = true; } return render(); }
  if (t.dataset.calpdf !== undefined) { const f = t.files && t.files[0]; t.value = ""; if (f) calReadPdf(f); return; }
  if (S.view !== "borang" || !S.cur || S.tab !== "saya") return;
  const s = S.cur.slots[S.cur.idx];
  if (t.dataset.c) { s[t.dataset.c] = t.checked; dirty(); }
  else if (t.dataset.pt) { const a = s.pentaksiran, x = t.dataset.pt, i = a.indexOf(x); if (t.checked && i === -1) a.push(x); if (!t.checked && i !== -1) a.splice(i, 1); dirty(); }
  else if (t.dataset.kar === "ada") { S.cur.karakter.ada = t.checked; if (t.checked && !S.cur.karakter.mula) { S.cur.karakter.mula = "07:30"; syncKarAkhir(); } dirty(); S._keepScroll = true; render(); }
  else if (t.dataset.el) { const a = S.cur.karakter.elemen, x = t.dataset.el, i = a.indexOf(x); if (t.checked && i === -1) a.push(x); if (!t.checked && i !== -1) a.splice(i, 1); dirty(); t.closest(".erp-opt2").classList.toggle("on", t.checked); }
  else if (t.dataset.f === "kelas" || t.dataset.f === "subjek") { if (t.dataset.f === "kelas") s.tingkatan = tingOf(t.value); S._keepScroll = true; render(); }
}

function validateDay(d) {
  const err = [];
  d.slots.forEach((s, i) => {
    const p = "Kelas " + (i + 1) + ": ";
    if (!norm(s.kelas)) err.push(p + "isi kelas");
    if (!norm(s.subjek)) err.push(p + "isi subjek");
    if (toMin(s.mula) === null || toMin(s.akhir) === null) err.push(p + "isi masa mula dan hingga");
    else if (toMin(s.akhir) <= toMin(s.mula)) err.push(p + "masa hingga mesti selepas masa mula");
    if (!(norm(s.tema) || norm(s.tajuk) || norm(s.stdPembelajaran) || norm(s.ringkasan))) err.push(p + "isi kandungan pembelajaran");
  });
  if (d.karakter.ada) {
    if (toMin(d.karakter.mula) === null) err.push("Karakter: isi masa mula");
    if (!d.karakter.elemen.length) err.push("Karakter: pilih sekurang-kurangnya satu elemen");
  }
  return err;
}
function payloadOf(d, statusHari) {
  const k = d.karakter;
  return {
    action: "saveHari", emel: S.user.email, nama: S.user.nama, minggu: d.minggu, hariNo: d.hariNo,
    tarikhAwal: weekStart(d.minggu), tarikhAkhir: weekEnd(d.minggu), tarikh: d.tarikh, statusHari,
    karakter: { ada: !!k.ada, mula: k.mula, akhir: k.akhir, elemen: k.elemen, catatan: k.catatan },
    slots: statusHari === "Cuti" ? [] : d.slots.map((s) => ({ kelas: s.kelas, tingkatan: s.tingkatan, subjek: s.subjek, mula: s.mula, akhir: s.akhir, ujian: !!s.ujian, pentaksiranAda: !!s.pentakAda, tema: s.tema, tajuk: s.tajuk, stdKandungan: s.stdKandungan, stdPembelajaran: s.stdPembelajaran, objektif: s.objektif, ringkasan: s.ringkasan, pentaksiran: s.pentaksiran, refleksi: s.refleksi, kehadiran: s.kehadiran })),
  };
}
/** Kemas kini cache setempat selepas simpan berjaya (gviz ada kelewatan beberapa saat, jadi tidak baca semula terus). */
function applySaved(d, statusHari, resp) {
  const n = d.minggu, h = d.hariNo, k = n + "|" + h, now = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (!S.mine.minggu[n]) S.mine.minggu[n] = { key: "", emel: S.user.email, nama: S.user.nama, minggu: String(n), awal: weekStart(n), akhir: weekEnd(n), status: "Draf", tarikhHantar: "", penyemak: "", tarikhSemak: "", kemaskini: now };
  const old = S.mine.hari[k], wkSt = S.mine.minggu[n].status;
  const kar = d.karakter;
  let semakan = resp && resp.semakan !== undefined ? resp.semakan : (old ? old.semakan : "");
  S.mine.hari[k] = { key: "", emel: S.user.email, nama: S.user.nama, minggu: String(n), hariNo: String(h), tarikh: d.tarikh, status: statusHari, karAda: kar.ada ? "YA" : "", karMula: kar.ada ? kar.mula : "", karAkhir: kar.ada ? kar.akhir : "", karElemen: kar.ada ? kar.elemen.join(", ") : "", karCatatan: kar.ada ? kar.catatan : "", semakan, semakOleh: old && semakan === "Dipulang" ? old.semakOleh : "", semakTarikh: "", ulasan: old && semakan === "Dipulang" ? old.ulasan : "", kemaskini: now };
  if (wkSt === "Disemak") S.mine.minggu[n].status = "Dihantar";
  S.mine.slot[k] = statusHari === "Cuti" ? [] : d.slots.map((s, i) => ({ key: "", emel: S.user.email, nama: S.user.nama, minggu: String(n), tarikh: d.tarikh, hariNo: String(h), slotNo: String(i + 1), kelas: s.kelas, tingkatan: s.tingkatan, subjek: s.subjek, mula: s.mula, akhir: s.akhir, ujian: s.ujian ? "YA" : "", pentakAda: s.pentakAda ? "YA" : "", tema: s.tema, tajuk: s.tajuk, stdKandungan: s.stdKandungan, stdPembelajaran: s.stdPembelajaran, objektif: s.objektif, ringkasan: s.ringkasan, pentaksiran: s.pentaksiran.join(", "), refleksi: s.refleksi, kehadiran: s.kehadiran, kemaskini: now }));
  d.saved = true; d.dirty = false; d.status = statusHari; d.semakan = semakan;
}
let _saveQ = Promise.resolve();
function queuePost(payload) { const p = _saveQ.then(() => erpPost(payload)); _saveQ = p.catch(() => {}); return p; }
const saveMsg = (st) => (st === "Siap" ? "Hari ini ditanda siap." : st === "Cuti" ? "Hari ditandakan cuti." : "Disimpan.");
/** bg=true: kemas kini paparan serta-merta dan hantar ke Sheet di latar (queue, ikut turutan); ralat dipaparkan di atas. */
async function saveCur(statusHari, quiet, bg) {
  const d = S.cur; if (!d) return false;
  const payload = payloadOf(d, statusHari);
  if (!quiet) toast("Menyimpan…", false, true);
  const run = queuePost(payload);
  if (bg) {
    applySaved(d, statusHari, null);
    run.then(() => { if (!quiet) toast(saveMsg(statusHari)); }).catch((err) => { toast("Gagal menyimpan: " + (err.message || "ralat rangkaian") + ". Cuba simpan semula.", true); });
    return true;
  }
  try { const resp = await run; applySaved(d, statusHari, resp); if (!quiet) toast(saveMsg(statusHari)); return true; }
  catch (err) { toast(err.message || "Gagal menyimpan.", true); return false; }
}
async function openDay(h) {
  S.cur = loadDay(S.minggu, h); S.cur.idx = 0; S.cur.dirty = false; S.view = "borang"; render(); window.scrollTo(0, 0);
}
async function leaveDay() { // auto-simpan draf bila ada perubahan sebelum keluar/tukar hari
  const d = S.cur;
  if (d && d.dirty && d.status !== "Cuti") {
    await saveCur(d.status === "Siap" ? (validateDay(d).length ? "Draf" : "Siap") : "Draf", true, true);
    toast("Draf disimpan.");
  }
  return true;
}

/* ================= Dropdown dalam kotak (PC): taip, tampal, atau pilih daripada senarai ================= */
function ddFit(el) { if (!el || el.tagName !== "TEXTAREA") return; el.style.height = "auto"; el.style.height = Math.max(46, el.scrollHeight + 2) + "px"; }
function ddFitAll() { document.querySelectorAll("textarea.erp-dd-in").forEach(ddFit); }
function ddCloseAll() { S._dd = null; document.querySelectorAll(".erp-ddlist").forEach((l) => { l.classList.add("hidden"); l.innerHTML = ""; }); }
function ddValsFor(f) {
  const s = S.cur.slots[S.cur.idx];
  if (f === "kelas" || f === "subjek") return { vals: f === "kelas" ? allKelas() : allSubjek(), relaxed: false, none: false };
  return optionsFor(s, f);
}
function ddOptList(vals, q) {
  q = norm(q); const shown = vals.map((v, i) => [v, i]).filter(([v]) => !q || norm(v).indexOf(q) !== -1).slice(0, 80);
  return shown.length ? shown.map(([v, i]) => `<button class="erp-opt" data-act="dd-pick" data-i="${i}" type="button">${E(v)}</button>`).join("") : `<div class="erp-hint" style="padding:9px 12px">Tiada padanan. Teks anda dalam kotak akan digunakan.</div>`;
}
function ddRender(f, q) {
  const l = document.getElementById("erp-dd-" + f), p = S._dd; if (!l || !p) return;
  let note = "Senarai ditapis semasa menaip. Boleh taip dan tampal (paste) teks sendiri dalam kotak.";
  if (p.none) note = "Tiada senarai untuk subjek/tingkatan ini dalam tab RPT. Taip atau tampal sendiri; ia akan dicadangkan ke RPT_Cadangan bila Hantar.";
  else if (p.relaxed) note = "Tiada padanan penuh dengan pilihan sebelum ini; menunjukkan semua pilihan untuk subjek ini. " + note;
  l.innerHTML = ddOptList(p.vals, q) + `<div class="erp-ddnote">${E(note)}</div>`;
  l.classList.remove("hidden");
}
function ddOpen(f) {
  if (!S.cur || S.view !== "borang") return;
  if (S._dd && S._dd.f === f) return;
  ddCloseAll();
  const o = ddValsFor(f); S._dd = { f, vals: o.vals, relaxed: o.relaxed, none: o.none };
  ddRender(f, "");
}
function ddRefresh(f, q) { if (!S._dd || S._dd.f !== f) ddOpen(f); if (S._dd) ddRender(f, q); }
function ddPick(i) {
  const p = S._dd, s = S.cur.slots[S.cur.idx]; if (!p) return;
  s[p.f] = p.vals[i];
  if (p.f === "kelas") s.tingkatan = tingOf(s.kelas);
  else if (p.f !== "refleksi" && p.f !== "subjek") autoFillAfter(s, p.f);
  dirty(); S._dd = null; S._keepScroll = true; render();
}

/* ================= Modal ================= */
function modal(html) { const m = document.getElementById("erp-modal"), b = document.getElementById("erp-modal-body"); b.innerHTML = html; m.classList.remove("hidden"); }
function closeModal() { document.getElementById("erp-modal").classList.add("hidden"); S._pick = null; }
function openPicker(field) {
  const d = S.cur, s = d.slots[d.idx];
  const simple = field === "kelas" || field === "subjek";
  const o = simple ? { vals: field === "kelas" ? allKelas() : allSubjek(), relaxed: false, none: false } : optionsFor(s, field);
  S._pick = { field, vals: o.vals };
  const lbl = field === "refleksi" ? "Impak / Refleksi" : field === "kelas" ? "Kelas" : field === "subjek" ? "Subjek" : ERP_K.find((k) => k[0] === field)[1];
  let note = "";
  if (o.none) note = `<div class="erp-hint" style="margin-bottom:8px">Tiada senarai untuk subjek/tingkatan ini dalam tab RPT. Taip sendiri; isian anda akan dicadangkan ke RPT_Cadangan bila Hantar.</div>`;
  else if (o.relaxed) note = `<div class="erp-hint" style="margin-bottom:8px">Tiada padanan penuh dengan pilihan sebelum ini; menunjukkan semua pilihan untuk subjek ini.</div>`;
  modal(`<h4>${lbl}</h4>${note}<input class="erp-in" id="erp-q" placeholder="Cari, atau taip teks sendiri…" style="margin-bottom:8px"><button class="erp-btn solid hidden" id="erp-own" data-act="pick-own" type="button" style="margin-bottom:8px;width:100%"></button><div id="erp-opts">${optList(o.vals, "")}</div><div class="erp-right" style="margin-top:8px"><button class="erp-btn" data-act="close" type="button">Tutup</button></div>`);
}
function optList(vals, q) {
  q = norm(q); const shown = vals.map((v, i) => [v, i]).filter(([v]) => !q || norm(v).indexOf(q) !== -1).slice(0, 80);
  return shown.length ? shown.map(([v, i]) => `<button class="erp-opt" data-act="pick-val" data-i="${i}" type="button">${E(v)}</button>`).join("") : `<div class="erp-hint">Tiada padanan.</div>`;
}
function pickOwn() {
  const q = (document.getElementById("erp-q") || {}).value || "";
  const p = S._pick, d = S.cur, s = d.slots[d.idx]; if (!p || !q.trim()) return;
  s[p.field] = q.trim(); if (p.field === "kelas") s.tingkatan = tingOf(s.kelas); dirty(); closeModal(); S._keepScroll = true; render();
}
function pickValue(i) {
  const p = S._pick, d = S.cur, s = d.slots[d.idx]; if (!p) return;
  s[p.field] = p.vals[i];
  if (p.field === "kelas") s.tingkatan = tingOf(s[p.field]);
  else if (p.field !== "refleksi" && p.field !== "subjek") autoFillAfter(s, p.field);
  dirty(); closeModal(); S._keepScroll = true; render();
}
function openJadualPicker() {
  const d = S.cur, jd = jadualDay(d.hariNo); S._jd = jd;
  modal(`<h4>Jadual Guru · ${ERP_HARI[d.hariNo - 1]}</h4>${jd.map((j, i) => `<button class="erp-opt" data-act="jd-val" data-i="${i}" type="button"><b>${E(j.kelas)}</b> · ${E(j.subjek)}<small>${t12(j.mula)} – ${t12(j.akhir)}</small></button>`).join("")}<div class="erp-right" style="margin-top:8px"><button class="erp-btn" data-act="close" type="button">Tutup</button></div>`);
}
function applyJadual(i) {
  const d = S.cur, s = d.slots[d.idx], j = S._jd[i];
  s.kelas = j.kelas; s.subjek = j.subjek; s.mula = j.mula; s.akhir = j.akhir; s.tingkatan = tingOf(j.kelas);
  dirty(); closeModal(); S._keepScroll = true; render();
}
const COPY_FIELDS = ["tema", "tajuk", "stdKandungan", "stdPembelajaran", "objektif", "ringkasan", "refleksi"];
function mySlotsFlat() {
  const out = [];
  Object.keys(S.mine.slot).forEach((k) => {
    const [n, h] = k.split("|").map(Number);
    (S.mine.slot[k] || []).forEach((r) => out.push({ n, h, tarikh: r.tarikh || dayIso(n, h), r }));
  });
  return out.sort((a, b) => (a.tarikh < b.tarikh ? 1 : -1));
}
function openCopySlot() {
  const d = S.cur, s = d.slots[d.idx];
  if (!norm(s.subjek)) { toast("Isi subjek dahulu.", true); return; }
  const list = mySlotsFlat().filter((x) => subjMatch(x.r.subjek, s.subjek) && (!s.tingkatan || !x.r.tingkatan || x.r.tingkatan === s.tingkatan) && !(x.n === d.minggu && x.h === d.hariNo && +x.r.slotNo === d.idx + 1) && (norm(x.r.tema) || norm(x.r.tajuk) || norm(x.r.stdPembelajaran) || norm(x.r.ringkasan))).slice(0, 40);
  S._cp = list;
  modal(`<h4>Salin daripada RPH saya</h4><div class="erp-hint" style="margin-bottom:8px">Hanya subjek ${E(s.subjek)}${s.tingkatan ? " dan tingkatan " + s.tingkatan : ""}. Kelas dan waktu tidak diubah.</div>${list.length ? list.map((x, i) => `<button class="erp-opt" data-act="cp-val" data-i="${i}" type="button"><b>${E(dmyHari(x.tarikh, x.h))}</b> · ${E(x.r.kelas)}<small>${E(x.r.tajuk || x.r.tema || x.r.stdPembelajaran)}</small></button>`).join("") : `<div class="erp-hint">Tiada RPH lama dengan subjek dan tingkatan yang sama.</div>`}<div class="erp-right" style="margin-top:8px"><button class="erp-btn" data-act="close" type="button">Tutup</button></div>`);
}
function applyCopySlot(i) {
  const d = S.cur, s = d.slots[d.idx], src = S._cp[i].r;
  COPY_FIELDS.forEach((f) => { s[f] = src[f] || ""; });
  s.pentaksiran = String(src.pentaksiran || "").split(",").map((x) => x.trim()).filter(Boolean);
  s.ujian = src.ujian === "YA"; s.pentakAda = src.pentakAda === "YA";
  dirty(); closeModal(); S._keepScroll = true; render(); toast("Disalin. Semak dan ubah jika perlu.");
}

/* ================= Salin minggu ================= */
function openCopyWeek() {
  const weeks = [...new Set(Object.keys(S.mine.slot).filter((k) => (S.mine.slot[k] || []).length).map((k) => +k.split("|")[0]))].filter((w) => w !== S.minggu).sort((a, b) => b - a);
  S._cw = weeks;
  modal(`<h4>Salin ke ${wkLbl(S.minggu)}</h4><div class="erp-hint" style="margin-bottom:8px">Pilih minggu sumber. Hari yang sudah ada isi tidak diganti. Kandungan hanya disalin bila tingkatan dan subjek sama; kelas dan waktu ikut Jadual Guru.</div>${weeks.length ? weeks.map((w, i) => `<button class="erp-opt" data-act="cw-val" data-i="${i}" type="button"><b>${wkLbl(w)}</b><small>${weekRangeTxt(w)}</small></button>`).join("") : `<div class="erp-hint">Belum ada RPH lama untuk disalin.</div>`}<div class="erp-right" style="margin-top:8px"><button class="erp-btn" data-act="close" type="button">Tutup</button></div>`);
}
async function copyWeek(src) {
  closeModal();
  if (S.busy) return;
  const tgt = S.minggu; let salin = 0, kosong = 0, hariSalin = 0;
  const used = {};
  S.busy = true; toast("Menyalin…");
  try {
    for (let h = 1; h <= 5; h++) {
      const k = tgt + "|" + h;
      if (S.mine.hari[k] || (S.mine.slot[k] || []).length) continue;
      const jd = jadualDay(h); if (!jd.length) continue;
      const pool = [];
      for (let hh = 1; hh <= 5; hh++) (S.mine.slot[src + "|" + hh] || []).forEach((r) => pool.push({ hh, r }));
      const d = dayFromRows(tgt, h, null, []);
      d.slots = jd.map((j) => {
        const sl = blankSlot(j);
        const idx = pool.findIndex((p, pi) => !used[pi] && subjMatch(p.r.subjek, sl.subjek) && (!sl.tingkatan || !p.r.tingkatan || p.r.tingkatan === sl.tingkatan) && (p.hh === h));
        const idx2 = idx !== -1 ? idx : pool.findIndex((p, pi) => !used[pi] && subjMatch(p.r.subjek, sl.subjek) && (!sl.tingkatan || !p.r.tingkatan || p.r.tingkatan === sl.tingkatan));
        const use = idx !== -1 ? idx : idx2;
        if (use !== -1) {
          used[use] = true; const r = pool[use].r;
          COPY_FIELDS.forEach((f) => { sl[f] = r[f] || ""; });
          sl.pentaksiran = String(r.pentaksiran || "").split(",").map((x) => x.trim()).filter(Boolean);
          sl.ujian = r.ujian === "YA"; sl.pentakAda = r.pentakAda === "YA"; salin++;
        } else kosong++;
        return sl;
      });
      const resp = await erpPost(payloadOf(d, "Draf"));
      applySaved(d, "Draf", resp); hariSalin++;
    }
    toast(hariSalin ? `Disalin ${salin} slot ke ${hariSalin} hari (${kosong} slot kosong untuk diisi).` : "Tiada hari kosong yang sesuai untuk disalin (atau Jadual Guru tiada).");
  } catch (err) { toast(err.message || "Gagal menyalin.", true); }
  finally { S.busy = false; render(); }
}

/* ================= Wujudkan RPH satu minggu (auto: Isnin–Jumaat ikut Jadual Guru; hari cuti ditanda Cuti) ================= */
async function wujudMinggu(n) {
  if (S.busy) return;
  S.busy = true; toast("Mewujudkan RPH " + wkLbl(n) + "…", false, true);
  try {
    const items = [], ds = []; let cuti = 0, isi = 0; const tiada = [];
    for (let h = 1; h <= 5; h++) {
      if (S.mine.hari[n + "|" + h]) continue;
      const c = cutiOf(dayIso(n, h)), d = dayFromRows(n, h, null, []);
      if (c) { d.slots = []; ds.push([d, "Cuti"]); items.push(payloadOf(d, "Cuti")); cuti++; continue; }
      const jd = jadualDay(h);
      if (!jd.length) { tiada.push(ERP_HARI[h - 1]); continue; }
      d.slots = jd.map((j) => blankSlot(j)); ds.push([d, "Draf"]); items.push(payloadOf(d, "Draf")); isi += jd.length;
    }
    if (!items.length) { toast("Jadual Guru anda tidak ditemui untuk " + wkLbl(n) + ". Buka hari dan isi kelas sendiri.", true); return; }
    await _saveQ;
    await erpPost({ action: "wujudMinggu", emel: S.user.email, nama: S.user.nama, minggu: n, hari: items });
    ds.forEach((x) => applySaved(x[0], x[1], null));
    toast(wkLbl(n) + " diwujudkan: " + isi + " slot kelas daripada Jadual Guru" + (cuti ? ", " + cuti + " hari cuti ditanda" : "") + (tiada.length ? ". Tiada jadual: " + tiada.join(", ") : "") + ".");
  } catch (err) { toast(err.message || "Gagal mewujudkan RPH.", true); }
  finally { S.busy = false; render(); }
}

/* ================= Hantar minggu ================= */
async function hantarMinggu() {
  if (S.busy) return;
  const n = S.minggu;
  if (!await ask("Hantar RPH " + wkLbl(n) + " kepada penyemak dan simpan ke pangkalan data?\n(RPH tidak dikunci; anda masih boleh mengemas kini.)")) return;
  S.busy = true; toast("Menghantar…", false, true);
  try {
    await _saveQ;
    const r = await erpPost({ action: "hantarMinggu", emel: S.user.email, nama: S.user.nama, minggu: n });
    const wk = S.mine.minggu[n]; if (wk) { wk.status = "Dihantar"; wk.tarikhHantar = new Date().toISOString().slice(0, 19).replace("T", " "); }
    for (let h = 1; h <= 5; h++) { const x = S.mine.hari[n + "|" + h]; if (x && x.semakan !== "Disemak") { x.semakan = "Menunggu"; } }
    toast("RPH " + wkLbl(n) + " dihantar." + (r.cadangan ? " " + r.cadangan + " isian baharu dicadangkan ke RPT." : ""));
  } catch (err) { toast(err.message || "Gagal menghantar.", true); }
  finally { S.busy = false; render(); }
}

/* ================= Cetak / PDF ================= */
function printHtml(d, meta) {
  const pembuka = (s, i) => {
    const row = (k, v) => `<tr><th>${k}</th><td>${E(v || "")}</td></tr>`;
    return `<div class="blk"><div class="bh">MASA / KELAS : ${i + 1}</div><table>
      ${row("Masa", t12(s.mula) + " – " + t12(s.akhir))}${row("Kelas / Subjek", s.kelas + " · " + s.subjek)}
      ${row("Ujian / Pentaksiran", [s.ujian ? "Ada Ujian" : "", s.pentakAda ? "Ada Pentaksiran" : ""].filter(Boolean).join(", ") || "-")}
      ${row("Tema / Bidang Pembelajaran", s.tema)}${row("Tajuk", s.tajuk)}${row("Standard Kandungan", s.stdKandungan)}${row("Standard Pembelajaran", s.stdPembelajaran)}
      ${row("Objektif Pembelajaran", s.objektif)}${row("Ringkasan Aktiviti", s.ringkasan)}${row("Pentaksiran", (s.pentaksiran || []).join(", "))}${row("Impak / Refleksi", s.refleksi)}</table></div>`;
  };
  const k = d.karakter;
  const kar = k.ada ? `<div class="blk"><div class="bh">PELAKSANAAN AKTIVITI PROGRAM PEMBENTUKAN KARAKTER (15 MINIT)</div><table>
    <tr><th>Tarikh</th><td><b>${E(dmyHari(d.tarikh, d.hariNo))}</b></td></tr><tr><th>Masa</th><td><b>${E(t12(k.mula) + " – " + t12(k.akhir))}</b></td></tr>
    <tr><th>Elemen Teras Karakter</th><td><b>${E(k.elemen.join(", "))}</b></td></tr><tr><th>Catatan Aktiviti</th><td><b>${E(k.catatan)}</b></td></tr></table></div>` : "";
  return `<div class="erp-pr"><div class="ban">RANCANGAN PENGAJARAN HARIAN (e-RPH)</div>
    <table><thead><tr><th>Nama Guru</th><td>${E(meta.nama)}</td><th>Minggu</th><td>${wkNo(d.minggu)} (${E(weekRangeTxt(d.minggu))})</td></tr>
    <tr><th>Tarikh</th><td>${E(dmy(d.tarikh))}</td><th>Hari</th><td>${ERP_HARI[d.hariNo - 1]}</td></tr>
    <tr><th>Telah Disemak Oleh</th><td>${E(meta.semakOleh || "")}</td><th>Status</th><td>${E(meta.status || "")}</td></tr></thead></table>
    ${d.slots.map(pembuka).join("")}${kar}</div>`;
}
function cetak(d, meta) {
  document.getElementById("erp-print-area").innerHTML = printHtml(d, meta);
  document.body.classList.add("erp-printing");
  const done = () => { document.body.classList.remove("erp-printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);
}

/* ================= Tetapan (Admin App sahaja) ================= */
async function loadTetapan() {
  try {
    const [tet, pny, st] = await Promise.all([erpGvizSafe("eRPH_Tetapan"), erpGvizSafe("eRPH_Penyemak"), erpGvizSafe("DatabaseSTAFF", "", SPREADSHEET_ID)]);
    const T = S.tet;
    T.rows = tet.filter((r) => String(r[0] || "").trim()).map((r) => ({ k: String(r[0]).trim(), v: String(r[1] == null ? "" : r[1]).trim() }));
    // DatabaseSTAFF: A=Gambar B=Nama C=Jawatan D=Telefon E=Emel1 F=Emel2 G=Role H=Role2 I=Role3
    T.staff = st.map((r) => ({ nama: String(r[1] || "").trim(), jawatan: String(r[2] || "").trim(), role2: String(r[7] || "").trim(), role3: String(r[8] || "").trim() })).filter((x) => x.nama);
    T.pnyList = T.staff.filter((x) => x.role2.toLowerCase() === "pentadbir" || isPentadbir(x)).map((x) => x.nama).sort((a, b) => a.localeCompare(b, "ms"));
    T.asg = {}; pny.forEach((r) => { if (norm(r[0]) && String(r[1] || "").trim()) T.asg[norm(r[0])] = String(r[1]).trim(); });
    T.loaded = true;
  } catch (e) { toast("Gagal memuatkan tetapan.", true); }
  render();
}
function tetGuruHtml() {
  const T = S.tet, q = norm(T.q);
  const list = T.staff.filter((x) => !q || norm(x.nama).indexOf(q) !== -1).sort((a, b) => a.nama.localeCompare(b.nama, "ms"));
  return list.map((x) => {
    const cur = T.asg[norm(x.nama)] || "", opts = T.pnyList.slice();
    if (cur && opts.indexOf(cur) === -1) opts.push(cur);
    return `<div class="erp-trw"><div class="nm"><b>${E(x.nama)}</b><span>${E(x.jawatan)}</span></div><select class="erp-sel" data-tg="${A(x.nama)}"><option value="">(semua pentadbir)</option>${opts.map((o) => `<option value="${A(o)}" ${o === cur ? "selected" : ""}>${E(o)}</option>`).join("")}</select></div>`;
  }).join("") || `<div class="erp-hint">Tiada nama.</div>`;
}
function vTetapan() {
  const T = S.tet;
  if (!T.loaded) return `<div class="erp-loading">Memuatkan tetapan…</div>`;
  const rows = T.rows.map((r, i) => `<div class="erp-trw"><input class="erp-in" data-tk="${i}" value="${A(r.k)}" placeholder="KUNCI" ${r.k === "MINGGU1_MULA" ? "readonly" : ""}><input class="erp-in" data-tv="${i}" ${r.k === "MINGGU1_MULA" ? 'type="date"' : ""} value="${A(r.v)}" placeholder="Nilai">${r.k === "MINGGU1_MULA" ? "<span></span>" : `<button class="erp-btn sm" data-act="tet-del" data-i="${i}" type="button">Buang</button>`}</div>`).join("");
  return `<div class="erp-tcols"><div class="erp-card"><h3>Tetapan e-RPH (eRPH_Tetapan)</h3>
      <div class="erp-hint" style="margin-bottom:10px">Kunci dan nilai. <b>MINGGU1_MULA</b> = tarikh Isnin bagi Minggu 1 (menentukan nombor minggu).</div>
      ${rows}<div class="erp-right" style="margin-top:10px"><button class="erp-btn" data-act="tet-add" type="button">+ Tambah tetapan</button><button class="erp-btn solid" data-act="tet-save" type="button">Simpan tetapan</button></div></div>
    <div class="erp-card"><h3>Guru dan penyemak (eRPH_Penyemak)</h3>
      <div class="erp-hint" style="margin-bottom:10px">Nama diambil daripada DatabaseSTAFF. Penyemak ialah staf berperanan Pentadbir (${T.pnyList.length}). Guru tanpa penyemak dipilih boleh disemak oleh semua pentadbir.</div>
      <input class="erp-in" data-tq placeholder="Cari nama guru…" value="${A(T.q)}" style="margin-bottom:10px"><div id="tet-glist">${tetGuruHtml()}</div>
      <div class="erp-right" style="margin-top:10px"><button class="erp-btn solid" data-act="pny-save" type="button">Simpan penyemak</button></div></div></div>
    ${calCardHtml()}`;
}

/* ================= Kalendar Akademik (Admin App): disimpan ikut tahun ================= */
const CAL_JENIS = ["Mula Sesi", "Cuti Penggal", "Cuti Lain", "Tamat Sesi"];
function calYears() {
  const ys = new Set(S.cal.rows.map((r) => r.tahun)); const cy = new Date().getFullYear();
  ys.add(cy); const mx = Math.max(...ys); ys.add(mx + 1);
  return [...ys].sort((a, b) => a - b);
}
function calRowsOf(y) { return S.cal.rows.filter((r) => r.tahun === y).map((r) => ({ jenis: r.jenis, nama: r.nama, mula: r.mula, akhir: r.akhir })); }
function calBlank(y) {
  return [{ jenis: "Mula Sesi", nama: "Mula persekolahan", mula: "", akhir: "" }, { jenis: "Cuti Penggal", nama: "Cuti Penggal 1", mula: "", akhir: "" }, { jenis: "Cuti Penggal", nama: "Cuti Pertengahan Tahun", mula: "", akhir: "" }, { jenis: "Cuti Penggal", nama: "Cuti Penggal 2", mula: "", akhir: "" }, { jenis: "Cuti Penggal", nama: "Cuti Akhir Persekolahan", mula: "", akhir: "" }, { jenis: "Tamat Sesi", nama: "Tamat persekolahan", mula: "", akhir: "" }];
}
/** Templat Kalendar Akademik 2026 Kumpulan B (Lampiran B & C) — hanya jika admin mahu menggunakannya. */
function calTpl2026() {
  const r = (jenis, nama, mula, akhir) => ({ jenis, nama, mula, akhir: akhir || mula });
  return [r("Mula Sesi", "Mula persekolahan", "2026-01-12"), r("Cuti Penggal", "Cuti Penggal 1", "2026-03-21", "2026-03-29"), r("Cuti Penggal", "Cuti Pertengahan Tahun", "2026-05-23", "2026-06-07"), r("Cuti Penggal", "Cuti Penggal 2", "2026-08-29", "2026-09-06"), r("Cuti Penggal", "Cuti Akhir Persekolahan", "2026-12-05", "2026-12-31"), r("Tamat Sesi", "Tamat persekolahan", "2026-12-04"),
    r("Cuti Lain", "Tahun Baru Cina (cuti KPM + cuti umum)", "2026-02-16", "2026-02-20"), r("Cuti Lain", "Hari Raya Aidilfitri (cuti tambahan KPM)", "2026-03-19", "2026-03-20"), r("Cuti Lain", "Deepavali (cuti tambahan KPM)", "2026-11-10")];
}
function calSelectYear(y) {
  const C = S.tet.cal; C.tahun = y; C.rows = calRowsOf(y); C.dirty = false;
  if (!C.rows.length) C.rows = y === 2026 ? calTpl2026() : calBlank(y);
  if (!calRowsOf(y).length) C.dirty = true;
}
function calPreviewHtml() {
  const C = S.tet.cal, rs = C.rows.map((r) => ({ jenis: r.jenis, mula: normDate(r.mula), akhir: normDate(r.akhir) || normDate(r.mula) })), sp = calSpan(rs);
  if (!sp) return `<div class="erp-hint">Isi Mula Sesi dan Tamat Sesi untuk melihat pratonton nombor minggu.</div>`;
  const ws = calWeeks(sp.mula, sp.tamat, sp.cuti), mon = monOf(isoOf(new Date())), i = ws.indexOf(mon);
  return `<div class="erp-hint"><b>${ws.length} minggu persekolahan</b> · Minggu 1 mula ${E(dmy(ws[0]))} · Minggu ${ws.length} tamat ${E(dmy(addDays(ws[ws.length - 1], 4)))}${i !== -1 ? ` · minggu ini = <b>Minggu ${i + 1}</b>` : ""}.<br>Minggu yang seluruhnya dalam Cuti Penggal tidak diberi nombor. Cuti perayaan dan cuti umum tetap dikira sebagai minggu (hari berkenaan ditanda Cuti).</div>`;
}
function calCardHtml() {
  const C = S.tet.cal;
  if (!C.tahun) { C.tahun = calYears().filter((y) => S.cal.rows.some((r) => r.tahun === y)).pop() || new Date().getFullYear(); C.rows = calRowsOf(C.tahun); if (!C.rows.length) { C.rows = C.tahun === 2026 ? calTpl2026() : calBlank(C.tahun); C.dirty = true; } }
  const yrs = calYears(), saved = new Set(S.cal.rows.map((r) => r.tahun));
  const opts = yrs.map((y) => `<option value="${y}" ${y === C.tahun ? "selected" : ""}>${y}${saved.has(y) ? " · disimpan" : " · belum ada"}</option>`).join("");
  const rows = C.rows.map((r, i) => {
    const sesi = r.jenis === "Mula Sesi" || r.jenis === "Tamat Sesi";
    return `<div class="erp-calrow"><select class="erp-sel" data-ck="jenis" data-ci="${i}">${CAL_JENIS.map((j) => `<option ${j === r.jenis ? "selected" : ""}>${j}</option>`).join("")}</select><input class="erp-in" data-ck="nama" data-ci="${i}" value="${A(r.nama)}" placeholder="Nama"><input class="erp-in" type="date" data-ck="mula" data-ci="${i}" value="${A(r.mula)}" title="Mula">${sesi ? "<span></span>" : `<input class="erp-in" type="date" data-ck="akhir" data-ci="${i}" value="${A(r.akhir)}" title="Akhir">`}<button class="erp-btn sm" data-act="cal-del" data-i="${i}" type="button">Buang</button></div>`;
  }).join("");
  const nCuti = S.cuti.length;
  return `<div class="erp-card erp-calcard"><h3>Kalendar akademik (eRPH_Kalendar)</h3>
    <div class="erp-hint" style="margin-bottom:10px">Disimpan <b>ikut tahun</b>: memuat naik / menyimpan 2027 tidak mengubah 2026. Nombor minggu dikira daripada kalendar ini (cuti penggal tidak dikira). Cuti umum Melaka dan cuti perayaan KPM diambil daripada tab <b>Cuti</b> (${nCuti ? nCuti + " rekod dimuat" : "belum ada rekod; tekan Kemaskini Cuti di halaman Event"}). Tambah baris <b>Cuti Lain</b> bagi cuti yang tiada dalam tab itu.</div>
    <div class="erp-calbar"><label class="erp-lbl">Tahun</label><select class="erp-sel" data-act-change="cal-tahun" style="max-width:170px">${opts}</select>
      <label class="erp-btn" style="cursor:pointer">⬆ Muat naik PDF kalendar<input type="file" accept="application/pdf" data-calpdf hidden></label>
      ${C.tahun === 2026 ? `<button class="erp-btn" data-act="cal-tpl" type="button">Isi templat 2026 (Kump. B)</button>` : ""}</div>
    <div class="erp-calrow hd"><span>JENIS</span><span>NAMA</span><span>MULA</span><span>AKHIR</span><span></span></div>${rows}
    <div id="cal-prev" style="margin-top:8px">${calPreviewHtml()}</div>
    <div class="erp-right" style="margin-top:10px"><button class="erp-btn" data-act="cal-add" type="button">+ Tambah baris</button><button class="erp-btn solid" data-act="cal-save" type="button">Simpan kalendar ${C.tahun}${C.dirty ? " *" : ""}</button></div></div>`;
}
/** Baca teks PDF Kalendar Akademik (Lampiran B): tahun, mula persekolahan, julat cuti penggal. Fungsi tulen supaya boleh diuji. */
function calParseText(text) {
  const t = String(text || "").replace(/\s+/g, " "), iso = (d, m, y) => y + "-" + m + "-" + d;
  const ym = t.match(/KALENDAR AKADEMIK\s+TAHUN\s+(\d)\s?(\d)\s?(\d)\s?(\d)/i); let tahun = ym ? +(ym[1] + ym[2] + ym[3] + ym[4]) : 0; // pdf.js kadang memecah "2026" jadi "202 6"
  // Julat cuti: cari tajuk "CUTI PENGGAL n / PERTENGAHAN TAHUN / AKHIR PERSEKOLAHAN" kemudian dua tarikh selepasnya (tanda "-" kadang tiada, cth baris Cuti Akhir 2027)
  const pair = /(\d{2})\.(\d{2})\.(\d{4})\s*[-–—]?\s*(\d{2})\.(\d{2})\.(\d{4})/, reN = /CUTI\s+(PENGGAL\s+(\d)|PERTENGAHAN\s+TAHUN|AKHIR\s+PERSEKOLAHAN)/gi, hd = {}; let m;
  while ((m = reN.exec(t))) {
    const p = pair.exec(t.slice(reN.lastIndex, reN.lastIndex + 60)); if (!p) continue;
    const key = m[2] ? 10 + +m[2] : /^PERTENGAHAN/i.test(m[1]) ? 11.5 : 90, r = { mula: iso(p[1], p[2], p[3]), akhir: iso(p[4], p[5], p[6]), nama: m[2] ? "Cuti Penggal " + m[2] : key === 11.5 ? "Cuti Pertengahan Tahun" : "Cuti Akhir Persekolahan" };
    if (r.akhir >= r.mula && !hd[key]) hd[key] = r;
  }
  let rng = Object.keys(hd).map(Number).sort((a, b) => a - b).map((k) => hd[k]);
  if (!rng.length) { const reR = /(\d{2})\.(\d{2})\.(\d{4})\s*[-–—]\s*(\d{2})\.(\d{2})\.(\d{4})/g; while ((m = reR.exec(t))) rng.push({ mula: iso(m[1], m[2], m[3]), akhir: iso(m[4], m[5], m[6]), nama: "" }); }
  rng.sort((a, b) => (a.mula < b.mula ? -1 : 1));
  if (!tahun && rng.length) tahun = +rng[0].mula.slice(0, 4);
  const dates = []; const reD = /(\d{2})\.(\d{2})\.(\d{4})/g;
  while ((m = reD.exec(t))) if (!tahun || +m[3] === tahun) dates.push(iso(m[1], m[2], m[3]));
  dates.sort();
  if (!tahun || !rng.length || !dates.length) return null;
  const rows = [{ jenis: "Mula Sesi", nama: "Mula persekolahan", mula: dates[0], akhir: dates[0] }];
  rng.forEach((r, i) => rows.push({ jenis: "Cuti Penggal", nama: r.nama || "Cuti Penggal " + (i + 1), mula: r.mula, akhir: r.akhir }));
  const last = rng[rng.length - 1], tm = addDays(last.mula, -1);
  rows.push({ jenis: "Tamat Sesi", nama: "Tamat persekolahan", mula: tm, akhir: tm });
  return { tahun, rows, kumpulan: (t.match(/KUMPULAN\s+([AB])\b/i) || [])[1] || "" };
}
/** Cuti perayaan tambahan KPM (Lampiran C) bagi KUMPULAN B sahaja, ikut kedudukan lajur dalam jadual PDF. Melaka bukan Sarawak, jadi tarikh "Negeri Sarawak sahaja" dibuang.
 *  items: [{s: teks, x, y, w}] satu halaman (daripada pdf.js getTextContent). Pulang baris "Cuti Lain". */
function calParsePerayaan(it, tahun) {
  const c = (i) => i.x + i.w / 2, hd = (re) => it.filter((i) => re.test(i.s.trim())).sort((a, b) => b.y - a.y)[0];
  const hA = hd(/^KUMPULAN\s*A$/), hB = hd(/^KUMPULAN\s*B$/), hC = hd(/^CATATAN$/);
  if (!hA || !hB || !hC) return [];
  const lo = (c(hA) + c(hB)) / 2, hi = (c(hB) + c(hC)) / 2;
  const inB = it.filter((i) => c(i) >= lo && c(i) < hi && i.y < hB.y);
  // Nama perayaan (lajur kiri, boleh dua baris) dan tarikh sebenar perayaan itu (lajur kiri) -> padanan tarikh Kumpulan B ikut jarak tarikh
  const left = it.filter((i) => c(i) < c(hA) - 60 && i.y < hB.y), blocks = [];
  left.filter((i) => /^[A-Z][A-Z ]{2,}$/.test(i.s.trim())).sort((a, b) => b.y - a.y).forEach((i) => {
    const l = blocks[blocks.length - 1];
    if (l && l.yb - i.y < (i.h || 12) * 2.2) { l.nama += " " + i.s.trim(); l.yb = i.y; } else blocks.push({ nama: i.s.trim(), y: i.y, yb: i.y, tarikh: [] });
  });
  left.forEach((i) => {
    const m = i.s.match(/(\d{2})\.(\d{2})\.(\d{4})/); if (!m) return;
    const bl = blocks.filter((x) => x.y >= i.y - 2).sort((x, y) => (x.y - i.y) - (y.y - i.y))[0];
    if (bl) bl.tarikh.push(m[3] + "-" + m[2] + "-" + m[1]);
  });
  const ds = [];
  inB.forEach((i) => {
    const m = i.s.match(/(\d{2})\.(\d{2})\.(\d{4})/); if (!m || (tahun && +m[3] !== tahun)) return;
    if (inB.some((j) => j.y < i.y && i.y - j.y < 30 && /sarawak\s+sahaja/i.test(j.s))) return;
    ds.push({ d: m[3] + "-" + m[2] + "-" + m[1], y: i.y });
  });
  ds.sort((a, b) => (a.d < b.d ? -1 : 1));
  const ranges = []; let cur = null;
  ds.forEach((x) => { if (cur && (dateOf(x.d) - dateOf(cur.akhir)) / 864e5 <= 1) { cur.akhir = x.d; cur.ys.push(x.y); } else { cur = { mula: x.d, akhir: x.d, ys: [x.y] }; ranges.push(cur); } });
  const jarak = (r, bl) => Math.min(...bl.tarikh.map((t) => Math.min(Math.abs(dateOf(r.mula) - dateOf(t)), Math.abs(dateOf(r.akhir) - dateOf(t))) / 864e5), 9999);
  return ranges.map((r) => {
    const nm = blocks.slice().sort((x, y) => jarak(r, x) - jarak(r, y))[0];
    return { jenis: "Cuti Lain", nama: (nm ? nm.nama.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()) : "Cuti Perayaan") + " (cuti tambahan KPM)", mula: r.mula, akhir: r.akhir };
  });
}
/** PDF imbasan (tiada lapisan teks): ubah perkataan OCR (tesseract.js) kepada "item" seperti pdf.js — perkataan sebaris yang berdekatan digabung; y diterbalikkan (atas = besar). */
function ocrItems(words, H) {
  const out = []; let prev = null;
  words.forEach((w) => {
    const t = String(w.text || "").trim(); if (!t) return;
    const b = w.bbox, h = b.y1 - b.y0, cy = (b.y0 + b.y1) / 2;
    if (prev && Math.abs(cy - prev.cy) < h * 0.6 && b.x0 - prev.x1 < h * 1.3 && b.x0 >= prev.x1 - 4) { prev.item.s += " " + t; prev.x1 = b.x1; prev.item.w = prev.x1 - prev.item.x; return; }
    const item = { s: t, x: b.x0, w: b.x1 - b.x0, y: H - cy, h }; out.push(item); prev = { x1: b.x1, cy, item };
  });
  return out;
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Pustaka OCR tidak dapat dimuat.")); document.head.appendChild(s); }); }
async function calOcr(pdf) {
  if (!window.Tesseract) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js");
  const wk = await window.Tesseract.createWorker("eng"); let txt = "", pera = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      toast("PDF imbasan: membaca halaman " + p + " / " + pdf.numPages + " (OCR, mungkin ~30 saat)…", false, true);
      const page = await pdf.getPage(p), vp = page.getViewport({ scale: 2.7 }), cv = document.createElement("canvas");
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      const words = ((await wk.recognize(cv)).data.words || []).filter((w) => w.text && w.text.trim()), pgTxt = words.map((w) => w.text).join(" ");
      txt += pgTxt + " \n ";
      if (/CUTI\s+PERAYAAN/i.test(pgTxt)) pera = pera.concat(calParsePerayaan(ocrItems(words, cv.height), 0));
    }
  } finally { try { await wk.terminate(); } catch (e) { /* senyap */ } }
  return { txt, pera };
}
function loadPdfJs() {
  return new Promise((res, rej) => {
    if (window.pdfjsLib) return res(window.pdfjsLib);
    const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); };
    s.onerror = () => rej(new Error("Pustaka PDF tidak dapat dimuat. Isi jadual secara manual.")); document.head.appendChild(s);
  });
}
async function calReadPdf(file) {
  toast("Membaca PDF…", false, true);
  try {
    const lib = await loadPdfJs(), pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise; let txt = "", pera = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const c = await (await pdf.getPage(p)).getTextContent(), pgTxt = c.items.map((i) => i.str).join(" "); txt += pgTxt + " \n ";
      if (/CUTI\s+PERAYAAN/i.test(pgTxt)) pera = pera.concat(calParsePerayaan(c.items.map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height })).filter((i) => i.s.trim()), 0));
    }
    if (txt.replace(/\s/g, "").length < 200) { const o = await calOcr(pdf); txt = o.txt; pera = o.pera; }
    const r = calParseText(txt);
    if (r) pera.forEach((x) => { if (+x.mula.slice(0, 4) === r.tahun) r.rows.push(x); });
    if (!r) { toast("PDF tidak dikenali sebagai Kalendar Akademik (Lampiran B). Isi jadual secara manual.", true); return; }
    const C = S.tet.cal; C.tahun = r.tahun; C.rows = r.rows; C.dirty = true;
    toast("Dibaca: tahun " + r.tahun + (r.kumpulan ? " Kumpulan " + r.kumpulan : "") + ", " + r.rows.length + " baris. Semak, kemudian Simpan." , false);
    render();
  } catch (err) { toast(err.message || "Gagal membaca PDF.", true); }
}
async function calAct(a, b) {
  const C = S.tet.cal;
  if (a === "cal-add") { C.rows.push({ jenis: "Cuti Lain", nama: "", mula: "", akhir: "" }); C.dirty = true; return render(); }
  if (a === "cal-del") { C.rows.splice(+b.dataset.i, 1); C.dirty = true; return render(); }
  if (a === "cal-tpl") { if (C.dirty && !await ask("Ganti baris yang sedang diedit dengan templat 2026?")) return; C.rows = calTpl2026(); C.dirty = true; return render(); }
  if (a === "cal-save") {
    const items = C.rows.map((r) => ({ jenis: r.jenis, nama: String(r.nama || "").trim(), mula: normDate(r.mula), akhir: normDate(r.akhir) || normDate(r.mula) })).filter((r) => r.mula);
    for (const r of items) { if (r.akhir < r.mula) { toast("Tarikh akhir sebelum tarikh mula: " + (r.nama || r.jenis), true); return; } if (+r.mula.slice(0, 4) < C.tahun - 1 || +r.mula.slice(0, 4) > C.tahun + 1) { toast("Tarikh " + dmy(r.mula) + " tidak sesuai untuk tahun " + C.tahun + ".", true); return; } }
    if (!items.some((r) => r.jenis === "Mula Sesi") || !items.some((r) => r.jenis === "Tamat Sesi")) { toast("Perlu ada baris Mula Sesi dan Tamat Sesi.", true); return; }
    if (S.busy) return; S.busy = true; toast("Menyimpan kalendar…", false, true);
    try {
      await erpPost({ action: "saveKalendar", emel: S.user.email, tahun: C.tahun, items });
      S.cal.rows = S.cal.rows.filter((r) => r.tahun !== C.tahun).concat(items.map((r) => ({ tahun: C.tahun, jenis: r.jenis, nama: r.nama, mula: r.mula, akhir: r.akhir })));
      calBuild(); C.dirty = false; S.minggu = currentWeekNo(); toast("Kalendar " + C.tahun + " disimpan (" + items.length + " baris). Tahun lain tidak diubah.");
    } catch (err) { toast(err.message || "Gagal menyimpan kalendar.", true); }
    finally { S.busy = false; render(); }
  }
}
async function tetSave(action, items, ok) {
  if (S.busy) return; S.busy = true; toast("Menyimpan…", false, true);
  try { await erpPost({ action, emel: S.user.email, items }); toast(ok); return true; }
  catch (err) { toast(err.message || "Gagal menyimpan.", true); return false; }
  finally { S.busy = false; }
}

/* ================= Dashboard Penghantaran (Pentadbir / Admin App) ================= */
const HD_KECUALI = ["DR. SURINA BINTI HAMED"]; // pengetua: tidak hantar e-RPH
/** Hanya GURU: tolak AKP (pembantu), pengetua dan kaunselor sepenuh masa (peraturan sama dengan Analisis e-RPH). */
function hdIsGuru(x) {
  const J = String(x.jawatan || "").toUpperCase();
  if (J.startsWith("PENGETUA") || J.indexOf("PEMBANTU") !== -1 || /\bAKP\b/.test(J) || J.indexOf("KAUNSELOR SEPENUH MASA") !== -1) return false;
  return !HD_KECUALI.some((n) => norm(n) === norm(x.nama));
}
function hdInit() { const c = currentWeekNo(); S.hd.tahun = wkYear(c); S.hd.minggu = c; S.hd.guru = ""; }
async function hdLoad(force) {
  const D = S.hd; if (D.busy) return; D.busy = true; if (force) toast("Memuatkan data penghantaran…", false, true);
  render();
  try {
    const [st, mg] = await Promise.all([erpGviz("DatabaseSTAFF", "", SPREADSHEET_ID), erpGviz("eRPH_Minggu")]);
    const seen = new Set(); D.staff = [];
    // DatabaseSTAFF: B=Nama C=Jawatan E=Emel1 F=Emel2
    st.forEach((r) => { const x = { nama: String(r[1] || "").trim(), jawatan: String(r[2] || "").trim(), e1: String(r[4] || "").trim().toLowerCase(), e2: String(r[5] || "").trim().toLowerCase() }; if (!x.nama || seen.has(norm(x.nama)) || !hdIsGuru(x)) return; seen.add(norm(x.nama)); D.staff.push(x); });
    D.staff.sort((a, b) => a.nama.localeCompare(b.nama, "ms"));
    D.rows = mg.map((r) => rowObj(r, ERP_MCOL)).filter((o) => o.emel);
    D.loaded = true; D.at = new Date().toLocaleString("en-GB").replace(",", "");
    if (force) toast("Data dikemas kini.");
  } catch (err) { toast("Gagal memuatkan data penghantaran: " + (err.message || err), true); }
  finally { D.busy = false; render(); }
}
function hdYears() {
  const s = new Set(ERP_WK.years); s.add(wkYear(currentWeekNo()));
  S.hd.rows.forEach((o) => { const id = +o.minggu; if (id) s.add(wkYear(id)); });
  return [...s].sort((a, b) => b - a);
}
function hdWeeks(y) {
  const ids = ERP_WK.list.filter((w) => w.year === y).map((w) => w.id).reverse();
  if (ids.length) return ids;
  const s = new Set(S.hd.rows.map((o) => +o.minggu).filter((id) => id && wkYear(id) === y)); const c = currentWeekNo(); if (wkYear(c) === y) s.add(c);
  return [...s].sort((a, b) => b - a);
}
const HD_SENT = ["Dihantar", "Disemak", "Dipulang"];
function hdCompute() {
  const D = S.hd, wid = D.minggu, y = wkYear(wid), nmax = wkNo(wid);
  const byE = {}, byN = {};
  D.staff.forEach((x, i) => { if (x.e1) byE[x.e1] = i; if (x.e2) byE[x.e2] = i; byN[norm(x.nama)] = i; });
  const per = D.staff.map((x) => ({ x, weeks: {} }));
  D.rows.forEach((o) => {
    const id = +o.minggu; if (!id || wkYear(id) !== y) return;
    let i = byE[String(o.emel).toLowerCase().trim()]; if (i === undefined) i = byN[norm(o.nama)];
    if (i !== undefined) per[i].weeks[id] = o;
  });
  return per.map((p) => {
    let jh = 0, sel = 0, pros = 0, bs = 0;
    Object.keys(p.weeks).forEach((id) => { if (wkNo(+id) > nmax) return; const st = p.weeks[id].status; if (HD_SENT.indexOf(st) === -1) return; jh++; if (st === "Disemak") sel++; else if (st === "Dihantar") pros++; else bs++; });
    const cur = p.weeks[wid], st = cur ? cur.status : "";
    const m = S.pnyMap.find((q) => q.guru === norm(p.x.nama));
    const pny = cur && st === "Disemak" && cur.penyemak ? cur.penyemak : m ? m.pny : S.pnyMap.length ? "—" : "SEMUA PENTADBIR";
    return { nama: p.x.nama, pny, tarikh: cur && HD_SENT.indexOf(st) !== -1 && cur.tarikhHantar ? dmy(cur.tarikhHantar.slice(0, 10)) : "—", st: HD_SENT.indexOf(st) !== -1 ? st : "Belum Hantar", jh, sel, pros, bs, jsem: sel + bs };
  });
}
function vHantar() {
  const D = S.hd;
  if (!D.loaded) return `<div class="erd"><div class="erd-load">${D.busy ? "Memuatkan data penghantaran…" : "Tiada data."}</div></div>`;
  if (!D.minggu) hdInit();
  const all = hdCompute(), N = all.length, sent = all.filter((r) => r.st !== "Belum Hantar").length, rev = all.filter((r) => r.st === "Disemak").length;
  const list = D.guru ? all.filter((r) => r.nama === D.guru) : all;
  const yrs = hdYears(), ws = hdWeeks(D.tahun);
  const pc = { "Belum Hantar": "b", Dihantar: "d", Disemak: "s", Dipulang: "p" };
  const zero = (v, c) => `<b class="${v ? c : "z" + c}">${v}</b>`;
  const rows = list.map((r, i) => `<div class="erd-r"><span class="n">${i + 1}</span><span class="nm">${E(r.nama)}</span><span class="py">${E(r.pny)}</span><span>${E(r.tarikh)}</span><span><i class="erd-st ${pc[r.st]}">${E(r.st.toUpperCase())}</i></span><span class="num">${r.jh}</span>${zero(r.sel, "g")}${zero(r.pros, "a")}${zero(r.bs, "r")}${zero(r.jsem, "c")}</div>`).join("");
  return `<div class="erd">
    <div class="erd-hero"><div class="erd-kick">DASHBOARD ANALISIS DATA</div><h2>REKOD PENGHANTARAN DAN SEMAKAN e-RPH<br>SM ARAB (JAIM) AL-ASYRAF</h2></div>
    <div class="erd-sec">// PILIHAN PAPARAN</div>
    <div class="erd-filters">
      <label><span>TAHUN</span><select data-act-change="hd-tahun">${yrs.map((y) => `<option value="${y}" ${y === D.tahun ? "selected" : ""}>${y}</option>`).join("")}</select></label>
      <label><span>MINGGU</span><select data-act-change="hd-minggu">${ws.map((w) => `<option value="${w}" ${w === D.minggu ? "selected" : ""}>${E(wkLbl(w))}</option>`).join("")}</select></label>
      <label><span>NAMA GURU</span><select data-act-change="hd-guru"><option value="">Semua Guru</option>${D.staff.map((x) => `<option value="${A(x.nama)}" ${x.nama === D.guru ? "selected" : ""}>${E(x.nama)}</option>`).join("")}</select></label>
    </div>
    <div class="erd-stats"><span>HANTAR MINGGU INI <b class="g">${sent}</b></span><span>BELUM HANTAR <b class="r">${N - sent}</b></span><span>SUDAH DISEMAK <b class="c">${rev} / ${N} GURU</b></span></div>
    <div class="erd-panel"><div class="erd-ph"><span>// PAPARAN DATA TERPERINCI</span><span class="r"><small>Dikemas kini: ${E(D.at)}</small><button type="button" data-act="hd-muat" ${D.busy ? "disabled" : ""}>⟳ MUAT SEMULA</button></span></div>
      <div class="erd-scroll"><div class="erd-t"><div class="erd-r hd"><span>NO.</span><span>NAMA GURU</span><span>PENYEMAK</span><span>TARIKH HANTAR</span><span>STATUS</span><span class="num">JUM. HANTAR</span><span class="num">SELESAI</span><span class="num">DALAM PROSES</span><span class="num">BELUM SIAP</span><span class="num">JUM. DISEMAK</span></div>
      ${rows || `<div class="erd-empty">Tiada data.</div>`}</div></div>
      <div class="erd-note">Hanya guru (tidak termasuk AKP, pengetua dan kaunselor sepenuh masa). Jum. Hantar = minggu dihantar hingga ${E(wkLbl(D.minggu))}; Selesai = disemak; Dalam Proses = menunggu semakan; Belum Siap = dipulangkan untuk pembetulan; Jum. Disemak = Selesai + Dipulang.</div></div></div>`;
}

/* ================= Semakan (Pentadbir) ================= */
const normN = (s) => norm(String(s == null ? "" : s).replace(/[^A-Za-z0-9\u00C0-\u024F ]+/g, " ")); // abai noktah/koma/tanda hubung dalam nama
/** Boleh lihat? Padanan ikut nama DAN emel (nama dalam eRPH_Minggu mungkin berbeza sedikit daripada DatabaseSTAFF). */
function canSee(o) {
  if (isAdminApp(S.user)) return true;
  if (!S.pnyMap.length) return true;
  const em = String(o.emel || "").toLowerCase().trim(), gNama = normN((S._staffByEmail && S._staffByEmail[em]) || o.nama);
  const gAlt = normN(o.nama), me = normN(S.user.nama), me2 = normN((S._staffByEmail && S._staffByEmail[String(S.user.email || "").toLowerCase().trim()]) || "");
  const m = S.pnyMap.filter((x) => { const g = normN(x.guru); return g === gNama || g === gAlt; });
  return !m.length || m.some((x) => { const p = normN(x.pny); return p === me || (me2 && p === me2); });
}
async function loadReviewList() {
  const q = "select * where G = 'Dihantar' or G = 'Disemak' or G = 'Dipulang'";
  // muat semula pemetaan penyemak + senarai staf supaya tetapan terkini (dan padanan ikut emel) digunakan
  const [rows, pny, st] = await Promise.all([erpGvizSafe("eRPH_Minggu", q), erpGvizSafe("eRPH_Penyemak"), erpGvizSafe("DatabaseSTAFF", "", SPREADSHEET_ID)]);
  if (pny.length || !S.pnyMap.length) S.pnyMap = pny.map((r) => ({ guru: norm(r[0]), pny: norm(r[1]) })).filter((x) => x.guru && x.pny);
  S._staffByEmail = {};
  st.forEach((r) => { const nm = String(r[1] || "").trim(); [r[4], r[5]].forEach((e) => { e = String(e || "").toLowerCase().trim(); if (e && nm) S._staffByEmail[e] = nm; }); });
  S.rev.list = rows.map((r) => rowObj(r, ERP_MCOL)).filter((o) => String(o.emel).toLowerCase() !== String(S.user.email).toLowerCase() && canSee(o))
    .sort((a, b) => (a.tarikhHantar < b.tarikhHantar ? 1 : -1));
  S.rev.loaded = true;
}
async function openReview(emel, minggu) {
  const q = `select * where lower(B) = '${String(emel).toLowerCase().replace(/'/g, "")}'`;
  const [h, s] = await Promise.all([erpGvizSafe("eRPH_Hari", q), erpGvizSafe("eRPH_Slot", q)]);
  const days = {}, slots = {};
  h.forEach((r) => { const o = rowObj(r, ERP_HCOL); if (+o.minggu === +minggu) days[+o.hariNo] = o; });
  s.forEach((r) => { const o = rowObj(r, ERP_SCOL); if (+o.minggu === +minggu) (slots[+o.hariNo] = slots[+o.hariNo] || []).push(o); });
  Object.keys(slots).forEach((k) => slots[k].sort((a, b) => +a.slotNo - +b.slotNo));
  const wk = S.rev.list.find((x) => String(x.emel).toLowerCase() === String(emel).toLowerCase() && +x.minggu === +minggu);
  const first = [1, 2, 3, 4, 5].find((x) => days[x] && days[x].semakan !== "Disemak" && days[x].status !== "Cuti") || 1;
  S.rev.sel = { emel, minggu: +minggu, wk, days, slots, hari: first, ulasan: "", slotIdx: 0 };
}
function vSemak() {
  const r = S.rev;
  if (!r.loaded) return `<div class="erp-loading">Memuatkan senarai semakan…</div>`;
  if (r.sel) return vSemakPanel();
  const f = r.filter;
  const list = r.list.filter((x) => f === "semua" || x.status === "Dihantar");
  const chips = `<div class="erp-chips"><button class="erp-chip ${f === "tunggu" ? "on" : ""}" data-act="rev-filter" data-f="tunggu" type="button">Menunggu semakan</button><button class="erp-chip ${f === "semua" ? "on" : ""}" data-act="rev-filter" data-f="semua" type="button">Semua</button><button class="erp-btn sm" style="margin-left:auto" data-act="rev-muat" type="button">↻ Muat semula</button></div>`;
  const items = list.map((x, i) => {
    const cls = { Dihantar: "s-belum", Disemak: "s-siap", Dipulang: "s-pulang" }[x.status] || "s-draf";
    const st = x.status === "Dihantar" ? "Menunggu" : x.status;
    return `<div class="erp-day" data-act="rev-open" data-i="${r.list.indexOf(x)}" style="cursor:pointer"><div class="k ${cls}" style="font-size:13px">M${wkNo(+x.minggu)}</div><div class="m"><b>${E(x.nama)}</b><span>${E(wkLbl(+x.minggu))} · ${E(dmy(x.awal))} – ${E(dmy(x.akhir))}${x.tarikhHantar ? " · dihantar " + E(x.tarikhHantar.slice(0, 10).split("-").reverse().join("/")) : ""}</span></div>${pill(cls, st)}</div>`;
  }).join("");
  const listHtml = `<div class="erp-card"><h3>Semakan RPH</h3>${chips}</div>${items || `<div class="erp-empty">Tiada RPH yang menunggu semakan.</div>`}`;
  return isPC() ? `<div class="erp-rcols"><div class="erp-rside">${revStatsHtml()}</div><div class="erp-rmain">${listHtml}</div></div>` : listHtml;
}
function vSemakPanel() {
  const v = S.rev.sel, h = v.hari, d = v.days[h];
  const tgl = (x) => dm(addDays(weekStart(v.minggu), x - 1));
  const disemak = [1, 2, 3, 4, 5].filter((x) => (v.days[x] && (v.days[x].semakan === "Disemak" || v.days[x].status === "Cuti"))).length;
  const hariList = [1, 2, 3, 4, 5].map((x) => {
    const dd = v.days[x];
    let cls = "s-belum", t = "Belum ada";
    if (dd) { if (dd.status === "Cuti") { cls = "s-belum"; t = "Cuti"; } else if (dd.semakan === "Disemak") { cls = "s-siap"; t = "Disemak"; } else if (dd.semakan === "Dipulang") { cls = "s-pulang"; t = "Dipulang"; } else { cls = "s-belum"; t = "Menunggu"; } }
    return `<div class="erp-day ${x === h ? "sel" : ""}" data-act="rev-day" data-h="${x}" style="cursor:pointer"><div class="k ${cls}">H${x}</div><div class="m"><b>${ERP_HARI[x - 1]} <span style="display:inline;font-weight:400">· ${tgl(x)}</span></b><span>${((v.slots[x] || []).length)} kelas</span></div>${pill(cls, t)}</div>`;
  }).join("");
  let detail = `<div class="erp-empty">Hari ini tiada RPH.</div>`;
  if (d) {
    const sl = v.slots[h] || [], si = Math.min(v.slotIdx, Math.max(0, sl.length - 1)), s = sl[si];
    const chips = sl.map((x, i) => `<button class="erp-chip ${i === si ? "on" : ""}" data-act="rev-slot" data-i="${i}" type="button">Kelas ${i + 1}</button>`).join("");
    const kv = (k, val) => `<div><span class="k">${k}</span><span class="v">${E(val || "-")}</span></div>`;
    const kar = d.karAda === "YA" ? `<div><span class="k">Pembentukan Karakter (15 minit)</span><span class="v" style="display:flex;flex-direction:column;gap:2px"><span>Tarikh: <b>${E(dmyHari(d.tarikh, h))}</b></span><span>Masa: <b>${E(t12(d.karMula) + " – " + t12(d.karAkhir))}</b></span><span>Elemen Teras Karakter: <b>${E(d.karElemen)}</b></span><span>Catatan Aktiviti: <b>${E(d.karCatatan)}</b></span></span></div>` : "";
    detail = `<div class="erp-chips">${chips}</div>${s ? `<div class="erp-kv">${kv("Masa", t12(s.mula) + " – " + t12(s.akhir))}${kv("Kelas / Subjek", s.kelas + " · " + s.subjek)}${kv("Tema / Tajuk", [s.tema, s.tajuk].filter((x, i, a) => x && a.indexOf(x) === i).join(" / "))}${kv("Std. Kandungan", s.stdKandungan)}${kv("Std. Pembelajaran", s.stdPembelajaran)}${kv("Objektif", s.objektif)}${kv("Ringkasan Aktiviti", s.ringkasan)}${kv("Pentaksiran", s.pentaksiran)}${kv("Ujian / Pentaksiran", [s.ujian === "YA" ? "Ada Ujian" : "", s.pentakAda === "YA" ? "Ada Pentaksiran" : ""].filter(Boolean).join(", "))}${kv("Impak / Refleksi", s.refleksi)}${kar}</div>` : ""}
      ${d.semakan === "Dipulang" ? `<div class="erp-hint">Dipulangkan: ${E(d.ulasan)}</div>` : ""}
      <div class="erp-f"><label class="erp-lbl">Ulasan penyemak (pilihan; wajib bila perlu pembetulan)</label><textarea class="erp-ta" id="erp-ulasan" rows="3" placeholder="Tulis ulasan atau cadangan pembetulan…">${E(v.ulasan || (d.semakan === "Dipulang" ? "" : d.ulasan))}</textarea></div>`;
  }
  const can = disemak === 5;
  return `<div class="erp-title2">Semakan RPH ${wkLbl(v.minggu)}<br>Guru: ${E(v.wk ? v.wk.nama : "")}</div>
    <div class="erp-card"><div class="erp-between"><span style="font-weight:600">Kemajuan semakan</span><span style="font-weight:700;color:var(--acc)">${disemak} / 5 hari disemak</span></div><div class="erp-bar" style="margin-top:8px"><i style="width:${disemak * 20}%"></i></div></div>
    <div class="erp-main two"><div style="display:flex;flex-direction:column;gap:10px">${hariList}
      <div class="erp-card dash"><button class="erp-btn ${can ? "ok" : ""}" style="width:100%;height:48px" data-act="rev-hantar" type="button" ${can ? "" : "disabled"}>Hantar Semakan Minggu ${v.minggu}</button>
        <button class="erp-btn" style="width:100%;margin-top:8px" data-act="rev-kembali" type="button">‹ Kembali</button>
        <div class="erp-hint" style="text-align:center;margin-top:8px">Aktif bila H1–H5 semuanya disemak.</div></div></div>
    <div class="erp-card" style="border:2px solid var(--g);padding:0;overflow:hidden"><div class="erp-semakhead"><b>H${h} · ${ERP_HARI[h - 1]} ${tgl(h)}</b>${d && d.status !== "Cuti" ? `<span class="erp-right" style="margin-left:auto"><button class="erp-btn sm w" data-act="rev-pulang" type="button">Perlu pembetulan</button><button class="erp-btn sm wsolid" data-act="rev-semak" type="button">Disemak ✓</button></span>` : ""}</div>
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:12px"><div class="erp-hint">Satu semakan untuk seluruh hari ini. Kelas di bawah hanya untuk dibaca.</div>${detail}${d && d.status !== "Cuti" ? `<div class="erp-right"><button class="erp-btn sm" data-act="rev-cetak" type="button">Cetak / PDF hari ini</button></div>` : ""}</div></div></div>`;
}
async function revSemak(status) {
  const v = S.rev.sel, d = v.days[v.hari]; if (!d || S.busy) return;
  const ul = (document.getElementById("erp-ulasan") || {}).value || "";
  if (status === "Dipulang" && !ul.trim()) { toast("Tulis ulasan pembetulan dahulu.", true); return; }
  S.busy = true;
  try {
    await erpPost({ action: "semakHari", emelGuru: v.emel, minggu: v.minggu, hariNo: v.hari, status, penyemak: S.user.nama, ulasan: ul });
    d.semakan = status; d.ulasan = ul; d.semakOleh = S.user.nama;
    if (status === "Dipulang" && v.wk) v.wk.status = "Dipulang";
    v.ulasan = "";
    toast(status === "Disemak" ? "Hari ditanda disemak." : "Hari dipulangkan untuk pembetulan.");
    const next = [1, 2, 3, 4, 5].find((x) => x !== v.hari && v.days[x] && v.days[x].semakan !== "Disemak" && v.days[x].status !== "Cuti");
    if (status === "Disemak" && next) { v.hari = next; v.slotIdx = 0; }
  } catch (err) { toast(err.message || "Gagal.", true); }
  finally { S.busy = false; render(); }
}
async function revHantar() {
  const v = S.rev.sel; if (S.busy) return;
  if (!await ask("Hantar semakan Minggu " + v.minggu + " untuk " + (v.wk ? v.wk.nama : "") + "?")) return;
  S.busy = true;
  try {
    await erpPost({ action: "hantarSemakan", emelGuru: v.emel, minggu: v.minggu, penyemak: S.user.nama });
    if (v.wk) { v.wk.status = "Disemak"; v.wk.penyemak = S.user.nama; }
    toast("Semakan dihantar."); S.rev.sel = null;
  } catch (err) { toast(err.message || "Gagal.", true); }
  finally { S.busy = false; render(); }
}

/* ================= Acara ================= */
async function onClick(e) {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "tema") return erpTemaToggle();
  if (a === "logout") { if (await ask("Log keluar?")) logout(); return; }
  if (a === "close") return closeModal();
  if (a === "tab") { if (S.view === "borang" && !(await leaveDay())) return; S.tab = b.dataset.t; if (S.tab === "semak" && !S.rev.loaded) { render(); await loadReviewList(); } if (S.tab === "tetapan" && !S.tet.loaded) { render(); await loadTetapan(); } if (S.tab === "hantar" && !S.hd.loaded) { hdInit(); render(); await hdLoad(); return; } render(); return; }
  if (a === "open-day") return openDay(+b.dataset.h);
  if (a === "goto-day") { if (+b.dataset.h === S.cur.hariNo) return; if (!(await leaveDay())) return; return openDay(+b.dataset.h); }
  if (a === "kembali") { if (!(await leaveDay())) return; S.view = "senarai"; S.cur = null; render(); window.scrollTo(0, 0); return; }
  if (a === "slot") { S.cur.idx = +b.dataset.i; S._keepScroll = true; return render(); }
  if (a === "tambah-slot") {
    const jd = jadualDay(S.cur.hariNo), used = S.cur.slots.map((s) => norm(s.kelas) + "|" + s.mula);
    const nx = jd.find((j) => used.indexOf(norm(j.kelas) + "|" + j.mula) === -1);
    S.cur.slots.push(blankSlot(nx || {})); S.cur.idx = S.cur.slots.length - 1; dirty(); return render();
  }
  if (a === "buang-slot") { if (!await ask("Buang Kelas " + (S.cur.idx + 1) + "?")) return; S.cur.slots.splice(S.cur.idx, 1); S.cur.idx = Math.max(0, S.cur.idx - 1); dirty(); return render(); }
  if (a === "tet-add") { S.tet.rows.push({ k: "", v: "" }); return render(); }
  if (a === "tet-del") { S.tet.rows.splice(+b.dataset.i, 1); return render(); }
  if (a === "tet-save") {
    const items = S.tet.rows.filter((r) => r.k.trim()).map((r) => ({ kunci: r.k.trim(), nilai: r.v.trim() }));
    const w = items.find((x) => x.kunci === "MINGGU1_MULA");
    if (w && !/^\d{4}-\d{2}-\d{2}$/.test(w.nilai)) { toast("MINGGU1_MULA mesti tarikh (hh/bb/tttt).", true); return; }
    if (await tetSave("saveTetapan", items, "Tetapan disimpan.") && w) { ERP_W1 = w.nilai; }
    return;
  }
  if (a === "pny-save") {
    const items = S.tet.staff.map((x) => ({ guru: x.nama, penyemak: S.tet.asg[norm(x.nama)] || "" })).filter((x) => x.penyemak);
    if (await tetSave("savePenyemak", items, "Guru dan penyemak disimpan (" + items.length + " pemetaan).")) S.pnyMap = items.map((x) => ({ guru: norm(x.guru), pny: norm(x.penyemak) }));
    return;
  }
  if (a === "dd-pick") return ddPick(+b.dataset.i);
  if (a === "dd-arr") { const f = b.dataset.f; if (S._dd && S._dd.f === f) return ddCloseAll(); const el = document.querySelector('[data-dd="' + f + '"]'); if (el) el.focus(); return ddOpen(f); }
  if (a === "dash") { if (S.view === "borang" && !(await leaveDay())) return; S.view = "dash"; S.cur = null; render(); window.scrollTo(0, 0); return; }
  if (a === "buka-minggu") {
    S.minggu = +b.dataset.n; S.view = "senarai"; render(); window.scrollTo(0, 0);
    if (!S.mine.minggu[S.minggu] && ![1, 2, 3, 4, 5].some((h) => S.mine.hari[S.minggu + "|" + h])) await wujudMinggu(S.minggu);
    return;
  }
  if (a === "wujud-minggu") return wujudMinggu(S.minggu);
  if (a.indexOf("cal-") === 0) return calAct(a, b);
  if (a === "hd-muat") return hdLoad(true);
  if (a === "pick") return openPicker(b.dataset.f);
  if (a === "pick-val") return pickValue(+b.dataset.i);
  if (a === "pick-own") return pickOwn();
  if (a === "pilih-jadual") return openJadualPicker();
  if (a === "jd-val") return applyJadual(+b.dataset.i);
  if (a === "salin-slot") return openCopySlot();
  if (a === "cp-val") return applyCopySlot(+b.dataset.i);
  if (a === "salin-minggu") return openCopyWeek();
  if (a === "cw-val") return copyWeek(S._cw[+b.dataset.i]);
  if (a === "simpan") {
    const d = S.cur, st = d.status === "Siap" ? "Siap" : "Draf";
    if (st === "Siap") { const er = validateDay(d); if (er.length) { toast(er[0], true); return; } }
    if (st === "Siap") { if (await saveCur(st)) render(); return; }
    await saveCur(st, false, true); render(); return;
  }
  if (a === "siap") {
    const er = validateDay(S.cur); if (er.length) { toast(er[0], true); return; }
    if (await saveCur("Siap")) { S.view = "senarai"; S.cur = null; render(); window.scrollTo(0, 0); } return;
  }
  if (a === "cuti") { if (!await ask("Tandakan hari ini sebagai cuti / tiada RPH? Kandungan hari ini akan dikosongkan.")) return; if (await saveCur("Cuti")) render(); return; }
  if (a === "batal-cuti") { S.cur.status = "Draf"; const jd = jadualDay(S.cur.hariNo); S.cur.slots = jd.length ? jd.map((j) => blankSlot(j)) : [blankSlot()]; S.cur.idx = 0; dirty(); render(); return; }
  if (a === "cetak") {
    const d = S.cur, er = validateDay(d);
    cetak(d, { nama: S.user.nama, status: d.status, semakOleh: d.semakan === "Disemak" ? d.semakOleh : "" }); return;
  }
  if (a === "hantar") return hantarMinggu();
  if (a === "muat") { toast("Memuatkan semula…", false, true); await _saveQ; await erpLoadMine(); render(); return; }
  // ---- semakan
  if (a === "rev-filter") { S.rev.filter = b.dataset.f; return render(); }
  if (a === "rev-muat") { S.rev.loaded = false; render(); await loadReviewList(); return render(); }
  if (a === "rev-open") { const x = S.rev.list[+b.dataset.i]; toast("Memuatkan…"); await openReview(x.emel, x.minggu); return render(); }
  if (a === "rev-day") { S.rev.sel.hari = +b.dataset.h; S.rev.sel.slotIdx = 0; S.rev.sel.ulasan = ""; return render(); }
  if (a === "rev-slot") { S.rev.sel.ulasan = (document.getElementById("erp-ulasan") || {}).value || ""; S.rev.sel.slotIdx = +b.dataset.i; return render(); }
  if (a === "rev-semak") return revSemak("Disemak");
  if (a === "rev-pulang") return revSemak("Dipulang");
  if (a === "rev-hantar") return revHantar();
  if (a === "rev-kembali") { S.rev.sel = null; return render(); }
  if (a === "rev-cetak") {
    const v = S.rev.sel, dd = v.days[v.hari], d = dayFromRows(v.minggu, v.hari, dd, v.slots[v.hari]);
    cetak(d, { nama: v.wk ? v.wk.nama : "", status: dd.semakan || dd.status, semakOleh: dd.semakan === "Disemak" ? dd.semakOleh : "" }); return;
  }
}

/* ================= Mula ================= */
async function erpInit(user) {
  S.user = user; S.isPny = isPentadbir(user);
  erpTemaApply(erpTemaGet());
  document.documentElement.classList.add("erp-html");
  const root = document.getElementById("erp-root");
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("erp-pickbox")) { e.preventDefault(); e.target.click(); } });
  root.addEventListener("change", onChange);
  root.addEventListener("focusin", (e) => { const f = e.target.dataset && e.target.dataset.dd; if (f) ddOpen(f); });
  root.addEventListener("focusout", () => setTimeout(() => { const a = document.activeElement; if (!a || !a.closest || !a.closest(".erp-ddf")) ddCloseAll(); }, 150));
  root.addEventListener("mousedown", (e) => { if (e.target.closest(".erp-ddlist") || e.target.closest("[data-act=dd-arr]")) e.preventDefault(); });
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") ddCloseAll(); });
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (S._pc !== isPC() && S.user && !S.busy) { S._pc = isPC(); if (S.view === "dash" && !S._pc) S.view = "senarai"; S._keepScroll = true; render(); } }, 200); });
  const mb = document.getElementById("erp-modal");
  mb.addEventListener("click", (e) => { if (e.target === mb) closeModal(); else onClick(e); });
  mb.addEventListener("input", (e) => {
    if (e.target.id !== "erp-q" || !S._pick) return;
    document.getElementById("erp-opts").innerHTML = optList(S._pick.vals, e.target.value);
    const own = document.getElementById("erp-own"), v = e.target.value.trim();
    own.classList.toggle("hidden", !v); own.textContent = "Guna teks saya: " + (v.length > 60 ? v.slice(0, 60) + "…" : v);
  });
  try {
    erpInitTabs();
    await Promise.all([erpLoadCommon(), erpLoadCal(), erpLoadJadual(), typeof emLoad === "function" ? emLoad().catch(() => {}) : null]);
    await erpLoadMine();
    S.minggu = currentWeekNo();
    S.view = isPC() ? "dash" : "senarai"; S._pc = isPC();
    render();
  } catch (err) {
    root.innerHTML = `<div class="erp-empty">Ralat memuatkan e-RPH: ${E(err.message || err)}<br>Semak Sheet dikongsi “Anyone with the link – Viewer”.</div>`;
  }
}
function erpInitEntry(user) { return erpInit(user); }

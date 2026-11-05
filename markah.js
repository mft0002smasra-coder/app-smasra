/* ============================================================
   MARKAH UJIAN MURID (embed Google Sites / PC dahulu)
   - BACA : gviz daripada Sheet markah (MU_Tetapan, MU_Markah, MU_Ulasan) + DatabaseMurid (Sheet utama) + Jadual Guru
   - TULIS: Apps Script berasingan (Code-Markah.gs)
   - Halaman: Isi Markah | Keputusan Kelas | Keputusan Tingkatan | Analisis Mata Pelajaran | Slip Keputusan | Tetapan
   Bergantung: app.js (initApp, postToAppsScript, escapeHtml, SCHOOL_LOGO_URL, logout), enrolmen-murid.js (EM_SHEET_ID),
               jadual-guru.js (jgFetchRecords, jgRecords), markah-core.js (MUC)
   ============================================================ */
const MU_SHEET_ID = "1tNsTfxYL0HdfQiHWsLhcGUEOvIHDlz4I5N1hq-tX8bY";
const MU_API_URL = "https://script.google.com/macros/s/AKfycbx2MHUcmS5bGmJkPr_XNL2Sq85gpCnqL2TCkZydWVkZeEMS68PPEGCY5B7vn3Zse4P7/exec";
const MU_SCHOOL = "SMA (JAIM) AL ASYRAF PEKAN PULAU SEBANG";
const MU_ALAMAT = "Bukit Merchat, Jalan Tanjung Rimau Luar, 78000 Alor Gajah, Melaka";

const C = MUC;
const muOk = (v) => v && String(v).indexOf("PASTE_") !== 0;
const E = (s) => escapeHtml(s == null ? "" : String(s));
const A = (s) => escapeAttr(s == null ? "" : String(s));
const up = C.up;
const APP = window.MU_APP || ""; // "app" = halaman Pengisian Markah dalam APP SMASRA (hanya bar navigasi bawah APP); kosong = embed penuh
const pad = (n) => String(n).padStart(2, "0");
const f2 = (x) => (x === null || x === undefined || isNaN(x) ? "–" : x.toFixed(2));

let S = {
  user: null, adm: false, tab: "utama", home: { tkt: 0, all: false, view: "kelas", open: "" }, busy: false,
  tet: C.cantum(null), tetOk: false, td: null, tdDirty: false,
  murid: [], muridOk: false,
  marks: {}, ulasan: {}, loaded: {},          // marks[ujianId][KELAS|KOD] ; ulasan[ujianId][KELAS] = {kunci:teks}
  jg: [],                                      // tugasan guru daripada Jadual Guru: [{kelas, kod}]
  ujianId: "", kelas: "", tkt: 0, scope: "ALL",
  cache: {}, tktKelas: "",
  isi: { uj: "", kelas: "", subjek: "", anim: false }, staff: [], tetOpen: {},
  draft: {}, draftKey: "", dirty: false,
  slip: { mode: "satu", sel: 0, ulasan: {}, dirty: false },
};

/* ================= Pembantu ================= */
function toast(msg, err, sticky) {
  const el = document.getElementById("erp-toast"); if (!el) return;
  el.textContent = msg; el.classList.toggle("err", !!err); el.classList.toggle("busy", !!sticky); el.classList.remove("hidden");
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  clearTimeout(el._t); if (!sticky) el._t = setTimeout(() => el.classList.add("hidden"), err ? 6500 : 3000);
}
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
function temaGet() { try { return localStorage.getItem("erph_tema") === "gelap" ? "gelap" : "cerah"; } catch (e) { return "cerah"; } }
function temaApply(t) { document.body.setAttribute("data-erp", t); try { localStorage.setItem("erph_tema", t); } catch (e) {} }
const isAdminApp = (u) => String(u.role3 || "").trim().toLowerCase() === "admin app";
function isPentadbir(u) {
  if ([u.role, u.role2, u.role3].some((r) => String(r || "").trim().toLowerCase() === "pentadbir" || String(r || "").trim().toLowerCase() === "admin app")) return true;
  const j = String(u.jawatan || "").trim().toUpperCase();
  return j === "PK" || ["PENGETUA", "PK ", "GKMP"].some((k) => j.startsWith(k));
}
const canon = (k) => (typeof emCanonKelas === "function" ? emCanonKelas(k) : String(k || "").trim());

async function gviz(sheet, tq, sid) {
  let url = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}&headers=1&_ts=${Date.now()}`;
  if (tq) url += "&tq=" + encodeURIComponent(tq);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const parsed = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (parsed.status === "error") throw new Error("Tab '" + sheet + "' tidak dapat dibaca");
  const t = parsed.table || {};
  return { cols: (t.cols || []).map((c) => String(c.label || "").trim()), rows: (t.rows || []).map((r) => (r.c || []).map((c) => (c && c.v != null ? String(c.v) : ""))) };
}
async function apiGet(params) {
  if (!muOk(MU_API_URL)) throw new Error("API belum dipasang");
  const r = await fetch(MU_API_URL + "?" + new URLSearchParams(Object.assign({ _ts: Date.now() }, params)), { cache: "no-store" });
  const j = await r.json(); if (!j || j.ok === false) throw new Error((j && j.message) || "API gagal"); return j;
}
async function post(payload) {
  if (!muOk(MU_API_URL)) throw new Error("API Markah belum dipasang (MU_API_URL belum diisi dalam markah.js).");
  const r = await postToAppsScript(MU_API_URL, Object.assign({ emel: S.user.email }, payload));
  if (!r || r.success === false) throw new Error((r && r.message) || "Gagal menyimpan.");
  return r;
}

/* ================= Muat data ================= */
async function loadTetapan() {
  if (!muOk(MU_SHEET_ID)) return;
  let saved = {}, ok = false;
  try {
    const t = await gviz("MU_Tetapan", "", MU_SHEET_ID);
    t.rows.forEach((r) => { if (r[0]) { try { saved[r[0].trim()] = JSON.parse(r[1]); } catch (e) {} } }); ok = true;
  } catch (e) {
    try { saved = (await apiGet({ action: "getTetapan" })).tetapan || {}; ok = true; } catch (e2) { S.readErr = true; }
  }
  if (ok) { S.readErr = false; S.tet = C.cantum(saved); S.tetOk = Object.keys(saved).length > 0; bust(); }
}
async function loadMurid() {
  try {
    const t = await gviz("DatabaseMurid", "", EM_SHEET_ID);
    const norm = (h) => String(h || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    const ix = {}; t.cols.forEach((c, i) => { const h = norm(c); if (h === "NAMA" || h === "NAMA MURID") ix.nama = ix.nama ?? i; if (h === "KELAS") ix.kelas = ix.kelas ?? i; if (h === "NO PENGENALAN") ix.kp = i; if (h === "NAMA GURU KELAS") ix.guru = i; });
    if (ix.nama === undefined || ix.kelas === undefined) { S.muridOk = false; return; }
    const seen = new Set(), out = [];
    t.rows.forEach((r) => {
      const nama = (r[ix.nama] || "").trim(), kelas = (r[ix.kelas] || "").trim(); if (!nama || !kelas) return;
      const kp = ix.kp !== undefined ? (r[ix.kp] || "").trim() : "";
      const k = (kp.replace(/[^0-9A-Za-z]/g, "") || "-") + "|" + up(nama) + (kp ? "" : "|" + up(kelas)); if (seen.has(k)) return; seen.add(k);
      out.push({ nama: up(nama), kelas: up(kelas), kp, guru: ix.guru !== undefined ? (r[ix.guru] || "").trim() : "" });
    });
    out.forEach((m) => { m.ting = C.tingOf(m.kelas); m.key = C.muKey(m); });
    out.sort((a, b) => a.kelas.localeCompare(b.kelas, "ms", { numeric: true }) || a.nama.localeCompare(b.nama, "ms"));
    S.murid = out; S.muridOk = true; bust();
  } catch (e) { S.muridOk = false; }
}
async function loadStaff() {
  try {
    const st = await gviz("DatabaseSTAFF", "", SPREADSHEET_ID), kecuali = (j) => /^(PEMBANTUKHIDMATAM|PEMBANTUTADBIR|PEMBANTUMAKMAL)/.test(String(j || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
    S.staff = [...new Set(st.rows.filter((r) => (r[1] || "").trim() && !kecuali(r[2])).map((r) => up(r[1])))].sort((a, b) => a.localeCompare(b, "ms"));
  } catch (e) { S.staff = []; }
}
async function loadMarks(uid, force) {
  if (!uid || (S.loaded[uid] && !force)) return;
  S.marks[uid] = {}; S.ulasan[uid] = {};
  if (muOk(MU_SHEET_ID)) {
    const q = "select * where B = '" + uid.replace(/'/g, "") + "'";
    let m, u;
    try { [m, u] = await Promise.all([gviz("MU_Markah", q, MU_SHEET_ID), gviz("MU_Ulasan", q, MU_SHEET_ID)]); }
    catch (e) { try { const j = await apiGet({ action: "getMarkah", ujian: uid }); m = { rows: j.markah || [] }; u = { rows: j.ulasan || [] }; } catch (e2) { S.readErr = true; m = { rows: [] }; u = { rows: [] }; } }
    m.rows.forEach((r) => { let marks = {}; try { marks = JSON.parse(r[5] || "{}"); } catch (e) {} S.marks[uid][up(r[2]) + "|" + up(r[3])] = { status: r[4] || "Draf", marks, oleh: r[6], kemaskini: r[8] }; });
    u.rows.forEach((r) => { try { S.ulasan[uid][up(r[2])] = JSON.parse(r[3] || "{}"); } catch (e) {} });
  }
  S.loaded[uid] = true; bust();
}
async function loadJg() {
  try { await jgFetchRecords(false); } catch (e) {}
  S.jg = [];
  if (typeof jgRecords === "undefined") return;
  const nama = up(S.user.nama), seen = new Set();
  const recs = jgRecords.filter((r) => up(r.guru) === nama || (nama.length > 5 && up(r.guru) && (up(r.guru).indexOf(nama) !== -1 || nama.indexOf(up(r.guru)) !== -1)));
  recs.forEach((r) => {
    if (!up(r.kelas)) return;
    const kelas = up(canon(r.kelas)), lv = C.lvlOf(C.tingOf(kelas), S.tet);
    const s = C.cariSubjek(r.subjek, S.tet.subjek.filter((x) => x.lvl === lv)); if (!s) return;
    const k = kelas + "|" + s.kod; if (seen.has(k)) return; seen.add(k); S.jg.push({ kelas, kod: s.kod });
  });
}

/* ================= Data terbitan ================= */
const ujianBy = (id) => S.tet.ujian.find((u) => u.id === id);
const subjBy = (kod, ting) => S.tet.subjek.find((s) => s.kod === kod && (!ting || s.lvl === C.lvlOf(ting, S.tet)));
const sameNama = (a, b) => { a = up(a); b = up(b); return !!a && !!b && (a === b || (b.length > 5 && (a.indexOf(b) !== -1 || b.indexOf(a) !== -1))); };
const guruAuto = (k) => (muridKelas(k).find((m) => m.guru) || {}).guru || "";
const guruKelasOf = (k) => (S.tet.guruKelas && S.tet.guruKelas[k]) || guruAuto(k);
const allKelas = () => [...new Set(S.murid.map((m) => m.kelas))].sort((a, b) => a.localeCompare(b, "ms", { numeric: true }));
const muridKelas = (k) => S.murid.filter((m) => m.kelas === k);
const kelasGuru = () => allKelas().filter((k) => sameNama(guruKelasOf(k), S.user.nama));
const kelasBoleh = () => allKelas();
const bolehKeputusan = () => S.adm || ((S.tet.akses && S.tet.akses.keputusan) || []).some((n) => sameNama(n, S.user.nama)); // tab Keputusan Kelas / Tingkatan
const slipKelas = () => (S.adm ? allKelas() : kelasGuru());
const ujianUntukTkt = (t) => S.tet.ujian.filter((u) => !t || (u.tkt || []).indexOf(t) !== -1);
function tabsAda() {
  if (APP) return [["isi", "Isi Markah"], ["utama", "Status Pengisian"]];
  const T = [["utama", "Utama"], ["isi", "Isi Markah"], ["kelas", "Keputusan Kelas"], ["tkt", "Keputusan Tingkatan"], ["analisis", "Analisis Mata Pelajaran"], ["slip", "Slip Keputusan"]];
  if (!bolehKeputusan()) { for (const k of ["kelas", "tkt"]) T.splice(T.findIndex((x) => x[0] === k), 1); }
  if (!(S.adm || kelasGuru().length)) T.splice(T.findIndex((x) => x[0] === "slip"), 1); // Slip: guru kelas, Pentadbir, Admin App sahaja
  if (S.adm) T.push(["tetapan", "Tetapan"]); // Pentadbir / Admin App sahaja
  return T;
}
/** Kira semua murid dalam satu kelas untuk satu ujian. */
const bust = () => { S.cache = {}; };
function kiraKelas(uid, kelas) {
  const ck = "k|" + uid + "|" + kelas; if (S.cache[ck]) return S.cache[ck];
  const ms = muridKelas(kelas), ting = ms.length ? ms[0].ting : C.tingOf(kelas), marks = S.marks[uid] || {};
  const list = ms.map((m) => ({ m, c: C.kiraMurid(m, kelas, S.tet, marks, ting) }));
  const rk = C.kedudukan(list, (x) => x.c);
  list.forEach((x) => { x.rk = rk.get(x) || null; });
  return (S.cache[ck] = { ting, list });
}
function kiraTkt(uid, ting) {
  const ck = "t|" + uid + "|" + ting; if (S.cache[ck]) return S.cache[ck];
  const kelas = allKelas().filter((k) => C.tingOf(k) === ting), groups = kelas.map((k) => kiraKelas(uid, k));
  const all = [].concat(...groups.map((g) => g.list)), rt = C.kedudukan(all, (x) => x.c);
  all.forEach((x) => { x.rt = rt.get(x) || null; x.nt = all.length; });
  return (S.cache[ck] = { kelas, groups, all });
}

/* ================= Kerangka ================= */
function head() {
  if (APP) return `<div class="mu-seg">${tabsAda().map(([t, l]) => `<button class="${S.tab === t ? "on" : ""}" data-act="tab" data-t="${t}" type="button">${l}</button>`).join("")}</div>`;
  const g = temaGet() === "gelap";
  const tools = `<div class="erp-head-tools"><button class="out" data-act="tema" type="button">${g ? "☀ Cerah" : "☾ Gelap"}</button><button class="out" data-act="logout" type="button">Log keluar</button></div>`;
  const T = tabsAda().map(([t, l]) => `<button class="erp-tab g ${S.tab === t ? "on" : ""}" data-act="tab" data-t="${t}" type="button">${l}</button>`).join("");
  return `<div class="erp-head"><div class="hl"><span class="t">Markah Ujian</span><span class="t sch">SM ARAB (JAIM) AL-ASYRAF</span></div><div class="n">${E(S.user.nama)}</div>${tools}</div>
    <div class="erp-tabs"><i class="erp-ind"></i>${T}</div>`;
}
function tabInd() {
  const bar = document.querySelector(".erp-tabs"); if (!bar) return;
  const on = bar.querySelector(".erp-tab.on"), ind = bar.querySelector(".erp-ind"); if (!on || !ind) return;
  const x = on.offsetLeft, w = on.offsetWidth, p = S._ind;
  if (p && p.w) { ind.style.transition = "none"; ind.style.transform = `translateX(${p.x}px)`; ind.style.width = p.w + "px"; ind.getBoundingClientRect(); }
  requestAnimationFrame(() => { ind.style.transition = ""; ind.style.transform = `translateX(${x}px)`; ind.style.width = w + "px"; });
  S._ind = { x, w };
}
window.addEventListener("resize", () => { S._ind = null; tabInd(); });
function render() {
  const root = document.getElementById("erp-root"); if (!root) return;
  root.classList.add("erp-semak");
  if (APP && S.tab !== "utama") S.tab = "isi";
  if ((S.tab === "kelas" || S.tab === "tkt") && !bolehKeputusan()) S.tab = "isi";
  if (S.tab === "tetapan" && !S.adm) S.tab = "isi";
  const v = { utama: APP ? vStatusApp : vUtama, isi: vIsi, kelas: vKelas, tkt: vTkt, analisis: vAnalisis, slip: vSlip, tetapan: vTetapan }[S.tab] || vIsi;
  const y = window.scrollY;
  root.innerHTML = head() + `<div class="erp-main mu">${v()}</div>`;
  if (S._keepScroll) window.scrollTo(0, y); S._keepScroll = false;
  tabInd();
}
const opt = (v, t, cur) => `<option value="${A(v)}" ${String(v) === String(cur) ? "selected" : ""}>${E(t)}</option>`;
const fld = (lbl, inner) => `<div class="erp-f mu-fld"><label class="erp-lbl">${lbl}</label>${inner}</div>`;
const warnMurid = () => (S.readErr ? `<div class="mu-warn">Tetapan / markah TIDAK dapat dibaca daripada Sheet Markah (semak Sheet dikongsi “Anyone with the link – Viewer” dan Web App telah di-deploy versi terkini). Tetapan lalai dipaparkan sementara — JANGAN simpan tetapan sehingga ini dibetulkan.</div>` : "") + (S.muridOk ? "" : `<div class="mu-warn">Data murid tidak dapat dibaca daripada DatabaseMurid. Semak Sheet dikongsi “Anyone with the link – Viewer”.</div>`) + (muOk(MU_SHEET_ID) && muOk(MU_API_URL) ? "" : `<div class="mu-warn">Sheet / API Markah belum dipasang (MU_SHEET_ID, MU_API_URL dalam markah.js). Paparan menggunakan tetapan lalai dan tiada markah boleh disimpan.</div>`);

/* ================= Isi Markah ================= */
function isiOpts() {
  const I = S.isi;
  const kelas = allKelas();
  if (I.kelas && kelas.indexOf(I.kelas) === -1) I.kelas = "";
  const ting = I.kelas ? C.tingOf(I.kelas) : 0;
  const subj = !I.kelas ? [] : C.subjekTkt(S.tet, ting);
  if (I.subjek && !subj.some((s) => s.kod === I.subjek)) I.subjek = "";
  const uj = ujianUntukTkt(ting).filter((u) => S.adm || u.buka);
  if (I.uj && !uj.some((u) => u.id === I.uj)) I.uj = "";
  return { kelas, subj, uj, ting, ready: !!(I.uj && I.kelas && I.subjek) };
}
function draftInit() {
  const k = [S.isi.uj, S.isi.kelas, S.isi.subjek].join("|");
  if (S.draftKey === k) return;
  const rec = (S.marks[S.isi.uj] || {})[up(S.isi.kelas) + "|" + up(S.isi.subjek)];
  S.draft = Object.assign({}, rec ? rec.marks : {}); S.draftKey = k; S.dirty = false;
}
function isiStat(ting) {
  const ms = muridKelas(S.isi.kelas), sk = C.skala(S.tet, ting);
  const vals = ms.map((m) => C.rawVal(S.draft[m.key])), nums = vals.filter((v) => v.t === "num").map((v) => v.v);
  const gc = sk.map((x) => nums.filter((v) => C.gredOf(v, S.tet, ting).g === x.g).length);
  const gagal = nums.filter((v) => C.isGagal(C.gredOf(v, S.tet, ting), S.tet, ting)).length;
  return { n: ms.length, diisi: vals.filter((v) => v.t !== "none").length, th: vals.filter((v) => v.t === "th").length, nums, sk, gc, avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null, lulus: nums.length ? Math.round(((nums.length - gagal) / nums.length) * 100) : null, max: nums.length ? Math.max(...nums) : null, min: nums.length ? Math.min(...nums) : null };
}
function gredCell(raw, ting) {
  const r = C.rawVal(raw); if (r.t === "th") return `<i class="mu-gp th">TH</i>`; if (r.t !== "num") return `<i class="mu-gp">—</i>`;
  const g = C.gredOf(r.v, S.tet, ting); return `<i class="mu-gp ${C.isGagal(g, S.tet, ting) ? "bad" : "ok"}">${E(g.g)}</i>`;
}
function badRaw(raw) { const s = String(raw || "").trim(); if (!s) return false; const r = C.rawVal(s); return r.t === "none" || (r.t === "num" && (r.v < 0 || r.v > 100)); }
function vIsi() {
  const o = isiOpts(), I = S.isi;
  if (!S.muridOk) return warnMurid();
  if (!o.kelas.length) return warnMurid() + `<div class="erp-card"><div class="erp-hint">Tiada kelas dijumpai dalam Data Murid.</div></div>`;
  const ph = `<option value="">— Sila pilih —</option>`;
  const top = `<div class="erp-card mu-bar">
    ${fld("UJIAN / PEPERIKSAAN", `<select class="erp-sel" data-act-change="isi-uj">${ph}${o.uj.map((x) => opt(x.id, x.nama + " " + x.tahun + (x.buka ? "" : " (ditutup)"), I.uj)).join("")}</select>`)}
    ${fld("KELAS", `<select class="erp-sel" data-act-change="isi-kelas">${ph}${o.kelas.map((k) => opt(k, k, I.kelas)).join("")}</select>`)}
    ${fld("MATA PELAJARAN", `<select class="erp-sel" data-act-change="isi-subj" ${I.kelas ? "" : "disabled"}>${ph}${o.subj.map((s) => opt(s.kod, s.kod + " — " + s.nama, I.subjek)).join("")}</select>`)}
  </div>`;
  const tg = S.jg.length ? `<div class="erp-card"><span class="erp-lbl">TUGASAN SAYA (JADUAL GURU) · KETUK UNTUK PILIH</span><div class="erp-chips">${S.jg.map((x) => { const r = (S.marks[I.uj || S.ujianId] || {})[up(x.kelas) + "|" + up(x.kod)], on = I.kelas === x.kelas && I.subjek === x.kod; return `<button class="erp-chip ${on ? "on" : ""}" data-act="isi-tugas" data-k="${A(x.kelas)}" data-s="${A(x.kod)}" type="button">${E(x.kelas)} · ${E(x.kod)}${r ? (r.status === "Dihantar" ? " ✓" : " …") : ""}</button>`; }).join("")}</div></div>` : "";
  if (!o.ready) return warnMurid() + tg + top + `<div class="erp-card mu-ph"><b>Sila pilih Ujian / Peperiksaan, Kelas dan Mata Pelajaran</b><span>Senarai murid akan dipaparkan selepas ketiga-tiganya dipilih.</span></div>`;
  if (needLoad(I.uj)) return warnMurid() + tg + top + loadingBox;
  draftInit();
  const anim = I.anim; I.anim = false;
  const u = ujianBy(I.uj), rec = (S.marks[I.uj] || {})[up(I.kelas) + "|" + up(I.subjek)], kunci = rec && rec.status === "Dihantar" && !S.adm;
  const ms = muridKelas(I.kelas), st = isiStat(o.ting), buka = !!(u && (u.buka || S.adm));
  const sub = subjBy(I.subjek, o.ting);
  const rows = ms.map((m, i) => `<div class="mu-tr isi" style="--i:${Math.min(i, 24)}"><span class="dim">${i + 1}</span><b>${E(m.nama)}</b><span class="dim">${E(m.kp)}</span>
      <span><input class="mu-mk ${badRaw(S.draft[m.key]) ? "lo" : ""}" data-mk="${A(m.key)}" value="${A(S.draft[m.key] || "")}" inputmode="decimal" autocomplete="off" ${kunci || !buka ? "readonly" : ""} aria-label="Markah ${A(m.nama)}"></span>
      <span id="g-${A(m.key)}">${gredCell(S.draft[m.key], o.ting)}</span></div>`).join("");
  const statusPill = rec ? `<span class="erp-pill ${rec.status === "Dihantar" ? "s-siap" : "s-draf"}">${E(rec.status)}</span>` : `<span class="erp-pill s-belum">Belum diisi</span>`;
  return `${warnMurid()}${tg}${top}
  <div class="mu-rv ${anim ? "mu-reveal" : ""}">
  <div class="erp-card mu-info"><span><span class="erp-lbl">BIL. MURID</span><b class="mu-big">${ms.length} orang</b></span><span><span class="erp-lbl">STATUS</span>${statusPill}</span><span class="mu-info-t"><b>${E(sub ? sub.nama : "")}</b> · ${E(I.kelas)} · ${E(u ? u.nama + " " + u.tahun : "")}</span></div>
  ${sub && sub.kira === false ? `<div class="mu-note">${E(sub.kod)} direkod sahaja — TIDAK dikira dalam GPI, jumlah markah dan kedudukan.</div>` : ""}
  ${sub && sub.wajib ? `<div class="mu-note">${E(sub.kod)} ialah mata pelajaran WAJIB LULUS — gred G menyebabkan keputusan akhir murid GAGAL.</div>` : ""}
  ${!buka ? `<div class="mu-warn">Ujian ini belum dibuka untuk pengisian markah.</div>` : ""}${kunci ? `<div class="mu-warn">Markah telah dihantar dan dikunci. Hanya Pentadbir boleh membukanya semula.</div>` : ""}
  <div class="mu-two">
    <div class="erp-card mu-tbl">
      <div class="mu-tr isi h"><span>BIL</span><span>NAMA MURID</span><span>NO. KP</span><span>MARKAH</span><span>GRED</span></div>
      ${rows || `<div class="erp-hint" style="padding:14px">Tiada murid dalam kelas ini.</div>`}
      <div class="erp-right mu-act">
        <button class="erp-btn" data-act="isi-paste" type="button" ${kunci || !buka ? "disabled" : ""}>Tampal daripada Excel</button>
        <button class="erp-btn" data-act="isi-draf" type="button" ${kunci || !buka ? "disabled" : ""}>Simpan draf</button>
        <button class="erp-btn solid" data-act="isi-hantar" type="button" ${kunci || !buka ? "disabled" : ""}>Hantar markah</button>
        ${S.adm && rec && rec.status === "Dihantar" ? `<button class="erp-btn warn" data-act="isi-buka" type="button">Buka semula</button>` : ""}
      </div>
      <div class="erp-hint" style="padding:6px 14px 0">Kosongkan markah bagi murid yang tidak mengambil subjek ini. Tulis TH bagi murid tidak hadir. Tekan Enter untuk ke murid seterusnya; tampal terus daripada Excel ke dalam kotak markah pertama.</div>
    </div>
    <div class="mu-side"><div id="isi-sum">${isiSum(st)}</div>
      <div class="erp-card mu-hint">Gred dikira automatik mengikut skala ${C.isAtas(o.ting, S.tet) ? "Menengah Atas / SPM" : "Menengah Rendah"} dalam Tetapan.</div></div>
  </div></div>`;
}
function isiSum(st) {
  const mx = Math.max(1, ...st.gc);
  return `<div class="erp-card"><h3>Ringkasan</h3><div class="erp-between"><span class="erp-lbl" style="margin:0">DIISI</span><b class="mu-big">${st.diisi} / ${st.n}</b></div>
    <div class="erp-bar" style="margin:6px 0 12px"><i style="width:${st.n ? Math.round((st.diisi / st.n) * 100) : 0}%"></i></div>
    <div class="mu-kv"><div><span>PURATA</span><b>${st.avg === null ? "–" : st.avg.toFixed(1)}</b></div><div><span>LULUS</span><b>${st.lulus === null ? "–" : st.lulus + "%"}</b></div><div><span>TERTINGGI</span><b>${st.max === null ? "–" : st.max}</b></div><div><span>TERENDAH</span><b>${st.min === null ? "–" : st.min}</b></div></div></div>
    <div class="erp-card"><h3>Taburan gred</h3>${st.sk.map((x, i) => `<div class="mu-bars"><b>${E(x.g)}</b><div class="erp-bar"><i style="width:${Math.round((st.gc[i] / mx) * 100)}%"></i></div><span>${st.gc[i]}</span></div>`).join("")}</div>`;
}
function isiLive(inp) {
  const key = inp.dataset.mk, o = C.tingOf(S.isi.kelas);
  S.draft[key] = inp.value; S.dirty = true; inp.classList.toggle("lo", badRaw(inp.value));
  const g = document.getElementById("g-" + key); if (g) g.innerHTML = gredCell(inp.value, o);
  const s = document.getElementById("isi-sum"); if (s) s.innerHTML = isiSum(isiStat(o));
}
async function isiSimpan(hantar) {
  const ms = muridKelas(S.isi.kelas), ting = C.tingOf(S.isi.kelas), bad = ms.filter((m) => badRaw(S.draft[m.key]));
  if (bad.length) { toast("Markah tidak sah (guna 0–100 atau TH): " + bad[0].nama, true); return; }
  const kosong = ms.filter((m) => !String(S.draft[m.key] || "").trim()).length;
  if (hantar) {
    const msg = (kosong ? kosong + " murid belum diisi (dianggap tidak mengambil subjek ini). " : "") + "Selepas dihantar, markah dikunci dan hanya Pentadbir boleh membukanya semula. Hantar sekarang?";
    if (!(await ask(msg))) return;
  }
  const marks = {}; ms.forEach((m) => { const v = String(S.draft[m.key] || "").trim(); if (v) marks[m.key] = v; });
  S.busy = true; toast(hantar ? "Menghantar markah…" : "Menyimpan draf…", false, true);
  try {
    const r = await post({ action: "saveMarkah", ujian: S.isi.uj, kelas: S.isi.kelas, subjek: S.isi.subjek, markah: marks, hantar: !!hantar });
    const rec = { status: r.status, marks: Object.assign({}, marks), oleh: S.user.nama, kemaskini: "" };
    (S.marks[S.isi.uj] = S.marks[S.isi.uj] || {})[up(S.isi.kelas) + "|" + up(S.isi.subjek)] = rec; S.dirty = false; bust();
    toast(hantar ? "Markah dihantar." : "Draf disimpan.");
  } catch (e) { toast(e.message || String(e), true); }
  S.busy = false; render();
}
function isiPaste(text, startKey) {
  const ms = muridKelas(S.isi.kelas), i0 = Math.max(0, ms.findIndex((m) => m.key === startKey));
  const lines = String(text || "").replace(/\r/g, "").split("\n"); if (lines.length && lines[lines.length - 1] === "") lines.pop();
  lines.forEach((ln, j) => { const m = ms[i0 + j]; if (!m) return; const cell = ln.split("\t").pop().trim(); S.draft[m.key] = cell; });
  S.dirty = true; S._keepScroll = true; render();
}

/* ================= Jadual keputusan (kelas / tingkatan) ================= */
function subjCols(ting) { return C.subjekTkt(S.tet, ting); }
function tblHtml(opts) {
  // opts: {ting, groups:[{nama, list}], tkt:boolean}
  const subj = subjCols(opts.ting), sk = C.skala(S.tet, opts.ting);
  const cols = ["34px", "210px", "118px"].concat(subj.map(() => "40px 36px"), sk.map(() => "30px"), ["50px", "84px", "46px"], opts.tkt ? ["46px"] : []).join(" ");
  const H = (t, extra) => `<span ${extra || ""}>${E(t)}</span>`;
  const head1 = `<div class="mu-g h" style="grid-template-columns:${cols}">${H("BIL")}${H("NAMA MURID")}${H("NO. KP")}${subj.map((s) => `<span class="sp2 ${s.kira === false ? "nk" : ""}" title="${A(s.nama)}">${E(s.kod)}${s.kira === false ? "*" : ""}</span>`).join("")}<span class="spk" style="grid-column:span ${sk.length}">KEP.</span>${H("GPI")}${H("KEPUTUSAN")}${H(opts.tkt ? "KDDK KLS" : "KDDK")}${opts.tkt ? H("KDDK TKT") : ""}</div>
    <div class="mu-g h2" style="grid-template-columns:${cols}"><span></span><span></span><span></span>${subj.map(() => "<span>M</span><span>G</span>").join("")}${sk.map((x) => `<span>${E(x.g)}</span>`).join("")}<span></span><span></span><span></span>${opts.tkt ? "<span></span>" : ""}</div>`;
  const body = opts.groups.map((g) => (opts.tkt ? `<div class="mu-band">${E(g.nama)} · ${g.list.length} murid</div>` : "") + g.list.map((x, i) => {
    const c = x.c, cells = c.rows.map((r) => r.st === "num" ? `<span class="${r.gagal ? "bad" : ""}">${r.m}</span><b class="${r.gagal ? "bad" : ""}">${E(r.g)}</b>` : `<span class="dim">${r.st === "th" ? "TH" : "–"}</span><span></span>`).join("");
    return `<div class="mu-g" style="grid-template-columns:${cols}"><span class="dim">${i + 1}</span><span class="l"><b>${E(x.m.nama)}</b></span><span class="dim">${E(x.m.kp ? x.m.kp.replace(/(\d{4})\d{4}(\d{4})/, "$1••••$2") : "")}</span>${cells}${c.gc.map((n) => `<span class="${n ? "" : "dim"}">${n}</span>`).join("")}<span><b>${f2(c.gpi)}</b></span><span class="${c.lulus === null ? "dim" : c.lulus ? "ok" : "bad"}" ${c.gagalWajib.length ? `title="Gagal mata pelajaran wajib: ${A(c.gagalWajib.join(", "))}"` : ""}><b>${c.lulus === null ? "–" : c.lulus ? "LULUS" : "GAGAL"}</b>${c.gagalWajib.length ? "†" : ""}</span><span>${x.rk || "–"}</span>${opts.tkt ? `<span>${x.rt || "–"}</span>` : ""}</div>`;
  }).join("")).join("");
  return `<div class="mu-wide"><div class="mu-grid" style="min-width:${34 + 210 + 118 + subj.length * 76 + sk.length * 30 + 180 + (opts.tkt ? 46 : 0)}px">${head1}${body}</div></div>`;
}
function kadHtml(list) {
  const n = list.length, lul = list.filter((x) => x.c.lulus === true).length, gp = list.filter((x) => x.c.gpi !== null);
  const avg = gp.length ? gp.reduce((a, x) => a + x.c.gpi, 0) / gp.length : null;
  return `<div class="mu-kad">${[["JUM. MURID", n, ""], ["LULUS", lul, "ok"], ["GAGAL", list.filter((x) => x.c.lulus === false).length, "bad"], ["PURATA GPI", f2(avg), ""]].map((k) => `<div class="erp-card"><span class="erp-lbl">${k[0]}</span><b class="mu-num ${k[2]}">${k[1]}</b></div>`).join("")}</div>`;
}
function statusStrip(uid, kelas, ting) {
  const marks = S.marks[uid] || {};
  return `<div class="mu-strip">${subjCols(ting).map((s) => { const r = marks[up(kelas) + "|" + up(s.kod)]; return `<span class="erp-pill ${r ? (r.status === "Dihantar" ? "s-siap" : "s-draf") : "s-belum"}" title="${A(s.nama)}">${E(s.kod)} ${r ? (r.status === "Dihantar" ? "✓" : "draf") : "belum"}</span>`; }).join("")}</div>`;
}
function ujianSel(act, ting) {
  const uj = ujianUntukTkt(ting); if (uj.length && !uj.some((u) => u.id === S.ujianId)) S.ujianId = (uj.find((u) => u.buka) || uj[0]).id; if (!uj.length) S.ujianId = "";
  return fld("UJIAN / PEPERIKSAAN", `<select class="erp-sel" data-act-change="${act}">${uj.length ? uj.map((u) => opt(u.id, u.nama + " " + u.tahun, S.ujianId)).join("") : `<option value="">Tiada ujian</option>`}</select>`);
}
function needLoad(uid) { if (uid && !S.loaded[uid]) { loadMarks(uid).then(() => { S._keepScroll = true; render(); }); return true; } return false; }
const loadingBox = `<div class="erp-card"><div class="erp-hint">Memuatkan markah…</div></div>`;

function vKelas() {
  if (!S.muridOk) return warnMurid();
  const ks = kelasBoleh(); if (!ks.length) return `<div class="erp-card"><div class="erp-hint">Tiada kelas dalam Data Murid.</div></div>`;
  if (ks.indexOf(S.kelas) === -1) S.kelas = ks[0];
  const ting = C.tingOf(S.kelas), top = `<div class="erp-card mu-bar">${ujianSel("kls-uj", ting)}${fld("KELAS", `<select class="erp-sel" data-act-change="kls-kelas">${ks.map((k) => opt(k, k, S.kelas)).join("")}</select>`)}
    <div class="erp-f mu-fld"><span class="erp-lbl">GURU KELAS</span><b>${E(guruKelasOf(S.kelas) || "–")}</b></div>
    <div class="erp-right mu-bt"><button class="erp-btn" data-act="kls-cetak" type="button">Cetak / PDF</button><button class="erp-btn" data-act="kls-csv" type="button">Muat turun Excel</button></div></div>`;
  if (!S.ujianId) return warnMurid() + top;
  if (needLoad(S.ujianId)) return warnMurid() + top + loadingBox;
  const k = kiraKelas(S.ujianId, S.kelas);
  return `${warnMurid()}${top}${kadHtml(k.list)}${statusStrip(S.ujianId, S.kelas, ting)}<div class="erp-card mu-tbl">${tblHtml({ ting, groups: [{ nama: S.kelas, list: k.list }] })}
    <div class="erp-hint" style="padding:8px 14px">M = markah, G = gred. Gred G (gagal) ditanda merah. KEP. = bilangan gred murid. KDDK = kedudukan dalam kelas ikut GPI (terendah = terbaik). † = GAGAL kerana gagal mata pelajaran wajib. * = subjek direkod sahaja, tidak dikira dalam GPI, jumlah dan kedudukan.</div></div>`;
}
function tktList() { return [...new Set(allKelas().map((k) => C.tingOf(k)))].filter(Boolean).sort(); }
function vTkt() {
  if (!S.muridOk) return warnMurid();
  const ts = tktList(); if (!ts.length) return warnMurid();
  if (ts.indexOf(S.tkt) === -1) S.tkt = ts[ts.length - 1];
  const kls = allKelas().filter((k) => C.tingOf(k) === S.tkt); if (kls.indexOf(S.tktKelas) === -1) S.tktKelas = kls[0] || "";
  const top = `<div class="erp-card mu-bar">${ujianSel("tkt-uj", S.tkt)}${fld("TINGKATAN", `<select class="erp-sel" data-act-change="tkt-tkt">${ts.map((t) => opt(t, "Tingkatan " + t, S.tkt)).join("")}</select>`)}
    <div class="erp-right mu-bt"><button class="erp-btn" data-act="tkt-cetak" type="button">Cetak / PDF (semua kelas)</button><button class="erp-btn" data-act="tkt-csv" type="button">Muat turun Excel</button></div></div>`;
  if (!S.ujianId) return top; if (needLoad(S.ujianId)) return top + loadingBox;
  const t = kiraTkt(S.ujianId, S.tkt), gi = t.kelas.indexOf(S.tktKelas), g = t.groups[gi];
  const chips = `<div class="erp-card mu-bar"><span class="erp-lbl" style="margin:0">KELAS</span><div class="erp-chips">${t.kelas.map((k) => `<button class="erp-chip ${k === S.tktKelas ? "on" : ""}" data-act="tkt-kelas" data-k="${A(k)}" type="button">${E(k)}</button>`).join("")}</div></div>`;
  return `${warnMurid()}${top}${kadHtml(t.all)}${chips}<div class="erp-card mu-tbl">${g ? tblHtml({ ting: S.tkt, tkt: true, groups: [{ nama: t.kelas[gi], list: g.list }] }) : ""}
    <div class="erp-hint" style="padding:8px 14px">Kad di atas = seluruh tingkatan. Jadual dipaparkan satu kelas pada satu masa (guna Cetak / Excel untuk semua kelas). KDDK KLS = kedudukan dalam kelas; KDDK TKT = kedudukan dalam tingkatan (GPI terendah = terbaik, jumlah markah sebagai penentu).</div></div>`;
}

/* ================= Analisis Mata Pelajaran ================= */
const BAND = ["#BBE5A3", "#BBE5A3", "#BBE5A3", "#BCD0F5", "#BCD0F5", "#BCD0F5", "#BCD0F5", "#FBDFA4", "#FBDFA4", "#F2B1B1"];
function analisisData() {
  const t = kiraTkt(S.ujianId, S.tkt), pool = S.scope === "ALL" ? t.all : t.all.filter((x) => x.m.kelas === S.scope);
  const subj = subjCols(S.tkt).filter((s) => s.analisis !== false), sk = C.skala(S.tet, S.tkt);
  const an = subj.map((s) => C.analisisSubjek(s.kod, pool.map((x) => x.c), S.tet, S.tkt));
  const kiraAn = an.filter((a, i) => subj[i].kira !== false && a.gpmp !== null);
  const gps = kiraAn.length ? kiraAn.reduce((a, x) => a + x.gpmp, 0) / kiraAn.length : null;
  return { t, pool, subj, sk, an, gps };
}
function analisisTbl(d) {
  const n = d.subj.length, gc = `34px 150px repeat(${n},minmax(70px,1fr))`, pc = (a, b) => (b ? (a / b * 100).toFixed(2) + "%" : "(-)");
  const row = (bg, cells) => `<div class="mu-ga" style="grid-template-columns:${gc};background:${bg}">${cells}</div>`;
  let h = row("#2563EB", `<span class="wh">BIL</span><span class="wh">MATA PELAJARAN</span>${d.subj.map((s) => `<span class="wh" title="${A(s.nama)}">${E(s.kod)}${s.kira === false ? "*" : ""}</span>`).join("")}`);
  h += row("#FDE68A", `<span></span><span class="sm">BIL. HADIR</span>${d.an.map((a) => `<b>${a.hadir}</b>`).join("")}`);
  h += row("#FDE68A", `<span></span><span class="sm">BIL. TIDAK HADIR</span>${d.an.map((a) => `<b>${a.th}</b>`).join("")}`);
  d.sk.forEach((x, k) => { h += row(BAND[Math.min(BAND.length - 1, Math.round((k / Math.max(1, d.sk.length - 1)) * (BAND.length - 1)))], `<b>${k + 1}</b><b>${E(x.g)}</b>${d.an.map((a) => `<span class="${a.gc[k] ? "bd" : ""}">${a.gc[k]}</span>`).join("")}`); });
  h += row("#fff", `<b class="sp2c">LULUS</b>${d.an.map((a) => `<span class="pc">${a.hadir ? a.ya + "<br>(" + pc(a.ya, a.hadir) + ")" : "0<br>(-)"}</span>`).join("")}`.replace('<b class="sp2c">', '<b class="sp2c" style="grid-column:span 2">'));
  h += row("#fff", `<b class="sp2c" style="grid-column:span 2">GAGAL</b>${d.an.map((a) => `<span class="pc">${a.hadir ? a.tidak + "<br>(" + pc(a.tidak, a.hadir) + ")" : "0<br>(-)"}</span>`).join("")}`);
  h += row("#E0E7FF", `<b class="sp2c" style="grid-column:span 2">GPMP</b>${d.an.map((a) => `<b>${f2(a.gpmp)}</b>`).join("")}`);
  return `<div class="mu-wide"><div class="mu-agrid" style="min-width:${184 + n * 74}px">${h}</div></div>`;
}
function vAnalisis() {
  if (!S.muridOk) return warnMurid();
  const ts = tktList(); if (!ts.length) return warnMurid(); if (ts.indexOf(S.tkt) === -1) S.tkt = ts[ts.length - 1];
  const kls = allKelas().filter((k) => C.tingOf(k) === S.tkt); if (S.scope !== "ALL" && kls.indexOf(S.scope) === -1) S.scope = "ALL";
  const top = `<div class="erp-card mu-bar">${ujianSel("an-uj", S.tkt)}${fld("TINGKATAN", `<select class="erp-sel" data-act-change="an-tkt">${ts.map((t) => opt(t, "Tingkatan " + t, S.tkt)).join("")}</select>`)}
    <div class="erp-f mu-fld"><span class="erp-lbl">PAPARAN</span><div class="erp-chips"><button class="erp-chip ${S.scope === "ALL" ? "on" : ""}" data-act="an-scope" data-s="ALL" type="button">Keseluruhan Tingkatan ${S.tkt}</button>${kls.map((k) => `<button class="erp-chip ${S.scope === k ? "on" : ""}" data-act="an-scope" data-s="${A(k)}" type="button">${E(k)}</button>`).join("")}</div></div>
    <div class="erp-right mu-bt"><button class="erp-btn" data-act="an-cetak" type="button">Cetak / PDF</button><button class="erp-btn" data-act="an-csv" type="button">Muat turun Excel</button></div></div>`;
  if (!S.ujianId) return top; if (needLoad(S.ujianId)) return top + loadingBox;
  const d = analisisData(), u = ujianBy(S.ujianId);
  const totH = d.an.reduce((a, x) => a + x.hadir, 0), totY = d.an.reduce((a, x) => a + x.ya, 0), wk = d.an.filter((a, i) => a.hadir && d.subj[i].kira !== false).sort((a, b) => a.ya / a.hadir - b.ya / b.hadir)[0];
  const kad = [["BIL. MURID", d.pool.length, ""], ["GPS", f2(d.gps), ""], ["PURATA LULUS", totH ? (totY / totH * 100).toFixed(1) + "%" : "–", "ok"], ["SUBJEK PALING LEMAH", wk ? d.subj[d.an.indexOf(wk)].kod : "–", "bad"]];
  return `${warnMurid()}${top}<div class="mu-kad">${kad.map((k) => `<div class="erp-card"><span class="erp-lbl">${k[0]}</span><b class="mu-num ${k[2]}">${k[1]}</b></div>`).join("")}</div>
    <div class="erp-card"><div class="mu-at">ANALISIS MENGIKUT MATA PELAJARAN</div><div class="mu-as">${S.scope === "ALL" ? "TINGKATAN " + S.tkt : E(S.scope)} · ${E(u ? u.nama + " " + u.tahun : "")}</div>${analisisTbl(d)}
    <div class="mu-gps"><span>GPS</span><b>${f2(d.gps)}</b></div>
    <div class="erp-hint">Lulus = semua gred kecuali gred gagal (G); Gagal = gred gagal. Peratus dikira daripada murid hadir bagi subjek itu. GPMP = purata nilai gred subjek. GPS = purata GPMP mata pelajaran yang dikira; subjek bertanda * (cth PJK, PSV) dipaparkan untuk analisis sahaja dan tidak dimasukkan dalam GPS.</div></div>`;
}

/* ================= Slip Keputusan ================= */
function slipHtml(x, kls, u, ulasan, ting, last) {
  const c = x.c, sk = C.skala(S.tet, ting), subjAll = subjCols(ting);
  const baris = c.rows.map((r, j) => {
    const sj = subjAll[j], nm = sj.nama || sj.kod;
    const m = r.st === "num" ? r.m : r.st === "th" ? "TH" : "+", g = r.st === "num" ? r.g : "-", red = r.st === "num" && r.gagal;
    return `<div class="sr"><span>${j + 1}</span><span>${E(nm)}</span><b style="${red ? "color:#b91c1c" : ""}">${m}</b><b style="${red ? "color:#b91c1c" : ""}">${E(g)}</b></div>`;
  }).join("");
  const gredAll = sk.map((q, i) => c.gc[i] + " [" + q.g + "]").join(", ");
  
  return `<div class="slip" ${last ? "" : 'style="page-break-after:always"'}>
    <div class="sh"><img src="${A(typeof SCHOOL_LOGO_URL !== "undefined" ? SCHOOL_LOGO_URL : "")}" alt="" onerror="this.style.visibility='hidden'"><div class="st"><div class="sn">${E(MU_SCHOOL)}</div><div class="sa">${E(MU_ALAMAT)}</div></div><div class="sp"></div></div>
    <div class="sj"><span>SLIP KEPUTUSAN</span><span>${E(up(u.nama))}</span><span>${E(u.tahun)}</span></div>
    <div class="sd"><span>Nama</span><span>:</span><b>${E(x.m.nama)}</b><span>Tingkatan</span><span>:</span><b>${E(x.m.kelas)}</b><span>No. KP</span><span>:</span><b>${E(x.m.kp)}</b><span>Pencapaian</span><span>:</span><b style="${c.lulus === false ? "color:#b91c1c" : ""}">${c.lulus === null ? "–" : c.lulus ? "LULUS" : "GAGAL"}</b></div>
    <div class="sb"><div class="sr h"><span>Bil</span><span>Mata Pelajaran</span><span>Markah</span><span>Gred</span></div>${baris}</div>
    ${c.gagalWajib.length ? `<div class="sf" style="color:#b91c1c;font-weight:700">Gagal mata pelajaran wajib: ${E(c.gagalWajib.join(", "))}</div>` : ""}
    <div class="ss"><div><span>Bilangan Mata Pelajaran Daftar</span><span>:</span><b>${c.n}</b></div>
      <div><span>Jumlah Markah</span><span>:</span><b>${c.n ? c.jum : "–"}</b><span>Peratus (%)</span><span>:</span><b>${f2(c.pct)}</b><span>Gred Purata Pelajar</span><span>:</span><b>${f2(c.gpi)}</b></div></div>
    <div class="sg"><span>Pencapaian Gred Keseluruhan</span><span>:</span><b>${E(gredAll)}</b></div>
    <div class="sl"></div>
    <div class="su"><span>Ulasan Guru Kelas :</span><span class="ul">${E(ulasan || "")}</span></div>
    <div class="sx"><span>Tandatangan Guru Kelas:</span><span>Tandatangan Pengetua:</span><span>Tandatangan Penjaga:</span></div></div>`;
}
const SLIP_CSS = '.slip{width:794px;height:1123px;box-sizing:border-box;background:#fff;color:#000;font-family:"Times New Roman",Times,serif;font-size:12px;padding:44px 52px;display:flex;flex-direction:column;overflow:hidden}.slip *{box-sizing:border-box}.slip .sh{display:flex;align-items:center;gap:18px;padding-bottom:10px;border-bottom:2px solid #000}.slip .sh img{width:78px;height:78px;object-fit:contain;flex:none}.slip .sp{width:78px;flex:none}.slip .st{flex:1;text-align:center}.slip .sn{font-weight:700;font-size:20px;letter-spacing:.02em}.slip .sa{font-size:12px;margin-top:3px}.slip .sj{display:flex;justify-content:space-between;font-weight:700;font-size:13px;padding:14px 60px 0;text-align:center}.slip .sd{display:grid;grid-template-columns:70px 12px 1fr 90px 12px 150px;row-gap:12px;margin-top:30px;font-size:12px}.slip .sd b{font-size:13px}.slip .sb{margin-top:20px;border-top:1px solid #000;border-bottom:1px solid #000;padding:6px 0 12px}.slip .sr{display:grid;grid-template-columns:44px 1fr 90px 70px;padding:3px 0;font-size:11.5px}.slip .sr>span:first-child{padding-left:12px}.slip .sr>b,.slip .sr>span:nth-child(n+3){text-align:center}.slip .sr.h{font-weight:700;font-size:12px;border-bottom:1px solid #000;margin-bottom:10px;padding-bottom:6px}.slip .sf{font-size:10px;margin-top:4px}.slip .ss{display:grid;grid-template-columns:1.25fr 1fr;column-gap:30px;margin-top:20px;font-size:11.5px}.slip .ss>div{display:grid;grid-template-columns:auto 10px 1fr;column-gap:6px;row-gap:14px;align-content:start}.slip .ss>div:first-child{grid-template-columns:200px 10px 1fr}.slip .ss>div:last-child{grid-template-columns:120px 10px 1fr}.slip .sg{display:grid;grid-template-columns:200px 10px 1fr;margin-top:14px;font-size:11.5px}.slip .sl{margin-top:20px;border-top:1px solid #000}.slip .su{margin-top:22px;font-size:11.5px;display:flex;gap:8px;align-items:baseline}.slip .ul{font-family:"Caveat","Segoe Script",cursive;font-size:17px;font-style:italic}.slip .sx{margin-top:auto;display:flex;justify-content:space-between;font-size:11.5px;padding-top:50px}';
function slipCtx() {
  const ks = slipKelas(); if (ks.indexOf(S.kelas) === -1) S.kelas = ks[0];
  const ting = C.tingOf(S.kelas); kiraTkt(S.ujianId, ting);
  const kls = kiraKelas(S.ujianId, S.kelas);
  const ul = Object.assign({}, (S.ulasan[S.ujianId] || {})[up(S.kelas)] || {}, S.slip.ulasan);
  return { ks, ting, kls, ul, u: ujianBy(S.ujianId) };
}
function vSlip() {
  if (!S.muridOk) return warnMurid();
  const ks = slipKelas(); if (!ks.length) return `<div class="erp-card"><div class="erp-hint">Slip keputusan hanya untuk guru kelas, Pentadbir dan Admin App.</div></div>`;
  if (ks.indexOf(S.kelas) === -1) S.kelas = ks[0];
  const ting = C.tingOf(S.kelas), bundle = S.slip.mode === "bundle";
  const top = `<div class="erp-card mu-bar">${ujianSel("slp-uj", ting)}${fld("KELAS", `<select class="erp-sel" data-act-change="slp-kelas">${ks.map((k) => opt(k, k, S.kelas)).join("")}</select>`)}
    <div class="erp-f mu-fld"><span class="erp-lbl">MOD CETAK</span><div class="erp-chips"><button class="erp-chip ${bundle ? "" : "on"}" data-act="slp-mode" data-m="satu" type="button">Satu-satu</button><button class="erp-chip ${bundle ? "on" : ""}" data-act="slp-mode" data-m="bundle" type="button">Bundle 1 kelas</button></div></div></div>`;
  if (!S.ujianId) return top; if (needLoad(S.ujianId)) return top + loadingBox;
  const cx = slipCtx(), n = cx.kls.list.length; if (S.slip.sel >= n) S.slip.sel = 0;
  const sel = cx.kls.list[S.slip.sel];
  const list = cx.kls.list.map((x, i) => `<button class="mu-mr ${i === S.slip.sel ? "on" : ""}" data-act="slp-pick" data-i="${i}" type="button"><span class="dim">${i + 1}</span><span class="nm"><b>${E(x.m.nama)}</b><small>GPI ${f2(x.c.gpi)}</small></span><i class="erp-pill ${x.c.lulus === null ? "s-belum" : x.c.lulus ? "s-siap" : "s-pulang"}">${x.c.lulus === null ? "–" : x.c.lulus ? "LULUS" : "GAGAL"}</i>${bundle ? `<span class="tk">✓</span>` : ""}</button>`).join("");
  return `${warnMurid()}${top}
  <div class="erp-card mu-bar"><div class="erp-hint" style="flex:1">${bundle ? `Mod bundle: ${n} slip dicetak sekali gus, satu murid satu helaian A4 mengikut bil.` : "Mod satu-satu: pilih seorang murid, kemudian tekan Cetak slip ini."}</div>
    <div class="erp-right mu-bt"><button class="erp-btn solid orange" data-act="slp-cetak" type="button">${bundle ? `Cetak ${n} slip (1 kelas)` : "Cetak slip ini"}</button><button class="erp-btn" data-act="slp-pdf" type="button">Simpan PDF</button></div></div>
  <div class="mu-two slp">
    <div class="erp-card mu-list"><h3>Senarai murid <small>${n} murid</small></h3>${list || `<div class="erp-hint">Tiada murid.</div>`}
      ${sel ? `<div class="mu-ul"><label class="erp-lbl" for="slp-ul">ULASAN GURU KELAS — ${E(sel.m.nama)}</label><textarea id="slp-ul" class="erp-ta" data-ul="${A(sel.m.key)}" maxlength="160" placeholder="Tulis ulasan (muncul pada slip dalam tulisan tangan)">${E(cx.ul[sel.m.key] || "")}</textarea>
      <div class="erp-right" style="margin-top:6px"><button class="erp-btn sm" data-act="slp-ulasan" type="button">Simpan ulasan kelas</button></div></div>` : ""}</div>
    <div class="mu-prev"><div class="erp-lbl">PRATONTON · A4 · ${bundle ? n + " helaian (pratonton murid " + (S.slip.sel + 1) + ")" : "Murid " + (S.slip.sel + 1)}</div>
      <div class="mu-sheet ${bundle ? "stack" : ""}"><div class="mu-sheet-in"><style>${SLIP_CSS}</style>${sel ? slipHtml(sel, cx.kls, cx.u, cx.ul[sel.m.key], cx.ting, true) : ""}</div></div></div>
  </div>`;
}

/* ================= Cetak / Eksport ================= */
const PR_CSS = '@page{size:A4 landscape;margin:8mm}body{margin:0;padding:6px;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#000}h2{margin:0 0 2px;font-size:15px;text-align:center}h3{margin:0 0 8px;font-size:12px;text-align:center;font-weight:600}table{border-collapse:collapse;width:100%;font-size:8.5px}th,td{border:1px solid #444;padding:2px 3px;text-align:center}td.l{text-align:left;white-space:nowrap}th{background:#e8eefc;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr.band td{background:#dfe7f7;font-weight:700;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}.bad{color:#b91c1c;font-weight:700}.note{font-size:8px;margin-top:6px}';
function cetakDoc(body, css, title) {
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (!inFrame) {
    document.getElementById("erp-print-area").innerHTML = `<style>${css}</style>` + body; document.body.classList.add("erp-printing");
    const done = () => { document.body.classList.remove("erp-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done); setTimeout(() => { window.print(); setTimeout(done, 1500); }, 80); return;
  }
  const doc = '<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + E(title) + '</title><link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap" rel="stylesheet"><style>' + css + '</style></head><body>' + body +
    '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},700)})<\/script></body></html>';
  const url = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" }));
  const w = window.open(url, "_blank");
  if (w) { toast("Tab cetak dibuka. Pilih 'Simpan sebagai PDF' atau pencetak."); setTimeout(() => URL.revokeObjectURL(url), 60000); return; }
  const a = document.createElement("a"); a.href = url; a.download = title.replace(/[^\w-]+/g, "_") + ".html"; document.body.appendChild(a); a.click(); a.remove();
  toast("Tab baharu disekat. Fail dimuat turun: buka fail itu, kemudian Ctrl+P untuk cetak / simpan PDF."); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function csvDown(name, rows) {
  const csv = "﻿" + rows.map((r) => r.map((v) => { const s = String(v == null ? "" : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = name + ".csv"; document.body.appendChild(a); a.click(); a.remove();
}
function keputusanRows(ting, groups, tkt) {
  const subj = subjCols(ting), sk = C.skala(S.tet, ting);
  const h = ["Bil", "Nama", "No. KP"].concat(...subj.map((s) => [s.kod + (s.kira === false ? "*" : "") + " M", s.kod + " G"]), sk.map((x) => x.g), ["GPI", "Keputusan", tkt ? "KDDK Kelas" : "KDDK"], tkt ? ["KDDK Tkt"] : []);
  const rows = [h];
  groups.forEach((g) => g.list.forEach((x, i) => rows.push([i + 1, x.m.nama, x.m.kp].concat(...x.c.rows.map((r) => (r.st === "num" ? [r.m, r.g] : [r.st === "th" ? "TH" : "", ""])), x.c.gc, [x.c.gpi === null ? "" : x.c.gpi.toFixed(2), x.c.lulus === null ? "" : x.c.lulus ? "LULUS" : "GAGAL", x.rk || ""], tkt ? [x.rt || ""] : []))));
  return { h, rows, subj, sk };
}
function keputusanPrint(ting, groups, tkt, judul) {
  const { rows, subj, sk } = keputusanRows(ting, groups, tkt), u = ujianBy(S.ujianId);
  const hd1 = `<tr><th rowspan="2">BIL</th><th rowspan="2">NAMA MURID</th><th rowspan="2">NO. KP</th>${subj.map((s) => `<th colspan="2">${E(s.kod)}${s.kira === false ? "*" : ""}</th>`).join("")}<th colspan="${sk.length}">KEP.</th><th rowspan="2">GPI</th><th rowspan="2">KEPUTUSAN</th><th rowspan="2">${tkt ? "KDDK KLS" : "KDDK"}</th>${tkt ? '<th rowspan="2">KDDK TKT</th>' : ""}</tr><tr>${subj.map(() => "<th>M</th><th>G</th>").join("")}${sk.map((x) => `<th>${E(x.g)}</th>`).join("")}</tr>`;
  let body = "", idx = 1; const span = rows[0].length;
  groups.forEach((g) => { if (tkt) body += `<tr class="band"><td colspan="${span}">${E(g.nama)} · ${g.list.length} murid</td></tr>`; g.list.forEach((x, i) => { const r = rows[idx++]; body += "<tr>" + r.map((v, j) => `<td class="${j === 1 ? "l" : ""}">${E(v)}</td>`).join("") + "</tr>"; }); });
  return `<h2>${E(MU_SCHOOL)}</h2><h3>${E(judul)} — ${E(u ? u.nama + " " + u.tahun : "")}</h3><table><thead>${hd1}</thead><tbody>${body}</tbody></table><div class="note">M = markah, G = gred. * = direkod sahaja, tidak dikira dalam GPI, jumlah dan kedudukan.</div>`;
}

/* ================= Tetapan ================= */
function tdInit() { if (!S.td) { S.td = C.clone(S.tet); S.tdDirty = false; } }
const sw = (act, i, on, extra) => `<input type="checkbox" class="mu-sw" data-tc="${act}" data-i="${i}" ${on ? "checked" : ""} ${extra || ""}>`;
const tktAtasN = () => Math.min(5, Math.max(2, Math.round(parseFloat(S.td && S.td.peraturan.tktAtas) || 4)));
const lvTkts = (l) => (l === "atas" ? [1, 2, 3, 4, 5].filter((t) => t >= tktAtasN()) : [1, 2, 3, 4, 5].filter((t) => t < tktAtasN()));
const chk5 = (arr, act, i, list) => (list || [1, 2, 3, 4, 5]).map((t) => `<label class="mu-t5"><input type="checkbox" data-tc="${act}" data-i="${i}" data-t="${t}" ${(arr || []).indexOf(t) !== -1 ? "checked" : ""}>${t}</label>`).join("");
function detectList() {
  if (typeof jgRecords === "undefined") return [];
  const seen = new Map();
  jgRecords.forEach((r) => { const t = String(r.subjek || "").trim(); if (!t || C.cariSubjek(t, S.td.subjek)) return; const k = C.nk(t); if (!seen.has(k)) seen.set(k, t); });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "ms")).map((t) => ({ t, nama: C.namaPenuh(t) || (t.length > 8 ? up(t) : "") }));
}
function secHtml(k, title, info, inner) {
  const on = !!S.tetOpen[k];
  return `<section class="mu-sec ${on ? "open" : ""}"><button type="button" class="mu-sec-h" data-act="td-sec" data-k="${k}" aria-expanded="${on}"><span class="mu-chev" aria-hidden="true">▸</span><h3>${title}</h3><span class="mu-sec-i">${info}</span></button><div class="mu-sec-b"><div class="mu-sec-in">${inner}</div></div></section>`;
}
function sjRows(l) {
  const T = S.td, tk = lvTkts(l);
  return T.subjek.map((s, i) => [s, i]).filter((x) => x[0].lvl === l).map(([s, i]) => `<div class="mu-trw sj"><input class="erp-in kod" data-tf="sj.kod" data-i="${i}" value="${A(s.kod)}" aria-label="Kod"><input class="erp-in" data-tf="sj.nama" data-i="${i}" value="${A(s.nama)}" aria-label="Nama penuh"><input class="erp-in" data-tf="sj.alias" data-i="${i}" value="${A(s.alias)}" placeholder="singkatan lain (BM, B.M)" aria-label="Singkatan lain"><select class="erp-sel" data-tf="sj.kat" data-i="${i}">${["Teras", "Elektif", "Agama"].map((k) => opt(k, k, s.kat)).join("")}</select><span class="t5">${chk5(s.tkt, "sj.tkt", i, tk)}</span><span>${sw("sj.aktif", i, s.aktif !== false)}</span><span>${sw("sj.kira", i, s.kira !== false)}</span><span>${sw("sj.analisis", i, s.analisis !== false)}</span><span>${sw("sj.wajib", i, !!s.wajib)}</span><span class="mv"><button class="erp-btn sm" data-act="td-up" data-i="${i}" type="button" aria-label="Naik">↑</button><button class="erp-btn sm" data-act="td-dn" data-i="${i}" type="button" aria-label="Turun">↓</button><button class="erp-btn sm warn" data-act="td-del" data-k="sj" data-i="${i}" type="button">Padam</button></span></div>`).join("");
}
function sjBlock(l, nama) {
  const n = S.td.subjek.filter((s) => s.lvl === l).length;
  return `<div class="mu-lv"><div class="erp-between"><h4>${nama} <small>(Tingkatan ${lvTkts(l).join(", ")})</small></h4><button class="erp-btn sm solid" data-act="td-add" data-k="sj" data-l="${l}" type="button">+ Tambah mata pelajaran</button></div>
    <div class="mu-trw sj h"><span>KOD</span><span>NAMA PENUH (SLIP)</span><span>SINGKATAN LAIN</span><span>KATEGORI</span><span>TINGKATAN</span><span>AKTIF</span><span>KIRA GPI</span><span>ANALISIS</span><span>WAJIB LULUS</span><span></span></div>${n ? sjRows(l) : `<div class="erp-hint">Tiada mata pelajaran.</div>`}</div>`;
}
function vTetapan() {
  tdInit(); const T = S.td, det = detectList(), adminApp = isAdminApp(S.user);
  const uj = T.ujian.map((u, i) => `<div class="mu-trw uj"><input class="erp-in" data-tf="uj.nama" data-i="${i}" value="${A(u.nama)}" aria-label="Nama ujian"><input class="erp-in" data-tf="uj.tahun" data-i="${i}" value="${A(u.tahun)}" inputmode="numeric" aria-label="Tahun"><span class="t5">${chk5(u.tkt, "uj.tkt", i)}</span><input class="erp-in" type="date" data-tf="uj.mula" data-i="${i}" value="${A(u.mula)}" aria-label="Mula"><input class="erp-in" type="date" data-tf="uj.akhir" data-i="${i}" value="${A(u.akhir)}" aria-label="Akhir"><span>${sw("uj.buka", i, u.buka)}</span><button class="erp-btn sm warn" data-act="td-del" data-k="uj" data-i="${i}" type="button">Padam</button></div>`).join("");
  const gr = (k, nm) => `<div class="mu-gt"><b>${nm}</b>${T.gred[k].map((g, i) => `<div class="mu-trw gr"><b>${E(g.g)}</b><input class="erp-in" data-tf="gr.${k}.dari" data-i="${i}" value="${A(g.dari)}" inputmode="numeric" aria-label="Markah dari ${A(g.g)}"><input class="erp-in" data-tf="gr.${k}.mata" data-i="${i}" value="${A(g.mata)}" inputmode="decimal" aria-label="Nilai ${A(g.g)}"></div>`).join("")}</div>`;
  const kelasList = allKelas(), stf = S.staff.slice();
  const kls = kelasList.map((k) => {
    const cur = (T.guruKelas && T.guruKelas[k]) || "", auto = guruAuto(k), opts = stf.slice(); if (cur && opts.indexOf(cur) === -1) opts.push(cur);
    const pilih = adminApp ? `<select class="erp-sel" data-tf="gk" data-k="${A(k)}"><option value="">(Auto) ${E(auto || "–")}</option>${opts.map((o) => opt(o, o, cur)).join("")}</select>` : `<span>${E(cur || auto || "–")}${cur ? ' <small class="dim">(ditetapkan)</small>' : ""}</span>`;
    return `<div class="mu-trw kl"><b>${E(k)}</b><span class="dim">${E(auto || "–")}</span>${pilih}<b>${muridKelas(k).length}</b></div>`;
  }).join("");
  const akL = (T.akses && T.akses.keputusan) || [], akOpts = stf.slice(); akL.forEach((n) => { if (akOpts.indexOf(n) === -1) akOpts.push(n); });
  const akHtml = akOpts.map((n) => `<label class="mu-ak"><input type="checkbox" data-tc="ak" data-n="${A(n)}" ${akL.indexOf(n) !== -1 ? "checked" : ""}><span>${E(n)}</span></label>`).join("");
  const P = T.peraturan, nUj = T.ujian.length, nSj = T.subjek.length;
  return `<div class="erp-card"><h3>Tetapan</h3><div class="erp-hint">Pentadbir dan Admin App sahaja. Klik tajuk untuk membuka / menyembunyikan setiap bahagian. Perubahan terpakai selepas <b>Simpan tetapan</b>.${S.tetOk ? "" : " (Belum ada tetapan tersimpan — memaparkan lalai.)"}</div></div>
  ${secHtml("uj", "Ujian / Peperiksaan", nUj + " ujian", `<div class="erp-right" style="margin-bottom:8px"><button class="erp-btn sm solid" data-act="td-add" data-k="uj" type="button">+ Tambah ujian</button></div>
      <div class="mu-trw uj h"><span>NAMA UJIAN</span><span>TAHUN</span><span>TINGKATAN</span><span>MULA ISI</span><span>AKHIR ISI</span><span>DIBUKA</span><span></span></div>${uj}
      <div class="erp-hint">“Dibuka” = guru boleh mengisi markah. Ujian yang ditutup hanya boleh diisi oleh Pentadbir.</div>`)}
  ${secHtml("sj", "Mata Pelajaran", nSj + " mata pelajaran (Rendah + Atas)", `${sjBlock("rendah", "Menengah Rendah")}${sjBlock("atas", "Menengah Atas &amp; Tingkatan 5 (SPM)")}
      <div class="erp-hint">Nama penuh digunakan pada slip; kod pendek pada jadual. Singkatan dalam Jadual Guru dipadankan melalui kod, nama penuh atau “singkatan lain”. <b>KIRA GPI</b> dimatikan = direkod sahaja (cth PJK, PSV): tidak masuk GPI, jumlah markah, kedudukan dan GPS. <b>ANALISIS</b> = dipaparkan dalam Analisis Mata Pelajaran. <b>WAJIB LULUS</b> = jika murid mendapat gred gagal (G) dalam mana-mana mata pelajaran wajib, keputusan akhir ialah GAGAL. Susunan baris = susunan lajur.</div>
      <div class="mu-det"><div class="erp-between"><b>Imbas singkatan daripada Jadual Guru</b><span class="erp-hint">${det.length ? det.length + " subjek belum dipadankan" : "Semua subjek dalam Jadual Guru telah dipadankan"}</span></div>
        ${det.map((d, i) => `<div class="mu-trw dt"><b>${E(d.t)}</b><span class="dim">${d.nama ? "→ " + E(d.nama) : "(nama penuh tidak dikenali)"}</span><span class="mv"><button class="erp-btn sm solid" data-act="td-det" data-i="${i}" data-l="rendah" type="button">+ Rendah</button><button class="erp-btn sm solid" data-act="td-det" data-i="${i}" data-l="atas" type="button">+ Atas</button></span></div>`).join("")}</div>`)}
  ${secHtml("gr", "Skala Gred", "Rendah A=1…G=6 · Atas A+=0…G=9", `<div class="erp-hint">Menengah Rendah (Tingkatan 1–3): A=1 … E=5, G (gagal)=6. Menengah Atas &amp; Tingkatan 5 (SPM): A+=0 … G (gagal)=9.</div>
      <div class="mu-two2">${gr("rendah", "Menengah Rendah")}${gr("atas", "Menengah Atas / SPM")}</div>
      <div class="erp-hint">GPI = jumlah nilai gred ÷ bilangan subjek yang dikira. Gred terakhir dalam setiap skala ialah gred gagal (gagal).</div>`)}
  ${secHtml("pr", "Peraturan Keputusan", "ambang GPI lulus", `${fld("SKALA ATAS (SPM) BERMULA TINGKATAN", `<input class="erp-in" data-tf="pr.tktAtas" value="${A(P.tktAtas)}" inputmode="numeric">`)}
      ${fld("LULUS JIKA GPI KURANG DARIPADA — MENENGAH RENDAH", `<input class="erp-in" data-tf="pr.ambangRendah" value="${A(P.ambangRendah)}" inputmode="decimal">`)}
      ${fld("LULUS JIKA GPI KURANG DARIPADA — MENENGAH ATAS / SPM", `<input class="erp-in" data-tf="pr.ambangAtas" value="${A(P.ambangAtas)}" inputmode="decimal">`)}
      <div class="erp-hint">Nilai ambang ialah andaian — sahkan dengan peraturan sekolah. Selain ambang GPI, murid yang gagal mana-mana mata pelajaran WAJIB LULUS juga GAGAL. Tingkatan 4 menggunakan skala dan pengiraan SPM. Jika tingkatan permulaan skala atas diubah, semak semula senarai mata pelajaran.</div>`)}
  ${secHtml("kl", "Kelas dan Guru Kelas", kelasList.length + " kelas", `<div class="mu-trw kl h"><span>KELAS</span><span>AUTO (DATA MURID)</span><span>GURU KELAS</span><span>MURID</span></div>${kls || `<div class="erp-hint">Data murid belum dimuatkan.</div>`}
      <div class="erp-hint">${adminApp ? "Guru kelas diambil secara automatik daripada Data Murid. Admin App boleh memilih guru lain jika ada perubahan; pilihan ini mengatasi nilai auto. Pilih “(Auto)” untuk kembali kepada Data Murid." : "Guru kelas diambil daripada Data Murid. Hanya Admin App boleh menetapkan guru kelas secara manual."}</div>`)}
  ${secHtml("ak", "Akses Keputusan Kelas & Tingkatan", akL.length + " guru dibenarkan", `<div class="erp-hint" style="margin-top:0">Tandakan guru yang boleh melihat tab <b>Keputusan Kelas</b> dan <b>Keputusan Tingkatan</b>. Guru yang tidak ditandakan tidak akan melihat kedua-dua tab ini. Pentadbir dan Admin App sentiasa boleh melihatnya.</div>
      <div class="mu-aks">${akHtml || `<div class="erp-hint">Senarai guru belum dimuatkan.</div>`}</div>`)}
  <div class="erp-right"><button class="erp-btn" data-act="td-reset" type="button">Batal</button><button class="erp-btn solid orange" data-act="td-save" type="button">Simpan tetapan</button></div>`;
}
function tdSave() {
  const T = S.td;
  const num = (v, d) => { const x = parseFloat(String(v).replace(",", ".")); return isNaN(x) ? d : x; };
  const out = C.clone(T);
  out.ujian.forEach((u) => { u.id = u.id || "UJ" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); u.tahun = Math.round(num(u.tahun, new Date().getFullYear())); u.nama = String(u.nama || "").trim(); });
  out.ujian = out.ujian.filter((u) => u.nama);
  out.subjek.forEach((s) => { s.kod = up(s.kod); s.nama = up(s.nama || s.kod); s.alias = String(s.alias || "").trim(); s.wajib = !!s.wajib; });
  out.subjek = out.subjek.filter((s) => s.kod);
  const kodSet = new Set(); for (const s of out.subjek) { const k = s.lvl + "|" + s.kod; if (kodSet.has(k)) return { err: "Kod subjek berganda dalam " + (s.lvl === "atas" ? "Menengah Atas" : "Menengah Rendah") + ": " + s.kod }; kodSet.add(k); }
  out.akses = { keputusan: ((T.akses && T.akses.keputusan) || []).filter(Boolean) };
  out.guruKelas = {}; Object.keys(T.guruKelas || {}).forEach((k) => { if (T.guruKelas[k]) out.guruKelas[k] = T.guruKelas[k]; });
  ["rendah", "atas"].forEach((k) => { out.gred[k].forEach((g) => { g.dari = num(g.dari, 0); g.mata = num(g.mata, 0); }); out.gred[k].sort((a, b) => b.dari - a.dari); });
  out.peraturan = { tktAtas: Math.round(num(T.peraturan.tktAtas, 4)), ambangRendah: num(T.peraturan.ambangRendah, 5), ambangAtas: num(T.peraturan.ambangAtas, 8) };
  return { out };
}

/* ================= Acara ================= */
async function onClick(e) {
  const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act;
  if (a === "tema") { temaApply(temaGet() === "gelap" ? "cerah" : "gelap"); render(); return; }
  if (a === "logout") { if (await ask("Log keluar?")) logout(); return; }
  if (a === "tab") {
    if (S.tab === "isi" && S.dirty && !(await ask("Markah belum disimpan. Tinggalkan halaman ini?"))) return;
    S.tab = el.dataset.t; S._ind = S._ind; render(); if (APP) window.scrollTo(0, 0); return;
  }
  if (a === "ut-uj-pick") { S.ujianId = el.dataset.u; S.home.open = ""; S._keepScroll = true; render(); return; }
  if (a === "ut-view") { S.home.view = el.dataset.v; S._keepScroll = true; render(); return; }
  if (a === "ut-open") { S.home.open = S.home.open === el.dataset.k ? "" : el.dataset.k; S._keepScroll = true; render(); return; }
  if (a === "isi-tugas") {
    if (S.dirty && !(await ask("Markah belum disimpan. Tukar pilihan dan buang perubahan?"))) return;
    const I = S.isi; if (!I.uj) { const t = ujianTerkini(); I.uj = t ? t.id : ""; } I.kelas = el.dataset.k; I.subjek = el.dataset.s; S.draftKey = ""; S.dirty = false; if (isiOpts().ready) I.anim = true; S._keepScroll = true; render(); return;
  }
  if (a === "ut-tkt") { S.home.tkt = +el.dataset.t; S.home.all = false; S._keepScroll = true; render(); return; }
  if (a === "ut-semua") { S.home.all = !S.home.all; S._keepScroll = true; render(); return; }
    if (a === "ut-isi") { S.isi = { uj: S.ujianId, kelas: el.dataset.k, subjek: el.dataset.s, anim: true }; S.draftKey = ""; S.dirty = false; S.tab = "isi"; render(); window.scrollTo(0, 0); return; }
  if (a === "ut-csv") return utamaCsv();
  if (a === "isi-draf") return isiSimpan(false);
  if (a === "isi-hantar") return isiSimpan(true);
  if (a === "isi-buka") { if (!(await ask("Buka semula markah ini untuk diedit oleh guru?"))) return; try { await post({ action: "bukaSemula", ujian: S.isi.uj, kelas: S.isi.kelas, subjek: S.isi.subjek }); const r = S.marks[S.isi.uj][up(S.isi.kelas) + "|" + up(S.isi.subjek)]; if (r) r.status = "Draf"; bust(); toast("Dibuka semula."); render(); } catch (err) { toast(err.message, true); } return; }
  if (a === "isi-paste") { const first = document.querySelector("[data-mk]"); toast("Salin lajur markah daripada Excel, klik kotak markah murid pertama dan tekan Ctrl+V."); if (first) first.focus(); return; }
  if (a === "tkt-kelas") { S.tktKelas = el.dataset.k; S._keepScroll = true; render(); return; }
  if (a === "an-scope") { S.scope = el.dataset.s; S._keepScroll = true; render(); return; }
  if (a === "slp-mode") { S.slip.mode = el.dataset.m; S._keepScroll = true; render(); return; }
  if (a === "slp-pick") { S.slip.sel = +el.dataset.i; S._keepScroll = true; render(); return; }
  if (a === "slp-ulasan") return slipUlasanSimpan();
  if (a === "slp-cetak" || a === "slp-pdf") return slipCetak(a === "slp-pdf");
  if (a === "kls-cetak") { const k = kiraKelas(S.ujianId, S.kelas); return cetakDoc(keputusanPrint(k.ting, [{ nama: S.kelas, list: k.list }], false, "KEPUTUSAN KELAS " + S.kelas), PR_CSS, "Keputusan " + S.kelas); }
  if (a === "kls-csv") { const k = kiraKelas(S.ujianId, S.kelas); return csvDown("Keputusan_" + S.kelas.replace(/\s+/g, "_"), keputusanRows(k.ting, [{ nama: S.kelas, list: k.list }], false).rows); }
  if (a === "tkt-cetak") { const t = kiraTkt(S.ujianId, S.tkt); return cetakDoc(keputusanPrint(S.tkt, t.groups.map((g, i) => ({ nama: t.kelas[i], list: g.list })), true, "KEPUTUSAN TINGKATAN " + S.tkt), PR_CSS, "Keputusan Tingkatan " + S.tkt); }
  if (a === "tkt-csv") { const t = kiraTkt(S.ujianId, S.tkt); return csvDown("Keputusan_Tingkatan_" + S.tkt, keputusanRows(S.tkt, t.groups.map((g, i) => ({ nama: t.kelas[i], list: g.list })), true).rows); }
  if (a === "an-cetak") return analisisCetak();
  if (a === "an-csv") return analisisCsv();
  if (a.indexOf("td-") === 0) return tdAct(a, el);
}
async function tdAct(a, el) {
  const T = S.td, i = +el.dataset.i;
  if (a === "td-sec") { const sec = el.closest(".mu-sec"); S.tetOpen[el.dataset.k] = !S.tetOpen[el.dataset.k]; sec.classList.toggle("open", !!S.tetOpen[el.dataset.k]); el.setAttribute("aria-expanded", String(!!S.tetOpen[el.dataset.k])); return; }
  if (a === "td-add") { if (el.dataset.k === "uj") T.ujian.push({ id: "", nama: "", tahun: new Date().getFullYear(), tkt: [1, 2, 3, 4, 5], buka: false, mula: "", akhir: "" }); else T.subjek.push({ kod: "", nama: "", kat: "Teras", lvl: el.dataset.l, tkt: lvTkts(el.dataset.l), aktif: true, kira: true, analisis: true, wajib: false, alias: "" }); S.tdDirty = true; S._keepScroll = true; render(); return; }
  if (a === "td-del") { const k = el.dataset.k === "uj" ? T.ujian : T.subjek; if (!(await ask("Padam baris ini? (Markah yang telah disimpan tidak dipadam.)"))) return; k.splice(i, 1); S.tdDirty = true; S._keepScroll = true; render(); return; }
  if (a === "td-up" || a === "td-dn") {
    const l = T.subjek[i].lvl; let j = i + (a === "td-up" ? -1 : 1); while (j >= 0 && j < T.subjek.length && T.subjek[j].lvl !== l) j += a === "td-up" ? -1 : 1;
    if (j >= 0 && j < T.subjek.length) { [T.subjek[j], T.subjek[i]] = [T.subjek[i], T.subjek[j]]; S.tdDirty = true; S._keepScroll = true; render(); } return;
  }
  if (a === "td-det") { const d = detectList()[i]; if (!d) return; const kod = d.t.length <= 8 ? up(d.t).replace(/\s+/g, "") : up(d.t).split(" ").map((w) => w[0]).join(""); T.subjek.push({ kod, nama: d.nama || up(d.t), kat: "Teras", lvl: el.dataset.l, tkt: lvTkts(el.dataset.l), aktif: true, kira: true, analisis: true, wajib: false, alias: d.t.length <= 8 && d.nama ? "" : d.t }); S.tdDirty = true; S._keepScroll = true; render(); return; }
  if (a === "td-reset") { S.td = null; S.tdDirty = false; S._keepScroll = true; render(); return; }
  if (a === "td-save") {
    const r = tdSave(); if (r.err) { toast(r.err, true); return; }
    if (S.readErr && !(await ask("Tetapan sedia ada gagal dibaca. Menyimpan akan menimpa tetapan lama dengan paparan ini. Teruskan?"))) return;
    S.busy = true; toast("Menyimpan tetapan…", false, true);
    try { await post({ action: "saveTetapan", tetapan: r.out }); S.tet = C.cantum(r.out); S.tetOk = true; bust(); S.td = null; S.tdDirty = false; await loadJg(); toast("Tetapan disimpan."); }
    catch (err) { toast(err.message || String(err), true); }
    S.busy = false; render();
  }
}
async function onChange(e) {
  const t = e.target, a = t.dataset.actChange, tf = t.dataset.tf, tc = t.dataset.tc;
  if (a) {
    const v = t.value; S._keepScroll = true;
    if (a.indexOf("isi-") === 0) {
      if (S.dirty && !(await ask("Markah belum disimpan. Tukar pilihan dan buang perubahan?"))) { render(); return; }
      const I = S.isi; if (a === "isi-uj") I.uj = v; else if (a === "isi-kelas") I.kelas = v; else I.subjek = v;
      S.draftKey = ""; S.dirty = false; if (isiOpts().ready) I.anim = true; render(); return;
    }
    if (["ut-uj", "kls-uj", "tkt-uj", "an-uj", "slp-uj"].indexOf(a) !== -1) { S.ujianId = v; S.slip.sel = 0; S.slip.ulasan = {}; }
    else if (a === "kls-kelas" || a === "slp-kelas") { S.kelas = v; S.slip.sel = 0; S.slip.ulasan = {}; }
    else if (a === "tkt-tkt" || a === "an-tkt") { S.tkt = +v; S.scope = "ALL"; S.tktKelas = ""; }
    render(); return;
  }
  if (tf && S.td) tdField(t);
  if (tc && S.td) tdCheck(t);
}
function tdField(t) {
  const T = S.td, i = +t.dataset.i, f = t.dataset.tf; S.tdDirty = true;
  if (f === "uj.nama") T.ujian[i].nama = t.value; else if (f === "uj.tahun") T.ujian[i].tahun = t.value; else if (f === "uj.mula") T.ujian[i].mula = t.value; else if (f === "uj.akhir") T.ujian[i].akhir = t.value;
  else if (f === "sj.kod") { T.subjek[i].kod = t.value; if (!String(T.subjek[i].nama || "").trim() && C.namaPenuh(t.value)) { T.subjek[i].nama = C.namaPenuh(t.value); S._keepScroll = true; render(); } }
  else if (f === "sj.nama") T.subjek[i].nama = t.value; else if (f === "sj.alias") T.subjek[i].alias = t.value; else if (f === "sj.kat") T.subjek[i].kat = t.value;
  else if (f.indexOf("gr.") === 0) { const [, k, c] = f.split("."); T.gred[k][i][c] = t.value; }
  else if (f.indexOf("pr.") === 0) T.peraturan[f.slice(3)] = t.value;
  else if (f === "gk") { T.guruKelas = T.guruKelas || {}; if (t.value) T.guruKelas[t.dataset.k] = t.value; else delete T.guruKelas[t.dataset.k]; }
}
function tdCheck(t) {
  if (t.dataset.tc === "ak") { const T = S.td; T.akses = T.akses || { keputusan: [] }; const n = t.dataset.n, set = new Set(T.akses.keputusan || []); t.checked ? set.add(n) : set.delete(n); T.akses.keputusan = [...set].sort(); S.tdDirty = true; const h = t.closest(".mu-sec").querySelector(".mu-sec-i"); if (h) h.textContent = set.size + " guru dibenarkan"; return; }
  const T = S.td, i = +t.dataset.i, f = t.dataset.tc, on = t.checked; S.tdDirty = true;
  const tg = (arr, v) => { const s = new Set(arr || []); on ? s.add(v) : s.delete(v); return [...s].sort(); };
  if (f === "uj.buka") T.ujian[i].buka = on; else if (f === "uj.tkt") T.ujian[i].tkt = tg(T.ujian[i].tkt, +t.dataset.t);
  else if (f === "sj.tkt") T.subjek[i].tkt = tg(T.subjek[i].tkt, +t.dataset.t); else if (f === "sj.aktif") T.subjek[i].aktif = on; else if (f === "sj.kira") T.subjek[i].kira = on; else if (f === "sj.analisis") T.subjek[i].analisis = on; else if (f === "sj.wajib") T.subjek[i].wajib = on;
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.mk !== undefined) { isiLive(t); return; }
  if (t.dataset.ul !== undefined) { S.slip.ulasan[t.dataset.ul] = t.value; S.slip.dirty = true; return; }
  if (t.dataset.tf && S.td && t.tagName === "INPUT" && t.dataset.tf !== "sj.kod") tdField(t);
}
function onKey(e) {
  const t = e.target;
  if (e.key === "Enter" && t.dataset && t.dataset.mk !== undefined) { e.preventDefault(); const all = [...document.querySelectorAll("[data-mk]")], n = all[all.indexOf(t) + 1]; if (n) { n.focus(); n.select(); } }
}
function onPaste(e) {
  const t = e.target; if (!t.dataset || t.dataset.mk === undefined) return;
  const txt = (e.clipboardData || window.clipboardData).getData("text"); if (!/[\n\t]/.test(txt.trim())) return;
  e.preventDefault(); isiPaste(txt, t.dataset.mk);
}

/* ---- Slip: simpan ulasan & cetak ---- */
async function slipUlasanSimpan() {
  const cx = slipCtx(); S.busy = true; toast("Menyimpan ulasan…", false, true);
  try { await post({ action: "saveUlasan", ujian: S.ujianId, kelas: S.kelas, ulasan: cx.ul }); (S.ulasan[S.ujianId] = S.ulasan[S.ujianId] || {})[up(S.kelas)] = cx.ul; S.slip.ulasan = {}; S.slip.dirty = false; toast("Ulasan disimpan."); }
  catch (e) { toast(e.message || String(e), true); }
  S.busy = false; render();
}
function slipCetak(pdf) {
  const cx = slipCtx(); if (!cx.u || !cx.kls.list.length) { toast("Tiada slip untuk dicetak.", true); return; }
  const bundle = S.slip.mode === "bundle", items = bundle ? cx.kls.list : [cx.kls.list[S.slip.sel]];
  const body = items.map((x, i) => slipHtml(x, cx.kls, cx.u, cx.ul[x.m.key], cx.ting, i === items.length - 1)).join("");
  const css = '@page{size:A4 portrait;margin:0}body{margin:0;background:#fff}' + SLIP_CSS;
  if (pdf) toast("Dalam tetingkap cetak, pilih “Simpan sebagai PDF”.");
  cetakDoc(body, css, "Slip " + (bundle ? S.kelas : items[0].m.nama));
}
function analisisCetak() {
  const d = analisisData(), u = ujianBy(S.ujianId), pc = (a, b) => (b ? (a / b * 100).toFixed(2) + "%" : "(-)");
  const th = `<tr><th>BIL</th><th>MATA PELAJARAN</th>${d.subj.map((s) => `<th>${E(s.kod)}${s.kira === false ? "*" : ""}</th>`).join("")}</tr>`;
  const r = (l, f) => `<tr><td></td><td class="l"><b>${l}</b></td>${d.an.map(f).join("")}</tr>`;
  let b = r("BIL. HADIR", (a) => `<td>${a.hadir}</td>`) + r("BIL. TIDAK HADIR", (a) => `<td>${a.th}</td>`);
  d.sk.forEach((x, k) => { b += `<tr><td>${k + 1}</td><td class="l"><b>${E(x.g)}</b></td>${d.an.map((a) => `<td>${a.gc[k]}</td>`).join("")}</tr>`; });
  b += r("LULUS", (a) => `<td>${a.hadir ? a.ya + " (" + pc(a.ya, a.hadir) + ")" : "0 (-)"}</td>`) + r("GAGAL", (a) => `<td>${a.hadir ? a.tidak + " (" + pc(a.tidak, a.hadir) + ")" : "0 (-)"}</td>`) + r("GPMP", (a) => `<td>${f2(a.gpmp)}</td>`);
  cetakDoc(`<h2>${E(MU_SCHOOL)}</h2><h3>ANALISIS MENGIKUT MATA PELAJARAN — ${S.scope === "ALL" ? "TINGKATAN " + S.tkt : E(S.scope)} — ${E(u ? u.nama + " " + u.tahun : "")}</h3><table><thead>${th}</thead><tbody>${b}</tbody></table><h3 style="margin-top:10px">GPS: ${f2(d.gps)}</h3><div class="note">GPS = purata GPMP mata pelajaran yang dikira. * = analisis sahaja, tidak dimasukkan dalam GPS.</div>`, PR_CSS, "Analisis " + (S.scope === "ALL" ? "Tingkatan " + S.tkt : S.scope));
}
function analisisCsv() {
  const d = analisisData(), rows = [["BIL", "MATA PELAJARAN"].concat(d.subj.map((s) => s.kod))];
  rows.push(["", "BIL. HADIR"].concat(d.an.map((a) => a.hadir)), ["", "BIL. TIDAK HADIR"].concat(d.an.map((a) => a.th)));
  d.sk.forEach((x, k) => rows.push([k + 1, x.g].concat(d.an.map((a) => a.gc[k]))));
  rows.push(["", "LULUS"].concat(d.an.map((a) => a.ya)), ["", "GAGAL"].concat(d.an.map((a) => a.tidak)), ["", "GPMP"].concat(d.an.map((a) => (a.gpmp === null ? "" : a.gpmp.toFixed(2)))), ["", "GPS", f2(d.gps)]);
  csvDown("Analisis_" + (S.scope === "ALL" ? "Tingkatan_" + S.tkt : S.scope.replace(/\s+/g, "_")), rows);
}


/* ================= Utama (landing) ================= */
function ujianTerkini() {
  const L = S.tet.ujian.slice(); if (!L.length) return null;
  const key = (u) => String(u.mula || "") || String(u.tahun || "") + "-00-00";
  L.sort((a, b) => key(b).localeCompare(key(a)));
  return L.find((u) => u.buka) || L[0];
}
function jgMap() {
  if (S.cache.jgmap) return S.cache.jgmap;
  const m = {};
  if (typeof jgRecords !== "undefined") jgRecords.forEach((r) => {
    if (!up(r.kelas) || !up(r.guru)) return;
    const kelas = up(canon(r.kelas)), lv = C.lvlOf(C.tingOf(kelas), S.tet), s = C.cariSubjek(r.subjek, S.tet.subjek.filter((x) => x.lvl === lv)); if (!s) return;
    const k = kelas + "|" + s.kod; (m[k] = m[k] || []); if (m[k].indexOf(up(r.guru)) === -1) m[k].push(up(r.guru));
  });
  return (S.cache.jgmap = m);
}
function utamaData(uid, tf) {
  const ck = "u|" + uid + "|" + tf; if (S.cache[ck]) return S.cache[ck];
  const u = ujianBy(uid), marks = S.marks[uid] || {}, jm = jgMap();
  const kelas = allKelas().filter((k) => (!tf || C.tingOf(k) === tf) && (!u || !(u.tkt || []).length || (u.tkt || []).indexOf(C.tingOf(k)) !== -1));
  const kods = [], nama = {};
  kelas.forEach((k) => subjCols(C.tingOf(k)).forEach((s) => { if (kods.indexOf(s.kod) === -1) kods.push(s.kod); nama[s.kod] = s.nama; }));
  const tot = { H: 0, D: 0, B: 0 }, tk = {}, todo = [];
  const rows = kelas.map((k) => {
    const ting = C.tingOf(k), have = subjCols(ting).map((s) => s.kod); let h = 0, n = 0;
    const cells = kods.map((kod) => {
      if (have.indexOf(kod) === -1) return { kod, st: "N" };
      const r = marks[up(k) + "|" + up(kod)], st = r ? (r.status === "Dihantar" ? "H" : "D") : "B";
      n++; tot[st]++; tk[ting] = tk[ting] || { h: 0, n: 0 }; tk[ting].n++; if (st === "H") { h++; tk[ting].h++; }
      if (st !== "H") todo.push({ kelas: k, kod, st, guru: (jm[up(k) + "|" + kod] || []).join(", "), ting });
      return { kod, st };
    });
    return { kelas: k, cells, h, n };
  });
  todo.sort((a, b) => (a.st === b.st ? 0 : a.st === "B" ? -1 : 1) || a.kelas.localeCompare(b.kelas, "ms", { numeric: true }));
  const akt = Object.keys(marks).map((k) => ({ k, r: marks[k] })).filter((x) => x.r.kemaskini).sort((a, b) => String(b.r.kemaskini).localeCompare(String(a.r.kemaskini))).slice(0, 6);
  return (S.cache[ck] = { u, kelas, kods, nama, rows, tot, tk, todo, akt, jum: tot.H + tot.D + tot.B });
}
function hariLagi(u) {
  if (!u || !u.akhir) return "";
  const d = Math.ceil((new Date(u.akhir + "T23:59:59") - new Date()) / 864e5);
  return d < 0 ? "Tamat" : d === 0 ? "Hari ini" : d + " hari lagi";
}
function vUtama() {
  const w = warnMurid(), L = S.tet.ujian.slice().sort((a, b) => (String(b.mula || b.tahun)).localeCompare(String(a.mula || a.tahun)));
  if (!L.length) return w + `<div class="erp-card"><div class="erp-empty">Belum ada ujian / peperiksaan ditetapkan. Pentadbir boleh menambahnya di Tetapan.</div></div>`;
  if (!ujianBy(S.ujianId)) { const t = ujianTerkini(); S.ujianId = t.id; }
  const uid = S.ujianId, terkini = ujianTerkini(), u = ujianBy(uid);
  if (!S.murid.length) return w;
  if (needLoad(uid)) return w + loadingBox;
  const tf = S.home.tkt, D = utamaData(uid, tf), pct = D.jum ? Math.round(D.tot.H / D.jum * 100) : 0, pd = D.jum ? Math.round((D.tot.H + D.tot.D) / D.jum * 100) : 0;
  const tktAda = [...new Set(allKelas().map((k) => C.tingOf(k)))].filter(Boolean).sort();
  const chips = [0].concat(tktAda).map((t) => `<button class="erp-chip ${t === tf ? "on" : ""}" data-act="ut-tkt" data-t="${t}" type="button">${t ? "Tingkatan " + t : "Semua"}</button>`).join("");
  const bar = `<div class="erp-card mu-bar">${fld("UJIAN / PEPERIKSAAN", `<select class="erp-sel" data-act-change="ut-uj">${L.map((x) => opt(x.id, x.nama + " " + x.tahun + (terkini && x.id === terkini.id ? " — TERKINI" : "") + (x.buka ? "" : " (ditutup)"), uid)).join("")}</select>`)}
    <div class="erp-f mu-fld"><label class="erp-lbl">TINGKATAN</label><div class="erp-chips">${chips}</div></div>
    ${u && (u.mula || u.akhir) ? `<div class="erp-f mu-fld"><label class="erp-lbl">TEMPOH PENGISIAN</label><b class="mu-tempoh">${E(u.mula || "?")} – ${E(u.akhir || "?")} ${hariLagi(u) ? `<span class="erp-pill s-draf">${hariLagi(u)}</span>` : ""}</b></div>` : ""}
    <button class="erp-btn solid mu-go" data-act="tab" data-t="isi" type="button">Isi markah</button></div>`;
  if (!D.jum) return w + bar + `<div class="erp-card"><div class="erp-empty">Tiada kelas / mata pelajaran untuk ujian dan tingkatan ini.</div></div>`;
  const kad = `<div class="mu-ukad"><div class="erp-card mu-donut"><div class="ring" style="background:conic-gradient(var(--siap-t) 0 ${pct}%, var(--draf-t) ${pct}% ${pd}%, var(--line) ${pd}% 100%)"><b>${pct}%</b></div><div><span class="erp-lbl">KADAR KEMASUKAN MARKAH</span><b class="mu-num sm">${D.tot.H} / ${D.jum} dihantar</b><div class="erp-hint">1 kotak = 1 kelas × 1 mata pelajaran.</div></div></div>
    ${[["DIHANTAR", D.tot.H, "ok", "dikunci & dikira"], ["DRAF", D.tot.D, "", "belum dihantar"], ["BELUM DIISI", D.tot.B, "bad", "perlu tindakan"]].map((k) => `<div class="erp-card"><span class="erp-lbl">${k[0]}</span><b class="mu-num ${k[2]}">${k[1]}</b><div class="erp-hint">${k[3]}</div></div>`).join("")}</div>`;
  const ic = { H: "✓", D: "…", B: "!", N: "–" }, cls = { H: "s-siap", D: "s-draf", B: "s-belum", N: "s-na" }, sn = { H: "Dihantar", D: "Draf", B: "Belum diisi", N: "Tidak berkenaan" };
  const mx = `<div class="erp-card"><h3>Status pengisian: kelas × mata pelajaran</h3><div class="mu-leg">${["H", "D", "B", "N"].map((x) => `<span class="erp-pill ${cls[x]}">${ic[x]} ${sn[x]}</span>`).join("")}</div>
    <div class="mu-wide"><div class="mu-mx" style="grid-template-columns:120px repeat(${D.kods.length},minmax(34px,1fr)) 54px"><span class="h l">KELAS</span>${D.kods.map((k) => `<span class="h" title="${A(D.nama[k])}">${E(k)}</span>`).join("")}<span class="h">%</span>
    ${D.rows.map((r) => { const p = r.n ? Math.round(r.h / r.n * 100) : 0; return `<span class="l"><b>${E(r.kelas)}</b></span>${r.cells.map((c) => `<span class="c ${cls[c.st]}" title="${A(c.kod + " — " + sn[c.st])}">${ic[c.st]}</span>`).join("")}<span class="p ${p === 100 ? "ok" : p < 60 ? "bad" : ""}">${p}%</span>`; }).join("")}</div></div></div>`;
  const tkt = `<div class="erp-card"><h3>Kemasukan mengikut tingkatan</h3>${Object.keys(D.tk).sort().map((t) => { const p = Math.round(D.tk[t].h / D.tk[t].n * 100); return `<div class="mu-bars2"><b>Tkt ${t}</b><div class="trk"><i class="${p === 100 ? "ok" : p < 60 ? "bad" : ""}" style="width:${p}%"></i></div><span>${p}%</span></div>`; }).join("")}</div>`;
  const akt = `<div class="erp-card"><h3>Aktiviti terkini</h3>${D.akt.length ? D.akt.map((x) => { const [kl, kd] = x.k.split("|"); return `<div class="mu-akt"><i class="${x.r.status === "Dihantar" ? "ok" : "dr"}"></i><div><b>${E(x.r.oleh || "—")}</b> ${x.r.status === "Dihantar" ? "menghantar" : "menyimpan draf"} ${E(kd)} · ${E(kl)}<div class="erp-hint">${E(x.r.kemaskini)}</div></div></div>`; }).join("") : `<div class="erp-hint">Belum ada aktiviti.</div>`}</div>`;
  // tugasan saya
  const sudah = (k, kod) => { const r = (S.marks[uid] || {})[up(k) + "|" + up(kod)]; return r && r.status === "Dihantar"; };
  const mine = S.jg.filter((x) => (!tf || C.tingOf(x.kelas) === tf) && !sudah(x.kelas, x.kod));
  const saya = S.jg.length ? `<div class="erp-card"><h3>Tugasan saya yang belum dihantar <span class="erp-pill ${mine.length ? "s-belum" : "s-siap"}">${mine.length ? mine.length + " kotak" : "Semua siap ✓"}</span></h3><div class="erp-chips">${mine.map((x) => `<button class="erp-chip" data-act="ut-isi" data-k="${A(x.kelas)}" data-s="${A(x.kod)}" type="button">${E(x.kelas)} · ${E(x.kod)}</button>`).join("")}</div></div>` : "";
  // senarai belum diisi: Pentadbir & Admin App sahaja
  let senarai = "";
  if (S.adm) {
    const rows = S.home.all ? D.todo : D.todo.slice(0, 10);
    senarai = `<div class="erp-card"><div class="mu-bar" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Senarai belum diisi <span class="erp-pill s-belum">${D.todo.length} kotak</span> <span class="erp-pill s-na">🔒 Pentadbir &amp; Admin App sahaja</span></h3><button class="erp-btn sm" data-act="ut-csv" type="button">Muat turun CSV</button></div>
      ${D.todo.length ? `<div class="mu-wide"><div class="mu-tdl"><span class="h">KELAS</span><span class="h">MATA PELAJARAN</span><span class="h">GURU (JADUAL GURU)</span><span class="h">STATUS</span><span class="h"></span>${rows.map((x) => `<b>${E(x.kelas)}</b><span>${E(x.kod)} — ${E(D.nama[x.kod])}</span><span class="g">${E(x.guru || "—")}</span><span><i class="erp-pill ${x.st === "B" ? "s-belum" : "s-draf"}">${x.st === "B" ? "Belum diisi" : "Draf"}</i></span><span><button class="erp-btn sm" data-act="ut-isi" data-k="${A(x.kelas)}" data-s="${A(x.kod)}" type="button">Buka</button></span>`).join("")}</div></div>
      ${D.todo.length > 10 ? `<div style="margin-top:10px"><button class="erp-btn sm" data-act="ut-semua" type="button">${S.home.all ? "Papar 10 teratas" : "Papar semua (" + D.todo.length + ")"}</button></div>` : ""}` : `<div class="erp-hint">Semua markah telah dihantar. 🎉</div>`}
      <div class="erp-hint">Belum diisi dipaparkan dahulu, kemudian draf. Guru dikenal pasti melalui Jadual Guru.</div></div>`;
  }
  return w + bar + kad + `<div class="mu-ut2">${mx}<div class="mu-ut3">${tkt}${akt}</div></div>` + saya + senarai;
}
function utamaCsv() {
  const D = utamaData(S.ujianId, S.home.tkt), u = ujianBy(S.ujianId);
  csvDown("Belum_diisi_" + (u ? (u.nama + "_" + u.tahun).replace(/\s+/g, "_") : ""), [["KELAS", "KOD", "MATA PELAJARAN", "GURU", "STATUS"]].concat(D.todo.map((x) => [x.kelas, x.kod, D.nama[x.kod], x.guru, x.st === "B" ? "Belum diisi" : "Draf"])));
}

/* ================= Status Pengisian (halaman APP SMASRA) ================= */
function vStatusApp() {
  const w = warnMurid(), L = S.tet.ujian.slice().sort((a, b) => (String(b.mula || b.tahun)).localeCompare(String(a.mula || a.tahun)));
  if (!L.length) return w + `<div class="erp-card"><div class="erp-empty">Belum ada ujian / peperiksaan ditetapkan.</div></div>`;
  if (!ujianBy(S.ujianId)) S.ujianId = ujianTerkini().id;
  if (!S.murid.length) return w;
  const pend = L.filter((x) => !S.loaded[x.id]);
  if (pend.length) { if (!S._loadingAll) { S._loadingAll = true; Promise.all(pend.map((x) => loadMarks(x.id))).then(() => { S._loadingAll = false; S._keepScroll = true; render(); }); } return w + loadingBox; }
  const uid = S.ujianId, u = ujianBy(uid), terkini = ujianTerkini(), tf = S.home.tkt;
  const tktAda = [...new Set(allKelas().map((k) => C.tingOf(k)))].filter(Boolean).sort();
  const pcOf = (D) => (D.jum ? Math.round(D.tot.H / D.jum * 100) : null);
  const cls = (p) => (p === null ? "na" : p === 100 ? "ok" : p >= 60 ? "mid" : p > 0 ? "lo" : "bad");
  // 1. Ujian × Tingkatan
  const ut = `<div class="erp-card"><h3>Ujian × Tingkatan</h3><div class="erp-hint" style="margin:0 0 8px">Ketuk satu ujian untuk lihat butirannya di bawah.</div>
    ${L.map((x) => { const cells = tktAda.map((t) => [`T${t}`, pcOf(utamaData(x.id, t))]).concat([["JUM", pcOf(utamaData(x.id, 0))]]); return `<button class="mu-ujb ${x.id === uid ? "on" : ""}" data-act="ut-uj-pick" data-u="${A(x.id)}" type="button"><span class="nm">${E(x.nama + " " + x.tahun)}${terkini && x.id === terkini.id ? ` <i>TERKINI</i>` : ""}</span><span class="gr" style="grid-template-columns:repeat(${cells.length},minmax(0,1fr))">${cells.map((c) => `<span class="c ${cls(c[1])}"><em>${c[0]}</em>${c[1] === null ? "–" : c[1] + "%"}</span>`).join("")}</span></button>`; }).join("")}</div>`;
  // 2. butiran ujian dipilih
  const D = utamaData(uid, tf), pct = pcOf(D) || 0, pd = D.jum ? Math.round((D.tot.H + D.tot.D) / D.jum * 100) : 0;
  const chips = [0].concat(tktAda).map((t) => `<button class="erp-chip ${t === tf ? "on" : ""}" data-act="ut-tkt" data-t="${t}" type="button">${t ? "Tkt " + t : "Semua"}</button>`).join("");
  const head2 = `<div class="erp-card"><h3>${E(u.nama + " " + u.tahun)}${u.mula || u.akhir ? ` <span class="mu-tp">${E(u.mula || "?")} – ${E(u.akhir || "?")} ${hariLagi(u) ? `<span class="erp-pill s-draf">${hariLagi(u)}</span>` : ""}</span>` : ""}</h3>
    <div class="erp-chips" style="margin:6px 0 12px">${chips}</div>
    ${D.jum ? `<div class="mu-donut"><div class="ring" style="background:conic-gradient(var(--siap-t) 0 ${pct}%, var(--draf-t) ${pct}% ${pd}%, var(--line) ${pd}% 100%)"><b>${pct}%</b></div><div><span class="erp-lbl">KADAR KEMASUKAN MARKAH</span><b class="mu-num sm">${D.tot.H} / ${D.jum} dihantar</b><div class="mu-strip"><span class="erp-pill s-draf">Draf ${D.tot.D}</span><span class="erp-pill s-belum">Belum ${D.tot.B}</span></div></div></div>` : `<div class="erp-hint">Tiada kelas / mata pelajaran untuk pilihan ini.</div>`}</div>`;
  if (!D.jum) return w + ut + head2;
  const view = S.adm ? S.home.view : "kelas";
  const sw = `<div class="mu-two2"><button class="erp-btn ${view === "kelas" ? "solid" : ""}" data-act="ut-view" data-v="kelas" type="button">Mengikut kelas</button>${S.adm ? `<button class="erp-btn ${view === "belum" ? "solid" : ""}" data-act="ut-view" data-v="belum" type="button">🔒 Belum diisi (${D.todo.length})</button>` : ""}</div>`;
  const ic = { H: "✓", D: "…", B: "!", N: "–" }, cl = { H: "s-siap", D: "s-draf", B: "s-belum", N: "s-na" };
  let body;
  if (view === "kelas") {
    body = `<div class="mu-leg"><span class="erp-pill s-siap">✓ Dihantar</span><span class="erp-pill s-draf">… Draf</span><span class="erp-pill s-belum">! Belum</span></div>` + D.rows.map((r) => {
      const p = r.n ? Math.round(r.h / r.n * 100) : 0, o = S.home.open === r.kelas;
      return `<div class="erp-card mu-kc"><button class="mu-kh" data-act="ut-open" data-k="${A(r.kelas)}" type="button"><b>${E(r.kelas)}</b><span class="trk"><i class="${cls(p)}" style="width:${p}%"></i></span><span class="pp ${cls(p)}">${p}%</span><em>${o ? "⌃" : "⌄"}</em></button>${o ? `<div class="mu-kb">${r.cells.filter((c) => c.st !== "N").map((c) => `<span class="erp-pill ${cl[c.st]}" title="${A(D.nama[c.kod])}">${E(c.kod)} ${ic[c.st]}</span>`).join("")}</div>` : ""}</div>`;
    }).join("");
  } else {
    const rows = S.home.all ? D.todo : D.todo.slice(0, 15);
    body = `<div class="erp-card"><span class="erp-pill s-na">🔒 Pentadbir &amp; Admin App sahaja</span>
      ${D.todo.length ? rows.map((x) => `<div class="mu-bl"><div><b>${E(x.kelas)} · ${E(x.kod)}</b><div class="erp-hint" style="margin:0">${E(x.guru || "Guru tidak dijumpai dalam Jadual Guru")}</div></div><i class="erp-pill ${x.st === "B" ? "s-belum" : "s-draf"}">${x.st === "B" ? "Belum" : "Draf"}</i><button class="erp-btn sm" data-act="ut-isi" data-k="${A(x.kelas)}" data-s="${A(x.kod)}" type="button">Buka</button></div>`).join("") : `<div class="erp-hint">Semua markah telah dihantar. 🎉</div>`}
      <div class="mu-two2" style="margin-top:10px">${D.todo.length > 15 ? `<button class="erp-btn sm" data-act="ut-semua" type="button">${S.home.all ? "Papar 15 teratas" : "Papar semua (" + D.todo.length + ")"}</button>` : ""}<button class="erp-btn sm" data-act="ut-csv" type="button">Muat turun CSV</button></div></div>`;
  }
  const sudah = (k, kod) => { const r = (S.marks[uid] || {})[up(k) + "|" + up(kod)]; return r && r.status === "Dihantar"; };
  const mine = S.jg.filter((x) => (!tf || C.tingOf(x.kelas) === tf) && !sudah(x.kelas, x.kod));
  const saya = S.jg.length ? `<div class="erp-card"><h3>Tugasan saya yang belum dihantar <span class="erp-pill ${mine.length ? "s-belum" : "s-siap"}">${mine.length ? mine.length + " kotak" : "Semua siap ✓"}</span></h3><div class="erp-chips">${mine.map((x) => `<button class="erp-chip" data-act="ut-isi" data-k="${A(x.kelas)}" data-s="${A(x.kod)}" type="button">${E(x.kelas)} · ${E(x.kod)}</button>`).join("")}</div></div>` : "";
  return w + ut + head2 + saya + sw + body;
}

/* ================= Mula ================= */
async function muInit(user) {
  S.user = user; S.adm = isPentadbir(user);
  temaApply(temaGet()); document.documentElement.classList.add("erp-html");
  const root = document.getElementById("erp-root");
  root.addEventListener("click", onClick); root.addEventListener("change", onChange); root.addEventListener("input", onInput);
  root.addEventListener("keydown", onKey); root.addEventListener("paste", onPaste);
  if (muOk(MU_API_URL)) { try { fetch(MU_API_URL + "?action=init"); } catch (e) {} }
  try {
    await Promise.all([loadTetapan(), loadMurid(), loadStaff(), typeof jgFetchRecords === "function" ? jgFetchRecords(false).catch(() => {}) : null]);
    await loadJg();
    const ti = tabsAda(); if (!ti.some((x) => x[0] === S.tab)) S.tab = ti[0][0];
    const buka = ujianTerkini(); S.ujianId = buka ? buka.id : "";
    if (S.ujianId) await loadMarks(S.ujianId);
    if (APP) { try { const q = new URLSearchParams(location.search); S.tab = q.get("tab") === "status" ? "utama" : "isi"; } catch (e) { S.tab = "isi"; } }
    render();
  } catch (err) { root.innerHTML = `<div class="erp-empty">Ralat memuatkan Markah Ujian: ${E(err.message || err)}</div>`; }
}

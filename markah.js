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
const pad = (n) => String(n).padStart(2, "0");
const f2 = (x) => (x === null || x === undefined || isNaN(x) ? "–" : x.toFixed(2));

let S = {
  user: null, adm: false, tab: "isi", busy: false,
  tet: C.cantum(null), tetOk: false, td: null, tdDirty: false,
  murid: [], muridOk: false,
  marks: {}, ulasan: {}, loaded: {},          // marks[ujianId][KELAS|KOD] ; ulasan[ujianId][KELAS] = {kunci:teks}
  jg: [],                                      // tugasan guru daripada Jadual Guru: [{kelas, kod}]
  ujianId: "", kelas: "", subjek: "", tkt: 0, scope: "ALL",
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
async function post(payload) {
  if (!muOk(MU_API_URL)) throw new Error("API Markah belum dipasang (MU_API_URL belum diisi dalam markah.js).");
  const r = await postToAppsScript(MU_API_URL, Object.assign({ emel: S.user.email }, payload));
  if (!r || r.success === false) throw new Error((r && r.message) || "Gagal menyimpan.");
  return r;
}

/* ================= Muat data ================= */
async function loadTetapan() {
  if (!muOk(MU_SHEET_ID)) return;
  try {
    const t = await gviz("MU_Tetapan", "", MU_SHEET_ID), saved = {};
    t.rows.forEach((r) => { if (r[0]) { try { saved[r[0].trim()] = JSON.parse(r[1]); } catch (e) {} } });
    S.tet = C.cantum(saved); S.tetOk = true;
  } catch (e) { /* guna lalai */ }
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
    S.murid = out; S.muridOk = true;
  } catch (e) { S.muridOk = false; }
}
async function loadMarks(uid, force) {
  if (!uid || (S.loaded[uid] && !force)) return;
  S.marks[uid] = {}; S.ulasan[uid] = {};
  if (muOk(MU_SHEET_ID)) {
    const q = "select * where B = '" + uid.replace(/'/g, "") + "'";
    const [m, u] = await Promise.all([gviz("MU_Markah", q, MU_SHEET_ID).catch(() => ({ rows: [] })), gviz("MU_Ulasan", q, MU_SHEET_ID).catch(() => ({ rows: [] }))]);
    m.rows.forEach((r) => { let marks = {}; try { marks = JSON.parse(r[5] || "{}"); } catch (e) {} S.marks[uid][up(r[2]) + "|" + up(r[3])] = { status: r[4] || "Draf", marks, oleh: r[6], kemaskini: r[8] }; });
    u.rows.forEach((r) => { try { S.ulasan[uid][up(r[2])] = JSON.parse(r[3] || "{}"); } catch (e) {} });
  }
  S.loaded[uid] = true;
}
async function loadJg() {
  try { await jgFetchRecords(false); } catch (e) {}
  S.jg = [];
  if (typeof jgRecords === "undefined") return;
  const nama = up(S.user.nama), seen = new Set();
  const recs = jgRecords.filter((r) => up(r.guru) === nama || (nama.length > 5 && up(r.guru) && (up(r.guru).indexOf(nama) !== -1 || nama.indexOf(up(r.guru)) !== -1)));
  recs.forEach((r) => {
    const s = C.cariSubjek(r.subjek, S.tet.subjek); if (!s || !up(r.kelas)) return;
    const kelas = up(canon(r.kelas)), k = kelas + "|" + s.kod; if (seen.has(k)) return; seen.add(k); S.jg.push({ kelas, kod: s.kod });
  });
}

/* ================= Data terbitan ================= */
const ujianBy = (id) => S.tet.ujian.find((u) => u.id === id);
const subjBy = (kod) => S.tet.subjek.find((s) => s.kod === kod);
const allKelas = () => [...new Set(S.murid.map((m) => m.kelas))].sort((a, b) => a.localeCompare(b, "ms", { numeric: true }));
const muridKelas = (k) => S.murid.filter((m) => m.kelas === k);
const kelasGuru = () => { const n = up(S.user.nama); return allKelas().filter((k) => muridKelas(k).some((m) => up(m.guru) && (up(m.guru) === n || (n.length > 5 && (up(m.guru).indexOf(n) !== -1 || n.indexOf(up(m.guru)) !== -1))))); };
const kelasBoleh = () => (S.adm ? allKelas() : kelasGuru());
const ujianUntukTkt = (t) => S.tet.ujian.filter((u) => !t || (u.tkt || []).indexOf(t) !== -1);
function tabsAda() {
  const T = [["isi", "Isi Markah"]];
  if (S.adm || kelasGuru().length) T.push(["kelas", "Keputusan Kelas"]);
  if (S.adm) T.push(["tkt", "Keputusan Tingkatan"], ["analisis", "Analisis Mata Pelajaran"]);
  if (S.adm || kelasGuru().length) T.push(["slip", "Slip Keputusan"]);
  if (S.adm) T.push(["tetapan", "Tetapan"]);
  return T;
}
/** Kira semua murid dalam satu kelas untuk satu ujian. */
function kiraKelas(uid, kelas) {
  const ms = muridKelas(kelas), ting = ms.length ? ms[0].ting : C.tingOf(kelas), marks = S.marks[uid] || {};
  const list = ms.map((m) => ({ m, c: C.kiraMurid(m, kelas, S.tet, marks, ting) }));
  const rk = C.kedudukan(list, (x) => x.c);
  list.forEach((x) => { x.rk = rk.get(x) || null; });
  return { ting, list };
}
function kiraTkt(uid, ting) {
  const kelas = allKelas().filter((k) => C.tingOf(k) === ting), groups = kelas.map((k) => kiraKelas(uid, k));
  const all = [].concat(...groups.map((g) => g.list)), rt = C.kedudukan(all, (x) => x.c);
  all.forEach((x) => { x.rt = rt.get(x) || null; });
  return { kelas, groups, all };
}

/* ================= Kerangka ================= */
function head() {
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
  const v = { isi: vIsi, kelas: vKelas, tkt: vTkt, analisis: vAnalisis, slip: vSlip, tetapan: vTetapan }[S.tab] || vIsi;
  const y = window.scrollY;
  root.innerHTML = head() + `<div class="erp-main mu">${v()}</div>`;
  if (S._keepScroll) window.scrollTo(0, y); S._keepScroll = false;
  tabInd();
}
const opt = (v, t, cur) => `<option value="${A(v)}" ${String(v) === String(cur) ? "selected" : ""}>${E(t)}</option>`;
const fld = (lbl, inner) => `<div class="erp-f mu-fld"><label class="erp-lbl">${lbl}</label>${inner}</div>`;
const warnMurid = () => (S.muridOk ? "" : `<div class="mu-warn">Data murid tidak dapat dibaca daripada DatabaseMurid. Semak Sheet dikongsi “Anyone with the link – Viewer”.</div>`) + (muOk(MU_SHEET_ID) && muOk(MU_API_URL) ? "" : `<div class="mu-warn">Sheet / API Markah belum dipasang (MU_SHEET_ID, MU_API_URL dalam markah.js). Paparan menggunakan tetapan lalai dan tiada markah boleh disimpan.</div>`);

/* ================= Isi Markah ================= */
function isiOpts() {
  // kelas & subjek yang dibenarkan
  const kelas = S.adm ? allKelas() : [...new Set(S.jg.map((x) => x.kelas))].filter((k) => S.murid.some((m) => m.kelas === k)).sort((a, b) => a.localeCompare(b, "ms", { numeric: true }));
  if (kelas.length && kelas.indexOf(S.kelas) === -1) S.kelas = kelas[0];
  const ting = C.tingOf(S.kelas);
  const subj = !S.kelas ? [] : S.adm ? C.subjekTkt(S.tet, ting) : S.jg.filter((x) => x.kelas === S.kelas).map((x) => subjBy(x.kod)).filter((s) => s && s.aktif !== false && (s.tkt || []).indexOf(ting) !== -1);
  if (subj.length && !subj.some((s) => s.kod === S.subjek)) S.subjek = subj[0].kod;
  if (!subj.length) S.subjek = "";
  const uj = ujianUntukTkt(ting).filter((u) => S.adm || u.buka);
  if (uj.length && !uj.some((u) => u.id === S.ujianId)) S.ujianId = (uj.find((u) => u.buka) || uj[0]).id;
  if (!uj.length) S.ujianId = "";
  return { kelas, subj, uj, ting };
}
function draftInit() {
  const k = [S.ujianId, S.kelas, S.subjek].join("|");
  if (S.draftKey === k) return;
  const rec = (S.marks[S.ujianId] || {})[up(S.kelas) + "|" + up(S.subjek)];
  S.draft = Object.assign({}, rec ? rec.marks : {}); S.draftKey = k; S.dirty = false;
}
function isiStat(ting) {
  const ms = muridKelas(S.kelas), sk = C.skala(S.tet, ting);
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
  const o = isiOpts();
  if (!S.muridOk) return warnMurid();
  if (!o.kelas.length) return warnMurid() + `<div class="erp-card"><div class="erp-hint">Tiada kelas/subjek untuk anda dalam Jadual Guru. Pastikan nama anda dan subjek dalam Jadual Guru sepadan dengan senarai Mata Pelajaran (Tetapan), atau minta Pentadbir menyemak.</div></div>`;
  if (S.ujianId && needLoad(S.ujianId)) return warnMurid() + loadingBox;
  draftInit();
  const u = ujianBy(S.ujianId), rec = (S.marks[S.ujianId] || {})[up(S.kelas) + "|" + up(S.subjek)], kunci = rec && rec.status === "Dihantar" && !S.adm;
  const ms = muridKelas(S.kelas), st = isiStat(o.ting), buka = !!(u && (u.buka || S.adm));
  const sub = subjBy(S.subjek);
  const rows = ms.map((m, i) => `<div class="mu-tr isi"><span class="dim">${i + 1}</span><b>${E(m.nama)}</b><span class="dim">${E(m.kp)}</span>
      <span><input class="mu-mk ${badRaw(S.draft[m.key]) ? "lo" : ""}" data-mk="${A(m.key)}" value="${A(S.draft[m.key] || "")}" inputmode="decimal" autocomplete="off" ${kunci || !buka ? "readonly" : ""} aria-label="Markah ${A(m.nama)}"></span>
      <span id="g-${A(m.key)}">${gredCell(S.draft[m.key], o.ting)}</span></div>`).join("");
  const statusPill = rec ? `<span class="erp-pill ${rec.status === "Dihantar" ? "s-siap" : "s-draf"}">${E(rec.status)}</span>` : `<span class="erp-pill s-belum">Belum diisi</span>`;
  return `${warnMurid()}
  <div class="erp-card mu-bar">
    ${fld("UJIAN / PEPERIKSAAN", `<select class="erp-sel" data-act-change="isi-uj">${o.uj.length ? o.uj.map((x) => opt(x.id, x.nama + " " + x.tahun + (x.buka ? "" : " (ditutup)"), S.ujianId)).join("") : `<option value="">Tiada ujian dibuka</option>`}</select>`)}
    ${fld("KELAS", `<select class="erp-sel" data-act-change="isi-kelas">${o.kelas.map((k) => opt(k, k, S.kelas)).join("")}</select>`)}
    ${fld("MATA PELAJARAN", `<select class="erp-sel" data-act-change="isi-subj">${o.subj.map((s) => opt(s.kod, s.kod + " — " + s.nama, S.subjek)).join("")}</select>`)}
    <div class="erp-f mu-fld"><span class="erp-lbl">BIL. MURID</span><b class="mu-big">${ms.length} orang</b></div>
    <div class="erp-f mu-fld"><span class="erp-lbl">STATUS</span>${statusPill}</div>
  </div>
  ${sub && sub.kira === false ? `<div class="mu-note">${E(sub.kod)} direkod sahaja — TIDAK dikira dalam GPI, jumlah markah dan kedudukan.</div>` : ""}
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
  </div>`;
}
function isiSum(st) {
  const mx = Math.max(1, ...st.gc);
  return `<div class="erp-card"><h3>Ringkasan</h3><div class="erp-between"><span class="erp-lbl" style="margin:0">DIISI</span><b class="mu-big">${st.diisi} / ${st.n}</b></div>
    <div class="erp-bar" style="margin:6px 0 12px"><i style="width:${st.n ? Math.round((st.diisi / st.n) * 100) : 0}%"></i></div>
    <div class="mu-kv"><div><span>PURATA</span><b>${st.avg === null ? "–" : st.avg.toFixed(1)}</b></div><div><span>LULUS</span><b>${st.lulus === null ? "–" : st.lulus + "%"}</b></div><div><span>TERTINGGI</span><b>${st.max === null ? "–" : st.max}</b></div><div><span>TERENDAH</span><b>${st.min === null ? "–" : st.min}</b></div></div></div>
    <div class="erp-card"><h3>Taburan gred</h3>${st.sk.map((x, i) => `<div class="mu-bars"><b>${E(x.g)}</b><div class="erp-bar"><i style="width:${Math.round((st.gc[i] / mx) * 100)}%"></i></div><span>${st.gc[i]}</span></div>`).join("")}</div>`;
}
function isiLive(inp) {
  const key = inp.dataset.mk, o = C.tingOf(S.kelas);
  S.draft[key] = inp.value; S.dirty = true; inp.classList.toggle("lo", badRaw(inp.value));
  const g = document.getElementById("g-" + key); if (g) g.innerHTML = gredCell(inp.value, o);
  const s = document.getElementById("isi-sum"); if (s) s.innerHTML = isiSum(isiStat(o));
}
async function isiSimpan(hantar) {
  const ms = muridKelas(S.kelas), ting = C.tingOf(S.kelas), bad = ms.filter((m) => badRaw(S.draft[m.key]));
  if (bad.length) { toast("Markah tidak sah (guna 0–100 atau TH): " + bad[0].nama, true); return; }
  const kosong = ms.filter((m) => !String(S.draft[m.key] || "").trim()).length;
  if (hantar) {
    const msg = (kosong ? kosong + " murid belum diisi (dianggap tidak mengambil subjek ini). " : "") + "Selepas dihantar, markah dikunci dan hanya Pentadbir boleh membukanya semula. Hantar sekarang?";
    if (!(await ask(msg))) return;
  }
  const marks = {}; ms.forEach((m) => { const v = String(S.draft[m.key] || "").trim(); if (v) marks[m.key] = v; });
  S.busy = true; toast(hantar ? "Menghantar markah…" : "Menyimpan draf…", false, true);
  try {
    const r = await post({ action: "saveMarkah", ujian: S.ujianId, kelas: S.kelas, subjek: S.subjek, markah: marks, hantar: !!hantar });
    const rec = { status: r.status, marks: Object.assign({}, marks), oleh: S.user.nama, kemaskini: "" };
    (S.marks[S.ujianId] = S.marks[S.ujianId] || {})[up(S.kelas) + "|" + up(S.subjek)] = rec; S.dirty = false;
    toast(hantar ? "Markah dihantar." : "Draf disimpan.");
  } catch (e) { toast(e.message || String(e), true); }
  S.busy = false; render();
}
function isiPaste(text, startKey) {
  const ms = muridKelas(S.kelas), i0 = Math.max(0, ms.findIndex((m) => m.key === startKey));
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
    return `<div class="mu-g" style="grid-template-columns:${cols}"><span class="dim">${i + 1}</span><span class="l"><b>${E(x.m.nama)}</b></span><span class="dim">${E(x.m.kp ? x.m.kp.replace(/(\d{4})\d{4}(\d{4})/, "$1••••$2") : "")}</span>${cells}${c.gc.map((n) => `<span class="${n ? "" : "dim"}">${n}</span>`).join("")}<span><b>${f2(c.gpi)}</b></span><span class="${c.lulus === null ? "dim" : c.lulus ? "ok" : "bad"}"><b>${c.lulus === null ? "–" : c.lulus ? "LULUS" : "GAGAL"}</b></span><span>${x.rk || "–"}</span>${opts.tkt ? `<span>${x.rt || "–"}</span>` : ""}</div>`;
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
  const ks = kelasBoleh(); if (!ks.length) return `<div class="erp-card"><div class="erp-hint">Anda bukan guru kelas bagi mana-mana kelas dalam Data Murid.</div></div>`;
  if (ks.indexOf(S.kelas) === -1) S.kelas = ks[0];
  const ting = C.tingOf(S.kelas), top = `<div class="erp-card mu-bar">${ujianSel("kls-uj", ting)}${fld("KELAS", `<select class="erp-sel" data-act-change="kls-kelas">${ks.map((k) => opt(k, k, S.kelas)).join("")}</select>`)}
    <div class="erp-f mu-fld"><span class="erp-lbl">GURU KELAS</span><b>${E((muridKelas(S.kelas)[0] || {}).guru || "–")}</b></div>
    <div class="erp-right mu-bt"><button class="erp-btn" data-act="kls-cetak" type="button">Cetak / PDF</button><button class="erp-btn" data-act="kls-csv" type="button">Muat turun Excel</button></div></div>`;
  if (!S.ujianId) return warnMurid() + top;
  if (needLoad(S.ujianId)) return warnMurid() + top + loadingBox;
  const k = kiraKelas(S.ujianId, S.kelas);
  return `${warnMurid()}${top}${kadHtml(k.list)}${statusStrip(S.ujianId, S.kelas, ting)}<div class="erp-card mu-tbl">${tblHtml({ ting, groups: [{ nama: S.kelas, list: k.list }] })}
    <div class="erp-hint" style="padding:8px 14px">M = markah, G = gred. Gred G (gagal) ditanda merah. KEP. = bilangan gred murid. KDDK = kedudukan dalam kelas ikut GPI (terendah = terbaik). * = subjek direkod sahaja, tidak dikira dalam GPI, jumlah dan kedudukan.</div></div>`;
}
function tktList() { return [...new Set(allKelas().map((k) => C.tingOf(k)))].filter(Boolean).sort(); }
function vTkt() {
  if (!S.muridOk) return warnMurid();
  const ts = tktList(); if (!ts.length) return warnMurid();
  if (ts.indexOf(S.tkt) === -1) S.tkt = ts[ts.length - 1];
  const top = `<div class="erp-card mu-bar">${ujianSel("tkt-uj", S.tkt)}${fld("TINGKATAN", `<select class="erp-sel" data-act-change="tkt-tkt">${ts.map((t) => opt(t, "Tingkatan " + t, S.tkt)).join("")}</select>`)}
    <div class="erp-right mu-bt"><button class="erp-btn" data-act="tkt-cetak" type="button">Cetak / PDF</button><button class="erp-btn" data-act="tkt-csv" type="button">Muat turun Excel</button></div></div>`;
  if (!S.ujianId) return top; if (needLoad(S.ujianId)) return top + loadingBox;
  const t = kiraTkt(S.ujianId, S.tkt);
  return `${warnMurid()}${top}${kadHtml(t.all)}<div class="erp-card mu-tbl">${tblHtml({ ting: S.tkt, tkt: true, groups: t.groups.map((g, i) => ({ nama: t.kelas[i], list: g.list })) })}
    <div class="erp-hint" style="padding:8px 14px">Senarai murid dipisahkan mengikut kelas. KDDK KLS = kedudukan dalam kelas; KDDK TKT = kedudukan dalam tingkatan (GPI terendah = terbaik, jumlah markah sebagai penentu).</div></div>`;
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
  h += row("#fff", `<b class="sp2c">MENGUASAI</b>${d.an.map((a) => `<span class="pc">${a.hadir ? a.ya + "<br>(" + pc(a.ya, a.hadir) + ")" : "0<br>(-)"}</span>`).join("")}`.replace('<b class="sp2c">', '<b class="sp2c" style="grid-column:span 2">'));
  h += row("#fff", `<b class="sp2c" style="grid-column:span 2">TIDAK MENGUASAI</b>${d.an.map((a) => `<span class="pc">${a.hadir ? a.tidak + "<br>(" + pc(a.tidak, a.hadir) + ")" : "0<br>(-)"}</span>`).join("")}`);
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
  const kad = [["BIL. MURID", d.pool.length, ""], ["GPS", f2(d.gps), ""], ["PURATA MENGUASAI", totH ? (totY / totH * 100).toFixed(1) + "%" : "–", "ok"], ["SUBJEK PALING LEMAH", wk ? d.subj[d.an.indexOf(wk)].kod : "–", "bad"]];
  return `${warnMurid()}${top}<div class="mu-kad">${kad.map((k) => `<div class="erp-card"><span class="erp-lbl">${k[0]}</span><b class="mu-num ${k[2]}">${k[1]}</b></div>`).join("")}</div>
    <div class="erp-card"><div class="mu-at">ANALISIS MENGIKUT MATA PELAJARAN</div><div class="mu-as">${S.scope === "ALL" ? "TINGKATAN " + S.tkt : E(S.scope)} · ${E(u ? u.nama + " " + u.tahun : "")}</div>${analisisTbl(d)}
    <div class="mu-gps"><span>GPS</span><b>${f2(d.gps)}</b></div>
    <div class="erp-hint">Menguasai = semua gred kecuali gred gagal (G). Peratus dikira daripada murid hadir bagi subjek itu. GPMP = purata nilai gred subjek. GPS = purata GPMP mata pelajaran yang dikira; subjek bertanda * (cth PJK, PSV) dipaparkan untuk analisis sahaja dan tidak dimasukkan dalam GPS.</div></div>`;
}

/* ================= Slip Keputusan ================= */
function slipHtml(x, kls, u, ulasan, ting, last) {
  const c = x.c, sk = C.skala(S.tet, ting), subjAll = subjCols(ting);
  const baris = c.rows.map((r, j) => {
    const sj = subjAll[j], nm = sj.nama || sj.kod;
    const m = r.st === "num" ? r.m : r.st === "th" ? "TH" : "+", g = r.st === "num" ? r.g : "-", red = r.st === "num" && r.gagal;
    return `<div class="sr"><span>${j + 1}</span><span>${E(nm)}${sj.kira === false ? " *" : ""}</span><b style="${red ? "color:#b91c1c" : ""}">${m}</b><b style="${red ? "color:#b91c1c" : ""}">${E(g)}</b></div>`;
  }).join("");
  const gredAll = sk.map((q, i) => c.gc[i] + " [" + q.g + "]").join(", ");
  const nkls = kls.list.length, ada = subjAll.some((s) => s.kira === false);
  return `<div class="slip" ${last ? "" : 'style="page-break-after:always"'}>
    <div class="sh"><img src="${A(typeof SCHOOL_LOGO_URL !== "undefined" ? SCHOOL_LOGO_URL : "")}" alt="" onerror="this.style.visibility='hidden'"><div class="st"><div class="sn">${E(MU_SCHOOL)}</div><div class="sa">${E(MU_ALAMAT)}</div></div><div class="sp"></div></div>
    <div class="sj"><span>SLIP KEPUTUSAN</span><span>${E(up(u.nama))}</span><span>${E(u.tahun)}</span></div>
    <div class="sd"><span>Nama</span><span>:</span><b>${E(x.m.nama)}</b><span>Tingkatan</span><span>:</span><b>${E(x.m.kelas)}</b><span>No. KP</span><span>:</span><b>${E(x.m.kp)}</b><span>Pencapaian</span><span>:</span><b style="${c.lulus === false ? "color:#b91c1c" : ""}">${c.lulus === null ? "–" : c.lulus ? "LULUS" : "GAGAL"}</b></div>
    <div class="sb"><div class="sr h"><span>Bil</span><span>Mata Pelajaran</span><span>Markah</span><span>Gred</span></div>${baris}</div>
    ${ada ? `<div class="sf">* Direkod sahaja — tidak dikira dalam GPI, jumlah markah dan kedudukan.</div>` : ""}
    <div class="ss"><div><span>Bilangan Mata Pelajaran Daftar</span><span>:</span><b>${c.n}</b><span>Kedudukan Dalam Kelas</span><span>:</span><b>${x.rk || "–"} / ${nkls}</b><span>Kedudukan Dalam Tingkatan</span><span>:</span><b>${x.rt || "–"} / ${x.nt}</b></div>
      <div><span>Jumlah Markah</span><span>:</span><b>${c.n ? c.jum : "–"}</b><span>Peratus (%)</span><span>:</span><b>${f2(c.pct)}</b><span>Gred Purata Pelajar</span><span>:</span><b>${f2(c.gpi)}</b></div></div>
    <div class="sg"><span>Pencapaian Gred Keseluruhan</span><span>:</span><b>${E(gredAll)}</b></div>
    <div class="sl"></div>
    <div class="su"><span>Ulasan Guru Kelas :</span><span class="ul">${E(ulasan || "")}</span></div>
    <div class="sx"><span>Tandatangan Guru Kelas:</span><span>Tandatangan Pengetua:</span><span>Tandatangan Penjaga:</span></div></div>`;
}
const SLIP_CSS = '.slip{width:794px;height:1123px;box-sizing:border-box;background:#fff;color:#000;font-family:"Times New Roman",Times,serif;font-size:12px;padding:44px 52px;display:flex;flex-direction:column;overflow:hidden}.slip *{box-sizing:border-box}.slip .sh{display:flex;align-items:center;gap:18px;padding-bottom:10px;border-bottom:2px solid #000}.slip .sh img{width:78px;height:78px;object-fit:contain;flex:none}.slip .sp{width:78px;flex:none}.slip .st{flex:1;text-align:center}.slip .sn{font-weight:700;font-size:20px;letter-spacing:.02em}.slip .sa{font-size:12px;margin-top:3px}.slip .sj{display:flex;justify-content:space-between;font-weight:700;font-size:13px;padding:14px 60px 0;text-align:center}.slip .sd{display:grid;grid-template-columns:70px 12px 1fr 90px 12px 150px;row-gap:12px;margin-top:30px;font-size:12px}.slip .sd b{font-size:13px}.slip .sb{margin-top:20px;border-top:1px solid #000;border-bottom:1px solid #000;padding:6px 0 12px}.slip .sr{display:grid;grid-template-columns:44px 1fr 90px 70px;padding:3px 0;font-size:11.5px}.slip .sr>span:first-child{padding-left:12px}.slip .sr>b,.slip .sr>span:nth-child(n+3){text-align:center}.slip .sr.h{font-weight:700;font-size:12px;border-bottom:1px solid #000;margin-bottom:10px;padding-bottom:6px}.slip .sf{font-size:10px;margin-top:4px}.slip .ss{display:grid;grid-template-columns:1.25fr 1fr;column-gap:30px;margin-top:20px;font-size:11.5px}.slip .ss>div{display:grid;grid-template-columns:auto 10px 1fr;column-gap:6px;row-gap:14px;align-content:start}.slip .ss>div:first-child{grid-template-columns:200px 10px 1fr}.slip .ss>div:last-child{grid-template-columns:120px 10px 1fr}.slip .sg{display:grid;grid-template-columns:200px 10px 1fr;margin-top:14px;font-size:11.5px}.slip .sl{margin-top:20px;border-top:1px solid #000}.slip .su{margin-top:22px;font-size:11.5px;display:flex;gap:8px;align-items:baseline}.slip .ul{font-family:"Caveat","Segoe Script",cursive;font-size:17px;font-style:italic}.slip .sx{margin-top:auto;display:flex;justify-content:space-between;font-size:11.5px;padding-top:50px}';
function slipCtx() {
  const ks = kelasBoleh(); if (ks.indexOf(S.kelas) === -1) S.kelas = ks[0];
  const ting = C.tingOf(S.kelas), kls = kiraKelas(S.ujianId, S.kelas), tk = kiraTkt(S.ujianId, ting);
  kls.list.forEach((x) => { const f = tk.all.find((y) => y.m.key === x.m.key && y.m.kelas === x.m.kelas); x.rt = f ? f.rt : null; x.nt = tk.all.length; });
  const ul = Object.assign({}, (S.ulasan[S.ujianId] || {})[up(S.kelas)] || {}, S.slip.ulasan);
  return { ks, ting, kls, ul, u: ujianBy(S.ujianId) };
}
function vSlip() {
  if (!S.muridOk) return warnMurid();
  const ks = kelasBoleh(); if (!ks.length) return `<div class="erp-card"><div class="erp-hint">Anda bukan guru kelas bagi mana-mana kelas dalam Data Murid.</div></div>`;
  if (ks.indexOf(S.kelas) === -1) S.kelas = ks[0];
  const ting = C.tingOf(S.kelas), bundle = S.slip.mode === "bundle";
  const top = `<div class="erp-card mu-bar">${ujianSel("slp-uj", ting)}${fld("KELAS", `<select class="erp-sel" data-act-change="slp-kelas">${ks.map((k) => opt(k, k, S.kelas)).join("")}</select>`)}
    <div class="erp-f mu-fld"><span class="erp-lbl">MOD CETAK</span><div class="erp-chips"><button class="erp-chip ${bundle ? "" : "on"}" data-act="slp-mode" data-m="satu" type="button">Satu-satu</button><button class="erp-chip ${bundle ? "on" : ""}" data-act="slp-mode" data-m="bundle" type="button">Bundle 1 kelas</button></div></div></div>`;
  if (!S.ujianId) return top; if (needLoad(S.ujianId)) return top + loadingBox;
  const cx = slipCtx(), n = cx.kls.list.length; if (S.slip.sel >= n) S.slip.sel = 0;
  const sel = cx.kls.list[S.slip.sel];
  const list = cx.kls.list.map((x, i) => `<button class="mu-mr ${i === S.slip.sel ? "on" : ""}" data-act="slp-pick" data-i="${i}" type="button"><span class="dim">${i + 1}</span><span class="nm"><b>${E(x.m.nama)}</b><small>GPI ${f2(x.c.gpi)} · Kedudukan ${x.rk || "–"}/${n}</small></span><i class="erp-pill ${x.c.lulus === null ? "s-belum" : x.c.lulus ? "s-siap" : "s-pulang"}">${x.c.lulus === null ? "–" : x.c.lulus ? "LULUS" : "GAGAL"}</i>${bundle ? `<span class="tk">✓</span>` : ""}</button>`).join("");
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
const chk5 = (arr, act, i) => [1, 2, 3, 4, 5].map((t) => `<label class="mu-t5"><input type="checkbox" data-tc="${act}" data-i="${i}" data-t="${t}" ${(arr || []).indexOf(t) !== -1 ? "checked" : ""}>${t}</label>`).join("");
function detectList() {
  if (typeof jgRecords === "undefined") return [];
  const seen = new Map();
  jgRecords.forEach((r) => { const t = String(r.subjek || "").trim(); if (!t || C.cariSubjek(t, S.td.subjek)) return; const k = C.nk(t); if (!seen.has(k)) seen.set(k, t); });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "ms")).map((t) => ({ t, nama: C.namaPenuh(t) || (t.length > 8 ? up(t) : "") }));
}
function vTetapan() {
  tdInit(); const T = S.td, det = detectList();
  const uj = T.ujian.map((u, i) => `<div class="mu-trw uj"><input class="erp-in" data-tf="uj.nama" data-i="${i}" value="${A(u.nama)}" aria-label="Nama ujian"><input class="erp-in" data-tf="uj.tahun" data-i="${i}" value="${A(u.tahun)}" inputmode="numeric" aria-label="Tahun"><span class="t5">${chk5(u.tkt, "uj.tkt", i)}</span><input class="erp-in" type="date" data-tf="uj.mula" data-i="${i}" value="${A(u.mula)}" aria-label="Mula"><input class="erp-in" type="date" data-tf="uj.akhir" data-i="${i}" value="${A(u.akhir)}" aria-label="Akhir"><span>${sw("uj.buka", i, u.buka)}</span><button class="erp-btn sm warn" data-act="td-del" data-k="uj" data-i="${i}" type="button">Padam</button></div>`).join("");
  const sj = T.subjek.map((s, i) => `<div class="mu-trw sj"><input class="erp-in kod" data-tf="sj.kod" data-i="${i}" value="${A(s.kod)}" aria-label="Kod"><input class="erp-in" data-tf="sj.nama" data-i="${i}" value="${A(s.nama)}" aria-label="Nama penuh"><input class="erp-in" data-tf="sj.alias" data-i="${i}" value="${A(s.alias)}" placeholder="singkatan lain (BM, B.M)" aria-label="Singkatan lain"><select class="erp-sel" data-tf="sj.kat" data-i="${i}">${["Teras", "Elektif", "Agama"].map((k) => opt(k, k, s.kat)).join("")}</select><span class="t5">${chk5(s.tkt, "sj.tkt", i)}</span><span>${sw("sj.aktif", i, s.aktif !== false)}</span><span>${sw("sj.kira", i, s.kira !== false)}</span><span>${sw("sj.analisis", i, s.analisis !== false)}</span><span class="mv"><button class="erp-btn sm" data-act="td-up" data-i="${i}" type="button" aria-label="Naik">↑</button><button class="erp-btn sm" data-act="td-dn" data-i="${i}" type="button" aria-label="Turun">↓</button><button class="erp-btn sm warn" data-act="td-del" data-k="sj" data-i="${i}" type="button">Padam</button></span></div>`).join("");
  const gr = (k, nm) => `<div class="mu-gt"><b>${nm}</b>${T.gred[k].map((g, i) => `<div class="mu-trw gr"><b>${E(g.g)}</b><input class="erp-in" data-tf="gr.${k}.dari" data-i="${i}" value="${A(g.dari)}" inputmode="numeric" aria-label="Markah dari ${A(g.g)}"><input class="erp-in" data-tf="gr.${k}.mata" data-i="${i}" value="${A(g.mata)}" inputmode="decimal" aria-label="Nilai ${A(g.g)}"></div>`).join("")}</div>`;
  const kls = allKelas().map((k) => `<div class="mu-trw kl"><b>${E(k)}</b><span>${E((muridKelas(k)[0] || {}).guru || "–")}</span><b>${muridKelas(k).length}</b></div>`).join("");
  const P = T.peraturan;
  return `<div class="erp-card"><h3>Tetapan</h3><div class="erp-hint">Pentadbir dan Admin App sahaja. Perubahan terpakai pada semua halaman markah selepas Simpan tetapan.${S.tetOk ? "" : " (Belum ada tetapan tersimpan — memaparkan lalai.)"}</div></div>
  <div class="mu-two tet"><div class="mu-col">
    <div class="erp-card"><div class="erp-between"><h3 style="margin:0">Ujian / Peperiksaan</h3><button class="erp-btn sm solid" data-act="td-add" data-k="uj" type="button">+ Tambah ujian</button></div>
      <div class="mu-trw uj h"><span>NAMA UJIAN</span><span>TAHUN</span><span>TINGKATAN</span><span>MULA ISI</span><span>AKHIR ISI</span><span>DIBUKA</span><span></span></div>${uj}
      <div class="erp-hint">“Dibuka” = guru boleh mengisi markah. Ujian yang ditutup hanya boleh diisi oleh Pentadbir.</div></div>
    <div class="erp-card"><div class="erp-between"><h3 style="margin:0">Mata Pelajaran</h3><button class="erp-btn sm solid" data-act="td-add" data-k="sj" type="button">+ Tambah mata pelajaran</button></div>
      <div class="mu-trw sj h"><span>KOD</span><span>NAMA PENUH (SLIP)</span><span>SINGKATAN LAIN</span><span>KATEGORI</span><span>TINGKATAN</span><span>AKTIF</span><span>KIRA GPI</span><span>ANALISIS</span><span></span></div>${sj}
      <div class="erp-hint">Nama penuh digunakan pada slip keputusan; kod pendek pada jadual. Singkatan dalam Jadual Guru dipadankan melalui kod, nama penuh atau “singkatan lain”. KIRA GPI dimatikan = direkod sahaja (cth PJK, PSV): tidak masuk GPI, jumlah markah, kedudukan dan GPS. ANALISIS = dipaparkan dalam Analisis Mata Pelajaran. Susunan baris = susunan lajur.</div>
      <div class="mu-det"><div class="erp-between"><b>Imbas singkatan daripada Jadual Guru</b><span class="erp-hint">${det.length ? det.length + " subjek belum dipadankan" : "Semua subjek dalam Jadual Guru telah dipadankan"}</span></div>
        ${det.map((d, i) => `<div class="mu-trw dt"><b>${E(d.t)}</b><span class="dim">${d.nama ? "→ " + E(d.nama) : "(nama penuh tidak dikenali)"}</span><button class="erp-btn sm solid" data-act="td-det" data-i="${i}" type="button">Tambah</button></div>`).join("")}</div></div>
  </div><div class="mu-col">
    <div class="erp-card"><h3>Skala gred</h3><div class="erp-hint">Menengah Rendah (Tingkatan 1–3): A=1 … E=5, G (gagal)=6. Menengah Atas &amp; Tingkatan 5 (SPM): A+=0 … G (gagal)=9.</div>
      <div class="mu-two2">${gr("rendah", "Menengah Rendah")}${gr("atas", "Menengah Atas / SPM")}</div>
      <div class="erp-hint">GPI = jumlah nilai gred ÷ bilangan subjek yang dikira. Gred terakhir dalam setiap skala ialah gred gagal (tidak menguasai).</div></div>
    <div class="erp-card"><h3>Peraturan keputusan</h3>
      ${fld("SKALA ATAS (SPM) BERMULA TINGKATAN", `<input class="erp-in" data-tf="pr.tktAtas" value="${A(P.tktAtas)}" inputmode="numeric">`)}
      ${fld("LULUS JIKA GPI KURANG DARIPADA — MENENGAH RENDAH", `<input class="erp-in" data-tf="pr.ambangRendah" value="${A(P.ambangRendah)}" inputmode="decimal">`)}
      ${fld("LULUS JIKA GPI KURANG DARIPADA — MENENGAH ATAS / SPM", `<input class="erp-in" data-tf="pr.ambangAtas" value="${A(P.ambangAtas)}" inputmode="decimal">`)}
      <div class="erp-hint">Nilai ambang ialah andaian — sahkan dengan peraturan sekolah. Tingkatan 4 menggunakan skala dan pengiraan SPM.</div></div>
    <div class="erp-card"><h3>Kelas dan guru kelas</h3><div class="mu-trw kl h"><span>KELAS</span><span>GURU KELAS</span><span>MURID</span></div>${kls || `<div class="erp-hint">Data murid belum dimuatkan.</div>`}<div class="erp-hint">Diambil daripada Data Murid sekolah.</div></div>
    <div class="erp-right"><button class="erp-btn" data-act="td-reset" type="button">Batal</button><button class="erp-btn solid orange" data-act="td-save" type="button">Simpan tetapan</button></div>
  </div></div>`;
}
function tdSave() {
  const T = S.td;
  const num = (v, d) => { const x = parseFloat(String(v).replace(",", ".")); return isNaN(x) ? d : x; };
  const out = C.clone(T);
  out.ujian.forEach((u) => { u.id = u.id || "UJ" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); u.tahun = Math.round(num(u.tahun, new Date().getFullYear())); u.nama = String(u.nama || "").trim(); });
  out.ujian = out.ujian.filter((u) => u.nama);
  out.subjek.forEach((s) => { s.kod = up(s.kod); s.nama = up(s.nama || s.kod); s.alias = String(s.alias || "").trim(); });
  out.subjek = out.subjek.filter((s) => s.kod);
  const kodSet = new Set(); for (const s of out.subjek) { if (kodSet.has(s.kod)) return { err: "Kod subjek berganda: " + s.kod }; kodSet.add(s.kod); }
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
    S.tab = el.dataset.t; S._ind = S._ind; render(); return;
  }
  if (a === "isi-draf") return isiSimpan(false);
  if (a === "isi-hantar") return isiSimpan(true);
  if (a === "isi-buka") { if (!(await ask("Buka semula markah ini untuk diedit oleh guru?"))) return; try { await post({ action: "bukaSemula", ujian: S.ujianId, kelas: S.kelas, subjek: S.subjek }); const r = S.marks[S.ujianId][up(S.kelas) + "|" + up(S.subjek)]; if (r) r.status = "Draf"; toast("Dibuka semula."); render(); } catch (err) { toast(err.message, true); } return; }
  if (a === "isi-paste") { const first = document.querySelector("[data-mk]"); toast("Salin lajur markah daripada Excel, klik kotak markah murid pertama dan tekan Ctrl+V."); if (first) first.focus(); return; }
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
  if (a === "td-add") { if (el.dataset.k === "uj") T.ujian.push({ id: "", nama: "", tahun: new Date().getFullYear(), tkt: [1, 2, 3, 4, 5], buka: false, mula: "", akhir: "" }); else T.subjek.push({ kod: "", nama: "", kat: "Teras", tkt: [1, 2, 3, 4, 5], aktif: true, kira: true, analisis: true, alias: "" }); S.tdDirty = true; S._keepScroll = true; render(); return; }
  if (a === "td-del") { const k = el.dataset.k === "uj" ? T.ujian : T.subjek; if (!(await ask("Padam baris ini? (Markah yang telah disimpan tidak dipadam.)"))) return; k.splice(i, 1); S.tdDirty = true; S._keepScroll = true; render(); return; }
  if (a === "td-up" && i > 0) { [T.subjek[i - 1], T.subjek[i]] = [T.subjek[i], T.subjek[i - 1]]; S.tdDirty = true; S._keepScroll = true; render(); return; }
  if (a === "td-dn" && i < T.subjek.length - 1) { [T.subjek[i + 1], T.subjek[i]] = [T.subjek[i], T.subjek[i + 1]]; S.tdDirty = true; S._keepScroll = true; render(); return; }
  if (a === "td-det") { const d = detectList()[i]; if (!d) return; const kod = d.t.length <= 8 ? up(d.t).replace(/\s+/g, "") : up(d.t).split(" ").map((w) => w[0]).join(""); T.subjek.push({ kod, nama: d.nama || up(d.t), kat: "Teras", tkt: [1, 2, 3, 4, 5], aktif: true, kira: true, analisis: true, alias: d.t.length <= 8 && d.nama ? "" : d.t }); S.tdDirty = true; S._keepScroll = true; render(); return; }
  if (a === "td-reset") { S.td = null; S.tdDirty = false; S._keepScroll = true; render(); return; }
  if (a === "td-save") {
    const r = tdSave(); if (r.err) { toast(r.err, true); return; }
    S.busy = true; toast("Menyimpan tetapan…", false, true);
    try { await post({ action: "saveTetapan", tetapan: r.out }); S.tet = C.cantum(r.out); S.tetOk = true; S.td = null; S.tdDirty = false; await loadJg(); toast("Tetapan disimpan."); }
    catch (err) { toast(err.message || String(err), true); }
    S.busy = false; render();
  }
}
function onChange(e) {
  const t = e.target, a = t.dataset.actChange, tf = t.dataset.tf, tc = t.dataset.tc;
  if (a) {
    const v = t.value; S._keepScroll = true;
    if (a === "isi-uj") { S.ujianId = v; loadMarks(v).then(() => { S.draftKey = ""; render(); }); return; }
    if (a === "isi-kelas") { S.kelas = v; S.draftKey = ""; }
    else if (a === "isi-subj") { S.subjek = v; S.draftKey = ""; }
    else if (["kls-uj", "tkt-uj", "an-uj", "slp-uj"].indexOf(a) !== -1) { S.ujianId = v; S.slip.sel = 0; S.slip.ulasan = {}; }
    else if (a === "kls-kelas" || a === "slp-kelas") { S.kelas = v; S.slip.sel = 0; S.slip.ulasan = {}; }
    else if (a === "tkt-tkt" || a === "an-tkt") { S.tkt = +v; S.scope = "ALL"; }
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
}
function tdCheck(t) {
  const T = S.td, i = +t.dataset.i, f = t.dataset.tc, on = t.checked; S.tdDirty = true;
  const tg = (arr, v) => { const s = new Set(arr || []); on ? s.add(v) : s.delete(v); return [...s].sort(); };
  if (f === "uj.buka") T.ujian[i].buka = on; else if (f === "uj.tkt") T.ujian[i].tkt = tg(T.ujian[i].tkt, +t.dataset.t);
  else if (f === "sj.tkt") T.subjek[i].tkt = tg(T.subjek[i].tkt, +t.dataset.t); else if (f === "sj.aktif") T.subjek[i].aktif = on; else if (f === "sj.kira") T.subjek[i].kira = on; else if (f === "sj.analisis") T.subjek[i].analisis = on;
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
  b += r("MENGUASAI", (a) => `<td>${a.hadir ? a.ya + " (" + pc(a.ya, a.hadir) + ")" : "0 (-)"}</td>`) + r("TIDAK MENGUASAI", (a) => `<td>${a.hadir ? a.tidak + " (" + pc(a.tidak, a.hadir) + ")" : "0 (-)"}</td>`) + r("GPMP", (a) => `<td>${f2(a.gpmp)}</td>`);
  cetakDoc(`<h2>${E(MU_SCHOOL)}</h2><h3>ANALISIS MENGIKUT MATA PELAJARAN — ${S.scope === "ALL" ? "TINGKATAN " + S.tkt : E(S.scope)} — ${E(u ? u.nama + " " + u.tahun : "")}</h3><table><thead>${th}</thead><tbody>${b}</tbody></table><h3 style="margin-top:10px">GPS: ${f2(d.gps)}</h3><div class="note">GPS = purata GPMP mata pelajaran yang dikira. * = analisis sahaja, tidak dimasukkan dalam GPS.</div>`, PR_CSS, "Analisis " + (S.scope === "ALL" ? "Tingkatan " + S.tkt : S.scope));
}
function analisisCsv() {
  const d = analisisData(), rows = [["BIL", "MATA PELAJARAN"].concat(d.subj.map((s) => s.kod))];
  rows.push(["", "BIL. HADIR"].concat(d.an.map((a) => a.hadir)), ["", "BIL. TIDAK HADIR"].concat(d.an.map((a) => a.th)));
  d.sk.forEach((x, k) => rows.push([k + 1, x.g].concat(d.an.map((a) => a.gc[k]))));
  rows.push(["", "MENGUASAI"].concat(d.an.map((a) => a.ya)), ["", "TIDAK MENGUASAI"].concat(d.an.map((a) => a.tidak)), ["", "GPMP"].concat(d.an.map((a) => (a.gpmp === null ? "" : a.gpmp.toFixed(2)))), ["", "GPS", f2(d.gps)]);
  csvDown("Analisis_" + (S.scope === "ALL" ? "Tingkatan_" + S.tkt : S.scope.replace(/\s+/g, "_")), rows);
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
    await Promise.all([loadTetapan(), loadMurid(), typeof jgFetchRecords === "function" ? jgFetchRecords(false).catch(() => {}) : null]);
    await loadJg();
    const ti = tabsAda(); if (!ti.some((x) => x[0] === S.tab)) S.tab = ti[0][0];
    const buka = S.tet.ujian.find((u) => u.buka) || S.tet.ujian[0]; S.ujianId = buka ? buka.id : "";
    if (S.ujianId) await loadMarks(S.ujianId);
    render();
  } catch (err) { root.innerHTML = `<div class="erp-empty">Ralat memuatkan Markah Ujian: ${E(err.message || err)}</div>`; }
}

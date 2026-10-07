/* ============================================================
   HARI CUTI (klien) — kalendar cuti umum + cuti sekolah
   Baca tab "Cuti" (diisi oleh butang "Kemaskini Cuti" — Admin App sahaja — yang memanggil Malaysia Calendar API
   melalui Apps Script), semakan silang dengan Event, dan bar status/kemaskini.
   Digunakan oleh: Kalendar Event, Analisis Individu (Kehadiran Staf).
   Awalan "hc" = hari cuti (BUKAN "cuti rehat" / permohonan-cuti.js).
   ============================================================ */

const HC_CACHE_MS = 5 * 60 * 1000;
const HC_JENIS_UMUM = "Cuti Umum";
const HC_JENIS_SEKOLAH = "Cuti Sekolah";
const HC_JENIS_PERAYAAN = "Cuti Perayaan KPM";
const HC_SUMBER = "malaysia-calendar-api"; // nilai lajur "Sumber" bagi baris automatik (baris manual = nilai lain)
const HC_SUMBER_LABEL = "Malaysia Calendar API";
const HC_MON = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];

let hcEntries = [];
let hcMeta = { loaded: false, ok: false, count: 0, dikemaskini: "", sebab: "", at: 0 };
let hcLoading = null;
const hcBars = [];

function hcEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function hcPad2(n) { return String(n).padStart(2, "0"); }

/* ---------------- Tarikh ---------------- */
/** Terima "Date(y,m,d)" (gviz), "yyyy-mm-dd" dan "dd/mm/yyyy" -> "yyyy-mm-dd" ("" jika tak difahami). */
function hcNormDate(v) {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  let m = s.match(/^Date\((\d+),(\d+),(\d+)/);
  if (m) return `${m[1]}-${hcPad2(+m[2] + 1)}-${hcPad2(+m[3])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${hcPad2(+m[2])}-${hcPad2(+m[1])}`;
  return "";
}
function hcAddDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** "2026-10-05" -> "05/Okt/2026" */
function hcFmtDate(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${HC_MON[+m[2] - 1]}/${m[1]}` : String(iso);
}
function hcFmtRange(e) { return e.tamat && e.tamat !== e.mula ? `${hcFmtDate(e.mula)} – ${hcFmtDate(e.tamat)}` : hcFmtDate(e.mula); }

/* ---------------- Muat tab "Cuti" ---------------- */
function hcIsTrue(v) { return /^(y|ya|yes|1|true)$/i.test(String(v == null ? "" : v).trim()); }

/** Muat (cache 5 minit). TIDAK PERNAH menolak — kegagalan dicatat dalam hcMeta dan data terakhir yang berjaya dikekalkan. */
async function hcLoad(force) {
  if (!force && hcMeta.loaded && Date.now() - hcMeta.at < HC_CACHE_MS) return hcMeta;
  if (hcLoading) return hcLoading;
  hcLoading = (async () => {
    try {
      const { cols, rows } = await gvizFetch(SPREADSHEET_ID, "Cuti");
      // gviz menyerahkan tab PERTAMA bila nama tab tak wujud — sahkan tajuk supaya data lain tak dibaca sebagai cuti
      if (!["MULA", "TAMAT", "JENIS"].every((c) => cols.includes(c))) {
        hcEntries = [];
        hcMeta = { loaded: true, ok: false, count: 0, dikemaskini: "", sebab: "tiada", at: Date.now() };
      } else {
        const out = [];
        let last = "";
        rows.forEach((r) => {
          const mula = hcNormDate(gvizCell(r, cols, "MULA"));
          if (!mula || hcIsTrue(gvizCell(r, cols, "ABAIKAN"))) return;
          let tamat = hcNormDate(gvizCell(r, cols, "TAMAT")) || mula;
          if (tamat < mula) tamat = mula;
          const sumber = String(gvizCell(r, cols, "SUMBER") || "").trim();
          const dk = String(gvizCell(r, cols, "DIKEMASKINI") || "").trim();
          if (sumber === HC_SUMBER && dk > last) last = dk;
          out.push({
            mula, tamat,
            jenis: String(gvizCell(r, cols, "JENIS") || "").trim() || "Cuti",
            nama: String(gvizCell(r, cols, "NAMA") || "").trim(),
            skop: String(gvizCell(r, cols, "SKOP") || "").trim(),
            catatan: String(gvizCell(r, cols, "CATATAN") || "").trim(),
            sumber,
          });
        });
        hcEntries = out;
        hcMeta = { loaded: true, ok: true, count: out.length, dikemaskini: last, sebab: "", at: Date.now() };
      }
    } catch (e) {
      hcMeta = Object.assign({}, hcMeta, { loaded: true, ok: false, sebab: "ralat", at: 0 }); // hcEntries lama dikekalkan; at=0 -> kegagalan TIDAK dicache (panggilan seterusnya cuba lagi)
    }
    hcRefreshBars();
    return hcMeta;
  })();
  try { return await hcLoading; } finally { hcLoading = null; }
}

/* ---------------- Pemetaan hari ---------------- */
/** Map "yyyy-mm-dd" -> [entri cuti] bagi tempoh [fromIso, toIso] (julat panjang dikembangkan; had 400 hari setiap entri). */
function hcDayMap(fromIso, toIso, entries) {
  entries = entries || hcEntries;
  const map = new Map();
  entries.forEach((e) => {
    const a = e.mula < fromIso ? fromIso : e.mula;
    const b = e.tamat > toIso ? toIso : e.tamat;
    if (a > b) return;
    let k = a;
    for (let i = 0; i < 400 && k <= b; i++, k = hcAddDays(k, 1)) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
  });
  return map;
}
function hcIsSekolah(e) { return e.jenis === HC_JENIS_SEKOLAH || e.jenis === HC_JENIS_PERAYAAN; }
/** Cuti sekolah / perayaan KPM hanya terpakai untuk GURU; cuti umum (dan entri manual lain) untuk semua. */
function hcApplies(e, guru) { return hcIsSekolah(e) ? !!guru : true; }

/* ---------------- Semakan silang Event <-> Cuti ---------------- */
/**
 * events: [{tajuk, unit, tarikhDari, tarikhHingga}]
 * Pulang { bertindih:[{event, tarikh:[...], cuti:[{nama,jenis,skop}], tahap:"umum"|"sekolah"}], tiadaPadanan:[{event}] }
 *  - bertindih: event yang jatuh (sebahagian/seluruh) pada hari cuti. "umum" = ada cuti umum (patut diberi perhatian);
 *    "sekolah" = hanya cuti sekolah/perayaan KPM (lazim untuk kem/program — maklumat sahaja).
 *  - tiadaPadanan: event yang tajuknya mengandungi "cuti" tetapi tiada cuti dalam data pada tarikh itu.
 */
function hcCrossCheck(events, entries) {
  entries = entries || hcEntries;
  const res = { bertindih: [], tiadaPadanan: [] };
  if (!entries.length) return res;
  (events || []).forEach((ev) => {
    const from = ev.tarikhDari;
    let to = ev.tarikhHingga || ev.tarikhDari;
    if (!from) return;
    if (to < from) to = from;
    const map = hcDayMap(from, to, entries);
    if (map.size) {
      const tarikh = [...map.keys()].sort();
      const seen = {};
      const cuti = [];
      tarikh.forEach((k) => map.get(k).forEach((c) => { const id = c.jenis + "|" + c.nama; if (!seen[id]) { seen[id] = 1; cuti.push({ nama: c.nama, jenis: c.jenis, skop: c.skop }); } }));
      const tahap = cuti.some((c) => c.jenis !== HC_JENIS_SEKOLAH && c.jenis !== HC_JENIS_PERAYAAN) ? "umum" : "sekolah";
      res.bertindih.push({ event: ev, tarikh, cuti, tahap });
    } else if (/\bcuti\b/i.test(ev.tajuk || "")) {
      res.tiadaPadanan.push({ event: ev });
    }
  });
  res.bertindih.sort((a, b) => a.tarikh[0].localeCompare(b.tarikh[0]));
  return res;
}

/* ---------------- Admin App ---------------- */
function hcIsAdminApp(user) { return !!user && String(user.role3 || "").trim().toLowerCase() === "admin app"; }

/** Minta pelayan mengemas kini tab Cuti. Pelayan SENDIRI mengesahkan Admin App (semakan di sini hanya untuk paparan butang). */
async function hcRunUpdate(user) {
  const data = await postToAppsScript(API_URL, { action: "kemaskiniCuti", callerEmail: user && user.email });
  // postToAppsScript memulangkan {success:true,_fallbackParse:true} bila respons BUKAN JSON — itu bukan kejayaan sebenar
  if (!data || data._fallbackParse || data.success !== true) throw new Error((data && data.message) || "Respons pelayan tidak sah (bukan JSON).");
  await hcLoad(true);
  return data;
}

/* ---------------- Bar status & butang kemaskini ---------------- */
function hcFmtStamp(s) { // "2026-10-28 10:00" -> "28/Okt/2026 10:00"
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}))?/);
  return m ? `${hcFmtDate(`${m[1]}-${m[2]}-${m[3]}`)}${m[4] ? " " + m[4] : ""}` : String(s);
}
function hcBarInfoHtml(admin) {
  const m = hcMeta;
  if (!m.loaded) return "Memuatkan data cuti...";
  if (!hcEntries.length) {
    return m.sebab === "ralat"
      ? `<span class="hc-warn">Data cuti gagal dimuat.</span>`
      : `Data cuti belum ada${admin ? " — tekan <b>Kemaskini Cuti</b>." : ". Admin App perlu mengemas kini."}`;
  }
  return `Kalendar cuti: <b>${m.count}</b> rekod${m.dikemaskini ? ` · dikemaskini ${hcEsc(hcFmtStamp(m.dikemaskini))}` : ""} · sumber ${HC_SUMBER_LABEL}` +
    (m.ok ? "" : ` · <span class="hc-warn">gagal menyegarkan, data terakhir dipaparkan</span>`);
}
function hcResultHtml(r) {
  if (!r) return "";
  if (!r.ok) return `<div class="hc-result hc-result-err">❌ ${hcEsc(r.message)}<br><small>Data sedia ada tidak diubah.</small></div>`;
  const d = r.data, b = d.bilangan || {};
  const am = (d.amaran || []);
  const shown = am.slice(0, 6).map((w) => `<li>${hcEsc(w)}</li>`).join("") + (am.length > 6 ? `<li>…dan ${am.length - 6} lagi</li>` : "");
  return `<div class="hc-result hc-result-ok">✅ Dikemaskini (${(d.tahun || []).join(", ")}): <b>${b.umum || 0}</b> cuti umum, <b>${b.sekolah || 0}</b> cuti sekolah, <b>${b.perayaan || 0}</b> cuti perayaan KPM` +
    `${d.baris && d.baris.manual ? ` · ${d.baris.manual} baris manual dikekalkan` : ""}.` +
    `${am.length ? `<ul class="hc-warns">${shown}</ul>` : ""}` +
    `<small>Sumber: ${HC_SUMBER_LABEL} (projek terbuka pihak ketiga; warta JPM & takwim KPM). Cuti ganti bagi cuti yang jatuh pada hari Ahad mungkin tiada — tambah baris manual dalam tab Cuti jika perlu.</small></div>`;
}
function hcRenderBarInto(bar) {
  const admin = hcIsAdminApp(bar.user);
  bar.el.innerHTML = `<div class="hc-bar"><div class="hc-bar-info">${hcBarInfoHtml(admin)}</div>` +
    (admin ? `<button type="button" class="hc-btn" data-hc-update>Kemaskini Cuti</button>` : "") + `</div>` + hcResultHtml(bar.result);
}
async function hcOnUpdateClick(bar) {
  const btn = bar.el.querySelector("[data-hc-update]");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = "Mengambil data cuti...";
  try {
    const data = await hcRunUpdate(bar.user);
    bar.result = { ok: true, data };
    if (bar.onUpdated) { try { await bar.onUpdated(data); } catch (e) { console.error("hc onUpdated:", e); } }
  } catch (err) {
    bar.result = { ok: false, message: (err && err.message) || String(err) };
  }
  hcRenderBarInto(bar);
}
/** Pasang bar status dalam elemen `el`. Butang "Kemaskini Cuti" HANYA dirender untuk Admin App (bukan sekadar disembunyikan). */
function hcRenderBar(el, user, onUpdated) {
  if (!el) return null;
  const bar = { el, user, onUpdated, result: null };
  hcBars.push(bar);
  el.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-hc-update]")) hcOnUpdateClick(bar); });
  hcRenderBarInto(bar);
  return bar;
}
function hcRefreshBars() { hcBars.forEach((b) => { const busy = b.el.querySelector("[data-hc-update]:disabled"); if (!busy) hcRenderBarInto(b); }); }

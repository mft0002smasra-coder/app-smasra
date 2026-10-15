/* ============================================================
   JADUAL GURU GANTI — kod KONGSI (halaman Jadual Guru Ganti + kad "Jadual Waktu Saya" di Home)
     1. Pembaca PDF (pdf.js) -> baris jadual   : ggParsePdfFile / ggParseItems
     2. Padanan nama guru ganti dengan pengguna : ggMatchName
     3. Baca data dari Apps Script              : ggFetch
   PDF dihasilkan dari Excel "JADUAL GURU GANTI": BIL | GURU TIDAK HADIR | MULA | TAMAT | KELAS | SUBJEK | GURU GANTI | TANDATANGAN.
   Sel bercantum (cth satu guru tidak hadir dengan 2 slot & 2 guru ganti) dikendalikan.
   ============================================================ */

const GG_PDFJS_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
];
const GG_PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const GG_HARI = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const GG_BULAN_PENDEK = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
const GG_BULAN_NAMA = ["JANUARI", "FEBRUARI", "MAC", "APRIL", "MEI", "JUN", "JULAI", "OGOS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DISEMBER"];

function ggEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function ggPad(n) { return String(n).padStart(2, "0"); }
function ggIsoToLabel(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymd || "");
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${GG_HARI[d.getUTCDay()]}, ${m[3]}/${GG_BULAN_PENDEK[+m[2] - 1]}/${m[1]}`;
}
function ggTodayIso() { const d = new Date(); return `${d.getFullYear()}-${ggPad(d.getMonth() + 1)}-${ggPad(d.getDate())}`; }

/* ---------------- Masa ---------------- */
/** "12:30 TGH" -> "12:30", "1:10 PTG" -> "13:10", "10:30 PG" -> "10:30". Tiada penanda: jam 1-6 dianggap petang. */
function ggTo24(text) {
  const m = String(text || "").match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*(PG|PTG|TGH|AM|PM)?/i);
  if (!m) return "";
  let h = +m[1]; const min = m[2], suf = (m[3] || "").toUpperCase();
  if (h > 23 || +min > 59) return "";
  if (suf === "PTG" || suf === "PM") { if (h < 12) h += 12; }
  else if (suf === "PG" || suf === "AM") { if (h === 12 && suf === "AM") h = 0; }
  else if (!suf && h >= 1 && h <= 6) h += 12;
  return `${ggPad(h)}:${min}`;
}
function ggMinutes(hm) { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; }
/** "13:10" -> "1:10 PTG" (paparan ringkas gaya sekolah) */
function ggFmtMasa(hm) {
  const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return String(hm || "");
  const h = +m[1];
  const suf = h >= 13 ? "PTG" : (h === 12 ? "TGH" : "PG");
  return `${h > 12 ? h - 12 : h}:${m[2]} ${suf}`;
}

/** "13:10" -> "1:10" (gaya kad Jadual Waktu Saya: 12 jam tanpa penanda) */
function ggFmtShort(hm) {
  const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return String(hm || "");
  const h = +m[1];
  return `${h > 12 ? h - 12 : (h === 0 ? 12 : h)}:${m[2]}`;
}

/* ---------------- Pembaca PDF ---------------- */
/** Gabungkan serpihan teks pada baris yang sama menjadi satu sel. items: [{str,x,y,w}] */
function ggMergeCells(items) {
  const arr = items.filter((i) => String(i.str).trim() !== "").map((i) => ({ str: String(i.str), x: i.x, y: i.y, w: i.w || 0 }));
  arr.sort((a, b) => (Math.abs(a.y - b.y) > 2.5 ? b.y - a.y : a.x - b.x));
  const out = [];
  arr.forEach((it) => {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2.5 && it.x - (last.x + last.w) < 4 && it.x >= last.x) {
      const gap = it.x - (last.x + last.w);
      last.str += (gap > 0.8 || /\S$/.test(last.str) && /^\S/.test(it.str) && gap > 0.3 ? " " : "") + it.str;
      last.w = it.x + it.w - last.x;
    } else out.push({ str: it.str, x: it.x, y: it.y, w: it.w });
  });
  out.forEach((c) => { c.str = c.str.replace(/\s+/g, " ").trim(); c.cx = c.x + c.w / 2; });
  return out.filter((c) => c.str);
}

const GG_COLS = [
  { key: "bil", re: /^BIL$/i }, { key: "tidakHadir", re: /GURU\s*TIDAK\s*HADIR/i }, { key: "mula", re: /^MULA$/i },
  { key: "tamat", re: /^TAMAT$/i }, { key: "kelas", re: /^KELAS$/i }, { key: "subjek", re: /^SUBJEK$/i },
  { key: "ganti", re: /GURU\s*GANTI/i }, { key: "tandatangan", re: /TANDATANGAN/i },
];

function ggParseDateFromText(text) {
  let m = String(text).match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(20\d{2})/);
  if (m) return `${m[3]}-${ggPad(+m[2])}-${ggPad(+m[1])}`;
  m = String(text).toUpperCase().match(/(\d{1,2})\s*[-\s]?\s*(JANUARI|FEBRUARI|MAC|APRIL|MEI|JUN|JULAI|OGOS|SEPTEMBER|OKTOBER|NOVEMBER|DISEMBER|JAN|FEB|APR|OGO|SEP|OKT|NOV|DIS)[A-Z]*\s*[-\s]?\s*(20\d{2})/);
  if (m) {
    const idx = GG_BULAN_NAMA.findIndex((n) => n.startsWith(m[2].slice(0, 3)) && (m[2].length >= 3));
    if (idx >= 0) return `${m[3]}-${ggPad(idx + 1)}-${ggPad(+m[1])}`;
  }
  return "";
}

/**
 * Urai item teks satu halaman PDF. items: [{str,x,y,w}] (y: PDF, makin besar makin ATAS).
 * Pulang { tarikh, hari, rows:[{bil,guruTidakHadir,mula,tamat,kelas,subjek,guruGanti}], warnings:[] }
 */
function ggParseItems(items, fileName) {
  const warnings = [];
  const cells = ggMergeCells(items);
  // --- pengepala jadual ---
  // Baris pengepala ditentukan oleh "GURU TIDAK HADIR" (unik) — tajuk "JADUAL GURU GANTI" di atas tidak boleh dikelirukan dengan lajur
  const anchor = cells.find((c) => /GURU\s*TIDAK\s*HADIR/i.test(c.str));
  const header = {};
  if (anchor) cells.forEach((c) => {
    if (Math.abs(c.y - anchor.y) > 3) return;
    GG_COLS.forEach((col) => { if (!header[col.key] && col.re.test(c.str)) header[col.key] = c; });
  });
  const need = ["tidakHadir", "mula", "tamat", "ganti"];
  const miss = need.filter((k) => !header[k]);
  if (miss.length) return { tarikh: "", hari: "", rows: [], warnings: ["Pengepala jadual tidak dikenali — pastikan ini PDF 'Jadual Guru Ganti' (lajur: Guru Tidak Hadir, Mula, Tamat, Kelas, Subjek, Guru Ganti)."] };
  const hy = header.tidakHadir.y;
  // --- sempadan lajur: titik tengah antara pusat pengepala bersebelahan ---
  const cols = GG_COLS.filter((c) => header[c.key]).map((c) => ({ key: c.key, cx: header[c.key].cx })).sort((a, b) => a.cx - b.cx);
  const colOf = (cx) => {
    let best = cols[0], bd = Infinity;
    cols.forEach((c, i) => {
      const lo = i === 0 ? -Infinity : (cols[i - 1].cx + c.cx) / 2, hi = i === cols.length - 1 ? Infinity : (c.cx + cols[i + 1].cx) / 2;
      if (cx >= lo && cx < hi) { best = c; bd = 0; }
    });
    return best.key;
  };
  // --- tarikh & hari (di atas pengepala) ---
  const top = cells.filter((c) => c.y >= hy - 2);
  let tarikh = "", hari = "";
  for (const c of top) { const t = ggParseDateFromText(c.str); if (t) { tarikh = t; break; } }
  if (!tarikh && fileName) tarikh = ggParseDateFromText(fileName);
  for (const c of top) { const m = c.str.toUpperCase().match(/\b(AHAD|ISNIN|SELASA|RABU|KHAMIS|JUMAAT|SABTU)\b/); if (m) { hari = m[1][0] + m[1].slice(1).toLowerCase(); break; } }
  if (!tarikh) warnings.push("Tarikh tidak dapat dikesan daripada PDF — sila isi tarikh secara manual.");
  // --- sel data ---
  const data = cells.filter((c) => c.y < hy - 2).map((c) => Object.assign({}, c, { col: colOf(c.cx) }));
  const mulaCells = data.filter((c) => c.col === "mula" && ggTo24(c.str)).sort((a, b) => b.y - a.y);
  if (!mulaCells.length) return { tarikh, hari, rows: [], warnings: warnings.concat(["Tiada baris dengan masa 'Mula' dikesan."]) };
  const tamatCells = data.filter((c) => c.col === "tamat" && ggTo24(c.str));
  const slots = mulaCells.map((mc) => {
    let tm = null, bd = Infinity;
    tamatCells.forEach((t) => { const d = Math.abs(t.y - mc.y); if (d < bd) { bd = d; tm = t; } });
    return { y: mc.y, mula: ggTo24(mc.str), tamat: tm && bd < 12 ? ggTo24(tm.str) : "" };
  });
  const bottom = slots[slots.length - 1].y - 30; // had bawah jadual (abaikan nota/kaki halaman)
  const inTable = data.filter((c) => c.y >= bottom);
  // --- kumpulan BIL (sel bercantum: satu BIL boleh merangkumi beberapa slot) ---
  const bilCells = inTable.filter((c) => c.col === "bil" && /^\d+$/.test(c.str)).sort((a, b) => b.y - a.y);
  const groups = (bilCells.length ? bilCells : [{ str: "1", y: slots[0].y }]).map((b, i, arr) => ({
    bil: b.str, y: b.y,
    hi: i === 0 ? Infinity : (arr[i - 1].y + b.y) / 2,
    lo: i === arr.length - 1 ? -Infinity : (b.y + arr[i + 1].y) / 2,
  }));
  const textIn = (col, hi, lo) => {
    const cs = inTable.filter((c) => c.col === col && c.y < hi && c.y >= lo).sort((a, b) => (Math.abs(a.y - b.y) > 2.5 ? b.y - a.y : a.x - b.x));
    return cs.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim();
  };
  groups.forEach((g) => {
    g.guru = textIn("tidakHadir", g.hi, g.lo);
    g.kelas = textIn("kelas", g.hi, g.lo);
    g.subjek = textIn("subjek", g.hi, g.lo);
  });
  const groupOf = (y) => groups.find((g) => y < g.hi && y >= g.lo) || groups[0];
  // --- guru ganti: jalur antara titik tengah slot bersebelahan ---
  const rows = slots.map((s, i) => {
    const hi = i === 0 ? Infinity : (slots[i - 1].y + s.y) / 2;
    const lo = i === slots.length - 1 ? bottom : (s.y + slots[i + 1].y) / 2;
    const g = groupOf(s.y);
    const ganti = textIn("ganti", hi, lo);
    if (!ganti) warnings.push(`Slot ${ggFmtMasa(s.mula)} (${g.guru || "?"}): nama guru ganti tidak dikesan.`);
    if (!s.tamat) warnings.push(`Slot ${ggFmtMasa(s.mula)}: masa tamat tidak dikesan.`);
    return { bil: g.bil, guruTidakHadir: g.guru, mula: s.mula, tamat: s.tamat, kelas: g.kelas, subjek: g.subjek, guruGanti: ganti };
  });
  return { tarikh, hari, rows, warnings };
}

let ggPdfReady = false;
function ggLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("gagal " + src));
    document.head.appendChild(s);
  });
}
async function ggEnsurePdfLib() {
  if (ggPdfReady || typeof pdfjsLib !== "undefined") { ggPdfReady = true; }
  else {
    for (const u of GG_PDFJS_URLS) { try { await ggLoadScript(u); if (typeof pdfjsLib !== "undefined") { ggPdfReady = true; break; } } catch (e) { /* cuba CDN lain */ } }
  }
  if (!ggPdfReady) throw new Error("Pustaka baca PDF tidak dapat dimuatkan (semak sambungan internet).");
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = GG_PDFJS_WORKER; } catch (e) { /* abaikan */ }
}
/** Baca fail PDF (File) -> hasil ggParseItems. Hanya halaman pertama dibaca. */
async function ggParsePdfFile(file) {
  await ggEnsurePdfLib();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const tc = await page.getTextContent();
  const items = tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }));
  return ggParseItems(items, file.name);
}

/* ---------------- Padanan nama ---------------- */
function ggNormName(s) {
  let t = String(s || "").toUpperCase().replace(/[.,'’`]/g, " ").replace(/\s+/g, " ").trim();
  const titles = /^(DR|PN|PUAN|EN|ENCIK|CIK|HJ|HJH|TS|PROF|USTAZ|USTAZAH|TN|TUAN)\s+/;
  while (titles.test(t)) t = t.replace(titles, "");
  t = t.replace(/\bB\b/g, "BIN").replace(/\bBTE\b/g, "BINTI").replace(/\bBT\b/g, "BINTI");
  return t.replace(/\s+/g, " ").trim();
}
function ggLev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
  return d[m][n];
}
/** Nama guru ganti dalam PDF sepadan dengan pengguna? Sama tepat (selepas BIN/BINTI/gelaran) ATAU sangat hampir (>=90%, salah eja kecil). */
function ggMatchName(userName, gantiName) {
  const a = ggNormName(userName), b = ggNormName(gantiName);
  if (!a || !b) return false;
  if (a === b) return true;
  const max = Math.max(a.length, b.length);
  return 1 - ggLev(a, b) / max >= 0.9;
}

/* ---------------- Baca data (Apps Script) ---------------- */
let ggCache = { ts: 0, data: null };
/** Pulang semua rekod [{tarikh,bil,guruTidakHadir,mula,tamat,kelas,subjek,guruGanti}]; tarikh (pilihan) = hanya hari itu. */
async function ggFetch(tarikh, force) {
  if (typeof apiConfigured === "function" && !apiConfigured()) return [];
  if (!tarikh && !force && ggCache.data && Date.now() - ggCache.ts < 60000) return ggCache.data;
  const key = "gg_cache_" + (tarikh || "all");
  if (!force) {
    try { const c = JSON.parse(sessionStorage.getItem(key) || "null"); if (c && Date.now() - c.ts < 60000) return c.data; } catch (e) { /* abaikan */ }
  }
  const res = await fetch(`${API_URL}?action=getGuruGanti${tarikh ? "&tarikh=" + encodeURIComponent(tarikh) : ""}`, { cache: "no-store" });
  const json = await res.json();
  const data = Array.isArray(json) ? json : (json && Array.isArray(json.data) ? json.data : []);
  if (!tarikh) ggCache = { ts: Date.now(), data };
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (e) { /* abaikan */ }
  return data;
}
/** Slot relief untuk pengguna pada tarikh (ISO). Pulang [{mula,tamat,kelas,subjek,guruTidakHadir}] — tidak pernah baling ralat. */
async function ggReliefForUser(user, ymd) {
  try {
    const rows = await ggFetch(ymd);
    return rows.filter((r) => r.tarikh === ymd && ggMatchName(user.nama, r.guruGanti))
      .map((r) => ({ mula: r.mula, tamat: r.tamat, kelas: r.kelas, subjek: r.subjek, guruTidakHadir: r.guruTidakHadir }))
      .sort((a, b) => (ggMinutes(a.mula) || 0) - (ggMinutes(b.mula) || 0));
  } catch (e) { return []; }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ggFmtShort, ggParseItems, ggTo24, ggFmtMasa, ggMatchName, ggMergeCells, ggParseDateFromText, ggNormName };
}

/* ============================================================
   ENROLMEN MURID (kongsi) — satu sumber untuk Borang Kehadiran DAN Analisis Kehadiran Murid.
   Membaca tab "DatabaseMurid" (data murid yang dimuat naik Guru Data Murid) dan menyediakan:
   senarai kelas + bilangan, senarai murid setiap kelas.
   Awalan "em" = enrolmen.
   Perlindungan:
   - Tajuk lajur NAMA & KELAS WAJIB dijumpai (tiada teka kedudukan lajur). gviz menyerahkan tab PERTAMA bila nama tab
     tak wujud, jadi tajuk disemak supaya data lain tak dibaca sebagai murid.
   - Murid PENDUA dibuang (KP sama + nama sama; tanpa KP: nama + kelas). Data murid lama mungkin berganda akibat
     pepijat muat naik terdahulu — tanpa ini kelas 30 murid akan dikira 60.
   - Bila muat semula GAGAL, senarai terakhir yang berjaya dikekalkan.
   ============================================================ */

const EM_SHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo"; // sama Spreadsheet Data Murid

let emStudents = [];   // { nama, kelas } — selepas pendua dibuang
let emMeta = { loaded: false, ok: false, count: 0, dup: 0, sebab: "" };
let emInflight = null;

function emNormHeader(h) { return String(h == null ? "" : h).trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function emNormKelas(k) { return String(k == null ? "" : k).trim().replace(/\s+/g, " ").toUpperCase(); }
function emTingkatan(kelas) { const m = String(kelas || "").match(/\d+/); return m ? parseInt(m[0], 10) : 99; }
function emCompareKelas(a, b) {
  const ta = emTingkatan(a), tb = emTingkatan(b);
  return ta !== tb ? ta - tb : String(a).localeCompare(String(b), "ms", { numeric: true });
}

/** Muat daripada Sheet. TIDAK PERNAH menolak — kegagalan dicatat dalam emMeta (senarai lama dikekalkan). */
async function emLoad() {
  if (emInflight) return emInflight; // permintaan serentak berkongsi satu fetch
  emInflight = (async () => {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${EM_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("DatabaseMurid")}&headers=1&_ts=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      const table = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)).table;
      const cols = (table && table.cols) || [];
      let namaIdx = -1, kelasIdx = -1, kpIdx = -1;
      cols.forEach((col, i) => {
        const h = emNormHeader(col.label);
        if ((h === "NAMA" || h === "NAMA MURID") && namaIdx === -1) namaIdx = i;
        if (h === "KELAS" && kelasIdx === -1) kelasIdx = i;
        if (h === "NO PENGENALAN" && kpIdx === -1) kpIdx = i;
      });
      if (namaIdx === -1 || kelasIdx === -1) {
        emMeta = Object.assign({}, emMeta, { loaded: true, ok: false, sebab: "tajuk" }); // jangan teka lajur
        return emMeta;
      }
      const cell = (c, i) => (i >= 0 && c[i] && c[i].v != null ? String(c[i].v).trim() : "");
      const seen = new Set();
      const out = [];
      let dup = 0;
      (table.rows || []).forEach((r) => {
        const c = r.c || [];
        const nama = cell(c, namaIdx), kelas = cell(c, kelasIdx);
        if (!nama || !kelas) return;
        const kp = cell(c, kpIdx).toUpperCase().replace(/[^A-Z0-9]/g, "");
        const namaKey = nama.toUpperCase().replace(/\s+/g, " ");
        const key = kp ? kp + "|" + namaKey : "-|" + namaKey + "|" + emNormKelas(kelas);
        if (seen.has(key)) { dup++; return; }
        seen.add(key);
        out.push({ nama, kelas });
      });
      emStudents = out;
      emMeta = { loaded: true, ok: true, count: out.length, dup, sebab: "" };
    } catch (e) {
      emMeta = Object.assign({}, emMeta, { loaded: true, ok: false, sebab: "ralat" }); // emStudents lama dikekalkan
    }
    return emMeta;
  })();
  try { return await emInflight; } finally { emInflight = null; }
}

/** [{ nama, bilangan }] — disusun ikut tingkatan kemudian nama. Ejaan kelas = ejaan pertama dalam data murid. */
function emClasses() {
  const m = new Map();
  emStudents.forEach((s) => {
    const k = emNormKelas(s.kelas);
    if (!m.has(k)) m.set(k, { nama: s.kelas, bilangan: 0 });
    m.get(k).bilangan++;
  });
  return Array.from(m.values()).sort((a, b) => emCompareKelas(a.nama, b.nama));
}
function emStudentsIn(kelas) {
  const k = emNormKelas(kelas);
  return emStudents.filter((s) => emNormKelas(s.kelas) === k).sort((a, b) => a.nama.localeCompare(b.nama));
}
function emCount(kelas) { return emStudentsIn(kelas).length; }
/** Ejaan kelas yang SAMA dengan data murid (abaikan huruf besar/kecil & ruang); kalau tiada dalam enrolmen, pulangkan asal. */
function emCanonKelas(kelas) {
  const k = emNormKelas(kelas);
  const f = emStudents.find((s) => emNormKelas(s.kelas) === k);
  return f ? f.kelas : String(kelas == null ? "" : kelas).trim();
}

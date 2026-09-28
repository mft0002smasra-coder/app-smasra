/* ============================================================
   ANALISIS e-RPH — 3 tab:
     1. Penghantaran  : prestasi keseluruhan (radar, kadar hantar/semak, status)
     2. Prestasi Saya : prestasi e-RPH pengguna log masuk
     3. Semakan Saya  : analisis semakan oleh pengguna — Pentadbir sahaja
   Data dibaca terus (gviz) dari Sheet "DATA PENGHANTARAN":
     tab "DATA eRPH"    A=NAMA C=TARIKH HANTAR G=MINGGU H=TARIKH AWAL MINGGU
                        J=TARIKH AKHIR MINGGU M=TARIKH HANTAR eRPH2
     tab "DATA SEMAKAN" A=NAMA PEGAWAI B=MINGGU C=TARIKH D=PENYEMAK E=STATUS SEMINGGU
   Formula pengiraan diambil daripada dashboard e-RPH asal (eRph.txt).
   ============================================================ */

const ER_SHEET_ID = "1l9YS_m19yIzhz6gy0MgAIoNSM0huXAWa95YdZJxuQZU";
const ER_SHEET_ERPH = "DATA eRPH";
const ER_SHEET_SEMAKAN = "DATA SEMAKAN";

// Jawatan yang dianggap Pentadbir (tab "Semakan Saya"). Padanan: jawatan bermula dengan
// mana-mana kata kunci di bawah. Tambah/buang di sini kalau perlu.
const ER_PENTADBIR_KEYWORDS = ["PENGETUA", "PK ", "GKMP", "GKPM"];

const ER_MONTHS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
const ER_MON_SHORT = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
const ER_STATUS_KEYWORDS = {
  selesai: ["selesai", "complete", "done"],
  proses: ["dalam proses", "proses", "progress"],
  belumSiap: ["belum siap", "belum lengkap", "tidak lengkap", "tergendala"],
};

let erUser = null;
let ER = { erph: [], sem: [] };
let erF = { tahun: "", bulan: "__ALL__", minggu: "__ALL__" };
let erTab = "hantar";
let erLast = null; // hasil pengiraan terkini — dipakai popup senarai

/* ================= Utiliti ================= */
function erEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function erNum(s) { const m = String(s).match(/\d+/); return m ? parseInt(m[0], 10) : 0; }
function erWeek(t) { const m = String(t || "").match(/\d+/); return m ? String(parseInt(m[0], 10)) : String(t || "").trim(); }
function erFmtDate(d) {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${ER_MON_SHORT[d.getMonth()]}/${d.getFullYear()}`;
}
/** Samakan nama untuk padanan: huruf besar, buang tanda baca & gelaran (DR, PN, EN...). */
function erNormName(s) {
  let t = String(s || "").toUpperCase().replace(/[.,'’`]/g, " ").replace(/\s+/g, " ").trim();
  const titles = /^(DR|PN|PUAN|EN|ENCIK|CIK|HJ|HJH|TS|PROF|USTAZ|USTAZAH|TN|TUAN)\s+/;
  while (titles.test(t)) t = t.replace(titles, "");
  return t;
}
function erNormStatus(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return null;
  for (const key of Object.keys(ER_STATUS_KEYWORDS)) {
    if (ER_STATUS_KEYWORDS[key].some((kw) => t.includes(kw))) return key;
  }
  return "lain";
}
function erIsPentadbir(user) {
  if (String(user.role3 || "").trim().toLowerCase() === "admin app") return true;
  const j = String(user.jawatan || "").trim().toUpperCase();
  return j === "PK" || ER_PENTADBIR_KEYWORDS.some((k) => j.startsWith(k));
}

/* ================= Baca & urai data (gviz JSON) ================= */
async function erFetchSheet(name) {
  const url = `https://docs.google.com/spreadsheets/d/${ER_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}&headers=1&_ts=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(jsonStr);
  if (parsed.status === "error") throw new Error("Sheet '" + name + "' tidak dapat dibaca");
  return (parsed.table && parsed.table.rows) || [];
}
function erCell(row, i) { return row && row.c && row.c[i] ? row.c[i] : null; }
function erText(row, i) {
  const c = erCell(row, i);
  if (!c || c.v === null || c.v === undefined) return "";
  const s = c.f !== undefined && c.f !== null && c.f !== "" ? c.f : c.v;
  return String(s).trim();
}
/** Sel tarikh gviz datang sebagai "Date(2026,0,16)" (bulan 0-berasaskan). */
function erDate(row, i) {
  const c = erCell(row, i);
  if (!c || c.v === null || c.v === undefined) return null;
  const raw = c.v;
  if (typeof raw === "string") {
    const m = raw.match(/^Date\((\d+),(\d+),(\d+)/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
    const m2 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // M/D/YYYY (paparan Sheet)
    if (m2) return new Date(parseInt(m2[3], 10), parseInt(m2[1], 10) - 1, parseInt(m2[2], 10));
  }
  return null;
}
function erYearFromRow(row, idxs) {
  for (const i of idxs) {
    const d = erDate(row, i);
    if (d) return d.getFullYear();
    const m = erText(row, i).match(/\b(20\d{2})\b/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function erBuild(rawErph, rawSem) {
  const erph = [];
  rawErph.forEach((r) => {
    const nama = erText(r, 0);
    const minggu = erWeek(erText(r, 6));
    if (!nama || !minggu) return;
    const tahun = erYearFromRow(r, [7, 2, 12, 9]);
    if (!tahun) return;
    erph.push({
      nama, key: erNormName(nama), minggu, tahun,
      submitted: !!(erText(r, 2) || erText(r, 12)), // ada Tarikh Hantar ATAU Tarikh Hantar eRPH2
      tarikh: erDate(r, 12) || erDate(r, 2),
      awal: erDate(r, 7),
    });
  });
  const weekYears = new Set(erph.map((r) => `${r.tahun}|${r.minggu}`));
  const sem = [];
  rawSem.forEach((r, order) => {
    const nama = erText(r, 0);
    const minggu = erWeek(erText(r, 1));
    if (!nama || !minggu) return;
    let tahun = erYearFromRow(r, [2]);
    if (!tahun) return;
    // Minggu akhir tahun lepas boleh disemak selepas 1 Jan — kaitkan dengan tahun e-RPH sebenar
    if (!weekYears.has(`${tahun}|${minggu}`) && weekYears.has(`${tahun - 1}|${minggu}`)) tahun -= 1;
    const penyemak = erText(r, 3);
    sem.push({
      nama, key: erNormName(nama), minggu, tahun, order,
      tarikh: erDate(r, 2), penyemak, penyemakKey: erNormName(penyemak),
      status: erNormStatus(erText(r, 4)), statusText: erText(r, 4),
    });
  });
  return { erph, sem };
}

/* ================= Pengiraan ================= */
function erTime(r) { return r.tarikh ? r.tarikh.getTime() : 0; }
const erInYear = (tahun) => (r) => String(r.tahun) === String(tahun);

function erWeeksFor(tahun, bulan, minggu) {
  const inYear = ER.erph.filter(erInYear(tahun));
  const all = [...new Set(inYear.map((r) => r.minggu))].sort((a, b) => erNum(a) - erNum(b));
  const monthOf = {};
  inYear.forEach((r) => {
    if (monthOf[r.minggu] === undefined) {
      const d = r.awal || r.tarikh;
      if (d) monthOf[r.minggu] = d.getMonth() + 1;
    }
  });
  let weeks = all;
  if (bulan !== "__ALL__") weeks = weeks.filter((w) => String(monthOf[w]) === String(bulan));
  if (minggu !== "__ALL__") weeks = weeks.filter((w) => w === minggu);
  return { all, weeks, monthOf };
}
/** nama+minggu -> rekod e-RPH dihantar (tarikh terkini) */
function erSubmittedMap(tahun) {
  const map = new Map();
  ER.erph.filter(erInYear(tahun)).forEach((r) => {
    if (!r.submitted) return;
    const k = r.key + "|" + r.minggu;
    const prev = map.get(k);
    if (!prev || (r.tarikh && (!prev.tarikh || r.tarikh > prev.tarikh))) map.set(k, r);
  });
  return map;
}
/** nama+minggu -> rekod semakan TERKINI (kalau disemak berulang, yang terkini menang) */
function erEffectiveSem(tahun, filterFn) {
  const map = new Map();
  ER.sem.filter(erInYear(tahun)).forEach((r) => {
    if (filterFn && !filterFn(r)) return;
    const k = r.key + "|" + r.minggu;
    const prev = map.get(k);
    if (!prev || erTime(r) >= erTime(prev)) map.set(k, r);
  });
  return map;
}
/** Senarai guru = semua nama yang muncul dalam data tahun itu (tab "Senarai Nama" tiada dalam Sheet ini). */
function erRosterFor(tahun) {
  const m = new Map();
  ER.erph.filter(erInYear(tahun)).forEach((r) => { if (!m.has(r.key)) m.set(r.key, r.nama); });
  ER.sem.filter(erInYear(tahun)).forEach((r) => { if (!m.has(r.key)) m.set(r.key, r.nama); });
  return m;
}

function erCompute(tahun, bulan, minggu, onlyKey) {
  const { weeks, all, monthOf } = erWeeksFor(tahun, bulan, minggu);
  let roster = [...erRosterFor(tahun).entries()].map(([key, nama]) => ({ key, nama }));
  if (onlyKey) roster = roster.filter((g) => g.key === onlyKey);
  const subMap = erSubmittedMap(tahun);
  const semMap = erEffectiveSem(tahun);

  const belumHantar = [], belumSemak = [];
  const statusLists = { belumSiap: [], proses: [], selesai: [] };
  const perWeek = [];
  let totalHantar = 0, totalDisemak = 0, disemakHantar = 0, selesai = 0, proses = 0, belumSiap = 0;

  roster.forEach((g) => {
    const missing = [], waiting = [];
    const byStatus = { belumSiap: [], proses: [], selesai: [] };
    weeks.forEach((w) => {
      const k = g.key + "|" + w;
      const hantar = subMap.get(k);
      const sem = semMap.get(k);
      if (hantar) { totalHantar++; if (sem) disemakHantar++; } else missing.push({ minggu: w, hasSemak: !!sem });
      if (sem) {
        totalDisemak++;
        if (sem.status === "selesai") { selesai++; byStatus.selesai.push({ minggu: w }); }
        else if (sem.status === "proses") { proses++; byStatus.proses.push({ minggu: w }); }
        else if (sem.status === "belumSiap") { belumSiap++; byStatus.belumSiap.push({ minggu: w }); }
      }
      if (hantar && !sem) waiting.push({ minggu: w });
    });
    if (missing.length) belumHantar.push({ nama: g.nama, items: missing });
    if (waiting.length) belumSemak.push({ nama: g.nama, items: waiting });
    ["belumSiap", "proses", "selesai"].forEach((s) => {
      if (byStatus[s].length) statusLists[s].push({ nama: g.nama, items: byStatus[s] });
    });
  });
  const bySize = (a, b) => b.items.length - a.items.length || a.nama.localeCompare(b.nama, "ms");
  belumHantar.sort(bySize); belumSemak.sort(bySize);
  Object.keys(statusLists).forEach((s) => statusLists[s].sort(bySize));

  weeks.forEach((w) => {
    let h = 0, d = 0;
    roster.forEach((g) => { if (subMap.has(g.key + "|" + w)) h++; if (semMap.has(g.key + "|" + w)) d++; });
    perWeek.push({ minggu: w, hantar: h, disemak: d });
  });

  const totalSlot = roster.length * weeks.length;
  const totalStatus = selesai + proses + belumSiap;
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
  return {
    roster, weeks, all, monthOf, perWeek, totalGuru: roster.length, totalSlot,
    totalHantar, totalDisemak, disemakHantar, selesai, proses, belumSiap, totalStatus,
    // Kadar semakan hanya kira e-RPH yang DIHANTAR (semakan tanpa rekod hantar tak menaikkan kadar)
    pctHantar: pct(totalHantar, totalSlot), pctSemak: pct(disemakHantar, totalHantar),
    pctSelesai: pct(selesai, totalStatus), pctProses: pct(proses, totalStatus), pctBelumSiap: pct(belumSiap, totalStatus),
    belumHantar, belumSemak, statusLists, subMap, semMap,
  };
}

/** Analisis semakan oleh SATU penyemak (pengguna Pentadbir). */
function erComputeSemak(tahun, bulan, minggu, penyemakKey) {
  const { weeks } = erWeeksFor(tahun, bulan, minggu);
  const weekSet = new Set(weeks);
  const subMap = erSubmittedMap(tahun);
  const semAll = erEffectiveSem(tahun);
  const mine = erEffectiveSem(tahun, (r) => r.penyemakKey === penyemakKey && weekSet.has(r.minggu));

  let selesai = 0, proses = 0, belumSiap = 0;
  const guruMap = new Map();
  const perWeekMap = {};
  mine.forEach((r) => {
    if (r.status === "selesai") selesai++; else if (r.status === "proses") proses++; else if (r.status === "belumSiap") belumSiap++;
    perWeekMap[r.minggu] = (perWeekMap[r.minggu] || 0) + 1;
    if (!guruMap.has(r.key)) guruMap.set(r.key, { nama: r.nama, total: 0, selesai: 0, proses: 0, belumSiap: 0, weeks: [] });
    const g = guruMap.get(r.key);
    g.total++; g.weeks.push({ minggu: r.minggu, status: r.status });
    if (r.status === "selesai") g.selesai++; else if (r.status === "proses") g.proses++; else if (r.status === "belumSiap") g.belumSiap++;
  });
  const guruList = [...guruMap.values()].sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama, "ms"));

  // Guru di bawah selia saya = penyemak terkini mereka (dalam tahun ini) ialah saya
  const lastByGuru = new Map();
  ER.sem.filter(erInYear(tahun)).forEach((r) => {
    const prev = lastByGuru.get(r.key);
    if (!prev || erTime(r) >= erTime(prev)) lastByGuru.set(r.key, r);
  });
  const menunggu = [];
  let assigned = 0;
  lastByGuru.forEach((r, key) => {
    if (r.penyemakKey !== penyemakKey) return;
    assigned++;
    const items = weeks.filter((w) => subMap.has(key + "|" + w) && !semAll.has(key + "|" + w)).map((w) => ({ minggu: w }));
    if (items.length) menunggu.push({ nama: r.nama, items });
  });
  menunggu.sort((a, b) => b.items.length - a.items.length || a.nama.localeCompare(b.nama, "ms"));

  const totalDisemak = mine.size;
  const totalStatus = selesai + proses + belumSiap;
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
  return {
    weeks, totalDisemak, guruCount: guruMap.size, selesai, proses, belumSiap, totalStatus,
    pctSelesai: pct(selesai, totalStatus), pctProses: pct(proses, totalStatus), pctBelumSiap: pct(belumSiap, totalStatus),
    perWeek: weeks.map((w) => ({ minggu: w, n: perWeekMap[w] || 0 })),
    guruList, menunggu, menungguJumlah: menunggu.reduce((a, g) => a + g.items.length, 0), assigned,
  };
}

/* ================= Carta SVG ================= */
function erDonut(segments, size, stroke, bigText, smallText) {
  const bigFont = Math.round(size * 0.2), smallFont = Math.round(size * 0.1);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let cum = 0;
  const arcs = total ? segments.filter((s) => s.value > 0).map((seg) => {
    const len = (seg.value / total) * c;
    const rot = (cum / total) * 360 - 90;
    cum += seg.value;
    return `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-linecap="butt" transform="rotate(${rot.toFixed(1)} ${size / 2} ${size / 2})" style="filter:drop-shadow(0 0 4px ${seg.color})"/>`;
  }).join("") : "";
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${stroke}"/>
    ${arcs}
    <text x="${size / 2}" y="${size / 2 + bigFont * 0.35}" text-anchor="middle" style="font-family:var(--font-mono);font-weight:700;font-size:${bigFont}px;fill:var(--text)">${bigText}</text>
    ${smallText ? `<text x="${size / 2}" y="${size / 2 + bigFont * 0.35 + smallFont * 1.5}" text-anchor="middle" style="font-family:var(--font-mono);font-size:${smallFont}px;fill:var(--text-dim);letter-spacing:1px">${smallText}</text>` : ""}
  </svg>`;
}
function erRadar(axes) {
  const size = 240, cx = size / 2, cy = size / 2, R = size / 2 - 46, n = axes.length;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const rings = [0.25, 0.5, 0.75, 1].map((lv) => {
    const pts = axes.map((_, i) => `${(cx + R * lv * Math.cos(ang(i))).toFixed(1)},${(cy + R * lv * Math.sin(ang(i))).toFixed(1)}`).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>`;
  }).join("");
  const lines = axes.map((ax, i) => {
    const a = ang(i), cosA = Math.cos(a);
    const anchor = Math.abs(cosA) < 0.25 ? "middle" : cosA > 0 ? "start" : "end";
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + R * Math.cos(a)).toFixed(1)}" y2="${(cy + R * Math.sin(a)).toFixed(1)}" stroke="rgba(255,255,255,0.14)"/>
      <text x="${(cx + (R + 16) * Math.cos(a)).toFixed(1)}" y="${(cy + (R + 16) * Math.sin(a)).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" class="er-radar-label">${ax.label}</text>`;
  }).join("");
  const pts = axes.map((ax, i) => {
    const v = Math.max(0, Math.min(100, ax.value)), r = R * (v / 100);
    return { x: cx + r * Math.cos(ang(i)), y: cy + r * Math.sin(ang(i)), ax };
  });
  const dots = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--cyan)" style="filter:drop-shadow(0 0 5px var(--cyan))"><title>${p.ax.label}: ${p.ax.value}%</title></circle>`).join("");
  return `<svg viewBox="0 0 ${size} ${size}" style="width:100%;max-width:280px;height:auto;overflow:visible;display:block;margin:0 auto">
    <defs><radialGradient id="erRadarFill" cx="50%" cy="50%" r="65%"><stop offset="0%" stop-color="var(--cyan)" stop-opacity=".38"/><stop offset="100%" stop-color="var(--violet)" stop-opacity=".08"/></radialGradient></defs>
    ${rings}${lines}
    <polygon points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="url(#erRadarFill)" stroke="var(--cyan)" stroke-width="2" style="filter:drop-shadow(0 0 8px rgba(0,229,255,.45))"/>
    ${dots}
  </svg>`;
}
function erRadarAxes(A) {
  return [
    { label: "Penghantaran", value: A.pctHantar },
    { label: "Semakan", value: A.pctSemak },
    { label: "Selesai", value: A.pctSelesai },
    { label: "Proses", value: A.pctProses },
    { label: "Belum Siap", value: A.pctBelumSiap },
  ];
}
const ER_COL = { green: "#19e3a1", cyan: "#00e5ff", violet: "#8b7bff", amber: "#ffb84d", red: "#ff5577" };
const erStatusDonut = (A, size) => erDonut(
  [{ value: A.selesai, color: ER_COL.green }, { value: A.proses, color: ER_COL.amber }, { value: A.belumSiap, color: ER_COL.red }],
  size, 11, String(A.totalStatus), "STATUS"
);

/* ================= Popup senarai ================= */
function erChips(items, cls, withFlag) {
  return items.map((m) => {
    const flag = withFlag && m.hasSemak ? " (Telah Disemak)" : "";
    return `<span class="er-chip ${withFlag && m.hasSemak ? "er-chip-violet" : cls}">Minggu ${erEsc(m.minggu)}${flag}</span>`;
  }).join("");
}
function erListHtml(list, cls, withFlag, emptyMsg) {
  if (!list.length) return `<div class="er-empty-ok">${emptyMsg}</div>`;
  return list.map((g) => `
    <div class="er-li">
      <div class="er-li-head"><b>${erEsc(g.nama)}</b><span>${g.items.length} minggu</span></div>
      <div class="er-chips">${erChips(g.items, cls, withFlag)}</div>
    </div>`).join("");
}
function erScopeLabel() {
  const parts = [`Tahun ${erF.tahun}`];
  if (erF.bulan !== "__ALL__") parts.push(ER_MONTHS[parseInt(erF.bulan, 10) - 1]);
  if (erF.minggu !== "__ALL__") parts.push("Minggu " + erF.minggu);
  return parts.join(" · ");
}
function erOpenList(type) {
  if (!erLast) return;
  let title = "", body = "";
  if (type === "belumHantar") {
    title = "Guru Belum Hantar e-RPH";
    body = erListHtml(erLast.belumHantar, "er-chip-red", true, "✓ Semua guru telah menghantar e-RPH");
  } else if (type === "belumSemak") {
    title = "Dihantar, Belum Disemak";
    body = erListHtml(erLast.belumSemak, "er-chip-violet", false, "✓ Semua e-RPH yang dihantar telah disemak");
  } else if (type === "status") {
    title = "Senarai Mengikut Status Semakan";
    const sec = (label, cls, list) => `
      <div class="er-sec-head er-sec-${cls}">${label} <span>${list.length} guru</span></div>
      ${erListHtml(list, "er-chip-" + cls, false, "Tiada")}`;
    body = sec("Belum Siap", "red", erLast.statusLists.belumSiap) + sec("Dalam Proses", "amber", erLast.statusLists.proses) + sec("Selesai", "green", erLast.statusLists.selesai);
  } else if (type === "menunggu") {
    title = "Menunggu Semakan Anda";
    body = erListHtml(erLast.menunggu, "er-chip-violet", false, "✓ Tiada e-RPH menunggu semakan anda");
  } else if (type === "guruDisemak") {
    title = "Guru Yang Anda Semak";
    body = erLast.guruList.length ? erLast.guruList.map((g) => `
      <div class="er-li">
        <div class="er-li-head"><b>${erEsc(g.nama)}</b><span>${g.total} semakan</span></div>
        <div class="er-chips">
          ${g.selesai ? `<span class="er-chip er-chip-green">Selesai ${g.selesai}</span>` : ""}
          ${g.proses ? `<span class="er-chip er-chip-amber">Proses ${g.proses}</span>` : ""}
          ${g.belumSiap ? `<span class="er-chip er-chip-red">Belum Siap ${g.belumSiap}</span>` : ""}
        </div>
      </div>`).join("") : `<div class="er-empty-ok">Tiada semakan dalam tempoh ini</div>`;
  }
  document.getElementById("er-popup-title").textContent = title;
  document.getElementById("er-popup-sub").textContent = erScopeLabel();
  document.getElementById("er-popup-body").innerHTML = body;
  document.getElementById("er-popup-overlay").classList.remove("hidden");
}
function erClosePopup() { document.getElementById("er-popup-overlay").classList.add("hidden"); }

/* ================= Render tab ================= */
function erRenderHantar() {
  const A = erCompute(erF.tahun, erF.bulan, erF.minggu);
  erLast = A;
  if (!A.totalGuru || !A.weeks.length) {
    return `<div class="empty-state">Tiada data e-RPH untuk pilihan ini.</div>`;
  }
  const belumHantarJum = Math.max(0, A.totalSlot - A.totalHantar);
  const belumSemakJum = Math.max(0, A.totalHantar - A.disemakHantar);
  return `
    <div class="er-card">
      <div class="er-card-title">Prestasi Keseluruhan</div>
      ${erRadar(erRadarAxes(A))}
      <div class="er-summary-row">
        <div class="er-mini">Guru<b>${A.totalGuru}</b></div>
        <div class="er-mini">Minggu<b>${A.weeks.length}</b></div>
        <div class="er-mini">Belum Hantar<b style="color:var(--pink)">${belumHantarJum}</b></div>
        <div class="er-mini">Belum Semak<b style="color:var(--violet)">${belumSemakJum}</b></div>
      </div>
    </div>
    <div class="er-donut-grid">
      <div class="er-donut-card" onclick="erOpenList('belumHantar')">
        ${erDonut([{ value: A.pctHantar, color: ER_COL.green }, { value: 100 - A.pctHantar, color: "transparent" }], 92, 11, A.pctHantar + "%", "HANTAR")}
        <div class="er-d-label">Kadar Penghantaran</div>
        <div class="er-d-sub">${A.totalHantar} / ${A.totalSlot}</div>
        <div class="er-hint">Ketik: guru belum hantar</div>
      </div>
      <div class="er-donut-card" onclick="erOpenList('belumSemak')">
        ${erDonut([{ value: A.pctSemak, color: ER_COL.cyan }, { value: 100 - A.pctSemak, color: "transparent" }], 92, 11, A.pctSemak + "%", "DISEMAK")}
        <div class="er-d-label">Kadar Semakan</div>
        <div class="er-d-sub">${A.disemakHantar} / ${A.totalHantar}</div>
        <div class="er-hint">Ketik: belum disemak</div>
      </div>
      <div class="er-donut-card" onclick="erOpenList('status')">
        ${erStatusDonut(A, 92)}
        <div class="er-d-label">Selesai / Proses / Belum Siap</div>
        <div class="er-d-sub"><span style="color:${ER_COL.green}">${A.selesai}</span> · <span style="color:${ER_COL.amber}">${A.proses}</span> · <span style="color:${ER_COL.red}">${A.belumSiap}</span></div>
        <div class="er-hint">Ketik: senarai guru</div>
      </div>
    </div>`;
}

function erPillFor(sem, hantar) {
  if (sem) {
    if (sem.status === "selesai") return `<span class="er-pill er-pill-selesai">Selesai</span>`;
    if (sem.status === "proses") return `<span class="er-pill er-pill-proses">Dalam Proses</span>`;
    if (sem.status === "belumSiap") return `<span class="er-pill er-pill-belumsiap">Belum Siap</span>`;
    return `<span class="er-pill er-pill-selesai">${erEsc(sem.statusText || "Disemak")}</span>`;
  }
  return hantar ? `<span class="er-pill er-pill-belumdisemak">Belum Disemak</span>` : `<span class="er-pill er-pill-belumhantar">Belum Hantar</span>`;
}

function erRenderSaya() {
  const myKey = erNormName(erUser.nama);
  const A = erCompute(erF.tahun, erF.bulan, erF.minggu, myKey);
  erLast = A;
  if (!A.totalGuru) {
    return `<div class="er-card"><div class="empty-state">Nama anda (<b>${erEsc(erUser.nama)}</b>) tidak dijumpai dalam data e-RPH tahun ${erEsc(erF.tahun)}.<br><span style="font-size:11px">Pastikan nama dalam Sheet e-RPH sama dengan nama dalam DatabaseSTAFF.</span></div></div>`;
  }
  if (!A.weeks.length) return `<div class="empty-state">Tiada data e-RPH untuk pilihan ini.</div>`;

  const rows = [...A.weeks].reverse().map((w) => {
    const k = myKey + "|" + w;
    const hantar = A.subMap.get(k), sem = A.semMap.get(k);
    return `<div class="er-week-row">
      <div><div class="er-wk-name">Minggu ${erEsc(w)}</div>
        <div class="er-wk-sub">${hantar ? "Dihantar " + erFmtDate(hantar.tarikh) : "Belum dihantar"}${sem && sem.penyemak ? " · " + erEsc(sem.penyemak) : ""}</div></div>
      ${erPillFor(sem, !!hantar)}
    </div>`;
  }).join("");

  return `
    <div class="er-card">
      <div class="er-card-title">Prestasi Saya <span class="er-card-sub">${erEsc(erUser.nama)}</span></div>
      ${erRadar(erRadarAxes(A))}
    </div>
    <div class="er-donut-grid">
      <div class="er-donut-card er-static">
        ${erDonut([{ value: A.pctHantar, color: ER_COL.green }, { value: 100 - A.pctHantar, color: "transparent" }], 92, 11, A.pctHantar + "%", "HANTAR")}
        <div class="er-d-label">Kadar Penghantaran</div>
        <div class="er-d-sub">${A.totalHantar} / ${A.totalSlot} minggu</div>
      </div>
      <div class="er-donut-card er-static">
        ${erDonut([{ value: A.pctSemak, color: ER_COL.cyan }, { value: 100 - A.pctSemak, color: "transparent" }], 92, 11, A.pctSemak + "%", "DISEMAK")}
        <div class="er-d-label">Kadar Semakan</div>
        <div class="er-d-sub">${A.disemakHantar} / ${A.totalHantar}</div>
      </div>
      <div class="er-donut-card er-static">
        ${erStatusDonut(A, 92)}
        <div class="er-d-label">Selesai / Proses / Belum Siap</div>
        <div class="er-d-sub"><span style="color:${ER_COL.green}">${A.selesai}</span> · <span style="color:${ER_COL.amber}">${A.proses}</span> · <span style="color:${ER_COL.red}">${A.belumSiap}</span></div>
      </div>
    </div>
    <div class="er-card"><div class="er-card-title">Rekod Mingguan</div>${rows}</div>`;
}

function erRenderSemak() {
  const S = erComputeSemak(erF.tahun, erF.bulan, erF.minggu, erNormName(erUser.nama));
  erLast = S;
  if (!S.weeks.length) return `<div class="empty-state">Tiada data e-RPH untuk pilihan ini.</div>`;
  const maxN = Math.max(1, ...S.perWeek.map((w) => w.n));
  const bars = S.perWeek.map((w) => `
    <div class="er-bar-row"><span class="er-bar-lbl">M${erEsc(w.minggu)}</span>
      <div class="er-bar-track"><div class="er-bar-fill" style="width:${Math.round((w.n / maxN) * 100)}%"></div></div>
      <span class="er-bar-val">${w.n}</span></div>`).join("");
  return `
    <div class="er-card">
      <div class="er-card-title">Semakan Saya <span class="er-card-sub">${erEsc(erUser.nama)}</span></div>
      <div class="er-summary-row">
        <div class="er-mini er-clickable" onclick="erOpenList('guruDisemak')">Jumlah Disemak<b>${S.totalDisemak}</b></div>
        <div class="er-mini er-clickable" onclick="erOpenList('guruDisemak')">Guru<b>${S.guruCount}</b></div>
        <div class="er-mini er-clickable" onclick="erOpenList('menunggu')">Menunggu Semakan<b style="color:var(--violet)">${S.menungguJumlah}</b></div>
      </div>
      ${S.assigned ? "" : `<div class="er-note">Tiada guru didaftarkan di bawah semakan anda dalam data tahun ini, jadi senarai "Menunggu Semakan" kosong.</div>`}
    </div>
    <div class="er-donut-grid er-donut-grid-1">
      <div class="er-donut-card" style="cursor:default">
        ${erStatusDonut(S, 104)}
        <div class="er-d-label">Status Semakan Saya</div>
        <div class="er-d-sub"><span style="color:${ER_COL.green}">Selesai ${S.selesai}</span> · <span style="color:${ER_COL.amber}">Proses ${S.proses}</span> · <span style="color:${ER_COL.red}">Belum Siap ${S.belumSiap}</span></div>
      </div>
    </div>
    <div class="er-card"><div class="er-card-title">Semakan Mengikut Minggu</div>${bars}</div>`;
}

function erRender() {
  const box = document.getElementById("er-content");
  try {
    if (erTab === "hantar") box.innerHTML = erRenderHantar();
    else if (erTab === "saya") box.innerHTML = erRenderSaya();
    else box.innerHTML = erRenderSemak();
  } catch (e) {
    box.innerHTML = `<div class="empty-state">Ralat memaparkan analisis (${erEsc(e.message)}).</div>`;
  }
}

/* ================= Tab & penapis ================= */
function erSwitchTab(tab) {
  erTab = tab;
  ["hantar", "saya", "semak"].forEach((t) => document.getElementById("er-nav-" + t).classList.toggle("active", t === tab));
  erRender();
}
function erFillBulan() {
  const { monthOf } = erWeeksFor(erF.tahun, "__ALL__", "__ALL__");
  const months = [...new Set(Object.values(monthOf))].sort((a, b) => a - b);
  if (!months.map(String).includes(String(erF.bulan))) erF.bulan = "__ALL__";
  document.getElementById("er-f-bulan").innerHTML =
    `<option value="__ALL__">Semua Bulan</option>` +
    months.map((m) => `<option value="${m}"${String(m) === String(erF.bulan) ? " selected" : ""}>${ER_MONTHS[m - 1]}</option>`).join("");
}
function erFillMinggu() {
  const { all, monthOf } = erWeeksFor(erF.tahun, "__ALL__", "__ALL__");
  const list = erF.bulan === "__ALL__" ? all : all.filter((w) => String(monthOf[w]) === String(erF.bulan));
  if (erF.minggu !== "__ALL__" && !list.includes(erF.minggu)) erF.minggu = "__ALL__";
  document.getElementById("er-f-minggu").innerHTML =
    `<option value="__ALL__">Semua Minggu</option>` +
    list.map((w) => `<option value="${erEsc(w)}"${w === erF.minggu ? " selected" : ""}>Minggu ${erEsc(w)}</option>`).join("");
}
function erInitFilters() {
  const years = [...new Set(ER.erph.map((r) => r.tahun))].sort((a, b) => b - a);
  const thisYear = new Date().getFullYear();
  erF.tahun = String(years.includes(thisYear) ? thisYear : years[0] || thisYear);
  document.getElementById("er-f-tahun").innerHTML = (years.length ? years : [thisYear])
    .map((y) => `<option value="${y}"${String(y) === erF.tahun ? " selected" : ""}>${y}</option>`).join("");
  erFillBulan(); erFillMinggu();
}
function erOnFilter(which) {
  if (which === "tahun") { erF.tahun = document.getElementById("er-f-tahun").value; erF.bulan = "__ALL__"; erF.minggu = "__ALL__"; erFillBulan(); erFillMinggu(); }
  else if (which === "bulan") { erF.bulan = document.getElementById("er-f-bulan").value; erF.minggu = "__ALL__"; erFillMinggu(); }
  else erF.minggu = document.getElementById("er-f-minggu").value;
  erRender();
}

/* ================= Mula ================= */
async function erInit(user) {
  erUser = user;
  if (erIsPentadbir(user)) document.getElementById("er-nav-semak").classList.remove("hidden");
  const banner = document.getElementById("er-banner");
  try {
    const [rawErph, rawSem] = await Promise.all([erFetchSheet(ER_SHEET_ERPH), erFetchSheet(ER_SHEET_SEMAKAN)]);
    ER = erBuild(rawErph, rawSem);
    if (!ER.erph.length) throw new Error("Tiada rekod e-RPH dikesan dalam Sheet");
  } catch (e) {
    banner.textContent = "Gagal memuatkan data e-RPH (" + e.message + "). Pastikan Sheet dikongsi 'Sesiapa yang mempunyai pautan — Pelihat'.";
    banner.classList.remove("hidden");
    document.getElementById("er-content").innerHTML = `<div class="empty-state">Data tidak dapat dimuatkan.</div>`;
    return;
  }
  erInitFilters();
  erRender();
}

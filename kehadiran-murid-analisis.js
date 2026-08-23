/* ============================================================
   KONFIGURASI — Analisis Kehadiran Murid (Chart.js dashboard)
   Semua pengecam global dinamakan dengan awalan "ma" (Murid Analisis)
   supaya tidak berlanggar dengan skrip lain di muka yang sama.
   ============================================================ */
const MA_SHEET_ID = "1ZjUjYPY5QBxOrOIDI6PixpS5ygdatAsZ4HT_uT-iMMA";
const MA_SHEET_NAME = "Kehadiran";
const MA_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${MA_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(MA_SHEET_NAME)}&_ts=${Date.now()}`;
const MA_AUTO_REFRESH_MS = 5 * 60 * 1000;

const MA_BULAN = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];
const MA_HARI = ["Ahad","Isnin","Selasa","Rabu","Khamis","Jumaat","Sabtu"];
const MA_TOTAL_KELAS_TETAP = 17;

let MA_RECORDS = [];
let MA_ALL_CLASSES = [];
let maCharts = {};
let maLastDayRecords = [];
let maLastDayLabel = "";
let maLastPeriodAgg = {};
let maLastPeriodLabel = "";
let maChartLibReady = false;
let maChartLibFailed = false;
let maFiltersInitialised = false;
let _maChartLibPromise = null;

function maLoadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Gagal muat: " + src));
    document.head.appendChild(s);
  });
}
function maEnsureChartLib(){
  if (_maChartLibPromise) return _maChartLibPromise;
  _maChartLibPromise = (async () => {
    if (typeof Chart !== "undefined") { maChartLibReady = true; return; }
    const cdns = [
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js",
      "https://unpkg.com/chart.js@4.4.4/dist/chart.umd.min.js",
    ];
    for (const url of cdns) {
      try {
        await maLoadScript(url);
        if (typeof Chart !== "undefined") { maChartLibReady = true; return; }
      } catch (e) { /* cuba CDN seterusnya */ }
    }
    maChartLibFailed = true;
  })();
  return _maChartLibPromise;
}
function maChartFallbackMsg(canvasId, wrapSelector) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.closest(wrapSelector) || canvas.parentElement;
  wrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);font-size:12.5px;text-align:center;padding:0 12px;">
    📉 Pustaka graf tidak dapat dimuatkan (mungkin disekat rangkaian/ad-blocker).<br>Data &amp; kad kehadiran tetap berfungsi seperti biasa.
  </div>`;
}

/* ---------------- Utiliti ---------------- */
function maPad2(n) { return n.toString().padStart(2, "0"); }
function maYmd(d) { return `${d.getFullYear()}-${maPad2(d.getMonth() + 1)}-${maPad2(d.getDate())}`; }
function maFmtTarikh(d) { return `${maPad2(d.getDate())}/${maPad2(d.getMonth() + 1)}/${d.getFullYear()}`; }
function maTingkatanOf(kelasName) {
  const m = (kelasName || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 99;
}
function maPct(a, b) { return b > 0 ? Math.round((a / b) * 1000) / 10 : 0; }
function maGetCss(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function maRingColor(p) {
  if (p >= 95) return maGetCss("--mint");
  if (p >= 85) return maGetCss("--cyan");
  if (p >= 70) return maGetCss("--amber");
  return maGetCss("--danger");
}
function maToggleAbsentList(e, headerEl) {
  e.stopPropagation();
  const body = headerEl.nextElementSibling;
  if (!body) return;
  const nowOpen = !body.classList.contains("open");
  body.classList.toggle("open", nowOpen);
  headerEl.classList.toggle("open", nowOpen);
}

/* ---------------- Ambil & parse data (gviz JSON, langsung) ---------------- */
async function maFetchSheetData() {
  maShowLoading(true);
  maShowError(null);
  try {
    const res = await fetch(MA_GVIZ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const json = JSON.parse(jsonStr);
    if (!json.table || !json.table.rows) throw new Error("Format data tidak dikenali");

    const rows = json.table.rows;
    const records = [];
    const classSet = new Set();

    for (const row of rows) {
      const c = row.c || [];
      const get = (i) => (c[i] ? c[i] : null);

      const tarikhCell = get(0);
      if (!tarikhCell || (tarikhCell.v === null && !tarikhCell.f)) continue;

      let tarikhDate = null;
      const rawF = tarikhCell.f || "";
      const rawV = tarikhCell.v;
      if (typeof rawV === "string" && rawV.startsWith("Date(")) {
        const m = rawV.match(/Date\((\d+),(\d+),(\d+)/);
        if (m) tarikhDate = new Date(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
      }
      if (!tarikhDate && rawF) {
        const parts = rawF.split("/").map((s) => s.trim());
        if (parts.length === 3) {
          const mo = parseInt(parts[0], 10), da = parseInt(parts[1], 10), ye = parseInt(parts[2], 10);
          if (!isNaN(mo) && !isNaN(da) && !isNaN(ye)) tarikhDate = new Date(ye, mo - 1, da);
        }
      }
      if (!tarikhDate && typeof rawV === "number") {
        const base = new Date(1899, 11, 30);
        tarikhDate = new Date(base.getTime() + rawV * 86400000);
      }
      if (!tarikhDate || isNaN(tarikhDate.getTime())) continue;

      const kelas = (get(1) && (get(1).v ?? get(1).f)) ? String(get(1).v ?? get(1).f).trim() : "";
      if (!kelas) continue;

      const hadir = Number(get(2)?.v ?? 0) || 0;
      const tidakHadir = Number(get(3)?.v ?? 0) || 0;
      const namaRaw = (get(4) && (get(4).v ?? get(4).f)) ? String(get(4).v ?? get(4).f).trim() : "";
      const namaList = namaRaw ? namaRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const jumlahMurid = Number(get(5)?.v ?? (hadir + tidakHadir)) || (hadir + tidakHadir);
      let peratus = get(6)?.v;
      peratus = (peratus === null || peratus === undefined || peratus === "") ? maPct(hadir, jumlahMurid) : Number(peratus);
      const catatOleh = (get(7) && (get(7).v ?? get(7).f)) ? String(get(7).v ?? get(7).f).trim() : "";

      classSet.add(kelas);
      records.push({
        tarikh: tarikhDate, tarikhKey: maYmd(tarikhDate),
        tahun: tarikhDate.getFullYear(), bulan: tarikhDate.getMonth() + 1,
        kelas, tingkatan: maTingkatanOf(kelas),
        hadir, tidakHadir, namaList, jumlahMurid, peratus, catatOleh,
      });
    }

    MA_RECORDS = records;
    MA_ALL_CLASSES = Array.from(classSet).sort((a, b) => {
      const ta = maTingkatanOf(a), tb = maTingkatanOf(b);
      if (ta !== tb) return ta - tb;
      return a.localeCompare(b);
    });

    maShowLoading(false);
    const statusEl = document.getElementById("ma-statusText");
    if (statusEl) statusEl.textContent = "LANGSUNG";
    const updEl = document.getElementById("ma-u-lastupdate");
    if (updEl) updEl.textContent = "Dikemaskini: " + new Date().toLocaleTimeString("ms-MY");

    if (!maChartLibReady && !maChartLibFailed) await maEnsureChartLib();
    maInitFiltersIfNeeded();

    try { maRenderUtama(); } catch (e) { console.error("maRenderUtama:", e); }
    try { maRenderKelasPage(); } catch (e) { console.error("maRenderKelasPage:", e); }
    try { maRenderTahunan(); } catch (e) { console.error("maRenderTahunan:", e); }
  } catch (err) {
    console.error(err);
    maShowLoading(false);
    const statusEl = document.getElementById("ma-statusText");
    if (statusEl) statusEl.textContent = "TERPUTUS";
    maShowError(`⚠️ Gagal memuatkan data langsung dari Google Sheets. Pastikan hamparan dikongsi sebagai "Sesiapa yang ada pautan – Boleh Lihat". (${err.message})`);
  }
}
function maShowLoading(on) {
  const el = document.getElementById("ma-banner-loading");
  if (el) el.classList.toggle("show", !!on);
}
function maShowError(msg) {
  const el = document.getElementById("ma-banner-error");
  if (!el) return;
  if (msg) { el.textContent = msg; el.classList.add("show"); }
  else { el.textContent = ""; el.classList.remove("show"); }
}

/* ---------------- Setup filter awal ---------------- */
function maInitFiltersIfNeeded() {
  const today = new Date();
  const yearSet = new Set(MA_RECORDS.map((r) => r.tahun));
  yearSet.add(today.getFullYear());
  const years = Array.from(yearSet).sort((a, b) => b - a);

  if (!maFiltersInitialised) {
    const uYear = document.getElementById("ma-u-year");
    uYear.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    uYear.value = today.getFullYear();
    document.getElementById("ma-u-date").value = maYmd(today);
    uYear.addEventListener("change", maRenderUtama);
    document.getElementById("ma-u-date").addEventListener("change", maRenderUtama);

    const kYear = document.getElementById("ma-k-year");
    kYear.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    kYear.value = today.getFullYear();
    const kMonth = document.getElementById("ma-k-month");
    kMonth.innerHTML = MA_BULAN.map((b, i) => `<option value="${i + 1}">${b}</option>`).join("");
    kMonth.value = today.getMonth() + 1;
    const kKelas = document.getElementById("ma-k-kelas");
    kKelas.innerHTML = MA_ALL_CLASSES.map((k) => `<option value="${k}">${k}</option>`).join("");
    kYear.addEventListener("change", maRenderKelasPage);
    kMonth.addEventListener("change", maRenderKelasPage);
    kKelas.addEventListener("change", maRenderKelasPage);

    const tYear = document.getElementById("ma-t-year");
    tYear.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    tYear.value = today.getFullYear();
    const tMonth = document.getElementById("ma-t-month");
    tMonth.innerHTML = `<option value="">— Semua Bulan (Tahunan) —</option>` + MA_BULAN.map((b, i) => `<option value="${i + 1}">${b}</option>`).join("");
    tMonth.value = today.getMonth() + 1;
    tYear.addEventListener("change", maRenderTahunan);
    tMonth.addEventListener("change", maRenderTahunan);

    maFiltersInitialised = true;
  } else {
    const kKelas = document.getElementById("ma-k-kelas");
    const current = kKelas.value;
    kKelas.innerHTML = MA_ALL_CLASSES.map((k) => `<option value="${k}">${k}</option>`).join("");
    if (MA_ALL_CLASSES.includes(current)) kKelas.value = current;
  }
}

/* ---------------- Sub-tab dalaman (Utama / Analisis Kelas / Tahunan) ---------------- */
function maSwitchSubtab(name) {
  document.querySelectorAll(".ma-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.matab === name));
  document.querySelectorAll(".ma-page").forEach((p) => p.classList.toggle("active", p.id === "ma-page-" + name));
}

/* ---------------- PAGE: Utama ---------------- */
function maRenderUtama() {
  if (!MA_RECORDS.length) return;
  const year = parseInt(document.getElementById("ma-u-year").value, 10);
  const dateStr = document.getElementById("ma-u-date").value;
  const dayRecords = MA_RECORDS.filter((r) => r.tahun === year && r.tarikhKey === dateStr);
  maLastDayRecords = dayRecords;

  const jumlahKelasIsi = new Set(dayRecords.map((r) => r.kelas)).size;
  const jumlahHadir = dayRecords.reduce((s, r) => s + r.hadir, 0);
  const jumlahTidakHadir = dayRecords.reduce((s, r) => s + r.tidakHadir, 0);
  const jumlahMurid = dayRecords.reduce((s, r) => s + r.jumlahMurid, 0);
  const peratusKeseluruhan = maPct(jumlahHadir, jumlahMurid);

  const [yy, mm, dd] = dateStr.split("-").map(Number);
  const dObj = new Date(yy, mm - 1, dd);
  document.getElementById("ma-u-datelabel").textContent = `${MA_HARI[dObj.getDay()]}, ${maFmtTarikh(dObj)}`;
  maLastDayLabel = `${MA_HARI[dObj.getDay()]}, ${maFmtTarikh(dObj)}`;

  const kpis = [
    { icon: "🏫", label: "Kelas Telah Isi", value: `${jumlahKelasIsi}<small> / ${MA_ALL_CLASSES.length}</small>`, sub: "Kelas menghantar rekod", accent: "--cyan" },
    { icon: "✅", label: "Jumlah Hadir", value: `${jumlahHadir}<small> orang</small>`, sub: "Murid hadir ke sekolah", accent: "--mint" },
    { icon: "❌", label: "Tidak Hadir", value: `${jumlahTidakHadir}<small> orang</small>`, sub: "Murid tidak hadir", accent: "--danger" },
    { icon: "👥", label: "Jumlah Murid", value: `${jumlahMurid}<small> orang</small>`, sub: "Jumlah keseluruhan direkodkan", accent: "--amber" },
    { icon: "📊", label: "Peratus Kehadiran", value: `${peratusKeseluruhan}<small>%</small>`, sub: "Kehadiran keseluruhan", accent: "--blue" },
  ];
  const donutCardHtml = `
    <div class="ma-kpi-card ma-kpi-donut-card">
      <div class="ma-kpi-label">Nisbah Hadir</div>
      <div class="ma-donut-mini-wrap"><canvas id="ma-chartDonut"></canvas></div>
    </div>`;
  document.getElementById("ma-u-kpis").innerHTML = kpis.map((k) => `
    <div class="ma-kpi-card" style="--ma-accent:var(${k.accent})">
      <span class="ma-kpi-icon">${k.icon}</span>
      <div class="ma-kpi-label">${k.label}</div>
      <div class="ma-kpi-value">${k.value}</div>
      <div class="ma-kpi-sub">${k.sub}</div>
    </div>`).join("") + donutCardHtml;

  maDrawDonutChart(jumlahHadir, jumlahTidakHadir);

  document.getElementById("ma-u-classcount").textContent = `${jumlahKelasIsi} / ${MA_ALL_CLASSES.length} kelas ada rekod`;

  function buildClassCard(kName) {
    const rec = dayRecords.find((r) => r.kelas === kName);
    if (!rec) {
      return `<div class="ma-class-card ma-empty" data-kelas="${kName}">
        <div class="ma-class-top"><span class="ma-class-name">${kName}</span><span class="ma-class-ting">T${maTingkatanOf(kName)}</span></div>
        <div class="ma-empty-mini">Tiada rekod</div>
      </div>`;
    }
    const p = rec.peratus;
    const col = maRingColor(p);
    return `<div class="ma-class-card" data-kelas="${kName}">
      <div class="ma-class-top"><span class="ma-class-name">${rec.kelas}</span><span class="ma-class-ting">T${rec.tingkatan}</span></div>
      <div class="ma-mini-pct" style="color:${col}">${p}%</div>
      <div class="ma-mini-stats"><b>${rec.hadir}</b> hadir · <b>${rec.tidakHadir}</b> t.hadir</div>
    </div>`;
  }

  const groups = {};
  MA_ALL_CLASSES.forEach((kName) => { const t = maTingkatanOf(kName); (groups[t] = groups[t] || []).push(kName); });
  const grid = document.getElementById("ma-u-classgrid");
  grid.innerHTML = Object.keys(groups).sort((a, b) => a - b).map((t) => {
    const cards = groups[t].map(buildClassCard).join("");
    return `<div class="ma-ting-group"><div class="ma-ting-heading">Tingkatan ${t}</div><div class="ma-class-grid">${cards}</div></div>`;
  }).join("");
}

function maDrawBarChart(data, ids) {
  ids = ids || { wrap: "ma-chartByClassWrap", inner: "ma-chartByClassInner", canvas: "ma-chartByClass", key: "bar" };
  const wrap = document.getElementById(ids.wrap);
  const inner = document.getElementById(ids.inner);
  if (wrap) { wrap.style.height = "260px"; wrap.style.overflowX = "auto"; }
  if (inner) { inner.style.minWidth = Math.max(480, data.length * 52) + "px"; }
  if (maChartLibFailed) { maChartFallbackMsg(ids.canvas, ".ma-chart-inner"); return; }
  if (typeof Chart === "undefined") return;
  const ctx = document.getElementById(ids.canvas);
  if (maCharts[ids.key]) maCharts[ids.key].destroy();
  maCharts[ids.key] = new Chart(ctx, {
    type: "bar",
    data: { labels: data.map((d) => d.kelas), datasets: [{ label: "% Kehadiran", data: data.map((d) => d.peratus), backgroundColor: data.map((d) => (d.peratus === null ? "rgba(255,255,255,0.08)" : maRingColor(d.peratus))), borderRadius: 6, maxBarThickness: 30 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => (c.raw === null ? "Tiada data" : c.raw + "%") } } },
      scales: { y: { min: 0, max: 100, grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: maGetCss("--text-dim"), callback: (v) => v + "%" } }, x: { grid: { display: false }, ticks: { color: maGetCss("--text"), font: { family: "Rajdhani", size: 10.5 } } } } },
  });
}
function maCenterTextPlugin(getLabel) {
  return {
    id: "maCenterText_" + Math.random().toString(36).slice(2),
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      const { value, sub } = getLabel();
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = maGetCss("--text");
      ctx.font = "800 13px Orbitron, sans-serif";
      ctx.fillText(value, cx, cy - (sub ? 6 : 0));
      if (sub) {
        ctx.fillStyle = maGetCss("--text-dim");
        ctx.font = "600 7px Rajdhani, sans-serif";
        ctx.fillText(sub, cx, cy + 8);
      }
      ctx.restore();
    },
  };
}

function maDrawDonutChart(hadir, tidakHadir, ids) {
  ids = ids || { canvas: "ma-chartDonut", key: "donut" };
  if (maChartLibFailed) { maChartFallbackMsg(ids.canvas, ".ma-chart-wrap"); return; }
  if (typeof Chart === "undefined") return;
  const ctx = document.getElementById(ids.canvas);
  if (maCharts[ids.key]) maCharts[ids.key].destroy();
  const totalMurid = hadir + tidakHadir;
  const pctLabel = totalMurid ? Math.round((hadir / totalMurid) * 1000) / 10 : 0;
  maCharts[ids.key] = new Chart(ctx, {
    type: "doughnut",
    data: { labels: ["Hadir", "Tidak Hadir"], datasets: [{ data: [hadir, tidakHadir], backgroundColor: [maGetCss("--mint"), maGetCss("--danger")], borderColor: maGetCss("--panel-b") || "#08211c", borderWidth: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { display: false }, tooltip: { enabled: true } } },
    plugins: [maCenterTextPlugin(() => ({ value: pctLabel + "%", sub: "HADIR" }))],
  });
}

/* ---------------- PAGE: Analisis Kelas ---------------- */
function maRenderKelasPage() {
  if (!MA_RECORDS.length) return;
  const year = parseInt(document.getElementById("ma-k-year").value, 10);
  const month = parseInt(document.getElementById("ma-k-month").value, 10);
  const kelas = document.getElementById("ma-k-kelas").value;
  const monthRecords = MA_RECORDS.filter((r) => r.tahun === year && r.bulan === month && r.kelas === kelas).sort((a, b) => a.tarikh - b.tarikh);

  document.getElementById("ma-k-label").textContent = `${kelas || "-"} · ${MA_BULAN[month - 1]} ${year}`;

  const hariDirekod = monthRecords.length;
  const purataHadir = hariDirekod ? Math.round(monthRecords.reduce((s, r) => s + r.hadir, 0) / hariDirekod) : 0;
  const purataTidakHadir = hariDirekod ? Math.round(monthRecords.reduce((s, r) => s + r.tidakHadir, 0) / hariDirekod) : 0;
  const purataKehadiran = hariDirekod ? Math.round((monthRecords.reduce((s, r) => s + r.peratus, 0) / hariDirekod) * 10) / 10 : 0;
  const jumlahMuridTerkini = hariDirekod ? monthRecords[monthRecords.length - 1].jumlahMurid : 0;

  const kpis = [
    { icon: "🗓️", label: "Hari Direkodkan", value: `${hariDirekod}`, sub: "Jumlah hari rekod diambil", accent: "--cyan" },
    { icon: "✅", label: "Purata Hadir", value: `${purataHadir}<small> orang</small>`, sub: "Purata hadir sehari", accent: "--mint" },
    { icon: "❌", label: "Purata Tidak Hadir", value: `${purataTidakHadir}<small> orang</small>`, sub: "Purata tidak hadir sehari", accent: "--danger" },
    { icon: "📊", label: "Purata Kehadiran", value: `${purataKehadiran}<small>%</small>`, sub: `Bil. murid: ${jumlahMuridTerkini}`, accent: "--amber" },
  ];
  document.getElementById("ma-k-kpis").innerHTML = kpis.map((k) => `
    <div class="ma-kpi-card" style="--ma-accent:var(${k.accent})">
      <span class="ma-kpi-icon">${k.icon}</span><div class="ma-kpi-label">${k.label}</div>
      <div class="ma-kpi-value">${k.value}</div><div class="ma-kpi-sub">${k.sub}</div>
    </div>`).join("");

  maDrawTrendChart(monthRecords);

  const absentRows = monthRecords.filter((r) => r.namaList.length > 0).map((r) => ({ tarikh: r.tarikh, namaList: r.namaList, catatOleh: r.catatOleh }));
  const totalAbsentNames = absentRows.reduce((s, a) => s + a.namaList.length, 0);
  const tbody = document.getElementById("ma-k-absent-body");
  const emptyEl = document.getElementById("ma-k-empty");
  document.getElementById("ma-k-absentcount").textContent = `${totalAbsentNames} murid · ${absentRows.length} hari`;

  if (!absentRows.length) {
    tbody.innerHTML = "";
    emptyEl.style.display = "block";
  } else {
    emptyEl.style.display = "none";
    tbody.innerHTML = absentRows.map((a) => `
      <tr><td>${maFmtTarikh(a.tarikh)}</td><td>${MA_HARI[a.tarikh.getDay()]}</td>
      <td>${a.namaList.map((n) => `<span class="ma-chip">${n}</span>`).join("")}</td>
      <td>${a.catatOleh ? "@" + a.catatOleh.replace(/^@/, "") : "-"}</td></tr>`).join("");
  }
}
function maDrawTrendChart(monthRecords) {
  if (maChartLibFailed) { maChartFallbackMsg("ma-chartTrend", ".ma-chart-wrap"); return; }
  if (typeof Chart === "undefined") return;
  const ctx = document.getElementById("ma-chartTrend");
  if (maCharts.trend) maCharts.trend.destroy();
  maCharts.trend = new Chart(ctx, {
    type: "line",
    data: { labels: monthRecords.map((r) => r.tarikh.getDate()), datasets: [{ label: "% Kehadiran", data: monthRecords.map((r) => r.peratus), borderColor: maGetCss("--cyan"), backgroundColor: "rgba(43,232,208,0.12)", pointBackgroundColor: maGetCss("--cyan"), tension: 0.35, fill: true, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: "Tarikh", color: maGetCss("--text-dim") }, grid: { display: false }, ticks: { color: maGetCss("--text-dim") } }, y: { min: 0, max: 100, grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: maGetCss("--text-dim"), callback: (v) => v + "%" } } } },
  });
}

/* ---------------- PAGE: Analisis Tahunan/Bulanan ---------------- */
function maRenderTahunan() {
  if (!MA_RECORDS.length) return;
  const yearEl = document.getElementById("ma-t-year");
  const monthEl = document.getElementById("ma-t-month");
  if (!yearEl || !monthEl) return;
  const year = parseInt(yearEl.value, 10);
  const monthVal = monthEl.value;
  const monthSelected = monthVal !== "";
  const month = monthSelected ? parseInt(monthVal, 10) : null;

  const periodRecords = MA_RECORDS.filter((r) => r.tahun === year && (!monthSelected || r.bulan === month));
  const periodLabel = monthSelected ? `${MA_BULAN[month - 1]} ${year}` : `Tahun ${year} (Keseluruhan)`;
  document.getElementById("ma-t-periodlabel").textContent = periodLabel;

  const uniqDates = Array.from(new Set(periodRecords.map((r) => r.tarikhKey)));
  const hariDirekod = uniqDates.length;
  const jumlahHadirTotal = periodRecords.reduce((s, r) => s + r.hadir, 0);
  const jumlahTidakHadirTotal = periodRecords.reduce((s, r) => s + r.tidakHadir, 0);
  const jumlahMuridTotal = periodRecords.reduce((s, r) => s + r.jumlahMurid, 0);

  const purataKelasIsi = hariDirekod ? Math.round(periodRecords.length / hariDirekod) : 0;
  const purataHadir = hariDirekod ? Math.round(jumlahHadirTotal / hariDirekod) : 0;
  const purataTidakHadir = hariDirekod ? Math.round(jumlahTidakHadirTotal / hariDirekod) : 0;
  const purataMurid = hariDirekod ? Math.round(jumlahMuridTotal / hariDirekod) : 0;
  const peratusKeseluruhan = maPct(jumlahHadirTotal, jumlahMuridTotal);

  const kpis = [
    { icon: "🏫", label: "Purata Kelas Mengisi", value: `${purataKelasIsi}<small> / ${MA_TOTAL_KELAS_TETAP}</small>`, sub: `Purata sehari (${hariDirekod} hari direkod)`, accent: "--cyan" },
    { icon: "✅", label: "Purata Hadir", value: `${purataHadir}<small> orang</small>`, sub: "Purata murid hadir sehari", accent: "--mint" },
    { icon: "❌", label: "Purata Tidak Hadir", value: `${purataTidakHadir}<small> orang</small>`, sub: "Purata murid tidak hadir sehari", accent: "--danger" },
    { icon: "👥", label: "Purata Jumlah Murid", value: `${purataMurid}<small> orang</small>`, sub: "Purata direkodkan sehari", accent: "--amber" },
    { icon: "📊", label: "Peratus Kehadiran", value: `${peratusKeseluruhan}<small>%</small>`, sub: `Kehadiran ${monthSelected ? "bulan" : "tahun"} ini`, accent: "--blue" },
  ];
  const donutCardHtmlT = `
    <div class="ma-kpi-card ma-kpi-donut-card">
      <div class="ma-kpi-label">Nisbah Hadir</div>
      <div class="ma-donut-mini-wrap"><canvas id="ma-chartDonutT"></canvas></div>
    </div>`;
  document.getElementById("ma-t-kpis").innerHTML = kpis.map((k) => `
    <div class="ma-kpi-card" style="--ma-accent:var(${k.accent})">
      <span class="ma-kpi-icon">${k.icon}</span><div class="ma-kpi-label">${k.label}</div>
      <div class="ma-kpi-value">${k.value}</div><div class="ma-kpi-sub">${k.sub}</div>
    </div>`).join("") + donutCardHtmlT;

  maDrawDonutChart(jumlahHadirTotal, jumlahTidakHadirTotal, { canvas: "ma-chartDonutT", key: "donutT" });

  const kelasIsiUnik = new Set(periodRecords.map((r) => r.kelas)).size;
  document.getElementById("ma-t-classcount").textContent = `${kelasIsiUnik} / ${MA_TOTAL_KELAS_TETAP} kelas ada rekod`;

  const periodAgg = {};

  function buildClassCardT(kName) {
    const recs = periodRecords.filter((r) => r.kelas === kName).sort((a, b) => a.tarikh - b.tarikh);
    if (!recs.length) {
      return `<div class="ma-class-card ma-empty" data-kelas="${kName}">
        <div class="ma-class-top"><span class="ma-class-name">${kName}</span><span class="ma-class-ting">T${maTingkatanOf(kName)}</span></div>
        <div class="ma-empty-mini">Tiada rekod</div></div>`;
    }
    const jumlahMuridTerkini = recs[recs.length - 1].jumlahMurid;
    const avgHadir = Math.round(recs.reduce((s, r) => s + r.hadir, 0) / recs.length);
    const avgTidakHadir = Math.round(recs.reduce((s, r) => s + r.tidakHadir, 0) / recs.length);
    const avgPeratus = Math.round((recs.reduce((s, r) => s + r.peratus, 0) / recs.length) * 10) / 10;
    const col = maRingColor(avgPeratus);

    const countMap = new Map();
    recs.forEach((r) => r.namaList.forEach((n) => { countMap.set(n, (countMap.get(n) || 0) + 1); }));
    const namaEntries = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    periodAgg[kName] = { kelas: kName, tingkatan: maTingkatanOf(kName), jumlahMuridTerkini, avgHadir, avgTidakHadir, avgPeratus, namaEntries, hariDirekod: recs.length };

    return `<div class="ma-class-card" data-kelas="${kName}">
      <div class="ma-class-top"><span class="ma-class-name">${kName}</span><span class="ma-class-ting">T${maTingkatanOf(kName)}</span></div>
      <div class="ma-mini-pct" style="color:${col}">${avgPeratus}%</div>
      <div class="ma-mini-stats"><b>${avgHadir}</b> hadir · <b>${avgTidakHadir}</b> t.hadir (purata)</div>
    </div>`;
  }

  const groups = {};
  MA_ALL_CLASSES.forEach((kName) => { const t = maTingkatanOf(kName); (groups[t] = groups[t] || []).push(kName); });
  const grid = document.getElementById("ma-t-classgrid");
  grid.innerHTML = Object.keys(groups).sort((a, b) => a - b).map((t) => {
    const cards = groups[t].map(buildClassCardT).join("");
    return `<div class="ma-ting-group"><div class="ma-ting-heading">Tingkatan ${t}</div><div class="ma-class-grid">${cards}</div></div>`;
  }).join("");

  maLastPeriodAgg = periodAgg;
  maLastPeriodLabel = periodLabel;
}

/* ---------------- Modal kad kelas (Page Utama) ---------------- */
function maOpenClassModal(kName) {
  const rec = maLastDayRecords.find((r) => r.kelas === kName);
  const box = document.getElementById("ma-modal-content");
  if (!rec) {
    box.innerHTML = `<div class="ma-modal-date">${maLastDayLabel}</div><div class="ma-modal-classname">${kName}</div>
      <div class="ma-empty-state" style="padding:34px 0;">🌙 Tiada rekod kehadiran bagi kelas ini pada tarikh yang dipilih.</div>`;
  } else {
    const p = rec.peratus;
    const circumference = 2 * Math.PI * 40;
    const dash = (p / 100) * circumference;
    const col = maRingColor(p);
    const namaHTML = rec.namaList.length
      ? `<div class="ma-modal-absent-list">${rec.namaList.map((n) => `<span class="ma-chip">${n}</span>`).join("")}</div>`
      : `<div style="color:var(--text-dim);">Tiada murid tidak hadir — kehadiran penuh 🎉</div>`;
    box.innerHTML = `
      <div class="ma-modal-date">${maLastDayLabel}</div>
      <div class="ma-modal-classname">${rec.kelas} <span class="ma-class-ting">Ting. ${rec.tingkatan}</span></div>
      <div class="ma-modal-ring-row">
        <div class="ma-modal-ring"><svg viewBox="0 0 96 96">
          <circle class="ma-ring-bg" cx="48" cy="48" r="40"></circle>
          <circle class="ma-ring-fg" cx="48" cy="48" r="40" stroke="${col}" stroke-dasharray="${dash} ${circumference}"></circle>
        </svg><div class="ma-modal-ring-label">${p}<small>PERATUS</small></div></div>
        <div class="ma-modal-stats">
          <div class="ma-modal-stat-line"><span class="lbl">Jumlah Murid</span><span class="val">${rec.jumlahMurid}</span></div>
          <div class="ma-modal-stat-line"><span class="lbl">Bil. Hadir</span><span class="val ma-val-green">${rec.hadir} (${maPct(rec.hadir, rec.jumlahMurid)}%)</span></div>
          <div class="ma-modal-stat-line"><span class="lbl">Bil. Tidak Hadir</span><span class="val ma-val-red">${rec.tidakHadir} (${maPct(rec.tidakHadir, rec.jumlahMurid)}%)</span></div>
        </div>
      </div>
      <div class="ma-modal-absent-title">Nama Murid Tidak Hadir</div>
      ${namaHTML}
      <div class="ma-modal-recorder">◈ Direkodkan oleh: ${rec.catatOleh ? "@" + rec.catatOleh.replace(/^@/, "") : "-"}</div>`;
  }
  document.getElementById("ma-modal-overlay").classList.add("show");
}
function maCloseClassModal() { document.getElementById("ma-modal-overlay").classList.remove("show"); }

function maOpenClassModalPeriod(kName) {
  const agg = maLastPeriodAgg[kName];
  const box = document.getElementById("ma-modal-content");
  if (!agg) {
    box.innerHTML = `<div class="ma-modal-date">${maLastPeriodLabel}</div><div class="ma-modal-classname">${kName}</div>
      <div class="ma-empty-state" style="padding:34px 0;">🌙 Tiada rekod bagi kelas ini pada tempoh yang dipilih.</div>`;
  } else {
    const p = agg.avgPeratus;
    const circumference = 2 * Math.PI * 40;
    const dash = (p / 100) * circumference;
    const col = maRingColor(p);
    const namaHTML = agg.namaEntries.length
      ? `<div class="ma-modal-absent-list">${agg.namaEntries.map(([n, c]) => `<span class="ma-chip">${n} (${c})</span>`).join("")}</div>`
      : `<div style="color:var(--text-dim);">Tiada murid tidak hadir sepanjang tempoh ini 🎉</div>`;
    box.innerHTML = `
      <div class="ma-modal-date">${maLastPeriodLabel}</div>
      <div class="ma-modal-classname">${agg.kelas} <span class="ma-class-ting">Ting. ${agg.tingkatan}</span></div>
      <div class="ma-modal-ring-row">
        <div class="ma-modal-ring"><svg viewBox="0 0 96 96">
          <circle class="ma-ring-bg" cx="48" cy="48" r="40"></circle>
          <circle class="ma-ring-fg" cx="48" cy="48" r="40" stroke="${col}" stroke-dasharray="${dash} ${circumference}"></circle>
        </svg><div class="ma-modal-ring-label">${p}<small>PURATA %</small></div></div>
        <div class="ma-modal-stats">
          <div class="ma-modal-stat-line"><span class="lbl">Jumlah Murid</span><span class="val">${agg.jumlahMuridTerkini}</span></div>
          <div class="ma-modal-stat-line"><span class="lbl">Purata Hadir</span><span class="val ma-val-green">${agg.avgHadir}</span></div>
          <div class="ma-modal-stat-line"><span class="lbl">Purata Tidak Hadir</span><span class="val ma-val-red">${agg.avgTidakHadir}</span></div>
          <div class="ma-modal-stat-line"><span class="lbl">Hari Direkodkan</span><span class="val">${agg.hariDirekod}</span></div>
        </div>
      </div>
      <div class="ma-modal-absent-title">Nama Tidak Hadir (kekerapan)</div>
      ${namaHTML}`;
  }
  document.getElementById("ma-modal-overlay").classList.add("show");
}

/* ---------------- Init (dipanggil dari halaman induk bila tab Analisis dibuka) ---------------- */
let maBooted = false;
function maBoot() {
  if (maBooted) return;
  maBooted = true;

  document.querySelectorAll(".ma-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => maSwitchSubtab(btn.dataset.matab));
  });
  const refreshBtn = document.getElementById("ma-refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", (e) => {
      e.currentTarget.classList.add("spinning");
      maFetchSheetData().finally(() => setTimeout(() => e.currentTarget.classList.remove("spinning"), 600));
    });
  }
  document.getElementById("ma-u-classgrid").addEventListener("click", (e) => {
    const card = e.target.closest(".ma-class-card");
    if (card && card.dataset.kelas) maOpenClassModal(card.dataset.kelas);
  });
  document.getElementById("ma-t-classgrid").addEventListener("click", (e) => {
    const card = e.target.closest(".ma-class-card");
    if (card && card.dataset.kelas) maOpenClassModalPeriod(card.dataset.kelas);
  });
  document.getElementById("ma-modal-close").addEventListener("click", maCloseClassModal);
  document.getElementById("ma-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "ma-modal-overlay") maCloseClassModal();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") maCloseClassModal(); });

  maEnsureChartLib();
  maFetchSheetData();
  setInterval(maFetchSheetData, MA_AUTO_REFRESH_MS);
}

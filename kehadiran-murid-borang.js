/* ================= Konfigurasi & fetch data ================= */
const KM_SHEET_ID = "1ZjUjYPY5QBxOrOIDI6PixpS5ygdatAsZ4HT_uT-iMMA";

let kmData = { kelas: [], kehadiran: [] };
let kmLoaded = false;
let kmError = null;

async function kmFetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${KM_SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  const text = await res.text();
  const jsonString = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(jsonString).table.rows;
}

function kmParseDate(cellValue) {
  if (!cellValue) return null;
  if (typeof cellValue === "string" && cellValue.indexOf("Date") === 0) {
    const parts = cellValue.match(/Date\((\d+),(\d+),(\d+)/);
    if (parts) {
      const y = parts[1];
      const m = String(parseInt(parts[2]) + 1).padStart(2, "0");
      const d = String(parts[3]).padStart(2, "0");
      return `${d}/${m}/${y}`;
    }
  }
  return null;
}

async function kmLoadAll() {
  try {
    const [kelasRows, kehadiranRows] = await Promise.all([
      kmFetchSheet("Kelas"),
      kmFetchSheet("Kehadiran"),
    ]);

    // Kelas: kolum A = nama, kolum B = bilangan murid. Kesan header secara defensif.
    let kelasList = kelasRows.map(r => ({
      nama: r.c[0] && r.c[0].v ? String(r.c[0].v).trim() : "",
      bilangan: r.c[1] && typeof r.c[1].v === "number" ? r.c[1].v : Number(r.c[1] && r.c[1].v) || 0,
    })).filter(k => k.nama);
    if (kelasList.length && kelasList[0].bilangan === 0 && isNaN(Number(kelasRows[0].c[1] && kelasRows[0].c[1].v))) {
      kelasList = kelasList.slice(1); // baris pertama nampak macam header, buang
    }
    kmData.kelas = kelasList;

    // Kehadiran: kolum A=Tarikh,B=Kelas,C=Hadir,D=TidakHadir,E=Nama,F=Jumlah,G=Peratus,H=DirekodOleh
    kmData.kehadiran = kehadiranRows
      .map(r => ({
        tarikh: kmParseDate(r.c[0] && r.c[0].v),
        kelas: r.c[1] && r.c[1].v ? String(r.c[1].v).trim() : "",
        hadir: Number(r.c[2] && r.c[2].v) || 0,
        tidak: Number(r.c[3] && r.c[3].v) || 0,
        nama: (r.c[4] && r.c[4].v) || "",
        direkodOleh: (r.c[7] && r.c[7].v) || "Tidak diketahui",
      }))
      .filter(r => r.tarikh && r.kelas);

    kmLoaded = true;
  } catch (e) {
    kmError = 'Gagal muat data. Pastikan Sheet dikongsi sebagai "Anyone with the link" (Viewer).';
  }
}

function kmCalcPercent(hadir, tidak) {
  const jumlah = hadir + tidak;
  return jumlah ? ((hadir / jumlah) * 100).toFixed(2) + "%" : "0%";
}
function kmPctClass(pct) {
  const n = parseFloat(pct);
  if (n >= 90) return "pct-good";
  if (n >= 75) return "pct-mid";
  return "pct-bad";
}
function kmHari(tarikhStr) {
  const [d, m, y] = tarikhStr.split("/").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const hari = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
  return hari[dateObj.getDay()];
}
function kmSortedDates() {
  const set = new Set(kmData.kehadiran.map(r => r.tarikh));
  const arr = [...set];
  arr.sort((a, b) => {
    const [da, ma, ya] = a.split("/").map(Number);
    const [db, mb, yb] = b.split("/").map(Number);
    return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
  });
  return arr.reverse(); // terbaru dahulu
}
function kmEscape(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ================= State & navigasi ================= */
let KM_S = {
  screen: "menu",
  history: [],
  mode: null,        // 'new' | 'edit'
  kelas: null,
  tarikh: null,
  bilMurid: 0,
  hadir: null,
  tidak: null,
  nama: "",
  editingRow: null,
  tarikhPage: 0,      // untuk pilih tarikh (edit / analisis), 5/muka
  analisisTarikh: null,
  analisisJenis: null,
  analisisSemuaPage: 0, // 9/muka
};

const KM_TITLES = {
  menu: "Menu Utama", pilihKelasBaru: "Pilih Kelas", askHadir: "Isi Kehadiran",
  askTidak: "Isi Kehadiran", askNama: "Isi Kehadiran", ringkasan: "Ringkasan",
  editPilihTarikh: "Edit — Pilih Tarikh", editPilihKelas: "Edit — Pilih Kelas",
  analisisPilihTarikh: "Analisis — Pilih Tarikh", analisisJenis: "Analisis Kehadiran",
  analisisPilihKelas: "Analisis Kelas", analisisSatuKelas: "Analisis Kelas",
  analisisSemua: "Analisis Keseluruhan",
};

function kmGoto(screen, pushHistory = true) {
  if (pushHistory && KM_S.screen !== screen) KM_S.history.push(KM_S.screen);
  KM_S.screen = screen;
  const titleEl = document.getElementById("km-topbar-title");
  const backEl = document.getElementById("km-btn-back");
  if (titleEl) titleEl.textContent = KM_TITLES[screen] || "Kehadiran Murid";
  if (backEl) backEl.classList.toggle("hidden", screen === "menu");
  kmRender();
}
function kmGoBack() {
  const prev = KM_S.history.pop();
  kmGoto(prev || "menu", false);
}
function kmResetToMenu() {
  KM_S = { ...KM_S, mode: null, kelas: null, tarikh: null, bilMurid: 0, hadir: null, tidak: null, nama: "", editingRow: null, history: [] };
  kmGoto("menu", false);
}

/* ================= Render dispatcher ================= */
function kmRender() {
  const c = document.getElementById("km-content");
  if (!kmLoaded && !kmError) {
    c.innerHTML = `<div class="loading-state"><div class="spinner"></div>Memuat data kelas &amp; kehadiran...</div>`;
    return;
  }
  if (kmError) {
    c.innerHTML = `<div class="empty-state">❌ ${kmError}</div>`;
    return;
  }
  const renderers = {
    menu: renderMenu, pilihKelasBaru: renderPilihKelasBaru,
    askHadir: renderAskHadir, askTidak: renderAskTidak, askNama: renderAskNama,
    ringkasan: renderRingkasan,
    editPilihTarikh: renderEditPilihTarikh, editPilihKelas: renderEditPilihKelas,
    analisisPilihTarikh: renderAnalisisPilihTarikh, analisisJenis: renderAnalisisJenis,
    analisisPilihKelas: renderAnalisisPilihKelas, analisisSatuKelas: renderAnalisisSatuKelas,
    analisisSemua: renderAnalisisSemua,
  };
  (renderers[KM_S.screen] || renderMenu)(c);
}

/* ================= Screen: Menu Utama ================= */
function renderMenu(c) {
  const today = new Date();
  const hari = today.toLocaleDateString("ms-MY", { weekday: "long" });
  const tarikhFmt = today.toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
  c.innerHTML = `
    <div class="glass card-pad" style="margin-bottom:var(--gap)">
      <div class="title-lg">🏫 Sistem Kehadiran Murid</div>
      <div class="sub-dim" style="margin-bottom:0">Hari: <b style="color:var(--text)">${hari}</b><br>Tarikh: <b style="color:var(--text)">${tarikhFmt}</b></div>
    </div>
    <div class="module-grid">
      <div class="module-tile" onclick="startIsiBorang()" style="grid-column:1 / -1"><span data-icon="announce"></span><span class="module-tile-label">Isi Borang Kehadiran</span></div>
      <div class="module-tile" onclick="kmGoto('editPilihTarikh')"><span data-icon="calendar"></span><span class="module-tile-label">Edit Kehadiran</span></div>
      <div class="module-tile" onclick="kmGoto('analisisPilihTarikh')"><span data-icon="chart"></span><span class="module-tile-label">Analisis Kehadiran</span></div>
    </div>
  `;
  renderIcons();
}

/* ================= Flow: Isi Borang ================= */
function startIsiBorang() {
  KM_S.mode = "new";
  KM_S.kelas = null; KM_S.hadir = null; KM_S.tidak = null; KM_S.nama = ""; KM_S.editingRow = null;
  kmGoto("pilihKelasBaru");
}

function renderPilihKelasBaru(c) {
  const tiles = kmData.kelas.map(k =>
    `<div class="tile" onclick="pilihKelasBaru('${kmEscape(k.nama)}', ${k.bilangan})">${kmEscape(k.nama)}<span class="tile-sub">${k.bilangan} orang</span></div>`
  ).join("");
  c.innerHTML = `<div class="grid2">${tiles || '<div class="empty-state">Tiada senarai kelas dalam Sheet.</div>'}</div>`;
}
function pilihKelasBaru(kelas, bilangan) {
  KM_S.kelas = kelas; KM_S.bilMurid = bilangan;
  KM_S.tarikh = new Date().toLocaleDateString("en-GB").split("/").join("/"); // dd/mm/yyyy
  kmGoto("askHadir");
}

function renderAskHadir(c) {
  c.innerHTML = `
    <div class="context-chip">${kmEscape(KM_S.kelas)} · ${KM_S.bilMurid} orang</div>
    <div class="glass card-pad">
      <div class="sub-dim" style="margin-bottom:14px">Masukkan bilangan <b style="color:var(--text)">hadir</b> hari ini. Nombor sahaja (bukan pecahan cth 29/30).</div>
      <input class="field-input" type="number" min="0" id="input-hadir" placeholder="Contoh: 28" value="${KM_S.hadir ?? ''}">
    </div>
    <div class="btn-stack">
      <button class="btn-primary" onclick="submitHadir()">Seterusnya</button>
      <button class="btn-danger" onclick="kmResetToMenu()">Batal</button>
    </div>`;
}
function submitHadir() {
  const v = parseInt(document.getElementById("input-hadir").value);
  if (isNaN(v) || v < 0) return alert("Sila masukkan nombor sah.");
  KM_S.hadir = v;
  kmGoto("askTidak");
}

function renderAskTidak(c) {
  c.innerHTML = `
    <div class="context-chip">${kmEscape(KM_S.kelas)} · ${KM_S.bilMurid} orang</div>
    <div class="glass card-pad">
      <div class="sub-dim" style="margin-bottom:14px">Masukkan bilangan <b style="color:var(--text)">tidak hadir</b> hari ini.</div>
      <input class="field-input" type="number" min="0" id="input-tidak" placeholder="Contoh: 2" value="${KM_S.tidak ?? ''}">
    </div>
    <div class="btn-stack">
      <button class="btn-primary" onclick="submitTidak()">Seterusnya</button>
      <button class="btn-danger" onclick="kmResetToMenu()">Batal</button>
    </div>`;
}
function submitTidak() {
  const v = parseInt(document.getElementById("input-tidak").value);
  if (isNaN(v) || v < 0) return alert("Sila masukkan nombor sah.");
  KM_S.tidak = v;
  kmGoto("askNama");
}

function renderAskNama(c) {
  c.innerHTML = `
    <div class="context-chip">${kmEscape(KM_S.kelas)} · ${KM_S.bilMurid} orang</div>
    <div class="glass card-pad">
      <div class="sub-dim" style="margin-bottom:14px">Nama murid tidak hadir (pisah guna koma). Tulis <b style="color:var(--text)">Tiada</b> jika semua hadir.</div>
      <textarea class="field-input" id="input-nama" placeholder="Contoh: Ali, Ahmad, Siti">${kmEscape(KM_S.nama || '')}</textarea>
    </div>
    <div class="btn-stack">
      <button class="btn-primary" onclick="submitNama()">${KM_S.mode === 'edit' ? 'Kemaskini' : 'Hantar'}</button>
      <button class="btn-danger" onclick="kmResetToMenu()">Batal</button>
    </div>`;
}
function submitNama() {
  const v = document.getElementById("input-nama").value.trim();
  KM_S.nama = v.toLowerCase() === "tiada" ? "" : v;
  // SIMULASI simpan — belum tulis balik ke Sheet sebenar
  kmGoto("ringkasan");
}

function renderRingkasan(c) {
  const pct = kmCalcPercent(KM_S.hadir, KM_S.tidak);
  c.innerHTML = `
    <div class="glass card-pad">
      <div class="title-lg">✅ ${KM_S.mode === 'edit' ? 'Rekod Dikemaskini' : 'Rekod Diterima'} <span style="font-size:11px;color:var(--amber);font-weight:600">(simulasi)</span></div>
      <div class="sub-dim">${kmEscape(KM_S.kelas)} (${KM_S.bilMurid} orang) — ${KM_S.tarikh}</div>
      <div style="margin-top:14px">
        <div class="summary-row"><span class="lbl">Hadir</span><span>${KM_S.hadir}/${KM_S.bilMurid}</span></div>
        <div class="summary-row"><span class="lbl">Tidak Hadir</span><span>${KM_S.tidak}/${KM_S.bilMurid}</span></div>
        <div class="summary-row"><span class="lbl">Nama Tidak Hadir</span><span style="text-align:right;max-width:60%">${kmEscape(KM_S.nama || 'Tiada')}</span></div>
        <div class="summary-row"><span class="lbl">% Kehadiran</span><span class="pct-badge ${kmPctClass(pct)}">${pct}</span></div>
        <div class="summary-row"><span class="lbl">Direkod oleh</span><span>Awak (staf log masuk)</span></div>
      </div>
    </div>
    <div class="btn-stack">
      <button class="btn-primary" onclick="editRingkasan()">✏️ Edit</button>
      <button class="btn-ghost" onclick="startIsiBorang()">🔙 Kembali Pilih Kelas</button>
      <button class="btn-ghost" onclick="kmResetToMenu()">🏠 Menu Utama</button>
    </div>
  `;
}
function editRingkasan() {
  KM_S.mode = "edit";
  kmGoto("askHadir");
}

/* ================= Flow: Edit Kehadiran ================= */
function renderEditPilihTarikh(c) { renderTarikhPager(c, "editPilihKelas", true); }

function renderTarikhPager(c, nextScreen) {
  const dates = kmSortedDates();
  if (!dates.length) { c.innerHTML = '<div class="empty-state">Tiada data untuk dipilih.</div>'; return; }
  const PAGE = 5;
  const totalPages = Math.ceil(dates.length / PAGE);
  if (KM_S.tarikhPage >= totalPages) KM_S.tarikhPage = totalPages - 1;
  if (KM_S.tarikhPage < 0) KM_S.tarikhPage = 0;
  const pageDates = dates.slice(KM_S.tarikhPage * PAGE, KM_S.tarikhPage * PAGE + PAGE);
  const items = pageDates.map(d =>
    `<div class="date-list-item" onclick="pilihTarikhUntuk('${nextScreen}', '${d}')"><span>${d}</span><span class="hari">${kmHari(d)}</span></div>`
  ).join("");
  const nav = `<div class="btn-row">
    ${KM_S.tarikhPage > 0 ? `<button class="btn-ghost" onclick="KM_S.tarikhPage--; kmRender()">⬅️ Sebelum</button>` : ""}
    ${KM_S.tarikhPage < totalPages - 1 ? `<button class="btn-ghost" onclick="KM_S.tarikhPage++; kmRender()">➡️ Lagi</button>` : ""}
  </div>`;
  c.innerHTML = `<div style="margin-bottom:10px" class="sub-dim">Muka ${KM_S.tarikhPage + 1}/${totalPages}</div>${items}${nav}`;
}
function pilihTarikhUntuk(nextScreen, tarikh) {
  if (nextScreen === "editPilihKelas") { KM_S.tarikh = tarikh; kmGoto("editPilihKelas"); }
  else { KM_S.analisisTarikh = tarikh; kmGoto("analisisJenis"); }
}

function renderEditPilihKelas(c) {
  const kelasDenganData = new Set(kmData.kehadiran.filter(r => r.tarikh === KM_S.tarikh).map(r => r.kelas));
  const list = kmData.kelas.filter(k => kelasDenganData.has(k.nama));
  if (!list.length) { c.innerHTML = `<div class="empty-state">Tiada data kelas untuk ${KM_S.tarikh}.</div>`; return; }
  const tiles = list.map(k => `<div class="tile" onclick="pilihKelasEdit('${kmEscape(k.nama)}', ${k.bilangan})">${kmEscape(k.nama)}<span class="tile-sub">${k.bilangan} orang</span></div>`).join("");
  c.innerHTML = `<div class="sub-dim" style="margin-bottom:10px">Tarikh: <b style="color:var(--text)">${KM_S.tarikh}</b></div><div class="grid2">${tiles}</div>`;
}
function pilihKelasEdit(kelas, bilangan) {
  const rec = kmData.kehadiran.find(r => r.tarikh === KM_S.tarikh && r.kelas === kelas);
  KM_S.mode = "edit"; KM_S.kelas = kelas; KM_S.bilMurid = bilangan;
  KM_S.hadir = rec ? rec.hadir : 0;
  KM_S.tidak = rec ? rec.tidak : 0;
  KM_S.nama = rec ? rec.nama : "";
  kmGoto("askHadir");
}

/* ================= Flow: Analisis Kehadiran ================= */
function renderAnalisisPilihTarikh(c) { renderTarikhPager(c, "analisisJenis"); }

function renderAnalisisJenis(c) {
  c.innerHTML = `
    <div class="sub-dim" style="margin-bottom:14px">Tarikh dipilih: <b style="color:var(--text)">${KM_S.analisisTarikh}</b></div>
    <div class="btn-stack">
      <button class="btn-primary" onclick="KM_S.analisisJenis='kelas'; kmGoto('analisisPilihKelas')">📚 Analisis Kelas</button>
      <button class="btn-primary" onclick="KM_S.analisisJenis='semua'; KM_S.analisisSemuaPage=0; kmGoto('analisisSemua')">📊 Analisis Keseluruhan</button>
      <button class="btn-ghost" onclick="kmGoto('analisisPilihTarikh')">📅 Pilih Tarikh Lain</button>
    </div>
  `;
}

function renderAnalisisPilihKelas(c) {
  const kelasDenganData = new Set(kmData.kehadiran.filter(r => r.tarikh === KM_S.analisisTarikh).map(r => r.kelas));
  const list = kmData.kelas.filter(k => kelasDenganData.has(k.nama));
  if (!list.length) { c.innerHTML = `<div class="empty-state">Tiada data kelas untuk ${KM_S.analisisTarikh}.</div>`; return; }
  const tiles = list.map(k => `<div class="tile" onclick="KM_S.kelas='${kmEscape(k.nama)}'; kmGoto('analisisSatuKelas')">${kmEscape(k.nama)}</div>`).join("");
  c.innerHTML = `<div class="grid2">${tiles}</div>`;
}

function renderAnalisisSatuKelas(c) {
  const rec = kmData.kehadiran.find(r => r.tarikh === KM_S.analisisTarikh && r.kelas === KM_S.kelas);
  const kelasInfo = kmData.kelas.find(k => k.nama === KM_S.kelas);
  const bilMurid = kelasInfo ? kelasInfo.bilangan : 0;
  if (!rec) { c.innerHTML = `<div class="empty-state">Tiada data untuk ${KM_S.kelas} (${KM_S.analisisTarikh}).</div>`; return; }
  const pct = kmCalcPercent(rec.hadir, rec.tidak);
  c.innerHTML = `
    <div class="glass card-pad">
      <div class="title-lg">📚 ${kmEscape(KM_S.kelas)}</div>
      <div class="sub-dim">${KM_S.analisisTarikh}</div>
      <div style="margin-top:14px">
        <div class="summary-row"><span class="lbl">Hadir</span><span>${rec.hadir}/${bilMurid}</span></div>
        <div class="summary-row"><span class="lbl">Tidak Hadir</span><span>${rec.tidak}/${bilMurid}</span></div>
        <div class="summary-row"><span class="lbl">% Kehadiran</span><span class="pct-badge ${kmPctClass(pct)}">${pct}</span></div>
        <div class="summary-row"><span class="lbl">Direkod oleh</span><span>${kmEscape(rec.direkodOleh)}</span></div>
      </div>
      ${rec.nama ? `<div class="names-missing">Tidak hadir: ${kmEscape(rec.nama)}</div>` : ""}
    </div>`;
}

function renderAnalisisSemua(c) {
  const rows = kmData.kehadiran.filter(r => r.tarikh === KM_S.analisisTarikh);
  const kelasList = kmData.kelas;
  const totalHadir = rows.reduce((s, r) => s + r.hadir, 0);
  const totalTidak = rows.reduce((s, r) => s + r.tidak, 0);
  const totalMurid = totalHadir + totalTidak;
  const pctKeseluruhan = kmCalcPercent(totalHadir, totalTidak);
  const kelasDiIsi = kelasList.filter(k => rows.some(r => r.kelas === k.nama)).length;

  const PAGE = 9;
  const totalPages = Math.ceil(kelasList.length / PAGE) || 1;
  if (KM_S.analisisSemuaPage >= totalPages) KM_S.analisisSemuaPage = totalPages - 1;
  if (KM_S.analisisSemuaPage < 0) KM_S.analisisSemuaPage = 0;
  const pageKelas = kelasList.slice(KM_S.analisisSemuaPage * PAGE, KM_S.analisisSemuaPage * PAGE + PAGE);

  const blocks = pageKelas.map(k => {
    const r = rows.find(r => r.kelas === k.nama);
    if (!r) return `<div class="class-report"><div class="class-report-title">${kmEscape(k.nama)} (${k.bilangan} orang)</div><div class="sub-dim" style="font-size:12px">Data belum diisi.</div></div>`;
    const pct = kmCalcPercent(r.hadir, r.tidak);
    return `<div class="class-report">
      <div class="class-report-title">${kmEscape(k.nama)} (${k.bilangan} orang)</div>
      <div class="summary-row"><span class="lbl">Hadir</span><span>${r.hadir}/${k.bilangan}</span></div>
      <div class="summary-row"><span class="lbl">Tidak Hadir</span><span>${r.tidak}/${k.bilangan}</span></div>
      <div class="summary-row"><span class="lbl">% Kehadiran</span><span class="pct-badge ${kmPctClass(pct)}">${pct}</span></div>
      ${r.nama ? `<div class="names-missing">Tidak hadir: ${kmEscape(r.nama)}</div>` : ""}
    </div>`;
  }).join("");

  const nav = `<div class="btn-row" style="margin-top:var(--gap)">
    ${KM_S.analisisSemuaPage > 0 ? `<button class="btn-ghost" onclick="KM_S.analisisSemuaPage--; kmRender()">⬅️ Sebelum</button>` : ""}
    ${KM_S.analisisSemuaPage < totalPages - 1 ? `<button class="btn-ghost" onclick="KM_S.analisisSemuaPage++; kmRender()">➡️ Lagi</button>` : ""}
  </div>`;

  c.innerHTML = `
    <div class="top-overview">
      <div class="ov-card"><div class="ov-val">${kelasDiIsi}/${kelasList.length}</div><div class="ov-lbl">Kelas Diisi</div></div>
      <div class="ov-card"><div class="ov-val">${totalMurid}</div><div class="ov-lbl">Jumlah Murid</div></div>
      <div class="ov-card"><div class="ov-val" style="color:var(--mint)">${pctKeseluruhan}</div><div class="ov-lbl">% Kehadiran</div></div>
    </div>
    <div class="sub-dim" style="margin-bottom:10px">${KM_S.analisisTarikh} · Muka ${KM_S.analisisSemuaPage + 1}/${totalPages}</div>
    <div class="glass card-pad">${blocks}</div>
    ${nav}
  `;
}

/* ================= Mula ================= */
(async function boot() {
  kmRender();
  await kmLoadAll();
  kmRender();
})();

/* ================= Konfigurasi & fetch data ================= */
const KM_SHEET_ID = "1ZjUjYPY5QBxOrOIDI6PixpS5ygdatAsZ4HT_uT-iMMA";

// GANTI dengan URL Web App selepas deploy Code-KehadiranMurid.gs (projek Apps Script BERASINGAN)
const KM_API_URL = "PASTE_URL_APPS_SCRIPT_KEHADIRAN_MURID_ANDA_DI_SINI";
function kmApiConfigured() { return KM_API_URL && KM_API_URL.indexOf("PASTE_") !== 0; }

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
  tarikhPage: 0,      // untuk pilih tarikh (edit), 5/muka
};

const KM_TITLES = {
  menu: "Menu Utama", pilihKelasBaru: "Pilih Kelas", askHadir: "Isi Kehadiran",
  askTidak: "Isi Kehadiran", askNama: "Isi Kehadiran", ringkasan: "Ringkasan",
  editPilihTarikh: "Edit — Pilih Tarikh", editPilihKelas: "Edit — Pilih Kelas",
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
  };
  (renderers[KM_S.screen] || renderMenu)(c);
}

/* ================= Screen: Menu Utama ================= */
function renderMenu(c) {
  const today = new Date();
  const KM_HARI = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
  const KM_BULAN_SHORT = ["Jan","Feb","Mac","Apr","Mei","Jun","Jul","Ogos","Sept","Okt","Nov","Dis"];
  const hari = KM_HARI[today.getDay()];
  const tarikhFmt = `${today.getDate()} ${KM_BULAN_SHORT[today.getMonth()]} ${today.getFullYear()}`;
  const todayKey = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  const totalKelas = kmData.kelas.length;
  const kelasIsiSet = new Set(kmData.kehadiran.filter((r) => r.tarikh === todayKey).map((r) => r.kelas));
  const kelasIsiCount = kmData.kelas.filter((k) => kelasIsiSet.has(k.nama)).length;
  const kelasBelumIsi = kmData.kelas.filter((k) => !kelasIsiSet.has(k.nama));
  const pctIsi = totalKelas ? Math.round((kelasIsiCount / totalKelas) * 100) : 0;

  const belumIsiHtml = kelasBelumIsi.length
    ? kelasBelumIsi.map((k) => `<span class="km-chip">${k.nama}</span>`).join("")
    : `<div class="km-all-done">🎉 Semua kelas telah isi kehadiran hari ini!</div>`;

  c.innerHTML = `
    <div class="km-menu-title">
      <div class="title-lg">🏫 Sistem Kehadiran Murid</div>
      <div class="sub-dim" style="margin-bottom:0">Hari: <b style="color:var(--text)">${hari}</b> &middot; Tarikh: <b style="color:var(--text)">${tarikhFmt}</b></div>
    </div>

    <div class="glass card-pad km-status-card">
      <div class="km-status-row">
        <div class="km-status-num">${kelasIsiCount}<span class="km-status-of">/${totalKelas}</span></div>
        <div class="km-status-label">Kelas Telah Isi<br>Kehadiran Hari Ini</div>
      </div>
      <div class="km-progress-bar"><div class="km-progress-fill" style="width:${pctIsi}%"></div></div>
    </div>

    <div class="section-label" style="margin-top:var(--gap)">Kelas Belum Isi</div>
    <div class="km-belum-list">${belumIsiHtml}</div>

    <div class="section-label" style="margin-top:var(--gap)">Tindakan</div>
    <div class="km-action-grid">
      <div class="module-tile" onclick="startIsiBorang()"><span data-icon="announce"></span><span class="module-tile-label">Isi Borang Kehadiran</span></div>
      <div class="module-tile" onclick="kmGoto('editPilihTarikh')"><span data-icon="calendar"></span><span class="module-tile-label">Edit Kehadiran</span></div>
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
async function submitNama() {
  const v = document.getElementById("input-nama").value.trim();
  KM_S.nama = v.toLowerCase() === "tiada" ? "" : v;

  if (!kmApiConfigured()) {
    KM_S.saveError = "API Kehadiran Murid belum disambungkan (KM_API_URL belum diisi).";
    kmGoto("ringkasan");
    return;
  }

  const btn = document.querySelector('#km-content button[onclick="submitNama()"]');
  if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }

  const user = getSavedUser();
  try {
    const res = await fetch(KM_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "saveKehadiran",
        kelas: KM_S.kelas,
        tarikh: KM_S.tarikh,
        hadir: KM_S.hadir,
        tidakHadir: KM_S.tidak,
        namaTidakHadir: KM_S.nama,
        direkodOleh: (user && user.nama) || (user && user.email) || "",
      }),
    });
    const data = await res.json();
    if (data.success) {
      KM_S.saveError = null;
      // Kemas kini cache tempatan supaya Menu Utama terus tepat tanpa reload
      kmData.kehadiran = kmData.kehadiran.filter((r) => !(r.tarikh === KM_S.tarikh && r.kelas === KM_S.kelas));
      kmData.kehadiran.push({ tarikh: KM_S.tarikh, kelas: KM_S.kelas, hadir: KM_S.hadir, tidak: KM_S.tidak, nama: KM_S.nama, direkodOleh: (user && user.nama) || "" });
    } else {
      KM_S.saveError = data.message || "Gagal simpan ke Sheet.";
    }
  } catch (err) {
    KM_S.saveError = "Ralat sambungan ke server.";
  }

  if (btn) { btn.disabled = false; btn.textContent = KM_S.mode === "edit" ? "Kemaskini" : "Hantar"; }
  kmGoto("ringkasan");
}

function renderRingkasan(c) {
  const pct = kmCalcPercent(KM_S.hadir, KM_S.tidak);
  const user = getSavedUser();
  const statusTag = KM_S.saveError
    ? `<span style="font-size:11px;color:var(--danger);font-weight:600">(gagal disimpan)</span>`
    : `<span style="font-size:11px;color:var(--mint);font-weight:600">(disimpan ke Sheet)</span>`;
  c.innerHTML = `
    <div class="glass card-pad">
      <div class="title-lg">${KM_S.saveError ? '⚠️' : '✅'} ${KM_S.mode === 'edit' ? 'Rekod Dikemaskini' : 'Rekod Diterima'} ${statusTag}</div>
      <div class="sub-dim">${kmEscape(KM_S.kelas)} (${KM_S.bilMurid} orang) — ${KM_S.tarikh}</div>
      ${KM_S.saveError ? `<div class="error-text" style="margin-bottom:0">${kmEscape(KM_S.saveError)}</div>` : ""}
      <div style="margin-top:14px">
        <div class="summary-row"><span class="lbl">Hadir</span><span>${KM_S.hadir}/${KM_S.bilMurid}</span></div>
        <div class="summary-row"><span class="lbl">Tidak Hadir</span><span>${KM_S.tidak}/${KM_S.bilMurid}</span></div>
        <div class="summary-row"><span class="lbl">Nama Tidak Hadir</span><span style="text-align:right;max-width:60%">${kmEscape(KM_S.nama || 'Tiada')}</span></div>
        <div class="summary-row"><span class="lbl">% Kehadiran</span><span class="pct-badge ${kmPctClass(pct)}">${pct}</span></div>
        <div class="summary-row"><span class="lbl">Direkod oleh</span><span>${kmEscape((user && user.nama) || 'Awak')}</span></div>
      </div>
    </div>
    <div class="btn-stack">
      ${KM_S.saveError ? `<button class="btn-primary" onclick="submitNama()">🔁 Cuba Simpan Semula</button>` : ""}
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
  KM_S.tarikh = tarikh;
  kmGoto(nextScreen);
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


/* ================= Mula ================= */
(async function boot() {
  kmRender();
  await kmLoadAll();
  kmRender();
})();

/* ================= Konfigurasi & fetch data ================= */
const KM_SHEET_ID = "1ZjUjYPY5QBxOrOIDI6PixpS5ygdatAsZ4HT_uT-iMMA";

// GANTI dengan URL Web App selepas deploy Code-KehadiranMurid.gs (projek Apps Script BERASINGAN)
const KM_API_URL = "https://script.google.com/macros/s/AKfycbwNJgwaxELxNJ1jmRbqszvy_uphXhazSjTwplL2IxuVLyTJ9FZnQqe8eUNvnyPBK3p7/exec";
function kmApiConfigured() { return KM_API_URL && KM_API_URL.indexOf("PASTE_") !== 0; }

let kmData = { kelas: [], kehadiran: [] };
let kmLoaded = false;
let kmError = null;
let kmEnrolWarn = ""; // amaran enrolmen (pendua / muat semula gagal) — dipaparkan di Menu

/** Senarai kelas, bilangan & nama murid datang daripada ENROLMEN (enrolmen-murid.js) — satu sumber dengan Analisis. */
function kmMuridDalamKelas(kelas) { return emStudentsIn(kelas); }
function kmSameKelas(a, b) { return emNormKelas(a) === emNormKelas(b); }
function kmTodayKey() { return new Date().toLocaleDateString("en-GB").split("/").join("/"); } // dd/mm/yyyy

async function kmFetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${KM_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&_ts=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
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
  kmError = null;
  kmEnrolWarn = "";
  try {
    const [kehadiranRows, em] = await Promise.all([kmFetchSheet("Kehadiran"), emLoad()]);

    // Tanpa enrolmen, jumlah hadir tak dapat dikira — HENTIKAN dengan mesej jelas (jangan teka)
    if (!emClasses().length) {
      kmError = em.sebab === "tajuk"
        ? "Data murid tidak sah (lajur Nama/Kelas tiada dalam tab DatabaseMurid). Hubungi Guru Data Murid."
        : "Data murid (enrolmen) tidak dapat dimuat atau masih kosong. Borang kehadiran memerlukan data murid untuk mengira jumlah hadir.";
      kmLoaded = false;
      return;
    }
    if (!em.ok) kmEnrolWarn = "⚠️ Data murid tidak dapat disegarkan — menggunakan senarai terakhir yang berjaya dimuat.";
    else if (em.dup > 0) kmEnrolWarn = `⚠️ ${em.dup} rekod murid pendua dalam Data Murid diabaikan. Minta Guru Data Murid muat naik semula data murid.`;
    kmData.kelas = emClasses();

    // Kehadiran: kolum A=Tarikh,B=Kelas,C=Hadir,D=TidakHadir,E=Nama,F=Jumlah,G=Peratus,H=DirekodOleh
    kmData.kehadiran = kehadiranRows
      .map(r => ({
        tarikh: kmParseDate(r.c[0] && r.c[0].v),
        kelas: r.c[1] && r.c[1].v ? emCanonKelas(String(r.c[1].v)) : "", // ejaan sama dengan enrolmen
        hadir: Number(r.c[2] && r.c[2].v) || 0,
        tidak: Number(r.c[3] && r.c[3].v) || 0,
        nama: (r.c[4] && r.c[4].v) || "",
        direkodOleh: (r.c[7] && r.c[7].v) || "Tidak diketahui",
      }))
      .filter(r => r.tarikh && r.kelas);

    kmLoaded = true;
  } catch (e) {
    kmError = 'Gagal muat data. Pastikan Sheet dikongsi sebagai "Anyone with the link" (Viewer).';
    kmLoaded = false;
  }
}
async function kmReload() {
  kmLoaded = false; kmError = null;
  kmRender();
  await kmLoadAll();
  kmRender();
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
  jumlah: 0,         // jumlah murid direkod (enrolmen kelas + murid lama yang masih ditanda)
  hadir: null,       // DIKIRA automatik daripada nama murid tidak hadir
  tidak: null,       // DIKIRA automatik
  nama: "",
  sel: new Set(),    // indeks murid (dalam senarai kelas) yang ditanda TIDAK HADIR
  extras: [],        // nama dalam rekod lama yang tiada dalam senarai kelas semasa (mod edit)
  extrasSel: new Set(),
  editingRow: null,
  tarikhPage: 0,      // untuk pilih tarikh (edit), 5/muka
};

const KM_TITLES = {
  menu: "Menu Utama", pilihKelasBaru: "Pilih Kelas", askNama: "Isi Kehadiran", ringkasan: "Ringkasan",
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
  KM_S = { ...KM_S, mode: null, kelas: null, tarikh: null, bilMurid: 0, jumlah: 0, hadir: null, tidak: null, nama: "", sel: new Set(), extras: [], extrasSel: new Set(), editingRow: null, history: [] };
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
    c.innerHTML = `<div class="empty-state">❌ ${kmError}</div><div class="btn-stack"><button class="btn-primary" onclick="kmReload()">🔁 Cuba Semula</button></div>`;
    return;
  }
  const renderers = {
    menu: renderMenu, pilihKelasBaru: renderPilihKelasBaru,
    askNama: renderAskNama,
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
  const kelasIsiSet = new Set(kmData.kehadiran.filter((r) => r.tarikh === todayKey).map((r) => emNormKelas(r.kelas)));
  const kelasIsiCount = kmData.kelas.filter((k) => kelasIsiSet.has(emNormKelas(k.nama))).length;
  const kelasBelumIsi = kmData.kelas.filter((k) => !kelasIsiSet.has(emNormKelas(k.nama)));
  const pctIsi = totalKelas ? Math.round((kelasIsiCount / totalKelas) * 100) : 0;

  const belumIsiHtml = kelasBelumIsi.length
    ? kelasBelumIsi.map((k) => `<span class="km-chip">${k.nama}</span>`).join("")
    : `<div class="km-all-done">🎉 Semua kelas telah isi kehadiran hari ini!</div>`;

  c.innerHTML = `
    <div class="km-menu-title">
      <div class="title-lg">🏫 Sistem Kehadiran Murid</div>
      <div class="sub-dim" style="margin-bottom:0">Hari: <b style="color:var(--text)">${hari}</b> &middot; Tarikh: <b style="color:var(--text)">${tarikhFmt}</b></div>
    </div>

    ${kmEnrolWarn ? `<div class="km-warn">${kmEscape(kmEnrolWarn)}</div>` : ""}
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
/* Pengguna HANYA menanda murid yang TIDAK HADIR. Jumlah murid datang daripada data enrolmen kelas;
   tidak hadir = bilangan nama ditanda; hadir = jumlah - tidak hadir; peratus dikira. Tiada nombor perlu ditaip. */
function startIsiBorang() {
  KM_S.mode = "new";
  KM_S.kelas = null; KM_S.hadir = null; KM_S.tidak = null; KM_S.nama = ""; KM_S.editingRow = null;
  KM_S.sel = new Set(); KM_S.extras = []; KM_S.extrasSel = new Set();
  kmGoto("pilihKelasBaru");
}

function renderPilihKelasBaru(c) {
  const tiles = kmData.kelas.map((k, i) =>
    `<div class="tile" onclick="pilihKelasBaruIdx(${i})">${kmEscape(k.nama)}<span class="tile-sub">${k.bilangan} orang</span></div>`
  ).join("");
  c.innerHTML = `<div class="grid2">${tiles || '<div class="empty-state">Tiada kelas dalam data murid.</div>'}</div>`;
}
function pilihKelasBaruIdx(i) { const k = kmData.kelas[i]; if (k) pilihKelasBaru(k.nama); }
function pilihKelasBaru(kelas) {
  const todayKey = kmTodayKey();
  // Sekatan data berulang — kalau kelas ni SUDAH ada rekod hari ini, sekat & arah ke Edit
  const sudahAda = kmData.kehadiran.some((r) => r.tarikh === todayKey && kmSameKelas(r.kelas, kelas));
  if (sudahAda) {
    alert(`Data kehadiran kelas "${kelas}" telah diisi untuk hari ini.\n\nSila ke bahagian "Edit Kehadiran" untuk membuat perubahan.`);
    return;
  }
  KM_S.kelas = kelas; KM_S.bilMurid = kmMuridDalamKelas(kelas).length;
  KM_S.tarikh = todayKey;
  KM_S.nama = ""; KM_S.sel = new Set(); KM_S.extras = []; KM_S.extrasSel = new Set();
  kmGoto("askNama");
}

/* ---- Pilihan murid tidak hadir & kiraan automatik ---- */
function kmNameKey(n) { return String(n).replace(/,/g, " ").replace(/\s+/g, " ").trim().toUpperCase(); }

/** Mod edit: pulihkan tanda daripada nama dalam rekod. Nama yang tiada dalam senarai kelas semasa (murid sudah keluar /
 * ejaan lama) dikekalkan sebagai baris tambahan yang masih ditanda — jangan hilangkan data senyap-senyap. */
function kmInitSelection(roster) {
  const names = String(KM_S.nama || "").split(",").map((x) => x.trim()).filter(Boolean);
  const sel = new Set(), extras = [];
  names.forEach((n) => {
    const k = kmNameKey(n);
    const i = roster.findIndex((m, idx) => !sel.has(idx) && kmNameKey(m.nama) === k); // murid bernama sama: padan satu demi satu
    if (i >= 0) sel.add(i); else extras.push(n);
  });
  KM_S.sel = sel; KM_S.extras = extras; KM_S.extrasSel = new Set(extras.map((_, j) => j));
}

/** Kiraan: jumlah = enrolmen kelas (+ murid lama yang masih ditanda); tidak = ditanda; hadir = enrolmen - ditanda di senarai kelas. */
function kmCompute() {
  const roster = kmMuridDalamKelas(KM_S.kelas);
  const selRoster = [...KM_S.sel].filter((i) => i < roster.length).sort((a, b) => a - b);
  const selExtras = [...KM_S.extrasSel].filter((j) => j < KM_S.extras.length).sort((a, b) => a - b);
  const names = selRoster.map((i) => roster[i].nama).concat(selExtras.map((j) => KM_S.extras[j]));
  return { jumlah: roster.length + selExtras.length, tidak: names.length, hadir: roster.length - selRoster.length, names };
}
function kmUpdateLive() {
  const el = document.getElementById("km-live");
  if (!el) return;
  const c = kmCompute();
  el.innerHTML = `Hadir <b class="km-live-ok">${c.hadir}</b> &middot; Tidak hadir <b class="km-live-bad">${c.tidak}</b> &middot; <b>${kmCalcPercent(c.hadir, c.tidak)}</b>` +
    (c.tidak === 0 ? ` <span class="km-live-note">— semua hadir</span>` : "");
}

function renderAskNama(c) {
  const roster = kmMuridDalamKelas(KM_S.kelas);
  if (!roster.length) {
    c.innerHTML = `
      <div class="glass card-pad"><div class="empty-state">⚠️ Kelas "${kmEscape(KM_S.kelas)}" tiada dalam data murid semasa, jadi jumlah hadir tak dapat dikira. Hubungi Guru Data Murid.</div></div>
      <div class="btn-stack"><button class="btn-danger" onclick="kmResetToMenu()">Kembali</button></div>`;
    return;
  }
  const rows = roster.map((m, i) => ({ nama: m.nama, i, extra: false }))
    .concat(KM_S.extras.map((n, j) => ({ nama: n, i: roster.length + j, extra: true })));
  const listHtml = rows.map((r) => {
    const checked = r.extra ? KM_S.extrasSel.has(r.i - roster.length) : KM_S.sel.has(r.i);
    return `
    <label class="km-murid-row">
      <input type="checkbox" data-i="${r.i}" ${checked ? "checked" : ""} onchange="kmToggleNama(this)">
      <span>${kmEscape(r.nama)}${r.extra ? ' <em class="km-extra-tag">(tiada dalam senarai kelas semasa)</em>' : ""}</span>
    </label>`;
  }).join("");

  c.innerHTML = `
    <div class="context-chip">${kmEscape(KM_S.kelas)} · ${roster.length} orang</div>
    <div class="glass card-pad">
      <div class="sub-dim" style="margin-bottom:10px">Tanda nama murid <b style="color:var(--text)">tidak hadir</b> sahaja. Jumlah hadir &amp; tidak hadir dikira automatik.</div>
      <div class="km-live" id="km-live"></div>
      <input class="field-input" type="text" id="km-murid-search" placeholder="Cari nama..." oninput="kmFilterMuridList(this.value)" style="margin-bottom:10px">
      <div id="km-murid-list" class="km-murid-list">${listHtml}</div>
    </div>
    <div class="btn-stack">
      <button class="btn-primary" id="km-submit-btn" onclick="submitNama()">${KM_S.mode === 'edit' ? 'Kemaskini' : 'Hantar'}</button>
      <button class="btn-danger" onclick="kmResetToMenu()">Batal</button>
    </div>`;
  kmUpdateLive();
}
function kmToggleNama(input) {
  const i = parseInt(input.dataset.i, 10);
  const nRoster = kmMuridDalamKelas(KM_S.kelas).length;
  const set = i >= nRoster ? KM_S.extrasSel : KM_S.sel;
  const key = i >= nRoster ? i - nRoster : i;
  if (input.checked) set.add(key); else set.delete(key);
  kmUpdateLive();
}
function kmFilterMuridList(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll("#km-murid-list .km-murid-row").forEach((row) => {
    const nama = row.querySelector("span").textContent.toLowerCase();
    row.style.display = nama.includes(q) ? "" : "none";
  });
}

async function submitNama(skipConfirm) {
  const calc = kmCompute();
  KM_S.hadir = calc.hadir; KM_S.tidak = calc.tidak; KM_S.jumlah = calc.jumlah; KM_S.nama = calc.names.join(", ");

  // Tiada lagi nombor ditaip sebagai semakan silang — jadi minta pengesahan bila TIADA murid ditanda (elak terlupa tanda)
  if (calc.tidak === 0 && skipConfirm !== true) {
    if (!confirm(`Tiada murid ditanda tidak hadir.\n\nSemua ${calc.jumlah} murid kelas ${KM_S.kelas} akan direkodkan HADIR. Teruskan?`)) return;
  }

  if (!kmApiConfigured()) {
    KM_S.saveError = "API Kehadiran Murid belum disambungkan (KM_API_URL belum diisi).";
    kmGoto("ringkasan");
    return;
  }

  const btn = document.getElementById("km-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Menyimpan..."; }

  const user = getSavedUser();
  const direkodOleh = (user && user.nama) || (user && user.email) || "";
  try {
    // Pelayan MENGIRA semula daripada jumlahMurid + senarai nama. hadir/tidakHadir/namaTidakHadir turut dihantar
    // (nilai yang sama) supaya backend lama yang belum di-deploy semula masih menyimpan nombor yang betul.
    const data = await postToAppsScript(KM_API_URL, {
      action: "saveKehadiran",
      kelas: KM_S.kelas,
      tarikh: KM_S.tarikh,
      jumlahMurid: calc.jumlah,
      namaTidakHadirList: calc.names,
      hadir: calc.hadir,
      tidakHadir: calc.tidak,
      namaTidakHadir: KM_S.nama,
      direkodOleh,
    });
    if (data && data.success && !data._fallbackParse) {
      KM_S.saveError = null;
      // Nilai pelayan (kalau ada) ialah rujukan — sepatutnya sama dengan kiraan klien
      if (typeof data.hadir === "number" && typeof data.tidakHadir === "number") { KM_S.hadir = data.hadir; KM_S.tidak = data.tidakHadir; }
      // Kemas kini cache tempatan supaya Menu Utama terus tepat tanpa reload
      kmData.kehadiran = kmData.kehadiran.filter((r) => !(r.tarikh === KM_S.tarikh && kmSameKelas(r.kelas, KM_S.kelas)));
      kmData.kehadiran.push({ tarikh: KM_S.tarikh, kelas: KM_S.kelas, hadir: KM_S.hadir, tidak: KM_S.tidak, nama: KM_S.nama, direkodOleh: (user && user.nama) || "" });
    } else if (data && data._fallbackParse) {
      KM_S.saveError = "Respons pelayan tidak jelas — status simpanan tidak pasti. Tekan \"Cuba Simpan Semula\" (selamat: rekod ditimpa, bukan berganda).";
    } else {
      KM_S.saveError = (data && data.message) || "Gagal simpan ke Sheet.";
    }
  } catch (err) {
    KM_S.saveError = "Ralat sambungan ke server. Tekan \"Cuba Simpan Semula\" (selamat: rekod ditimpa, bukan berganda).";
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
        <div class="summary-row"><span class="lbl">Hadir</span><span>${KM_S.hadir}/${KM_S.jumlah || KM_S.bilMurid}</span></div>
        <div class="summary-row"><span class="lbl">Tidak Hadir</span><span>${KM_S.tidak}/${KM_S.jumlah || KM_S.bilMurid}</span></div>
        <div class="summary-row"><span class="lbl">Nama Tidak Hadir</span><span style="text-align:right;max-width:60%">${kmEscape(KM_S.nama || 'Tiada')}</span></div>
        <div class="summary-row"><span class="lbl">% Kehadiran</span><span class="pct-badge ${kmPctClass(pct)}">${pct}</span></div>
        <div class="summary-row"><span class="lbl">Direkod oleh</span><span>${kmEscape((user && user.nama) || 'Awak')}</span></div>
      </div>
    </div>
    <div class="btn-stack">
      ${KM_S.saveError ? `<button class="btn-primary" onclick="submitNama(true)">🔁 Cuba Simpan Semula</button>` : ""}
      <button class="btn-primary" onclick="editRingkasan()">✏️ Edit</button>
      <button class="btn-ghost" onclick="startIsiBorang()">🔙 Kembali Pilih Kelas</button>
      <button class="btn-ghost" onclick="kmResetToMenu()">🏠 Menu Utama</button>
    </div>
  `;
}
function editRingkasan() {
  KM_S.mode = "edit";
  kmInitSelection(kmMuridDalamKelas(KM_S.kelas));
  kmGoto("askNama");
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
  const kelasDenganData = new Set(kmData.kehadiran.filter(r => r.tarikh === KM_S.tarikh).map(r => emNormKelas(r.kelas)));
  const list = kmData.kelas.map((k, i) => ({ k, i })).filter(({ k }) => kelasDenganData.has(emNormKelas(k.nama)));
  if (!list.length) { c.innerHTML = `<div class="empty-state">Tiada data kelas untuk ${KM_S.tarikh}.</div>`; return; }
  const tiles = list.map(({ k, i }) =>
    `<div class="tile" onclick="pilihKelasEditIdx(${i})">${kmEscape(k.nama)}<span class="tile-sub">${k.bilangan} orang</span></div>`
  ).join("");
  c.innerHTML = `<div class="sub-dim" style="margin-bottom:10px">Tarikh: <b style="color:var(--text)">${KM_S.tarikh}</b></div><div class="grid2">${tiles}</div>`;
}
function pilihKelasEditIdx(i) { const k = kmData.kelas[i]; if (k) pilihKelasEdit(k.nama); }
function pilihKelasEdit(kelas) {
  const rec = kmData.kehadiran.find(r => r.tarikh === KM_S.tarikh && kmSameKelas(r.kelas, kelas));
  KM_S.mode = "edit"; KM_S.kelas = kelas; KM_S.bilMurid = kmMuridDalamKelas(kelas).length;
  KM_S.nama = rec ? rec.nama : "";
  kmInitSelection(kmMuridDalamKelas(kelas));
  kmGoto("askNama");
}


/* ================= Mula ================= */
(async function boot() {
  kmRender();
  await kmLoadAll();
  kmRender();
})();

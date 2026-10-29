/* ============================================================
   TEMPAHAN SESI & PROGRAM KAUNSELING
   Semua pengecam awalan "kn" supaya tak berlanggar dengan skrip lain.
   ============================================================ */

// GANTI dengan URL Web App selepas Code.gs Kaunseling disambung
const KN_API_URL = "https://script.google.com/macros/s/AKfycbyZuruVgM_cKNdeHltzRIFbTXWOTnemNNFT9SaUZ0DvgFCgl9ursgFO2z7NbfI_73mc/exec";
function knApiConfigured() { return KN_API_URL && KN_API_URL.indexOf("PASTE_") !== 0; }

const KN_JAWATAN_KAUNSELOR = "PPP (KAUNSELOR SEPENUH MASA)";

const KN_IMG_SESI = "https://lh3.googleusercontent.com/d/1_vF-aLzeBzph7E1u2u8j1h1hQtSxN6Kv";
const KN_IMG_PROGRAM = "https://lh3.googleusercontent.com/d/1D3tAzHfsOcMlPlT-Kk7eV2ffz3cUGXiO";

function knInitImages() {
  const photoSesi = document.getElementById("kn-photo-sesi");
  const photoProgram = document.getElementById("kn-photo-program");
  if (photoSesi) photoSesi.innerHTML = `<img src="${KN_IMG_SESI}" alt="Sesi Kaunseling" onerror="this.parentElement.innerHTML='<div class=&quot;kn-ph-fallback&quot;>Sesi Kaunseling</div>'">`;
  if (photoProgram) photoProgram.innerHTML = `<img src="${KN_IMG_PROGRAM}" alt="Program Kaunseling" onerror="this.parentElement.innerHTML='<div class=&quot;kn-ph-fallback&quot;>Program Kaunseling</div>'">`;
}

const KN_CLASS_LIST = [
  "1 AR-RAZI","1 IBNU RUSHD","1 AL-FARABI",
  "2 AR-RAZI","2 IBNU RUSHD","2 AL-FARABI",
  "3 AR-RAZI","3 IBNU RUSHD","3 AL-FARABI",
  "4 AR-RAZI","4 IBNU RUSHD","4 AL-FARABI",
  "5 AR-RAZI","5 IBNU RUSHD","5 AL-FARABI",
  "6 AL-GHAZALI","6 AL BUKHARI",
];

const KN_SLOTS_WEEKDAY = ["7.30 - 8.10","8.10 - 8.50","8.50 - 9.30","9.30 - 10.10","10.10 - 10.50","10.50 - 11.10","11.10 - 11.50","11.50 - 12.30","12.30 - 13.10","13.10 - 13.50","13.50 - 14.30","15.10 - 15.50","15.50 - 16.30","16.30 - 17.10"];
const KN_SLOTS_FRIDAY = ["7.30 - 7.45","7.45 - 8.25","8.25 - 9.05","9.05 - 9.45","9.45 - 10.05","10.05 - 10.45","10.45 - 11.25","11.25 - 12.05"];
const KN_MAX_SLOTS = KN_SLOTS_WEEKDAY.length; // 14 — paksi baris tetap untuk semua hari
const KN_DAY_NAMES = ["Ahad","Isnin","Selasa","Rabu","Khamis","Jumaat","Sabtu"];
const KN_WEEK_COLS = ["Isnin","Selasa","Rabu","Khamis","Jumaat","Sabtu","Ahad"];

function knSlotsForDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  if (day === 5) return { name: KN_DAY_NAMES[day], slots: KN_SLOTS_FRIDAY };
  return { name: KN_DAY_NAMES[day], slots: KN_SLOTS_WEEKDAY };
}
function knSlotIdFor(index) { return "SLOT " + (index + 1); }

function knTextColorForBg(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substr(0, 2), 16) / 255, g = parseInt(c.substr(2, 2), 16) / 255, b = parseInt(c.substr(4, 2), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? "#22242A" : "#FFFFFF";
}

function knFmtDate(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function knFmtDateShort(d) { return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); }
function knTodayStr() { return knFmtDate(new Date()); }
function knGetMonday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const offset = day === 0 ? -6 : (1 - day);
  const monday = new Date(d); monday.setDate(d.getDate() + offset);
  return monday;
}
function knAddDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }

/* ---------------- State ---------------- */
let knCounselors = [];
let knBookings = [];
let knCurrentJenis = "";
let knWeekMonday = knGetMonday(knTodayStr());
let knCurrentUser = null;
let knCanEdit = false;

/* ---------------- Akses ---------------- */
function knCheckAccess(user) {
  return checkModuleAccess(user, "kaunseling");
}

/* ---------------- Tab ---------------- */
function knSwitchTab(name) {
  ["menu", "jadual", "rujuk", "senarai"].forEach((t) => {
    const p = document.getElementById("kn-tab-panel-" + t), b = document.getElementById("kn-tab-btn-" + t);
    if (p) p.classList.toggle("hidden", t !== name);
    if (b) b.classList.toggle("active", t === name);
  });
  if (name === "jadual") knLoadAndRenderTimetables();
  if (name === "rujuk") { knBuildKelasList("kn-rj-kelas-list"); knRefreshMuridPicker("rujuk"); knEnsureMurid().then(() => { knBuildKelasList("kn-rj-kelas-list"); knRefreshMuridPicker("rujuk"); }); }
  if (name === "senarai") knLoadRujukan(true);
}

/* ---------------- Fetch staf (senarai kaunselor layak) ---------------- */
async function knFetchStaff() {
  const sel = document.getElementById("kn-f-kaunselor");
  if (!knApiConfigured()) {
    sel.innerHTML = '<option value="">API Kaunseling belum disambung</option>';
    return;
  }
  try {
    const res = await fetch(`${KN_API_URL}?action=staff`);
    const json = await res.json();
    // Respons "staff" gabungkan Kaunselor + Admin/Pentadbir (untuk semakan akses) —
    // dropdown Nama Kaunselor cuma tapis yang isKaunselor === true sahaja.
    knCounselors = (json.data || []).filter((c) => c.isKaunselor);
    sel.innerHTML = '<option value="">Pilih nama kaunselor</option>' + knCounselors.map((c) => `<option value="${c.name}">${c.name}</option>`).join("");
  } catch (err) {
    sel.innerHTML = `<option value="">Gagal muat senarai (${err.message})</option>`;
  }
}

/* ---------------- Fetch tempahan ---------------- */
async function knFetchBookings() {
  if (!knApiConfigured()) return knBookings;
  try {
    const res = await fetch(`${KN_API_URL}?action=list`);
    const json = await res.json();
    if (json.status === "success") knBookings = json.data || [];
  } catch (err) { /* biar senarai lama kekal */ }
  return knBookings;
}


/* ---------------- Pilihan murid ikut kelas (data murid — enrolmen-murid.js) ----------------
   Kelas ditaip/dipilih -> dropdown murid kelas itu. Kotak teks nama murid kekal boleh disunting (murid baharu / data tak termuat).
   Sesi = seorang murid (pilihan menggantikan); Program = beberapa murid (pilihan ditambah; beberapa kelas dipisahkan koma). */
const KN_PICKER = {
  form:   { kelas: "kn-f-tingkatan",      sel: "kn-f-murid-pick", ta: "kn-f-murid",      list: "kn-tingkatan-list",   single: () => knCurrentJenis === "Sesi Kaunseling" },
  rujuk:  { kelas: "kn-rj-kelas",         sel: "kn-rj-murid-pick", ta: "kn-rj-murid",      list: "kn-rj-kelas-list",   single: () => true },
  detail: { kelas: "kn-d-tingkatan-view", sel: "kn-d-murid-pick", ta: "kn-d-murid-view", list: "kn-d-tingkatan-list", single: () => document.getElementById("kn-d-jenis").textContent === "Sesi Kaunseling" },
};
/** Muat data murid sekali (cuba semula jika sebelum ini gagal). Tidak pernah menolak. */
async function knEnsureMurid() {
  if (typeof emLoad !== "function") return;
  if (!emMeta.loaded || !emMeta.ok) await emLoad();
}
function knMuridReady() { return typeof emMeta !== "undefined" && emMeta.ok && emStudents.length > 0; }
/** "3 ar-razi , 4 AL-FARABI" -> ["3 AR-RAZI", "4 AL-FARABI"] (ejaan ikut data murid) */
function knKelasTokens(raw) { return String(raw || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean); }
function knCanonKelasList(raw) { return knKelasTokens(raw).map((k) => (knMuridReady() ? emCanonKelas(k) : k)).join(", "); }
function knBuildKelasList(listId) {
  const el = document.getElementById(listId);
  if (!el) return;
  if (knMuridReady()) el.innerHTML = emClasses().map((c) => `<option value="${knEscape(c.nama)}" label="${c.bilangan} murid">`).join("");
  else el.innerHTML = KN_CLASS_LIST.map((c) => `<option value="${c}">`).join(""); // data murid tak tersedia — senarai tetap
}
function knRefreshMuridPicker(which) {
  const cfg = KN_PICKER[which], sel = document.getElementById(cfg.sel), raw = document.getElementById(cfg.kelas).value;
  const classes = knMuridReady() ? knKelasTokens(raw).map((k) => emCanonKelas(k)).filter((k, i, a) => a.indexOf(k) === i && emStudentsIn(k).length) : [];
  if (!classes.length) {
    sel.disabled = true;
    sel.innerHTML = `<option value="">${!knMuridReady() ? "Senarai murid tiada — taip nama di bawah" : (knKelasTokens(raw).length ? "Tiada murid kelas ini — taip di bawah" : "Pilih kelas dahulu")}</option>`;
    return;
  }
  const opt = (s) => `<option value="${knEscape(s.nama)}">${knEscape(s.nama)}</option>`;
  const body = classes.length === 1
    ? emStudentsIn(classes[0]).map(opt).join("")
    : classes.map((k) => `<optgroup label="${knEscape(k)}">${emStudentsIn(k).map(opt).join("")}</optgroup>`).join("");
  sel.innerHTML = `<option value="">Pilih murid (${classes.map((k) => emCount(k)).reduce((a, b) => a + b, 0)} murid)</option>` + body;
  sel.disabled = which === "detail" && !knCanEdit; // paparan butiran sahaja-baca untuk yang tiada kebenaran edit
}
function knOnMuridPick(which) {
  const cfg = KN_PICKER[which], sel = document.getElementById(cfg.sel), ta = document.getElementById(cfg.ta), nama = sel.value;
  if (!nama) return;
  const lines = ta.value.split("\n").map((x) => x.trim()).filter(Boolean);
  if (cfg.single()) ta.value = nama;
  else if (!lines.some((l) => l.toUpperCase() === nama.toUpperCase())) { lines.push(nama); ta.value = lines.join("\n"); }
  sel.value = "";
}

/* ---------------- Borang tempahan ---------------- */
function knOpenForm(jenis) {
  knCurrentJenis = jenis;
  knRujukanId = null;
  const bn = document.getElementById("kn-rj-banner"); if (bn) { bn.classList.add("hidden"); bn.textContent = ""; }
  const isSesi = jenis === "Sesi Kaunseling";
  const img = isSesi ? KN_IMG_SESI : KN_IMG_PROGRAM;
  document.getElementById("kn-modal-photo").innerHTML = `<img src="${img}" alt="${jenis}" onerror="this.parentElement.innerHTML='<div class=&quot;kn-ph-fallback&quot;>${jenis}</div>'">`;
  document.getElementById("kn-modal-jenis-pill").textContent = jenis;
  document.getElementById("kn-modal-title").textContent = "Borang " + jenis;
  document.getElementById("kn-modal-desc").textContent = isSesi
    ? "Tempahan sesi kaunseling individu bersama seorang murid."
    : "Tempahan program/aktiviti kaunseling — boleh melibatkan lebih daripada seorang murid dan merentasi beberapa hari.";

  document.getElementById("kn-f-kaunselor").value = "";
  document.getElementById("kn-f-tingkatan").value = "";
  document.getElementById("kn-f-tarikh-mula").value = "";
  document.getElementById("kn-f-tarikh-tamat").value = "";
  document.getElementById("kn-f-perkara").value = "";
  document.getElementById("kn-f-murid").value = "";
  document.getElementById("kn-f-waktu-mula").innerHTML = '<option value="">Pilih tarikh dahulu</option>';
  document.getElementById("kn-f-waktu-tamat").innerHTML = '<option value="">Pilih tarikh dahulu</option>';
  document.getElementById("kn-form-error").classList.remove("show");

  document.getElementById("kn-f-kelas-hint").textContent = isSesi ? "" : "Program: boleh lebih daripada satu kelas — pisahkan dengan koma (cth 3 AR-RAZI, 4 AL-FARABI).";
  knBuildKelasList("kn-tingkatan-list");
  knRefreshMuridPicker("form");
  knEnsureMurid().then(() => { knBuildKelasList("kn-tingkatan-list"); knRefreshMuridPicker("form"); });

  knFetchStaff();
  const overlay = document.getElementById("kn-booking-overlay");
  overlay.classList.remove("hidden");
  overlay.classList.add("show");
}

function knOnFormDateChange() {
  const dateStr = document.getElementById("kn-f-tarikh-mula").value;
  const s1 = document.getElementById("kn-f-waktu-mula");
  const s2 = document.getElementById("kn-f-waktu-tamat");
  if (!dateStr) {
    s1.innerHTML = '<option value="">Pilih tarikh dahulu</option>';
    s2.innerHTML = '<option value="">Pilih tarikh dahulu</option>';
    return;
  }
  const info = knSlotsForDate(dateStr);
  const opts = info.slots.map((s, i) => { const id = knSlotIdFor(i); return `<option value="${id}">${id} (${s})</option>`; }).join("");
  s1.innerHTML = '<option value="">Pilih Waktu Mula</option>' + opts;
  s2.innerHTML = '<option value="">Pilih Waktu Tamat</option>' + opts;
}

async function knSubmitBooking() {
  const kaunselor = document.getElementById("kn-f-kaunselor").value;
  const tingkatan = knCanonKelasList(document.getElementById("kn-f-tingkatan").value);
  const tarikhMula = document.getElementById("kn-f-tarikh-mula").value;
  const tarikhTamat = document.getElementById("kn-f-tarikh-tamat").value;
  const waktuMula = document.getElementById("kn-f-waktu-mula").value;
  const waktuTamat = document.getElementById("kn-f-waktu-tamat").value;
  const perkara = document.getElementById("kn-f-perkara").value.trim();
  const murid = document.getElementById("kn-f-murid").value.trim();
  const errBox = document.getElementById("kn-form-error");
  errBox.classList.remove("show");

  if (!kaunselor || !tingkatan || !tarikhMula || !waktuMula || !waktuTamat || !perkara || !murid) {
    errBox.textContent = "Sila lengkapkan semua maklumat wajib (*).";
    errBox.classList.add("show");
    return;
  }
  if (tarikhTamat && tarikhTamat < tarikhMula) {
    errBox.textContent = "Tarikh Tamat mesti sama atau selepas Tarikh Mula.";
    errBox.classList.add("show");
    return;
  }
  if (!knApiConfigured()) {
    errBox.textContent = "API Kaunseling belum disambungkan (KN_API_URL belum diisi).";
    errBox.classList.add("show");
    return;
  }

  const btn = document.getElementById("kn-submit-btn");
  btn.disabled = true; btn.textContent = "Menghantar...";
  const payload = { jenis: knCurrentJenis, kaunselor, tingkatan, tarikhMula, tarikhTamat, waktuMula, waktuTamat, perkara, murid, email: knCurrentUser.email };

  let result;
  try {
    const res = await fetch(KN_API_URL, { method: "POST", body: JSON.stringify(payload) });
    const rawText = await res.text();
    try {
      result = JSON.parse(rawText);
    } catch (parseErr) {
      // Respons bukan JSON — quirk platform Google (bukan tentu ralat sebenar).
      // Kalau status HTTP okay, operasi SELALUNYA sebenarnya berjaya — anggap
      // berjaya, bukan terus tunjuk ralat (elak "data masuk, app kata gagal").
      result = res.ok
        ? { status: "success", _fallbackParse: true }
        : { status: "error", message: "Skrip GS pulangkan respons tak sah: " + rawText.slice(0, 200) };
    }
  } catch (err) {
    result = { status: "error", message: "Gagal sambung ke KN_API_URL (" + err.message + "). Semak URL/deployment Apps Script." };
  }
  btn.disabled = false; btn.textContent = "Hantar Tempahan";

  if (result.status === "conflict") {
    errBox.textContent = result.message || "Kaunselor ini sudah mempunyai rekod pada tarikh & waktu yang sama.";
    errBox.classList.add("show");
    return;
  }
  if (result.status !== "success") {
    errBox.textContent = result.message || "Ralat sistem. Sila cuba semula.";
    errBox.classList.add("show");
    return;
  }

  knCloseModal("kn-booking-overlay");
  if (knRujukanId) { // rujukan guru ini kini sudah diuruskan: tanda Selesai (senyap)
    const id = knRujukanId; knRujukanId = null;
    fetch(KN_API_URL, { method: "POST", body: JSON.stringify({ action: "rujukanTanda", rowId: id, email: knCurrentUser.email }) }).then(() => knLoadRujukan(true)).catch(() => {});
    const r = knRujukan.find((x) => x.rowId === id); if (r) { r.STATUS = "Selesai"; knRenderRujukan(); }
  }
  document.getElementById("kn-result-icon").textContent = "✓";
  document.getElementById("kn-result-title").textContent = "Tempahan Berjaya!";
  document.getElementById("kn-result-msg").textContent = `Rekod ${knCurrentJenis.toLowerCase()} telah disimpan.`;
  document.getElementById("kn-result-overlay").classList.remove("hidden");
  knFetchBookings();
}

function knCloseModal(id) {
  const el = document.getElementById(id);
  el.classList.remove("show");
  el.classList.add("hidden");
}

/* ---------------- Page 2: Jadual (ditranspose: Slot/Masa kiri, Hari atas) ---------------- */
function knUpdateWeekBadge() {
  const sunday = knAddDays(knWeekMonday, 6);
  document.getElementById("kn-week-badge").textContent = knFmtDateShort(knWeekMonday) + " — " + knFmtDateShort(sunday);
}
function knShiftWeek(dir) {
  knWeekMonday = knAddDays(knWeekMonday, dir * 7);
  knUpdateWeekBadge();
  knRenderAllTimetables();
}

async function knLoadAndRenderTimetables() {
  knUpdateWeekBadge();
  if (!document.getElementById("kn-jump-date").value) document.getElementById("kn-jump-date").value = knTodayStr();
  if (!knCounselors.length) await knFetchStaff();
  await knFetchBookings();
  knRenderAllTimetables();
}

function knExpandSessionDates(b) {
  const start = b.TARIKH_MULA;
  const end = b.TARIKH_TAMAT || b.TARIKH_MULA;
  if (!start) return [];
  if (!end || end === start) return [start];
  const dates = [];
  let d = new Date(start + "T00:00:00");
  const endD = new Date(end + "T00:00:00");
  let guard = 0;
  while (d <= endD && guard < 60) { dates.push(knFmtDate(d)); d.setDate(d.getDate() + 1); guard++; }
  return dates;
}

const KN_COLOR_SESI = "#3B7DD8";
const KN_PROGRAM_PALETTE = ["#D9A62E", "#7C3AED", "#DB2777", "#059669", "#EA580C", "#0891B2", "#B91C1C", "#4F46E5"];
function knHashStr(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
function knColorForProgram(perkara) {
  if (!perkara) return KN_PROGRAM_PALETTE[0];
  return KN_PROGRAM_PALETTE[knHashStr(String(perkara).trim().toUpperCase()) % KN_PROGRAM_PALETTE.length];
}
function knNorm(str) { return String(str || "").trim().toUpperCase().replace(/\s+/g, " "); }

/**
 * Bina "lajur" satu hari: array 14 kedudukan (satu bagi setiap slot).
 * Setiap kedudukan: {type:"na"} / {type:"empty"} / {type:"busy", booking}.
 * Sesi Kaunseling diutamakan; antara Program, yang TERKINI (rowId besar) menang.
 * Setiap slot INDEPENDEN — tempahan yang merentasi >1 slot papar kad PENUH
 * (warna + teks) di SETIAP slot yang ditempah, bukan cuma slot pertama.
 */
function knBuildDayColumn(dStr, sessions) {
  const dayInfo = knSlotsForDate(dStr);
  const claim = new Array(KN_MAX_SLOTS).fill(null);

  const matches = sessions
    .filter((b) => knExpandSessionDates(b).indexOf(dStr) !== -1)
    .sort((a, b) => {
      const aSesi = a.JENIS === "Sesi Kaunseling", bSesi = b.JENIS === "Sesi Kaunseling";
      if (aSesi !== bSesi) return aSesi ? -1 : 1;
      return (b.rowId || 0) - (a.rowId || 0);
    });

  matches.forEach((b) => {
    const numMula = parseInt(String(b.WAKTU_MULA || "").replace(/[^0-9]/g, ""), 10);
    const numTamat = parseInt(String(b.WAKTU_TAMAT || "").replace(/[^0-9]/g, ""), 10) || numMula;
    const lo = Math.min(numMula, numTamat) - 1, hi = Math.max(numMula, numTamat) - 1;
    for (let i = lo; i <= hi && i < KN_MAX_SLOTS; i++) {
      if (i >= 0 && claim[i] === null) claim[i] = b;
    }
  });

  const result = new Array(KN_MAX_SLOTS);
  for (let i = 0; i < KN_MAX_SLOTS; i++) {
    if (!dayInfo.slots[i]) { result[i] = { type: "na" }; continue; }
    result[i] = claim[i] ? { type: "busy", booking: claim[i] } : { type: "empty" };
  }
  return result;
}

/**
 * Bina jadual DITRANSPOSE: setiap BARIS = satu slot, setiap LAJUR = satu
 * hari dalam minggu semasa. SETIAP sel SENTIASA di-emit — tiada slot yang
 * boleh tercicir. Tempahan merentasi >1 slot berturutan diwarnakan sama
 * dan sudut bulat dibuang antara bahagian supaya nampak bersambung.
 */
function knBuildTimetable(sessions, tableElId) {
  const weekDates = [];
  for (let i = 0; i < 7; i++) weekDates.push(knAddDays(knWeekMonday, i));
  const dateStrs = weekDates.map(knFmtDate);
  const dayColumns = dateStrs.map((dStr) => knBuildDayColumn(dStr, sessions));

  const thead = "<thead><tr><th>Slot / Masa</th>" +
    weekDates.map((d, i) => `<th>${KN_WEEK_COLS[i]}<span>${knFmtDateShort(d)}</span></th>`).join("") +
    "</tr></thead>";

  const rows = [];
  for (let slotIdx = 0; slotIdx < KN_MAX_SLOTS; slotIdx++) {
    let cells = "";
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const cell = dayColumns[dayIdx][slotIdx];
      if (cell.type === "na") { cells += `<td><div class="kn-tt-cell empty">—</div></td>`; continue; }
      if (cell.type === "empty") { cells += `<td><div class="kn-tt-cell empty">Kosong</div></td>`; continue; }

      const b = cell.booking;
      const isSesi = b.JENIS === "Sesi Kaunseling";
      const col = isSesi ? KN_COLOR_SESI : knColorForProgram(b.PERKARA);
      const fg = knTextColorForBg(col);
      const label = isSesi
        ? `<span class="kn-tt-line kn-b">${(b.MURID || "").split("\n")[0]}</span><span class="kn-tt-line">${b.TINGKATAN || ""}</span>`
        : `<span class="kn-tt-line kn-b">${(b.KAUNSELOR || "").split(" ")[0]}</span><span class="kn-tt-line">${b.PERKARA || ""}</span>`;
      const data = JSON.stringify({ rowId: b.rowId, tarikh: dateStrs[dayIdx], jenis: b.JENIS, kaunselor: b.KAUNSELOR, tingkatan: b.TINGKATAN, perkara: b.PERKARA, murid: b.MURID, waktuMula: b.WAKTU_MULA, waktuTamat: b.WAKTU_TAMAT, tarikhMula: b.TARIKH_MULA, tarikhTamat: b.TARIKH_TAMAT }).replace(/'/g, "&apos;");
      cells += `<td><div class="kn-tt-cell busy" style="background:${col};color:${fg}" onclick='knOpenDetail(${data})'>${label}</div></td>`;
    }
    const slotLabel = knSlotIdFor(slotIdx);
    rows.push(`<tr><th>${slotLabel}<span>${KN_SLOTS_WEEKDAY[slotIdx]}</span></th>${cells}</tr>`);
  }

  document.getElementById(tableElId).innerHTML = thead + "<tbody>" + rows.join("") + "</tbody>";
}

/**
 * Jadual UTAMA: Sesi Kaunseling Murid SAHAJA (bukan gabungan Sesi+Program).
 * Bawahnya: jadual INDIVIDU dinamik — satu jadual per kaunselor yang ADA DATA
 * (Sesi + Program digabung sekali dalam jadual individu masing-masing).
 * Keutamaan bila bertindih: Sesi > Program (rekod terkini diutamakan).
 */
function knRenderAllTimetables() {
  const sesiOnly = knBookings.filter((b) => b.JENIS === "Sesi Kaunseling");
  knBuildTimetable(sesiOnly, "kn-tt-all");

  const namaSet = new Set();
  knBookings.forEach((b) => { if (b.KAUNSELOR) namaSet.add(knNorm(b.KAUNSELOR)); });
  // Simpan versi paparan (bentuk asal, bukan ternormal) bagi setiap kaunselor unik
  const namaDisplay = {};
  knBookings.forEach((b) => { const n = knNorm(b.KAUNSELOR); if (b.KAUNSELOR && !namaDisplay[n]) namaDisplay[n] = b.KAUNSELOR; });

  const container = document.getElementById("kn-individual-wrap");
  const names = Array.from(namaSet).sort((a, b) => namaDisplay[a].localeCompare(namaDisplay[b]));

  if (!names.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = names.map((normName, idx) => {
    const display = namaDisplay[normName];
    const tblId = `kn-tt-individual-${idx}`;
    return `<div class="kn-tt-title"><div class="bar"></div>Jadual Kaunseling — ${knEscape(display)}</div>
      <div class="kn-tt-wrap"><table class="kn-tt" id="${tblId}"></table></div>`;
  }).join("");

  names.forEach((normName, idx) => {
    const mine = knBookings.filter((b) => knNorm(b.KAUNSELOR) === normName);
    knBuildTimetable(mine, `kn-tt-individual-${idx}`);
  });
}
function knEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/* ---------------- Popup butiran + EDIT terus ---------------- */
let knEditingRowId = null;

function knOpenDetail(data) {
  knEditingRowId = data.rowId || null;
  document.getElementById("kn-d-jenis").textContent = data.jenis;

  document.getElementById("kn-d-kaunselor-view").value = data.kaunselor;
  document.getElementById("kn-d-tingkatan-view").value = data.tingkatan;
  document.getElementById("kn-d-tarikh-mula-view").value = data.tarikhMula || data.tarikh;
  document.getElementById("kn-d-tarikh-tamat-view").value = data.tarikhTamat || "";

  const info = knSlotsForDate(data.tarikhMula || data.tarikh);
  const opts = info.slots.map((s, i) => { const id = knSlotIdFor(i); return `<option value="${id}">${id} (${s})</option>`; }).join("");
  document.getElementById("kn-d-waktu-mula-view").innerHTML = opts;
  document.getElementById("kn-d-waktu-tamat-view").innerHTML = opts;
  document.getElementById("kn-d-waktu-mula-view").value = data.waktuMula;
  document.getElementById("kn-d-waktu-tamat-view").value = data.waktuTamat;

  document.getElementById("kn-d-perkara-view").value = data.perkara;
  document.getElementById("kn-d-murid-view").value = data.murid;
  document.getElementById("kn-d-error").classList.add("hidden");

  knBuildKelasList("kn-d-tingkatan-list");
  knRefreshMuridPicker("detail");
  knEnsureMurid().then(() => { knBuildKelasList("kn-d-tingkatan-list"); knRefreshMuridPicker("detail"); });

  knFetchStaff().then(() => {
    const sel = document.getElementById("kn-d-kaunselor-view");
    sel.innerHTML = knCounselors.map((c) => `<option value="${c.name}">${c.name}</option>`).join("");
    sel.value = data.kaunselor;
  });

  const editableFields = ["kn-d-kaunselor-view", "kn-d-tingkatan-view", "kn-d-tarikh-mula-view", "kn-d-tarikh-tamat-view", "kn-d-waktu-mula-view", "kn-d-waktu-tamat-view", "kn-d-perkara-view", "kn-d-murid-view"];
  editableFields.forEach((id) => { document.getElementById(id).disabled = !knCanEdit; });
  document.getElementById("kn-d-save-btn").classList.toggle("hidden", !knCanEdit);

  document.getElementById("kn-detail-overlay").classList.remove("hidden");
}

async function knSaveDetailEdit() {
  const errBox = document.getElementById("kn-d-error");
  errBox.classList.add("hidden");

  const payload = {
    action: "edit",
    rowId: knEditingRowId,
    jenis: document.getElementById("kn-d-jenis").textContent,
    kaunselor: document.getElementById("kn-d-kaunselor-view").value,
    tingkatan: knCanonKelasList(document.getElementById("kn-d-tingkatan-view").value),
    tarikhMula: document.getElementById("kn-d-tarikh-mula-view").value,
    tarikhTamat: document.getElementById("kn-d-tarikh-tamat-view").value,
    waktuMula: document.getElementById("kn-d-waktu-mula-view").value,
    waktuTamat: document.getElementById("kn-d-waktu-tamat-view").value,
    perkara: document.getElementById("kn-d-perkara-view").value.trim(),
    murid: document.getElementById("kn-d-murid-view").value.trim(),
  };

  if (!payload.kaunselor || !payload.tingkatan || !payload.tarikhMula || !payload.waktuMula || !payload.waktuTamat || !payload.perkara || !payload.murid) {
    errBox.textContent = "Sila lengkapkan semua maklumat wajib.";
    errBox.classList.remove("hidden");
    return;
  }
  if (!knEditingRowId) {
    errBox.textContent = "Rekod ini tiada rowId — tak boleh dikemaskini (data lama).";
    errBox.classList.remove("hidden");
    return;
  }
  if (!knApiConfigured()) {
    errBox.textContent = "API Kaunseling belum disambungkan.";
    errBox.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("kn-d-save-btn");
  btn.disabled = true; btn.textContent = "Menyimpan...";
  let result;
  try {
    const res = await fetch(KN_API_URL, { method: "POST", body: JSON.stringify(payload) });
    const rawText = await res.text();
    try { result = JSON.parse(rawText); }
    catch (parseErr) { result = res.ok ? { status: "success", _fallbackParse: true } : { status: "error", message: "Respons tak sah: " + rawText.slice(0, 200) }; }
  } catch (err) {
    result = { status: "error", message: "Gagal sambung ke server (" + err.message + ")." };
  }
  btn.disabled = false; btn.textContent = "Simpan Perubahan";

  if (result.status !== "success") {
    errBox.textContent = result.message || "Gagal kemaskini rekod.";
    errBox.classList.remove("hidden");
    return;
  }

  knCloseModal("kn-detail-overlay");
  await knFetchBookings();
  knRenderAllTimetables();
}

document.addEventListener("DOMContentLoaded", () => {
  const jumpInput = document.getElementById("kn-jump-date");
  if (jumpInput) {
    jumpInput.addEventListener("change", function () {
      knWeekMonday = knGetMonday(this.value);
      knUpdateWeekBadge();
      knRenderAllTimetables();
    });
  }
});

/* ---------------- Init ---------------- */
function knInit(user) {
  knCurrentUser = user;
  knCanEdit = knCheckAccess(user);

  if (!knCanEdit) {
    document.querySelectorAll(".kn-choice-card").forEach((card) => {
      card.classList.add("kn-disabled");
      card.setAttribute("onclick", "knShowNoPermission()");
    });
  }

  knUpdateWeekBadge();
  knInitImages();
  knEnsureMurid(); // muat data murid lebih awal (tidak menghalang paparan)
  if (knIsKaunselor(user)) { document.getElementById("kn-tab-btn-senarai").classList.remove("hidden"); knLoadRujukan(false); }
}

/* ---------------- Rujukan murid bermasalah (guru -> kaunselor) ---------------- */
let knRujukan = [], knRjFilter = "Baru", knRujukanId = null;
/** Hanya Kaunselor Sepenuh Masa dan Admin App boleh lihat senarai rujukan (pelayan menyemak semula). */
function knIsKaunselor(u) {
  return String(u.jawatan || "").toUpperCase().indexOf("KAUNSELOR SEPENUH MASA") !== -1 || String(u.role3 || "").trim().toLowerCase() === "admin app";
}
async function knPost(payload) {
  const res = await fetch(KN_API_URL, { method: "POST", body: JSON.stringify(payload) }), raw = await res.text();
  try { return JSON.parse(raw); } catch (e) { return res.ok ? { status: "success", _fallbackParse: true } : { status: "error", message: "Respons tak sah: " + raw.slice(0, 120) }; }
}
async function knSubmitRujukan() {
  const kelas = knCanonKelasList(document.getElementById("kn-rj-kelas").value), murid = document.getElementById("kn-rj-murid").value.trim(), kesalahan = document.getElementById("kn-rj-salah").value.trim();
  const err = document.getElementById("kn-rj-error"), btn = document.getElementById("kn-rj-btn");
  err.classList.add("hidden");
  const fail = (m) => { err.textContent = m; err.classList.remove("hidden"); };
  if (!kelas || !murid || !kesalahan) return fail("Sila isi kelas, nama murid dan kesalahan murid.");
  if (!knApiConfigured()) return fail("API Kaunseling belum disambungkan.");
  btn.disabled = true; btn.textContent = "Menghantar...";
  let r;
  try { r = await knPost({ action: "rujuk", email: knCurrentUser.email, kelas, murid, kesalahan }); }
  catch (e) { r = { status: "error", message: "Gagal sambung ke server (" + e.message + ")." }; }
  btn.disabled = false; btn.textContent = "Hantar kepada Kaunselor";
  if (r.status !== "success") return fail(r.message || "Gagal menghantar rujukan.");
  document.getElementById("kn-rj-kelas").value = ""; document.getElementById("kn-rj-murid").value = ""; document.getElementById("kn-rj-salah").value = "";
  knRefreshMuridPicker("rujuk");
  document.getElementById("kn-result-icon").textContent = "✓";
  document.getElementById("kn-result-title").textContent = "Rujukan Dihantar";
  document.getElementById("kn-result-msg").textContent = "Tempahan untuk murid (" + murid + ") telah dihantar ke kaunselor.";
  document.getElementById("kn-result-overlay").classList.remove("hidden");
  if (knIsKaunselor(knCurrentUser)) knLoadRujukan(true);
}
async function knLoadRujukan(show) {
  const box = document.getElementById("kn-rj-list");
  if (show && box && !knRujukan.length) box.innerHTML = `<div class="kn-rj-empty">Memuatkan rujukan…</div>`;
  if (!knApiConfigured()) return;
  try {
    const res = await fetch(`${KN_API_URL}?action=rujukan&email=${encodeURIComponent(knCurrentUser.email)}`), json = await res.json();
    if (json.status === "success") knRujukan = json.data || [];
    else if (show && box) { box.innerHTML = `<div class="kn-rj-empty">${knEscape(json.message || "Gagal memuatkan rujukan.")}</div>`; return; }
  } catch (e) { if (show && box) { box.innerHTML = `<div class="kn-rj-empty">Gagal memuatkan rujukan (${knEscape(e.message)}). Pastikan Apps Script Kaunseling sudah di-deploy semula (New version).</div>`; return; } }
  knRenderRujukan();
}
function knRjSetFilter(f) { knRjFilter = f; knRenderRujukan(); }
function knRenderRujukan() {
  ["Baru", "Selesai", "Semua"].forEach((f) => { const b = document.getElementById("kn-rj-f-" + f); if (b) b.classList.toggle("active", f === knRjFilter); });
  const baru = knRujukan.filter((x) => x.STATUS !== "Selesai").length, tb = document.getElementById("kn-tab-btn-senarai");
  if (tb) tb.textContent = "Rujukan Guru" + (baru ? " (" + baru + ")" : "");
  const list = knRujukan.filter((x) => knRjFilter === "Semua" || (knRjFilter === "Baru" ? x.STATUS !== "Selesai" : x.STATUS === "Selesai"));
  const box = document.getElementById("kn-rj-list"); if (!box) return;
  box.innerHTML = list.map((x) => `<button type="button" class="kn-rj-item ${x.STATUS === "Selesai" ? "done" : ""}" onclick="knOpenFromRujukan(${x.rowId})">
      <div class="kn-rj-top"><div><div class="kn-rj-nm">${knEscape(x.MURID)}</div><div class="kn-rj-kl">${knEscape(x.KELAS)}</div></div><span class="kn-rj-pill ${x.STATUS === "Selesai" ? "selesai" : "baru"}">${x.STATUS === "Selesai" ? "Selesai" : "Baru"}</span></div>
      <div class="kn-rj-ms">${knEscape(x.KESALAHAN)}</div>
      <div class="kn-rj-meta">Guru: ${knEscape(x.GURU)} · ${knEscape(x.TARIKH)}</div>
      ${x.STATUS === "Selesai" ? "" : `<div class="kn-rj-go">Buat sesi kaunseling ›</div>`}</button>`).join("") || `<div class="kn-rj-empty">Tiada rujukan.</div>`;
}
/** Klik rujukan: terus buka Borang Sesi Kaunseling dengan kelas dan nama murid auto terisi. */
function knOpenFromRujukan(rowId) {
  const r = knRujukan.find((x) => x.rowId === rowId); if (!r) return;
  knOpenForm("Sesi Kaunseling");
  knRujukanId = r.STATUS === "Selesai" ? null : rowId;
  document.getElementById("kn-f-tingkatan").value = knMuridReady() ? knCanonKelasList(r.KELAS) : r.KELAS;
  document.getElementById("kn-f-murid").value = r.MURID;
  knRefreshMuridPicker("form");
  const bn = document.getElementById("kn-rj-banner"); bn.textContent = "Rujukan daripada " + r.GURU + " — kesalahan: " + r.KESALAHAN; bn.classList.remove("hidden");
  knEnsureMurid().then(() => { if (knRujukanId === rowId || !knRujukanId) { document.getElementById("kn-f-tingkatan").value = knCanonKelasList(r.KELAS); knRefreshMuridPicker("form"); } });
}

function knShowNoPermission() {
  document.getElementById("kn-result-icon").textContent = "🔒";
  document.getElementById("kn-result-title").textContent = "Tiada Kebenaran";
  document.getElementById("kn-result-msg").textContent = "Isi/edit tempahan hanya untuk Kaunselor Sepenuh Masa, Admin, atau Pentadbir. Awak masih boleh lihat jadual.";
  document.getElementById("kn-result-overlay").classList.remove("hidden");
}

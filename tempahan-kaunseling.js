/* ============================================================
   TEMPAHAN SESI & PROGRAM KAUNSELING
   Semua pengecam awalan "kn" supaya tak berlanggar dengan skrip lain.
   ============================================================ */

// GANTI dengan URL Web App selepas Code.gs Kaunseling disambung
const KN_API_URL = "PASTE_URL_APPS_SCRIPT_KAUNSELING_ANDA_DI_SINI";
function knApiConfigured() { return KN_API_URL && KN_API_URL.indexOf("PASTE_") !== 0; }

const KN_JAWATAN_KAUNSELOR = "PPP (KAUNSELOR SEPENUH MASA)";

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

const KN_COLOR_PALETTE = ["--cyan", "--blue", "--mint", "--amber", "--pink", "--violet"];
function knHashStr(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
function knColorForKey(key) {
  if (!key) return getComputedStyle(document.documentElement).getPropertyValue("--text-dim").trim();
  const varName = KN_COLOR_PALETTE[knHashStr(String(key).trim().toUpperCase()) % KN_COLOR_PALETTE.length];
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
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

/* ---------------- Akses ---------------- */
function knCheckAccess(user) {
  const jawatanUpper = String(user.jawatan || "").toUpperCase().trim();
  const isKaunselor = jawatanUpper.indexOf("KAUNSELOR SEPENUH MASA") !== -1;
  const isAdmin = String(user.role || "").trim().toLowerCase() === "admin";
  const isPentadbir = String(user.role2 || "").trim().toLowerCase() === "pentadbir";
  return isKaunselor || isAdmin || isPentadbir;
}

/* ---------------- Tab ---------------- */
function knSwitchTab(name) {
  document.getElementById("kn-tab-panel-menu").classList.toggle("hidden", name !== "menu");
  document.getElementById("kn-tab-panel-jadual").classList.toggle("hidden", name !== "jadual");
  document.getElementById("kn-tab-btn-menu").classList.toggle("active", name === "menu");
  document.getElementById("kn-tab-btn-jadual").classList.toggle("active", name === "jadual");
  if (name === "jadual") knLoadAndRenderTimetables();
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
    sel.innerHTML = '<option value="">Gagal muat senarai — cuba lagi</option>';
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

/* ---------------- Borang tempahan ---------------- */
function knOpenForm(jenis) {
  knCurrentJenis = jenis;
  const isSesi = jenis === "Sesi Kaunseling";
  document.getElementById("kn-modal-title").textContent = "BORANG " + jenis.toUpperCase();
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
  document.getElementById("kn-form-error").classList.add("hidden");

  const tingkatanList = document.getElementById("kn-tingkatan-list");
  if (!tingkatanList.dataset.built) {
    tingkatanList.innerHTML = KN_CLASS_LIST.map((c) => `<option value="${c}">`).join("");
    tingkatanList.dataset.built = "1";
  }

  knFetchStaff();
  document.getElementById("kn-booking-overlay").classList.remove("hidden");
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
  const tingkatan = document.getElementById("kn-f-tingkatan").value.trim();
  const tarikhMula = document.getElementById("kn-f-tarikh-mula").value;
  const tarikhTamat = document.getElementById("kn-f-tarikh-tamat").value;
  const waktuMula = document.getElementById("kn-f-waktu-mula").value;
  const waktuTamat = document.getElementById("kn-f-waktu-tamat").value;
  const perkara = document.getElementById("kn-f-perkara").value.trim();
  const murid = document.getElementById("kn-f-murid").value.trim();
  const errBox = document.getElementById("kn-form-error");
  errBox.classList.add("hidden");

  if (!kaunselor || !tingkatan || !tarikhMula || !waktuMula || !waktuTamat || !perkara || !murid) {
    errBox.textContent = "Sila lengkapkan semua maklumat wajib (*).";
    errBox.classList.remove("hidden");
    return;
  }
  if (tarikhTamat && tarikhTamat < tarikhMula) {
    errBox.textContent = "Tarikh Tamat mesti sama atau selepas Tarikh Mula.";
    errBox.classList.remove("hidden");
    return;
  }
  if (!knApiConfigured()) {
    errBox.textContent = "API Kaunseling belum disambungkan (KN_API_URL belum diisi).";
    errBox.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("kn-submit-btn");
  btn.disabled = true; btn.textContent = "Menghantar...";
  const payload = { jenis: knCurrentJenis, kaunselor, tingkatan, tarikhMula, tarikhTamat, waktuMula, waktuTamat, perkara, murid, email: knCurrentUser.email };

  let result;
  try {
    const res = await fetch(KN_API_URL, { method: "POST", body: JSON.stringify(payload) });
    result = await res.json();
  } catch (err) {
    result = { status: "error", message: "Ralat sambungan ke server." };
  }
  btn.disabled = false; btn.textContent = "Hantar Tempahan";

  if (result.status === "conflict") {
    errBox.textContent = result.message || "Kaunselor ini sudah mempunyai rekod pada tarikh & waktu yang sama.";
    errBox.classList.remove("hidden");
    return;
  }
  if (result.status !== "success") {
    errBox.textContent = result.message || "Ralat sistem. Sila cuba semula.";
    errBox.classList.remove("hidden");
    return;
  }

  knCloseModal("kn-booking-overlay");
  document.getElementById("kn-result-icon").textContent = "✓";
  document.getElementById("kn-result-title").textContent = "Tempahan Berjaya!";
  document.getElementById("kn-result-msg").textContent = `Rekod ${knCurrentJenis.toLowerCase()} telah disimpan.`;
  document.getElementById("kn-result-overlay").classList.remove("hidden");
  knFetchBookings();
}

function knCloseModal(id) { document.getElementById(id).classList.add("hidden"); }

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

/**
 * Bina jadual DITRANSPOSE: setiap BARIS = satu slot (+ masa hari biasa di
 * bawah label), setiap LAJUR = satu hari dalam minggu semasa. Jumaat ada
 * bilangan slot lebih sikit (8) — sel lebih daripada tu ditandakan "—".
 */
function knBuildTimetable(sessions, tableElId) {
  const weekDates = [];
  for (let i = 0; i < 7; i++) weekDates.push(knAddDays(knWeekMonday, i));

  const thead = "<thead><tr><th>Slot / Masa</th>" +
    weekDates.map((d, i) => `<th>${KN_WEEK_COLS[i]}<span>${knFmtDateShort(d)}</span></th>`).join("") +
    "</tr></thead>";

  const rows = [];
  for (let slotIdx = 0; slotIdx < KN_MAX_SLOTS; slotIdx++) {
    const slotLabel = knSlotIdFor(slotIdx);
    const cells = weekDates.map((d) => {
      const dStr = knFmtDate(d);
      const dayInfo = knSlotsForDate(dStr);
      if (!dayInfo.slots[slotIdx]) return `<td><div class="kn-tt-cell empty">—</div></td>`;

      const match = sessions.find((b) => {
        const dates = knExpandSessionDates(b);
        if (dates.indexOf(dStr) === -1) return false;
        const numMula = parseInt(String(b.WAKTU_MULA || "").replace(/[^0-9]/g, ""), 10);
        const numTamat = parseInt(String(b.WAKTU_TAMAT || "").replace(/[^0-9]/g, ""), 10) || numMula;
        const lo = Math.min(numMula, numTamat), hi = Math.max(numMula, numTamat);
        return (slotIdx + 1) >= lo && (slotIdx + 1) <= hi;
      });
      if (match) {
        const col = knColorForKey(match.KAUNSELOR);
        const data = JSON.stringify({ tarikh: dStr, jenis: match.JENIS, kaunselor: match.KAUNSELOR, tingkatan: match.TINGKATAN, perkara: match.PERKARA, murid: match.MURID, waktuMula: match.WAKTU_MULA, waktuTamat: match.WAKTU_TAMAT }).replace(/'/g, "&apos;");
        return `<td><div class="kn-tt-cell busy" style="background:${col}22;border:1px solid ${col};color:${col}" onclick='knOpenDetail(${data})'><span class="kn-tt-line kn-b">${(match.KAUNSELOR || "").split(" ")[0]}</span><span class="kn-tt-line">${match.PERKARA || ""}</span></div></td>`;
      }
      return `<td><div class="kn-tt-cell empty">Kosong</div></td>`;
    }).join("");
    rows.push(`<tr><th>${slotLabel}<span>${KN_SLOTS_WEEKDAY[slotIdx]}</span></th>${cells}</tr>`);
  }

  document.getElementById(tableElId).innerHTML = thead + "<tbody>" + rows.join("") + "</tbody>";
}

function knRenderAllTimetables() {
  const sesiAll = knBookings.filter((b) => b.JENIS === "Sesi Kaunseling");
  knBuildTimetable(sesiAll, "kn-tt-all");

  // Auto-appear jadual peribadi kaunselor (tiada dropdown filter) — hanya
  // jika staf log masuk sendiri seorang Kaunselor Sepenuh Masa DAN ada data.
  const sesiWrap = document.getElementById("kn-my-sesi-wrap");
  const programWrap = document.getElementById("kn-my-program-wrap");
  const jawatanUpper = String(knCurrentUser && knCurrentUser.jawatan || "").toUpperCase();
  const myName = knCurrentUser && knCurrentUser.nama || "";

  if (jawatanUpper.indexOf("KAUNSELOR SEPENUH MASA") === -1 || !myName) {
    sesiWrap.classList.add("hidden");
    programWrap.classList.add("hidden");
    return;
  }

  const sesiMine = sesiAll.filter((b) => b.KAUNSELOR === myName);
  const programMine = knBookings.filter((b) => b.JENIS === "Program Kaunseling" && b.KAUNSELOR === myName);

  if (sesiMine.length) {
    document.getElementById("kn-my-sesi-title").textContent = "Jadual Sesi Kaunseling Saya — " + myName;
    knBuildTimetable(sesiMine, "kn-tt-my-sesi");
    sesiWrap.classList.remove("hidden");
  } else {
    sesiWrap.classList.add("hidden");
  }

  if (programMine.length) {
    document.getElementById("kn-my-program-title").textContent = "Jadual Program Kaunseling Saya — " + myName;
    knBuildTimetable(programMine, "kn-tt-my-program");
    programWrap.classList.remove("hidden");
  } else {
    programWrap.classList.add("hidden");
  }
}

function knOpenDetail(data) {
  document.getElementById("kn-d-jenis").textContent = data.jenis;
  document.getElementById("kn-d-tarikh").textContent = data.tarikh;
  document.getElementById("kn-d-waktu").textContent = data.waktuMula + (data.waktuTamat && data.waktuTamat !== data.waktuMula ? " → " + data.waktuTamat : "");
  document.getElementById("kn-d-kaunselor").textContent = data.kaunselor;
  document.getElementById("kn-d-tingkatan").textContent = data.tingkatan;
  document.getElementById("kn-d-perkara").textContent = data.perkara;
  document.getElementById("kn-d-murid").textContent = data.murid;
  document.getElementById("kn-detail-overlay").classList.remove("hidden");
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

  if (!knCheckAccess(user)) {
    document.getElementById("kn-access-denied-overlay").classList.remove("hidden");
    document.getElementById("kn-main-content").classList.add("hidden");
    return;
  }

  knUpdateWeekBadge();
}

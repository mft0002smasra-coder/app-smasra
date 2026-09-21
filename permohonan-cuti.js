/* ============================================================
   PERMOHONAN CUTI REHAT — isi terus dalam app (bukan Google Form).
   Simpan ke Sheet Borang Cuti Rehat Khas sedia ada, tab "Form responses 2".
   ============================================================ */

let pcCurrentUser = null;
const PC_SPREADSHEET_ID = "1AJQQ08we1ooE-Cixgiq-XGrs3xkc7zYDqm0If4oiYi8";
const PC_SHEET_NAME = "Form responses 2";
let pcHistoryRecords = [];
let pcSelectedYear = null;

function pcInit(user) {
  pcCurrentUser = user;
  document.getElementById("pc-f-nama").value = user.nama || "";
  document.getElementById("pc-f-jawatan").value = user.jawatan || "";
  pcGoIntro();
}

function pcGoIntro() {
  document.getElementById("pc-screen-intro").classList.remove("hidden");
  document.getElementById("pc-screen-form").classList.add("hidden");
  pcLoadHistory();
}
function pcGoForm() {
  document.getElementById("pc-screen-intro").classList.add("hidden");
  document.getElementById("pc-screen-form").classList.remove("hidden");
  document.getElementById("pc-form-error").classList.add("hidden");
}

/* ================= Sejarah Permohonan (gviz terus, tapis nama + tahun) ================= */
async function pcFetchHistory() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${PC_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(PC_SHEET_NAME)}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;
    const get = (c, i) => (c[i] && c[i].v != null ? String(c[i].v).trim() : "");
    // Rekod LAMA (dari Google Form sebenar, ditulis ramai guru) mungkin simpan
    // tarikh sebagai SEL JENIS DATE SEBENAR (gviz -> "Date(y,m,d)"), manakala
    // rekod BAHARU (dari app ni) simpan sebagai teks tulen "dd/mm/YYYY".
    // Fungsi ni kendali KEDUA-DUA bentuk, normal ke "dd/mm/YYYY" konsisten.
    const toDDMMYYYY = (raw) => {
      if (!raw) return "";
      const m = raw.match(/^Date\((\d+),(\d+),(\d+)/);
      if (m) {
        const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) + 1, d = parseInt(m[3], 10);
        return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
      }
      return raw; // dah teks "dd/mm/YYYY" sedia ada
    };
    pcHistoryRecords = (table.rows || []).map((r) => {
      const c = r.c || [];
      return {
        timestamp: get(c, 0), nama: get(c, 1), jawatan: get(c, 2), jenisCuti: get(c, 3),
        mulaiDari: toDDMMYYYY(get(c, 4)), hingga: toDDMMYYYY(get(c, 5)),
        selama: get(c, 6), catatan: get(c, 7),
      };
    }).filter((r) => r.nama);
  } catch (e) {
    pcHistoryRecords = [];
  }
}

function pcNorm(str) { return String(str || "").trim().toUpperCase().replace(/\s+/g, " "); }

async function pcLoadHistory() {
  const listEl = document.getElementById("pc-history-list");
  listEl.innerHTML = `<div class="empty-state">Memuatkan...</div>`;
  await pcFetchHistory();

  const myRecords = pcHistoryRecords.filter((r) => pcNorm(r.nama) === pcNorm(pcCurrentUser.nama));

  // Bina senarai tahun dari "MulaiDari" (dd/mm/YYYY), default TAHUN SEMASA
  const years = [...new Set(myRecords.map((r) => {
    const m = r.mulaiDari.match(/\/(\d{4})$/);
    return m ? m[1] : null;
  }).filter(Boolean))].sort((a, b) => b - a);
  const thisYear = String(new Date().getFullYear());
  if (!years.includes(thisYear)) years.unshift(thisYear);
  if (!pcSelectedYear) pcSelectedYear = thisYear;

  const yearSelEl = document.getElementById("pc-history-year");
  yearSelEl.innerHTML = years.map((y) => `<option value="${y}"${y === pcSelectedYear ? " selected" : ""}>${y}</option>`).join("");

  pcRenderHistory(myRecords);
}

function pcOnYearChange() {
  pcSelectedYear = document.getElementById("pc-history-year").value;
  const myRecords = pcHistoryRecords.filter((r) => pcNorm(r.nama) === pcNorm(pcCurrentUser.nama));
  pcRenderHistory(myRecords);
}

function pcRenderHistory(myRecords) {
  const filtered = myRecords.filter((r) => r.mulaiDari.endsWith("/" + pcSelectedYear));
  filtered.sort((a, b) => {
    const da = a.mulaiDari.split("/").reverse().join("");
    const db = b.mulaiDari.split("/").reverse().join("");
    return db.localeCompare(da);
  });
  const listEl = document.getElementById("pc-history-list");
  listEl.innerHTML = filtered.length
    ? filtered.map((r) => `
      <div class="pc-history-row">
        <div class="pc-history-row-top">
          <span class="pc-history-jenis">${pcEscape(r.jenisCuti)}</span>
          <span class="pc-history-selama">${pcEscape(r.selama)} hari</span>
        </div>
        <div class="pc-history-tarikh">${pcEscape(r.mulaiDari)} &ndash; ${pcEscape(r.hingga)}</div>
        ${r.catatan ? `<div class="pc-history-catatan">${pcEscape(r.catatan)}</div>` : ""}
      </div>`).join("")
    : `<div class="empty-state">Tiada permohonan untuk tahun ${pcEscape(pcSelectedYear)}.</div>`;
}

function pcEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/** Kira "Selama" (bilangan hari) secara automatik: Mulai Dari -> Hingga,
 * termasuk kedua-dua tarikh (inklusif), macam kaedah kiraan cuti biasa. */
function pcCalcSelama() {
  const mula = document.getElementById("pc-f-mula").value;
  const hingga = document.getElementById("pc-f-hingga").value;
  const selamaEl = document.getElementById("pc-f-selama");
  if (!mula || !hingga) { selamaEl.value = "-"; return; }
  const d1 = new Date(mula + "T00:00:00");
  const d2 = new Date(hingga + "T00:00:00");
  const diffDays = Math.round((d2 - d1) / 86400000) + 1;
  selamaEl.value = diffDays > 0 ? diffDays : "-";
}

async function pcSubmit() {
  const jawatan = document.getElementById("pc-f-jawatan").value.trim();
  const jenisCuti = document.getElementById("pc-f-jenis").value;
  const mulaiDari = document.getElementById("pc-f-mula").value;
  const hingga = document.getElementById("pc-f-hingga").value;
  const selama = document.getElementById("pc-f-selama").value;
  const catatan = document.getElementById("pc-f-catatan").value.trim();
  const errEl = document.getElementById("pc-form-error");
  errEl.classList.add("hidden");

  if (!jawatan || !mulaiDari || !hingga || selama === "-") {
    errEl.textContent = "Sila lengkapkan Jawatan, Mulai Dari, dan Hingga.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!apiConfigured()) {
    errEl.textContent = "API belum disambungkan.";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("pc-submit-btn");
  btn.disabled = true; btn.textContent = "Menghantar...";
  try {
    const data = await postToAppsScript(API_URL, {
      action: "savePermohonanCuti",
      nama: pcCurrentUser.nama, jawatan, jenisCuti, mulaiDari, hingga, selama, catatan,
    });
    if (data.success) {
      document.getElementById("pc-success-overlay").classList.remove("hidden");
      // Reset borang untuk permohonan seterusnya
      document.getElementById("pc-f-jenis").value = "CUTI REHAT KHAS";
      document.getElementById("pc-f-mula").value = "";
      document.getElementById("pc-f-hingga").value = "";
      document.getElementById("pc-f-selama").value = "-";
      document.getElementById("pc-f-catatan").value = "";
      pcLoadHistory(); // papar semula sejarah termasuk rekod baharu
    } else {
      errEl.textContent = data.message || "Gagal hantar permohonan.";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "Ralat sambungan ke server (" + err.message + ").";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false; btn.textContent = "Hantar Permohonan";
}

function pcCloseSuccess() {
  document.getElementById("pc-success-overlay").classList.add("hidden");
  pcGoIntro();
}

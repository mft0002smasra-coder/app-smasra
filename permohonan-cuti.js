/* ============================================================
   PERMOHONAN CUTI REHAT — isi terus dalam app (bukan Google Form).
   Simpan ke Sheet Borang Cuti Rehat Khas sedia ada, tab "Form responses 2".
   ============================================================ */

let pcCurrentUser = null;

function pcInit(user) {
  pcCurrentUser = user;
  document.getElementById("pc-f-nama").value = user.nama || "";
  document.getElementById("pc-f-jawatan").value = user.jawatan || "";
  pcGoIntro();
}

function pcGoIntro() {
  document.getElementById("pc-screen-intro").classList.remove("hidden");
  document.getElementById("pc-screen-form").classList.add("hidden");
}
function pcGoForm() {
  document.getElementById("pc-screen-intro").classList.add("hidden");
  document.getElementById("pc-screen-form").classList.remove("hidden");
  document.getElementById("pc-form-error").classList.add("hidden");
}

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
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "savePermohonanCuti",
        nama: pcCurrentUser.nama, jawatan, jenisCuti, mulaiDari, hingga, selama, catatan,
      }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("pc-success-overlay").classList.remove("hidden");
      // Reset borang untuk permohonan seterusnya
      document.getElementById("pc-f-jenis").value = "CUTI REHAT KHAS";
      document.getElementById("pc-f-mula").value = "";
      document.getElementById("pc-f-hingga").value = "";
      document.getElementById("pc-f-selama").value = "-";
      document.getElementById("pc-f-catatan").value = "";
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

/* ============================================================
   LAPORAN PENTADBIR BERTUGAS — logik borang, senarai & laporan A4
   PROJEK APPS SCRIPT BERASINGAN (ikut corak Kehadiran Murid),
   supaya tak sentuh backend app utama / Kehadiran Murid.
   ------------------------------------------------------------
   Cara pasang backend:
   1. Buka Google Sheet "List Laporan" (link diberikan oleh admin)
   2. Extensions > Apps Script > projek BAHARU > tampal Code-LaporanPentadbir.gs
   3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
   4. Salin URL .../exec, paste ke LPB_API_URL di bawah
   ============================================================ */

const LPB_API_URL = "PASTE_URL_APPS_SCRIPT_LAPORAN_PENTADBIR_DI_SINI";

function lpbApiConfigured() { return LPB_API_URL && LPB_API_URL.indexOf("PASTE_") !== 0; }

const LPB_BLOK_OPTIONS = [
  "BLOK A", "BLOK B", "BLOK C", "KANTIN",
  "1 Ar-Razi", "1 Ibnu Rushd", "1 Al-Farabi",
  "2 Ar-Razi", "2 Ibnu Rushd", "2 Al-Farabi",
  "3 Ar-Razi", "3 Ibnu Rushd", "3 Al-Farabi",
  "4 Ar-Razi", "4 Ibnu Rushd", "4 Al-Farabi",
  "5 Ar-Razi", "5 Ibnu Rushd", "5 Al-Farabi",
  "6 Al-Ghazali", "6 Al Bukhari",
  "ASPURA", "ASPURI", "DEWAN MAKAN", "KAWASAN SEKOLAH", "KAWASAN ASRAMA",
];

const LPB_BULAN = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];

let lpbCurrentUser = null;
let lpbReports = [];          // senarai mentah dari server (satu baris = satu blok/kelas diperiksa)
let lpbPhotos = [null, null]; // { dataUrl, base64, mimeType } untuk slot 1 & 2
let lpbActiveGroupKey = null; // tarikh|nama laporan yang sedang dibuka dalam popup

function lpbEscape(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------- Init ---------------- */

function lpbInit(user) {
  lpbCurrentUser = user;
  document.getElementById("lpb-nav-wrap").classList.remove("hidden");

  const blokSelect = document.getElementById("lpb-blok");
  blokSelect.innerHTML = LPB_BLOK_OPTIONS.map((b) => `<option value="${lpbEscape(b)}">${lpbEscape(b)}</option>`).join("");

  document.getElementById("lpb-nama").value = user.nama || "";
  document.getElementById("lpb-tarikh").valueAsDate = new Date();
  const now = new Date();
  document.getElementById("lpb-masa").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  lpbSetupPhotoSlot(1);
  lpbSetupPhotoSlot(2);

  document.getElementById("lpb-form").addEventListener("submit", lpbSubmitForm);
  document.getElementById("lpb-a4-logo").src = SCHOOL_LOGO_URL;

  lpbBuildFilterOptions();
  document.getElementById("lpb-filter-year").addEventListener("change", lpbRenderList);
  document.getElementById("lpb-filter-month").addEventListener("change", lpbRenderList);

  lpbSwitchPage("borang");
}

function lpbGoBack() {
  if (window.history.length > 1) window.history.back();
  else location.href = "index.html";
}

function lpbSwitchPage(name) {
  document.getElementById("lpb-page-borang").classList.toggle("active", name === "borang");
  document.getElementById("lpb-page-senarai").classList.toggle("active", name === "senarai");
  document.getElementById("lpb-nav-borang").classList.toggle("active", name === "borang");
  document.getElementById("lpb-nav-senarai").classList.toggle("active", name === "senarai");
  if (name === "senarai") lpbLoadList();
}

/* ---------------- Upload gambar (resize + preview) ---------------- */

function lpbSetupPhotoSlot(n) {
  const input = document.getElementById(`lpb-photo-input-${n}`);
  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lpbResizeImage(file, 1000, 0.72).then((result) => {
      lpbPhotos[n - 1] = result;
      lpbRenderPhotoSlot(n);
    });
  });
}

function lpbResizeImage(file, maxDim, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({ dataUrl, base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function lpbRenderPhotoSlot(n) {
  const slot = document.getElementById(`lpb-photo-slot-${n}`);
  const photo = lpbPhotos[n - 1];
  if (!photo) {
    slot.innerHTML = `<span data-icon="camera"></span><span>Gambar ${n}</span><input type="file" accept="image/*" id="lpb-photo-input-${n}">`;
    renderIcons();
    lpbSetupPhotoSlot(n);
    return;
  }
  slot.innerHTML = `<img src="${photo.dataUrl}" alt="Pratonton gambar ${n}"><button type="button" class="lpb-photo-remove" onclick="lpbRemovePhoto(${n})">&times;</button>`;
}

function lpbRemovePhoto(n) {
  lpbPhotos[n - 1] = null;
  lpbRenderPhotoSlot(n);
}

/* ---------------- Hantar borang ---------------- */

async function lpbSubmitForm(e) {
  e.preventDefault();
  const errEl = document.getElementById("lpb-form-error");
  errEl.classList.add("hidden");

  const nama = document.getElementById("lpb-nama").value.trim();
  const tarikhRaw = document.getElementById("lpb-tarikh").value; // yyyy-mm-dd
  const masa = document.getElementById("lpb-masa").value;
  const blok = document.getElementById("lpb-blok").value;
  const catatan = document.getElementById("lpb-catatan").value.trim();

  if (!nama || !tarikhRaw || !masa || !blok || !catatan) {
    errEl.textContent = "Sila lengkapkan semua ruangan.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!lpbApiConfigured()) {
    errEl.textContent = "Sistem belum disambungkan ke Apps Script (LPB_API_URL belum diisi).";
    errEl.classList.remove("hidden");
    return;
  }

  const [y, m, d] = tarikhRaw.split("-");
  const tarikh = `${d}/${m}/${y}`; // format seragam dd/mm/yyyy macam modul Kehadiran Murid

  const btn = document.getElementById("lpb-submit-btn");
  btn.disabled = true;
  btn.textContent = "Menghantar...";

  try {
    const res = await fetch(LPB_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "addLaporanPentadbir",
        email: lpbCurrentUser.email,
        namaPentadbir: nama,
        tarikh, masa, blokKelas: blok, catatan,
        gambar1: lpbPhotos[0] ? { data: lpbPhotos[0].base64, mimeType: lpbPhotos[0].mimeType } : null,
        gambar2: lpbPhotos[1] ? { data: lpbPhotos[1].base64, mimeType: lpbPhotos[1].mimeType } : null,
      }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("lpb-form-box").classList.add("hidden");
      document.getElementById("lpb-success-box").classList.remove("hidden");
    } else {
      errEl.textContent = data.message || "Gagal hantar laporan.";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "Ralat sambungan ke server.";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false;
  btn.textContent = "Hantar Laporan";
}

function lpbResetForm() {
  document.getElementById("lpb-form").reset();
  document.getElementById("lpb-nama").value = lpbCurrentUser.nama || "";
  document.getElementById("lpb-tarikh").valueAsDate = new Date();
  lpbPhotos = [null, null];
  lpbRenderPhotoSlot(1);
  lpbRenderPhotoSlot(2);
  document.getElementById("lpb-success-box").classList.add("hidden");
  document.getElementById("lpb-form-box").classList.remove("hidden");
}

/* ---------------- Senarai laporan (kumpul ikut Nama + Tarikh) ---------------- */

function lpbBuildFilterOptions() {
  const yearSelect = document.getElementById("lpb-filter-year");
  const monthSelect = document.getElementById("lpb-filter-month");
  const thisYear = new Date().getFullYear();
  let yearsHtml = `<option value="">Semua Tahun</option>`;
  for (let y = thisYear + 1; y >= thisYear - 3; y--) yearsHtml += `<option value="${y}">${y}</option>`;
  yearSelect.innerHTML = yearsHtml;
  yearSelect.value = thisYear;

  let monthsHtml = `<option value="">Semua Bulan</option>`;
  LPB_BULAN.forEach((b, i) => { monthsHtml += `<option value="${i + 1}">${b}</option>`; });
  monthSelect.innerHTML = monthsHtml;
}

async function lpbLoadList() {
  const container = document.getElementById("lpb-list-container");
  if (!lpbApiConfigured()) {
    container.innerHTML = '<div class="empty-state">API belum disambungkan (LPB_API_URL belum diisi dalam laporan-pentadbir.js).</div>';
    return;
  }
  container.innerHTML = '<div class="empty-state">Memuatkan senarai laporan...</div>';
  try {
    const res = await fetch(`${LPB_API_URL}?action=getLaporanPentadbir`);
    lpbReports = await res.json();
    lpbRenderList();
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Gagal muatkan senarai laporan. Cuba lagi.</div>';
  }
}

function lpbGroupReports(list) {
  const groups = {};
  list.forEach((r) => {
    const key = `${r.tarikh}|${r.namaPentadbir}`;
    if (!groups[key]) groups[key] = { tarikh: r.tarikh, namaPentadbir: r.namaPentadbir, entries: [] };
    groups[key].entries.push(r);
  });
  return Object.values(groups).sort((a, b) => lpbDateSortVal(b.tarikh) - lpbDateSortVal(a.tarikh));
}

function lpbDateSortVal(ddmmyyyy) {
  const [d, m, y] = String(ddmmyyyy).split("/").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

function lpbRenderList() {
  const container = document.getElementById("lpb-list-container");
  const yearFilter = document.getElementById("lpb-filter-year").value;
  const monthFilter = document.getElementById("lpb-filter-month").value;

  const filtered = lpbReports.filter((r) => {
    const parts = String(r.tarikh).split("/"); // dd/mm/yyyy
    if (parts.length !== 3) return false;
    const [, mm, yyyy] = parts;
    if (yearFilter && yyyy !== String(yearFilter)) return false;
    if (monthFilter && Number(mm) !== Number(monthFilter)) return false;
    return true;
  });

  const groups = lpbGroupReports(filtered);
  if (!groups.length) {
    container.innerHTML = '<div class="empty-state">Tiada laporan untuk tempoh ini.</div>';
    return;
  }

  container.innerHTML = groups.map((g) => {
    const fotoCount = g.entries.reduce((n, e) => n + (e.gambar1 ? 1 : 0) + (e.gambar2 ? 1 : 0), 0);
    return `
    <div class="lpb-card" onclick="lpbOpenReport('${lpbEscape(g.tarikh)}','${encodeURIComponent(g.namaPentadbir)}')">
      <div class="lpb-card-top">
        <span class="lpb-card-blok">${g.entries.length} Lokasi Diperiksa</span>
        <span class="lpb-card-date">${lpbEscape(g.tarikh)}</span>
      </div>
      <div class="lpb-card-nama">👤 ${lpbEscape(g.namaPentadbir)}</div>
      <div class="lpb-card-catatan">${lpbEscape(g.entries.map((e) => e.blokKelas).join(", "))}</div>
      ${fotoCount ? `<div class="lpb-card-foto-badge">📷 ${fotoCount} gambar</div>` : ""}
    </div>`;
  }).join("");
}

/* ---------------- Popup laporan A4 ---------------- */

function lpbOpenReport(tarikh, namaEncoded) {
  const nama = decodeURIComponent(namaEncoded);
  lpbActiveGroupKey = `${tarikh}|${nama}`;
  const entries = lpbReports
    .filter((r) => r.tarikh === tarikh && r.namaPentadbir === nama)
    .sort((a, b) => String(a.masa).localeCompare(String(b.masa)));

  document.getElementById("lpb-a4-nama").textContent = nama;
  document.getElementById("lpb-a4-tarikh").textContent = tarikh;
  document.getElementById("lpb-a4-foot").textContent = `Dijana pada ${new Date().toLocaleString("ms-MY")}`;

  document.getElementById("lpb-a4-tbody").innerHTML = entries.map((e) => {
    const photos = [e.gambar1, e.gambar2].filter(Boolean)
      .map((url) => `<img src="${lpbEscape(url)}" crossorigin="anonymous">`).join("");
    return `<tr>
      <td class="lpb-a4-col-masa">${lpbEscape(e.masa)}</td>
      <td class="lpb-a4-col-blok">${lpbEscape(e.blokKelas)}</td>
      <td>${lpbEscape(e.catatan)}</td>
      <td><div class="lpb-a4-photos">${photos || "-"}</div></td>
    </tr>`;
  }).join("");

  document.getElementById("lpb-report-overlay").classList.add("show");
}

function lpbCloseReport() {
  document.getElementById("lpb-report-overlay").classList.remove("show");
  lpbActiveGroupKey = null;
}

async function lpbDownloadReport() {
  const node = document.getElementById("lpb-a4-content");
  try {
    const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
    const link = document.createElement("a");
    const safeName = (document.getElementById("lpb-a4-nama").textContent + "-" + document.getElementById("lpb-a4-tarikh").textContent)
      .replace(/[^a-z0-9]+/gi, "-");
    link.download = `Laporan-Pentadbir-${safeName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    alert("Gagal jana fail PNG. Cuba lagi.");
  }
}

/* ---------------- Padam laporan (dengan pengesahan) ---------------- */

function lpbAskDelete() {
  document.getElementById("lpb-confirm-overlay").classList.add("show");
}
function lpbCancelDelete() {
  document.getElementById("lpb-confirm-overlay").classList.remove("show");
}

async function lpbConfirmDelete() {
  document.getElementById("lpb-confirm-overlay").classList.remove("show");
  if (!lpbActiveGroupKey) return;
  const [tarikh, nama] = lpbActiveGroupKey.split("|");

  try {
    const res = await fetch(LPB_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "deleteLaporanPentadbir", email: lpbCurrentUser.email, tarikh, namaPentadbir: nama }),
    });
    const data = await res.json();
    if (data.success) {
      lpbCloseReport();
      await lpbLoadList();
    } else {
      alert(data.message || "Gagal padam laporan.");
    }
  } catch (err) {
    alert("Ralat sambungan ke server.");
  }
}

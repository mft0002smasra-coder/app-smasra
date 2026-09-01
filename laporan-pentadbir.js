/* ============================================================
   LAPORAN PENTADBIR BERTUGAS
   ============================================================ */

const LP_BLOK_LIST = [
  "BLOK A", "BLOK B", "BLOK C", "KANTIN",
  "1 Ar-Razi", "1 Ibnu Rushd", "1 Al-Farabi",
  "2 Ar-Razi", "2 Ibnu Rushd", "2 Al-Farabi",
  "3 Ar-Razi", "3 Ibnu Rushd", "3 Al-Farabi",
  "4 Ar-Razi", "4 Ibnu Rushd", "4 Al-Farabi",
  "5 Ar-Razi", "5 Ibnu Rushd", "5 Al-Farabi",
  "6 Al-Ghazali", "6 Al Bukhari",
  "ASPURA", "ASPURI", "DEWAN MAKAN", "KAWASAN SEKOLAH", "KAWASAN ASRAMA",
];
const LP_BULAN = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];

let lpRecords = [];
let lpCurrentUser = null;
let lpImageData = { 1: null, 2: null };
let lpHtml2canvasReady = false;
let lpDeleteTarget = null;

function lpEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function lpPad2(n) { return String(n).padStart(2, "0"); }

/* ---------------- Navigasi dalam-page (Borang / Senarai) ---------------- */
function lpSwitchPage(name) {
  document.getElementById("lp-page-borang").classList.toggle("hidden", name !== "borang");
  document.getElementById("lp-page-senarai").classList.toggle("hidden", name !== "senarai");
  document.getElementById("lp-nav-borang").classList.toggle("active", name === "borang");
  document.getElementById("lp-nav-senarai").classList.toggle("active", name === "senarai");
  if (name === "senarai") lpRenderList();
}

/* ---------------- Borang: mampat & pratonton gambar ---------------- */
function lpHandleImagePick(slot, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1000;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      lpImageData[slot] = dataUrl;
      const preview = document.getElementById(`lp-preview-${slot}`);
      preview.src = dataUrl;
      preview.classList.remove("hidden");
      document.getElementById(`lp-preview-empty-${slot}`).classList.add("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function lpRemoveImage(slot) {
  lpImageData[slot] = null;
  document.getElementById(`lp-file-${slot}`).value = "";
  document.getElementById(`lp-preview-${slot}`).classList.add("hidden");
  document.getElementById(`lp-preview-empty-${slot}`).classList.remove("hidden");
}

function lpResetForm() {
  const form = document.getElementById("lp-form");
  form.reset();
  lpImageData = { 1: null, 2: null };
  [1, 2].forEach((slot) => {
    document.getElementById(`lp-preview-${slot}`).classList.add("hidden");
    document.getElementById(`lp-preview-empty-${slot}`).classList.remove("hidden");
  });
  const now = new Date();
  document.getElementById("lp-tarikh").value = `${now.getFullYear()}-${lpPad2(now.getMonth() + 1)}-${lpPad2(now.getDate())}`;
  document.getElementById("lp-masa").value = `${lpPad2(now.getHours())}:${lpPad2(now.getMinutes())}`;
  if (lpCurrentUser) document.getElementById("lp-nama").value = lpCurrentUser.nama || "";
}

async function lpSubmitForm(e) {
  e.preventDefault();
  const errEl = document.getElementById("lp-form-error");
  errEl.classList.add("hidden");

  const nama = document.getElementById("lp-nama").value.trim();
  const tarikh = document.getElementById("lp-tarikh").value;
  const masa = document.getElementById("lp-masa").value;
  const blok = document.getElementById("lp-blok").value;
  const catatan = document.getElementById("lp-catatan").value.trim();

  if (!nama || !tarikh || !blok) {
    errEl.textContent = "Sila lengkapkan nama pentadbir, tarikh, dan blok/kelas.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!apiConfigured()) {
    errEl.textContent = "API belum disambungkan (API_URL belum diisi dalam app.js).";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("lp-submit-btn");
  btn.disabled = true;
  btn.textContent = "Menghantar...";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "addLaporanPentadbir",
        email: lpCurrentUser.email,
        namaPentadbir: nama,
        tarikh, masa, blokKelas: blok, catatan,
        gambar1: lpImageData[1] || "",
        gambar2: lpImageData[2] || "",
      }),
    });
    const data = await res.json();
    if (data.success) {
      lpResetForm();
      alert(data.warning ? `Rekod dihantar, tapi ada masalah gambar:\n${data.warning}` : "Rekod pemantauan berjaya dihantar!");
      await lpLoadRecords();
    } else {
      errEl.textContent = data.message || "Gagal hantar rekod.";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "Ralat sambungan ke server.";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false;
  btn.textContent = "Hantar Rekod";
}

/* ---------------- Senarai laporan (dikumpul ikut Nama + Tarikh) ---------------- */
async function lpLoadRecords() {
  if (!apiConfigured()) return;
  try {
    const res = await fetch(`${API_URL}?action=getLaporanPentadbir`);
    lpRecords = await res.json();
  } catch (e) {
    lpRecords = [];
  }
}

function lpGroupedReports() {
  const map = new Map();
  lpRecords.forEach((r) => {
    const key = r.namaPentadbir + "|" + r.tarikh;
    if (!map.has(key)) map.set(key, { namaPentadbir: r.namaPentadbir, tarikh: r.tarikh, items: [] });
    map.get(key).items.push(r);
  });
  const groups = Array.from(map.values());
  groups.forEach((g) => g.items.sort((a, b) => a.masa.localeCompare(b.masa)));
  groups.sort((a, b) => b.tarikh.localeCompare(a.tarikh));
  return groups;
}

function lpInitFilters() {
  const years = Array.from(new Set(lpRecords.map((r) => r.tarikh.slice(0, 4))));
  years.add ? null : null;
  const yearSet = new Set(years);
  yearSet.add(String(new Date().getFullYear()));
  const yearArr = Array.from(yearSet).sort((a, b) => b - a);

  const yearSel = document.getElementById("lp-filter-year");
  yearSel.innerHTML = `<option value="">Semua Tahun</option>` + yearArr.map((y) => `<option value="${y}">${y}</option>`).join("");

  const monthSel = document.getElementById("lp-filter-month");
  monthSel.innerHTML = `<option value="">Semua Bulan</option>` + LP_BULAN.map((b, i) => `<option value="${i + 1}">${b}</option>`).join("");
}

function lpRenderList() {
  if (!lpRecords.length) {
    lpLoadRecords().then(() => { lpInitFilters(); lpRenderListInner(); });
  } else {
    lpRenderListInner();
  }
}

function lpRenderListInner() {
  const year = document.getElementById("lp-filter-year").value;
  const month = document.getElementById("lp-filter-month").value;

  let groups = lpGroupedReports();
  if (year) groups = groups.filter((g) => g.tarikh.slice(0, 4) === year);
  if (month) groups = groups.filter((g) => String(parseInt(g.tarikh.slice(5, 7), 10)) === month);

  const listEl = document.getElementById("lp-list");
  if (!groups.length) {
    listEl.innerHTML = `<div class="empty-state">Tiada laporan dijumpai.</div>`;
    return;
  }
  listEl.innerHTML = groups.map((g) => {
    const [y, m, d] = g.tarikh.split("-");
    return `<div class="lp-list-item" onclick="lpOpenReport('${lpEscape(g.namaPentadbir)}','${g.tarikh}')">
      <div class="lp-list-main">
        <div class="lp-list-nama">${lpEscape(g.namaPentadbir)}</div>
        <div class="lp-list-sub">${d}/${m}/${y} &middot; ${g.items.length} rekod</div>
      </div>
      <span class="lp-list-arrow">&rsaquo;</span>
    </div>`;
  }).join("");
}

/* ---------------- Popup laporan (format A4, formal) ---------------- */
function lpOpenReport(namaPentadbir, tarikh) {
  const items = lpRecords.filter((r) => r.namaPentadbir === namaPentadbir && r.tarikh === tarikh)
    .sort((a, b) => a.masa.localeCompare(b.masa));
  const [y, m, d] = tarikh.split("-");
  const tarikhFmt = `${d}/${m}/${y}`;

  const rows = items.map((r) => {
    const imgs = [r.gambar1, r.gambar2].filter(Boolean)
      .map((url) => `<img src="${lpEscape(url)}" class="lp-report-img">`).join("");
    return `<tr>
      <td>${lpEscape(r.masa || "-")}</td>
      <td>${lpEscape(r.blokKelas)}</td>
      <td style="white-space:pre-wrap">${lpEscape(r.catatan || "-")}</td>
      <td>${imgs || "-"}</td>
    </tr>`;
  }).join("");

  document.getElementById("lp-report-content").innerHTML = `
    <div class="lp-report-header">
      <img src="${SCHOOL_LOGO_URL}" class="lp-report-logo" crossorigin="anonymous">
      <div class="lp-report-title">PEMANTAUAN PENTADBIR BERTUGAS<br>("MANAGEMENT BY WALKING AROUND")<br>SM ARAB (JAIM) AL-ASYRAF</div>
    </div>
    <div class="lp-report-meta">
      <div><b>Nama Pentadbir Bertugas:</b> ${lpEscape(namaPentadbir)}</div>
      <div><b>Tarikh:</b> ${tarikhFmt}</div>
    </div>
    <table class="lp-report-table">
      <thead><tr><th>Masa</th><th>Blok/Kelas</th><th>Catatan/Ulasan Pemantau</th><th>Gambar</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  lpDeleteTarget = { namaPentadbir, tarikh };
  document.getElementById("lp-report-overlay").classList.remove("hidden");
}
function lpCloseReport() {
  document.getElementById("lp-report-overlay").classList.add("hidden");
}

/* ---------------- Muat turun PNG (html2canvas, CDN dinamik) ---------------- */
function lpLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("gagal muat " + src));
    document.head.appendChild(s);
  });
}
async function lpEnsureHtml2Canvas() {
  if (lpHtml2canvasReady || typeof html2canvas !== "undefined") { lpHtml2canvasReady = true; return; }
  const cdns = [
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",
  ];
  for (const url of cdns) {
    try { await lpLoadScript(url); if (typeof html2canvas !== "undefined") { lpHtml2canvasReady = true; return; } } catch (e) {}
  }
}
async function lpDownloadPng() {
  const btn = document.getElementById("lp-download-btn");
  btn.disabled = true;
  btn.textContent = "Menyediakan...";
  await lpEnsureHtml2Canvas();
  if (typeof html2canvas === "undefined") {
    alert("Gagal muatkan pustaka export. Cuba lagi bila ada sambungan internet.");
    btn.disabled = false;
    btn.textContent = "Muat Turun PNG";
    return;
  }
  const el = document.getElementById("lp-report-content");
  try {
    const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = `Laporan_Pentadbir_${(lpDeleteTarget.namaPentadbir || "").replace(/\s+/g, "_")}_${lpDeleteTarget.tarikh}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    alert("Gagal jana PNG: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "Muat Turun PNG";
}

/* ---------------- Padam laporan (dengan pengesahan) ---------------- */
function lpConfirmDelete() {
  document.getElementById("lp-confirm-overlay").classList.remove("hidden");
}
function lpCancelDelete() {
  document.getElementById("lp-confirm-overlay").classList.add("hidden");
}
async function lpDoDelete() {
  if (!lpDeleteTarget) return;
  const btn = document.getElementById("lp-confirm-delete-btn");
  btn.disabled = true;
  btn.textContent = "Memadam...";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "deleteLaporanPentadbir", namaPentadbir: lpDeleteTarget.namaPentadbir, tarikh: lpDeleteTarget.tarikh }),
    });
    const data = await res.json();
    if (data.success) {
      lpCancelDelete();
      lpCloseReport();
      await lpLoadRecords();
      lpRenderListInner();
    } else {
      alert(data.message || "Gagal padam laporan.");
    }
  } catch (err) {
    alert("Ralat sambungan ke server.");
  }
  btn.disabled = false;
  btn.textContent = "Ya, Padam";
}

/* ---------------- Init ---------------- */
function lpInit(user) {
  lpCurrentUser = user;

  const role2Norm = String(user.role2 || "").trim().toLowerCase();
  if (role2Norm !== "pentadbir") {
    document.getElementById("lp-access-denied-overlay").classList.remove("hidden");
    document.getElementById("lp-main-content").classList.add("hidden");
    return;
  }

  const blokSel = document.getElementById("lp-blok");
  blokSel.innerHTML = `<option value="">Pilih Blok/Kelas</option>` + LP_BLOK_LIST.map((b) => `<option value="${b}">${b}</option>`).join("");

  lpResetForm();
  document.getElementById("lp-form").addEventListener("submit", lpSubmitForm);
  document.getElementById("lp-filter-year").addEventListener("change", lpRenderListInner);
  document.getElementById("lp-filter-month").addEventListener("change", lpRenderListInner);

  lpInitFilters();
}

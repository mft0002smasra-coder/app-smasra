/* ============================================================
   Halaman "Jadual Guru Ganti" — semua guru boleh LIHAT; Pentadbir & Admin App boleh MUAT NAIK (PDF) / PADAM.
   Kod kongsi (pembaca PDF, padanan nama, baca data): guru-ganti.js
   ============================================================ */

let ggUser = null, ggCanManage = false;
let ggAll = [];          // semua rekod
let ggDates = [];        // tarikh (ISO) yang ada data, menurun
let ggSel = "";          // tarikh dipilih
let ggParsed = null;     // hasil baca PDF { tarikh, hari, rows, warnings }
let ggBusy = false;

function ggCanManageUser(u) {
  return String(u.role2 || "").trim().toLowerCase() === "pentadbir" || String(u.role3 || "").trim().toLowerCase() === "admin app";
}

/* ---------------- Paparan jadual ---------------- */
function ggRenderDateSelect() {
  const sel = document.getElementById("gg-date-select");
  if (!ggDates.length) { sel.innerHTML = `<option value="">Tiada data</option>`; return; }
  sel.innerHTML = ggDates.map((d) => `<option value="${d}"${d === ggSel ? " selected" : ""}>${ggEsc(ggIsoToLabel(d))}${d === ggTodayIso() ? " · HARI INI" : ""}</option>`).join("");
}
function ggRenderList() {
  const box = document.getElementById("gg-list"), label = document.getElementById("gg-day-label");
  const delWrap = document.getElementById("gg-del-wrap");
  delWrap.classList.toggle("hidden", !(ggCanManage && ggSel));
  if (!ggSel) {
    label.textContent = "";
    box.innerHTML = `<div class="empty-state">Belum ada jadual guru ganti dimuat naik.${ggCanManage ? "<br>Gunakan butang di atas untuk muat naik PDF." : ""}</div>`;
    return;
  }
  const rows = ggAll.filter((r) => r.tarikh === ggSel).sort((a, b) => (ggMinutes(a.mula) || 0) - (ggMinutes(b.mula) || 0) || String(a.guruTidakHadir).localeCompare(String(b.guruTidakHadir), "ms"));
  label.textContent = `${rows.length} slot ganti · ${new Set(rows.map((r) => r.guruTidakHadir)).size} guru tidak hadir`;
  box.innerHTML = rows.map((r) => {
    const mine = ggUser && ggMatchName(ggUser.nama, r.guruGanti);
    return `<div class="gg-card${mine ? " gg-mine" : ""}">
      <div class="gg-time">${ggEsc(ggFmtMasa(r.mula))}<span>${r.tamat ? "– " + ggEsc(ggFmtMasa(r.tamat)) : ""}</span></div>
      <div class="gg-main">
        <div class="gg-kelas"><b>${ggEsc(r.kelas || "-")}</b>${r.subjek ? ` · ${ggEsc(r.subjek)}` : ""}</div>
        <div class="gg-line"><span class="gg-lbl">Tidak hadir</span>${ggEsc(r.guruTidakHadir || "-")}</div>
        <div class="gg-line gg-ganti"><span class="gg-lbl">Guru ganti</span><b>${ggEsc(r.guruGanti)}</b>${mine ? `<span class="gg-me">ANDA</span>` : ""}</div>
      </div>
    </div>`;
  }).join("");
}
function ggSelect(d) { ggSel = d; ggRenderDateSelect(); ggRenderList(); }
function ggOnSelect() { ggSelect(document.getElementById("gg-date-select").value); }
function ggStep(dir) {
  if (!ggDates.length) return;
  const i = ggDates.indexOf(ggSel);
  // ggDates menurun: "seterusnya" (tarikh lebih baru) = indeks lebih kecil
  const ni = Math.min(ggDates.length - 1, Math.max(0, i - dir));
  ggSelect(ggDates[ni]);
}
function ggPickDefault() {
  const today = ggTodayIso();
  if (ggDates.includes(today)) return today;
  const future = ggDates.filter((d) => d > today).sort()[0]; // tarikh akan datang yang terdekat
  return future || ggDates[0] || "";
}
async function ggReload(force) {
  ggAll = await ggFetch(null, force);
  ggDates = [...new Set(ggAll.map((r) => r.tarikh))].sort().reverse();
  if (!ggDates.includes(ggSel)) ggSel = ggPickDefault();
  ggRenderDateSelect(); ggRenderList();
}

/* ---------------- Muat naik PDF ---------------- */
function ggSetStatus(msg, kind) {
  const el = document.getElementById("gg-status");
  el.textContent = msg || "";
  el.className = "gg-status" + (kind ? " gg-status-" + kind : "");
}
async function ggOnFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  ggParsed = null;
  document.getElementById("gg-preview").classList.add("hidden");
  ggSetStatus("Membaca PDF...", "");
  try {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("Sila pilih fail PDF.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Fail terlalu besar (maksimum 8 MB).");
    ggParsed = await ggParsePdfFile(file);
    if (!ggParsed.rows.length) { ggSetStatus((ggParsed.warnings[0] || "Tiada baris dikesan dalam PDF."), "err"); return; }
    ggSetStatus("", "");
    ggRenderPreview();
  } catch (e) {
    ggSetStatus("Gagal membaca PDF: " + e.message, "err");
  }
}
function ggRenderPreview() {
  const box = document.getElementById("gg-preview");
  const P = ggParsed;
  const exists = P.tarikh && ggAll.some((r) => r.tarikh === P.tarikh);
  box.innerHTML = `
    <div class="gg-pv-head">Semak sebelum simpan</div>
    <label class="gg-pv-date">Tarikh jadual
      <input type="date" id="gg-pv-date" value="${ggEsc(P.tarikh)}" onchange="ggPvDate(this.value)">
    </label>
    <div class="gg-pv-hint" id="gg-pv-hint">${exists ? "⚠️ Jadual untuk tarikh ini sudah ada — simpan akan MENGGANTINYA." : ""}</div>
    ${P.warnings.length ? `<div class="gg-pv-warn">${P.warnings.map((w) => "• " + ggEsc(w)).join("<br>")}</div>` : ""}
    <div class="gg-pv-rows">
      ${P.rows.map((r, i) => `
        <div class="gg-pv-row">
          <div class="gg-pv-top"><b>${ggEsc(ggFmtMasa(r.mula))} – ${ggEsc(ggFmtMasa(r.tamat))}</b><button type="button" class="gg-pv-x" onclick="ggPvRemove(${i})" aria-label="Buang baris">✕</button></div>
          <div class="gg-pv-line">${ggEsc(r.kelas)} · ${ggEsc(r.subjek)}</div>
          <div class="gg-pv-line"><span class="gg-lbl">Tidak hadir</span>${ggEsc(r.guruTidakHadir)}</div>
          <div class="gg-pv-line"><span class="gg-lbl">Ganti</span><b>${ggEsc(r.guruGanti)}</b></div>
        </div>`).join("")}
    </div>
    <div class="gg-pv-actions">
      <button type="button" class="gg-btn-primary" id="gg-save-btn" onclick="ggSave()">Sahkan &amp; Simpan</button>
      <button type="button" class="gg-btn-ghost" onclick="ggCancelPreview()">Batal</button>
    </div>`;
  box.classList.remove("hidden");
}
function ggPvDate(v) {
  ggParsed.tarikh = v;
  const exists = v && ggAll.some((r) => r.tarikh === v);
  document.getElementById("gg-pv-hint").textContent = exists ? "⚠️ Jadual untuk tarikh ini sudah ada — simpan akan MENGGANTINYA." : "";
}
function ggPvRemove(i) { ggParsed.rows.splice(i, 1); if (!ggParsed.rows.length) ggCancelPreview(); else ggRenderPreview(); }
function ggCancelPreview() {
  ggParsed = null;
  document.getElementById("gg-preview").classList.add("hidden");
  document.getElementById("gg-file").value = "";
  ggSetStatus("", "");
}
async function ggSave() {
  if (ggBusy || !ggParsed) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ggParsed.tarikh || "")) { ggSetStatus("Sila pilih tarikh jadual.", "err"); return; }
  if (!apiConfigured()) { ggSetStatus("API_URL belum disambung.", "err"); return; }
  ggBusy = true;
  const btn = document.getElementById("gg-save-btn"); btn.disabled = true; btn.textContent = "Menyimpan...";
  try {
    const rows = ggParsed.rows.map((r) => ({ bil: r.bil, guruTidakHadir: r.guruTidakHadir, mula: r.mula, tamat: r.tamat, kelas: r.kelas, subjek: r.subjek, guruGanti: r.guruGanti }));
    const res = await postToAppsScript(API_URL, { action: "simpanGuruGanti", email: ggUser.email, tarikh: ggParsed.tarikh, rows });
    if (res && res.success) {
      const tarikh = ggParsed.tarikh;
      ggCancelPreview();
      ggSetStatus(`✓ Berjaya! ${res.bil} slot disimpan untuk ${ggIsoToLabel(tarikh)}.`, "ok");
      ggSel = tarikh;
      try { Object.keys(sessionStorage).filter((k) => k.indexOf("gg_cache_") === 0).forEach((k) => sessionStorage.removeItem(k)); } catch (e) { /* abaikan */ }
      await ggReload(true);
    } else {
      ggSetStatus((res && res.message) || "Gagal menyimpan jadual.", "err");
      btn.disabled = false; btn.textContent = "Sahkan & Simpan";
    }
  } catch (e) {
    ggSetStatus("Ralat sambungan: " + e.message + ". Semak sama ada data sudah masuk, atau cuba lagi.", "err");
    btn.disabled = false; btn.textContent = "Sahkan & Simpan";
  }
  ggBusy = false;
}
async function ggDeleteDay() {
  if (!ggSel || ggBusy) return;
  if (!confirm(`Padam jadual guru ganti untuk ${ggIsoToLabel(ggSel)}?`)) return;
  ggBusy = true;
  try {
    const res = await postToAppsScript(API_URL, { action: "padamGuruGanti", email: ggUser.email, tarikh: ggSel });
    if (res && res.success) {
      try { Object.keys(sessionStorage).filter((k) => k.indexOf("gg_cache_") === 0).forEach((k) => sessionStorage.removeItem(k)); } catch (e) { /* abaikan */ }
      ggSetStatus("✓ Jadual dipadam.", "ok");
      await ggReload(true);
    } else ggSetStatus((res && res.message) || "Gagal memadam.", "err");
  } catch (e) { ggSetStatus("Ralat sambungan: " + e.message, "err"); }
  ggBusy = false;
}

/* ---------------- Mula ---------------- */
async function ggInit(user) {
  ggUser = user;
  ggCanManage = ggCanManageUser(user);
  document.getElementById("gg-manage").classList.toggle("hidden", !ggCanManage);
  try { await ggReload(false); }
  catch (e) { document.getElementById("gg-list").innerHTML = `<div class="empty-state">Data tidak dapat dimuatkan (${ggEsc(e.message)}).</div>`; }
}

/* ============================================================
   EVENT — kalendar unit sekolah
   ============================================================ */

const EV_UNITS = ["Pengurusan", "Pentadbiran", "Kurikulum", "Pengurusan Ting. 6", "HEM", "Kokurikulum"];
const EV_UNIT_COLOR_VAR = {
  "Pengurusan": "--cyan",
  "Pentadbiran": "--blue",
  "Kurikulum": "--mint",
  "Pengurusan Ting. 6": "--amber",
  "HEM": "--pink",
  "Kokurikulum": "--violet",
};
const EV_BULAN = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];
const EV_BULAN_SHORT = ["Jan","Feb","Mac","Apr","Mei","Jun","Jul","Ogos","Sept","Okt","Nov","Dis"];
const EV_DOW = ["Ahd","Isn","Sel","Rab","Kha","Jum","Sab"];

let evEvents = [];
let evViewYear = new Date().getFullYear();
let evViewMonth = new Date().getMonth(); // 0-indexed
let evCurrentUser = null;
let evEdit = null;   // null = mod TAMBAH; objek = mod EDIT { lama, fromYmd, masaBebas }
let evBusy = false;  // halang hantaran berganda

function evUnitColor(unit) {
  const v = EV_UNIT_COLOR_VAR[unit];
  return v ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : "#888";
}
function evPad2(n) { return String(n).padStart(2, "0"); }
function evYmd(y, m, d) { return `${y}-${evPad2(m + 1)}-${evPad2(d)}`; }
/** Masa -> "HH:MM". Sel berjenis nilai-masa dalam gviz ("Date(1899,11,30,8,30,0)") dan "8:30" / "8:30 PM" dinormalkan;
 * teks bebas ("8:30 pagi") dikekalkan. SAMA dengan evMasaNorm_ di pelayan. */
function evNormMasa(v) {
  const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  let m = s.match(/^Date\(\d+,\d+,\d+,(\d+),(\d+)/);
  if (m) return `${evPad2(+m[1])}:${m[2]}`;
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return s;
  let h = +m[1];
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return `${evPad2(h)}:${m[2]}`;
}
function evEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

async function evLoadEvents() {
  try {
    const { rows } = await gvizFetch(SPREADSHEET_ID, "Event");
    const gvizDateToIso = (v) => {
      if (!v) return "";
      const m = String(v).match(/Date\((\d+),(\d+),(\d+)/);
      if (!m) return String(v).slice(0, 10);
      // Bina string TERUS dari komponen y/m/d — JANGAN guna new Date().toISOString()
      // sebab ia tukar ke UTC dan sebabkan tarikh tersasar 1 hari (GMT+8).
      const y = parseInt(m[1]), mo = parseInt(m[2]) + 1, d = parseInt(m[3]);
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    evEvents = rows.map((r) => {
      const c = r.c || [];
      const get = (i) => (c[i] && c[i].v != null ? c[i].v : "");
      const tarikhDari = gvizDateToIso(get(1));
      if (!tarikhDari || !get(4)) return null; // perlu sekurang-kurangnya tarikh dari + tajuk
      return {
        unit: get(0) || "",
        tarikhDari,
        tarikhHingga: get(2) ? gvizDateToIso(get(2)) : tarikhDari,
        masa: evNormMasa(get(3)),
        tajuk: get(4) || "",
        tempat: get(5) || "",
        dicatatOleh: get(6) || "",
        emel: get(7) || "",               // H: emel pencatat (untuk hak edit)
        dikemaskiniOleh: get(8) || "",    // I
        dikemaskiniPada: get(9) || "",    // J
      };
    }).filter(Boolean);
  } catch (e) {
    evEvents = [];
  }
}

/* ---------------- Ticker 7 hari akan datang (muka depan) ---------------- */
async function evRenderHomeTicker() {
  const wrap = document.getElementById("event-ticker-wrap");
  const content = document.getElementById("event-ticker-content");
  if (!wrap || !content) return;

  if (!evEvents.length) await evLoadEvents();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 6);
  const todayStr = evYmd(today.getFullYear(), today.getMonth(), today.getDate());
  const in7Str = evYmd(in7.getFullYear(), in7.getMonth(), in7.getDate());

  const upcoming = evEvents
    .filter((ev) => ev.tarikhHingga >= todayStr && ev.tarikhDari <= in7Str)
    .sort((a, b) => a.tarikhDari.localeCompare(b.tarikhDari));

  if (!upcoming.length) {
    wrap.classList.add("hidden");
    return;
  }

  content.innerHTML = upcoming
    .map((ev) => {
      const [y, m, d] = ev.tarikhDari.split("-").map(Number);
      const dLabel = `${d} ${EV_BULAN_SHORT[m - 1]}`;
      return `<span><b>${dLabel}</b> — ${evEscape(ev.tajuk)} (${evEscape(ev.unit)})</span>`;
    })
    .join('<span class="sep">•</span>');

  wrap.classList.remove("hidden");
}

/* ---------------- Cuti (daripada hari-cuti.js) ---------------- */
/** Hak edit: pencatat asal event, atau Admin App / Pentadbir. (Kemasan paparan — PELAYAN yang menguatkuasakan.) */
function evCanEdit(ev) {
  const u = evCurrentUser;
  if (!u) return false;
  const low = (x) => String(x == null ? "" : x).trim().toLowerCase();
  if (low(u.role3) === "admin app" || low(u.role2) === "pentadbir") return true;
  const emel = low(ev.emel);
  if (emel) return [u.email, u.emel1, u.emel2].map(low).filter(Boolean).includes(emel);
  return !!low(ev.dicatatOleh) && low(ev.dicatatOleh) === low(u.nama); // rekod lama tanpa emel: padan nama
}

function evHolidaysOn(fromYmd, toYmd) {
  return typeof hcDayMap === "function" ? hcDayMap(fromYmd, toYmd) : new Map();
}
function evIsUmum(h) { return !(h.jenis === "Cuti Sekolah" || h.jenis === "Cuti Perayaan KPM"); }

function evEventsOnDate(ymd) {
  return evEvents.filter((ev) => ymd >= ev.tarikhDari && ymd <= ev.tarikhHingga);
}

function evRenderCalendar() {
  document.getElementById("event-monthbar-label").textContent = `${EV_BULAN[evViewMonth]} ${evViewYear}`;

  const dowRow = document.getElementById("event-dow-row");
  if (!dowRow.dataset.built) {
    dowRow.innerHTML = EV_DOW.map((d) => `<div class="event-dow">${d}</div>`).join("");
    dowRow.dataset.built = "1";
  }

  const firstDay = new Date(evViewYear, evViewMonth, 1);
  const startOffset = firstDay.getDay(); // 0=Ahd
  const daysInMonth = new Date(evViewYear, evViewMonth + 1, 0).getDate();
  const todayStr = evYmd(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const holMap = evHolidaysOn(evYmd(evViewYear, evViewMonth, 1), evYmd(evViewYear, evViewMonth, daysInMonth));
  let cellsHtml = "";
  for (let i = 0; i < startOffset; i++) {
    cellsHtml += `<div class="event-cell other-month"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = evYmd(evViewYear, evViewMonth, d);
    const dayEvents = evEventsOnDate(ymd);
    const units = Array.from(new Set(dayEvents.map((e) => e.unit)));
    const dots = units.map((u) => `<span class="event-dot" style="background:${evUnitColor(u)}"></span>`).join("");
    const isToday = ymd === todayStr ? " today" : "";
    const hol = holMap.get(ymd) || [];
    const umum = hol.some(evIsUmum);
    const holCls = umum ? " is-cuti-umum" : (hol.length ? " is-cuti-sekolah" : "");
    const holTitle = hol.length ? ` title="${evEscape(hol.map((h) => h.nama).join(" • "))}"` : "";
    const holTag = umum ? `<span class="event-cuti-tag">Cuti</span>` : "";
    cellsHtml += `<div class="event-cell${isToday}${holCls}" data-ymd="${ymd}"${holTitle}>
      <span class="event-daynum">${d}</span>${holTag}
      <div class="event-dots">${dots}</div>
    </div>`;
  }
  document.getElementById("event-calendar-grid").innerHTML = cellsHtml;
}

/** Semakan silang Event <-> Cuti untuk BULAN yang sedang dipaparkan. */
function evRenderCutiCheck() {
  const box = document.getElementById("event-cuti-check");
  if (!box) return;
  if (typeof hcCrossCheck !== "function" || typeof hcMeta === "undefined" || !hcMeta.loaded || !hcEntries.length) { box.classList.add("hidden"); return; }
  const first = evYmd(evViewYear, evViewMonth, 1);
  const last = evYmd(evViewYear, evViewMonth, new Date(evViewYear, evViewMonth + 1, 0).getDate());
  const monthEvents = evEvents.filter((ev) => ev.tarikhHingga >= first && ev.tarikhDari <= last);
  const cc = hcCrossCheck(monthEvents);
  const bil = cc.bertindih.length + cc.tiadaPadanan.length;
  const title = `Semakan silang Event ↔ Cuti · ${EV_BULAN[evViewMonth]} ${evViewYear}`;
  if (!bil) {
    box.innerHTML = `<div class="event-cuti-check-title">${title}</div><div class="event-cuti-ok">✓ Tiada event bertindih dengan hari cuti bulan ini.</div>`;
    box.className = "event-cuti-check is-ok";
    return;
  }
  const dr = (ev) => (ev.tarikhHingga && ev.tarikhHingga !== ev.tarikhDari ? `${ev.tarikhDari} – ${ev.tarikhHingga}` : ev.tarikhDari);
  const items = cc.bertindih.map((b) => `
    <div class="event-cuti-item ${b.tahap === "umum" ? "is-umum" : "is-sekolah"}" data-ymd="${b.tarikh[0]}">
      <div class="event-cuti-item-top"><span class="event-cuti-badge">${b.tahap === "umum" ? "Cuti Umum" : "Cuti Sekolah"}</span> <b>${evEscape(b.event.tajuk)}</b> <small>(${evEscape(b.event.unit)})</small></div>
      <div class="event-cuti-item-sub">${evEscape(dr(b.event))} · bertindih: ${b.cuti.map((c) => evEscape(c.nama)).join(", ")}</div>
    </div>`).join("") + cc.tiadaPadanan.map((t) => `
    <div class="event-cuti-item is-semak" data-ymd="${t.event.tarikhDari}">
      <div class="event-cuti-item-top"><span class="event-cuti-badge">Semak</span> <b>${evEscape(t.event.tajuk)}</b> <small>(${evEscape(t.event.unit)})</small></div>
      <div class="event-cuti-item-sub">${evEscape(dr(t.event))} · tajuk menyebut "cuti" tetapi tiada cuti dalam kalendar pada tarikh ini</div>
    </div>`).join("");
  box.innerHTML = `<div class="event-cuti-check-title">${title} <span class="event-cuti-count">${bil}</span></div>${items}`;
  box.className = "event-cuti-check";
}

function evChangeMonth(delta) {
  evViewMonth += delta;
  if (evViewMonth < 0) { evViewMonth = 11; evViewYear--; }
  if (evViewMonth > 11) { evViewMonth = 0; evViewYear++; }
  evRenderCalendar();
  evRenderCutiCheck();
}

function evOpenDayModal(ymd) {
  const dayEvents = evEventsOnDate(ymd);
  const [y, m, d] = ymd.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dateLabel = dateObj.toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const box = document.getElementById("event-modal-content");
  const hol = evHolidaysOn(ymd, ymd).get(ymd) || [];
  const holCards = hol.map((h) => `
      <div class="event-detail-card event-cuti-card ${evIsUmum(h) ? "is-umum" : "is-sekolah"}">
        <div class="event-detail-unit">${evEscape(h.jenis)}</div>
        <div class="event-detail-title">${evEscape(h.nama || "Cuti")}</div>
        <div class="event-detail-row">📅 <span>${evEscape(typeof hcFmtRange === "function" ? hcFmtRange(h) : h.mula)}</span></div>
        ${h.skop ? `<div class="event-detail-row">📍 ${evEscape(h.skop)}</div>` : ""}
        ${h.catatan ? `<div class="event-detail-row">ℹ️ ${evEscape(h.catatan)}</div>` : ""}
      </div>`).join("");
  const holWarn = hol.length ? `<div class="event-detail-row event-cuti-warn">⚠️ Event pada hari cuti: <b>${evEscape(hol.map((h) => h.nama).join(", "))}</b></div>` : "";
  if (!dayEvents.length) {
    box.innerHTML = `
      <div class="modal-title">${dateLabel}</div>${holCards}
      <div class="empty-state" style="padding:20px 8px;">Tiada event untuk tarikh ini.</div>`;
  } else {
    const cards = dayEvents.map((ev) => `
      <div class="event-detail-card" style="border-left-color:${evUnitColor(ev.unit)}">
        <div class="event-detail-unit" style="color:${evUnitColor(ev.unit)}">${evEscape(ev.unit)}</div>
        <div class="event-detail-title">${evEscape(ev.tajuk)}</div>
        <div class="event-detail-row">📅 <span><b>${ev.tarikhDari}</b>${ev.tarikhHingga !== ev.tarikhDari ? ` &ndash; <b>${ev.tarikhHingga}</b>` : ""}</span></div>
        ${ev.masa ? `<div class="event-detail-row">🕐 <b>${evEscape(ev.masa)}</b></div>` : ""}
        ${ev.tempat ? `<div class="event-detail-row">📍 <b>${evEscape(ev.tempat)}</b></div>` : ""}
        <div class="event-detail-row">✍️ ${evEscape(ev.dicatatOleh || "-")}</div>
        ${ev.dikemaskiniOleh ? `<div class="event-detail-row event-detail-edited">✏️ Dikemas kini oleh ${evEscape(ev.dikemaskiniOleh)}${ev.dikemaskiniPada ? ` · ${evEscape(ev.dikemaskiniPada)}` : ""}</div>` : ""}
        ${holWarn}
        ${evCanEdit(ev) ? `<div class="event-card-actions"><button type="button" class="event-edit-btn" data-ev-edit="${evEvents.indexOf(ev)}" data-ymd="${ymd}">✏️ Edit</button></div>` : ""}
      </div>`).join("");
    box.innerHTML = `<div class="modal-title">${dateLabel}</div>${holCards}${cards}`;
  }
  document.getElementById("event-modal-overlay").classList.remove("hidden");
}
function evCloseDayModal() { document.getElementById("event-modal-overlay").classList.add("hidden"); }

/** Tajuk & butang modal mengikut mod (tambah / edit) */
function evSetModalMode() {
  const edit = !!evEdit;
  document.getElementById("event-add-title").textContent = edit ? "EDIT EVENT" : "TAMBAH EVENT";
  document.getElementById("event-submit-btn").textContent = edit ? "Simpan Perubahan" : "Tambah Event";
  const hint = document.getElementById("event-masa-hint");
  if (edit && evEdit.masaBebas) { hint.textContent = `Masa asal: "${evEdit.masaBebas}" (biar kosong untuk mengekalkannya, atau pilih masa baharu)`; hint.classList.remove("hidden"); }
  else { hint.textContent = ""; hint.classList.add("hidden"); }
}
function evOpenAddModal() {
  evEdit = null;
  document.getElementById("event-add-form").reset();
  document.getElementById("event-add-error").classList.add("hidden");
  evSetModalMode();
  document.getElementById("event-add-overlay").classList.remove("hidden");
}
function evCloseAddModal() {
  document.getElementById("event-add-overlay").classList.add("hidden");
  document.getElementById("event-add-form").reset();
  document.getElementById("event-add-error").classList.add("hidden");
  evEdit = null;
  evSetModalMode();
}
/** Buka borang dalam mod EDIT untuk evEvents[idx]. fromYmd = hari yang sedang dilihat (untuk dibuka semula selepas simpan). */
function evOpenEditModal(idx, fromYmd) {
  const ev = evEvents[idx];
  if (!ev) return;
  if (!evCanEdit(ev)) { alert("Anda hanya boleh mengedit event yang anda masukkan sendiri."); return; }
  // Gambar asal event (untuk pelayan mencari baris yang sama & mengesan perubahan oleh orang lain)
  evEdit = {
    lama: { unit: ev.unit, tarikhDari: ev.tarikhDari, tarikhHingga: ev.tarikhHingga, masa: ev.masa, tajuk: ev.tajuk, tempat: ev.tempat, dicatatOleh: ev.dicatatOleh },
    fromYmd: fromYmd || ev.tarikhDari,
    masaBebas: ev.masa && !/^\d{2}:\d{2}$/.test(ev.masa) ? ev.masa : "", // masa bukan HH:MM (ditaip manual) — jangan hilangkan senyap
  };
  const unitSel = document.getElementById("event-unit");
  if (![...unitSel.options].some((o) => o.value === ev.unit)) { // unit lama di luar senarai: kekalkan, jangan tukar senyap
    const opt = document.createElement("option"); opt.value = ev.unit; opt.textContent = ev.unit; unitSel.appendChild(opt);
  }
  unitSel.value = ev.unit;
  document.getElementById("event-tarikh-dari").value = ev.tarikhDari;
  document.getElementById("event-tarikh-hingga").value = ev.tarikhHingga !== ev.tarikhDari ? ev.tarikhHingga : "";
  document.getElementById("event-masa").value = /^\d{2}:\d{2}$/.test(ev.masa) ? ev.masa : "";
  document.getElementById("event-tajuk").value = ev.tajuk;
  document.getElementById("event-tempat").value = ev.tempat;
  document.getElementById("event-add-error").classList.add("hidden");
  evSetModalMode();
  evCloseDayModal();
  document.getElementById("event-add-overlay").classList.remove("hidden");
}

async function evSubmitAdd(e) {
  e.preventDefault();
  if (evBusy) return;
  const unit = document.getElementById("event-unit").value;
  const tarikhDari = document.getElementById("event-tarikh-dari").value;
  const tarikhHingga = document.getElementById("event-tarikh-hingga").value || tarikhDari;
  let masa = document.getElementById("event-masa").value;
  const tajuk = document.getElementById("event-tajuk").value.trim();
  const tempat = document.getElementById("event-tempat").value.trim();
  const errEl = document.getElementById("event-add-error");
  errEl.classList.add("hidden");
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove("hidden"); };

  if (!unit || !tarikhDari || !tajuk) { showErr("Sila lengkapkan unit, tarikh dari, dan tajuk."); return; }
  if (tarikhHingga < tarikhDari) { showErr("Tarikh hingga tidak boleh sebelum tarikh dari."); return; }
  if (evEdit && !masa && evEdit.masaBebas) masa = evEdit.masaBebas; // masa teks bebas yang tak diubah dikekalkan

  const edit = evEdit;
  if (edit) {
    const l = edit.lama;
    if (unit === l.unit && tarikhDari === l.tarikhDari && tarikhHingga === l.tarikhHingga && masa === l.masa && tajuk === l.tajuk && tempat === l.tempat) {
      showErr("Tiada perubahan untuk disimpan."); return;
    }
  }
  // Event pada hari cuti: beri amaran SEBELUM dihantar (pengguna boleh meneruskan — kem/program memang kadang diadakan pada cuti).
  // Semasa edit, hanya bila TARIKH diubah (mengubah tajuk event yang sudah sedia di hari cuti tak perlu diamaran lagi).
  if (!edit || tarikhDari !== edit.lama.tarikhDari || tarikhHingga !== edit.lama.tarikhHingga) {
    const holOnDates = evHolidaysOn(tarikhDari, tarikhHingga);
    if (holOnDates.size) {
      const names = [...new Set([...holOnDates.values()].flat().map((h) => h.nama))].join("\n• ");
      if (!confirm(`Tarikh ini jatuh pada cuti:\n• ${names}\n\n${edit ? "Teruskan simpan perubahan?" : "Teruskan tambah event?"}`)) return;
    }
  }
  const btn = document.getElementById("event-submit-btn");
  evBusy = true;
  btn.disabled = true;
  btn.textContent = edit ? "Menyimpan..." : "Menghantar...";
  let reloadAnyway = false;
  try {
    const payload = edit
      ? { action: "editEvent", email: evCurrentUser.email, lama: edit.lama, unit, tarikhDari, tarikhHingga, masa, tajuk, tempat }
      : { action: "addEvent", email: evCurrentUser.email, unit, tarikhDari, tarikhHingga, masa, tajuk, tempat };
    const data = await postToAppsScript(API_URL, payload);
    evBusy = false; // permintaan selesai — pengawal hanya melindungi permintaan yang sedang berjalan (bukan muat semula data selepas itu)
    if (data && data.success && !data._fallbackParse) {
      evCloseAddModal();
      await evLoadEvents();
      if (edit) {
        // Tunjukkan hasilnya: buka semula hari yang sedang dilihat (kalau masih dalam julat baharu), kalau tidak tarikh mula baharu
        const showYmd = edit.fromYmd >= tarikhDari && edit.fromYmd <= tarikhHingga ? edit.fromYmd : tarikhDari;
        const [sy, sm] = showYmd.split("-").map(Number);
        evViewYear = sy; evViewMonth = sm - 1;
        evRenderCalendar(); evRenderCutiCheck();
        evOpenDayModal(showYmd);
      } else {
        evRenderCalendar(); evRenderCutiCheck();
      }
    } else if (data && data._fallbackParse) {
      showErr("Respons pelayan tidak jelas — status tidak pasti. Semak kalendar sebelum mencuba lagi.");
      reloadAnyway = true;
    } else {
      showErr((data && data.message) || (edit ? "Gagal mengemas kini event." : "Gagal tambah event."));
      if (edit && data && /diubah atau dipadam/.test(data.message || "")) reloadAnyway = true; // paparkan data terkini di belakang
    }
  } catch (err) {
    showErr("Ralat sambungan ke server.");
  }
  if (reloadAnyway) { await evLoadEvents(); evRenderCalendar(); evRenderCutiCheck(); }
  evBusy = false;
  btn.disabled = false;
  btn.textContent = evEdit ? "Simpan Perubahan" : "Tambah Event";
}

function evInit(user) {
  evCurrentUser = user;

  const unitSelect = document.getElementById("event-unit");
  unitSelect.innerHTML = EV_UNITS.map((u) => `<option value="${u}">${u}</option>`).join("");

  const legend = document.getElementById("event-legend");
  legend.innerHTML = EV_UNITS.map((u) => `<span class="event-legend-item"><span class="event-legend-dot" style="background:${evUnitColor(u)}"></span>${u}</span>`).join("") +
    `<span class="event-legend-item"><span class="event-legend-dot is-cuti-umum"></span>Cuti Umum</span>` +
    `<span class="event-legend-item"><span class="event-legend-dot is-cuti-sekolah"></span>Cuti Sekolah</span>`;

  document.getElementById("event-fab").classList.remove("hidden");

  document.getElementById("event-calendar-grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".event-cell");
    if (cell && cell.dataset.ymd) evOpenDayModal(cell.dataset.ymd);
  });

  document.getElementById("event-add-form").addEventListener("submit", evSubmitAdd);

  // Butang "Edit" dalam butiran hari (delegasi — butiran dijana semula setiap kali dibuka)
  document.getElementById("event-modal-content").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ev-edit]");
    if (b) evOpenEditModal(parseInt(b.dataset.evEdit, 10), b.dataset.ymd);
  });

  // Klik perkara dalam panel semakan silang -> buka butiran hari yang berkenaan
  const chk = document.getElementById("event-cuti-check");
  if (chk) chk.addEventListener("click", (e) => {
    const it = e.target.closest(".event-cuti-item");
    if (it && it.dataset.ymd) evOpenDayModal(it.dataset.ymd);
  });

  const afterLoad = () => { evRenderCalendar(); evRenderCutiCheck(); };
  evRenderCalendar(); // paparkan grid serta-merta (tanpa cuti); dikemas kini selepas data dimuat
  const holP = typeof hcLoad === "function" ? hcLoad() : Promise.resolve();
  if (typeof hcRenderBar === "function") hcRenderBar(document.getElementById("event-cuti-bar"), user, async () => afterLoad());
  Promise.all([evLoadEvents(), holP]).then(afterLoad);
}

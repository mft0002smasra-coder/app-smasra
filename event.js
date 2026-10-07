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

function evUnitColor(unit) {
  const v = EV_UNIT_COLOR_VAR[unit];
  return v ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : "#888";
}
function evPad2(n) { return String(n).padStart(2, "0"); }
function evYmd(y, m, d) { return `${y}-${evPad2(m + 1)}-${evPad2(d)}`; }
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
        masa: get(3) || "",
        tajuk: get(4) || "",
        tempat: get(5) || "",
        dicatatOleh: get(6) || "",
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
        ${holWarn}
      </div>`).join("");
    box.innerHTML = `<div class="modal-title">${dateLabel}</div>${holCards}${cards}`;
  }
  document.getElementById("event-modal-overlay").classList.remove("hidden");
}
function evCloseDayModal() { document.getElementById("event-modal-overlay").classList.add("hidden"); }

function evOpenAddModal() {
  document.getElementById("event-add-overlay").classList.remove("hidden");
}
function evCloseAddModal() {
  document.getElementById("event-add-overlay").classList.add("hidden");
  document.getElementById("event-add-form").reset();
  document.getElementById("event-add-error").classList.add("hidden");
}

async function evSubmitAdd(e) {
  e.preventDefault();
  const unit = document.getElementById("event-unit").value;
  const tarikhDari = document.getElementById("event-tarikh-dari").value;
  const tarikhHingga = document.getElementById("event-tarikh-hingga").value || tarikhDari;
  const masa = document.getElementById("event-masa").value;
  const tajuk = document.getElementById("event-tajuk").value.trim();
  const tempat = document.getElementById("event-tempat").value.trim();
  const errEl = document.getElementById("event-add-error");
  errEl.classList.add("hidden");

  if (!unit || !tarikhDari || !tajuk) {
    errEl.textContent = "Sila lengkapkan unit, tarikh dari, dan tajuk.";
    errEl.classList.remove("hidden");
    return;
  }
  // Event pada hari cuti: beri amaran SEBELUM dihantar (pengguna boleh meneruskan — kem/program memang kadang diadakan pada cuti)
  const holOnDates = evHolidaysOn(tarikhDari, tarikhHingga >= tarikhDari ? tarikhHingga : tarikhDari);
  if (holOnDates.size) {
    const names = [...new Set([...holOnDates.values()].flat().map((h) => h.nama))].join("\n• ");
    if (!confirm(`Tarikh ini jatuh pada cuti:\n• ${names}\n\nTeruskan tambah event?`)) return;
  }
  const btn = document.getElementById("event-submit-btn");
  btn.disabled = true;
  btn.textContent = "Menghantar...";
  try {
    const data = await postToAppsScript(API_URL, { action: "addEvent", email: evCurrentUser.email, unit, tarikhDari, tarikhHingga, masa, tajuk, tempat });
    if (data.success) {
      evCloseAddModal();
      await evLoadEvents();
      evRenderCalendar();
      evRenderCutiCheck();
    } else {
      errEl.textContent = data.message || "Gagal tambah event.";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "Ralat sambungan ke server.";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false;
  btn.textContent = "Tambah Event";
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

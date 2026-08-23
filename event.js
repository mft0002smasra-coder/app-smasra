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
  if (!apiConfigured()) return;
  try {
    const res = await fetch(`${API_URL}?action=getEvents`);
    evEvents = await res.json();
  } catch (e) {
    evEvents = [];
  }
}

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
    cellsHtml += `<div class="event-cell${isToday}" data-ymd="${ymd}">
      <span class="event-daynum">${d}</span>
      <div class="event-dots">${dots}</div>
    </div>`;
  }
  document.getElementById("event-calendar-grid").innerHTML = cellsHtml;
}

function evChangeMonth(delta) {
  evViewMonth += delta;
  if (evViewMonth < 0) { evViewMonth = 11; evViewYear--; }
  if (evViewMonth > 11) { evViewMonth = 0; evViewYear++; }
  evRenderCalendar();
}

function evOpenDayModal(ymd) {
  const dayEvents = evEventsOnDate(ymd);
  const [y, m, d] = ymd.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dateLabel = dateObj.toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const box = document.getElementById("event-modal-content");
  if (!dayEvents.length) {
    box.innerHTML = `
      <div class="modal-title">${dateLabel}</div>
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
      </div>`).join("");
    box.innerHTML = `<div class="modal-title">${dateLabel}</div>${cards}`;
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
  const btn = document.getElementById("event-submit-btn");
  btn.disabled = true;
  btn.textContent = "Menghantar...";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "addEvent", email: evCurrentUser.email, unit, tarikhDari, tarikhHingga, masa, tajuk, tempat }),
    });
    const data = await res.json();
    if (data.success) {
      evCloseAddModal();
      await evLoadEvents();
      evRenderCalendar();
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
  legend.innerHTML = EV_UNITS.map((u) => `<span class="event-legend-item"><span class="event-legend-dot" style="background:${evUnitColor(u)}"></span>${u}</span>`).join("");

  if (user.role2 === "Pentadbir") {
    document.getElementById("event-fab").classList.remove("hidden");
  }

  document.getElementById("event-calendar-grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".event-cell");
    if (cell && cell.dataset.ymd) evOpenDayModal(cell.dataset.ymd);
  });

  document.getElementById("event-add-form").addEventListener("submit", evSubmitAdd);

  evLoadEvents().then(evRenderCalendar);
}

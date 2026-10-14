/* ============================================================
   ATURCARA MINGGU — kad Home + tampal teks (WhatsApp) + "Tambah ke Event"
   Tab Sheet: "AturcaraMinggu" (dibaca melalui gviz; ditulis oleh Code.gs simpanAturcaraMinggu)
   Format tarikh paparan: dd/MMM/yyyy (cth 12/Okt/2026) — sama seperti Laporan Guru Bertugas.
   ============================================================ */

const ATM_BULAN = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
const ATM_HARI = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const ATM_HARI_PENDEK = ["Ahd", "Isn", "Sel", "Rab", "Kha", "Jum", "Sab"];
const ATM_MONTH_KEY = { jan: 0, feb: 1, mac: 2, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, ogo: 7, ogs: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dis: 11, dec: 11 };
const ATM_SHEET_NAME = "AturcaraMinggu";

/* ---------------- Tarikh ---------------- */
function atmPad2(n) { return String(n).padStart(2, "0"); }
function atmYmd(y, m0, d) { return `${y}-${atmPad2(m0 + 1)}-${atmPad2(d)}`; }
/** "2026-10-12" -> "12/Okt/2026" */
function atmFmt(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(ymd || "-");
  return `${m[3]}/${ATM_BULAN[parseInt(m[2], 10) - 1] || m[2]}/${m[1]}`;
}
function atmValidYmd(y, m0, d) {
  if (!(y >= 2000 && y <= 2100) || m0 < 0 || m0 > 11 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m0, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m0 && dt.getUTCDate() === d;
}
function atmWeekday(ymd) { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function atmAddDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return atmYmd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}
/** Isnin bagi minggu yang mengandungi tarikh ini */
function atmMondayOf(ymd) { const wd = atmWeekday(ymd); return atmAddDays(ymd, wd === 0 ? -6 : 1 - wd); }
function atmMonthIdx(name) { const k = String(name || "").toLowerCase().slice(0, 3); return /^[a-z]{3,}$/i.test(name || "") && k in ATM_MONTH_KEY ? ATM_MONTH_KEY[k] : -1; }
function atmDayIdx(name) {
  const k = String(name || "").toLowerCase().replace(/\./g, "");
  const map = { ahad: 0, ahd: 0, isnin: 1, isn: 1, selasa: 2, sel: 2, rabu: 3, rab: 3, khamis: 4, kha: 4, jumaat: 5, jum: 5, sabtu: 6, sab: 6 };
  return k in map ? map[k] : -1;
}

/* ---------------- Masa ---------------- */
function atmTo24(h, mer) {
  const m = String(mer || "").toLowerCase().replace(/\s/g, "");
  if (m === "am" || m === "pagi") return h === 12 ? 0 : h;
  if (m === "pm" || m === "petang" || m === "malam") return h === 12 ? 12 : (h < 12 ? h + 12 : h);
  if (m === "tengahhari") return h === 12 ? 12 : (h <= 6 ? h + 12 : h);
  return h;
}
/** Cari masa dalam teks. Diterima HANYA bila ada am/pm/pagi/petang (elak "Bil.20" disangka masa).
 * "3.15 - 4.45 pm" -> mula 15:15 tamat 16:45 | "10.30 am" -> mula 10:30 | "8.00 am – 10.00 am (BM)" -> rest "BM".
 * Pulangkan { mula, tamat, rest } atau null. rest = teks tanpa masa (kurungan kosong/pemisah dibuang). */
function atmParseMasa(text) {
  const T = "(\\d{1,2})[.:](\\d{2})";
  const MER = "(am|pm|pagi|petang|malam|tengah\\s*hari)";
  const re = new RegExp(`${T}\\s*${MER}?(?:\\s*(?:-|–|—|sehingga|hingga|hg|ke)\\s*${T}\\s*${MER}?)?`, "gi");
  const src = String(text || "");
  let m;
  while ((m = re.exec(src))) {
    const h1 = +m[1], mi1 = +m[2], mer1 = m[3] || "", h2 = m[4] != null ? +m[4] : null, mi2 = m[5] != null ? +m[5] : null, mer2 = m[6] || "";
    if (!(mer1 || mer2)) continue;
    if (h1 > 23 || mi1 > 59 || (h2 != null && (h2 > 23 || mi2 > 59))) continue;
    let s24, e24 = null;
    if (h2 == null) { s24 = atmTo24(h1, mer1); }
    else {
      s24 = atmTo24(h1, mer1 || mer2);
      e24 = atmTo24(h2, mer2 || mer1);
      if (!mer1 && s24 * 60 + mi1 > e24 * 60 + mi2) s24 = atmTo24(h1, "am"); // "11.30 – 1.30 pm": mula pagi
      if (!mer2 && e24 * 60 + mi2 < s24 * 60 + mi1) e24 = atmTo24(h2, "pm");
    }
    if (s24 > 23 || (e24 != null && e24 > 23)) continue;
    let rest = (src.slice(0, m.index) + " " + src.slice(m.index + m[0].length)).replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim();
    rest = rest.replace(/^[-–—,:;|\s]+|[-–—,:;|\s]+$/g, "").trim();
    const w = rest.match(/^\(\s*([^()]*?)\s*\)$/); // seluruh baki dalam kurungan -> buka
    if (w) rest = w[1];
    return { mula: `${atmPad2(s24)}:${atmPad2(mi1)}`, tamat: e24 != null ? `${atmPad2(e24)}:${atmPad2(mi2)}` : "", rest };
  }
  return null;
}

/* ---------------- Penghurai teks ---------------- */
function atmClean(line) {
  return String(line == null ? "" : line)
    .replace(/[   ]/g, " ").replace(/[​-‏⁠﻿]/g, "")
    .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    .replace(/\s+/g, " ").trim();
}
function atmTrimDeco(s) { return s.replace(/^[\s•·*▪‣◦●○■□★☆~=_.\-–—|]+|[\s•·*▪‣◦●○■□★☆~=_|]+$/g, "").trim(); }
/** Julat tarikh dalam teks: "12 OKT – 17 OKT 2026" / "13-15 Oktober 2026" / "20 Oktober 2026". null jika tiada. */
function atmFindRange(text, defYear) {
  let m = text.match(/(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(?:(\d{4})\s*)?[-–—]\s*(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})/);
  if (m) {
    const m1 = atmMonthIdx(m[2]), m2 = atmMonthIdx(m[5]), y2 = +m[6];
    if (m1 >= 0 && m2 >= 0) {
      const y1 = m[3] ? +m[3] : (m1 > m2 ? y2 - 1 : y2);
      if (atmValidYmd(y1, m1, +m[1]) && atmValidYmd(y2, m2, +m[4])) return { dari: atmYmd(y1, m1, +m[1]), hingga: atmYmd(y2, m2, +m[4]), index: m.index, len: m[0].length };
    }
  }
  m = text.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})/);
  if (m) {
    const mo = atmMonthIdx(m[3]), y = +m[4];
    if (mo >= 0 && atmValidYmd(y, mo, +m[1]) && atmValidYmd(y, mo, +m[2])) return { dari: atmYmd(y, mo, +m[1]), hingga: atmYmd(y, mo, +m[2]), index: m.index, len: m[0].length };
  }
  m = text.match(/(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})/);
  if (m) {
    const mo = atmMonthIdx(m[2]), y = +m[3];
    if (mo >= 0 && atmValidYmd(y, mo, +m[1])) { const d = atmYmd(y, mo, +m[1]); return { dari: d, hingga: d, index: m.index, len: m[0].length }; }
  }
  return null;
}
/** Tajuk hari: "Isnin 12 Okt 2026" / "Sabtu 17 Okt. 2026" / "Isnin, 12/10/2026". Seluruh baris mesti hanya penanda hari. */
function atmParseDayHeader(line, defYear) {
  const s = line.replace(/[^\p{L}\p{N}\s./,\-]/gu, " ").replace(/\s+/g, " ").trim();
  let m = s.match(/^(isnin|selasa|rabu|khamis|jumaat|sabtu|ahad|isn|sel|rab|kha|jum|sab|ahd)\.?,?\s*(\d{1,2})\s*([A-Za-z]{3,9})\.?,?\s*(\d{4})?$/i);
  if (m) {
    const mo = atmMonthIdx(m[3]), y = m[4] ? +m[4] : defYear;
    if (mo < 0 || !y || !atmValidYmd(y, mo, +m[2])) return { bad: true, name: m[1] };
    return { dayIdx: atmDayIdx(m[1]), tarikh: atmYmd(y, mo, +m[2]) };
  }
  m = s.match(/^(isnin|selasa|rabu|khamis|jumaat|sabtu|ahad|isn|sel|rab|kha|jum|sab|ahd)\.?,?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/i);
  if (m) {
    if (!atmValidYmd(+m[4], +m[3] - 1, +m[2])) return { bad: true, name: m[1] };
    return { dayIdx: atmDayIdx(m[1]), tarikh: atmYmd(+m[4], +m[3] - 1, +m[2]) };
  }
  return null;
}

/** Hurai teks aturcara mingguan. Fungsi tulen (tiada DOM) — { ok, meta, hari, warnings, errors } */
function atmParseTeks(text) {
  const warnings = [], errors = [];
  const meta = { minggu: null, tema: "", dari: "", hingga: "", pentadbir: "", guru: [], program: [], nota: [] };
  const hari = [];
  let curDay = null, curItem = null, section = "head", footer = false, defYear = new Date().getFullYear();
  const lines = String(text || "").split(/\r?\n/);

  const ITEM_RE = /^(?:[ivxlIVXL]{1,5}|\d{1,2}|[a-zA-Z])[.)]\s+(\S.*)$/;
  const SUB_RE = /^[-–—•·*▪‣◦]+\s*(.*)$/;

  const mkNode = (txt) => {
    const t = atmTrimDeco(atmClean(txt));
    const mm = atmParseMasa(t);
    return { t, base: mm ? mm.rest : t, mula: mm ? mm.mula : "", tamat: mm ? mm.tamat : "" };
  };
  const addFooter = (t) => {
    const rg = atmFindRange(t, defYear);
    if (rg) {
      let title = (t.slice(0, rg.index) + " " + t.slice(rg.index + rg.len)).replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim();
      const w = title.match(/^\(\s*([^()]*?)\s*\)$/); if (w) title = w[1];
      title = atmTrimDeco(title) || t;
      meta.program.push({ t: title, dari: rg.dari, hingga: rg.hingga });
    } else meta.nota.push(t);
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const c = atmClean(raw);
    if (!/[\p{L}\p{N}]/u.test(c)) continue; // baris hiasan (••••, emoji)
    const hadEmojiStart = /^[\s ]*[\p{Extended_Pictographic}]/u.test(raw);

    // 1) Tajuk hari
    const dh = atmParseDayHeader(c, defYear);
    if (dh) {
      if (dh.bad) { warnings.push(`Tarikh tidak sah pada baris: "${c}"`); continue; }
      if (dh.dayIdx !== atmWeekday(dh.tarikh)) warnings.push(`"${c}" — ${atmFmt(dh.tarikh)} sebenarnya hari ${ATM_HARI[atmWeekday(dh.tarikh)]}. Semak tarikh/hari.`);
      curDay = hari.find((h) => h.tarikh === dh.tarikh);
      if (curDay) warnings.push(`Hari ${atmFmt(dh.tarikh)} muncul lebih dari sekali — digabungkan.`);
      else { curDay = { tarikh: dh.tarikh, hari: ATM_HARI[atmWeekday(dh.tarikh)], items: [] }; hari.push(curDay); }
      curItem = null; section = "day"; footer = false;
      continue;
    }

    // 2) Sebelum hari pertama: tajuk minggu, julat, pentadbir, guru bertugas
    if (section !== "day" || (!curDay && !hari.length)) {
      let mm;
      if ((mm = c.match(/^minggu\s*(?:ke-?)?\s*(\d{1,2})\b\s*(.*)$/i))) {
        meta.minggu = +mm[1];
        const rest = atmTrimDeco(mm[2]);
        if (rest && !meta.tema) meta.tema = rest;
        section = "head"; continue;
      }
      const rg = atmFindRange(c, defYear);
      if (rg && rg.dari !== rg.hingga && !meta.dari) { meta.dari = rg.dari; meta.hingga = rg.hingga; defYear = +rg.dari.slice(0, 4); section = "head"; continue; }
      if (/pentadbir\s+bertugas/i.test(c)) { section = "pentadbir"; continue; }
      if (/guru\s+bertugas/i.test(c)) { section = "guru"; continue; }
      if (section === "guru") {
        const g = c.match(/^\d{1,2}[.)]\s*(\S.*)$/);
        if (g) { meta.guru.push(atmTrimDeco(g[1])); continue; }
      }
      if (section === "pentadbir") { meta.pentadbir = (meta.pentadbir ? meta.pentadbir + " " : "") + atmTrimDeco(c); continue; }
      if (section === "head" && !meta.tema) { meta.tema = atmTrimDeco(c); continue; }
      warnings.push(`Baris tidak dikenali (sebelum hari pertama): "${c}"`);
      continue;
    }

    // 3) Dalam hari
    if (footer) { addFooter(atmTrimDeco(c)); continue; }
    const im = c.match(ITEM_RE);
    if (im) {
      curItem = Object.assign({ subs: [] }, mkNode(im[1]));
      curDay.items.push(curItem);
      continue;
    }
    const sm = c.match(SUB_RE);
    if (sm && sm[1].trim()) {
      const node = mkNode(sm[1]);
      if (!node.t) continue;
      if (!curItem) { curItem = Object.assign({ subs: [] }, node); curDay.items.push(curItem); }
      else curItem.subs.push(node);
      continue;
    }
    // Baris tanpa penanda: dengan emoji di depan / mengandungi julat tarikh = di LUAR hari (program/nota minggu); selain itu sambungan item
    if (hadEmojiStart || atmFindRange(c, defYear)) { footer = true; addFooter(atmTrimDeco(c)); continue; }
    if (curItem) {
      const node = mkNode(c);
      if (node.t) curItem.subs.push(node);
    } else {
      curItem = Object.assign({ subs: [] }, mkNode(c));
      curDay.items.push(curItem);
    }
  }

  if (!hari.length) errors.push("Tiada hari dikenali. Pastikan teks ada baris seperti \"Isnin 12 Okt 2026\".");
  if (!meta.dari && hari.length) {
    const ds = hari.map((h) => h.tarikh).sort();
    meta.dari = ds[0]; meta.hingga = ds[ds.length - 1];
    warnings.push("Julat tarikh minggu tidak dijumpai dalam teks — diambil dari hari pertama & terakhir.");
  }
  if (meta.dari) {
    const mon = atmMondayOf(meta.dari), sun = atmAddDays(mon, 6);
    hari.forEach((h) => { if (h.tarikh < mon || h.tarikh > sun) warnings.push(`Hari ${atmFmt(h.tarikh)} di luar minggu ${atmFmt(mon)} – ${atmFmt(sun)}.`); });
  }
  if (!meta.guru.length) warnings.push("Senarai Guru Bertugas tidak dijumpai.");
  hari.sort((a, b) => (a.tarikh < b.tarikh ? -1 : a.tarikh > b.tarikh ? 1 : 0));
  return { ok: !errors.length, meta, hari, warnings, errors };
}

/* ---------------- Item -> entri Event ---------------- */
const ATM_PLACE_RE = /\b(bilik|dewan|makmal|surau|masjid|padang|kelas|perpustakaan|auditorium|stadium|aula|blok|bengkel|gerakan|kantin|asrama|pusat sumber)\b/i;
function atmIsPlace(s) { return !!s && ATM_PLACE_RE.test(s); }
function atmGuessUnit(t) {
  const s = String(t || "").toLowerCase();
  if (/kokurikulum/.test(s)) return "Kokurikulum";
  if (/mesyuarat\s+pengurusan|pengurusan/.test(s)) return /ting\.?\s*6|tingkatan\s*6/.test(s) ? "Pengurusan Ting. 6" : "Pengurusan";
  if (/pentadbir/.test(s)) return "Pentadbiran";
  if (/peperiksaan|ujian|permata|kelas|stam|spm|pmr|pt3|akademik/.test(s)) return "Kurikulum";
  if (/nilam|bacaan|surah|penghayatan|madani|disiplin|kaunsel|sivik|asrama|hem\b/.test(s)) return "HEM";
  return "Kurikulum";
}
function atmNorm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase(); }
/** Satu item aturcara -> senarai entri event yang boleh ditambah (≥2 slot masa = satu entri setiap slot). */
function atmEntries(item, tarikh) {
  const subs = item.subs || [];
  const timed = subs.filter((s) => s.mula);
  const untimed = subs.filter((s) => !s.mula).map((s) => s.t);
  const out = [];
  const build = (parts, masa, tamat, tempat) => {
    let tajuk = parts.filter(Boolean).join(" — ");
    if (tamat) tajuk += ` (hingga ${tamat})`;
    if (tajuk.length > 200) tajuk = tajuk.slice(0, 197) + "...";
    out.push({ tajuk, tarikhDari: tarikh, tarikhHingga: tarikh, masa: masa || "", tempat: tempat || "", unit: atmGuessUnit(item.t) });
  };
  const baseT = item.base || item.t;
  if (timed.length >= 2) {
    timed.forEach((s) => {
      const place = atmIsPlace(s.base);
      build([baseT, place ? "" : s.base], s.mula, s.tamat, place ? s.base : "");
    });
  } else if (timed.length === 1) {
    const s = timed[0], place = atmIsPlace(s.base);
    build([baseT, untimed.join(", "), place ? "" : s.base], s.mula, s.tamat, place ? s.base : "");
  } else {
    build([baseT, untimed.join(", ")], item.mula, item.tamat, "");
  }
  return out;
}

/* ---------------- Keadaan & akses ---------------- */
let atmData = null;      // { meta, hari:[{tarikh, hari, items}] } dari Sheet
let atmUser = null;
let atmCardDay = null;   // tarikh yang dipaparkan pada kad Home (hari ini / hari pertama)
let atmInfoOpen = false; // kad Home: tunjuk maklumat minggu (butang Info)
let atmReadDay = null;   // tab hari aktif dalam popup bacaan
let atmParsed = null;    // hasil tampal yang sedang dipratonton
let atmBusy = false;
let atmEvTarget = null;  // entri yang sedang ditambah ke Event

function atmCanManage(u) {
  const low = (x) => String(x == null ? "" : x).trim().toLowerCase();
  return !!u && (low(u.role3) === "admin app" || low(u.role2) === "pentadbir");
}
function atmEsc(s) { return typeof escapeHtml === "function" ? escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ---------------- Baca dari Sheet ---------------- */
async function atmFetch() {
  try {
    const { cols, rows } = await gvizFetch(SPREADSHEET_ID, ATM_SHEET_NAME);
    let meta = null; const hari = [];
    rows.forEach((r) => {
      const jenis = String(gvizCell(r, cols, "JENIS")).trim().toUpperCase();
      const data = gvizCell(r, cols, "DATA");
      if (!data) return;
      let obj; try { obj = JSON.parse(String(data)); } catch (e) { return; }
      if (jenis === "META") meta = obj; else if (jenis === "HARI" && obj && obj.tarikh) hari.push(obj);
    });
    if (!meta || !hari.length) return null;
    hari.sort((a, b) => (a.tarikh < b.tarikh ? -1 : a.tarikh > b.tarikh ? 1 : 0));
    return { meta, hari };
  } catch (e) { return null; }
}
function atmWeekEnd(d) { return atmAddDays(atmMondayOf(d.meta.dari), 6); }

/* ---------------- Kad Home ---------------- */
/** Hari yang dipaparkan: hari ini jika dalam minggu itu; kalau tidak (cth aturcara dimasukkan lebih awal) hari pertama yang ada data */
function atmDefaultDay() {
  const today = todayIso(), mon = atmMondayOf(atmData.meta.dari);
  if (today >= mon && today <= atmAddDays(mon, 6)) return today;
  return atmData.hari[0] ? atmData.hari[0].tarikh : mon;
}
async function atmRenderHomeCard(user) {
  atmUser = user || atmUser;
  const page = document.getElementById("home-atm-page");
  if (!page) return;
  const manage = atmCanManage(atmUser);
  atmData = await atmFetch();
  if (atmData && atmWeekEnd(atmData) < todayIso()) atmData = null; // minggu sudah berlalu — data lama TIDAK dipaparkan
  if (!atmData && !manage) { page.remove(); return; }
  if (typeof evEvents !== "undefined" && !evEvents.length && typeof evLoadEvents === "function") { try { await evLoadEvents(); } catch (e) { /* abaikan */ } }
  atmInfoOpen = false;
  atmCardDay = atmData ? atmDefaultDay() : null;
  atmRenderCard();
}

/** Satu baris item (nombor, tajuk, sub-baris, butang Tambah ke Event untuk pengurus) — dikongsi kad & popup */
function atmItemHtml(it, ii, tarikh, manage) {
  const subs = (it.subs || []).map((s, si) => `<div class="atm-sub atm-sub-${si % 3}">${atmEsc(s.t)}</div>`).join("");
  let btns = "";
  if (manage) {
    const ents = atmEntries(it, tarikh);
    btns = `<div class="atm-side">` + ents.map((en, ei) => {
      const m = ents.length > 1 && en.masa ? `<small>${atmEsc(en.masa)}</small>` : "";
      return atmEventExists(en) ? `<span class="atm-added" title="Sudah dalam Event">✓ Event</span>` : `<button type="button" class="atm-add-btn atm-add-mini" title="Tambah ke Event" data-atm-add="${atmEsc(tarikh)}|${ii}|${ei}">＋ EVENT${m}</button>`;
    }).join("") + `</div>`;
  }
  return `<div class="atm-item${manage ? " atm-item-row" : ""}"><div class="atm-item-main"><div class="atm-item-t"><span class="atm-no">${ii + 1}.</span> ${atmEsc(it.t)}</div>${subs}</div>${btns}</div>`;
}

function atmRenderCard() {
  const titleEl = document.getElementById("atm-title"), rangeEl = document.getElementById("atm-range");
  const infoBtn = document.getElementById("atm-info-btn"), bodyEl = document.getElementById("atm-body");
  if (!bodyEl) return;
  const manage = atmCanManage(atmUser);
  if (!atmData) {
    titleEl.textContent = "ATURCARA MINGGU"; rangeEl.textContent = "";
    infoBtn.classList.add("hidden");
    bodyEl.innerHTML = `<div class="empty-state" style="padding:18px 6px;font-size:12px">Tiada aturcara minggu ini.</div>` +
      (manage ? `<div style="text-align:center"><button type="button" class="atm-add-btn" data-atm-paste="1">📋 Tampal Aturcara</button></div>` : "");
    return;
  }
  const meta = atmData.meta;
  titleEl.textContent = meta.minggu ? `ATURCARA MINGGU ${meta.minggu}` : "ATURCARA MINGGU";
  rangeEl.textContent = `${meta.tema ? meta.tema + " · " : ""}${atmFmt(meta.dari)} – ${atmFmt(meta.hingga)}`;
  infoBtn.classList.remove("hidden");
  infoBtn.classList.toggle("active", atmInfoOpen);
  if (atmInfoOpen) { bodyEl.innerHTML = atmInfoHtml(false); return; }
  const day = atmData.hari.find((h) => h.tarikh === atmCardDay);
  const isToday = atmCardDay === todayIso();
  const heading = `<div class="atm-day-title">${ATM_HARI[atmWeekday(atmCardDay)]} · ${atmFmt(atmCardDay)}${isToday ? " · HARI INI" : ""}</div>`;
  if (!day || !day.items.length) { bodyEl.innerHTML = heading + `<div class="empty-state" style="padding:14px 4px;font-size:12px">Tiada aturcara untuk hari ini.<br>Ketik kad untuk lihat aturcara seminggu.</div>`; return; }
  bodyEl.innerHTML = heading + day.items.map((it, ii) => atmItemHtml(it, ii, day.tarikh, false)).join(""); // butang Tambah ke Event hanya dalam popup
}

function atmEventExists(en) {
  if (typeof evEvents === "undefined") return false;
  return evEvents.some((e) => e.tarikhDari === en.tarikhDari && atmNorm(e.tajuk) === atmNorm(en.tajuk));
}

function atmInfoHtml(manage) {
  const m = atmData.meta;
  let h = `<div class="atm-day-title">Maklumat Minggu</div>`;
  h += `<div class="atm-info-block"><div class="atm-info-h">Pentadbir Bertugas</div><div class="atm-info-t">${atmEsc(m.pentadbir || "-")}</div></div>`;
  h += `<div class="atm-info-block"><div class="atm-info-h">Guru Bertugas</div>` + ((m.guru || []).length ? (m.guru).map((g, i) => `<div class="atm-info-t">${i + 1}. ${atmEsc(g)}</div>`).join("") : `<div class="atm-info-t">-</div>`) + `</div>`;
  if ((m.program || []).length) {
    h += `<div class="atm-info-block"><div class="atm-info-h">Program Minggu Ini</div>` + m.program.map((p, pi) => {
      const en = { tajuk: p.t, tarikhDari: p.dari, tarikhHingga: p.hingga, masa: "", tempat: "", unit: atmGuessUnit(p.t) };
      const rg = p.dari === p.hingga ? atmFmt(p.dari) : `${atmFmt(p.dari)} – ${atmFmt(p.hingga)}`;
      const act = !manage ? "" : (atmEventExists(en) ? `<span class="atm-added">✓ Sudah dalam Event</span>` : `<button type="button" class="atm-add-btn" data-atm-addprog="${pi}">＋ Tambah ke Event</button>`);
      return `<div class="atm-item"><div class="atm-item-t">${atmEsc(p.t)}</div><div class="atm-sub">${rg}</div>${act ? `<div class="atm-actions">${act}</div>` : ""}</div>`;
    }).join("") + `</div>`;
  }
  if ((m.nota || []).length) h += `<div class="atm-info-block"><div class="atm-info-h">Nota</div>${m.nota.map((n) => `<div class="atm-info-t">${atmEsc(n)}</div>`).join("")}</div>`;
  return h;
}

/* ---------------- Tambah ke Event ---------------- */
function atmOpenEvModal(entry) {
  atmEvTarget = entry;
  const sel = document.getElementById("atm-ev-unit");
  const units = typeof EV_UNITS !== "undefined" ? EV_UNITS : ["Pengurusan", "Pentadbiran", "Kurikulum", "Pengurusan Ting. 6", "HEM", "Kokurikulum"];
  sel.innerHTML = units.map((u) => `<option value="${atmEsc(u)}">${atmEsc(u)}</option>`).join("");
  sel.value = units.includes(entry.unit) ? entry.unit : units[0];
  document.getElementById("atm-ev-tarikh").textContent = entry.tarikhDari === entry.tarikhHingga ? atmFmt(entry.tarikhDari) : `${atmFmt(entry.tarikhDari)} – ${atmFmt(entry.tarikhHingga)}`;
  document.getElementById("atm-ev-masa").value = entry.masa || "";
  document.getElementById("atm-ev-tajuk").value = entry.tajuk;
  document.getElementById("atm-ev-tempat").value = entry.tempat || "";
  const err = document.getElementById("atm-ev-error"); err.classList.add("hidden"); err.textContent = "";
  document.getElementById("atm-ev-overlay").classList.remove("hidden");
}
function atmCloseEvModal() { document.getElementById("atm-ev-overlay").classList.add("hidden"); atmEvTarget = null; }
/** "8.30" / "08:30" / "830" -> "08:30"; "" jika kosong; null jika tidak sah */
function atmReadMasa(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2})[:.](\d{2})$/) || s.match(/^(\d{1,2})(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${atmPad2(+m[1])}:${m[2]}`;
}
async function atmSubmitEvent(e) {
  e.preventDefault();
  if (atmBusy || !atmEvTarget || !atmCanManage(atmUser)) return;
  const errEl = document.getElementById("atm-ev-error");
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove("hidden"); };
  errEl.classList.add("hidden");
  const unit = document.getElementById("atm-ev-unit").value;
  const tajuk = document.getElementById("atm-ev-tajuk").value.replace(/\s+/g, " ").trim();
  const tempat = document.getElementById("atm-ev-tempat").value.replace(/\s+/g, " ").trim();
  const masa = atmReadMasa(document.getElementById("atm-ev-masa").value);
  if (masa === null) { showErr("Format masa tidak sah. Guna JJ:MM, contoh 15:15."); return; }
  if (!unit || !tajuk) { showErr("Sila lengkapkan unit dan tajuk."); return; }
  if (tajuk.length > 200 || tempat.length > 200) { showErr("Tajuk/tempat terlalu panjang (maksimum 200 aksara)."); return; }
  const btn = document.getElementById("atm-ev-submit");
  atmBusy = true; btn.disabled = true; btn.textContent = "Menghantar...";
  try {
    const data = await postToAppsScript(API_URL, { action: "addEvent", email: atmUser.email, unit, tarikhDari: atmEvTarget.tarikhDari, tarikhHingga: atmEvTarget.tarikhHingga, masa, tajuk, tempat });
    atmBusy = false;
    if (data && data.success && !data._fallbackParse) {
      atmCloseEvModal();
      if (typeof evLoadEvents === "function") { try { await evLoadEvents(); } catch (x) { /* abaikan */ } }
      if (typeof evRenderHomeTicker === "function") evRenderHomeTicker();
      atmRenderCard();
      if (atmReadIsOpen()) atmRenderRead();
    } else if (data && data._fallbackParse) {
      showErr("Respons pelayan tidak jelas — status tidak pasti. Semak Event sebelum mencuba lagi.");
    } else {
      showErr((data && data.message) || "Gagal tambah event.");
    }
  } catch (err) { showErr("Ralat sambungan ke server."); }
  atmBusy = false; btn.disabled = false; btn.textContent = "Tambah Event";
}

/* ---------------- Tampal & pratonton ---------------- */
function atmOpenPaste() {
  if (!atmCanManage(atmUser)) return;
  atmParsed = null;
  document.getElementById("atm-paste-text").value = "";
  document.getElementById("atm-preview").innerHTML = "";
  document.getElementById("atm-paste-error").classList.add("hidden");
  document.getElementById("atm-save-btn").classList.add("hidden");
  document.getElementById("atm-paste-overlay").classList.remove("hidden");
}
function atmClosePaste() { document.getElementById("atm-paste-overlay").classList.add("hidden"); atmParsed = null; }
function atmCheckPaste() {
  const txt = document.getElementById("atm-paste-text").value;
  const errEl = document.getElementById("atm-paste-error"), prev = document.getElementById("atm-preview"), saveBtn = document.getElementById("atm-save-btn");
  errEl.classList.add("hidden"); saveBtn.classList.add("hidden"); prev.innerHTML = "";
  if (!txt.trim()) { errEl.textContent = "Sila tampal teks aturcara dahulu."; errEl.classList.remove("hidden"); return; }
  const r = atmParseTeks(txt);
  if (!r.ok) { errEl.textContent = r.errors.join(" "); errEl.classList.remove("hidden"); atmParsed = null; return; }
  atmParsed = r;
  const m = r.meta;
  const rows = r.hari.map((h) => `<div class="atm-pv-row"><b>${h.hari} ${atmFmt(h.tarikh)}</b><span>${h.items.length} butiran</span></div>`).join("");
  prev.innerHTML = `
    <div class="atm-pv">
      <div class="atm-pv-h">${m.minggu ? "Minggu " + m.minggu : "Minggu"}${m.tema ? " — " + atmEsc(m.tema) : ""}</div>
      <div class="atm-pv-sub">${atmFmt(m.dari)} – ${atmFmt(m.hingga)} · Guru bertugas: ${m.guru.length}${m.program.length ? " · Program: " + m.program.length : ""}</div>
      ${rows}
      ${r.warnings.length ? `<div class="atm-pv-warn"><b>Semak:</b><ul>${r.warnings.map((w) => `<li>${atmEsc(w)}</li>`).join("")}</ul></div>` : ""}
      <div class="atm-pv-sub" style="margin-top:6px">${atmData ? "Menyimpan akan MENGGANTI aturcara sedia ada." : ""}</div>
    </div>`;
  saveBtn.classList.remove("hidden");
}
async function atmSavePaste() {
  if (atmBusy || !atmParsed || !atmCanManage(atmUser)) return;
  const errEl = document.getElementById("atm-paste-error"), btn = document.getElementById("atm-save-btn");
  errEl.classList.add("hidden");
  if (atmData && !confirm("Aturcara minggu sedia ada akan diganti. Teruskan?")) return;
  atmBusy = true; btn.disabled = true; btn.textContent = "Menyimpan...";
  try {
    const data = await postToAppsScript(API_URL, { action: "simpanAturcaraMinggu", email: atmUser.email, meta: atmParsed.meta, hari: atmParsed.hari });
    if (data && data.success && !data._fallbackParse) { atmBusy = false; atmClosePaste(); await atmRenderHomeCard(atmUser); }
    else if (data && data._fallbackParse) { errEl.textContent = "Respons pelayan tidak jelas — semak kad sebelum mencuba lagi."; errEl.classList.remove("hidden"); }
    else { errEl.textContent = (data && data.message) || "Gagal menyimpan aturcara."; errEl.classList.remove("hidden"); }
  } catch (err) { errEl.textContent = "Ralat sambungan ke server."; errEl.classList.remove("hidden"); }
  atmBusy = false; btn.disabled = false; btn.textContent = "Simpan Aturcara";
}
/** Padam aturcara minggu (butang dalam popup bacaan; Pentadbir/Admin App). */
async function atmDeleteWeek() {
  if (atmBusy || !atmCanManage(atmUser) || !atmData) return;
  const m = atmData.meta;
  if (!confirm(`Padam aturcara ${m.minggu ? "Minggu " + m.minggu + " " : ""}(${atmFmt(m.dari)} – ${atmFmt(m.hingga)}) daripada Home?\n\nTindakan ini tidak boleh dibatalkan.`)) return;
  const errEl = document.getElementById("atm-read-error"), btn = document.getElementById("atm-read-del");
  errEl.classList.add("hidden");
  atmBusy = true; btn.disabled = true;
  try {
    const data = await postToAppsScript(API_URL, { action: "padamAturcaraMinggu", email: atmUser.email });
    if (data && data.success && !data._fallbackParse) { atmBusy = false; atmCloseRead(); await atmRenderHomeCard(atmUser); }
    else { errEl.textContent = data && data._fallbackParse ? "Respons pelayan tidak jelas — semak kad sebelum mencuba lagi." : ((data && data.message) || "Gagal memadam."); errEl.classList.remove("hidden"); }
  } catch (err) { errEl.textContent = "Ralat sambungan ke server."; errEl.classList.remove("hidden"); }
  atmBusy = false; btn.disabled = false;
}

/* ---------------- Popup bacaan (ketik kad) ---------------- */
function atmReadHtml() {
  const manage = atmCanManage(atmUser), today = todayIso(), mon = atmMondayOf(atmData.meta.dari);
  return Array.from({ length: 7 }, (_, i) => atmAddDays(mon, i)).map((d) => {
    const day = atmData.hari.find((h) => h.tarikh === d);
    const items = day && day.items.length ? day.items.map((it, ii) => atmItemHtml(it, ii, d, manage)).join("") : `<div class="atm-sub" style="margin-left:0">Tiada aturcara.</div>`;
    return `<div class="atm-rd-day${d === today ? " is-today" : ""}" id="atm-rd-${d}"><div class="atm-day-title atm-wd-${atmWeekday(d)}">${ATM_HARI[atmWeekday(d)]} · ${atmFmt(d)}${d === today ? " · HARI INI" : ""}</div>${items}</div>`;
  }).join("") + `<div class="atm-rd-day" id="atm-rd-info">${atmInfoHtml(manage)}</div>`;
}
function atmRenderReadTabs() {
  const mon = atmMondayOf(atmData.meta.dari), today = todayIso();
  const has = (d) => atmData.hari.some((h) => h.tarikh === d && h.items.length);
  document.getElementById("atm-read-tabs").innerHTML = Array.from({ length: 7 }, (_, i) => atmAddDays(mon, i)).map((d) =>
    `<button type="button" class="atm-tab${d === atmReadDay ? " active" : ""}${has(d) ? "" : " empty"}${d === today ? " today" : ""}" data-atm-rtab="${d}">${ATM_HARI_PENDEK[atmWeekday(d)]}<span class="atm-tab-d">${+d.slice(8)}</span></button>`
  ).join("");
}
/** Bina semula kandungan popup (kekalkan kedudukan skrol) — dipanggil selepas buka & selepas Tambah ke Event */
function atmRenderRead() {
  const body = document.getElementById("atm-read-body"), keep = body.scrollTop;
  body.innerHTML = atmReadHtml();
  atmRenderReadTabs();
  body.scrollTop = keep;
}
function atmOpenRead() {
  if (!atmData) return;
  const m = atmData.meta, manage = atmCanManage(atmUser);
  document.getElementById("atm-read-title").textContent = m.minggu ? `ATURCARA MINGGU ${m.minggu}` : "ATURCARA MINGGU";
  document.getElementById("atm-read-range").textContent = `${m.tema ? m.tema + " · " : ""}${atmFmt(m.dari)} – ${atmFmt(m.hingga)}`;
  document.getElementById("atm-read-actions").classList.toggle("hidden", !manage);
  document.getElementById("atm-read-error").classList.add("hidden");
  atmReadDay = atmCardDay;
  document.getElementById("atm-read-body").scrollTop = 0;
  atmRenderRead();
  document.getElementById("atm-read-overlay").classList.remove("hidden");
  atmScrollToDay(atmReadDay, false);
}
function atmScrollToDay(ymd, smooth) {
  const body = document.getElementById("atm-read-body"), target = document.getElementById(`atm-rd-${ymd}`);
  if (!target) return;
  const top = Math.max(0, target.offsetTop - 4);
  if (smooth && body.scrollTo) body.scrollTo({ top, behavior: "smooth" }); else body.scrollTop = top;
}
function atmCloseRead() { const ov = document.getElementById("atm-read-overlay"); if (ov) ov.classList.add("hidden"); }
function atmReadIsOpen() { const ov = document.getElementById("atm-read-overlay"); return !!ov && !ov.classList.contains("hidden"); }
/** Butang Kemaskini dalam popup: tutup popup, buka tampal aturcara baharu */
function atmReadUpdate() { atmCloseRead(); atmOpenPaste(); }

/* ---------------- Pendengar acara (delegasi) ---------------- */
if (typeof document !== "undefined") {
document.addEventListener("click", (e) => {
  const t = e.target;
  // Ketik mana-mana bahagian kad Home (selain butang) -> popup bacaan
  if (t.closest("#home-atm-wrap") && !t.closest("button, a")) { atmOpenRead(); return; }
  if (t.closest("[data-atm-info]")) { if (atmData) { atmInfoOpen = !atmInfoOpen; atmRenderCard(); } return; }
  if (t.closest("[data-atm-paste]")) { atmOpenPaste(); return; }
  const rt = t.closest("[data-atm-rtab]");
  if (rt && atmData) { atmReadDay = rt.dataset.atmRtab; atmRenderReadTabs(); atmScrollToDay(atmReadDay, true); return; }
  const add = t.closest("[data-atm-add]");
  if (add && atmData && atmCanManage(atmUser)) {
    const [tarikh, ii, ei] = add.dataset.atmAdd.split("|");
    const day = atmData.hari.find((h) => h.tarikh === tarikh), it = day && day.items[+ii];
    const en = it && atmEntries(it, tarikh)[+ei];
    if (en) atmOpenEvModal(en);
    return;
  }
  const ap = t.closest("[data-atm-addprog]");
  if (ap && atmData && atmCanManage(atmUser)) {
    const p = (atmData.meta.program || [])[+ap.dataset.atmAddprog];
    if (p) atmOpenEvModal({ tajuk: p.t, tarikhDari: p.dari, tarikhHingga: p.hingga, masa: "", tempat: "", unit: atmGuessUnit(p.t) });
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") atmCloseRead(); });
document.addEventListener("DOMContentLoaded", () => {
  const f = document.getElementById("atm-ev-form");
  if (f) f.addEventListener("submit", atmSubmitEvent);
});
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { atmParseTeks, atmParseMasa, atmEntries, atmFmt, atmGuessUnit, atmMondayOf, atmFindRange, atmParseDayHeader };
}

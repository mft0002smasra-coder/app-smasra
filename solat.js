/* ============================================================
   WAKTU SOLAT (Home) — data rasmi JAKIM e-Solat (https://www.e-solat.gov.my)
   - Lalai: Melaka (zon MLK01). Pengguna boleh tukar negeri/zon (disimpan dalam peranti).
   - Data sebulan disimpan dalam peranti -> kebanyakan masa tiada panggilan rangkaian,
     dan kad masih berfungsi tanpa internet untuk baki bulan itu.
   - Panggilan rangkaian: cuba TERUS ke e-Solat dahulu; kalau gagal (cth sekatan CORS),
     guna perantara Apps Script (getWaktuSolat dalam Code.gs).
   - SEMUA pengiraan masa guna zon waktu Malaysia (Asia/Kuala_Lumpur), bukan zon peranti.
   ============================================================ */

const SOLAT_API = "https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat";
const SOLAT_DEFAULT_ZONE = "MLK01"; // Melaka
const SOLAT_TZ = "Asia/Kuala_Lumpur";
const SOLAT_LS_ZONE = "smasra_solat_zone";
const SOLAT_LS_CACHE = "smasra_solat_cache_v1";
const SOLAT_LS_DIRECT_BLOCKED = "smasra_solat_direct_blocked_until";

// Senarai zon rasmi — disalin dari portal e-Solat (Okt 2026). Disusun ikut abjad negeri.
const SOLAT_NEGERI = [
  { nama: "Johor", zon: [
    ["JHR01", "Pulau Aur dan Pulau Pemanggil"], ["JHR02", "Johor Bahru, Kota Tinggi, Mersing, Kulai"],
    ["JHR03", "Kluang, Pontian"], ["JHR04", "Batu Pahat, Muar, Segamat, Gemas Johor, Tangkak"] ] },
  { nama: "Kedah", zon: [
    ["KDH01", "Kota Setar, Kubang Pasu, Pokok Sena (Daerah Kecil)"], ["KDH02", "Kuala Muda, Yan, Pendang"],
    ["KDH03", "Padang Terap, Sik"], ["KDH04", "Baling"], ["KDH05", "Bandar Baharu, Kulim"],
    ["KDH06", "Langkawi"], ["KDH07", "Puncak Gunung Jerai"] ] },
  { nama: "Kelantan", zon: [
    ["KTN01", "Bachok, Kota Bharu, Machang, Pasir Mas, Pasir Puteh, Tanah Merah, Tumpat, Kuala Krai, Mukim Chiku"],
    ["KTN02", "Gua Musang (Daerah Galas Dan Bertam), Jeli, Jajahan Kecil Lojing"] ] },
  { nama: "Melaka", zon: [["MLK01", "Seluruh Negeri Melaka"]] },
  { nama: "Negeri Sembilan", zon: [
    ["NGS01", "Tampin, Jempol"], ["NGS02", "Jelebu, Kuala Pilah, Rembau"], ["NGS03", "Port Dickson, Seremban"] ] },
  { nama: "Pahang", zon: [
    ["PHG01", "Pulau Tioman"], ["PHG02", "Kuantan, Pekan, Muadzam Shah"],
    ["PHG03", "Jerantut, Temerloh, Maran, Bera, Chenor, Jengka"], ["PHG04", "Bentong, Lipis, Raub"],
    ["PHG05", "Genting Sempah, Janda Baik, Bukit Tinggi"], ["PHG06", "Cameron Highlands, Genting Higlands, Bukit Fraser"],
    ["PHG07", "Daerah Rompin (Mukim Rompin, Mukim Endau, Mukim Pontian)"] ] },
  { nama: "Perak", zon: [
    ["PRK01", "Tapah, Slim River, Tanjung Malim"], ["PRK02", "Kuala Kangsar, Sg. Siput, Ipoh, Batu Gajah, Kampar"],
    ["PRK03", "Lenggong, Pengkalan Hulu, Grik"], ["PRK04", "Temengor, Belum"],
    ["PRK05", "Kg Gajah, Teluk Intan, Bagan Datuk, Seri Iskandar, Beruas, Parit, Lumut, Sitiawan, Pulau Pangkor"],
    ["PRK06", "Selama, Taiping, Bagan Serai, Parit Buntar"], ["PRK07", "Bukit Larut"] ] },
  { nama: "Perlis", zon: [["PLS01", "Kangar, Padang Besar, Arau"]] },
  { nama: "Pulau Pinang", zon: [["PNG01", "Seluruh Negeri Pulau Pinang"]] },
  { nama: "Sabah", zon: [
    ["SBH01", "Bahagian Sandakan (Timur), Bukit Garam, Semawang, Temanggong, Tambisan, Bandar Sandakan, Sukau"],
    ["SBH02", "Beluran, Telupid, Pinangah, Terusan, Kuamut, Bahagian Sandakan (Barat)"],
    ["SBH03", "Lahad Datu, Silabukan, Kunak, Sahabat, Semporna, Tungku, Bahagian Tawau (Timur)"],
    ["SBH04", "Bandar Tawau, Balong, Merotai, Kalabakan, Bahagian Tawau (Barat)"],
    ["SBH05", "Kudat, Kota Marudu, Pitas, Pulau Banggi, Bahagian Kudat"], ["SBH06", "Gunung Kinabalu"],
    ["SBH07", "Kota Kinabalu, Ranau, Kota Belud, Tuaran, Penampang, Papar, Putatan, Bahagian Pantai Barat"],
    ["SBH08", "Pensiangan, Keningau, Tambunan, Nabawan, Bahagian Pendalaman (Atas)"],
    ["SBH09", "Beaufort, Kuala Penyu, Sipitang, Tenom, Long Pasia, Membakut, Weston, Bahagian Pendalaman (Bawah)"] ] },
  { nama: "Sarawak", zon: [
    ["SWK01", "Limbang, Lawas, Sundar, Trusan"], ["SWK02", "Miri, Niah, Bekenu, Sibuti, Marudi"],
    ["SWK03", "Pandan, Belaga, Suai, Tatau, Sebauh, Bintulu"],
    ["SWK04", "Sibu, Mukah, Dalat, Song, Igan, Oya, Balingian, Kanowit, Kapit"],
    ["SWK05", "Sarikei, Matu, Julau, Rajang, Daro, Bintangor, Belawai"],
    ["SWK06", "Lubok Antu, Sri Aman, Roban, Debak, Kabong, Lingga, Engkelili, Betong, Spaoh, Pusa, Saratok"],
    ["SWK07", "Serian, Simunjan, Samarahan, Sebuyau, Meludam"], ["SWK08", "Kuching, Bau, Lundu, Sematan"],
    ["SWK09", "Zon Khas (Kampung Patarikan)"] ] },
  { nama: "Selangor", zon: [
    ["SGR01", "Gombak, Petaling, Sepang, Hulu Langat, Hulu Selangor, S.Alam"],
    ["SGR02", "Kuala Selangor, Sabak Bernam"], ["SGR03", "Klang, Kuala Langat"] ] },
  { nama: "Terengganu", zon: [
    ["TRG01", "Kuala Terengganu, Marang, Kuala Nerus"], ["TRG02", "Besut, Setiu"],
    ["TRG03", "Hulu Terengganu"], ["TRG04", "Dungun, Kemaman"] ] },
  { nama: "Wilayah Persekutuan", zon: [["WLY01", "Kuala Lumpur, Putrajaya"], ["WLY02", "Labuan"]] },
];

// Bila pengguna pilih NEGERI, guna zon kawasan bandar utama (bukan zon pertama dalam senarai —
// untuk Johor & Pahang yang pertama ialah pulau). Negeri lain: zon pertama memang kawasan utama.
const SOLAT_NEGERI_UTAMA = { "Johor": "JHR02", "Negeri Sembilan": "NGS03", "Pahang": "PHG02", "Perak": "PRK02", "Sabah": "SBH07", "Sarawak": "SWK08" };

const SOLAT_MONTHS_API = { jan: 1, feb: 2, mac: 3, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, ogo: 8, ogos: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dis: 12, dec: 12 };
const SOLAT_MONTHS_SHORT = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
const SOLAT_DAYS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
const SOLAT_HIJRI = ["Muharram", "Safar", "Rabiulawal", "Rabiulakhir", "Jamadilawal", "Jamadilakhir", "Rejab", "Syaaban", "Ramadan", "Syawal", "Zulkaedah", "Zulhijjah"];
// Enam waktu pada jalur Home (Syuruk ialah penanda tamat Subuh)
const SOLAT_STRIP = [["fajr", "Subuh"], ["syuruk", "Syuruk"], ["dhuhr", "Zohor"], ["asr", "Asar"], ["maghrib", "Maghrib"], ["isha", "Isyak"]];
// Senarai penuh dalam paparan butiran
const SOLAT_FULL = [["imsak", "Imsak"], ["fajr", "Subuh"], ["syuruk", "Syuruk"], ["dhuha", "Dhuha"], ["dhuhr", "Zohor"], ["asr", "Asar"], ["maghrib", "Maghrib"], ["isha", "Isyak"]];

let solatState = { zone: SOLAT_DEFAULT_ZONE, status: "loading", today: null, tomorrow: null, todayKey: "", message: "", fromCacheOnly: false };
let solatTimer = null;
let solatLastNextSig = "";
let solatInflight = {};
let solatTomorrowTried = {};
let solatClock = () => new Date(); // boleh diganti dalam ujian

/* ================= Utiliti masa (zon waktu Malaysia) ================= */
function solatPad(n) { return String(n).padStart(2, "0"); }

function solatNowMYT(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SOLAT_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date || solatClock());
  const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  const y = get("year"), m = get("month"), d = get("day"), h = get("hour"), mi = get("minute"), s = get("second");
  return { y, m, d, h, mi, s, secs: h * 3600 + mi * 60 + s, key: `${y}-${solatPad(m)}-${solatPad(d)}` };
}
/** Tambah/tolak hari pada kunci 'YYYY-MM-DD' (guna UTC supaya tak terjejas zon waktu peranti). */
function solatAddDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${solatPad(dt.getUTCMonth() + 1)}-${solatPad(dt.getUTCDate())}`;
}
/** "05-Okt-2026" (bulan Melayu ATAU Inggeris) -> "2026-10-05". Jangan guna new Date() — bulan Melayu tak difahami. */
function solatParseApiDate(s) {
  const m = String(s || "").trim().match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (!m) return "";
  const mon = SOLAT_MONTHS_API[m[2].toLowerCase()];
  return mon ? `${m[3]}-${solatPad(mon)}-${solatPad(m[1])}` : "";
}
function solatTrimTime(t) { const m = String(t || "").match(/^(\d{1,2}):(\d{2})/); return m ? `${solatPad(m[1])}:${m[2]}` : ""; }
function solatHHMMToSecs(t) { const [h, m] = t.split(":").map(Number); return h * 3600 + m * 60; }
function solatFmt12(hhmm) {
  if (!hhmm) return { t: "--:--", s: "" };
  const [h, m] = hhmm.split(":").map(Number);
  return { t: `${h % 12 === 0 ? 12 : h % 12}:${solatPad(m)}`, s: h < 12 ? "PG" : "PTG" };
}
function solatFmtCountdown(secs) {
  const s = Math.max(0, secs);
  return `${solatPad(Math.floor(s / 3600))}:${solatPad(Math.floor((s % 3600) / 60))}:${solatPad(s % 60)}`;
}
function solatFmtHijri(h) {
  const m = String(h || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const name = m && SOLAT_HIJRI[parseInt(m[2], 10) - 1];
  return name ? `${parseInt(m[3], 10)} ${name} ${m[1]}H` : "";
}
function solatFmtDateLong(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${SOLAT_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${solatPad(d)} ${SOLAT_MONTHS_SHORT[m - 1]} ${y}`;
}
function solatEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/** Waktu seterusnya: yang pertama lebih besar daripada sekarang; kalau semua dah berlalu -> Subuh esok. */
function solatComputeNext(today, tomorrow, nowSecs) {
  for (const [k, label] of SOLAT_STRIP) {
    const t = today && today[k];
    if (!t) continue;
    const s = solatHHMMToSecs(t);
    if (s > nowSecs) return { key: k, label, time: t, inSecs: s - nowSecs, tomorrow: false };
  }
  if (tomorrow && tomorrow.fajr) {
    return { key: "fajr", label: "Subuh", time: tomorrow.fajr, inSecs: 86400 - nowSecs + solatHHMMToSecs(tomorrow.fajr), tomorrow: true };
  }
  return { key: "fajr", label: "Subuh", time: null, inSecs: null, tomorrow: true }; // cth malam akhir bulan, data esok belum ada
}

/* ================= Zon & pilihan pengguna ================= */
function solatZoneInfo(code) {
  for (const n of SOLAT_NEGERI) {
    const z = n.zon.find((x) => x[0] === code);
    if (z) return { negeri: n.nama, code: z[0], desc: z[1], multi: n.zon.length > 1 };
  }
  return null;
}
function solatGetZone() {
  let z = "";
  try { z = localStorage.getItem(SOLAT_LS_ZONE) || ""; } catch (e) {}
  return solatZoneInfo(z) ? z : SOLAT_DEFAULT_ZONE;
}
function solatSaveZone(code) { try { localStorage.setItem(SOLAT_LS_ZONE, code); } catch (e) {} }
function solatZoneLabel(code) {
  const info = solatZoneInfo(code);
  if (!info) return code;
  return info.multi ? `${info.negeri} (${info.code})` : info.negeri;
}

/* ================= Cache dalam peranti ================= */
function solatLoadCache() { try { return JSON.parse(localStorage.getItem(SOLAT_LS_CACHE)) || {}; } catch (e) { return {}; } }
function solatSaveCache(c) { try { localStorage.setItem(SOLAT_LS_CACHE, JSON.stringify(c)); } catch (e) {} }
function solatCacheDay(zone, key) { const c = solatLoadCache(); return (c[zone] && c[zone].days && c[zone].days[key]) || null; }

/** Respons API -> { 'YYYY-MM-DD': {imsak,fajr,syuruk,dhuha,dhuhr,asr,maghrib,isha,hijri} } */
function solatIngest(data) {
  const days = {};
  ((data && data.prayerTime) || []).forEach((r) => {
    const key = solatParseApiDate(r.date);
    if (!key) return;
    days[key] = {
      imsak: solatTrimTime(r.imsak), fajr: solatTrimTime(r.fajr), syuruk: solatTrimTime(r.syuruk), dhuha: solatTrimTime(r.dhuha),
      dhuhr: solatTrimTime(r.dhuhr), asr: solatTrimTime(r.asr), maghrib: solatTrimTime(r.maghrib), isha: solatTrimTime(r.isha),
      hijri: r.hijri || "",
    };
  });
  return days;
}
function solatMergeIntoCache(zone, days) {
  const c = solatLoadCache();
  c[zone] = c[zone] || { days: {} };
  Object.assign(c[zone].days, days);
  c[zone].touched = Date.now();
  // Buang hari lama (> 2 hari lepas) & simpan 3 zon terkini sahaja — elak simpanan membengkak
  const cutoff = solatAddDays(solatNowMYT().key, -2);
  Object.keys(c[zone].days).forEach((k) => { if (k < cutoff) delete c[zone].days[k]; });
  Object.keys(c).sort((a, b) => (c[b].touched || 0) - (c[a].touched || 0)).slice(3).forEach((z) => delete c[z]);
  solatSaveCache(c);
}

/* ================= Rangkaian: terus -> perantara Apps Script ================= */
async function solatFetchTimeout(url, ms) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try { return await fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined }); }
  finally { if (timer) clearTimeout(timer); }
}
async function solatFetchDirect(zone, period) {
  const res = await solatFetchTimeout(`${SOLAT_API}&zone=${encodeURIComponent(zone)}&period=${period}`, 8000);
  const data = JSON.parse(await res.text());
  if (!data || !Array.isArray(data.prayerTime) || !data.prayerTime.length) throw new Error("Data kosong");
  return data;
}
async function solatFetchViaAppsScript(zone, period) {
  if (typeof apiConfigured === "function" && !apiConfigured()) throw new Error("API belum disambungkan");
  const res = await solatFetchTimeout(`${API_URL}?action=getWaktuSolat&zone=${encodeURIComponent(zone)}&period=${period}`, 20000);
  const out = JSON.parse(await res.text());
  if (!out || out.success !== true || !out.data || !Array.isArray(out.data.prayerTime)) throw new Error((out && out.message) || "Respons pelayan tidak sah");
  return out.data;
}
async function solatFetchRemote(zone, period) {
  let blockedUntil = 0;
  try { blockedUntil = parseInt(localStorage.getItem(SOLAT_LS_DIRECT_BLOCKED) || "0", 10); } catch (e) {}
  let directFailed = false;
  if (Date.now() >= blockedUntil) {
    try {
      const direct = await solatFetchDirect(zone, period);
      console.log("[SOLAT] " + zone + " (" + period + ") <- terus dari e-Solat");
      return direct;
    } catch (e) { directFailed = true; console.warn("[SOLAT] akses terus ke e-Solat gagal (" + (e && e.message) + ") — cuba perantara Apps Script"); }
  }
  const data = await solatFetchViaAppsScript(zone, period);
  console.log("[SOLAT] " + zone + " (" + period + ") <- perantara Apps Script");
  // Terus gagal TETAPI perantara berjaya = kita dalam talian & akses terus disekat (cth CORS).
  // Langkau percubaan terus selama 3 hari supaya tak bazir masa. (Kalau luar talian, kedua-duanya gagal
  // dan baris ini tak dicapai, jadi tiada penanda palsu.)
  if (directFailed) { try { localStorage.setItem(SOLAT_LS_DIRECT_BLOCKED, String(Date.now() + 3 * 24 * 3600 * 1000)); } catch (e) {} }
  return data;
}

/** Pastikan rekod untuk satu tarikh ada (cache dahulu; kalau tiada, ambil sebulan). */
async function solatEnsureDay(zone, key) {
  const hit = solatCacheDay(zone, key);
  if (hit) return hit;
  const id = zone + "|" + key;
  if (solatInflight[id]) return solatInflight[id];
  solatInflight[id] = (async () => {
    let lastErr = null;
    try { solatMergeIntoCache(zone, solatIngest(await solatFetchRemote(zone, "month"))); } catch (e) { lastErr = e; }
    let rec = solatCacheDay(zone, key);
    if (!rec && key === solatNowMYT().key) {
      // Sandaran: tempoh "today" (disahkan berfungsi) kalau "month" tak mengandungi hari ini
      try { solatMergeIntoCache(zone, solatIngest(await solatFetchRemote(zone, "today"))); lastErr = null; } catch (e) { lastErr = e; }
      rec = solatCacheDay(zone, key);
    }
    if (!rec && lastErr) throw lastErr;
    return rec;
  })().finally(() => { delete solatInflight[id]; });
  return solatInflight[id];
}

/* ================= Muat & paparan ================= */
async function solatLoadAndRender(forceRefresh) {
  const zone = solatGetZone();
  const now = solatNowMYT();
  const tomorrowKey = solatAddDays(now.key, 1);
  if (forceRefresh) {
    const c = solatLoadCache();
    if (c[zone]) { c[zone].days = {}; solatSaveCache(c); }
    solatTomorrowTried = {};
  }
  solatState = { zone, status: "loading", today: solatCacheDay(zone, now.key), tomorrow: solatCacheDay(zone, tomorrowKey), todayKey: now.key, message: "", fromCacheOnly: false };
  if (solatState.today) solatState.status = "ok";
  solatRender();
  try {
    const today = await solatEnsureDay(zone, now.key);
    if (solatGetZone() !== zone) return; // pengguna tukar zon semasa memuat
    solatState.today = today;
    solatState.status = today ? "ok" : "error";
    if (!today) { solatState.message = "Tiada data waktu solat untuk tarikh ini."; solatLastRetry = solatClock().getTime(); }
  } catch (e) {
    if (!solatState.today) { solatState.status = "error"; solatState.message = "Tak dapat memuatkan waktu solat. Semak sambungan internet."; solatLastRetry = solatClock().getTime(); }
  }
  solatRender();
  // Esok (untuk "Subuh esok" selepas Isyak) — di latar belakang, sekali sahaja setiap sesi/hari
  if (solatState.status === "ok" && !solatState.tomorrow && !solatTomorrowTried[zone + "|" + tomorrowKey]) {
    solatTomorrowTried[zone + "|" + tomorrowKey] = true;
    try {
      const tm = await solatEnsureDay(zone, tomorrowKey);
      if (solatGetZone() === zone) { solatState.tomorrow = tm; solatRender(); }
    } catch (e) { /* abaikan — hanya menjejas "Subuh esok" */ }
  }
}

function solatCurrentNext() {
  const now = solatNowMYT();
  return solatComputeNext(solatState.today, solatState.tomorrow, now.secs);
}

function solatRender() {
  const strip = document.getElementById("solat-strip");
  if (!strip) return;
  const loc = solatEsc(solatZoneLabel(solatState.zone)).toUpperCase();
  if (solatState.status === "loading") {
    strip.innerHTML = `<div class="solat-top"><span class="solat-loc">WAKTU SOLAT · ${loc}</span><span class="solat-change">Tukar ▾</span></div>
      <div class="solat-msg">Memuatkan waktu solat...</div>`;
    solatLastNextSig = "";
    return;
  }
  if (solatState.status === "error") {
    strip.innerHTML = `<div class="solat-top"><span class="solat-loc">WAKTU SOLAT · ${loc}</span><span class="solat-change">Tukar ▾</span></div>
      <div class="solat-msg solat-msg-error">${solatEsc(solatState.message)}<br><span>Ketik untuk cuba lagi / tukar zon</span></div>`;
    solatLastNextSig = "";
    return;
  }
  const now = solatNowMYT();
  const next = solatComputeNext(solatState.today, solatState.tomorrow, now.secs);
  solatLastNextSig = next.key + "|" + next.tomorrow;
  const cells = SOLAT_STRIP.map(([k, label]) => {
    const t = solatState.today[k];
    const f = solatFmt12(t);
    const isNext = !next.tomorrow && next.key === k;
    const isPast = t && solatHHMMToSecs(t) <= now.secs && !isNext;
    return `<div class="solat-cell${isNext ? " is-next" : ""}${isPast ? " is-past" : ""}">
      <div class="solat-cell-name">${label}</div><div class="solat-cell-time">${f.t}</div><span class="solat-cell-suf">${f.s}</span></div>`;
  }).join("");
  const nf = solatFmt12(next.time);
  strip.innerHTML = `<div class="solat-top"><span class="solat-loc">WAKTU SOLAT · ${loc}</span><span class="solat-change">Tukar ▾</span></div>
    <div class="solat-nextline">
      <span class="solat-nextlabel">${next.label}${next.tomorrow ? " <em>esok</em>" : ""} <small>${next.time ? nf.t + " " + nf.s : ""}</small></span>
      <span class="solat-countdown" id="solat-countdown">${next.inSecs == null ? "" : solatFmtCountdown(next.inSecs)}</span>
    </div>
    <div class="solat-times">${cells}</div>`;
}

/** Selepas gagal memuatkan (cth internet putus ketika app dibuka): cuba semula SECARA SENYAP —
 * tiada kelipan "Memuatkan..." — tidak lebih kerap daripada sekali seminit, atau serta-merta bila
 * peranti kembali dalam talian. Kalau berjaya, data masuk cache lalu kad dipaparkan terus. */
let solatLastRetry = 0;
let solatRetrying = false;
async function solatRetryIfError(force) {
  if (solatState.status !== "error" || solatRetrying) return;
  const nowMs = solatClock().getTime();
  if (!force && nowMs - solatLastRetry < 60000) return;
  solatRetrying = true;
  solatLastRetry = nowMs;
  const zone = solatGetZone();
  try {
    const rec = await solatEnsureDay(zone, solatState.todayKey || solatNowMYT().key);
    if (rec && solatGetZone() === zone) solatLoadAndRender();
  } catch (e) { /* senyap — cuba lagi nanti */ }
  finally { solatRetrying = false; }
}

function solatTick() {
  const now = solatNowMYT();
  if (solatState.todayKey && now.key !== solatState.todayKey) { solatLoadAndRender(); return; } // tengah malam
  if (solatState.status === "error") { solatRetryIfError(false); return; }
  if (solatState.status !== "ok") return;
  const next = solatComputeNext(solatState.today, solatState.tomorrow, now.secs);
  const sig = next.key + "|" + next.tomorrow;
  if (sig !== solatLastNextSig) { solatRender(); solatRefreshModalIfOpen(); return; } // waktu bertukar -> render penuh
  const el = document.getElementById("solat-countdown");
  if (el && next.inSecs != null) el.textContent = solatFmtCountdown(next.inSecs);
}

/* ================= Popup butiran + pilih negeri/zon ================= */
function solatModalOpen() { const o = document.getElementById("solat-modal-overlay"); return !!o && !o.classList.contains("hidden"); }
function solatRefreshModalIfOpen() { if (solatModalOpen()) solatRenderModal(); }

function solatRenderModal() {
  const body = document.getElementById("solat-modal-body");
  if (!body) return;
  const zone = solatGetZone();
  const info = solatZoneInfo(zone);
  const negeriOpts = SOLAT_NEGERI.map((n) => `<option value="${solatEsc(n.nama)}"${n.nama === info.negeri ? " selected" : ""}>${solatEsc(n.nama)}</option>`).join("");
  const negeriObj = SOLAT_NEGERI.find((n) => n.nama === info.negeri);
  const zonBlock = negeriObj.zon.length > 1
    ? `<label class="field-label">Zon</label>
       <select class="field-input" id="solat-sel-zon" onchange="solatOnZonChange()">${negeriObj.zon.map((z) => `<option value="${z[0]}"${z[0] === zone ? " selected" : ""}>${z[0]} — ${solatEsc(z[1])}</option>`).join("")}</select>`
    : "";
  let rows = `<div class="solat-modal-msg">${solatState.status === "loading" ? "Memuatkan..." : solatEsc(solatState.message || "Tiada data.")}</div>`;
  let dateLine = "";
  if (solatState.status === "ok" && solatState.today) {
    const now = solatNowMYT();
    const next = solatComputeNext(solatState.today, solatState.tomorrow, now.secs);
    dateLine = `<div class="solat-modal-date">${solatFmtDateLong(solatState.todayKey)}${solatFmtHijri(solatState.today.hijri) ? " · " + solatFmtHijri(solatState.today.hijri) : ""}</div>`;
    rows = SOLAT_FULL.map(([k, label]) => {
      const t = solatState.today[k];
      if (!t) return "";
      const f = solatFmt12(t);
      const isNext = !next.tomorrow && next.key === k;
      return `<div class="solat-row${isNext ? " is-next" : ""}"><span>${label}</span><span class="solat-row-time">${f.t} <small>${f.s}</small></span></div>`;
    }).join("");
  }
  body.innerHTML = `
    <label class="field-label">Negeri</label>
    <select class="field-input" id="solat-sel-negeri" onchange="solatOnNegeriChange()">${negeriOpts}</select>
    ${zonBlock}
    <div class="solat-zone-desc">${solatEsc(info.code)} — ${solatEsc(info.desc)}</div>
    ${dateLine}
    <div class="solat-rows">${rows}</div>
    <div class="solat-modal-foot">
      <span>Sumber: JAKIM e-Solat</span>
      <button type="button" class="solat-refresh" onclick="solatRefreshData()">Muat semula</button>
    </div>`;
}
function solatOpenModal() {
  solatRenderModal();
  document.getElementById("solat-modal-overlay").classList.remove("hidden");
}
function solatCloseModal() { document.getElementById("solat-modal-overlay").classList.add("hidden"); }
function solatSetZone(code) {
  if (!solatZoneInfo(code)) return;
  solatSaveZone(code);
  solatLoadAndRender().then(solatRefreshModalIfOpen);
  solatRenderModal(); // papar serta-merta (status "memuatkan") sementara data dimuat
}
function solatOnNegeriChange() {
  const nama = document.getElementById("solat-sel-negeri").value;
  const n = SOLAT_NEGERI.find((x) => x.nama === nama);
  if (!n) return;
  const utama = SOLAT_NEGERI_UTAMA[n.nama];
  solatSetZone(utama && n.zon.some((z) => z[0] === utama) ? utama : n.zon[0][0]);
}
function solatOnZonChange() { solatSetZone(document.getElementById("solat-sel-zon").value); }
function solatRefreshData() { solatLoadAndRender(true).then(solatRefreshModalIfOpen); solatRenderModal(); }

/* ================= Mula ================= */
function solatInit() {
  if (!document.getElementById("solat-strip")) return;
  solatLoadAndRender();
  if (solatTimer) clearInterval(solatTimer);
  solatTimer = setInterval(solatTick, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) solatTick(); });
  window.addEventListener("online", () => solatRetryIfError(true));
}

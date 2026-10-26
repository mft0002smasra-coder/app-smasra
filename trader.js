/* ============================================================
   HALAMAN TRADER — hanya untuk staf yang Role 4 (lajur J DatabaseSTAFF) = "Trader".
   Data pelan: trader-data.js (dikemas kini secara manual). Bukan nasihat pelaburan.
   ============================================================ */
let trTab = "eur";
let TR_AUTO = {}; // pelan auto 4H daripada tab "PelanTrader" (Code-Trader.gs)
async function trLoadAuto() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("PelanTrader")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" }), text = await res.text();
    const rows = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)).table.rows || [];
    const next = {};
    rows.forEach((r) => { const c = r.c || []; try { const k = c[0] && c[0].v, o = JSON.parse(c[1] && c[1].v); if (k && o && !o.ralat && o.pelan) next[k] = o; } catch (e) { /* baris tidak sah */ } });
    const changed = JSON.stringify(Object.keys(next).map((k) => next[k].kemaskini)) !== JSON.stringify(Object.keys(TR_AUTO).map((k) => TR_AUTO[k].kemaskini));
    TR_AUTO = next; return changed;
  } catch (e) { return false; }
}
function trAge(o) { const t = o && o.kemaskini ? new Date(String(o.kemaskini).replace(" ", "T") + ":00+08:00").getTime() : NaN; return isNaN(t) ? null : (Date.now() - t) / 36e5; }
/** Gabung data statik (fundamental, Elliott) dengan pelan auto bila ada. */
function trPair(k) {
  const base = TR().pasangan[k], a = TR_AUTO[k];
  if (!a) return Object.assign({}, base, { auto: false });
  return Object.assign({}, base, { auto: true, autoInfo: a, rujuk: a.rujuk, bias: a.bias, biasWarna: a.biasWarna, ringkas: a.ringkas + " " + base.ringkas, pelan: a.pelan, sr: a.sr,
    teknikal: a.teknikal.concat(base.teknikal.map((x) => "[manual 26 Okt] " + x)) });
}
const TR = () => window.TRADER_DATA;
const trFmt = (v, dp) => Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const trEsc = (s) => escapeHtml(s == null ? "" : String(s));

async function trInit(user) {
  const role = await fetchRole4(user);
  if (role !== null && role !== undefined) { user.role4 = role; saveUser(user); }
  if (!isTrader(user)) { document.getElementById("tr-denied").classList.remove("hidden"); return; }
  document.getElementById("tr-main").classList.remove("hidden");
  document.getElementById("tr-updated").textContent = "Dikemas kini: " + TR().kemaskini;
  await trLoadAuto(); trRender(); trAlert(); setInterval(trAlert, 30000);
  setInterval(async () => { if (await trLoadAuto()) trRender(); }, 20 * 60 * 1000); // semak data baharu setiap 20 minit
}
function trSwitch(k) { trTab = k; trRender(); }

function planMetrics(p, P) {
  const risk = Math.abs(p.ref - p.sl), rr = p.tp.map((t) => Math.abs(t - p.ref) / risk);
  const unit = (v) => v / P.faktor;
  return { risk, rr, riskTxt: P.unit === "pip" ? Math.round(risk * P.faktor) + " pip" : "USD" + trFmt(risk, 0), tpTxt: p.tp.map((t) => (P.unit === "pip" ? Math.round(Math.abs(t - p.ref) * P.faktor) + " pip" : "USD" + trFmt(Math.abs(t - p.ref), 0))), unit };
}
function planText(p, P) {
  const dp = P.dp, buy = p.arah === "BUY", e = p.entry.slice().sort((x, y) => (buy ? y - x : x - y));
  const trFmt = (v, d) => Number(v).toFixed(d); // tanpa pemisah ribuan, ikut gaya mesej
  const nm = P.nama === "Emas" ? "Gold" : "Euro";
  return `${nm} ${buy ? "buy" : "sell"} @${trFmt(e[0], dp)}-${trFmt(e[1], dp)}\nSL ${trFmt(p.sl, dp)}\n${p.tp.map((t) => "TP " + trFmt(t, dp)).join("\n")}`;
}
function trCopy(i) {
  const P = trPair(trTab), t = planText(P.pelan[i], P);
  const done = () => toastTr("Disalin ke papan klip");
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => trCopyFallback(t, done));
  else trCopyFallback(t, done);
}
function trCopyFallback(t, cb) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); cb(); } catch (e) { /* senyap */ } ta.remove(); }
function toastTr(msg) { const el = document.getElementById("tr-toast"); if (!el) return; el.textContent = msg; el.classList.remove("hidden"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 1800); }
function planHtml(p, P, i) {
  const m = planMetrics(p, P), buy = p.arah === "BUY";
  const maxRr = Math.max(...m.rr), bar = (v, cls) => `<i class="${cls}" style="width:${Math.min(100, (v / maxRr) * 100)}%"></i>`;
  return `<div class="glass tr-plan ${buy ? "buy" : "sell"}">
    <div class="tr-plan-top"><span class="tr-badge ${buy ? "buy" : "sell"}">${buy ? "▲ BELI" : "▼ JUAL"}</span><b class="tr-plan-title">${trEsc(p.tajuk)}</b><span class="tr-chip">⏱ ${trEsc(p.tf)}</span></div>
    <pre class="tr-text">${trEsc(planText(p, P))}</pre>
    <div class="tr-rr"><div class="tr-rr-row"><em>Risiko</em><div class="tr-bar">${bar(1, "risk")}</div><b>${m.riskTxt}</b></div>
      <div class="tr-rr-row"><em>TP1 · RR</em><div class="tr-bar">${bar(m.rr[0], "gain")}</div><b>1:${m.rr[0].toFixed(1)}</b></div>
      <div class="tr-rr-row"><em>TP2 · RR</em><div class="tr-bar">${bar(m.rr[1], "gain")}</div><b>1:${m.rr[1].toFixed(1)}</b></div></div>
    <div class="tr-syarat"><b>Syarat masuk:</b> ${trEsc(p.syarat)}</div>
    <div class="tr-note">${trEsc(p.nota)}</div>
    <div class="tr-right"><button class="tr-copy" onclick="trCopy(${i})" type="button">⧉ Salin teks pelan</button></div></div>`;
}
function ladderHtml(P, key) {
  const dp = P.dp, row = (x, cls) => `<div class="tr-lv ${cls}"><b>${trFmt(x.p, dp)}</b><span>${trEsc(x.n)}</span></div>`;
  return `<div class="glass card-pad tr-sr"><div class="tr-h">Support &amp; Resistant</div>
    <div class="tr-ladder">${P.sr.res.map((x) => row(x, "res")).join("")}
      <div class="tr-now"><span>HARGA SEMASA ${trEsc(P.rujuk)}</span></div>
      ${P.sr.sup.map((x) => row(x, "sup")).join("")}</div>
    <div class="tr-note" style="margin-top:10px">${trEsc(P.sr.catatan)}</div></div>`;
}
function elliottSvg(key) {
  const c = "var(--cyan)", pk = "var(--pink)", mt = "var(--mint)", dim = "var(--text-dim)";
  const lbl = (x, y, t, col) => `<text x="${x}" y="${y}" fill="${col || "var(--text)"}" font-size="5" font-weight="700" text-anchor="middle">${t}</text>`;
  if (key === "gold") {
    return `<svg viewBox="0 0 100 100" class="tr-svg" role="img" aria-label="Kiraan Elliott Wave segi tiga emas">
      <line x1="10" y1="9" x2="96" y2="52" stroke="${pk}" stroke-width=".8" stroke-dasharray="2 1.6"/><line x1="10" y1="85.6" x2="96" y2="62.6" stroke="${mt}" stroke-width=".8" stroke-dasharray="2 1.6"/>
      <polyline points="6,50 16,84 32,20 46,76 60,34 74,62" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>
      <polyline points="74,62 96,14" fill="none" stroke="${mt}" stroke-width="1.6" stroke-dasharray="3 2"/>
      <polyline points="74,62 90,92" fill="none" stroke="${pk}" stroke-width="1.2" stroke-dasharray="2 2" opacity=".8"/>
      ${lbl(16, 92, "A")}${lbl(32, 14, "B")}${lbl(46, 85, "C")}${lbl(60, 28, "D")}${lbl(74, 72, "E")}${lbl(90, 12, "Thrust ↑", mt)}${lbl(90, 99, "Batal ↓", pk)}</svg>`;
  }
  return `<svg viewBox="0 0 100 100" class="tr-svg" role="img" aria-label="Kiraan Elliott Wave EUR/USD">
    <line x1="4" y1="12" x2="96" y2="52" stroke="${pk}" stroke-width=".8" stroke-dasharray="2 1.6"/><line x1="4" y1="44" x2="96" y2="84" stroke="${mt}" stroke-width=".8" stroke-dasharray="2 1.6"/>
    <polyline points="6,16 24,50 40,34" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>
    <polyline points="40,34 70,76 84,90" fill="none" stroke="${pk}" stroke-width="1.6" stroke-dasharray="3 2"/>
    <polyline points="40,34 62,30 86,16" fill="none" stroke="${mt}" stroke-width="1.2" stroke-dasharray="2 2" opacity=".85"/>
    ${lbl(24, 60, "(a)")}${lbl(40, 28, "(b)")}${lbl(70, 85, "(c) utama", pk)}${lbl(88, 11, "Alternatif ↑", mt)}</svg>`;
}
function elliottHtml(P, key) {
  const E = P.elliott;
  return `<div class="glass card-pad tr-ell"><div class="tr-h">Analisis Elliott Wave${P.auto ? " <small>(manual, " + TR().kemaskini.split(",")[0] + ")</small>" : ""}</div>
    <div class="tr-ell-body">${elliottSvg(key)}<div><div class="tr-note" style="margin:0 0 8px">${trEsc(E.ringkas)}</div>
    ${E.senario.map((s) => `<div class="tr-sc"><b>${trEsc(s.t)}:</b> ${trEsc(s.w)}<br><em>${trEsc(s.batal)}</em></div>`).join("")}</div></div>
    <div class="tr-warn">Elliott Wave subjektif; penganalisis berbeza boleh mengira berlainan. Gunakan paras batal (invalidation) sebagai pelan, bukan ramalan.</div></div>`;
}
function bulletsHtml(title, arr) {
  return `<div class="glass card-pad"><div class="tr-h">${title}</div><ul class="tr-ul">${arr.map((x) => `<li>${trEsc(x)}</li>`).join("")}</ul></div>`;
}
function autoBadge(P) {
  if (!P.auto) return `<div class="tr-auto off">Pelan auto 4H belum aktif — memaparkan pelan manual (${trEsc(TR().kemaskini)}). Pasang Code-Trader.gs untuk kemas kini automatik.</div>`;
  const h = trAge(P.autoInfo), old = h !== null && h > 9;
  return `<div class="tr-auto ${old ? "old" : ""}">${old ? "⚠ Data auto sudah lama" : "⟳ Pelan auto setiap 4 jam"} · dikemas kini ${trEsc(P.autoInfo.kemaskini)} (MYT)${h !== null ? " · " + (h < 1 ? Math.round(h * 60) + " minit" : h.toFixed(1) + " jam") + " lalu" : ""}</div>`;
}
let trPanel = null, trHero = false, trSrc = false;
function trToggleSrc() { trSrc = !trSrc; trRender(); }
function trToggleHero() { trHero = !trHero; trRender(); }
function trOpen(k) { trPanel = trPanel === k ? null : k; trRender(); }
function panelHtml(P, key) {
  if (trPanel === "sr") return ladderHtml(P, key) + bulletsHtml("Analisis Teknikal", P.teknikal);
  if (trPanel === "ell") return elliottHtml(P, key);
  if (trPanel === "fun") return bulletsHtml("Analisis Fundamental" + (P.auto ? " <small>(manual " + TR().kemaskini.split(",")[0] + ")</small>" : ""), P.fundamental);
  return "";
}
function trRender() {
  const D = TR(), P = trPair(trTab);
  document.querySelectorAll(".tr-tab").forEach((b) => b.classList.toggle("active", b.dataset.k === trTab));
  const btn = (k, t) => `<button class="tr-abtn ${trPanel === k ? "on" : ""}" onclick="trOpen('${k}')" type="button">${t}</button>`;
  document.getElementById("tr-body").innerHTML = `
    <div class="glass card-pad tr-hero ${trTab}"><div class="tr-hero-top"><div><div class="tr-pair">${P.kod}</div><div class="tr-sub">${P.nama} · harga rujukan ${trEsc(P.rujuk)}</div></div><span class="tr-bias ${P.biasWarna}">${trEsc(P.bias)}</span><button class="tr-arrow ${trHero ? "open" : ""}" onclick="trToggleHero()" type="button" aria-label="${trHero ? "Sembunyi" : "Papar"} butiran" aria-expanded="${trHero}">▾</button></div>${trHero ? `${autoBadge(P)}<p>${trEsc(P.ringkas)}</p>` : ""}</div>
    <div class="tr-h tr-h2">Pelan dagangan <small>(zon masuk M5 – H1)</small></div>
    ${P.pelan.map((p, i) => planHtml(p, P, i)).join("")}
    <div class="tr-abtns">${btn("sr", "Support &amp; Resistant")}${btn("ell", "Analisis Elliott Wave")}${btn("fun", "Analisis Fundamental")}</div>
    ${panelHtml(P, trTab)}
    <div class="glass card-pad"><div class="tr-srchead" onclick="trToggleSrc()"><div class="tr-h" style="margin:0">Sumber rujukan</div><button class="tr-arrow ${trSrc ? "open" : ""}" type="button" aria-label="${trSrc ? "Sembunyi" : "Papar"} sumber" aria-expanded="${trSrc}">▾</button></div>${trSrc ? `<ul class="tr-ul" style="margin-top:10px">${D.sumber.map((s) => `<li><a href="${trEsc(s[1])}" target="_blank" rel="noopener">${trEsc(s[0])}</a></li>`).join("")}</ul>` : ""}</div>
    <div class="tr-warn big">Maklumat ini untuk tujuan pendidikan dan bukan nasihat pelaburan. Dagangan forex dan emas berleveraj berisiko tinggi dan boleh menyebabkan kerugian melebihi modal. Pelan ialah senario bersyarat, bukan jaminan; harga berubah pantas dan data di sini bukan masa nyata. Sentiasa guna stop-loss dan hanya risikokan wang yang anda sanggup rugi.</div>`;
}

/* ---- Amaran acara: papar hanya 1 jam sebelum acara (sehingga 15 minit selepas) ---- */
function trAlert() {
  const el = document.getElementById("tr-alert"); if (!el) return;
  const now = Date.now(), hit = (TR().acara || []).map((a) => ({ a, ms: new Date(a.t).getTime() - now })).filter((x) => x.ms <= 3600e3 && x.ms >= -900e3).sort((x, y) => x.ms - y.ms);
  if (!hit.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  el.innerHTML = hit.map(({ a, ms }) => {
    const mnt = Math.round(ms / 60000), when = mnt > 0 ? `dalam ${mnt} minit` : mnt >= -1 ? "sedang berlangsung" : `${-mnt} minit lalu`;
    const jam = new Date(a.t).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false });
    return `<div class="tr-alert-row"><b>⏰ ${trEsc(a.n)}</b><span>${when} · ${jam} MYT${a.anggaran ? " (masa anggaran)" : ""} · ${trEsc(a.kesan || "")}</span></div>`;
  }).join("");
}

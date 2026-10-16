/* ============================================================
   NOTIFIKASI — loceng di header (semua halaman), badge, panel, pop-up urgent,
   halaman Notifikasi (sidebar sahaja) dan borang Hantar Mesej (Pentadbir / Admin App).
   Dimuat oleh app.js selepas log masuk (ntBoot). Data: Apps Script
   getNotifikasi / tandaBacaNotifikasi / hantarNotifikasi / getSenaraiPenerima.
   ============================================================ */

const NT_POLL_MS = 60000;
const NT_LINK_RE = /^[a-z0-9\-]+\.html(\?[\w=&\-]*)?$/i;
const NT_MONTHS = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];

let ntUser = null;
let ntItems = [];
let ntInitP = null;
let ntLoadedOnce = false;
let ntFetching = false;
let ntFilter = "semua";          // halaman: semua | belum | guruganti | mesej
let ntPanelTab = "semua";        // panel: semua | belum
const ntPopupSeen = {};          // id yang sudah dipaparkan sebagai pop-up (sesi halaman ini)
let ntPopupQueue = [];
let ntModalOpen = false;
let ntStaff = null;              // senarai penerima (Pentadbir sahaja)

/* ---------------- Utiliti ---------------- */
function ntEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function ntPad(n) { return String(n).padStart(2, "0"); }
function ntIso(d) { return `${d.getFullYear()}-${ntPad(d.getMonth() + 1)}-${ntPad(d.getDate())}`; }
function ntTodayIso() { return ntIso(new Date()); }
function ntYesterdayIso() { const d = new Date(); d.setDate(d.getDate() - 1); return ntIso(d); }
function ntDayLabel(ymd) { const p = String(ymd).split("-"); return `${Number(p[2])} ${NT_MONTHS[Number(p[1]) - 1] || ""} ${p[0]}`; }
function ntWhen(dibuat) {
  const [d, t] = String(dibuat || "").split(" ");
  if (d === ntTodayIso()) return t || "";
  if (d === ntYesterdayIso()) return "Semalam";
  const p = (d || "").split("-");
  return p.length === 3 ? `${Number(p[2])} ${NT_MONTHS[Number(p[1]) - 1] || ""}` : "";
}
function ntGroupLabel(dibuat) {
  const d = String(dibuat || "").split(" ")[0];
  if (d === ntTodayIso()) return "HARI INI";
  if (d === ntYesterdayIso()) return "SEMALAM";
  return d ? ntDayLabel(d).toUpperCase() : "";
}
function ntSafeLink(l) { return NT_LINK_RE.test(String(l || "")) ? l : ""; }
function ntBellSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
}
const NT_REPLY_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:8px"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/></svg>`;
const NT_PERSON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>`;
function ntAvatar(it, cls) {
  const img = it.dariGambar ? `<img src="${ntEsc(it.dariGambar)}" alt="" onerror="this.remove()">` : "";
  return `<span class="nt-avatar ${cls || ""}">${NT_PERSON_SVG}${img}</span>`;
}
function ntIsActive(it) { return !it.tamatLepas; }
function ntUnread() { return ntItems.filter((i) => !i.dibaca && ntIsActive(i)); }
function ntKind(it) {
  if (it.jenis === "URGENT") return "urgent";
  if (it.kategori === "GURU_GANTI") return "ganti";
  return "info";
}
function ntLabel(it) {
  if (it.kategori === "GURU_GANTI") return it.jenis === "URGENT" ? "URGENT · GURU GANTI · UNTUK ANDA" : "GURU GANTI · UNTUK ANDA";
  const dari = String(it.dariNama || "PENTADBIR").toUpperCase();
  if (it.kategori === "BALASAN") return `BALASAN · ${dari}`;
  const sasaran = it.semua ? "SEMUA" : "UNTUK ANDA";
  return `${it.jenis === "URGENT" ? "URGENT · " : ""}${dari} · ${sasaran}`;
}
function ntFind(id) { return ntItems.find((i) => i.id === id); }
function ntMyKeys() { return [ntUser && ntUser.emel1, ntUser && ntUser.emel2, ntUser && ntUser.email].map((x) => String(x || "").trim().toLowerCase()).filter(Boolean); }
/** Boleh dibalas: mesej Pentadbir / balasan yang dihantar oleh orang lain (bukan mesej automatik Guru Ganti, bukan mesej sendiri). */
function ntCanReply(it) {
  if (!it || (it.kategori !== "MESEJ" && it.kategori !== "BALASAN")) return false;
  const from = String(it.dariEmel || "").toLowerCase();
  return !!from && ntMyKeys().indexOf(from) === -1;
}

/* ---------------- Rangkaian ---------------- */
async function ntFetch() {
  if (!ntUser || ntFetching || typeof apiConfigured !== "function" || !apiConfigured()) return false;
  ntFetching = true;
  try {
    const res = await fetch(`${API_URL}?action=getNotifikasi&email=${encodeURIComponent(ntUser.email)}`, { cache: "no-store" });
    const json = await res.json();
    if (json && json.success && Array.isArray(json.items)) { ntItems = json.items; ntLoadedOnce = true; return true; }
  } catch (e) { /* senyap — cuba lagi pada kitaran seterusnya */ }
  finally { ntFetching = false; }
  return false;
}
function ntMarkRead(ids) {
  const list = (ids || []).filter((id) => { const it = ntFind(id); return it && !it.dibaca; });
  if (!list.length) return;
  list.forEach((id) => { ntFind(id).dibaca = true; });
  ntRenderAll();
  try {
    postToAppsScript(API_URL, { action: "tandaBacaNotifikasi", email: ntUser.email, ids: list }).catch(() => {});
  } catch (e) { /* senyap */ }
}
function ntMarkAllRead() {
  const ids = ntUnread().map((i) => i.id);
  if (!ids.length) return;
  ntItems.forEach((i) => { if (ntIsActive(i)) i.dibaca = true; });
  ntRenderAll();
  try { postToAppsScript(API_URL, { action: "tandaBacaNotifikasi", email: ntUser.email, all: true }).catch(() => {}); } catch (e) { /* senyap */ }
}

/* ---------------- Loceng + badge ---------------- */
function ntInstallBell() {
  const row = document.querySelector(".site-header-row2");
  if (!row || row.querySelector(".nt-bell")) return;
  const wrap = document.querySelector(".site-header-wrap");
  const content = document.getElementById("app-content");
  const h0 = wrap ? wrap.offsetHeight : 0;
  const greet = row.querySelector(".header-greet");
  const status = row.querySelector(".header-status");
  const left = document.createElement("div");
  left.className = "nt-hdr-left";
  if (greet) left.appendChild(greet);
  if (status) left.appendChild(status);
  row.appendChild(left);
  row.classList.add("nt-row2");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nt-bell";
  btn.setAttribute("aria-label", "Notifikasi");
  btn.innerHTML = `${ntBellSvg(26)}<span class="nt-badge hidden" id="nt-badge"></span>`;
  btn.addEventListener("click", ntOpenPanel);
  row.appendChild(btn);
  // Header jadi lebih tinggi (nama & status disusun menegak) — tambah ruang atas kandungan sebanyak beza itu supaya tidak tertindih
  if (wrap && content) {
    const delta = wrap.offsetHeight - h0;
    if (delta > 0) content.style.paddingTop = (parseFloat(getComputedStyle(content).paddingTop) || 0) + delta + "px";
  }
  // Header berubah tinggi sedikit — minta Home kira semula saiz kad supaya kekal fixed (tanpa skrol)
  requestAnimationFrame(() => {
    if (typeof dbSizeHomeAnalysisCard === "function") { try { dbSizeHomeAnalysisCard(); } catch (e) { /* abaikan */ } }
    window.dispatchEvent(new Event("resize"));
  });
}
function ntRenderBadge() {
  const n = ntUnread().length;
  const txt = n > 9 ? "9+" : String(n);
  [document.getElementById("nt-badge"), document.getElementById("nt-drawer-badge")].forEach((el) => {
    if (!el) return;
    el.textContent = txt;
    el.classList.toggle("hidden", n === 0);
  });
  const bell = document.querySelector(".nt-bell");
  if (bell) bell.setAttribute("aria-label", n ? `Notifikasi, ${n} belum dibaca` : "Notifikasi");
}

/* ---------------- Item senarai (kongsi panel & halaman) ---------------- */
function ntItemHtml(it) {
  const k = ntKind(it);
  const msg = String(it.mesej || "").split("\n")[0];
  return `<button type="button" class="nt-item nt-${k}${it.dibaca ? " nt-read" : ""}" data-id="${ntEsc(it.id)}" onclick="ntOpenItem(this.getAttribute('data-id'))">
    <span class="nt-dot"></span>
    <span class="nt-item-body">
      <span class="nt-item-top"><span class="nt-item-label">${ntEsc(ntLabel(it))}</span><span class="nt-item-when">${ntEsc(ntWhen(it.dibuat))}</span></span>
      <span class="nt-item-title">${ntEsc(it.tajuk)}</span>
      <span class="nt-item-msg">${ntEsc(msg)}</span>
    </span>
  </button>`;
}

/* ---------------- Panel loceng (bottom sheet) ---------------- */
function ntEnsureLayer(id, cls) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("div"); el.id = id; el.className = cls; document.body.appendChild(el); }
  return el;
}
function ntOpenPanel() {
  const layer = ntEnsureLayer("nt-panel", "nt-layer");
  layer.classList.add("open");
  ntRenderPanel();
  document.body.classList.add("nt-lock");
}
function ntClosePanel() {
  const layer = document.getElementById("nt-panel");
  if (layer) layer.classList.remove("open");
  if (!ntModalOpen) document.body.classList.remove("nt-lock");
}
function ntSetPanelTab(t) { ntPanelTab = t; ntRenderPanel(); }
function ntRenderPanel() {
  const layer = document.getElementById("nt-panel");
  if (!layer || !layer.classList.contains("open")) return;
  const active = ntItems.filter(ntIsActive);
  const unread = active.filter((i) => !i.dibaca);
  const list = (ntPanelTab === "belum" ? unread : active).slice(0, 30);
  layer.innerHTML = `<div class="nt-backdrop" onclick="ntClosePanel()"></div>
    <div class="nt-sheet" role="dialog" aria-label="Notifikasi">
      <div class="nt-grab"></div>
      <div class="nt-sheet-head">
        <span class="nt-sheet-title">NOTIFIKASI</span>
        <button type="button" class="nt-link-btn" onclick="ntMarkAllRead()"${unread.length ? "" : " disabled"}>Tandakan semua dibaca</button>
      </div>
      <div class="nt-chips">
        <button type="button" class="nt-chip${ntPanelTab === "semua" ? " on" : ""}" onclick="ntSetPanelTab('semua')">Semua</button>
        <button type="button" class="nt-chip${ntPanelTab === "belum" ? " on" : ""}" onclick="ntSetPanelTab('belum')">Belum dibaca${unread.length ? " · " + unread.length : ""}</button>
      </div>
      <div class="nt-list">${list.length ? list.map(ntItemHtml).join("") : `<div class="nt-empty">${ntLoadedOnce ? (ntPanelTab === "belum" ? "Tiada notifikasi belum dibaca." : "Tiada notifikasi.") : "Memuatkan..."}</div>`}</div>
      <a class="nt-more" href="notifikasi.html">Lihat semua notifikasi →</a>
    </div>`;
}

/* ---------------- Kad butiran / pop-up urgent ---------------- */
function ntShowModal(it, opt) {
  opt = opt || {};
  const k = ntKind(it);
  const link = ntSafeLink(it.pautan);
  const layer = ntEnsureLayer("nt-modal", "nt-layer nt-layer-modal");
  const urgent = !!opt.urgent;
  const head = urgent
    ? `<div class="nt-modal-head nt-head-urgent"><span class="nt-head-title"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18v.01"/></svg>URGENT</span>${opt.total > 1 ? `<span class="nt-head-count">${opt.idx} / ${opt.total}</span>` : ""}</div>`
    : `<div class="nt-modal-head nt-head-${k}"><span class="nt-head-title">${ntEsc(it.kategori === "GURU_GANTI" ? "GURU GANTI" : "MESEJ")}</span><button type="button" class="nt-x" onclick="ntCloseModal()" aria-label="Tutup">✕</button></div>`;
  const dari = it.kategori === "GURU_GANTI" ? "Sistem · Jadual Guru Ganti" : ntEsc(String(it.dariNama || "Pentadbir").toUpperCase());
  const sasaran = it.kategori === "GURU_GANTI" ? "Untuk anda" : (it.semua ? "Untuk semua guru" : "Untuk anda");
  layer.innerHTML = `<div class="nt-backdrop nt-backdrop-dark"${urgent ? "" : ' onclick="ntCloseModal()"'}></div>
    <div class="nt-modal nt-modal-${urgent ? "urgent" : k}" role="dialog" aria-modal="true" aria-label="${ntEsc(it.tajuk)}">
      ${head}
      <div class="nt-modal-body">
        <div class="nt-from">${ntAvatar(it, "nt-avatar-lg")}<span class="nt-from-txt"><b>${dari}</b><span>${ntEsc(ntWhen(it.dibuat))} · ${sasaran}</span></span></div>
        <div class="nt-modal-title">${ntEsc(it.tajuk)}</div>
        <div class="nt-modal-msg">${ntEsc(it.mesej)}</div>
      </div>
      <div class="nt-modal-actions">
        <button type="button" class="nt-btn-main" onclick="ntCloseModal()">${urgent ? "Faham" : "Tutup"}</button>
        ${ntCanReply(it) ? `<button type="button" class="nt-btn-alt" data-id="${ntEsc(it.id)}" onclick="ntReplyFrom(this.getAttribute('data-id'))">${NT_REPLY_SVG}Balas</button>` : ""}
        ${link ? `<a class="nt-btn-alt" href="${ntEsc(link)}" onclick="ntMarkRead(['${ntEsc(it.id)}'])">Buka halaman berkaitan</a>` : ""}
      </div>
    </div>`;
  layer.classList.add("open");
  ntModalOpen = true;
  document.body.classList.add("nt-lock");
  ntMarkReadOnClose = it.id;
  ntModalUrgent = urgent;
}
let ntMarkReadOnClose = null, ntModalUrgent = false;
function ntCloseModal() {
  const layer = document.getElementById("nt-modal");
  if (layer) { layer.classList.remove("open"); layer.innerHTML = ""; }
  ntModalOpen = false;
  const panel = document.getElementById("nt-panel");
  if (!panel || !panel.classList.contains("open")) document.body.classList.remove("nt-lock");
  if (ntMarkReadOnClose) { ntMarkRead([ntMarkReadOnClose]); ntMarkReadOnClose = null; }
  if (ntModalUrgent) { ntModalUrgent = false; setTimeout(ntNextPopup, 250); }
}
function ntOpenDetail(id) {
  const it = ntFind(id);
  if (!it) return;
  ntClosePanel();
  ntShowModal(it, { urgent: false });
  ntMarkRead([id]);
}

function ntOpenItem(id) {
  const it = ntFind(id);
  if (!it) return;
  if (ntCanReply(it)) { ntClosePanel(); ntOpenChat(it.threadId, it.dariEmel); return; }
  ntOpenDetail(id);
}
function ntReplyFrom(id) {
  const it = ntFind(id);
  if (!it) return;
  ntCloseModal();
  ntClosePanel();
  ntOpenChat(it.threadId, it.dariEmel);
}

/* ---------------- Perbualan (balas mesej) ---------------- */
const ntChat = { threadId: "", peer: "", info: null, msgs: [], timer: null, busy: false };
async function ntOpenChat(threadId, peer) {
  ntChat.threadId = threadId; ntChat.peer = peer; ntChat.info = null; ntChat.msgs = []; ntChat.busy = false;
  const layer = ntEnsureLayer("nt-chat", "nt-layer nt-layer-chat");
  layer.classList.add("open");
  document.body.classList.add("nt-lock");
  layer.innerHTML = `<div class="nt-chat-wrap"><div class="nt-chat-head"><button type="button" class="nt-x nt-back" onclick="ntCloseChat()" aria-label="Kembali">←</button><span class="nt-chat-name">Memuatkan...</span></div></div>`;
  await ntChatLoad(true);
  clearInterval(ntChat.timer);
  ntChat.timer = setInterval(() => { if (!document.hidden) ntChatLoad(false); }, 15000);
}
function ntCloseChat() {
  clearInterval(ntChat.timer); ntChat.timer = null;
  const layer = document.getElementById("nt-chat");
  if (layer) { layer.classList.remove("open"); layer.innerHTML = ""; }
  const panel = document.getElementById("nt-panel");
  if (!ntModalOpen && (!panel || !panel.classList.contains("open"))) document.body.classList.remove("nt-lock");
  ntRefresh();
}
async function ntChatLoad(first) {
  try {
    const res = await fetch(`${API_URL}?action=getPerbualan&email=${encodeURIComponent(ntUser.email)}&threadId=${encodeURIComponent(ntChat.threadId)}&peer=${encodeURIComponent(ntChat.peer)}`, { cache: "no-store" });
    const json = await res.json();
    if (!json || !json.success) throw new Error((json && json.message) || "Gagal memuatkan perbualan.");
    const changed = json.mesej.length !== ntChat.msgs.length;
    ntChat.info = json; ntChat.msgs = json.mesej;
    if (first) ntRenderChat(); else if (changed) ntRenderChatMsgs(true);
    // tandakan mesej daripada pihak lawan dalam perbualan ini sebagai dibaca
    const ids = ntItems.filter((i) => i.threadId === ntChat.threadId && String(i.dariEmel || "").toLowerCase() === String(ntChat.peer).toLowerCase() && !i.dibaca).map((i) => i.id);
    if (ids.length) ntMarkRead(ids);
  } catch (e) {
    if (first) {
      const layer = document.getElementById("nt-chat");
      if (layer) layer.innerHTML = `<div class="nt-chat-wrap"><div class="nt-chat-head"><button type="button" class="nt-x nt-back" onclick="ntCloseChat()" aria-label="Kembali">←</button><span class="nt-chat-name">Perbualan</span></div><div class="nt-empty">${ntEsc(e.message)}</div></div>`;
    }
  }
}
function ntBubbleTime(dibuat) {
  const [d, t] = String(dibuat || "").split(" ");
  return d === ntTodayIso() ? (t || "") : `${ntWhen(dibuat)} · ${t || ""}`;
}
function ntChatMsgsHtml() {
  let html = "", last = "";
  ntChat.msgs.forEach((m) => {
    const g = ntGroupLabel(m.dibuat);
    if (g !== last) { html += `<div class="nt-chat-day">${ntEsc(g)}</div>`; last = g; }
    html += `<div class="nt-bub-row ${m.saya ? "me" : "them"}"><div class="nt-bub">${m.root ? `<b>${ntEsc((ntChat.info && ntChat.info.tajuk) || "")}</b>` : ""}${ntEsc(m.teks)}</div><span class="nt-bub-time">${ntEsc(ntBubbleTime(m.dibuat))}${m.saya ? " · Anda" : ""}</span></div>`;
  });
  return html;
}
function ntRenderChatMsgs(scroll) {
  const box = document.getElementById("nt-chat-msgs");
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = ntChatMsgsHtml();
  if (scroll || nearBottom) box.scrollTop = box.scrollHeight;
}
function ntRenderChat() {
  const layer = document.getElementById("nt-chat");
  if (!layer) return;
  const info = ntChat.info || { peer: { nama: "" }, tajuk: "" };
  layer.innerHTML = `<div class="nt-chat-wrap" role="dialog" aria-label="Perbualan">
    <div class="nt-chat-head">
      <button type="button" class="nt-x nt-back" onclick="ntCloseChat()" aria-label="Kembali">←</button>
      ${ntAvatar({ dariGambar: info.peer.gambar }, "")}
      <span class="nt-chat-title"><b>${ntEsc(String(info.peer.nama || "").toUpperCase())}</b><span>${ntEsc(info.tajuk)}</span></span>
    </div>
    <div class="nt-chat-msgs" id="nt-chat-msgs"></div>
    <div class="nt-chat-err" id="nt-chat-err"></div>
    <div class="nt-chat-compose">
      <textarea class="nt-chat-input" id="nt-chat-input" rows="1" maxlength="500" placeholder="Tulis balasan..." aria-label="Tulis balasan"></textarea>
      <button type="button" class="nt-chat-send" id="nt-chat-send" onclick="ntChatSend()" aria-label="Hantar balasan"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg></button>
    </div>
  </div>`;
  ntRenderChatMsgs(true);
}
async function ntChatSend() {
  if (ntChat.busy) return;
  const inp = document.getElementById("nt-chat-input"), err = document.getElementById("nt-chat-err"), btn = document.getElementById("nt-chat-send");
  const teks = (inp.value || "").trim();
  if (!teks) return;
  ntChat.busy = true; btn.disabled = true; err.textContent = "";
  try {
    const res = await postToAppsScript(API_URL, { action: "balasNotifikasi", email: ntUser.email, threadId: ntChat.threadId, peer: ntChat.peer, teks });
    if (res && res.success) { inp.value = ""; await ntChatLoad(false); ntRenderChatMsgs(true); }
    else err.textContent = (res && res.message) || "Gagal menghantar balasan.";
  } catch (e) { err.textContent = "Ralat sambungan: " + e.message; }
  ntChat.busy = false; btn.disabled = false;
}

/* ---------------- Pop-up urgent automatik ---------------- */
function ntQueueUrgent() {
  ntItems.forEach((it) => {
    if (it.jenis === "URGENT" && !it.dibaca && ntIsActive(it) && !ntPopupSeen[it.id] && !ntPopupQueue.some((q) => q === it.id)) ntPopupQueue.push(it.id);
  });
}
function ntNextPopup() {
  if (ntModalOpen) return;
  if (document.getElementById("splash-screen")) { setTimeout(ntNextPopup, 800); return; } // tunggu splash habis
  while (ntPopupQueue.length) {
    const id = ntPopupQueue.shift();
    const it = ntFind(id);
    if (!it || it.dibaca || ntPopupSeen[id]) continue;
    ntPopupSeen[id] = true;
    const remaining = ntPopupQueue.filter((q) => { const x = ntFind(q); return x && !x.dibaca; }).length;
    ntShowModal(it, { urgent: true, idx: ntPopupTotalShown + 1, total: ntPopupTotalShown + 1 + remaining });
    ntPopupTotalShown++;
    return;
  }
  ntPopupTotalShown = 0; // giliran habis — kaunter bermula semula untuk kumpulan seterusnya
}
let ntPopupTotalShown = 0;

/* ---------------- Render semua ---------------- */
function ntRenderAll() {
  ntRenderBadge();
  ntRenderPanel();
  if (typeof ntRenderPage === "function" && document.getElementById("nt-page")) ntRenderPage();
}

/* ---------------- Muat + kitaran ---------------- */
async function ntRefresh() {
  const ok = await ntFetch();
  if (!ok) return;
  ntRenderAll();
  ntQueueUrgent();
  ntNextPopup();
}
function ntInit(user) {
  if (ntInitP) return ntInitP;
  ntUser = user;
  ntInstallBell();
  ntInitP = ntRefresh();
  setInterval(() => { if (!document.hidden) ntRefresh(); }, NT_POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ntRefresh(); });
  return ntInitP;
}

/* ============================================================
   HALAMAN NOTIFIKASI (notifikasi.html)
   ============================================================ */
function ntCanSend(u) {
  return String(u.role2 || "").trim().toLowerCase() === "pentadbir" || String(u.role3 || "").trim().toLowerCase() === "admin app";
}
function ntSetFilter(f) { ntFilter = f; ntRenderPage(); }
function ntRenderPage() {
  const box = document.getElementById("nt-page");
  if (!box) return;
  const unread = ntItems.filter((i) => !i.dibaca && ntIsActive(i)).length;
  const f = ntFilter;
  const list = ntItems.filter((i) => f === "belum" ? (!i.dibaca && ntIsActive(i)) : f === "guruganti" ? i.kategori === "GURU_GANTI" : f === "mesej" ? (i.kategori === "MESEJ" || i.kategori === "BALASAN") : true);
  let html = "", last = "";
  list.forEach((i) => {
    const g = ntGroupLabel(i.dibuat);
    if (g !== last) { html += `<div class="nt-group">${ntEsc(g)}</div>`; last = g; }
    html += ntItemHtml(i);
  });
  const chip = (key, label) => `<button type="button" class="nt-chip${f === key ? " on" : ""}" onclick="ntSetFilter('${key}')">${label}</button>`;
  box.innerHTML = `
    <div class="nt-page-head">
      <span class="nt-sheet-title">NOTIFIKASI</span>
      <button type="button" class="nt-link-btn" onclick="ntMarkAllRead()"${unread ? "" : " disabled"}>Tandakan semua dibaca</button>
    </div>
    <div class="nt-chips nt-chips-scroll">${chip("semua", "Semua")}${chip("belum", "Belum dibaca" + (unread ? " · " + unread : ""))}${chip("guruganti", "Guru Ganti")}${chip("mesej", "Mesej")}</div>
    <div class="nt-list nt-list-page">${html || `<div class="nt-empty">${ntLoadedOnce ? "Tiada notifikasi." : "Memuatkan..."}</div>`}</div>
    ${ntUser && ntCanSend(ntUser) ? `<div class="nt-send-bar"><button type="button" class="nt-btn-main" onclick="ntOpenForm()">＋ Hantar Mesej</button></div>` : ""}`;
}
async function ntPageInit(user) {
  await ntInit(user);
  ntRenderPage();
}

/* ---------------- Borang Hantar Mesej ---------------- */
const ntForm = { mode: "SEMUA", picked: {}, q: "", jenis: "BIASA", busy: false };
async function ntOpenForm() {
  ntForm.mode = "SEMUA"; ntForm.picked = {}; ntForm.q = ""; ntForm.jenis = "BIASA"; ntForm.busy = false; ntForm.tajuk = ""; ntForm.mesej = "";
  const layer = ntEnsureLayer("nt-form", "nt-layer nt-layer-form");
  layer.classList.add("open");
  document.body.classList.add("nt-lock");
  layer.innerHTML = `<div class="nt-form-wrap"><div class="nt-empty">Memuatkan senarai guru...</div></div>`;
  if (!ntStaff) {
    try {
      const res = await fetch(`${API_URL}?action=getSenaraiPenerima&email=${encodeURIComponent(ntUser.email)}`, { cache: "no-store" });
      const json = await res.json();
      if (json && json.success) ntStaff = json.senarai;
      else throw new Error((json && json.message) || "Gagal memuatkan senarai guru.");
    } catch (e) {
      layer.innerHTML = `<div class="nt-form-wrap"><div class="nt-empty">${ntEsc(e.message)}</div><button type="button" class="nt-btn-alt" onclick="ntCloseForm()">Tutup</button></div>`;
      return;
    }
  }
  const d = new Date(); d.setDate(d.getDate() + 3);
  ntForm.tamat = ntIso(d);
  ntRenderForm(true);
}
function ntCloseForm() {
  const layer = document.getElementById("nt-form");
  if (layer) { layer.classList.remove("open"); layer.innerHTML = ""; }
  document.body.classList.remove("nt-lock");
}
function ntPickedList() { return Object.keys(ntForm.picked); }
function ntFormSnapshot() {
  const g = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  ntForm.tajuk = g("nt-f-tajuk"); ntForm.mesej = g("nt-f-mesej"); ntForm.tamat = g("nt-f-tamat") || ntForm.tamat;
}
function ntRenderForm(full) {
  const layer = document.getElementById("nt-form");
  if (!layer) return;
  if (!full) ntFormSnapshot();
  const m = ntForm.mode;
  const picked = ntPickedList();
  const q = ntForm.q.trim().toLowerCase();
  const rows = (ntStaff || []).filter((s) => !q || s.nama.toLowerCase().includes(q)).slice(0, 80);
  const seg = (key, label) => `<button type="button" class="nt-seg${m === key ? " on" : ""}" onclick="ntSetMode('${key}')">${label}</button>`;
  const count = m === "SEMUA" ? 0 : picked.length;
  const btnLabel = m === "SEMUA" ? "Hantar kepada semua guru" : (count ? `Hantar kepada ${count} guru` : "Pilih penerima");
  const nameOf = (em) => { const s = (ntStaff || []).find((x) => x.emel === em); return s ? s.nama : em; };
  layer.innerHTML = `<div class="nt-form-wrap" role="dialog" aria-label="Hantar mesej">
    <div class="nt-form-head"><span class="nt-sheet-title">HANTAR MESEJ</span><button type="button" class="nt-x" onclick="ntCloseForm()" aria-label="Tutup">✕</button></div>
    <div class="nt-f-label">PENERIMA</div>
    <div class="nt-segs">${seg("SEMUA", "Semua guru")}${seg("PILIH", "Pilih guru")}${seg("SEORANG", "Seorang")}</div>
    ${m === "SEMUA" ? "" : `
    <div class="nt-pick">
      <input class="nt-input" id="nt-f-q" type="search" placeholder="Cari nama guru..." value="${ntEsc(ntForm.q)}" oninput="ntFormSearch(this.value)" autocomplete="off">
      ${picked.length ? `<div class="nt-pills">${picked.map((em) => `<button type="button" class="nt-pill" data-em="${ntEsc(em)}" onclick="ntTogglePick(this.getAttribute('data-em'))">${ntEsc(nameOf(em))} ✕</button>`).join("")}</div>` : ""}
      <div class="nt-pick-hint">${m === "SEORANG" ? "Pilih seorang guru" : picked.length + " guru dipilih · ketik nama untuk tambah atau buang"}</div>
      <div class="nt-pick-list" id="nt-pick-list">${rows.map((s) => ntPickRow(s, m)).join("") || '<div class="nt-empty">Tiada padanan.</div>'}</div>
    </div>`}
    <div class="nt-f-label">TAJUK</div>
    <input class="nt-input" id="nt-f-tajuk" maxlength="120" placeholder="Tajuk mesej" value="${ntEsc(ntForm.tajuk || "")}">
    <div class="nt-f-label">MESEJ</div>
    <textarea class="nt-input nt-textarea" id="nt-f-mesej" maxlength="1000" placeholder="Tulis mesej...">${ntEsc(ntForm.mesej || "")}</textarea>
    <div class="nt-f-row">
      <div class="nt-f-col"><div class="nt-f-label">JENIS</div>
        <div class="nt-segs"><button type="button" class="nt-seg${ntForm.jenis === "BIASA" ? " on" : ""}" onclick="ntSetJenis('BIASA')">Biasa</button><button type="button" class="nt-seg nt-seg-urgent${ntForm.jenis === "URGENT" ? " on" : ""}" onclick="ntSetJenis('URGENT')">Urgent</button></div>
      </div>
      <div class="nt-f-col"><div class="nt-f-label">TAMAT PAPARAN</div><input class="nt-input" id="nt-f-tamat" type="date" min="${ntTodayIso()}" value="${ntEsc(ntForm.tamat || "")}"></div>
    </div>
    <div class="nt-pick-hint">Urgent: terpapar sebagai pop-up apabila penerima membuka app, sehingga mereka tekan "Faham".</div>
    <div class="nt-f-msg" id="nt-f-msg"></div>
    <button type="button" class="nt-btn-main nt-f-send" id="nt-f-send" onclick="ntSend()"${m !== "SEMUA" && !count ? " disabled" : ""}>${ntEsc(btnLabel)}</button>
  </div>`;
}
function ntPickRow(s, m) {
  const on = !!ntForm.picked[s.emel];
  return `<button type="button" class="nt-pick-row${on ? " on" : ""}" data-em="${ntEsc(s.emel)}" onclick="ntTogglePick(this.getAttribute('data-em'))"><span class="nt-check">${on ? "✓" : ""}</span><span>${ntEsc(s.nama)}</span></button>`;
}
function ntSetMode(m) {
  if (ntForm.mode === m) return;
  ntFormSnapshot();
  const keep = ntPickedList();
  ntForm.mode = m;
  ntForm.picked = {};
  if (m === "SEORANG" && keep.length) ntForm.picked[keep[0]] = true;
  if (m === "PILIH") keep.forEach((k) => { ntForm.picked[k] = true; });
  ntRenderForm(false);
}
function ntSetJenis(j) { ntFormSnapshot(); ntForm.jenis = j; ntRenderForm(false); }
function ntTogglePick(em) {
  ntFormSnapshot();
  if (ntForm.mode === "SEORANG") ntForm.picked = ntForm.picked[em] ? {} : { [em]: true };
  else if (ntForm.picked[em]) delete ntForm.picked[em]; else ntForm.picked[em] = true;
  ntRenderForm(false);
}
function ntFormSearch(v) {
  ntForm.q = v;
  const box = document.getElementById("nt-pick-list");
  if (!box) return;
  const q = v.trim().toLowerCase();
  const rows = (ntStaff || []).filter((s) => !q || s.nama.toLowerCase().includes(q)).slice(0, 80);
  box.innerHTML = rows.map((s) => ntPickRow(s, ntForm.mode)).join("") || '<div class="nt-empty">Tiada padanan.</div>';
}
function ntFormMsg(t, ok) { const el = document.getElementById("nt-f-msg"); if (el) { el.textContent = t || ""; el.className = "nt-f-msg" + (ok ? " ok" : t ? " err" : ""); } }
async function ntSend() {
  if (ntForm.busy) return;
  ntFormSnapshot();
  const tajuk = (ntForm.tajuk || "").trim(), mesej = (ntForm.mesej || "").trim();
  if (!tajuk) { ntFormMsg("Sila isi tajuk."); return; }
  if (!mesej) { ntFormMsg("Sila isi mesej."); return; }
  const penerima = ntPickedList();
  if (ntForm.mode !== "SEMUA" && !penerima.length) { ntFormMsg("Pilih sekurang-kurangnya seorang penerima."); return; }
  if (ntForm.mode === "SEMUA" && !confirm("Hantar mesej ini kepada SEMUA guru?")) return;
  ntForm.busy = true;
  const btn = document.getElementById("nt-f-send"); if (btn) { btn.disabled = true; btn.textContent = "Menghantar..."; }
  try {
    const res = await postToAppsScript(API_URL, {
      action: "hantarNotifikasi", email: ntUser.email, jenis: ntForm.jenis, tajuk, mesej,
      sasaran: ntForm.mode === "SEMUA" ? "SEMUA" : "PILIH", penerima, tamat: ntForm.tamat || "",
    });
    if (res && res.success) {
      ntFormMsg("✓ Mesej dihantar.", true);
      setTimeout(() => { ntCloseForm(); ntRefresh(); }, 700);
    } else {
      ntFormMsg((res && res.message) || "Gagal menghantar mesej.");
      ntForm.busy = false; if (btn) { btn.disabled = false; btn.textContent = "Hantar semula"; }
    }
  } catch (e) {
    ntFormMsg("Ralat sambungan: " + e.message);
    ntForm.busy = false; if (btn) { btn.disabled = false; btn.textContent = "Hantar semula"; }
  }
}

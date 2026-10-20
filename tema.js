/* ============================================================
   TEMA & REWARD — UI di halaman Profil.
   Bergantung: tema-init.js (window.smTema), app.js (API_URL, postToAppsScript, smToast, temaSelaras, getSavedUser).
   Mata & tahap dikira DI SERVER (Code.gs: getReward / catatMata / simpanTema).
   ============================================================ */
(function () {
  var rw = null;       // ringkasan reward terkini
  var user = null;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function bukaSemua() { return !!(rw && rw.admin); }
  function tahapSaya() { return rw && rw.tahap ? rw.tahap : 1; }
  function terbuka(id) { var t = window.smTema.TEMA[id]; return bukaSemua() || t.t <= tahapSaya(); }

  function kadTahap() {
    var T = window.smTema.TEMA;
    if (!rw) return '<div class="tm-note">Memuatkan tahap...</div>';
    var peratus = 100, nota;
    if (rw.hingga != null) {
      peratus = Math.max(0, Math.min(100, Math.round(((rw.mata - rw.dari) / (rw.hingga - rw.dari)) * 100)));
      var seterus = window.smTema.ORDER.filter(function (k) { return T[k].t === rw.tahap + 1; }).map(function (k) { return T[k].n; });
      nota = "Tema seterusnya: <b>" + esc(seterus.join(", ") || "-") + "</b> di Tahap " + (rw.tahap + 1) + ". Lagi <b>" + (rw.hingga - rw.mata) + "</b> mata.";
    } else {
      nota = "Anda sudah di <b>tahap tertinggi</b>. Semua tema dibuka.";
    }
    var admin = rw.admin ? '<div class="tm-note" style="margin-top:6px"><b>Admin App:</b> semua tema dibuka.</div>' : "";
    return '<div class="tm-head"><div class="tm-level">Tahap ' + rw.tahap + ' · ' + esc(rw.namaTahap) + '</div><div class="tm-pts">' +
      rw.mata + (rw.hingga != null ? " / " + rw.hingga : "") + ' mata</div></div>' +
      '<div class="tm-bar"><i style="width:' + peratus + '%"></i></div>' +
      '<div class="tm-note">' + nota + '</div>' + admin +
      '<div class="tm-rules">Streak: <b>' + (rw.streak || 0) + ' hari</b> · Mata hari ini: ' + (rw.mataHariIni || 0) +
      '<br>Buka app hari ini +10 · Baca notifikasi +5 (maks 15 sehari) · Streak 7 hari berturut +50<br>Setiap <b>20 mata</b> = naik 1 tahap dan buka 1 tema baharu.</div>';
  }

  function pratonton(t) {
    return '<div class="tm-prev" style="background:' + t.bg + ';border:1px solid ' + t.border + '">' +
      '<div class="tm-prev-hdr" style="background:' + t.hdr + ';border-bottom:1px solid ' + t.border + '"><i style="background:' + t.text + ';opacity:.75"></i><b style="background:' + t.accent + '"></b></div>' +
      '<div class="tm-prev-body">' +
      '<div class="tm-prev-card" style="background:' + t.card + ';border:1px solid ' + t.border + '"><i style="width:40%;background:' + t.accent + '"></i><i style="width:100%;background:' + t.track + '"></i></div>' +
      '<div class="tm-prev-card" style="background:' + t.card + ';border:1px solid ' + t.border + '"><i style="width:100%;background:' + t.track + '"></i><i style="width:100%;background:rgba(255,179,71,.45)"></i></div>' +
      '</div></div>';
  }

  function grid() {
    var T = window.smTema.TEMA, cur = window.smTema.current();
    return window.smTema.ORDER.map(function (id) {
      var t = T[id], ok = terbuka(id), aktif = id === cur;
      var lencana = aktif ? '<span class="tm-badge on">Aktif sekarang</span>'
        : ok ? '<span class="tm-badge">Dibuka · Tahap ' + t.t + '</span>'
        : '<span class="tm-badge lock">Terkunci · Tahap ' + t.t + '</span>';
      var kunci = ok ? "" : '<div class="tm-lock"><span data-icon="lock"></span><span>Tahap ' + t.t + '</span></div>';
      return '<button type="button" class="tm-opt' + (aktif ? " active" : "") + (ok ? "" : " locked") + '" data-id="' + id + '" aria-label="' + esc(t.n) + '">' +
        '<div class="tm-prev-wrap" style="position:relative">' + pratonton(t) + kunci + '</div>' +
        '<div class="tm-name">' + esc(t.n) + '</div><div class="tm-note" style="font-size:11.5px">' + esc(t.ciri) + '</div>' + lencana + '</button>';
    }).join("");
  }

  function kadLite() {
    var m = window.smTema.liteMode(), lite = window.smTema.isLite();
    function b(v, l) { return '<button type="button" data-lite="' + v + '" class="' + (m === v ? "on" : "") + '">' + l + '</button>'; }
    return '<div class="tm-head"><div class="tm-level" style="font-size:14px">Mod jimat prestasi</div><div class="tm-pts">' + (lite ? "Sedang aktif" : "Tidak aktif") + '</div></div>' +
      '<div class="tm-lite">' + b("auto", "Auto") + b("on", "Hidup") + b("off", "Mati") + '</div>' +
      '<div class="tm-note">Mematikan kesan kabur kaca dan animasi latar supaya app lebih lancar dan jimat bateri. <b>Auto</b> mengesan telefon perlahan secara automatik.</div>';
  }

  function render() {
    var host = document.getElementById("tema-section");
    if (!host) return;
    host.innerHTML =
      '<div class="section-label">Tahap &amp; Tema</div>' +
      '<div class="glass tm-card">' + kadTahap() + '</div>' +
      '<div class="tm-grid">' + grid() + '</div>' +
      '<div class="glass tm-card">' + kadLite() + '</div>';
    if (typeof renderIcons === "function") renderIcons();
    host.querySelectorAll(".tm-opt").forEach(function (el) { el.addEventListener("click", function () { pilih(el.getAttribute("data-id")); }); });
    host.querySelectorAll(".tm-lite button").forEach(function (el) { el.addEventListener("click", function () { window.smTema.setLiteMode(el.getAttribute("data-lite")); render(); }); });
  }

  function pilih(id) {
    var t = window.smTema.TEMA[id];
    if (!t) return;
    if (!terbuka(id)) { smToast("Capai Tahap " + t.t + " untuk buka tema ini."); return; }
    window.smTema.apply(id);
    render();
    if (user && typeof apiConfigured === "function" && apiConfigured()) {
      postToAppsScript(API_URL, { action: "simpanTema", email: user.email, tema: id }).then(function (res) {
        if (res && res.success === false) smToast(res.message || "Tema tidak dapat disimpan di pelayan.");
      }).catch(function () { /* tema kekal pada peranti ini */ });
    }
  }

  async function muat() {
    try {
      var c = localStorage.getItem("smasra_reward");
      if (c) { rw = JSON.parse(c); render(); }
    } catch (e) { /* abaikan cache rosak */ }
    try {
      var r = await fetch(API_URL + "?action=getReward&email=" + encodeURIComponent(user.email));
      var d = await r.json();
      if (d && d.success) {
        rw = d;
        try { localStorage.setItem("smasra_reward", JSON.stringify(d)); } catch (e) { /* senyap */ }
        temaSelaras(d);
      }
    } catch (e) { /* guna cache */ }
    render();
  }

  window.temaProfilInit = function (u) {
    user = u;
    if (!window.smTema || !document.getElementById("tema-section")) return;
    render();
    if (typeof apiConfigured === "function" && apiConfigured()) muat();
  };
})();

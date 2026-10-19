/* ============================================================
   TEMA — dimuat SEGERAK di <head> (selepas style.css) supaya tema
   terpakai sebelum paparan pertama (tiada "kelip" tema asal).
   - data-tema  : id tema (deck/terang/aurora/madani/laut/amoled/brutal/ilustrasi)
   - data-cerah : "1" untuk tema cerah (teks gelap)
   - data-lite  : "1" = mod jimat prestasi (TANPA backdrop-filter/kabur & animasi latar)
   Mod jimat: Auto (kesan peranti perlahan) / Hidup / Mati — pilihan di Profil.
   Hanya cache setempat; pilihan sebenar disimpan ke Sheet "Reward" oleh tema.js.
   ============================================================ */
(function () {
  var TEMA = {
    deck:      { n: "Command Deck",        t: 1, cerah: 0, ciri: "Gelap, neon cyan. Tema asal app.", bg: "#050810", hdr: "#080d1a", card: "rgba(12,20,36,.9)", border: "rgba(0,229,255,.28)", text: "#e7f1ff", dim: "#8d9db8", accent: "#00e5ff", track: "rgba(0,229,255,.14)" },
    terang:    { n: "Terang Bersih",       t: 1, cerah: 1, ciri: "Cerah dan paling jelas dibaca di luar bilik.", bg: "#eef3f8", hdr: "#ffffff", card: "#ffffff", border: "#d6e0ea", text: "#14213d", dim: "#5a6b85", accent: "#0a8f86", track: "#e4ebf3", font: "Plus+Jakarta+Sans:wght@500;700;800&family=Inter:wght@400;500;600;700" },
    aurora:    { n: "Glass Aurora",        t: 2, cerah: 0, ciri: "Kaca kabur, latar gradien ungu dan teal.", bg: "linear-gradient(160deg,#5b3fd6 0%,#150d3d 45%,#0b4a63 100%)", hdr: "rgba(255,255,255,.1)", card: "rgba(255,255,255,.14)", border: "rgba(255,255,255,.3)", text: "#ffffff", dim: "rgba(255,255,255,.74)", accent: "#7df9e0", track: "rgba(255,255,255,.16)", font: "Outfit:wght@400;500;600;700" },
    madani:    { n: "Hijau Madani",        t: 3, cerah: 0, ciri: "Hijau tua dan emas, padan identiti sekolah.", bg: "linear-gradient(170deg,#0a3326 0%,#06201a 100%)", hdr: "#051a14", card: "rgba(255,255,255,.08)", border: "rgba(212,175,55,.5)", text: "#f3efe0", dim: "#a8c4b6", accent: "#e0b93d", track: "rgba(255,255,255,.1)", font: "Amiri:wght@400;700&family=Cairo:wght@500;600;700" },
    laut:      { n: "Laut Dalam",          t: 4, cerah: 0, ciri: "Biru laut pekat, aksen aqua, tenang.", bg: "linear-gradient(170deg,#04203c 0%,#0a4a7a 100%)", hdr: "rgba(4,24,44,.9)", card: "rgba(255,255,255,.1)", border: "rgba(120,210,255,.35)", text: "#eaf6ff", dim: "#9fc3dc", accent: "#5ad0ff", track: "rgba(120,210,255,.16)", font: "Manrope:wght@500;600;700;800" },
    amoled:    { n: "Midnight AMOLED",     t: 5, cerah: 0, ciri: "Hitam sebenar, jimat bateri skrin OLED.", bg: "#000000", hdr: "#07070a", card: "#101015", border: "#2a2a34", text: "#f1f1f6", dim: "#8b8b9a", accent: "#b794ff", track: "#1c1c25", font: "Sora:wght@500;600;700&family=DM+Sans:wght@400;500;600;700" },
    brutal:    { n: "Neo-Brutalism & Retro", t: 6, cerah: 1, ciri: "Garis hitam tebal, bayang keras, kuning dan merah jambu.", bg: "#fff4d6", hdr: "#ffd23f", card: "#ffffff", border: "#111111", text: "#111111", dim: "#444444", accent: "#ff5fa2", track: "#ffe9a8", font: "Space+Grotesk:wght@500;700" },
    ilustrasi: { n: "Illustrative Design", t: 7, cerah: 1, ciri: "Header berilustrasi bukit dan matahari, fon bulat mesra.", bg: "#fff8ec", hdr: "linear-gradient(#bfe6f5,#bfe6f5)", card: "#ffffff", border: "#f0dcc0", text: "#3a2a1c", dim: "#8b7a66", accent: "#e76f51", track: "#f6e7d0", font: "Baloo+2:wght@500;700;800&family=Nunito:wght@600;700;800" }
  };
  var ORDER = ["deck", "terang", "aurora", "madani", "laut", "amoled", "brutal", "ilustrasi"];
  var K_TEMA = "smasra_tema", K_LITE = "smasra_lite", K_LITE_AUTO = "smasra_lite_auto";

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* senyap */ } }

  function peranti_perlahan() {
    var m = navigator.deviceMemory, c = navigator.hardwareConcurrency;
    return (m && m <= 2) || (c && c <= 4) ? true : false;
  }
  function liteMode() { var m = get(K_LITE); return m === "on" || m === "off" ? m : "auto"; }
  function isLite() {
    var m = liteMode();
    if (m === "on") return true;
    if (m === "off") return false;
    var a = get(K_LITE_AUTO);
    return a !== null ? a === "1" : peranti_perlahan();
  }
  function muatFon(id) {
    var f = TEMA[id] && TEMA[id].font;
    if (!f || document.getElementById("tema-fon-" + id)) return;
    var l = document.createElement("link");
    l.id = "tema-fon-" + id; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=" + f + "&display=swap";
    document.head.appendChild(l);
  }
  function apply(id) {
    if (id) set(K_TEMA, TEMA[id] ? id : "deck");
    var cur = get(K_TEMA);
    if (!TEMA[cur]) cur = "deck";
    var el = document.documentElement;
    el.setAttribute("data-tema", cur);
    el.setAttribute("data-cerah", TEMA[cur].cerah ? "1" : "0");
    el.setAttribute("data-lite", isLite() ? "1" : "0");
    if (document.head) muatFon(cur);
    else document.addEventListener("DOMContentLoaded", function () { muatFon(cur); });
    return cur;
  }
  function setLiteMode(m) {
    set(K_LITE, m === "on" || m === "off" ? m : null);
    if (m === "auto" || !m) set(K_LITE_AUTO, null);
    apply();
    if ((m === "auto" || !m)) probe();
  }

  /* Ujian kelancaran sekali: ~30 bingkai selepas app siap. Purata > 30ms/bingkai (kurang ~33fps) = peranti perlahan. */
  function probe() {
    if (liteMode() !== "auto" || get(K_LITE_AUTO) !== null || !window.requestAnimationFrame) return;
    setTimeout(function () {
      var n = 0, mula = 0, akhir = 0;
      function tick(t) {
        if (!mula) mula = t;
        akhir = t; n++;
        if (n < 31) { requestAnimationFrame(tick); return; }
        var purata = (akhir - mula) / (n - 1);
        if (document.hidden) return; // tab di latar belakang — keputusan tidak sah
        set(K_LITE_AUTO, purata > 30 ? "1" : "0");
        apply();
      }
      requestAnimationFrame(tick);
    }, 3500);
  }

  window.smTema = { TEMA: TEMA, ORDER: ORDER, apply: apply, isLite: isLite, liteMode: liteMode, setLiteMode: setLiteMode, current: function () { var c = get(K_TEMA); return TEMA[c] ? c : "deck"; }, hasSaved: function () { return get(K_TEMA) !== null; } };
  apply();
  if (document.readyState === "complete") probe(); else window.addEventListener("load", probe);
})();

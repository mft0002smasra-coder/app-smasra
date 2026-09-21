/* ============================================================
   KEWANGAN — struktur tab boleh kembang (tab lain akan ditambah kelak).
   Tab semasa: "Nota Minta" (link luaran ke Google Form ikut jenis akaun).
   ============================================================ */

const KW_TABS = ["nota"]; // tambah kunci tab baharu di sini bila fungsi lain ditambah

function kwSwitchTab(name) {
  KW_TABS.forEach((t) => {
    const panel = document.getElementById(`kw-panel-${t}`);
    const nav = document.getElementById(`kw-nav-${t}`);
    if (panel) panel.classList.toggle("hidden", t !== name);
    if (nav) nav.classList.toggle("active", t === name);
  });
}

function kwInit(user) {
  kwSwitchTab("nota");
}

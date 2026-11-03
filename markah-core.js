/* ============================================================
   MARKAH UJIAN — teras kiraan (tiada DOM; boleh diuji dengan Node).
   Skala gred: Menengah Rendah (Ting. 1-3) A=1..E=5, G=6; Menengah Atas & Ting. 5 (SPM) A+=0..G=9.
   Ting. 4 mengikut skala SPM (peraturan.tktAtas = 4).
   GPI = jumlah nilai gred / bilangan subjek yang dikira. Subjek bertanda kira=false (cth PJK, PSV) hanya direkod:
   TIDAK masuk GPI, jumlah markah, peratus, kedudukan, GPS. Subjek bertanda analisis=true dipaparkan dalam Analisis Mata Pelajaran.
   ============================================================ */
(function (root) {
  "use strict";
  const SK_RENDAH = [["A", 80, 1], ["B", 60, 2], ["C", 50, 3], ["D", 40, 4], ["E", 30, 5], ["G", 0, 6]];
  const SK_ATAS = [["A+", 90, 0], ["A", 80, 1], ["A-", 70, 2], ["B+", 65, 3], ["B", 60, 4], ["C+", 55, 5], ["C", 50, 6], ["D", 45, 7], ["E", 40, 8], ["G", 0, 9]];
  const mkSkala = (a) => a.map((x) => ({ g: x[0], dari: x[1], mata: x[2] }));

  const DEF = {
    ujian: [
      { id: "UJ1", nama: "Ujian Penggal 1", tahun: 2026, tkt: [1, 2, 3, 4, 5], buka: false, mula: "", akhir: "" },
      { id: "UJ2", nama: "Peperiksaan Pertengahan Tahun", tahun: 2026, tkt: [1, 2, 3, 4, 5], buka: false, mula: "", akhir: "" },
      { id: "UJ3", nama: "Percubaan SPM", tahun: 2026, tkt: [5], buka: true, mula: "", akhir: "" },
      { id: "UJ4", nama: "Peperiksaan Akhir Tahun", tahun: 2026, tkt: [1, 2, 3, 4], buka: false, mula: "", akhir: "" },
    ],
    subjek: [
      ["BM", "BAHASA MELAYU", "Teras"], ["BI", "BAHASA INGGERIS", "Teras"], ["SEJ", "SEJARAH", "Teras"], ["MATH", "MATEMATIK", "Teras"], ["SAINS", "SAINS", "Teras"],
      ["PA", "PENDIDIKAN AKHLAK", "Elektif", [4, 5]], ["PERN", "PERNIAGAAN", "Elektif", [4, 5]], ["LAM", "LUGHAH ARABIAH MU’ASIRAH", "Agama"], ["USUL", "USULUDDIN", "Agama"],
      ["SYA", "SYARIAH", "Agama"], ["BAL", "BAHASA ARAB LANJUTAN", "Elektif", [4, 5]], ["MUI", "MUTAALA’AH ISLAMIAH", "Agama", [4, 5]],
      ["PJK", "PENDIDIKAN JASMANI DAN KESIHATAN", "Teras", [1, 2, 3, 4, 5], false], ["PSV", "PENDIDIKAN SENI VISUAL", "Teras", [1, 2, 3, 4, 5], false],
    ].map((s) => ({ kod: s[0], nama: s[1], kat: s[2], tkt: s[3] || [1, 2, 3, 4, 5], aktif: true, kira: s[4] !== false, analisis: true, alias: "" })),
    gred: { rendah: mkSkala(SK_RENDAH), atas: mkSkala(SK_ATAS) },
    peraturan: { tktAtas: 4, ambangRendah: 5, ambangAtas: 8 },
  };

  /* Kamus singkatan -> nama penuh (untuk "detect" singkatan daripada Jadual Guru / kod subjek) */
  const KAMUS = {
    BM: "BAHASA MELAYU", BI: "BAHASA INGGERIS", BING: "BAHASA INGGERIS", BC: "BAHASA CINA", BT: "BAHASA TAMIL", BA: "BAHASA ARAB", BAL: "BAHASA ARAB LANJUTAN",
    SEJ: "SEJARAH", SJ: "SEJARAH", MT: "MATEMATIK", MATH: "MATEMATIK", MM: "MATEMATIK", MTK: "MATEMATIK TAMBAHAN", AM: "MATEMATIK TAMBAHAN", SN: "SAINS", SC: "SAINS",
    FIZ: "FIZIK", KIM: "KIMIA", BIO: "BIOLOGI", SK: "SAINS KOMPUTER", RBT: "REKA BENTUK DAN TEKNOLOGI", ASK: "ASAS SAINS KOMPUTER", PERN: "PERNIAGAAN", PRN: "PERNIAGAAN", EKO: "EKONOMI",
    PAK: "PRINSIP AKAUN", GEO: "GEOGRAFI", PI: "PENDIDIKAN ISLAM", PAI: "PENDIDIKAN ISLAM", PM: "PENDIDIKAN MORAL", PA: "PENDIDIKAN AKHLAK", PJK: "PENDIDIKAN JASMANI DAN KESIHATAN", PJ: "PENDIDIKAN JASMANI DAN KESIHATAN",
    PK: "PENDIDIKAN KESIHATAN", PSV: "PENDIDIKAN SENI VISUAL", PSN: "PENDIDIKAN SENI", PMUZ: "PENDIDIKAN MUZIK", PSK: "PENDIDIKAN SIVIK", SIV: "SIVIK DAN KEWARGANEGARAAN", KMK: "KOMUNIKASI",
    LAM: "LUGHAH ARABIAH MU’ASIRAH", USUL: "USULUDDIN", UD: "USULUDDIN", SYA: "SYARIAH", SY: "SYARIAH", MUI: "MUTAALA’AH ISLAMIAH", TIL: "TAHFIZ AL-QURAN", HIF: "TAHFIZ AL-QURAN", QUR: "AL-QURAN", TAJ: "TAJWID", FQH: "FEQAH", HDS: "HADIS", TRB: "TARBIAH", NHW: "NAHU", SRF: "SARAF", ADB: "ADAB", BLG: "BALAGHAH", MTL: "MUTAALA’AH", IMLA: "IMLA’", INSYA: "INSYA’",
    KH: "KHAT", PSS: "PENGAJIAN SENI", ERT: "ENGLISH FOR RESEARCH", LIT: "KESUSASTERAAN MELAYU", KMT: "KESUSASTERAAN MELAYU", KSM: "KESUSASTERAAN MELAYU", TMK: "TEKNOLOGI MAKLUMAT DAN KOMUNIKASI", ICT: "TEKNOLOGI MAKLUMAT DAN KOMUNIKASI",
  };

  const nk = (s) => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const up = (s) => String(s == null ? "" : s).toUpperCase().replace(/\s+/g, " ").trim();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /** Padankan teks subjek (cth daripada Jadual Guru: "BM", "SAINS", "Matematik") dengan senarai subjek tetapan. */
  const expand = (t) => String(t == null ? "" : t).toUpperCase().replace(/\b(PEND|PNDK|PEN)\b\.?/g, "PENDIDIKAN").replace(/\b(BHS|BHSA)\b\.?/g, "BAHASA").replace(/\bISL\b\.?/g, "ISLAM").replace(/&/g, " DAN ");
  function cariSubjek(teks, subjek) {
    const n = nk(expand(teks)); if (!n) return null;
    let f = subjek.find((s) => nk(s.kod) === n);
    if (!f) f = subjek.find((s) => nk(s.nama) === n);
    if (!f) f = subjek.find((s) => String(s.alias || "").split(/[,;]/).some((a) => nk(a) && nk(a) === n));
    if (!f && KAMUS[n]) { const full = nk(KAMUS[n]); f = subjek.find((s) => nk(s.nama) === full); }
    if (!f && n.length >= 8) f = subjek.find((s) => nk(s.nama).indexOf(n) === 0 || n.indexOf(nk(s.nama)) === 0);
    return f || null;
  }
  /** Cadangan nama penuh bagi satu kod/singkatan (kamus dalaman) — "" jika tidak dikenali. */
  function namaPenuh(kod) { return KAMUS[nk(kod)] || ""; }

  const tingOf = (kelas) => { const m = String(kelas || "").match(/(?:^|[^0-9])([1-6])(?![0-9])/); return m ? +m[1] : 0; };
  const isAtas = (ting, tet) => ting >= ((tet && tet.peraturan && tet.peraturan.tktAtas) || 4);
  function skala(tet, ting) {
    const s = isAtas(ting, tet) ? tet.gred.atas : tet.gred.rendah;
    return s.slice().sort((a, b) => b.dari - a.dari);
  }
  function gredOf(mark, tet, ting) {
    const s = skala(tet, ting);
    for (const x of s) if (mark >= x.dari) return x;
    return s[s.length - 1];
  }
  const isGagal = (g, tet, ting) => { const s = skala(tet, ting); return s.length && g.g === s[s.length - 1].g; };
  const ambang = (tet, ting) => (isAtas(ting, tet) ? tet.peraturan.ambangAtas : tet.peraturan.ambangRendah);

  /** Subjek aktif bagi satu tingkatan, ikut susunan tetapan. */
  const subjekTkt = (tet, ting) => tet.subjek.filter((s) => s.aktif !== false && (s.tkt || []).indexOf(ting) !== -1);

  function muKey(m) {
    const kp = String(m.kp || "").replace(/[^0-9A-Za-z]/g, "");
    return kp ? kp.toUpperCase() : "N:" + up(m.nama);
  }
  function rawVal(v) {
    const s = String(v == null ? "" : v).trim().toUpperCase();
    if (!s) return { t: "none" };
    if (s === "TH" || s === "T") return { t: "th" };
    const x = parseFloat(s.replace(",", "."));
    return isNaN(x) ? { t: "none" } : { t: "num", v: x };
  }

  /** Kira satu murid. marks[kelas|KOD] = {marks:{kunci:nilai}}. */
  function kiraMurid(m, kelas, tet, marks, ting) {
    const subj = subjekTkt(tet, ting), key = muKey(m);
    const rows = subj.map((s) => {
      const rec = marks[up(kelas) + "|" + up(s.kod)];
      const r = rawVal(rec && rec.marks ? rec.marks[key] : "");
      if (r.t === "num") { const g = gredOf(r.v, tet, ting); return { kod: s.kod, kira: s.kira !== false, st: "num", m: r.v, g: g.g, mata: g.mata, gagal: isGagal(g, tet, ting) }; }
      return { kod: s.kod, kira: s.kira !== false, st: r.t };
    });
    const nums = rows.filter((r) => r.kira && r.st === "num");
    const sk = skala(tet, ting), gc = sk.map((x) => nums.filter((r) => r.g === x.g).length);
    const n = nums.length, jum = nums.reduce((a, r) => a + r.m, 0), mata = nums.reduce((a, r) => a + r.mata, 0);
    const gpi = n ? mata / n : null;
    return { rows, n, jum, pct: n ? jum / n : null, gpi, gc, lulus: gpi === null ? null : gpi < ambang(tet, ting), ting, key };
  }

  /** Kedudukan (1 = terbaik): GPI menaik, kemudian jumlah markah menurun; sama-sama sama = kedudukan sama. */
  function kedudukan(list, getter) {
    const ok = list.filter((x) => getter(x).gpi !== null).sort((a, b) => {
      const A = getter(a), B = getter(b); return A.gpi - B.gpi || B.jum - A.jum;
    });
    const rank = new Map(); let prev = null, r = 0;
    ok.forEach((x, i) => {
      const c = getter(x), sig = c.gpi.toFixed(4) + "|" + c.jum;
      if (sig !== prev) { r = i + 1; prev = sig; }
      rank.set(x, r);
    });
    return rank;
  }

  /** Analisis satu mata pelajaran bagi sekumpulan murid. res = senarai {calc}. Pulang null jika tiada data. */
  function analisisSubjek(kod, calcs, tet, ting) {
    const sk = skala(tet, ting);
    const arr = calcs.map((c) => c.rows.find((r) => r.kod === kod)).filter(Boolean);
    const hadir = arr.filter((r) => r.st === "num"), th = arr.filter((r) => r.st === "th").length;
    const gc = sk.map((x) => hadir.filter((r) => r.g === x.g).length);
    const gagal = hadir.filter((r) => r.gagal).length, ya = hadir.length - gagal;
    const gpmp = hadir.length ? hadir.reduce((a, r) => a + r.mata, 0) / hadir.length : null;
    return { kod, hadir: hadir.length, th, gc, ya, tidak: gagal, gpmp };
  }

  /** Cantum tetapan simpanan dengan lalai (medan hilang diisi). */
  function cantum(saved) {
    const t = clone(DEF), s = saved || {};
    if (Array.isArray(s.ujian) && s.ujian.length) t.ujian = s.ujian;
    if (Array.isArray(s.subjek) && s.subjek.length) t.subjek = s.subjek.map((x) => Object.assign({ aktif: true, kira: true, analisis: true, alias: "", kat: "Teras", tkt: [1, 2, 3, 4, 5] }, x));
    if (s.gred && Array.isArray(s.gred.rendah) && s.gred.rendah.length) t.gred.rendah = s.gred.rendah;
    if (s.gred && Array.isArray(s.gred.atas) && s.gred.atas.length) t.gred.atas = s.gred.atas;
    if (s.peraturan) t.peraturan = Object.assign(t.peraturan, s.peraturan);
    return t;
  }

  const API = { DEF, KAMUS, nk, up, clone, cariSubjek, namaPenuh, tingOf, isAtas, skala, gredOf, isGagal, ambang, subjekTkt, muKey, rawVal, kiraMurid, kedudukan, analisisSubjek, cantum };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MUC = API;
})(typeof window !== "undefined" ? window : globalThis);

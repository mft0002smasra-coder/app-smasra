/* ============================================================
   DATA PELAN TRADER — dikemas kini secara manual (bukan masa nyata).
   Ubah nilai di sini bila perlu menyemak semula pelan; halaman trader.html
   mengira nisbah risiko:ganjaran (RR) secara automatik daripada ref, sl dan tp.
   BUKAN nasihat pelaburan.
   ============================================================ */
window.TRADER_DATA = {
  kemaskini: "26 Okt 2026, pagi (data sumber 21–26 Okt 2026); EUR/USD dikemas 29 Okt: 5 tempat perpuluhan, SL 100 point",
  pasangan: {
    eur: {
      kod: "EUR/USD", nama: "Euro", unit: "point", faktor: 100000, nilaiLot: 1, slPoint: 100, // 1 point = 0.00001 (harga 5 tempat perpuluhan); USD1 sepoint bagi 1 lot standard. SL tetap 100 point
      dp: 5, rujuk: "≈ 1.12100 – 1.12500", bias: "Neutral · cenderung menurun", biasWarna: "amber",
      ringkas: "Trend menurun lima minggu dalam saluran menurun; lantunan dari 1.11600 masih korektif. Pasaran menunggu keputusan Fed (28 Okt) dan data PCE/KDNK AS (29 Okt).",
      pelan: [
        { id: "e1", tajuk: "Breakout Beli", arah: "BUY", tf: "M15 – H1", entry: [1.12600, 1.12700], ref: 1.12650, sl: 1.12550, tp: [1.13620, 1.14620],
          syarat: "Masuk selepas candle H1 ditutup di atas 1.12700 (atau retest 1.12450–1.12750 yang bertahan).",
          nota: "Sah hanya jika rintangan 1.12700 ditembusi. TP1 sebelum rintangan 1.13650, TP2 sebelum 1.14650 (30 point sebelum paras supaya sempat terisi sebelum harga berpatah). Kurangkan lot atau elak sebelum keputusan Fed." },
        { id: "e2", tajuk: "Lantunan di Support", arah: "BUY", tf: "M5 – M15", entry: [1.12000, 1.12100], ref: 1.12050, sl: 1.11950, tp: [1.12420, 1.12670],
          syarat: "Tunggu candle penolakan (pin bar / engulfing) di zon 1.11900–1.12150 dan Stochastic berpusing naik.",
          nota: "SL 100 point. TP1 sebelum rintangan 1.12450, TP2 sebelum rintangan 1.12700 (30 point sebelum paras). Ambil sebahagian di TP1 dan alih SL ke harga masuk." },
        { id: "e3", tajuk: "Pecah Support", arah: "SELL", tf: "M15 – H1", entry: [1.11450, 1.11550], ref: 1.11500, sl: 1.11600, tp: [1.10530, 1.10030],
          syarat: "Masuk selepas candle H1 ditutup di bawah 1.11600 dan retest 1.11350–1.11600 gagal naik semula.",
          nota: "Melawan lantunan korektif: sah jika saluran menurun dihormati. SL 100 point. TP1 sebelum 1.10500 dan TP2 sebelum 1.10000 (30 point sebelum paras psikologi/sasaran gelombang)." },
      ],
      sr: {
        res: [
          { p: 1.14650, n: "Sasaran breakout minggu 19 Okt; sempadan atas saluran menurun" },
          { p: 1.13650, n: "Sasaran utama senario beli (RoboForex 21 Okt)" },
          { p: 1.12700, n: "Rintangan tempatan; kunci breakout beli" },
          { p: 1.12450, n: "Rintangan tempatan jangka pendek" },
        ],
        sup: [
          { p: 1.12100, n: "Disokong penyatuan harga 26 Okt (Intermarket Analysis)" },
          { p: 1.11900, n: "Sokongan pembeli kuat (RoboForex)" },
          { p: 1.11600, n: "Sokongan dan sempadan bawah saluran menurun" },
          { p: 1.11450, n: "Sokongan seterusnya; di bawahnya terbuka ke 1.10000" },
        ],
        catatan: "Perhatian: tutup H1 di bawah 1.11600 meningkatkan risiko penurunan lanjut; tutup di atas 1.12700 membuka 1.13650.",
      },
      fundamental: [
        "Sentimen ZEW zon euro jatuh ke 18.5 (dari 25.8, ramalan 24.2): menekan euro.",
        "Ketidakstabilan politik Perancis dan kebimbangan kewangan awam menambah tekanan pada euro.",
        "Hasil bon AS menurun (mengehadkan kekuatan dolar), tetapi tegangan Timur Tengah dan harga minyak tinggi menyokong dolar sebagai safe haven.",
        "Pasaran meletakkan kebarangkalian tinggi kenaikan kadar Fed pada Disember (CME FedWatch ≈ 79%); keputusan Fed 28 Okt dijangka tiada perubahan.",
        "Kalendar ekonomi: FOMC 28 Okt (02:00 MYT 29 Okt), KDNK S3 dan PCE AS 29 Okt (20:30 MYT), NFP AS 6 Nov. Elak masuk sekitar masa acara.",
      ],
      teknikal: [
        "Carta harian: trend menurun masih utuh; harga dalam saluran menurun, lantunan dari 1.11600.",
        "Stochastic harian oversold dengan persilangan bullish, tetapi belum mengesahkan pembalikan jangka sederhana.",
        "Penutupan mingguan sekitar 1.12300 menamatkan lima minggu rugi berturut-turut.",
      ],
      elliott: {
        ringkas: "Kiraan kerja (tafsiran struktur harga, bukan kiraan rasmi): turun lima minggu dalam saluran menurun; lantunan 1.11600 → 1.12450–1.12700 dilabel gelombang korektif (b).",
        pts: [[0, 22], [18, 58], [32, 38], [52, 84], [64, 66]], labels: ["(a)", "(b)", "", "", ""], // dilukis dalam trader.js
        senario: [
          { t: "Utama", w: "Lantunan tertahan di bawah 1.12700–1.13650 (gelombang b), kemudian gelombang (c) menembusi 1.11600 menyasar 1.10500 – 1.10000.", batal: "Batal bila harian ditutup di atas 1.14650." },
          { t: "Alternatif", w: "1.11600 ialah hujung gelombang (c) / 5 turun; lantunan lebih kuat ke 1.13650 – 1.14650.", batal: "Batal bila harga tutup di bawah 1.11450." },
        ],
      },
    },
    gold: {
      kod: "XAU/USD", nama: "Emas", unit: "USD", faktor: 1, nilaiLot: 100, // USD100 bagi pergerakan USD1 untuk 1 lot (100 oz)
      dp: 0, rujuk: "≈ 3,995 – 4,010", bias: "Neutral · menguji sokongan kritikal", biasWarna: "amber",
      ringkas: "Emas jatuh di bawah USD4,000 (paling rendah sejak Julai) ketika jangkaan kenaikan kadar Fed dan harga minyak tinggi menekan. Harga menguji sokongan 3,970.",
      pelan: [
        { id: "g1", tajuk: "Lantunan di 3,970", arah: "BUY", tf: "M5 – M15", entry: [3955, 3990], ref: 3978, sl: 3930, tp: [4130, 4220],
          syarat: "Tunggu candle penolakan di zon 3,955–3,990 dan RSI/Stochastic berpusing naik; boleh ambil sebahagian di 4,015 (Lower Bollinger).",
          nota: "Risiko tinggi: tutup di bawah 3,970 mengubah senario. Emas boleh bergerak USD50+ dalam beberapa minit semasa berita." },
        { id: "g2", tajuk: "Breakout Beli", arah: "BUY", tf: "H1", entry: [4110, 4130], ref: 4120, sl: 4055, tp: [4220, 4355],
          syarat: "Masuk selepas candle H1 ditutup di atas 4,110 (pencetus senario beli RoboForex).",
          nota: "Sasaran 4,355 ialah rintangan utama; 4,220 = SMA-100 harian." },
        { id: "g3", tajuk: "Pecah 3,970", arah: "SELL", tf: "M15 – H1", entry: [3955, 3975], ref: 3965, sl: 4015, tp: [3895, 3675],
          syarat: "Masuk selepas candle H1 ditutup di bawah 3,970 dan retest gagal naik semula.",
          nota: "TP2 3,675 ialah sasaran jauh (sokongan seterusnya); pertimbangkan tutup separuh di 3,895." },
      ],
      sr: {
        res: [
          { p: 4355, n: "Sasaran utama senario beli; sempadan atas julat mingguan" },
          { p: 4285, n: "Rintangan seterusnya" },
          { p: 4220, n: "SMA-100 harian" },
          { p: 4130, n: "SMA-20 harian / pertengahan Bollinger" },
          { p: 4110, n: "Pencetus breakout beli" },
          { p: 4015, n: "Lower Bollinger Band (harian)" },
        ],
        sup: [
          { p: 3970, n: "Sokongan kritikal: sama dengan paras terendah Jun, Julai dan September" },
          { p: 3895, n: "Paras invalidasi; tembusan membuka penurunan lanjut" },
          { p: 3675, n: "Sokongan seterusnya jika 3,895 ditembusi" },
        ],
        catatan: "Kunci: pertahankan 3,970 = peluang lantunan; tutup H4 di bawah 3,895 = senario menurun ke 3,675.",
      },
      fundamental: [
        "Kebarangkalian kenaikan kadar Fed pada Disember ≈ 79% (CME FedWatch); keputusan 28 Okt dijangka tiada perubahan (≈ 91%). Nada hawkish menguatkan dolar dan menekan emas.",
        "Minyak WTI pada paras tertinggi lebih lima bulan (serangan Houthi di Arab Saudi), menaikkan kebimbangan inflasi dan jangkaan kadar tinggi lebih lama.",
        "Jualan CTA yang berat sepanjang minggu; hasil bon AS menurun tetapi emas masih lemah (sentimen rapuh).",
        "Kalendar ekonomi: FOMC 28 Okt (02:00 MYT 29 Okt), KDNK S3 dan PCE AS 29 Okt (20:30 MYT), BoJ 30 Okt, NFP AS 6 Nov, pilihan raya pertengahan AS 3 Nov.",
      ],
      teknikal: [
        "Harian: harga di bawah SMA-100, pertengahan dan Lower Bollinger Band; RSI(14) ≈ 34 (hampir oversold).",
        "Stochastic oversold dengan persilangan bullish menyokong kemungkinan lantunan.",
        "Corak segi tiga (triangle) / saluran menurun; harga menghampiri sempadan bawahnya.",
        "Julat mingguan dirujuk 3,905 – 4,355.",
      ],
      elliott: {
        ringkas: "Kiraan kerja (tafsiran struktur harga, bukan kiraan rasmi): segi tiga mengecut A-B-C-D-E; harga kini di hujung gelombang E menguji sempadan bawah 3,970 – 3,895.",
        pts: [[0, 30], [14, 74], [30, 38], [44, 66], [58, 46]], labels: ["A", "B", "C", "D", "E"],
        senario: [
          { t: "Utama", w: "Gelombang E selesai di 3,970 – 3,895, kemudian dorongan naik (thrust) ke 4,110 → 4,285 → 4,355.", batal: "Batal bila H4 ditutup di bawah 3,895." },
          { t: "Alternatif", w: "Segi tiga gagal: gelombang C turun ke 3,675 selepas tembusan 3,895.", batal: "Batal bila harga kembali dan tutup di atas 4,110." },
        ],
      },
    },
  },
  // Kalendar ekonomi (masa UTC). Papar dalam halaman HANYA 1 jam sebelum acara. Tambah/ubah baris di sini.
  acara: [
    { t: "2026-10-28T18:00:00Z", n: "Keputusan kadar FOMC (AS)", kesan: "Tinggi: EUR/USD dan emas" },
    { t: "2026-10-29T12:30:00Z", n: "KDNK S3 dan inflasi PCE (AS)", kesan: "Tinggi: EUR/USD dan emas" },
    { t: "2026-10-30T03:00:00Z", n: "Keputusan kadar BoJ", kesan: "Sederhana: USD/JPY, emas", anggaran: true },
    { t: "2026-11-06T13:30:00Z", n: "Pekerjaan bukan ladang (NFP) AS", kesan: "Tinggi: EUR/USD dan emas" },
  ],
  sumber: [
    ["RoboForex: ramalan emas mingguan 26–30 Okt 2026", "https://roboforex.com/beginners/analytics/forex-forecast/gold/xau-usd-gold-weekly-forecast-2026-10-23/"],
    ["FXStreet: emas jatuh di bawah USD4,000 (25 Okt 2026)", "https://fxstreet.com/news/gold-declines-below-4-000-as-higher-oil-prices-reinforce-fed-rate-hike-expectations-202610252324"],
    ["RoboForex: analisis EURUSD 21 Okt 2026", "https://roboforex.com/beginners/analytics/forex-forecast/currencies/eur-usd-forecast-2026-10-21/"],
    ["RoboForex: ramalan EURUSD mingguan 19–23 Okt 2026", "https://roboforex.com/beginners/analytics/forex-forecast/currencies/eur-usd-weekly-forecast-2026-10-19/"],
    ["Investing.com: kalendar ekonomi", "https://www.investing.com/economic-calendar/"],
    ["Investing.com: teknikal EUR/USD", "https://www.investing.com/currencies/eur-usd-technical"],
    ["Investing.com: teknikal XAU/USD", "https://www.investing.com/currencies/xau-usd-technical"],
    ["Daily Intermarket Analysis 26 Okt 2026", "https://silviopascali.substack.com/p/daily-intermarket-analysis-26october2026"],
  ],
};

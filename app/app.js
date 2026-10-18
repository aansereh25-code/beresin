/* =========================================================
   BERESIN — logika bisnis murni (tanpa DOM).
   Dipakai di halaman dan di tes Node.
   ========================================================= */
(function (root) {
'use strict';

/* ---------- Konfigurasi bawaan (dapat diubah admin lewat config/main) ---------- */
const DEFAULT_CONFIG = {
  region: 'kupang',
  commissionPct: 10,              // % dari nilai jasa yang memenuhi syarat
  minDeposit: 50000,              // deposit minimum mitra
  maxActiveJobs: 3,               // kapasitas pekerjaan aktif per mitra
  maxMatchKm: 15,                 // di atas ini butuh penawaran khusus
  travelTiers: [                  // usulan awal, perlu validasi lokal
    { upTo: 3, fee: 0 },
    { upTo: 5, fee: 5000 },
    { upTo: 8, fee: 10000 },
    { upTo: 12, fee: 15000 },
    { upTo: 15, fee: 20000 }
  ],
  cancelFeeMin: 10000,
  services: {}                    // override per layanan: {price, active}
};

/* ---------- Wilayah: Kota Kupang & sekitarnya (titik pusat perkiraan) ---------- */
const REGIONS = {
  kupang: {
    name: 'Kupang, NTT',
    areas: {
      alak:        { name: 'Alak',                 lat: -10.1835, lng: 123.5470 },
      kotalama:    { name: 'Kota Lama',            lat: -10.1580, lng: 123.5800 },
      kotaraja:    { name: 'Kota Raja',            lat: -10.1760, lng: 123.5960 },
      oebobo:      { name: 'Oebobo',               lat: -10.1700, lng: 123.6150 },
      kelapalima:  { name: 'Kelapa Lima',          lat: -10.1480, lng: 123.6230 },
      maulafa:     { name: 'Maulafa',              lat: -10.2050, lng: 123.6110 },
      kupangtengah:{ name: 'Kupang Tengah (Kab.)', lat: -10.1420, lng: 123.6950 },
      kupangbarat: { name: 'Kupang Barat (Kab.)',  lat: -10.2250, lng: 123.4850 }
    }
  }
};

const ROAD_FACTOR = 1.3;       // jarak garis lurus × faktor jalan
const SAME_AREA_KM = 2;        // asumsi dalam satu kecamatan

function haversineKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function areaDistanceKm(fromArea, toArea, region) {
  const r = REGIONS[region || 'kupang'];
  if (!r || !r.areas[fromArea] || !r.areas[toArea]) return null;
  if (fromArea === toArea) return SAME_AREA_KM;
  return Math.round(haversineKm(r.areas[fromArea], r.areas[toArea]) * ROAD_FACTOR * 10) / 10;
}
function travelFee(km, cfg) {
  const tiers = (cfg && cfg.travelTiers) || DEFAULT_CONFIG.travelTiers;
  if (km == null || isNaN(km)) return { fee: 0, custom: false, unknown: true };
  for (const t of tiers) if (km <= t.upTo) return { fee: t.fee, custom: false };
  return { fee: 0, custom: true };
}

/* ---------- Katalog layanan ---------- */
const CATEGORIES = [
  { id: 'kebersihan',  name: 'Kebersihan',            long: 'Kebersihan & Sanitasi',        icon: 'sparkle', tint: 'green' },
  { id: 'ac',          name: 'AC & Elektronik',       long: 'AC & Peralatan Elektronik',    icon: 'snow',    tint: 'teal' },
  { id: 'listrik',     name: 'Listrik & Ledeng',      long: 'Listrik & Perpipaan',          icon: 'zap',     tint: 'amber' },
  { id: 'pertukangan', name: 'Pertukangan',           long: 'Pertukangan, Instalasi & Renovasi', icon: 'hammer', tint: 'orange' },
  { id: 'taman',       name: 'Taman & Luar Ruang',    long: 'Taman & Perawatan Luar Ruang', icon: 'leaf',    tint: 'green' },
  { id: 'kendaraan',   name: 'Kendaraan',             long: 'Bantuan Kendaraan & Derek',    icon: 'car',     tint: 'red' },
  { id: 'pindahan',    name: 'Pindahan & Angkut',     long: 'Pindahan, Angkut & Transportasi', icon: 'truck', tint: 'orange' },
  { id: 'teknologi',   name: 'Teknologi',             long: 'Komputer, Jaringan & Teknologi', icon: 'monitor', tint: 'blue' },
  { id: 'hewan',       name: 'Hewan Peliharaan',      long: 'Perawatan Hewan Peliharaan',   icon: 'paw',     tint: 'violet' },
  { id: 'harian',      name: 'Bantuan Harian',        long: 'Bantuan Harian & Rumah Tangga', icon: 'basket', tint: 'pink' },
  { id: 'profesional', name: 'Profesional',           long: 'Jasa Profesional & Kreatif',   icon: 'brief',   tint: 'indigo' },
  { id: 'komersial',   name: 'Bisnis & Komersial',    long: 'Layanan Bisnis & Komersial',   icon: 'building', tint: 'slate' }
];

/* field: k kunci, l label, t tipe (num|sel|text|area), o opsi, req wajib, u satuan, min */
const F = {
  luas:   (l, min) => ({ k: 'luas', l: l || 'Luas area', t: 'num', u: 'm²', req: true, min: min || 1 }),
  kondisi:(o) => ({ k: 'kondisi', l: 'Kondisi', t: 'sel', o: o || ['Normal', 'Cukup kotor', 'Sangat kotor'], req: true }),
  akses:  { k: 'akses', l: 'Akses lokasi', t: 'sel', o: ['Mudah dijangkau', 'Perlu tangga/ketinggian', 'Jalan sempit/gang'], req: false },
  catatan:{ k: 'catatan', l: 'Catatan tambahan', t: 'area', req: false, ph: 'Contoh: parkir bisa di halaman, ada anjing di rumah.' }
};

const SERVICES = [
  // Kebersihan
  { id: 'k_rumah', cat: 'kebersihan', name: 'Pembersihan Rumah', model: 'sqm', price: 2500, minQty: 60, qtyField: 'luas', unit: 'm²', dur: '2–4 jam', risk: 'low', w: 1, popular: true,
    desc: 'Pembersihan menyeluruh ruang tamu, kamar, dapur, dan kamar mandi oleh mitra terlatih.',
    inc: ['Sapu, pel, dan lap debu', 'Pembersihan kamar mandi', 'Dapur dan area cuci piring', 'Laporan sebelum & sesudah'],
    tools: ['Vakum', 'Alat pel', 'Cairan pembersih'],
    fields: [F.luas('Luas rumah', 20), { k: 'kamar', l: 'Jumlah kamar', t: 'num', req: true, min: 1 }, { k: 'kmandi', l: 'Jumlah kamar mandi', t: 'num', req: true, min: 1 }, F.kondisi(), F.catatan] },
  { id: 'k_kmandi', cat: 'kebersihan', name: 'Deep Cleaning Kamar Mandi', model: 'unit', price: 120000, qtyField: 'jumlah', unit: 'kamar mandi', dur: '1–2 jam', risk: 'low', w: 1,
    desc: 'Menghilangkan kerak, jamur, dan noda membandel pada lantai, dinding, dan kloset.',
    inc: ['Pembersihan kerak & jamur', 'Kloset, wastafel, shower', 'Nat keramik'], tools: ['Sikat mesin', 'Pembersih kerak'],
    fields: [{ k: 'jumlah', l: 'Jumlah kamar mandi', t: 'num', req: true, min: 1 }, F.kondisi(), F.catatan] },
  { id: 'k_kantor', cat: 'kebersihan', name: 'Pembersihan Kantor/Ruko', model: 'sqm', price: 3000, minQty: 50, qtyField: 'luas', unit: 'm²', dur: '2–5 jam', risk: 'low', w: 1,
    desc: 'Pembersihan area kerja, toilet, pantry, dan kaca untuk kantor atau ruko.',
    inc: ['Area kerja & lantai', 'Toilet & pantry', 'Kaca bagian dalam'], tools: ['Vakum', 'Alat pel', 'Pembersih kaca'],
    fields: [F.luas('Luas area kerja', 20), { k: 'lantai', l: 'Jumlah lantai', t: 'num', req: true, min: 1 }, F.kondisi(), F.catatan] },
  { id: 'k_disinfeksi', cat: 'kebersihan', name: 'Disinfeksi & Sanitasi', model: 'sqm', price: 4000, minQty: 40, qtyField: 'luas', unit: 'm²', dur: '1–3 jam', risk: 'medium', w: 1,
    desc: 'Penyemprotan disinfektan untuk rumah, kantor, atau fasilitas umum.',
    inc: ['Penyemprotan seluruh ruangan', 'Permukaan sentuh', 'Laporan area tertangani'], tools: ['Sprayer', 'APD'],
    fields: [F.luas('Luas area', 20), { k: 'jenis', l: 'Jenis bangunan', t: 'sel', o: ['Rumah', 'Kantor', 'Sekolah', 'Rumah ibadah', 'Lainnya'], req: true }, F.catatan] },

  // AC & elektronik
  { id: 'ac_cuci', cat: 'ac', name: 'Cuci AC', model: 'unit', price: 100000, qtyField: 'unit', unit: 'unit', dur: '1–2 jam', risk: 'low', w: 7, popular: true,
    desc: 'Pembersihan AC untuk menjaga performa, udara lebih bersih, dan memperpanjang usia perangkat.',
    inc: ['Pembersihan unit indoor', 'Pembersihan unit outdoor', 'Pengecekan kondisi', 'Laporan hasil pekerjaan'], tools: ['Jet cleaner', 'Kantong cuci AC', 'Manifold'],
    fields: [{ k: 'unit', l: 'Jumlah unit AC', t: 'num', req: true, min: 1 }, { k: 'jenis', l: 'Jenis AC', t: 'sel', o: ['Split', 'Cassette', 'Standing', 'Window'], req: true },
      { k: 'kondisi', l: 'Kondisi AC', t: 'sel', o: ['Perawatan rutin', 'Kurang dingin', 'Bocor air', 'Berisik', 'Bau'], req: true },
      { k: 'posisi', l: 'Lokasi pemasangan', t: 'text', req: false, ph: 'Contoh: kamar lantai 2, outdoor di atap' }, F.catatan] },
  { id: 'ac_freon', cat: 'ac', name: 'Isi Freon AC', model: 'unit', price: 250000, qtyField: 'unit', unit: 'unit', dur: '1–2 jam', risk: 'medium', w: 7,
    desc: 'Pengisian refrigeran sesuai tipe AC disertai uji kebocoran.',
    inc: ['Uji kebocoran', 'Pengisian freon', 'Pengukuran tekanan'], tools: ['Manifold', 'Tabung freon'],
    fields: [{ k: 'unit', l: 'Jumlah unit AC', t: 'num', req: true, min: 1 }, { k: 'freon', l: 'Jenis freon (jika tahu)', t: 'sel', o: ['Tidak tahu', 'R32', 'R410A', 'R22'], req: false }, F.catatan] },
  { id: 'ac_pasang', cat: 'ac', name: 'Pasang AC Baru', model: 'unit', price: 350000, qtyField: 'unit', unit: 'unit', dur: '2–4 jam', risk: 'medium', w: 7,
    desc: 'Instalasi AC baru. Pipa dan material tambahan diajukan sebagai penawaran material sebelum dibeli.',
    inc: ['Pemasangan indoor & outdoor', 'Vakum sistem', 'Uji fungsi'], tools: ['Bor beton', 'Pompa vakum'],
    fields: [{ k: 'unit', l: 'Jumlah unit', t: 'num', req: true, min: 1 }, { k: 'pk', l: 'Kapasitas', t: 'sel', o: ['½ PK', '¾ PK', '1 PK', '1½ PK', '2 PK'], req: true }, { k: 'pipa', l: 'Perkiraan panjang pipa (m)', t: 'num', req: false, min: 0 }, F.akses, F.catatan] },
  { id: 'ac_elektronik', cat: 'ac', name: 'Servis Kulkas / Mesin Cuci', model: 'inspection', price: 75000, unit: 'kunjungan', dur: '1–3 jam', risk: 'medium', w: 7, wNote: 'Garansi 7 hari untuk jasa yang disepakati; suku cadang mengikuti ketentuan terpisah.',
    desc: 'Pemeriksaan dan perbaikan peralatan rumah tangga. Harga akhir ditentukan setelah inspeksi dan persetujuan Anda.',
    inc: ['Diagnosa kerusakan', 'Penawaran rinci sebelum perbaikan', 'Perbaikan setelah disetujui'], tools: ['Multimeter', 'Peralatan servis'],
    fields: [{ k: 'alat', l: 'Jenis peralatan', t: 'sel', o: ['Kulkas', 'Mesin cuci', 'Dispenser', 'Lainnya'], req: true }, { k: 'merek', l: 'Merek / tipe', t: 'text', req: false }, { k: 'gejala', l: 'Keluhan', t: 'area', req: true, ph: 'Contoh: kulkas tidak dingin sejak 2 hari' }] },

  // Listrik & ledeng
  { id: 'l_titik', cat: 'listrik', name: 'Instalasi Titik Listrik', model: 'point', price: 75000, qtyField: 'titik', unit: 'titik', dur: '1–4 jam', risk: 'medium', w: 7,
    desc: 'Pemasangan titik lampu, stopkontak, atau saklar baru oleh teknisi listrik.',
    inc: ['Penarikan kabel', 'Pemasangan titik', 'Uji fungsi & keamanan'], tools: ['Tespen', 'Multimeter', 'Bor'],
    fields: [{ k: 'titik', l: 'Jumlah titik', t: 'num', req: true, min: 1 }, { k: 'jenis', l: 'Jenis titik', t: 'sel', o: ['Lampu', 'Stopkontak', 'Saklar', 'Campuran'], req: true }, { k: 'instalasi', l: 'Kondisi instalasi', t: 'sel', o: ['Baru', 'Tambahan pada instalasi lama', 'Tidak tahu'], req: true }, F.catatan] },
  { id: 'l_korslet', cat: 'listrik', name: 'Perbaikan Korsleting', model: 'inspection', price: 100000, unit: 'kunjungan', dur: '1–3 jam', risk: 'high', cert: 'listrik',
    w: 7, desc: 'Penelusuran dan perbaikan korsleting. Hanya dikerjakan mitra bersertifikat kelistrikan. Harga final setelah inspeksi.',
    inc: ['Penelusuran sumber gangguan', 'Penawaran rinci', 'Perbaikan setelah disetujui'], tools: ['Insulation tester', 'APD listrik'],
    fields: [{ k: 'gejala', l: 'Gejala', t: 'area', req: true, ph: 'Contoh: MCB turun setiap pakai setrika' }, { k: 'daya', l: 'Daya listrik', t: 'sel', o: ['450 VA', '900 VA', '1300 VA', '2200 VA', '> 2200 VA', 'Tidak tahu'], req: false }] },
  { id: 'p_pipa', cat: 'listrik', name: 'Perbaikan Pipa Bocor', model: 'visit', price: 120000, unit: 'kunjungan', dur: '1–2 jam', risk: 'low', w: 7, popular: true,
    desc: 'Perbaikan kebocoran pipa air bersih dan sambungan. Material diajukan terpisah bila perlu.',
    inc: ['Pencarian titik bocor', 'Perbaikan sambungan', 'Uji tekanan air'], tools: ['Kunci pipa', 'Seal tape'],
    fields: [{ k: 'lokasi', l: 'Lokasi kebocoran', t: 'text', req: true, ph: 'Contoh: bawah wastafel dapur' }, { k: 'pipa', l: 'Jenis pipa', t: 'sel', o: ['PVC', 'Besi', 'Tidak tahu'], req: false }, F.catatan] },
  { id: 'p_sanitair', cat: 'listrik', name: 'Perbaikan Kloset / Wastafel', model: 'visit', price: 100000, unit: 'kunjungan', dur: '1–2 jam', risk: 'low', w: 7,
    desc: 'Perbaikan kloset mampet, tangki bocor, atau wastafel.',
    inc: ['Diagnosa', 'Perbaikan', 'Uji fungsi'], tools: ['Plunger', 'Spiral pipa'],
    fields: [{ k: 'masalah', l: 'Masalah', t: 'sel', o: ['Mampet', 'Bocor', 'Tidak bisa flush', 'Lainnya'], req: true }, F.catatan] },

  // Pertukangan
  { id: 't_cat', cat: 'pertukangan', name: 'Pengecatan Dinding', model: 'sqm', price: 25000, minQty: 10, qtyField: 'luas', unit: 'm²', dur: '1–3 hari', risk: 'low', w: 14,
    desc: 'Pengecatan dinding interior atau eksterior. Cat dapat disediakan pelanggan atau dibelikan mitra dengan persetujuan.',
    inc: ['Persiapan & penutupan area', 'Dempul ringan', 'Dua lapis cat'], tools: ['Roller', 'Kuas', 'Tangga'],
    fields: [F.luas('Luas dinding', 5), { k: 'dinding', l: 'Kondisi dinding', t: 'sel', o: ['Baik', 'Retak ringan', 'Mengelupas', 'Lembap'], req: true }, { k: 'area', l: 'Area', t: 'sel', o: ['Interior', 'Eksterior'], req: true }, { k: 'bahan', l: 'Bahan cat', t: 'sel', o: ['Saya sediakan', 'Dibelikan mitra (perlu persetujuan)'], req: true }, F.catatan] },
  { id: 't_furnitur', cat: 'pertukangan', name: 'Rakit & Pasang Furnitur', model: 'unit', price: 75000, qtyField: 'jumlah', unit: 'item', dur: '1–3 jam', risk: 'low', w: 7,
    desc: 'Perakitan lemari, rak, meja, dan pemasangan furnitur dinding.',
    inc: ['Perakitan sesuai manual', 'Pemasangan ke dinding bila perlu', 'Merapikan sisa kemasan'], tools: ['Obeng', 'Bor', 'Waterpass'],
    fields: [{ k: 'jumlah', l: 'Jumlah item', t: 'num', req: true, min: 1 }, { k: 'jenis', l: 'Jenis furnitur', t: 'text', req: true, ph: 'Contoh: lemari 3 pintu, rak TV' }, F.catatan] },
  { id: 't_plafon', cat: 'pertukangan', name: 'Perbaikan Atap / Plafon Bocor', model: 'inspection', price: 100000, unit: 'kunjungan', dur: '½–2 hari', risk: 'high', cert: 'ketinggian', w: 7,
    desc: 'Pengecekan dan perbaikan kebocoran atap. Pekerjaan di ketinggian hanya oleh mitra bersertifikat.',
    inc: ['Inspeksi titik bocor', 'Penawaran rinci & material', 'Perbaikan setelah disetujui'], tools: ['Tangga', 'Harness', 'Sealant'],
    fields: [{ k: 'atap', l: 'Jenis atap', t: 'sel', o: ['Seng', 'Genteng', 'Spandek', 'Dak beton'], req: true }, { k: 'gejala', l: 'Keterangan', t: 'area', req: true }, F.akses] },
  { id: 't_renovasi', cat: 'pertukangan', name: 'Renovasi Ringan', model: 'project', price: 1500000, unit: 'proyek', dur: '3 hari–4 minggu', risk: 'medium', w: 0, project: true, cancel: 'proyek',
    wNote: 'Garansi mengikuti ketentuan yang disepakati dalam rencana proyek.',
    desc: 'Renovasi bertahap: keramik, partisi, dapur, atau kamar mandi. Survei gratis, lalu rencana proyek dengan termin yang Anda setujui.',
    inc: ['Survei & pengukuran', 'Rencana proyek bertahap', 'Laporan progres berkala', 'Pembayaran per termin atau di akhir'], tools: ['Peralatan tukang lengkap'],
    fields: [{ k: 'lingkup', l: 'Lingkup pekerjaan', t: 'area', req: true, ph: 'Contoh: ganti keramik dapur 12 m² dan buat meja beton' }, { k: 'dimensi', l: 'Perkiraan ukuran', t: 'text', req: false, ph: 'Contoh: 3 × 4 m' }, { k: 'target', l: 'Target waktu', t: 'sel', o: ['Fleksibel', '< 1 minggu', '1–2 minggu', '> 2 minggu'], req: true }, { k: 'bahan', l: 'Material', t: 'sel', o: ['Disediakan mitra (dengan persetujuan)', 'Saya sediakan', 'Campuran'], req: true }] },

  // Taman
  { id: 'g_rumput', cat: 'taman', name: 'Potong Rumput', model: 'sqm', price: 2000, minQty: 50, qtyField: 'luas', unit: 'm²', dur: '1–3 jam', risk: 'low', w: 3,
    desc: 'Pemotongan rumput dan perapian tepi halaman, sisa potongan dibersihkan.',
    inc: ['Potong rumput', 'Rapikan tepi', 'Angkut sisa potongan'], tools: ['Mesin potong rumput'],
    fields: [F.luas('Luas halaman', 10), { k: 'tinggi', l: 'Tinggi rumput', t: 'sel', o: ['< 10 cm', '10–30 cm', '> 30 cm'], req: true }, F.akses, F.catatan] },
  { id: 'g_pohon', cat: 'taman', name: 'Pemangkasan Pohon', model: 'unit', price: 150000, qtyField: 'pohon', unit: 'pohon', dur: '1–4 jam', risk: 'high', cert: 'ketinggian', w: 3,
    desc: 'Pemangkasan dahan pohon. Pohon tinggi hanya ditangani mitra bersertifikat kerja ketinggian.',
    inc: ['Pemangkasan dahan', 'Pengamanan area', 'Pembersihan sisa'], tools: ['Gergaji mesin', 'Harness'],
    fields: [{ k: 'pohon', l: 'Jumlah pohon', t: 'num', req: true, min: 1 }, { k: 'tinggi', l: 'Perkiraan tinggi', t: 'sel', o: ['< 4 m', '4–8 m', '> 8 m'], req: true }, F.akses] },

  // Kendaraan
  { id: 'v_darurat', cat: 'kendaraan', name: 'Jumper Aki / Ganti Ban', model: 'visit', price: 75000, unit: 'kunjungan', dur: '30–60 menit', risk: 'low', w: 0, cancel: 'darurat', popular: true,
    desc: 'Bantuan darurat di jalan: aki soak, ban kempis, atau kendaraan mogok ringan.',
    inc: ['Jumper aki', 'Ganti ban serep', 'Cek ringan mesin'], tools: ['Kabel jumper', 'Dongkrak'],
    fields: [{ k: 'kendaraan', l: 'Jenis kendaraan', t: 'sel', o: ['Motor', 'Mobil'], req: true }, { k: 'gejala', l: 'Gejala', t: 'sel', o: ['Aki soak', 'Ban kempis', 'Mogok', 'Lainnya'], req: true }, { k: 'patokan', l: 'Patokan lokasi', t: 'text', req: true, ph: 'Contoh: depan SPBU El Tari' }] },
  { id: 'v_derek', cat: 'kendaraan', name: 'Derek Kendaraan', model: 'base_km', base: 200000, price: 8000, qtyField: 'km', unit: 'km', dur: '1–3 jam', risk: 'medium', cert: 'derek', w: 0, travelIncluded: true, cancel: 'darurat',
    desc: 'Derek mobil atau motor ke bengkel/tujuan. Tarif dasar + per km tujuan, sudah termasuk penjemputan.',
    inc: ['Penjemputan kendaraan', 'Pengamanan & pengikatan', 'Antar ke tujuan'], tools: ['Truk derek', 'Strap'],
    fields: [{ k: 'kendaraan', l: 'Jenis kendaraan', t: 'sel', o: ['Motor', 'Mobil kecil', 'SUV/MPV', 'Pikap'], req: true }, { k: 'km', l: 'Jarak ke tujuan', t: 'num', u: 'km', req: true, min: 1 }, { k: 'tujuan', l: 'Alamat tujuan', t: 'text', req: true }, { k: 'gejala', l: 'Kondisi kendaraan', t: 'text', req: false }] },
  { id: 'v_motor', cat: 'kendaraan', name: 'Servis Motor Panggilan', model: 'visit', price: 80000, unit: 'kunjungan', dur: '1–2 jam', risk: 'low', w: 3,
    desc: 'Servis ringan motor di rumah: ganti oli, setel rantai, cek rem. Suku cadang diajukan terpisah.',
    inc: ['Servis ringan', 'Cek rem & rantai', 'Laporan kondisi'], tools: ['Kunci set', 'Kompresor mini'],
    fields: [{ k: 'motor', l: 'Merek/tipe motor', t: 'text', req: true }, { k: 'keluhan', l: 'Keluhan', t: 'area', req: false }] },

  // Pindahan
  { id: 'm_pindah', cat: 'pindahan', name: 'Pindahan Rumah / Kos', model: 'custom', price: 350000, unit: 'proyek', dur: '½–1 hari', risk: 'medium', w: 0, travelIncluded: true, cancel: 'proyek',
    desc: 'Pindahan dengan kendaraan dan tenaga angkut. Mitra mengajukan penawaran rinci setelah melihat daftar barang.',
    inc: ['Survei/daftar barang', 'Penawaran rinci', 'Muat, antar, dan bongkar'], tools: ['Pikap/truk', 'Tali & terpal'],
    fields: [{ k: 'asal', l: 'Alamat asal', t: 'text', req: true }, { k: 'tujuan', l: 'Alamat tujuan', t: 'text', req: true }, { k: 'volume', l: 'Volume barang', t: 'sel', o: ['Kamar kos', '1–2 kamar', 'Rumah kecil', 'Rumah besar'], req: true }, { k: 'kendaraan', l: 'Kendaraan', t: 'sel', o: ['Pikap', 'Truk engkel', 'Belum tahu'], req: true }, { k: 'tenaga', l: 'Jumlah tenaga angkut', t: 'num', req: true, min: 1 }] },
  { id: 'm_angkut', cat: 'pindahan', name: 'Angkut Barang Pikap', model: 'base_km', base: 150000, price: 6000, qtyField: 'km', unit: 'km', dur: '1–3 jam', risk: 'low', w: 0, travelIncluded: true,
    desc: 'Angkut barang dengan pikap dalam kota. Tarif dasar + per km.',
    inc: ['Pikap + sopir', 'Bantu muat ringan'], tools: ['Pikap'],
    fields: [{ k: 'barang', l: 'Barang yang diangkut', t: 'text', req: true }, { k: 'km', l: 'Jarak tempuh', t: 'num', u: 'km', req: true, min: 1 }, { k: 'tujuan', l: 'Alamat tujuan', t: 'text', req: true }] },

  // Teknologi
  { id: 'it_laptop', cat: 'teknologi', name: 'Servis Komputer / Laptop', model: 'inspection', price: 75000, unit: 'kunjungan', dur: '1–3 jam', risk: 'low', w: 7,
    desc: 'Diagnosa dan perbaikan komputer, laptop, atau printer. Harga final setelah pemeriksaan.',
    inc: ['Diagnosa', 'Penawaran rinci', 'Perbaikan setelah disetujui'], tools: ['Toolkit elektronik'],
    fields: [{ k: 'perangkat', l: 'Perangkat', t: 'sel', o: ['Laptop', 'PC', 'Printer', 'Lainnya'], req: true }, { k: 'gejala', l: 'Keluhan', t: 'area', req: true }] },
  { id: 'it_wifi', cat: 'teknologi', name: 'Pasang & Setel WiFi', model: 'fixed', price: 150000, unit: 'paket', dur: '1–2 jam', risk: 'low', w: 7,
    desc: 'Pemasangan router/access point, pengaturan jaringan, dan keamanan WiFi.',
    inc: ['Penempatan router', 'Pengaturan SSID & sandi', 'Uji kecepatan'], tools: ['Laptop', 'Kabel LAN'],
    fields: [{ k: 'perangkat', l: 'Jumlah perangkat jaringan', t: 'num', req: true, min: 1 }, { k: 'isp', l: 'Penyedia internet', t: 'text', req: false }] },
  { id: 'it_cctv', cat: 'teknologi', name: 'Pasang CCTV', model: 'unit', price: 200000, qtyField: 'kamera', unit: 'kamera', dur: '2–5 jam', risk: 'medium', w: 7,
    desc: 'Instalasi kamera CCTV dan koneksi ke ponsel. Perangkat dibeli terpisah dengan persetujuan.',
    inc: ['Pemasangan kamera', 'Penarikan kabel', 'Koneksi aplikasi'], tools: ['Tangga', 'Bor'],
    fields: [{ k: 'kamera', l: 'Jumlah kamera', t: 'num', req: true, min: 1 }, { k: 'perangkat', l: 'Perangkat', t: 'sel', o: ['Sudah ada', 'Dibelikan mitra (perlu persetujuan)'], req: true }, F.akses] },

  // Hewan
  { id: 'h_grooming', cat: 'hewan', name: 'Grooming & Mandi Hewan', model: 'unit', price: 80000, qtyField: 'ekor', unit: 'ekor', dur: '1–2 jam', risk: 'low', w: 0,
    desc: 'Mandi, potong kuku, dan bersihkan telinga untuk anjing atau kucing di rumah Anda.',
    inc: ['Mandi & pengeringan', 'Potong kuku', 'Bersihkan telinga'], tools: ['Sampo hewan', 'Pengering'],
    fields: [{ k: 'ekor', l: 'Jumlah hewan', t: 'num', req: true, min: 1 }, { k: 'jenis', l: 'Jenis hewan', t: 'sel', o: ['Kucing', 'Anjing kecil', 'Anjing besar'], req: true }, { k: 'temperamen', l: 'Temperamen', t: 'sel', o: ['Jinak', 'Mudah takut', 'Agresif'], req: true }] },
  { id: 'h_jaga', cat: 'hewan', name: 'Jaga & Ajak Jalan Hewan', model: 'hour', price: 25000, minQty: 1, qtyField: 'jam', unit: 'jam', dur: 'sesuai jam', risk: 'low', w: 0,
    desc: 'Mitra menjaga atau mengajak jalan hewan peliharaan saat Anda sibuk.',
    inc: ['Jalan-jalan/bermain', 'Beri makan sesuai instruksi', 'Laporan foto'], tools: ['Tali'],
    fields: [{ k: 'jam', l: 'Durasi', t: 'num', u: 'jam', req: true, min: 1 }, { k: 'jenis', l: 'Jenis hewan', t: 'text', req: true }] },
  { id: 'h_vet', cat: 'hewan', name: 'Kunjungan Dokter Hewan', model: 'visit', price: 150000, unit: 'kunjungan', dur: '30–60 menit', risk: 'high', cert: 'drh', w: 0,
    desc: 'Pemeriksaan hewan di rumah. Khusus dokter hewan berizin praktik; obat ditagihkan terpisah dengan persetujuan.',
    inc: ['Pemeriksaan fisik', 'Rekomendasi tindakan'], tools: ['Peralatan medis veteriner'],
    fields: [{ k: 'jenis', l: 'Jenis hewan', t: 'text', req: true }, { k: 'keluhan', l: 'Keluhan', t: 'area', req: true }] },

  // Harian
  { id: 'd_belanja', cat: 'harian', name: 'Bantu Belanja & Antar', model: 'hour', price: 30000, minQty: 2, qtyField: 'jam', unit: 'jam', dur: 'sesuai jam', risk: 'low', w: 0,
    desc: 'Mitra membantu belanja kebutuhan dan mengantarkannya. Nilai belanja ditagihkan sesuai struk yang disetujui.',
    inc: ['Belanja sesuai daftar', 'Struk diunggah', 'Antar ke lokasi'], tools: [],
    fields: [{ k: 'jam', l: 'Perkiraan durasi', t: 'num', u: 'jam', req: true, min: 2 }, { k: 'daftar', l: 'Daftar belanja', t: 'area', req: true }] },
  { id: 'd_art', cat: 'harian', name: 'Asisten Rumah Tangga Harian', model: 'hour', price: 35000, minQty: 3, qtyField: 'jam', unit: 'jam', dur: 'sesuai jam', risk: 'low', w: 0, popular: true,
    desc: 'Bantuan pekerjaan rumah harian: setrika, cuci piring, merapikan rumah.',
    inc: ['Pekerjaan rumah sesuai daftar', 'Laporan selesai'], tools: [],
    fields: [{ k: 'jam', l: 'Durasi', t: 'num', u: 'jam', req: true, min: 3 }, { k: 'tugas', l: 'Daftar tugas', t: 'area', req: true }] },
  { id: 'd_lansia', cat: 'harian', name: 'Pendamping Lansia (Non-medis)', model: 'hour', price: 40000, minQty: 2, qtyField: 'jam', unit: 'jam', dur: 'sesuai jam', risk: 'medium', w: 0,
    desc: 'Pendampingan non-medis: menemani, membantu mobilitas ringan, dan mengingatkan jadwal.',
    inc: ['Pendampingan', 'Laporan aktivitas'], tools: [],
    fields: [{ k: 'jam', l: 'Durasi', t: 'num', u: 'jam', req: true, min: 2 }, { k: 'kebutuhan', l: 'Kebutuhan khusus', t: 'area', req: false }] },

  // Profesional
  { id: 'pr_foto', cat: 'profesional', name: 'Fotografer Acara', model: 'hour', price: 150000, minQty: 2, qtyField: 'jam', unit: 'jam', dur: 'sesuai jam', risk: 'low', w: 0,
    desc: 'Dokumentasi acara keluarga, kantor, atau produk. File diserahkan sesuai kesepakatan.',
    inc: ['Pemotretan', 'Seleksi & edit dasar', 'File digital'], tools: ['Kamera', 'Lighting'],
    fields: [{ k: 'jam', l: 'Durasi acara', t: 'num', u: 'jam', req: true, min: 2 }, { k: 'acara', l: 'Jenis acara', t: 'text', req: true }] },
  { id: 'pr_desain', cat: 'profesional', name: 'Desain Grafis', model: 'fixed', price: 300000, unit: 'paket', dur: '2–5 hari', risk: 'low', w: 0,
    desc: 'Desain logo, spanduk, menu, atau materi promosi dengan dua kali revisi.',
    inc: ['Brief & konsep', '2× revisi', 'File siap cetak'], tools: [],
    fields: [{ k: 'jenis', l: 'Jenis desain', t: 'sel', o: ['Logo', 'Spanduk/baliho', 'Menu', 'Konten media sosial'], req: true }, { k: 'brief', l: 'Brief singkat', t: 'area', req: true }] },
  { id: 'pr_les', cat: 'profesional', name: 'Les Privat', model: 'hour', price: 75000, minQty: 1, qtyField: 'jam', unit: 'jam', dur: 'sesuai jam', risk: 'low', w: 0,
    desc: 'Les privat di rumah untuk mata pelajaran sekolah, bahasa, atau musik.',
    inc: ['Sesi belajar', 'Catatan perkembangan'], tools: [],
    fields: [{ k: 'jam', l: 'Durasi', t: 'num', u: 'jam', req: true, min: 1 }, { k: 'mapel', l: 'Mata pelajaran', t: 'text', req: true }, { k: 'jenjang', l: 'Jenjang', t: 'sel', o: ['SD', 'SMP', 'SMA', 'Umum'], req: true }] },

  // Komersial
  { id: 'b_kontrak', cat: 'komersial', name: 'Kontrak Kebersihan Bulanan', model: 'project', price: 2500000, unit: 'proyek', dur: '1 bulan', risk: 'low', w: 0, project: true, cancel: 'proyek',
    desc: 'Layanan kebersihan terjadwal untuk kantor, toko, atau sekolah dengan termin mingguan.',
    inc: ['Survei lokasi', 'Jadwal kunjungan', 'Laporan per kunjungan', 'Tagihan per termin'], tools: ['Peralatan kebersihan'],
    fields: [{ k: 'lingkup', l: 'Lingkup & frekuensi', t: 'area', req: true, ph: 'Contoh: 3× seminggu, 2 lantai, 4 toilet' }, { k: 'luas', l: 'Luas area', t: 'num', u: 'm²', req: true, min: 1 }] },
  { id: 'b_ac_gedung', cat: 'komersial', name: 'Perawatan AC Gedung', model: 'project', price: 1200000, unit: 'proyek', dur: '1–5 hari', risk: 'medium', w: 7, project: true, cancel: 'proyek',
    desc: 'Perawatan berkala banyak unit AC untuk gedung, hotel, atau kantor.',
    inc: ['Survei unit', 'Rencana kerja bertahap', 'Laporan per unit'], tools: ['Jet cleaner', 'Manifold'],
    fields: [{ k: 'unit', l: 'Jumlah unit AC', t: 'num', req: true, min: 1 }, { k: 'lingkup', l: 'Keterangan', t: 'area', req: false }] },
  { id: 'b_event', cat: 'komersial', name: 'Kru Event & Setup Booth', model: 'hour', price: 50000, minQty: 4, qtyField: 'jam', unit: 'jam', dur: 'sesuai jam', risk: 'low', w: 0,
    desc: 'Tenaga bantu pemasangan booth, panggung kecil, dan bongkar muat acara.',
    inc: ['Setup', 'Bongkar', 'Laporan'], tools: [],
    fields: [{ k: 'jam', l: 'Durasi', t: 'num', u: 'jam', req: true, min: 4 }, { k: 'acara', l: 'Nama acara', t: 'text', req: true }] }
];

const CERTS = {
  listrik: 'Sertifikat kompetensi kelistrikan',
  ketinggian: 'Sertifikat kerja di ketinggian',
  derek: 'Izin & armada derek',
  drh: 'Dokter hewan berizin praktik'
};

const CANCEL_POLICIES = {
  standar: 'Gratis sebelum mitra berangkat. Setelah mitra berangkat dikenakan biaya pembatalan sebesar biaya perjalanan (minimal Rp10.000). Setelah pekerjaan dimulai, pembatalan hanya melalui pusat bantuan.',
  darurat: 'Gratis sebelum mitra berangkat. Setelah mitra berangkat dikenakan biaya pembatalan Rp25.000 karena armada sudah dikerahkan.',
  proyek: 'Gratis sebelum rencana proyek disetujui. Setelah disetujui, pembatalan mengikuti termin yang sudah berjalan dan diproses melalui pusat bantuan.'
};

function svcById(id, cfg) {
  const s = SERVICES.find(x => x.id === id);
  if (!s) return null;
  const o = cfg && cfg.services && cfg.services[id];
  if (!o) return s;
  return Object.assign({}, s, o.price != null ? { price: o.price } : {}, o.active != null ? { inactive: !o.active } : {});
}
function catById(id) { return CATEGORIES.find(c => c.id === id) || null; }

const QUOTE_MODELS = ['inspection', 'project', 'custom'];
const MODEL_LABEL = {
  fixed: 'Harga tetap', unit: 'Per unit', sqm: 'Per m²', point: 'Per titik', visit: 'Per kunjungan',
  hour: 'Per jam', project: 'Per proyek', inspection: 'Berdasarkan inspeksi', custom: 'Penawaran khusus', base_km: 'Tarif dasar + per km'
};

function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

/** Estimasi harga layanan. Mengembalikan baris-baris rincian dan penanda estimasi. */
function estimate(svc, fields, km, cfg) {
  fields = fields || {};
  const lines = [];
  let qty = 1;
  const m = svc.model;
  if (['unit', 'sqm', 'point', 'hour'].includes(m)) {
    const raw = num(fields[svc.qtyField]);
    qty = Math.max(raw || 0, svc.minQty || 1);
    const minNote = raw < (svc.minQty || 1) ? ` (min. ${svc.minQty} ${svc.unit})` : '';
    lines.push({ type: 'labor', name: `${svc.name} · ${qty} ${svc.unit}${minNote}`, qty, unitPrice: svc.price, amount: svc.price * qty });
  } else if (m === 'base_km') {
    qty = Math.max(num(fields[svc.qtyField]), 1);
    lines.push({ type: 'labor', name: `${svc.name} · tarif dasar`, qty: 1, unitPrice: svc.base, amount: svc.base });
    lines.push({ type: 'labor', name: `Jarak tempuh · ${qty} km`, qty, unitPrice: svc.price, amount: svc.price * qty });
  } else if (m === 'inspection') {
    lines.push({ type: 'labor', name: 'Biaya pemeriksaan & diagnosa', qty: 1, unitPrice: svc.price, amount: svc.price });
  } else {
    // fixed, visit, project, custom
    lines.push({ type: 'labor', name: m === 'project' || m === 'custom' ? `${svc.name} · estimasi awal (mulai dari)` : svc.name, qty: 1, unitPrice: svc.price, amount: svc.price });
  }
  let travel = { fee: 0, custom: false };
  if (!svc.travelIncluded) {
    travel = travelFee(km, cfg);
    if (!travel.custom && !travel.unknown) lines.push({ type: 'travel', name: `Biaya perjalanan (±${km} km)`, qty: 1, unitPrice: travel.fee, amount: travel.fee });
  }
  const needsQuote = QUOTE_MODELS.includes(m) || travel.custom;
  const isEstimate = needsQuote;
  const total = lines.reduce((a, l) => a + l.amount, 0);
  return { lines, total, qty, travelFee: travel.fee, travelCustom: !!travel.custom, needsQuote, isEstimate, model: m };
}

/** Validasi field formulir layanan. */
function validateFields(svc, fields) {
  const errs = {};
  for (const f of svc.fields) {
    const v = fields ? fields[f.k] : undefined;
    if (f.req && (v == null || String(v).trim() === '')) { errs[f.k] = 'Wajib diisi'; continue; }
    if (f.t === 'num' && v !== '' && v != null) {
      const n = Number(v);
      if (!isFinite(n)) errs[f.k] = 'Harus berupa angka';
      else if (f.min != null && n < f.min) errs[f.k] = `Minimal ${f.min}`;
      else if (n > 100000) errs[f.k] = 'Angka terlalu besar';
    }
  }
  return errs;
}

/* ---------- Status pesanan & transisi ---------- */
const BOOKING_STATUS = {
  menunggu_mitra:      { label: 'Mencari Mitra', tone: 'info' },
  ditugaskan:          { label: 'Mitra Ditugaskan', tone: 'primary' },
  dalam_perjalanan:    { label: 'Dalam Perjalanan', tone: 'primary' },
  tiba:                { label: 'Mitra Tiba', tone: 'primary' },
  dikerjakan:          { label: 'Sedang Dikerjakan', tone: 'primary' },
  menunggu_konfirmasi: { label: 'Menunggu Konfirmasi', tone: 'warn' },
  selesai:             { label: 'Selesai', tone: 'done' },
  dibatalkan:          { label: 'Dibatalkan', tone: 'muted' }
};
const TRANSITIONS = {
  menunggu_mitra:      { ditugaskan: ['worker', 'ops'], dibatalkan: ['customer', 'ops'] },
  ditugaskan:          { dalam_perjalanan: ['worker'], menunggu_mitra: ['worker', 'ops'], dibatalkan: ['customer', 'ops'] },
  dalam_perjalanan:    { tiba: ['worker'], dibatalkan: ['customer', 'ops'] },
  tiba:                { dikerjakan: ['worker'], menunggu_konfirmasi: ['worker'], dibatalkan: ['worker', 'customer', 'ops'] },
  dikerjakan:          { menunggu_konfirmasi: ['worker'], dibatalkan: ['ops'] },
  menunggu_konfirmasi: { selesai: ['customer', 'ops'], dikerjakan: ['customer', 'ops'] },
  selesai:             {},
  dibatalkan:          {}
};
const ACTIVE_STATUSES = ['ditugaskan', 'dalam_perjalanan', 'tiba', 'dikerjakan', 'menunggu_konfirmasi'];

function quotesOf(b, kind, status) {
  return Object.values(b.quotes || {}).filter(q => (!kind || q.kind === kind) && (!status || q.status === status)).sort((a, c) => a.at - c.at);
}
function approvedBaseQuote(b) {
  // penawaran yang menggantikan estimasi awal: revisi (inspeksi) atau rencana proyek
  const list = quotesOf(b, null, 'disetujui').filter(q => q.kind === 'revisi' || q.kind === 'rencana');
  return list.length ? list[list.length - 1] : null;
}

/**
 * Validasi transisi status. Mengembalikan null bila sah, atau pesan alasan bila ditolak.
 */
function checkTransition(b, to, role, ctx) {
  ctx = ctx || {};
  const from = b.status;
  const allowed = (TRANSITIONS[from] || {})[to];
  if (!allowed) return `Perubahan status dari "${(BOOKING_STATUS[from] || {}).label || from}" ke "${(BOOKING_STATUS[to] || {}).label || to}" tidak diizinkan.`;
  if (!allowed.includes(role)) return 'Peran Anda tidak berwenang melakukan perubahan ini.';
  if (to === 'dikerjakan' && from === 'tiba' && b.pricing && b.pricing.needsQuote && !approvedBaseQuote(b))
    return 'Pekerjaan berbasis inspeksi/penawaran hanya bisa dimulai setelah pelanggan menyetujui penawaran.';
  if (to === 'menunggu_konfirmasi' && from === 'tiba') {
    const rejected = quotesOf(b, 'revisi', 'ditolak').length > 0;
    if (!(b.pricing && b.pricing.model === 'inspection' && rejected && !approvedBaseQuote(b)))
      return 'Langsung ke konfirmasi hanya untuk layanan inspeksi yang penawarannya ditolak (ditagih biaya pemeriksaan saja).';
  }
  if (to === 'menunggu_konfirmasi' && from === 'dikerjakan') {
    const pendingQ = quotesOf(b, null, 'menunggu').length;
    if (pendingQ) return 'Masih ada penawaran yang menunggu keputusan pelanggan.';
    const ms = Object.values(b.milestones || {});
    if (ms.length && ms.some(m => m.status !== 'diterima')) return 'Semua termin proyek harus diterima pelanggan sebelum laporan akhir.';
  }
  if (to === 'dibatalkan' && role === 'worker' && from === 'tiba') {
    const rej = quotesOf(b, null, 'ditolak').some(q => q.kind === 'revisi' || q.kind === 'rencana');
    if (!rej) return 'Mitra hanya dapat membatalkan di lokasi bila penawaran ditolak pelanggan.';
  }
  if (to === 'dibatalkan' && role === 'customer' && from === 'tiba' && !ctx.quoteRejected) {
    return 'Mitra sudah tiba. Untuk membatalkan, tolak penawaran atau hubungi pusat bantuan.';
  }
  const hasReason = String(ctx.reason || '').trim().length > 0;
  if ((to === 'dibatalkan' || to === 'menunggu_mitra') && !hasReason) return 'Alasan wajib diisi.';
  if (to === 'dikerjakan' && from === 'menunggu_konfirmasi' && !hasReason) return 'Jelaskan bagian yang perlu diperbaiki.';
  return null;
}

/** Biaya pembatalan sesuai kebijakan & status. */
function cancelFee(b, svc, cfg) {
  cfg = cfg || DEFAULT_CONFIG;
  const pol = (svc && svc.cancel) || 'standar';
  if (['menunggu_mitra', 'ditugaskan'].includes(b.status)) return 0;
  if (b.status === 'dalam_perjalanan') {
    if (pol === 'darurat') return 25000;
    if (pol === 'proyek') return 0;
    return Math.max((b.pricing && b.pricing.travelFee) || 0, cfg.cancelFeeMin);
  }
  return 0; // tiba: pembatalan karena penawaran ditolak, tanpa biaya (biaya pemeriksaan ditagih lewat penyelesaian)
}

/* ---------- Invoice & komisi ---------- */
const COMMISSIONABLE = ['labor', 'additional'];
const LINE_TYPE_LABEL = { labor: 'Jasa', material: 'Material', travel: 'Perjalanan', procurement: 'Pengadaan', delivery: 'Pengiriman', additional: 'Pekerjaan tambahan', fee: 'Biaya' };

function quoteItems(q) { return Object.values(q.items || {}).sort((a, c) => (a.n || 0) - (c.n || 0)); }
function itemAmount(it) { return Math.round(num(it.qty) * num(it.unitPrice)); }
function quoteTotal(q) {
  if (q.kind === 'rencana') return Object.values(q.milestones || {}).reduce((a, m) => a + num(m.value), 0) + quoteItems(q).reduce((a, it) => a + itemAmount(it), 0);
  return quoteItems(q).reduce((a, it) => a + itemAmount(it), 0);
}

/** Baris tagihan akhir untuk pesanan (non-termin). */
function finalInvoiceLines(b) {
  const lines = [];
  const base = approvedBaseQuote(b);
  const planB = b.paymentPlan === 'B' && Object.keys(b.milestones || {}).length > 0;
  if (base && base.kind === 'rencana') {
    if (!planB) {
      for (const m of Object.values(b.milestones || {}).sort((a, c) => a.n - c.n))
        lines.push({ type: 'labor', name: `Termin ${m.n}: ${m.title}`, qty: 1, unitPrice: num(m.value), amount: num(m.value) });
    }
    for (const it of quoteItems(base)) lines.push({ type: it.type, name: it.name, qty: num(it.qty), unitPrice: num(it.unitPrice), amount: itemAmount(it) });
  } else if (base) {
    for (const it of quoteItems(base)) lines.push({ type: it.type, name: it.name, qty: num(it.qty), unitPrice: num(it.unitPrice), amount: itemAmount(it) });
  } else {
    for (const l of (b.pricing && b.pricing.lines) || []) if (l.type !== 'travel') lines.push(Object.assign({}, l));
  }
  // biaya perjalanan yang dikunci saat penugasan
  if (b.pricing && b.pricing.travelFee > 0 && !(base && quoteItems(base).some(i => i.type === 'travel')))
    lines.push({ type: 'travel', name: 'Biaya perjalanan', qty: 1, unitPrice: b.pricing.travelFee, amount: b.pricing.travelFee });
  // tambahan & material yang disetujui
  for (const q of quotesOf(b, null, 'disetujui').filter(q => q.kind === 'tambahan' || q.kind === 'material'))
    for (const it of quoteItems(q)) lines.push({ type: it.type, name: it.name + (q.kind === 'material' ? ' (material disetujui)' : ''), qty: num(it.qty), unitPrice: num(it.unitPrice), amount: itemAmount(it) });
  return lines;
}

function invoiceTotals(lines, cfg) {
  const pct = (cfg && cfg.commissionPct != null) ? cfg.commissionPct : DEFAULT_CONFIG.commissionPct;
  const total = lines.reduce((a, l) => a + num(l.amount), 0);
  const eligible = lines.filter(l => COMMISSIONABLE.includes(l.type)).reduce((a, l) => a + num(l.amount), 0);
  const commission = Math.round(eligible * pct / 100);
  return { total, eligible, commission, workerNet: total - commission, pct };
}

/* ---------- Ledger (append-only) ---------- */
function ledgerSum(entries, filter) {
  let s = 0;
  for (const e of entries) if (filter(e)) s += num(e.amount);
  return s;
}
function workerBalances(entries, pid) {
  const mine = entries.filter(e => e.workerPid === pid);
  const closed = new Set(mine.filter(e => e.kind === 'payout_paid' || e.kind === 'payout_reversed').map(e => e.ref));
  const pending = mine.filter(e => e.kind === 'payout_request' && !closed.has(e.id));
  return {
    deposit: ledgerSum(mine, e => e.account === 'worker_deposit'),
    earnings: ledgerSum(mine, e => e.account === 'worker_earnings'),
    payoutPending: pending.reduce((a, e) => a - num(e.amount), 0),
    pendingRequests: pending
  };
}

/** Entri ledger untuk pembayaran yang terverifikasi (id deterministik = idempoten). */
function paymentLedgerEntries(inv, cfg, at) {
  const t = invoiceTotals(inv.lines || [], cfg);
  const base = { invoiceId: inv.id, bookingId: inv.bookingId, workerPid: inv.workerPid || null, at, simulated: !!inv.simulated };
  return [
    Object.assign({ id: 'pay_' + inv.id, account: 'payment_received', kind: 'payment', amount: t.total, note: 'Pembayaran pelanggan terverifikasi' }, base),
    Object.assign({ id: 'comm_' + inv.id, account: 'platform_commission', kind: 'commission', amount: t.commission, note: `Komisi ${t.pct}% dari nilai jasa ${t.eligible}` }, base),
    Object.assign({ id: 'earn_' + inv.id, account: 'worker_earnings', kind: 'earning', amount: t.workerNet, note: 'Pendapatan mitra (total − komisi)' }, base)
  ];
}

/* ---------- Garansi ---------- */
function warrantyInfo(svc, completedAt, now) {
  if (!svc || !svc.w) return { covered: false, days: 0, text: svc && svc.wNote ? svc.wNote : 'Tidak ada garansi standar; lihat ketentuan pesanan.' };
  const end = completedAt + svc.w * 86400000;
  return { covered: now <= end, days: svc.w, end, text: svc.wNote || `Garansi ${svc.w === 1 ? '24 jam' : svc.w + ' hari'} untuk lingkup pekerjaan yang disepakati, dihitung sejak pelanggan mengonfirmasi selesai.` };
}

/* ---------- Pencocokan mitra ---------- */
function eligibility(worker, booking, ctx) {
  // ctx: {svc, cfg, deposit, activeJobs, region}
  const reasons = [];
  const svc = ctx.svc, cfg = ctx.cfg || DEFAULT_CONFIG;
  if (worker.verif !== 'terverifikasi') reasons.push('Belum terverifikasi');
  if (!worker.online) reasons.push('Sedang offline');
  if (!(worker.skills || []).includes(svc.cat)) reasons.push('Keahlian tidak sesuai');
  if (svc.cert && !(worker.certs || {})[svc.cert]) reasons.push('Belum memiliki ' + (CERTS[svc.cert] || 'sertifikasi'));
  if ((ctx.deposit || 0) < cfg.minDeposit) reasons.push('Deposit di bawah minimum');
  if ((ctx.activeJobs || 0) >= cfg.maxActiveJobs) reasons.push('Kapasitas pekerjaan penuh');
  const km = areaDistanceKm(worker.area, booking.address && booking.address.area, ctx.region);
  if (km == null) reasons.push('Wilayah tidak diketahui');
  else if (km > cfg.maxMatchKm && !(booking.pricing && booking.pricing.travelCustom)) reasons.push('Di luar jangkauan');
  if ((booking.declined || {})[worker.id]) reasons.push('Sudah menolak pesanan ini');
  if (Array.isArray(worker.areas) && worker.areas.length && booking.address && booking.address.area && !worker.areas.includes(booking.address.area) && booking.address.area !== worker.area) reasons.push('Di luar area layanan');
  const av = worker.avail;
  if (av && Array.isArray(av.days) && booking.schedule && booking.schedule.date) {
    const dow = new Date(booking.schedule.date + 'T00:00:00').getDay();
    const tm = booking.schedule.time;
    if (!av.days.includes(dow)) reasons.push('Di luar hari kerja');
    else if (tm && tm !== 'Secepatnya' && av.start && av.end && (tm < av.start || tm > av.end)) reasons.push('Di luar jam kerja');
  }
  return { ok: reasons.length === 0, reasons, km };
}

/** Biaya perjalanan yang dikunci saat mitra menerima: tidak pernah melebihi yang ditunjukkan ke pelanggan. */
function lockedTravelFee(booking, km, cfg) {
  if (booking.pricing && booking.pricing.travelIncluded) return 0;
  const t = travelFee(km, cfg);
  const shown = booking.pricing ? num(booking.pricing.travelFee) : 0;
  if (booking.pricing && booking.pricing.travelCustom) return 0; // ditentukan lewat penawaran
  return Math.min(t.custom ? shown : t.fee, shown);
}

/* ---------- Rating ---------- */
function avgRating(list) {
  const v = list.filter(f => f && f.overall);
  if (!v.length) return { avg: 0, count: 0 };
  return { avg: Math.round(v.reduce((a, f) => a + f.overall, 0) / v.length * 10) / 10, count: v.length };
}

/* ---------- Ulasan: penyaringan konten dasar ---------- */
const BLOCKED_WORDS = ['anjing lu', 'bangsat', 'bajingan', 'kontol', 'goblok', 'tolol', 'babi lu', 'bunuh'];
function contentFlags(text) {
  const t = String(text || '').toLowerCase();
  const flags = [];
  if (BLOCKED_WORDS.some(w => t.includes(w))) flags.push('kata kasar/ancaman');
  if (/(\+?62|0)8\d{7,11}/.test(t.replace(/[\s-]/g, ''))) flags.push('nomor telepon');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) flags.push('alamat email');
  return flags;
}

/* ---------- Lokasi & pelacakan ---------- */
const CITY_SPEED_KMH = 25;
/** Membaca titik dari teks/tautan Google Maps. Hasil: {lat,lng} | {link} | {lat,lng,link} | null */
function parseGeo(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const N = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const SEP = '(?:,|%2C)(?:\\s|%20|\\+)*';
  const pats = [
    new RegExp('!3d(-?\\d+\\.\\d+)!4d(-?\\d+\\.\\d+)'),
    new RegExp('@' + N + ',' + N),
    new RegExp('[?&](?:q|query|ll|destination|daddr|center)=' + N + SEP + N),
    new RegExp('^' + N + '\\s*,\\s*' + N + '$')
  ];
  let lat = null, lng = null;
  for (const p of pats) { const m = s.match(p); if (m) { lat = Number(m[1]); lng = Number(m[2]); break; } }
  const isLink = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(s);
  const ok = lat != null && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (ok && isLink) return { lat, lng, link: s };
  if (ok) return { lat, lng };
  if (isLink) return { link: s };
  return null;
}
function areaCentroid(area, region) { const r = REGIONS[region || 'kupang']; const a = r && r.areas[area]; return a ? { lat: a.lat, lng: a.lng } : null; }
function geoDistanceKm(a, b) { if (!a || !b || a.lat == null || b.lat == null) return null; return Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10; }
function etaMinutes(km) { return km == null ? null : Math.max(1, Math.round(km / CITY_SPEED_KMH * 60 + 2)); }
function nearKupang(p) { return p && p.lat != null && haversineKm(p, { lat: -10.17, lng: 123.6 }) < 80; }
/** Rute simulasi bergaya jalan kota (segmen siku) dibagi rata menjadi n titik. */
function simRoute(a, b, n) {
  const w = [a, { lat: a.lat + (b.lat - a.lat) * 0.35, lng: a.lng }, { lat: a.lat + (b.lat - a.lat) * 0.35, lng: a.lng + (b.lng - a.lng) * 0.7 }, { lat: b.lat, lng: a.lng + (b.lng - a.lng) * 0.7 }, b];
  const seg = []; let tot = 0;
  for (let i = 1; i < w.length; i++) { const d = haversineKm(w[i - 1], w[i]); seg.push(d); tot += d; }
  const out = [];
  for (let k = 0; k < n; k++) {
    let t = tot * k / (n - 1), i = 0;
    while (i < seg.length - 1 && t > seg[i]) { t -= seg[i]; i++; }
    const f = seg[i] ? Math.min(1, t / seg[i]) : 1;
    out.push({ lat: w[i].lat + (w[i + 1].lat - w[i].lat) * f, lng: w[i].lng + (w[i + 1].lng - w[i].lng) * f });
  }
  return out;
}

/* ---------- Temuan umum per kategori (laporan inspeksi) ---------- */
const FINDINGS = {
  kebersihan: ['Noda membandel', 'Kerak kamar mandi', 'Jamur di dinding', 'Area lebih luas dari pesanan'],
  ac: ['Filter kotor', 'Evaporator kotor', 'Freon kurang', 'Saluran pembuangan tersumbat', 'Kapasitor lemah', 'Pipa bocor', 'Unit outdoor kotor'],
  listrik: ['Kabel terkelupas', 'MCB lemah atau rusak', 'Beban listrik berlebih', 'Pipa retak', 'Sambungan bocor', 'Saluran tersumbat'],
  pertukangan: ['Dinding retak', 'Permukaan lembap', 'Perlu material tambahan', 'Struktur rapuh'],
  taman: ['Rumput sangat tinggi', 'Dahan rawan patah', 'Akses lokasi sulit'],
  kendaraan: ['Aki soak', 'Ban bocor', 'Kerusakan mesin', 'Perlu derek'],
  pindahan: ['Barang lebih banyak dari daftar', 'Akses tangga sempit', 'Perlu kendaraan lebih besar'],
  teknologi: ['Kerusakan perangkat keras', 'Masalah perangkat lunak', 'Kabel atau konektor rusak', 'Sinyal lemah'],
  hewan: ['Masalah kulit atau bulu', 'Hewan stres', 'Perlu pemeriksaan dokter hewan'],
  harian: ['Ada tugas tambahan', 'Waktu tidak cukup'],
  profesional: ['Kebutuhan berubah', 'Bahan dari klien kurang'],
  komersial: ['Area lebih luas', 'Perlu peralatan tambahan']
};
const FINDINGS_COMMON = ['Kondisi sesuai pesanan', 'Tidak ada temuan khusus'];
function findingsFor(cat) { return (FINDINGS[cat] || []).concat(FINDINGS_COMMON); }
const ROLE_TITLE = { kebersihan: 'Petugas Kebersihan', ac: 'Teknisi AC', listrik: 'Teknisi Listrik & Ledeng', pertukangan: 'Tukang', taman: 'Perawat Taman', kendaraan: 'Mekanik', pindahan: 'Kru Angkut', teknologi: 'Teknisi IT', hewan: 'Perawat Hewan', harian: 'Asisten Harian', profesional: 'Tenaga Profesional', komersial: 'Kru Layanan Bisnis' };
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const api = {
  parseGeo, areaCentroid, geoDistanceKm, etaMinutes, nearKupang, simRoute, haversineKm,
  FINDINGS, findingsFor, ROLE_TITLE, DAY_NAMES,
  DEFAULT_CONFIG, REGIONS, CATEGORIES, SERVICES, CERTS, CANCEL_POLICIES, MODEL_LABEL, BOOKING_STATUS, TRANSITIONS,
  ACTIVE_STATUSES, QUOTE_MODELS, LINE_TYPE_LABEL, COMMISSIONABLE,
  areaDistanceKm, travelFee, svcById, catById, estimate, validateFields, checkTransition, cancelFee,
  quotesOf, approvedBaseQuote, quoteItems, itemAmount, quoteTotal, finalInvoiceLines, invoiceTotals,
  ledgerSum, workerBalances, paymentLedgerEntries, warrantyInfo, eligibility, lockedTravelFee, avgRating, contentFlags, num
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.BL = api;
})(typeof window !== 'undefined' ? window : globalThis);
/* Foto awal dipotong dari mockup pemilik; dapat diganti admin lewat Katalog & Promo. */
const IMG = {
  heroAc: 'data:image/jpeg;base64,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',
  bannerWoman: 'data:image/jpeg;base64,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',
  rumah: 'data:image/jpeg;base64,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'
};
/* =========================================================
   BERESIN — inti aplikasi: penyimpanan, identitas, operasi domain
   ========================================================= */
'use strict';
const COLS = ['profiles', 'bookings', 'reports', 'invoices', 'ledger', 'notifications', 'feedback', 'tickets', 'chats', 'audit', 'config', 'tracks'];
const D = {}; COLS.forEach(c => { D[c] = {}; });
const R = { mode: 'loading', db: null, assets: null, downloads: null, user: null, ready: {}, readonly: false, error: null };
const ME = { uid: null, isOwner: false, canWrite: true, name: '' };
const LOCAL_KEY = 'beresin.local.v1';

/* ---------- util ---------- */
const $ = (sel, el) => (el || document).querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const now = () => Date.now();
function rid(p) { return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
function deepMerge(t, s) { const out = Object.assign({}, t); for (const k of Object.keys(s)) { out[k] = isObj(s[k]) && isObj(t[k]) ? deepMerge(t[k], s[k]) : s[k]; } return out; }
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtDate(ts, withTime) { if (!ts) return '–'; const d = new Date(ts); const s = `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; return withTime === false ? s : `${s}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function fmtTime(ts) { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function ago(ts) {
  const s = Math.max(0, (now() - ts) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit yang lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam yang lalu';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' hari yang lalu';
  return fmtDate(ts, false);
}
const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
/** "Hari ini · 10:00", "Besok · 09:00", "Sen, 20 Okt · 09:00" */
function fmtSched(sc) {
  if (!sc || !sc.date) return '–';
  const d = new Date(sc.date + 'T00:00:00');
  const diff = Math.round((d.getTime() - new Date(todayISO(0) + 'T00:00:00').getTime()) / 86400000);
  const day = diff === 0 ? 'Hari ini' : diff === 1 ? 'Besok' : diff === -1 ? 'Kemarin' : `${HARI_PENDEK[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
  return `${day} · ${sc.time || ''}`;
}
function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'; }
function todayISO(offsetDays) { const d = new Date(Date.now() + (offsetDays || 0) * 86400000); return d.toISOString().slice(0, 10); }
function maskPhone(p) { p = String(p || ''); return p.length > 6 ? p.slice(0, 4) + '•••' + p.slice(-3) : p; }

/* ---------- penyimpanan ---------- */
const writeQueue = {};
function enqueue(path, fn) { const prev = writeQueue[path] || Promise.resolve(); const p = prev.catch(() => {}).then(fn); writeQueue[path] = p; return p; }
let localSaveT = null;
function localPersist() { clearTimeout(localSaveT); localSaveT = setTimeout(() => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(D)); } catch (e) { /* penyimpanan peramban penuh/terblokir */ } }, 150); }
const PRIV = {}; // dokumen privat (data/users/...) untuk mode lokal

function writeError(e) {
  const code = e && e.code;
  if (code === 'invalid_argument' || code === 'permission-denied') { R.readonly = true; toast('Akun Anda tidak memiliki izin menulis data di aplikasi ini.', true); }
  else if (code === 'quota_exceeded') toast('Kapasitas database penuh. Hubungi admin untuk membersihkan data lama.', true);
  else if (code === 'resource_exhausted') toast('Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.', true);
  else toast('Gagal menyimpan. Periksa koneksi lalu coba lagi.', true);
  scheduleRender();
}

const shared = () => R.mode === 'remote' || R.mode === 'firebase';
const Store = {
  list(col) { return Object.values(D[col] || {}); },
  get(col, id) { return (D[col] || {})[id]; },
  async set(col, id, data) {
    const body = clone(Object.assign({}, data, { id }));
    if (shared()) {
      try { await enqueue(col + '/' + id, () => R.db.doc(col + '/' + id).set(body)); }
      catch (e) { if (e && e.code === 'unavailable') { await new Promise(r => setTimeout(r, 600 + Math.random() * 600)); return R.db.doc(col + '/' + id).set(body).catch(err => { writeError(err); throw err; }); } writeError(e); throw e; }
    } else { D[col][id] = body; localPersist(); scheduleRender(); }
  },
  async patch(col, id, data) {
    const body = clone(data);
    if (shared()) {
      try { await enqueue(col + '/' + id, () => R.db.doc(col + '/' + id).update(body)); }
      catch (e) { writeError(e); throw e; }
    } else { if (!D[col][id]) throw new Error('Dokumen tidak ditemukan'); D[col][id] = deepMerge(D[col][id], body); localPersist(); scheduleRender(); }
  },
  /** Klaim satu-penulis (lease) untuk dokumen; true bila didapat. */
  async claim(col, id, holder) {
    if (!shared()) return true;
    try { const r = await R.db.doc(col + '/' + id).acquire({ holder, ttlMs: 8000 }); return !!r.acquired; }
    catch (e) { return false; }
  },
  async fresh(col, id) {
    if (!shared()) return D[col][id];
    const s = await R.db.doc(col + '/' + id).get();
    return s.exists ? Object.assign({ id: s.id }, s.data()) : null;
  },
  async privGet(uid, name) {
    const path = `data/users/${uid}/${name}`;
    if (!shared()) return PRIV[path] || null;
    try { const s = await R.db.doc(path).get(); return s.exists ? s.data() : null; } catch (e) { return null; }
  },
  async privSet(name, data) {
    const path = `data/users/${ME.uid}/${name}`;
    if (!shared()) { PRIV[path] = clone(data); try { localStorage.setItem(LOCAL_KEY + '.priv', JSON.stringify(PRIV)); } catch (e) {} return; }
    await enqueue(path, () => R.db.doc(path).set(clone(data)));
  }
};

async function initStore() {
  if (window.BERESIN_CONFIG && window.BERESIN_CONFIG.firebase && window.firebase) return initFirebase();
  const use = n => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(n).catch(() => null) : Promise.resolve(null);
  const [db, user, assets, downloads] = await Promise.all([use('db'), use('user'), use('assets'), use('downloads')]);
  R.user = user; R.assets = assets; R.downloads = downloads;
  let devId = null;
  try { devId = localStorage.getItem('beresin.device'); if (!devId) { devId = 'dev-' + Math.random().toString(36).slice(2, 12); localStorage.setItem('beresin.device', devId); } } catch (e) { devId = 'dev-' + Math.random().toString(36).slice(2, 12); }
  if (user) {
    const me = await user.me();
    ME.uid = me.id || devId; ME.isOwner = !!me.isOwner; ME.name = me.name || '';
    const cw = await user.can('data.write');
    ME.canWrite = cw !== false;
  }
  if (db) {
    R.db = db; R.mode = 'remote';
    if (!user) { ME.uid = devId; }
    for (const c of COLS) {
      let q = db.collection(c);
      if (c === 'notifications') q = q.orderBy('at', 'desc').limit(800);
      if (c === 'audit') q = q.orderBy('at', 'desc').limit(400);
      q.onSnapshot(snap => {
        const m = {};
        for (const d of snap.docs) m[d.id] = Object.assign({}, d.data(), { id: d.id });
        D[c] = m; R.ready[c] = true; scheduleRender();
      }, err => { R.error = err && err.code; if (err && (err.code === 'revoked')) R.readonly = true; scheduleRender(); });
    }
    if (!ME.canWrite) R.readonly = true;
  } else {
    R.mode = 'local';
    ME.uid = 'lokal-' + devId; ME.isOwner = demoAdminWanted(); ME.canWrite = true;
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) { const o = JSON.parse(raw); COLS.forEach(c => { D[c] = o[c] || {}; }); }
      const pr = localStorage.getItem(LOCAL_KEY + '.priv'); if (pr) Object.assign(PRIV, JSON.parse(pr));
    } catch (e) { /* abaikan */ }
    if (!Object.keys(D.profiles).length) seedLocalDemo();
    COLS.forEach(c => { R.ready[c] = true; });
  }
  scheduleRender(true);
}
/* Mode demo: pengunjung biasa hanya melihat aplikasi Pelanggan & Mitra.
   Pemilik membuka /app/#admin sekali di perangkatnya untuk mencoba Operasional; /app/#keluar-admin untuk menutupnya. */
function demoAdminWanted() {
  const h = String(location.hash || '');
  try {
    if (/^#keluar-admin\b/.test(h)) localStorage.removeItem('beresin.demoAdmin');
    else if (/^#admin\b/.test(h)) localStorage.setItem('beresin.demoAdmin', '1');
    if (localStorage.getItem('beresin.demoAdmin') === '1') return true;
  } catch (e) { if (/^#admin\b/.test(h)) return true; }
  return !!(window.BERESIN_CONFIG && window.BERESIN_CONFIG.demoAdmin === true);
}
function allReady() { return R.mode === 'local' || ['profiles', 'bookings', 'config', 'ledger'].every(c => R.ready[c]); }

/* Contoh mitra untuk mode lokal (ditandai "Contoh"). Di mode online, contoh diisi lewat database. */
function seedLocalDemo() {
  const t = now();
  const demo = [
    { id: 'w_demo_rizky', name: 'Rizky Saputra', area: 'oebobo', skills: ['ac', 'listrik'], certs: { listrik: true }, bio: 'Teknisi AC & listrik, 6 tahun pengalaman.' },
    { id: 'w_demo_maria', name: 'Maria Ndun', area: 'kelapalima', skills: ['kebersihan', 'harian'], certs: {}, bio: 'Spesialis kebersihan rumah & kantor.' },
    { id: 'w_demo_yosef', name: 'Yosef Bria', area: 'maulafa', skills: ['pertukangan', 'taman', 'pindahan'], certs: { ketinggian: true }, bio: 'Tukang & renovasi ringan, berpengalaman kerja di ketinggian.' },
    { id: 'w_demo_dedi', name: 'Dedi Lado', area: 'kotaraja', skills: ['kendaraan', 'teknologi'], certs: { derek: true }, bio: 'Bantuan kendaraan darurat dan servis IT.' }
  ];
  for (const w of demo) {
    D.profiles[w.id] = { id: w.id, ownerUid: 'demo', role: 'worker', demo: true, name: w.name, phone: '0812000000' + w.id.length, area: w.area, skills: w.skills, certs: w.certs, certsClaimed: w.certs, bio: w.bio, verif: 'terverifikasi', online: true, at: t, prefs: {} };
    D.ledger['dep_seed_' + w.id] = { id: 'dep_seed_' + w.id, account: 'worker_deposit', kind: 'deposit_topup', workerPid: w.id, amount: 100000, at: t, simulated: true, note: 'Deposit awal contoh (simulasi)' };
  }
  localPersist();
}

/* ---------- konfigurasi & identitas ---------- */
function CFG() { const c = Store.get('config', 'main'); return Object.assign({}, BL.DEFAULT_CONFIG, c || {}, { services: Object.assign({}, (c && c.services) || {}) }); }
function svc(id) { return BL.svcById(id, CFG()); }
function prof(pid) { return pid ? Store.get('profiles', pid) : null; }
function myProfiles(role) { return Store.list('profiles').filter(p => p.ownerUid === ME.uid && (!role || p.role === role)); }
function staffRole() {
  if (ME.isOwner) return 'admin';
  const s = myProfiles('staff')[0];
  return s && s.active !== false ? s.staffRole : null;
}
function isTester() { return staffRole() === 'admin'; }
function actingPid(role) {
  const want = S.act[role];
  if (want) { const p = prof(want); if (p && p.role === role && (p.ownerUid === ME.uid || isTester())) return want; }
  const mine = myProfiles(role)[0];
  return mine ? mine.id : null;
}
function actor(role) { return prof(actingPid(role)); }
const OPS_PERMS = {
  admin: ['dash', 'workers', 'users', 'bookings', 'tickets', 'feedback', 'finance', 'catalog', 'promo', 'config', 'notifs', 'audit'],
  supervisor: ['dash', 'workers', 'bookings', 'tickets', 'feedback', 'notifs', 'audit'],
  support: ['dash', 'bookings', 'tickets', 'notifs'],
  finance: ['dash', 'bookings', 'finance', 'audit']
};
function opsCan(sec) { const r = staffRole(); return !!r && OPS_PERMS[r].includes(sec); }
function requireWrite() { if (R.readonly) { toast('Mode baca saja: akun Anda belum diberi akses menulis.', true); return false; } return true; }

/* ---------- saldo & statistik ---------- */
function ledgerList() { return Store.list('ledger'); }
function balancesOf(pid) { return BL.workerBalances(ledgerList(), pid); }
function activeJobsOf(pid) { return Store.list('bookings').filter(b => b.workerPid === pid && BL.ACTIVE_STATUSES.includes(b.status)).length; }
function ratingOf(pid, dir) {
  const list = Store.list('feedback').filter(f => f.dir === dir && f.toPid === pid && f.status !== 'disembunyikan');
  return BL.avgRating(list);
}
function svcRating(serviceId) { return BL.avgRating(Store.list('feedback').filter(f => f.dir === 'c2w' && f.serviceId === serviceId && f.status !== 'disembunyikan')); }

/* ---------- audit & notifikasi ---------- */
async function audit(action, target, reason, extra) {
  const id = rid('au');
  const role = S.role;
  const pid = role === 'ops' ? (myProfiles('staff')[0] || {}).id || null : actingPid(role);
  try { await Store.set('audit', id, { at: now(), actorUid: ME.uid, actorPid: pid, role: role === 'ops' ? 'ops:' + staffRole() : role, action, target, reason: reason || '', extra: extra || null }); } catch (e) { /* sudah ditangani */ }
}
const NOTIF_CAT = { pesanan: 'Pesanan', bayar: 'Pembayaran', sistem: 'Sistem', promo: 'Promosi' };
/** Notifikasi idempoten: id deterministik dari kunci peristiwa + penerima. */
async function notify(toPid, key, n) {
  if (!toPid) return;
  const id = 'n_' + hash(key + '|' + toPid);
  const p = prof(toPid);
  const prefs = (p && p.prefs) || {};
  const body = {
    toPid, key, type: n.type, cat: n.cat || 'pesanan', title: n.title, body: n.body || '', ref: n.ref || null,
    at: now(), read: false,
    channels: { inapp: 'terkirim', push: prefs.push ? 'tidak_dikonfigurasi' : 'nonaktif', email: prefs.email ? 'tidak_dikonfigurasi' : 'nonaktif', whatsapp: 'tidak_dikonfigurasi' },
    retries: 0
  };
  try { await Store.set('notifications', id, body); } catch (e) { /* gagal tercatat lewat toast */ }
}
function notifsFor(pids) { const set = new Set(pids); return Store.list('notifications').filter(n => set.has(n.toPid)).sort((a, b) => b.at - a.at); }

/* ---------- operasi pesanan ---------- */
function bookingCode() { const d = new Date(); return 'BRN-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function eligibleWorkers(b) {
  const s = svc(b.serviceId), cfg = CFG();
  return Store.list('profiles').filter(p => p.role === 'worker').map(w => {
    const e = BL.eligibility(w, b, { svc: s, cfg, deposit: balancesOf(w.id).deposit, activeJobs: activeJobsOf(w.id), region: cfg.region });
    return { w, e };
  });
}
function nearestEstimateKm(area, s) {
  const cfg = CFG();
  const fake = { address: { area }, pricing: {}, declined: {} };
  let best = null;
  for (const p of Store.list('profiles').filter(p => p.role === 'worker')) {
    const e = BL.eligibility(p, fake, { svc: s, cfg, deposit: balancesOf(p.id).deposit, activeJobs: activeJobsOf(p.id), region: cfg.region });
    const okish = e.reasons.every(r => r === 'Di luar jangkauan');
    if (okish && e.km != null && (best == null || e.km < best)) best = e.km;
  }
  return best;
}

async function createBooking(draft) {
  const cust = actor('customer');
  const s = svc(draft.serviceId);
  const cfg = CFG();
  const km = draft.km;
  const est = BL.estimate(s, draft.fields, km, cfg);
  const id = rid('b');
  const t = now();
  const b = {
    code: bookingCode(), at: t, updatedAt: t,
    serviceId: s.id, cat: s.cat, serviceName: s.name,
    customerPid: cust.id, customerUid: cust.ownerUid, workerPid: null, workerUid: null,
    status: 'menunggu_mitra',
    fields: draft.fields, address: { area: draft.area, detail: draft.detail, note: draft.addrNote || '', geo: draft.geo && draft.geo.lat != null ? { lat: draft.geo.lat, lng: draft.geo.lng } : null, mapLink: (draft.geo && draft.geo.link) || '' },
    schedule: { date: draft.date, time: draft.time },
    pricing: { model: s.model, lines: est.lines, total: est.total, isEstimate: est.isEstimate, needsQuote: est.needsQuote, travelFee: est.travelFee, travelCustom: est.travelCustom, travelIncluded: !!s.travelIncluded, km: km, qty: est.qty, commissionPct: cfg.commissionPct },
    paymentPlan: s.project ? (draft.paymentPlan || 'A') : null,
    cancelPolicy: s.cancel || 'standar',
    photos: draft.photos || [],
    history: { h0: { from: null, to: 'menunggu_mitra', role: 'customer', byPid: cust.id, at: t, reason: 'Pesanan dibuat' } },
    declined: {}, quotes: {}, milestones: {}, track: {}
  };
  await Store.set('bookings', id, b);
  await notify(cust.id, 'created:' + id, { type: 'booking_created', title: 'Pesanan dibuat', body: `${s.name} · ${b.code}. Kami sedang mencari mitra yang cocok.`, ref: { v: 'c_order', id } });
  const elig = eligibleWorkers(Object.assign({ id }, b)).filter(x => x.e.ok);
  for (const { w, e } of elig.slice(0, 12)) {
    await notify(w.id, 'offer:' + id, { type: 'job_offer', title: 'Pesanan baru tersedia', body: `${s.name} · ±${e.km} km · ${est.isEstimate ? 'estimasi ' : ''}${rp(est.total)}`, ref: { v: 'w_job', id } });
  }
  await notify(cust.id, 'matching:' + id, { type: 'matching', title: elig.length ? `Mencari mitra: ${elig.length} mitra cocok` : 'Belum ada mitra yang cocok', body: elig.length ? 'Penawaran kerja dikirim ke mitra terdekat yang memenuhi syarat.' : 'Tim operasional akan membantu mencarikan mitra.', ref: { v: 'c_order', id } });
  if (!elig.length) await notify('ops', 'nomatch:' + id, { type: 'no_match', cat: 'sistem', title: 'Pesanan tanpa mitra cocok', body: `${b.code} · ${s.name}`, ref: { v: 'a_booking', id } });
  await audit('booking.create', 'bookings/' + id, '', { code: b.code, total: est.total });
  return id;
}

function histEntry(from, to, role, pid, reason) { return { ['h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)]: { from, to, role, byPid: pid || null, at: now(), reason: reason || '' } }; }

/** Transisi status tervalidasi + riwayat + notifikasi. */
async function moveBooking(bid, to, role, reason, extra) {
  const b = Store.get('bookings', bid);
  if (!b) return toast('Pesanan tidak ditemukan', true);
  const err = BL.checkTransition(b, to, role, { reason, quoteRejected: extra && extra.quoteRejected });
  if (err) { toast(err, true); return false; }
  const pid = role === 'ops' ? null : actingPid(role);
  if (role === 'worker' && b.workerPid !== pid && to !== 'ditugaskan') { toast('Anda bukan mitra yang ditugaskan.', true); return false; }
  if (role === 'customer' && b.customerPid !== pid) { toast('Pesanan ini bukan milik Anda.', true); return false; }
  const patch = Object.assign({ status: to, updatedAt: now(), history: histEntry(b.status, to, role, pid, reason) }, (extra && extra.patch) || {});
  const tk = {};
  if (to === 'dalam_perjalanan') tk.departedAt = now();
  if (to === 'tiba') tk.arrivedAt = now();
  if (to === 'dikerjakan' && !b.track.startedAt) tk.startedAt = now();
  if (to === 'menunggu_konfirmasi') tk.finishedAt = now();
  if (to === 'selesai') tk.confirmedAt = now();
  if (to === 'dibatalkan') tk.canceledAt = now();
  if (Object.keys(tk).length) patch.track = tk;
  if (to === 'menunggu_mitra') { patch.workerPid = null; patch.workerUid = null; patch.declined = { [b.workerPid]: { at: now(), reason: 'Dilepas: ' + reason } }; }
  await Store.patch('bookings', bid, patch);
  if (['selesai', 'dibatalkan', 'menunggu_mitra', 'menunggu_konfirmasi'].includes(to)) {
    if (GEO.bid === bid) stopGps(true);
    if (GEO.sim && GEO.sim.bid === bid) stopSim();
    if (Store.get('tracks', bid)) await Store.patch('tracks', bid, { workerLink: null, customerLink: null, ended: ['selesai', 'dibatalkan'].includes(to) });
  }
  const ref = id => ({ v: id, id: bid });
  const msgs = {
    dalam_perjalanan: ['Mitra dalam perjalanan', `${(prof(b.workerPid) || {}).name || 'Mitra'} sedang menuju lokasi Anda.`],
    tiba: ['Mitra telah tiba di lokasi', `${(prof(b.workerPid) || {}).name || 'Mitra'} sudah sampai di lokasi pekerjaan.`],
    dikerjakan: b.status === 'menunggu_konfirmasi' ? ['Perbaikan diminta', 'Pelanggan meminta perbaikan: ' + reason] : ['Pekerjaan dimulai', `${b.serviceName} mulai dikerjakan.`],
    menunggu_konfirmasi: ['Laporan akhir tersedia', 'Periksa hasil pekerjaan lalu konfirmasi selesai atau minta perbaikan.'],
    selesai: ['Pekerjaan selesai', 'Pelanggan mengonfirmasi pekerjaan selesai.'],
    dibatalkan: ['Pesanan dibatalkan', reason || 'Pesanan dibatalkan.'],
    menunggu_mitra: ['Mencari mitra pengganti', 'Mitra sebelumnya melepas pesanan. Kami mencarikan mitra lain.']
  };
  const m = msgs[to];
  const key = `st:${bid}:${to}:${Object.keys(b.history || {}).length}`;
  if (m && role !== 'customer') await notify(b.customerPid, key, { type: 'status_' + to, title: m[0], body: `${b.code} · ${m[1]}`, ref: ref('c_order') });
  if (m && role !== 'worker' && b.workerPid) await notify(b.workerPid, key, { type: 'status_' + to, title: to === 'dikerjakan' && b.status === 'menunggu_konfirmasi' ? 'Pelanggan meminta perbaikan' : (to === 'selesai' ? 'Pekerjaan dikonfirmasi selesai' : m[0]), body: `${b.code} · ${m[1]}`, ref: ref('w_job') });
  await audit('booking.status', 'bookings/' + bid, reason, { from: b.status, to });
  return true;
}

async function acceptJob(bid) {
  const w = actor('worker');
  if (!w) return;
  const b0 = Store.get('bookings', bid);
  const cfg = CFG();
  const e = BL.eligibility(w, b0, { svc: svc(b0.serviceId), cfg, deposit: balancesOf(w.id).deposit, activeJobs: activeJobsOf(w.id), region: cfg.region });
  if (!e.ok) {
    if (e.reasons.includes('Deposit di bawah minimum')) await notify(w.id, 'deplow:' + Math.floor(now() / 3600000), { type: 'deposit_low', cat: 'bayar', title: 'Deposit di bawah minimum', body: `Isi deposit minimal ${rp(cfg.minDeposit)} agar bisa menerima pesanan.`, ref: { v: 'w_wallet' } });
    return toast('Belum memenuhi syarat: ' + e.reasons.join(', '), true);
  }
  const got = await Store.claim('bookings', bid, w.id);
  if (!got) return toast('Pesanan sedang diambil mitra lain. Coba lagi sebentar.', true);
  const b = await Store.fresh('bookings', bid);
  if (!b || b.status !== 'menunggu_mitra' || b.workerPid) return toast('Pesanan sudah diambil mitra lain.', true);
  const travel = BL.lockedTravelFee(b, e.km, cfg);
  const lines = (b.pricing.lines || []).map(l => l.type === 'travel' ? Object.assign({}, l, { name: `Biaya perjalanan (±${e.km} km)`, amount: travel, unitPrice: travel }) : l);
  const ok = await moveBooking(bid, 'ditugaskan', 'worker', 'Diterima mitra', { patch: { workerPid: w.id, workerUid: w.ownerUid, assignedAt: now(), pricing: { travelFee: travel, workerKm: e.km, lines, total: lines.reduce((a, l) => a + l.amount, 0) } } });
  if (!ok) return;
  await Store.set('chats', bid, { bookingId: bid, members: [b.customerPid, w.id], msgs: { m0: { fromPid: null, sys: true, text: `${w.name} menerima pesanan. Gunakan chat untuk koordinasi; perubahan harga, jadwal, dan material wajib lewat tombol penawaran.`, at: now() } }, read: {} });
  if (!Store.get('tracks', bid)) await Store.set('tracks', bid, { bookingId: bid, workerPid: w.id, customerPid: b.customerPid, path: [], at: now() });
  else await Store.patch('tracks', bid, { workerPid: w.id, worker: null, workerLink: null, path: [] });
  await notify(b.customerPid, 'assigned:' + bid + ':' + w.id, { type: 'worker_assigned', title: 'Mitra ditugaskan', body: `${w.name} menerima pesanan ${b.code}. Biaya perjalanan dikunci ${rp(travel)}.`, ref: { v: 'c_order', id: bid } });
  toast('Pesanan diterima');
  go('w_job', { id: bid });
}
async function declineJob(bid, reason) {
  const w = actor('worker'); const b = Store.get('bookings', bid);
  await Store.patch('bookings', bid, { declined: { [w.id]: { at: now(), reason } }, updatedAt: now() });
  await notify(b.customerPid, 'declined:' + bid + ':' + w.id, { type: 'worker_declined', title: 'Seorang mitra menolak', body: `${b.code}: mitra lain masih dapat menerima pesanan Anda.`, ref: { v: 'c_order', id: bid } });
  await audit('booking.decline', 'bookings/' + bid, reason);
  toast('Penawaran kerja ditolak');
}

async function cancelBooking(bid, role, reason) {
  const b = Store.get('bookings', bid);
  const fee = role === 'customer' ? BL.cancelFee(b, svc(b.serviceId), CFG()) : 0;
  const ok = await moveBooking(bid, 'dibatalkan', role, reason, { quoteRejected: (BL.quotesOf(b, null, 'ditolak').length > 0), patch: { cancel: { role, reason, fee, at: now() } } });
  if (!ok) return;
  if (fee > 0) {
    await createInvoice(bid, 'batal', [{ type: 'fee', name: 'Biaya pembatalan (mitra sudah berangkat)', qty: 1, unitPrice: fee, amount: fee }]);
  }
  toast(fee ? `Pesanan dibatalkan. Biaya pembatalan ${rp(fee)} ditagihkan.` : 'Pesanan dibatalkan tanpa biaya');
}

/* ---------- laporan kerja ---------- */
const REPORT_TYPES = {
  kedatangan: 'Laporan kedatangan', inspeksi: 'Inspeksi awal', kondisi_awal: 'Kondisi sebelum kerja', progres: 'Update progres',
  material: 'Pemakaian material', tambahan: 'Permintaan pekerjaan tambahan', jadwal: 'Perubahan jadwal', insiden: 'Masalah / insiden',
  termin: 'Penyelesaian termin', akhir: 'Laporan akhir', lanjutan: 'Kunjungan lanjutan', garansi: 'Laporan garansi'
};
const REPORT_STATUS = {
  draft: ['Draf', 'muted'], diajukan: ['Terkirim', 'info'], menunggu_respons: ['Menunggu respons', 'warn'], revisi_diminta: ['Revisi diminta', 'danger'],
  disetujui: ['Disetujui', 'primary'], ditolak: ['Ditolak', 'danger'], eskalasi: ['Dieskalasi', 'accent']
};
async function submitReport(bid, d) {
  const w = actor('worker'); const b = Store.get('bookings', bid);
  if (!w || b.workerPid !== w.id) return toast('Anda bukan mitra yang ditugaskan.', true);
  if (!String(d.desc || '').trim()) return toast('Deskripsi laporan wajib diisi.', true);
  if ((d.type === 'akhir' || d.type === 'termin') && !(d.photos || []).length && R.assets) return toast('Laporan ini wajib menyertakan foto bukti.', true);
  if (d.type === 'akhir') { const err = BL.checkTransition(b, 'menunggu_konfirmasi', 'worker', {}); if (err) return toast(err, true); }
  if (d.type === 'termin') { const m = (b.milestones || {})[d.milestoneId]; if (!m || !['rencana', 'revisi'].includes(m.status)) return toast('Termin ini tidak dapat dilaporkan saat ini.', true); if (b.status !== 'dikerjakan') return toast('Termin dilaporkan saat pekerjaan berjalan.', true); }
  const id = rid('r');
  const needsApproval = d.type === 'termin' || d.type === 'akhir' || !!d.needsApproval;
  const cur = { desc: d.desc, progress: d.progress != null && d.progress !== '' ? Number(d.progress) : null, findings: d.findings || '', next: d.next || '', photos: d.photos || [], milestoneId: d.milestoneId || null };
  await Store.set('reports', id, { bookingId: bid, type: d.type, byPid: w.id, at: now(), status: needsApproval ? 'menunggu_respons' : 'diajukan', needsApproval, version: 1, current: cur, revisions: { v1: Object.assign({ at: now(), reason: 'Kiriman pertama' }, cur) }, comments: {} });
  await notify(b.customerPid, 'report:' + id, { type: 'report_' + d.type, title: d.type === 'inspeksi' ? 'Laporan inspeksi tersedia' : (REPORT_TYPES[d.type] + (needsApproval ? ' · perlu persetujuan' : '')), body: `${w.name}: ${String(d.desc).slice(0, 90)}`, ref: { v: 'report', id } });
  if (d.type === 'termin' && d.milestoneId) {
    await Store.patch('bookings', bid, { milestones: { [d.milestoneId]: { status: 'diajukan', reportId: id, submittedAt: now() } }, updatedAt: now() });
  }
  if (d.type === 'akhir') {
    const toStatus = 'menunggu_konfirmasi';
    const ok = await moveBooking(bid, toStatus, 'worker', 'Laporan akhir dikirim');
    if (!ok) { await Store.patch('reports', id, { status: 'draft' }); return; }
    await Store.patch('bookings', bid, { finalReportId: id });
  }
  await audit('report.submit', 'reports/' + id, '', { type: d.type });
  toast('Laporan terkirim');
  return id;
}
async function reviseReport(id, d, reason) {
  const r = Store.get('reports', id);
  if (!String(reason || '').trim()) return toast('Alasan revisi wajib diisi.', true);
  const v = (r.version || 1) + 1;
  const cur = Object.assign({}, r.current, { desc: d.desc, progress: d.progress != null && d.progress !== '' ? Number(d.progress) : r.current.progress, findings: d.findings || '', next: d.next || '', photos: d.photos || r.current.photos || [] });
  await Store.patch('reports', id, { version: v, current: cur, revisions: { ['v' + v]: Object.assign({ at: now(), reason }, cur) }, status: r.needsApproval ? 'menunggu_respons' : 'diajukan' });
  const b = Store.get('bookings', r.bookingId);
  await notify(b.customerPid, 'reportrev:' + id + ':' + v, { type: 'report_revised', title: 'Laporan direvisi', body: `${REPORT_TYPES[r.type]} versi ${v}: ${reason}`, ref: { v: 'report', id } });
  if (r.type === 'termin' && r.current.milestoneId) await Store.patch('bookings', r.bookingId, { milestones: { [r.current.milestoneId]: { status: 'diajukan' } } });
  await audit('report.revise', 'reports/' + id, reason, { version: v });
  toast('Revisi laporan terkirim');
}
async function commentReport(id, text, role) {
  if (!String(text || '').trim()) return;
  const r = Store.get('reports', id); const b = Store.get('bookings', r.bookingId);
  const pid = actingPid(role);
  const cid = 'c' + Date.now().toString(36);
  await Store.patch('reports', id, { comments: { [cid]: { byPid: pid, role, text, at: now() } } });
  const to = role === 'customer' ? b.workerPid : b.customerPid;
  await notify(to, 'rcomment:' + id + ':' + cid, { type: 'report_comment', title: role === 'customer' ? 'Laporan pekerjaan dikomentari' : 'Mitra menanggapi laporan', body: text.slice(0, 100), ref: { v: 'report', id } });
}
/** Keputusan pelanggan atas laporan: setujui | revisi | tolak | eskalasi */
async function decideReport(id, decision, note) {
  const r = Store.get('reports', id); const b = Store.get('bookings', r.bookingId);
  const cust = actor('customer');
  if (!cust || b.customerPid !== cust.id) return toast('Hanya pelanggan pesanan ini yang dapat memutuskan.', true);
  if (decision !== 'setujui' && !String(note || '').trim()) return toast('Alasan wajib diisi.', true);
  const map = { setujui: 'disetujui', revisi: 'revisi_diminta', tolak: 'ditolak', eskalasi: 'eskalasi' };
  await Store.patch('reports', id, { status: map[decision], decision: { byPid: cust.id, at: now(), note: note || '', decision } });
  if (r.type === 'termin' && r.current.milestoneId) {
    const mid = r.current.milestoneId;
    if (decision === 'setujui') await acceptMilestone(b, mid);
    else await Store.patch('bookings', b.id, { milestones: { [mid]: { status: 'revisi', note } } });
  }
  if (r.type === 'akhir') {
    if (decision === 'setujui') await confirmCompletion(b.id);
    else if (decision === 'revisi' || decision === 'tolak') await moveBooking(b.id, 'dikerjakan', 'customer', note);
  }
  if (decision === 'eskalasi') await openTicket({ type: 'keluhan', bookingId: b.id, subject: 'Keberatan atas laporan: ' + REPORT_TYPES[r.type], text: note, priority: 'tinggi', reportId: id });
  await notify(b.workerPid, 'rdecide:' + id + ':' + (r.version || 1) + ':' + decision, { type: 'report_' + map[decision], title: { setujui: 'Laporan disetujui', revisi: 'Laporan perlu revisi', tolak: 'Laporan ditolak', eskalasi: 'Laporan dieskalasi ke dukungan' }[decision], body: note || REPORT_TYPES[r.type], ref: { v: 'report', id } });
  await audit('report.' + decision, 'reports/' + id, note);
  toast('Keputusan tersimpan');
}

/* ---------- penawaran & termin ---------- */
const QUOTE_KINDS = { revisi: 'Penawaran revisi (hasil inspeksi)', rencana: 'Rencana proyek & termin', tambahan: 'Pekerjaan tambahan', material: 'Pembelian material', jadwal: 'Perubahan jadwal / durasi' };
async function submitQuote(bid, d) {
  const w = actor('worker'); const b = Store.get('bookings', bid);
  if (!w || b.workerPid !== w.id) return toast('Anda bukan mitra yang ditugaskan.', true);
  const items = {}; let n = 0;
  for (const it of d.items || []) {
    if (!String(it.name || '').trim()) continue;
    if (!(Number(it.qty) > 0) || !(Number(it.unitPrice) >= 0)) return toast('Jumlah dan harga satuan tiap item harus valid.', true);
    n++; items['i' + n] = { n, type: it.type, name: it.name.trim(), spec: it.spec || '', qty: Number(it.qty), unit: it.unit || '', unitPrice: Number(it.unitPrice), supplier: it.supplier || '' };
  }
  const ms = {}; let mn = 0;
  if (d.kind === 'rencana') {
    for (const m of d.milestones || []) {
      if (!String(m.title || '').trim()) continue;
      if (!(Number(m.value) > 0)) return toast('Nilai setiap termin harus lebih dari 0.', true);
      mn++; ms['m' + mn] = { n: mn, title: m.title.trim(), deliverable: m.deliverable || '', criteria: m.criteria || '', value: Number(m.value), due: m.due || '' };
    }
    if (!mn) return toast('Tambahkan minimal satu termin.', true);
    if (!d.estEnd) return toast('Isi perkiraan tanggal selesai proyek.', true);
  } else if (d.kind === 'jadwal') {
    if (!d.newDate || !String(d.reason || '').trim()) return toast('Isi tanggal baru dan alasan perubahan.', true);
  } else if (!n) return toast('Tambahkan minimal satu item penawaran.', true);
  const qid = 'q' + Date.now().toString(36);
  const q = { id: qid, kind: d.kind, items, milestones: ms, note: d.note || '', reason: d.reason || '', newDate: d.newDate || '', newTime: d.newTime || '', estEnd: d.estEnd || '', duration: d.duration || '', status: 'menunggu', byPid: w.id, at: now(), photos: d.photos || [] };
  q.total = BL.quoteTotal(q);
  await Store.patch('bookings', bid, { quotes: { [qid]: q }, updatedAt: now() });
  await notify(b.customerPid, 'quote:' + bid + ':' + qid, { type: 'quote_pending', title: 'Menunggu persetujuan', body: `${QUOTE_KINDS[d.kind]}${q.total ? ' ' + rp(q.total) : ''} dari ${w.name}.`, ref: { v: 'c_order', id: bid } });
  await audit('quote.submit', `bookings/${bid}#${qid}`, d.reason || '', { kind: d.kind, total: q.total });
  toast('Penawaran dikirim ke pelanggan');
  return qid;
}
async function decideQuote(bid, qid, decision, reason) {
  const b = Store.get('bookings', bid); const q = b.quotes[qid]; const cust = actor('customer');
  if (!cust || b.customerPid !== cust.id) return toast('Hanya pelanggan pesanan ini yang dapat memutuskan.', true);
  if (q.status !== 'menunggu') return toast('Penawaran ini sudah diputuskan.', true);
  if (decision === 'ditolak' && !String(reason || '').trim()) return toast('Alasan penolakan wajib diisi.', true);
  const patch = { quotes: { [qid]: { status: decision, decidedAt: now(), decisionReason: reason || '', decidedByPid: cust.id } }, updatedAt: now() };
  if (decision === 'disetujui') {
    // menggantikan penawaran dasar lama yang masih menunggu? tidak — hanya menerapkan efek
    if (q.kind === 'rencana') {
      const ms = {};
      for (const [k, m] of Object.entries(q.milestones || {})) ms[k] = Object.assign({}, m, { status: 'rencana' });
      patch.milestones = ms; patch.project = { estEnd: q.estEnd, duration: q.duration, planQid: qid };
    }
    if (q.kind === 'jadwal') { patch.schedule = { date: q.newDate, time: q.newTime || b.schedule.time }; patch.project = { estEnd: q.estEnd || (b.project || {}).estEnd || '' }; }
  }
  await Store.patch('bookings', bid, patch);
  await notify(b.workerPid, 'qdecide:' + bid + ':' + qid, { type: 'quote_' + decision, title: decision === 'disetujui' ? 'Pelanggan menyetujui penawaran' : 'Pelanggan menolak penawaran', body: `${QUOTE_KINDS[q.kind]}${q.total ? ' ' + rp(q.total) : ''}${reason ? ' · ' + reason : ''}`, ref: { v: 'w_job', id: bid } });
  await audit('quote.' + decision, `bookings/${bid}#${qid}`, reason, { kind: q.kind, total: q.total });
  toast(decision === 'disetujui' ? 'Penawaran disetujui' : 'Penawaran ditolak');
}
async function acceptMilestone(b, mid) {
  const m = b.milestones[mid];
  await Store.patch('bookings', b.id, { milestones: { [mid]: { status: 'diterima', acceptedAt: now() } }, updatedAt: now() });
  await notify(b.workerPid, 'msacc:' + b.id + ':' + mid, { type: 'milestone_accepted', title: `Termin ${m.n} diterima`, body: m.title, ref: { v: 'w_job', id: b.id } });
  if (b.paymentPlan === 'B') {
    await createInvoice(b.id, 'termin', [{ type: 'labor', name: `Termin ${m.n}: ${m.title}`, qty: 1, unitPrice: m.value, amount: m.value }], mid);
  }
}
async function confirmCompletion(bid, role, reason) {
  const b = Store.get('bookings', bid);
  const ok = await moveBooking(bid, 'selesai', role || 'customer', reason || 'Pelanggan mengonfirmasi selesai');
  if (!ok) return;
  const fresh = Object.assign({}, b, { status: 'selesai' });
  const lines = BL.finalInvoiceLines(fresh);
  if (lines.length && lines.reduce((a, l) => a + l.amount, 0) > 0) await createInvoice(bid, 'akhir', lines);
  await notify(b.customerPid, 'fbreq:' + bid, { type: 'feedback_request', title: 'Ulas pengalaman Anda', body: `Bagikan penilaian untuk ${(prof(b.workerPid) || {}).name || 'mitra'}.`, ref: { v: 'c_feedback', id: bid } });
  await notify(b.workerPid, 'fbreq:' + bid, { type: 'feedback_request', title: 'Beri ulasan untuk pelanggan', body: `Bagaimana pengalaman Anda dengan ${(prof(b.customerPid) || {}).name || 'pelanggan'}?`, ref: { v: 'w_feedback', id: bid } });
}

/* ---------- invoice & pembayaran (SIMULASI) ---------- */
async function createInvoice(bid, kind, lines, mid) {
  const b = Store.get('bookings', bid);
  const iid = 'inv_' + bid + (kind === 'termin' ? '_' + mid : kind === 'batal' ? '_batal' : '');
  if (Store.get('invoices', iid)) return iid; // idempoten
  const totals = BL.invoiceTotals(kind === 'batal' ? lines.map(l => Object.assign({}, l, { type: 'fee' })) : lines, CFG());
  const code = 'INV-' + b.code.slice(4) + (kind === 'termin' ? '-T' + mid.slice(1) : kind === 'batal' ? '-B' : '');
  await Store.set('invoices', iid, { code, bookingId: bid, kind, milestoneId: mid || null, customerPid: b.customerPid, workerPid: b.workerPid, lines, totals, status: 'belum_dibayar', at: now(), attempts: {}, events: {}, refunded: 0, simulated: true });
  await notify(b.customerPid, 'inv:' + iid, { type: 'invoice_payable', cat: 'bayar', title: 'Tagihan siap dibayar', body: `${code} · ${rp(totals.total)}`, ref: { v: 'c_pay', id: iid } });
  if (b.workerPid) await notify(b.workerPid, 'inv:' + iid, { type: 'invoice_created', cat: 'bayar', title: 'Tagihan diterbitkan', body: `${code} · ${rp(totals.total)} · menunggu pembayaran pelanggan`, ref: { v: 'w_job', id: bid } });
  await audit('invoice.create', 'invoices/' + iid, '', { total: totals.total, kind });
  return iid;
}
const PAY_METHODS = { qris: 'QRIS', va_bri: 'Virtual Account BRI', va_bca: 'Virtual Account BCA', va_mandiri: 'Virtual Account Mandiri', ewallet: 'Dompet digital' };
async function startPayment(iid, method) {
  const inv = Store.get('invoices', iid);
  if (inv.status === 'lunas') return toast('Tagihan ini sudah lunas.', true);
  const aid = 'a' + Date.now().toString(36);
  await Store.patch('invoices', iid, { status: 'menunggu_pembayaran', attempts: { [aid]: { method, status: 'menunggu', ref: 'SIM-' + Math.random().toString(36).slice(2, 10).toUpperCase(), at: now() } } });
  await audit('payment.start', 'invoices/' + iid, '', { method, attempt: aid });
  return aid;
}
/** Simulasi webhook gateway. Idempoten berdasarkan eventId. */
async function gatewayEvent(iid, aid, result, eventId) {
  const inv = await Store.fresh('invoices', iid);
  if (!inv) return 'tidak_ditemukan';
  if ((inv.events || {})[eventId]) { await audit('payment.webhook_duplicate', 'invoices/' + iid, 'Event duplikat diabaikan', { eventId }); return 'duplikat'; }
  const ev = { [eventId]: { result, at: now(), attempt: aid, verified: 'simulasi-tanda-tangan-valid' } };
  if (result === 'berhasil') {
    if (inv.status === 'lunas') { await Store.patch('invoices', iid, { events: ev }); return 'sudah_lunas'; }
    const at = now();
    await Store.patch('invoices', iid, { status: 'lunas', paidAt: at, paidAttempt: aid, events: ev, attempts: { [aid]: { status: 'berhasil' } } });
    for (const e of BL.paymentLedgerEntries(Object.assign({}, inv, { id: iid }), Object.assign({}, CFG(), { commissionPct: inv.totals.pct }), at)) {
      if (!Store.get('ledger', e.id)) await Store.set('ledger', e.id, e);
    }
    await notify(inv.customerPid, 'paid:' + iid, { type: 'payment_success', cat: 'bayar', title: 'Pembayaran berhasil', body: `Pembayaran ${rp(inv.totals.total)} untuk ${inv.code} terverifikasi (simulasi).`, ref: { v: 'c_pay', id: iid } });
    if (inv.workerPid) await notify(inv.workerPid, 'paid:' + iid, { type: 'payment_success', cat: 'bayar', title: 'Pembayaran berhasil', body: `Saldo pendapatan bertambah ${rp(inv.totals.workerNet)} (setelah komisi ${rp(inv.totals.commission)}).`, ref: { v: 'w_wallet' } });
    await audit('payment.success', 'invoices/' + iid, '', { eventId, total: inv.totals.total });
    return 'diproses';
  }
  if (inv.status !== 'lunas') await Store.patch('invoices', iid, { status: 'gagal', events: ev, attempts: { [aid]: { status: 'gagal' } } });
  else await Store.patch('invoices', iid, { events: ev });
  await notify(inv.customerPid, 'payfail:' + iid + ':' + aid, { type: 'payment_failed', cat: 'bayar', title: 'Pembayaran gagal', body: `${inv.code}: silakan coba lagi atau pilih metode lain.`, ref: { v: 'c_pay', id: iid } });
  await audit('payment.failed', 'invoices/' + iid, '', { eventId });
  return 'gagal';
}

/* ---------- deposit & pencairan (SIMULASI) ---------- */
async function topupDeposit(amount) {
  const w = actor('worker');
  const id = rid('dep');
  await Store.set('ledger', id, { account: 'worker_deposit', kind: 'deposit_topup', workerPid: w.id, amount, at: now(), simulated: true, note: 'Isi deposit (simulasi, tanpa dana nyata)' });
  await notify(w.id, 'dep:' + id, { type: 'deposit', cat: 'bayar', title: 'Deposit bertambah', body: `${rp(amount)} ditambahkan ke deposit (simulasi).`, ref: { v: 'w_wallet' } });
  await audit('deposit.topup', 'ledger/' + id, '', { amount });
  toast('Deposit ditambahkan (simulasi)');
}
async function requestPayout(amount) {
  const w = actor('worker'); const bal = balancesOf(w.id);
  if (!(amount > 0) || amount > bal.earnings) return toast('Nominal melebihi saldo pendapatan yang tersedia.', true);
  const id = rid('po');
  await Store.set('ledger', id, { account: 'worker_earnings', kind: 'payout_request', workerPid: w.id, amount: -amount, at: now(), simulated: true, note: 'Permintaan pencairan' });
  await notify('ops', 'po:' + id, { type: 'payout_request', cat: 'bayar', title: 'Permintaan pencairan', body: `${w.name} · ${rp(amount)}`, ref: { v: 'a_finance' } });
  await audit('payout.request', 'ledger/' + id, '', { amount });
  toast('Permintaan pencairan dikirim');
}
async function payoutDecision(reqId, decision, reason) {
  const req = Store.get('ledger', reqId);
  if (decision === 'tolak' && !String(reason || '').trim()) return toast('Alasan wajib diisi.', true);
  const id = reqId + (decision === 'bayar' ? '_paid' : '_rev');
  if (Store.get('ledger', reqId + '_paid') || Store.get('ledger', reqId + '_rev')) return toast('Permintaan ini sudah diproses.', true);
  if (decision === 'bayar') await Store.set('ledger', id, { account: 'worker_earnings', kind: 'payout_paid', ref: reqId, workerPid: req.workerPid, amount: 0, at: now(), simulated: true, note: 'Pencairan ditandai dibayar (simulasi, tanpa transfer nyata)' });
  else await Store.set('ledger', id, { account: 'worker_earnings', kind: 'payout_reversed', ref: reqId, workerPid: req.workerPid, amount: -Number(req.amount), at: now(), simulated: true, note: 'Pencairan ditolak: ' + reason });
  await notify(req.workerPid, 'pod:' + reqId, { type: 'payout_' + decision, cat: 'bayar', title: decision === 'bayar' ? 'Pencairan diproses' : 'Pencairan ditolak', body: decision === 'bayar' ? `${rp(-req.amount)} ditandai dibayar (simulasi).` : reason, ref: { v: 'w_wallet' } });
  await audit('payout.' + decision, 'ledger/' + reqId, reason || '', { amount: -req.amount });
  toast('Tersimpan');
}

/* ---------- ulasan dua arah ---------- */
async function submitFeedback(bid, dir, d) {
  const b = Store.get('bookings', bid);
  const role = dir === 'c2w' ? 'customer' : 'worker';
  const me = actor(role);
  if (b.status !== 'selesai') return toast('Ulasan hanya untuk pesanan yang selesai.', true);
  if ((role === 'customer' && b.customerPid !== me.id) || (role === 'worker' && b.workerPid !== me.id)) return toast('Anda tidak terkait dengan pesanan ini.', true);
  const fid = bid + '__' + dir;
  const existing = await Store.fresh('feedback', fid);
  if (existing) return toast('Ulasan untuk pesanan ini sudah dikirim.', true);
  if (!(d.overall >= 1 && d.overall <= 5)) return toast('Pilih penilaian bintang 1–5.', true);
  const flags = BL.contentFlags(d.comment);
  const toPid = dir === 'c2w' ? b.workerPid : b.customerPid;
  await Store.set('feedback', fid, { bookingId: bid, serviceId: b.serviceId, dir, fromPid: me.id, toPid, overall: d.overall, sub: d.sub || {}, comment: d.comment || '', photos: d.photos || [], at: now(), status: flags.length ? 'ditinjau' : 'terkirim', autoFlags: flags, responses: {}, reports: {} });
  await notify(toPid, 'fb:' + fid, { type: 'feedback_received', title: dir === 'c2w' ? 'Ulasan baru dari pelanggan' : 'Ulasan baru dari mitra', body: `Anda mendapat rating ${d.overall}.0`, ref: { v: dir === 'c2w' ? 'w_reviews' : 'c_reviews' } });
  if (flags.length) await notify('ops', 'fbflag:' + fid, { type: 'feedback_flag', cat: 'sistem', title: 'Ulasan perlu ditinjau', body: 'Terdeteksi: ' + flags.join(', '), ref: { v: 'a_feedback' } });
  if (d.complaint && String(d.complaint).trim()) await openTicket({ type: 'keluhan', bookingId: bid, subject: 'Keluhan pribadi dari ulasan', text: d.complaint, priority: 'sedang' });
  await audit('feedback.submit', 'feedback/' + fid, '', { overall: d.overall });
  toast(flags.length ? 'Ulasan terkirim dan menunggu moderasi' : 'Terima kasih atas ulasan Anda');
}
async function respondFeedback(fid, text, role) {
  if (!String(text || '').trim()) return;
  const f = Store.get('feedback', fid); const me = actor(role);
  if (f.toPid !== me.id) return toast('Hanya pihak yang diulas yang dapat menanggapi.', true);
  if (Object.values(f.responses || {}).some(r => r.byPid === me.id)) return toast('Anda sudah menanggapi ulasan ini.', true);
  await Store.patch('feedback', fid, { responses: { ['r' + Date.now().toString(36)]: { byPid: me.id, text, at: now() } } });
  await notify(f.fromPid, 'fbresp:' + fid, { type: 'feedback_response', title: 'Ulasan Anda ditanggapi', body: text.slice(0, 100), ref: { v: role === 'worker' ? 'c_order' : 'w_job', id: f.bookingId } });
  toast('Tanggapan terkirim');
}
async function reportFeedback(fid, reason, role) {
  if (!String(reason || '').trim()) return toast('Alasan wajib diisi.', true);
  const me = actor(role);
  await Store.patch('feedback', fid, { status: 'dilaporkan', reports: { [me.id]: { reason, at: now() } } });
  await notify('ops', 'fbrep:' + fid + ':' + me.id, { type: 'feedback_reported', cat: 'sistem', title: 'Ulasan dilaporkan', body: reason, ref: { v: 'a_feedback' } });
  await audit('feedback.report', 'feedback/' + fid, reason);
  toast('Laporan dikirim ke tim moderasi');
}
async function moderateFeedback(fid, decision, reason) {
  if (!String(reason || '').trim()) return toast('Alasan moderasi wajib diisi.', true);
  await Store.patch('feedback', fid, { status: decision === 'tampilkan' ? 'selesai_ditinjau' : 'disembunyikan', moderation: { decision, reason, at: now(), by: ME.uid } });
  await audit('feedback.moderate', 'feedback/' + fid, reason, { decision });
  toast('Keputusan moderasi tersimpan');
}

/* ---------- tiket dukungan, keluhan, garansi ---------- */
const TICKET_TYPES = { keluhan: 'Keluhan', garansi: 'Klaim garansi', tagihan: 'Masalah tagihan', keterlambatan: 'Keterlambatan', keselamatan: 'Insiden keselamatan', penyalahgunaan: 'Laporan penyalahgunaan chat', lainnya: 'Lainnya' };
const TICKET_STATUS = { baru: ['Baru', 'info'], diproses: ['Diproses', 'primary'], menunggu_info: ['Menunggu info', 'warn'], eskalasi: ['Eskalasi', 'accent'], selesai: ['Selesai', 'done'], ditutup: ['Ditutup', 'muted'] };
async function openTicket(d) {
  const role = S.role === 'ops' ? 'customer' : S.role;
  const me = actor(role);
  const b = d.bookingId ? Store.get('bookings', d.bookingId) : null;
  if (d.type === 'garansi') {
    const s = svc(b.serviceId);
    const w = BL.warrantyInfo(s, (b.track || {}).confirmedAt || 0, now());
    if (b.status !== 'selesai') return toast('Klaim garansi hanya untuk pekerjaan yang sudah selesai.', true);
    if (!w.covered) return toast('Masa garansi untuk layanan ini sudah berakhir atau tidak tersedia.', true);
  }
  if (!String(d.text || '').trim()) return toast('Jelaskan masalahnya.', true);
  const tid = rid('t');
  const code = 'TKT-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const pri = d.type === 'keselamatan' ? 'kritis' : (d.priority || 'sedang');
  const against = b ? (role === 'customer' ? b.workerPid : b.customerPid) : null;
  await Store.set('tickets', tid, { code, type: d.type, bookingId: d.bookingId || null, reportId: d.reportId || null, subject: d.subject || TICKET_TYPES[d.type], openedByPid: me ? me.id : null, openedRole: role, againstPid: against, priority: pri, status: 'baru', assignedUid: null, at: now(), evidence: d.photos || [], timeline: { e0: { at: now(), byPid: me ? me.id : null, kind: 'publik', text: d.text } }, resolution: null });
  await notify('ops', 'tkt:' + tid, { type: 'ticket_opened', cat: 'sistem', title: `${TICKET_TYPES[d.type]} baru · ${pri}`, body: `${code}${b ? ' · ' + b.code : ''}: ${d.text.slice(0, 80)}`, ref: { v: 'a_ticket', id: tid } });
  if (against) await notify(against, 'tkt:' + tid, { type: 'ticket_opened', title: d.type === 'garansi' ? 'Klaim garansi dibuka' : 'Keluhan dibuka', body: `${code}${b ? ' · ' + b.code : ''}. Tim dukungan akan meninjau bukti.`, ref: { v: role === 'customer' ? 'w_job' : 'c_order', id: d.bookingId } });
  await audit('ticket.open', 'tickets/' + tid, '', { type: d.type });
  toast('Tiket ' + code + ' dibuat');
  return tid;
}
async function ticketUpdate(tid, patch, msg, reason) {
  const t = Store.get('tickets', tid);
  const eid = 'e' + Date.now().toString(36);
  const body = Object.assign({}, patch);
  if (msg) body.timeline = { [eid]: { at: now(), byUid: ME.uid, byOps: S.role === 'ops', kind: msg.kind, text: msg.text } };
  await Store.patch('tickets', tid, body);
  if (msg && msg.kind === 'publik' && S.role === 'ops') await notify(t.openedByPid, 'tktmsg:' + tid + ':' + eid, { type: 'ticket_message', title: `Balasan dukungan · ${t.code}`, body: msg.text.slice(0, 100), ref: { v: 'ticket', id: tid } });
  if (patch.status && patch.status !== t.status) {
    await notify(t.openedByPid, 'tktst:' + tid + ':' + patch.status, { type: 'ticket_status', title: `${t.code}: ${TICKET_STATUS[patch.status][0]}`, body: (patch.resolution && patch.resolution.text) || reason || '', ref: { v: 'ticket', id: tid } });
    if (t.againstPid) await notify(t.againstPid, 'tktst:' + tid + ':' + patch.status, { type: 'ticket_status', title: `${t.code}: ${TICKET_STATUS[patch.status][0]}`, body: (patch.resolution && patch.resolution.text) || '', ref: { v: 'ticket', id: tid } });
  }
  await audit('ticket.update', 'tickets/' + tid, reason || '', { patch: Object.keys(patch) });
}
async function refundForTicket(tid, amount, chargeTo, reason) {
  const t = Store.get('tickets', tid);
  const inv = Store.list('invoices').find(i => i.bookingId === t.bookingId && i.status !== 'belum_dibayar' && i.paidAt);
  if (!inv) return toast('Tidak ada tagihan lunas untuk pesanan ini.', true);
  const max = inv.totals.total - (inv.refunded || 0);
  if (!(amount > 0) || amount > max) return toast(`Nominal pengembalian harus 1–${rp(max)}.`, true);
  if (!String(reason || '').trim()) return toast('Alasan keputusan wajib diisi.', true);
  const id = 'rf_' + tid;
  if (Store.get('ledger', id)) return toast('Pengembalian untuk tiket ini sudah tercatat.', true);
  await Store.set('ledger', id, { account: 'refund', kind: 'refund', invoiceId: inv.id, bookingId: t.bookingId, workerPid: inv.workerPid, amount: -amount, at: now(), simulated: true, note: 'Pengembalian dana: ' + reason, ticketId: tid, chargeTo });
  if (chargeTo === 'mitra') await Store.set('ledger', 'adj_' + tid, { account: 'worker_earnings', kind: 'adjustment', workerPid: inv.workerPid, bookingId: t.bookingId, amount: -amount, at: now(), simulated: true, note: 'Penyesuaian atas keputusan sengketa ' + t.code, ticketId: tid });
  const refunded = (inv.refunded || 0) + amount;
  await Store.patch('invoices', inv.id, { refunded, status: refunded >= inv.totals.total ? 'dikembalikan' : 'sebagian_dikembalikan' });
  await notify(inv.customerPid, 'refund:' + tid, { type: 'refund', cat: 'bayar', title: 'Keputusan pengembalian dana', body: `${rp(amount)} dikembalikan untuk ${inv.code} (simulasi).`, ref: { v: 'ticket', id: tid } });
  if (chargeTo === 'mitra') await notify(inv.workerPid, 'refund:' + tid, { type: 'adjustment', cat: 'bayar', title: 'Penyesuaian saldo', body: `${rp(amount)} dibebankan sesuai keputusan ${t.code}: ${reason}`, ref: { v: 'w_wallet' } });
  await audit('refund.create', 'ledger/' + id, reason, { amount, chargeTo });
  toast('Pengembalian dana tercatat');
}

/* ---------- chat ---------- */
async function sendChat(bid, text, role) {
  text = String(text || '').trim(); if (!text) return;
  const me = actor(role); const b = Store.get('bookings', bid);
  if (![b.customerPid, b.workerPid].includes(me.id)) return toast('Anda bukan peserta chat ini.', true);
  if (!Store.get('chats', bid)) await Store.set('chats', bid, { bookingId: bid, members: [b.customerPid, b.workerPid], msgs: {}, read: {} });
  const mid = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  await Store.patch('chats', bid, { msgs: { [mid]: { fromPid: me.id, text: text.slice(0, 1000), at: now() } }, read: { [me.id]: now() } });
  const to = me.id === b.customerPid ? b.workerPid : b.customerPid;
  await notify(to, 'chat:' + bid + ':' + Math.floor(now() / 120000), { type: 'chat_message', title: 'Pesan baru dari ' + me.name, body: text.slice(0, 90), ref: { v: 'chat', id: bid } });
}
async function markChatRead(bid, pid) {
  const c = Store.get('chats', bid); if (!c) return;
  const last = Math.max(0, ...Object.values(c.msgs || {}).map(m => m.at));
  if ((c.read || {})[pid] >= last) return;
  await Store.patch('chats', bid, { read: { [pid]: now() } });
}
function unreadChats(pid) {
  return Store.list('chats').filter(c => (c.members || []).includes(pid)).filter(c => {
    const r = (c.read || {})[pid] || 0;
    return Object.values(c.msgs || {}).some(m => m.fromPid && m.fromPid !== pid && m.at > r);
  }).length;
}

/* ---------- pelacakan lokasi ---------- */
const GEO = { watch: null, bid: null, side: null, lastWrite: 0, last: null, sim: null };
R.geo = 'unknown';
async function detectGeo() {
  if (!navigator.geolocation) { R.geo = 'unavailable'; return; }
  try { const p = await navigator.permissions.query({ name: 'geolocation' }); R.geo = p.state === 'denied' ? 'unavailable' : 'available'; }
  catch (e) { R.geo = 'available'; }
}
const TRACK_ACTIVE = ['ditugaskan', 'dalam_perjalanan', 'tiba', 'dikerjakan'];
function trackOf(bid) { return Store.get('tracks', bid) || null; }
/** Posisi mitra: GPS/simulasi/titik manual → perkiraan pusat kecamatan. */
function workerPoint(b) {
  const t = trackOf(b.id) || {};
  if (t.worker && t.worker.lat != null) return { p: t.worker, src: t.worker.src || 'manual', at: t.worker.at, exact: true };
  const w = prof(b.workerPid);
  const c = w ? BL.areaCentroid(w.area, CFG().region) : null;
  return { p: c, src: 'area', at: null, exact: false };
}
function custPoint(b) {
  const t = trackOf(b.id) || {};
  if (t.customer && t.customer.lat != null) return { p: t.customer, src: t.customer.src || 'manual', at: t.customer.at, exact: true };
  if (b.address && b.address.geo && b.address.geo.lat != null) return { p: b.address.geo, src: 'manual', at: b.at, exact: true };
  return { p: BL.areaCentroid(b.address.area, CFG().region), src: 'area', at: null, exact: false };
}
async function ensureTrack(b) {
  if (Store.get('tracks', b.id)) return;
  const fresh = await Store.fresh('tracks', b.id);
  if (fresh) return;
  await Store.set('tracks', b.id, { bookingId: b.id, workerPid: b.workerPid || null, customerPid: b.customerPid, path: [], at: now() });
}
function sideAllowed(b, side) {
  const me = actor(side);
  return !!me && (side === 'worker' ? b.workerPid === me.id : b.customerPid === me.id);
}
async function pushPosition(bid, side, pos, src) {
  const b = Store.get('bookings', bid); if (!b) return;
  await ensureTrack(b);
  const t = trackOf(bid) || {};
  const p = { lat: Math.round(pos.lat * 1e6) / 1e6, lng: Math.round(pos.lng * 1e6) / 1e6, acc: pos.acc || null, at: now(), src };
  const patch = { [side]: p, at: now() };
  if (side === 'worker') patch.path = (t.path || []).concat([{ lat: p.lat, lng: p.lng, at: p.at }]).slice(-40);
  await Store.patch('tracks', bid, patch);
}
/** Bagikan titik (koordinat) atau tautan live Google Maps. */
async function shareGeoText(bid, side, text) {
  const g = BL.parseGeo(text);
  if (!g) { toast('Format tidak dikenali. Tempel koordinat (contoh: -10.1701, 123.6070) atau tautan Google Maps.', true); return false; }
  const b = Store.get('bookings', bid);
  if (!sideAllowed(b, side) && !isTester()) { toast('Anda bukan peserta pesanan ini.', true); return false; }
  if (!TRACK_ACTIVE.includes(b.status) && b.status !== 'menunggu_mitra') { toast('Berbagi lokasi hanya selama pesanan berjalan.', true); return false; }
  if (g.lat != null && !BL.nearKupang(g)) toast('Titik ini jauh dari Kupang. Pastikan koordinatnya benar.', true);
  await ensureTrack(b);
  if (g.lat != null) await pushPosition(bid, side, g, 'manual');
  if (g.link) await Store.patch('tracks', bid, { [side + 'Link']: { url: g.link, at: now() } });
  const to = side === 'worker' ? b.customerPid : b.workerPid;
  if (to) await notify(to, `loc:${bid}:${side}:${g.link ? 'live' : 'pin'}`, { type: 'location_shared', title: side === 'worker' ? 'Mitra membagikan lokasinya' : 'Pelanggan membagikan lokasinya', body: g.link ? 'Buka untuk melacak posisi langsung lewat Google Maps.' : 'Titik lokasi terbaru tersedia di peta pesanan.', ref: { v: side === 'worker' ? 'c_order' : 'w_job', id: bid } });
  await audit('track.share', 'tracks/' + bid, '', { side, kind: g.link ? (g.lat != null ? 'link+pin' : 'link') : 'pin' });
  toast(g.link ? 'Tautan lokasi Google Maps dibagikan' : 'Titik lokasi dibagikan');
  return true;
}
async function stopShareLink(bid, side) {
  await Store.patch('tracks', bid, { [side + 'Link']: null });
  if (GEO.bid === bid) stopGps(true);
  toast('Berbagi lokasi dihentikan');
}
function startGps(bid, side) {
  if (R.geo !== 'available') { toast('GPS langsung tidak tersedia di tampilan ini. Gunakan “Bagikan lokasi” dari Google Maps.', true); return; }
  stopGps(true);
  GEO.bid = bid; GEO.side = side; GEO.lastWrite = 0; GEO.last = null;
  try {
    GEO.watch = navigator.geolocation.watchPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) };
      const moved = GEO.last ? BL.haversineKm(GEO.last, p) * 1000 : Infinity;
      if (Date.now() - GEO.lastWrite < 8000 && moved < 25) return;
      GEO.last = p; GEO.lastWrite = Date.now();
      pushPosition(bid, side, p, 'gps').catch(() => {});
    }, err => {
      if (err.code === 1) R.geo = 'unavailable';
      toast(err.code === 1 ? 'Izin lokasi ditolak perangkat.' : 'Lokasi GPS belum dapat dibaca.', true);
      stopGps(true); scheduleRender();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    toast('GPS langsung aktif. Posisi Anda diperbarui otomatis.');
  } catch (e) { R.geo = 'unavailable'; toast('GPS tidak tersedia.', true); }
  scheduleRender();
}
function stopGps(silent) {
  if (GEO.watch != null) { try { navigator.geolocation.clearWatch(GEO.watch); } catch (e) {} }
  GEO.watch = null; GEO.bid = null; GEO.side = null;
  if (!silent) toast('GPS langsung dihentikan');
}
/** Simulasi perjalanan mitra (ditandai SIMULASI) agar tampilan pelacakan bisa diuji. */
async function simulateTrip(bid) {
  const b = Store.get('bookings', bid);
  if (!['ditugaskan', 'dalam_perjalanan'].includes(b.status)) return toast('Simulasi perjalanan tersedia sebelum mitra tiba.', true);
  if (GEO.sim) return toast('Simulasi sedang berjalan.', true);
  const t = trackOf(bid) || {};
  const end = custPoint(b).p;
  const w = prof(b.workerPid);
  let start = t.worker && t.worker.lat != null && t.worker.src !== 'simulasi' ? t.worker : BL.areaCentroid(w.area, CFG().region);
  if (!start || BL.haversineKm(start, end) < 0.4) start = { lat: end.lat + 0.016, lng: end.lng - 0.02 };
  const pts = BL.simRoute(start, end, 21).slice(0, 20);
  await ensureTrack(b);
  await Store.patch('tracks', bid, { path: [] });
  let i = 0;
  await pushPosition(bid, 'worker', pts[i++], 'simulasi');
  GEO.sim = { bid, timer: setInterval(() => {
    const cur = Store.get('bookings', bid);
    if (i >= pts.length || !cur || !['ditugaskan', 'dalam_perjalanan'].includes(cur.status)) { stopSim(); if (i >= pts.length) toast('Simulasi selesai: mitra hampir tiba'); return; }
    pushPosition(bid, 'worker', pts[i++], 'simulasi').catch(() => {});
  }, 3000) };
  await audit('track.simulate', 'tracks/' + bid, 'Uji tampilan pelacakan');
  toast('Simulasi perjalanan dimulai (±60 detik)');
  scheduleRender();
}
function stopSim() { if (GEO.sim) clearInterval(GEO.sim.timer); GEO.sim = null; scheduleRender(); }
function gmapsPin(p) { return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`; }
function gmapsDir(from, to, textDest) {
  const dest = to ? `${to.lat},${to.lng}` : encodeURIComponent(textDest || 'Kupang');
  return `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ''}&destination=${dest}&travelmode=driving`;
}

/* ---------- profil & verifikasi ---------- */
async function saveProfile(role, d) {
  if (!String(d.name || '').trim() || !String(d.phone || '').trim() || !d.area) return toast('Nama, nomor HP, dan wilayah wajib diisi.', true);
  if (!/^(\+62|62|0)8\d{7,12}$/.test(String(d.phone).replace(/[\s-]/g, ''))) return toast('Nomor HP tidak valid. Contoh: 081234567890', true);
  if (role === 'worker' && !(d.skills || []).length) return toast('Pilih minimal satu keahlian.', true);
  const id = d.id || rid(role === 'worker' ? 'w' : 'c');
  const existing = Store.get('profiles', id);
  const base = existing ? {} : { ownerUid: ME.uid, role, at: now(), prefs: { push: false, email: false } };
  const body = Object.assign(base, { name: d.name.trim(), phone: String(d.phone).replace(/[\s-]/g, ''), area: d.area, address: d.address || '' });
  if (d.photo !== undefined) body.photo = d.photo || null;
  if (role === 'worker') Object.assign(body, { skills: d.skills, bio: d.bio || '', tools: d.tools || '', experience: d.experience || '', certsClaimed: d.certsClaimed || {} }, existing ? {} : { verif: 'menunggu', certs: {}, online: false, avail: { days: [1, 2, 3, 4, 5, 6], start: '07:00', end: '18:00' }, areas: [] });
  if (role === 'customer' && !existing && String(d.address || '').trim()) body.addresses = { a0: { label: 'Rumah', area: d.area, detail: d.address.trim(), note: '', at: now() } };
  if (existing) await Store.patch('profiles', id, body); else await Store.set('profiles', id, body);
  if (role === 'worker' && d.docs) await Store.privSet('verif_' + id, { pid: id, docs: d.docs, at: now() });
  if (!existing && role === 'worker') {
    await notify('ops', 'verifreq:' + id, { type: 'verification_request', cat: 'sistem', title: 'Pendaftaran mitra baru', body: `${body.name} · ${(d.skills || []).map(c => BL.catById(c).name).join(', ')}`, ref: { v: 'a_worker', id } });
    await notify(id, 'verifwait:' + id, { type: 'verification_pending', cat: 'sistem', title: 'Pendaftaran diterima', body: 'Dokumen Anda sedang ditinjau tim verifikasi.', ref: { v: 'w_profile' } });
  }
  await audit(existing ? 'profile.update' : 'profile.create', 'profiles/' + id, '', { role });
  S.act[role] = id; saveUI();
  return id;
}
/** Perubahan kecil pada profil sendiri (foto, alamat, favorit, ketersediaan, area, portofolio). */
async function updateMyProfile(role, patch, label) {
  const me = actor(role);
  if (!me) { toast('Buat profil terlebih dahulu.', true); return false; }
  if (me.ownerUid !== ME.uid && !isTester()) { toast('Anda hanya dapat mengubah profil sendiri.', true); return false; }
  await Store.patch('profiles', me.id, Object.assign({}, patch, { updatedAt: now() }));
  if (label) await audit('profile.' + label, 'profiles/' + me.id, '');
  return true;
}
async function toggleFav(svcId) {
  const me = actor('customer'); if (!me) { toast('Buat profil pelanggan untuk menyimpan favorit.', true); return; }
  const on = !((me.favs || {})[svcId]);
  await updateMyProfile('customer', { favs: { [svcId]: on } });
  toast(on ? 'Disimpan ke favorit' : 'Dihapus dari favorit');
}
async function saveAddress(a) {
  if (!a.area || !String(a.detail || '').trim()) { toast('Kecamatan dan alamat wajib diisi.', true); return null; }
  const id = a.id || 'a' + Date.now().toString(36);
  await updateMyProfile('customer', { addresses: { [id]: { label: (a.label || 'Alamat').trim(), area: a.area, detail: a.detail.trim(), note: a.note || '', at: now(), removed: false } } }, 'address');
  return id;
}
/** Promo & banner: disimpan di konfigurasi dan disiarkan ke pelanggan sebagai notifikasi "Promosi". */
async function savePromo(p, broadcast) {
  if (!ME.isOwner) return toast('Hanya pemilik aplikasi yang dapat membuat promo.', true);
  if (!String(p.title || '').trim()) return toast('Judul promo wajib diisi.', true);
  const id = p.id || 'p' + Date.now().toString(36);
  const body = { title: p.title.trim(), body: (p.body || '').trim(), svc: p.svc || '', image: p.image || null, active: p.active !== false, at: p.at || now(), until: p.until || '' };
  await saveConfig({ banners: { [id]: body } }, p.id ? 'Ubah promo' : 'Promo baru: ' + body.title);
  if (broadcast) {
    const custs = Store.list('profiles').filter(x => x.role === 'customer' && !(x.prefs && x.prefs.promo === false)).slice(0, 300);
    for (const c of custs) await notify(c.id, 'promo:' + id, { type: 'promo', cat: 'promo', title: body.title, body: body.body || 'Lihat penawaran terbaru BERESIN.', ref: body.svc ? { v: 'c_service', id: body.svc } : { v: 'c_home' } });
    toast(`Promo dikirim ke ${custs.length} pelanggan`);
  }
  return id;
}
function activeBanners() {
  const b = CFG().banners || {};
  const today = todayISO(0);
  return Object.entries(b).filter(([, x]) => x && x.active !== false && (!x.until || x.until >= today)).sort((a, c) => c[1].at - a[1].at).map(([id, x]) => Object.assign({ id }, x));
}

async function verifyWorker(pid, decision, certs, reason) {
  if (!opsCan('workers')) return toast('Tidak berwenang.', true);
  if (decision !== 'terverifikasi' && !String(reason || '').trim()) return toast('Alasan wajib diisi.', true);
  const p = prof(pid);
  await Store.patch('profiles', pid, { verif: decision, certs: certs || {}, verifNote: reason || '', verifAt: now(), verifBy: ME.uid, online: decision === 'terverifikasi' ? p.online : false });
  await notify(pid, 'verif:' + pid + ':' + decision + ':' + now(), { type: 'verification_' + decision, cat: 'sistem', title: { terverifikasi: 'Akun mitra terverifikasi', ditolak: 'Verifikasi ditolak', ditangguhkan: 'Akun mitra ditangguhkan' }[decision], body: reason || 'Anda sekarang dapat menerima pesanan yang sesuai keahlian.', ref: { v: 'w_profile' } });
  await audit('worker.verify', 'profiles/' + pid, reason, { decision, certs });
  toast('Status verifikasi disimpan');
}
async function saveConfig(patch, reason) {
  if (!ME.isOwner) return toast('Hanya pemilik aplikasi yang dapat mengubah konfigurasi.', true);
  if (!String(reason || '').trim()) return toast('Alasan perubahan wajib diisi.', true);
  const cur = Store.get('config', 'main');
  if (cur) await Store.patch('config', 'main', Object.assign({}, patch, { updatedAt: now() }));
  else await Store.set('config', 'main', Object.assign({}, patch, { updatedAt: now() }));
  await audit('config.update', 'config/main', reason, patch);
  toast('Konfigurasi disimpan');
}
async function grantStaff(targetPid, staffRoleName, reason) {
  if (!ME.isOwner) return toast('Hanya pemilik yang dapat memberi peran staf.', true);
  if (!String(reason || '').trim()) return toast('Alasan wajib diisi.', true);
  const t = prof(targetPid);
  const id = 's_' + hash(t.ownerUid);
  const existing = Store.get('profiles', id);
  const body = { ownerUid: t.ownerUid, role: 'staff', staffRole: staffRoleName, name: t.name, phone: t.phone, area: t.area, at: now(), grantedBy: ME.uid, active: staffRoleName !== 'cabut' };
  if (existing) await Store.patch('profiles', id, body); else await Store.set('profiles', id, body);
  await audit('staff.grant', 'profiles/' + id, reason, { staffRole: staffRoleName });
  toast(staffRoleName === 'cabut' ? 'Peran staf dicabut' : 'Peran staf diberikan');
}

/* ---------- foto ---------- */
async function compressImage(file, maxSide) {
  maxSide = maxSide || 1280;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.84));
  } finally { URL.revokeObjectURL(url); }
}
async function uploadPhoto(file) {
  if (R.mode === 'local' || R.mode === 'loading') {
    const blob = await compressImage(file, 480);
    const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    return { url: dataUrl };
  }
  if (!R.assets) { toast('Unggah foto belum tersedia untuk akun ini.', true); return null; }
  try {
    const blob = await compressImage(file, 1920);
    const r = await R.assets.upload(blob, { type: 'image/jpeg' });
    return { id: r.id, url: r.url };
  } catch (e) {
    const code = e && e.code;
    toast(code === 'too_large' ? 'Foto terlalu besar.' : code === 'quota_or_state' ? 'Kuota penyimpanan foto penuh.' : code === 'rate_limited' ? 'Terlalu sering mengunggah, tunggu sebentar.' : 'Foto gagal diunggah.', true);
    return null;
  }
}
function photoSrc(p) { return p.url && p.url.startsWith('data:') ? p.url : (p.id ? '/_blob/' + p.id : p.url); }
/* =========================================================
   BERESIN — kerangka UI: status, navigasi, komponen, ikon
   ========================================================= */
const S = {
  role: 'customer',
  act: { customer: null, worker: null },
  nav: { customer: [{ v: 'c_home', p: {} }], worker: [{ v: 'w_home', p: {} }], ops: [{ v: 'a_dash', p: {} }] },
  d: {},
  sheet: null,
  ui: {},
  dirty: false,
  splash: { role: 'customer', until: Date.now() + 1300 }
};
let SHEET_CB = null;
function saveUI() { try { localStorage.setItem('beresin.ui', JSON.stringify({ role: S.role, act: S.act, loc: S.ui.loc || '' })); } catch (e) {} }
function loadUI() { try { const o = JSON.parse(localStorage.getItem('beresin.ui') || '{}'); if (o.role) S.role = o.role; if (o.act) S.act = Object.assign(S.act, o.act); if (o.loc) S.ui.loc = o.loc; S.splash.role = S.role === 'worker' ? 'worker' : 'customer'; } catch (e) {} }

/* ---------- ikon ---------- */
const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  receipt: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  pin: '<path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 21l5-3 5 3-1.5-7"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  snow: '<rect x="3" y="4" width="18" height="8" rx="2"/><path d="M7 9h10M8 16v3M12 15v5M16 16v3"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  hammer: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19 13 11"/>',
  car: '<path d="M5 16h14v-4l-2-5H7l-2 5z"/><path d="M3 12h18"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  paw: '<circle cx="6.5" cy="9.5" r="1.8"/><circle cx="10" cy="5.5" r="1.8"/><circle cx="14.5" cy="5.5" r="1.8"/><circle cx="18" cy="9.5" r="1.8"/><path d="M12 11c-3 0-6 3.5-6 6.2 0 1.5 1.4 2.3 3 2.3 1.2 0 2-.7 3-.7s1.8.7 3 .7c1.6 0 3-.8 3-2.3 0-2.7-3-6.2-6-6.2z"/>',
  basket: '<path d="M3 9h18l-2 11H5z"/><path d="M8 9l4-6 4 6M9 13v4M15 13v4"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  wallet: '<path d="M4 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4z"/><path d="M4 6a2 2 0 0 1 2-2h10v2M16 13h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a7 7 0 0 1 4 6.5"/>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  nav: '<path d="M3 11 22 2l-9 19-2-8z"/>',
  flag: '<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
  log: '<path d="M12 8v4l3 2"/><path d="M3.05 11a9 9 0 1 1 .5 4M3 4v5h5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/>',
  type: '<path d="M4 7V5h11v2M9.5 5v14M7 19h5M14 12v-1.5h7V12M17.5 10.5V19M16 19h3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14M10 11v6M14 11v6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'
};
function icon(name, size, extra) { return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ''}>${IC[name] || IC.info}</svg>`; }
function ficon(name, size) { return `<svg width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${IC[name] || IC.info}</svg>`; }
function starIcon(filled, size) { return `<svg width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${IC.star}</svg>`; }
function logo(size) {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><path fill="#16A34A" d="M12 10H33C41 10 46 15 46 21.5C46 25 44.5 28 42 30C46.5 32 50 36.5 50 42C50 49 44 54 36 54H12C10.9 54 10 53.1 10 52V12C10 10.9 10.9 10 12 10Z"/><path d="M19 33 27 41 43 25" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="55" cy="10" r="5.5" fill="#FACC15"/></svg>`;
}

/* ---------- komponen kecil ---------- */
function pill(text, tone) { return `<span class="pill ${tone || ''}">${esc(text)}</span>`; }
function statusPill(st) { const s = BL.BOOKING_STATUS[st] || { label: st, tone: '' }; return pill(s.label, s.tone); }
function simPill() { return '<span class="pill sim">SIMULASI</span>'; }
const AV_COLORS = ['#16A34A', '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#CA8A04', '#064E3B'];
function avatarColor(name) { let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
function avatar(name, cls, photo) { return `<div class="avatar ${cls || ''}" style="background:${avatarColor(name)}">${esc(initials(name))}${photo ? `<img src="${esc(photoSrc(photo))}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>`; }
function avatarP(p, cls) { return p ? avatar(p.name, cls, p.photo) : avatar('?', cls); }
function fmtCount(n) { return n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'rb' : String(n); }
function stars(avg, count, size) {
  if (!count) return `<span class="rating"><span class="pill primary">Baru</span></span>`;
  return `<span class="rating">${starIcon(true, size || 15)}<span>${avg.toFixed(1)}</span><span class="cnt">(${fmtCount(count)})</span></span>`;
}
function catIcon(catId, cls) { const c = BL.catById(catId) || { icon: 'info', tint: 'slate' }; const sz = cls && /\b(sm|xs)\b/.test(cls) ? 18 : 24; return `<span class="ico ${cls || ''} t-${c.tint}">${icon(c.icon, sz)}</span>`; }
function empty(ic, title, text, action) { return `<div class="empty">${icon(ic, 34)}<h3>${esc(title)}</h3>${text ? `<p class="small">${esc(text)}</p>` : ''}${action || ''}</div>`; }
function note(kind, ic, html) { return `<div class="note ${kind || ''}">${icon(ic || 'info', 18)}<div>${html}</div></div>`; }
function pagehead(title, opts) {
  opts = opts || {};
  const back = opts.back === false ? '<span></span>' : `<button class="backbtn" data-act="back" aria-label="Kembali">${icon('back', 22)}</button>`;
  return `<div class="pagehead ${opts.right && opts.wideRight ? 'wide-r' : ''}">${back}<h2>${esc(title)}</h2><div class="r">${opts.right || ''}</div></div>`;
}
function steps(labels, cur, icons) {
  return `<div class="steps">${labels.map((l, i) => `<div class="st ${i < cur ? 'done' : i === cur ? 'cur' : ''}"><span class="bub">${icons ? icon(icons[i], 15) : (i < cur ? icon('check', 15) : i + 1)}</span><span>${esc(l)}</span></div>`).join('')}</div>`;
}
function linesKV(lines, opts) {
  opts = opts || {};
  const total = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  return `<div class="kv">${lines.map(l => `<span class="small">${esc(l.name)}${l.qty > 1 && l.unitPrice ? `<span class="faint"> · ${l.qty} × ${rp(l.unitPrice)}</span>` : ''}${opts.types ? ` <span class="faint xs">${esc(BL.LINE_TYPE_LABEL[l.type] || l.type)}</span>` : ''}</span><span class="v small">${rp(l.amount)}</span>`).join('')}
    <div class="divider-dash"></div><span class="strong">${esc(opts.totalLabel || 'Total')}</span><span class="v total">${rp(total)}</span></div>`;
}
function photoGrid(list) {
  if (!list || !list.length) return '';
  return `<div class="photos">${list.map(p => `<img class="photo" src="${esc(photoSrc(p))}" alt="Foto lampiran" loading="lazy" onerror="this.style.visibility='hidden'">`).join('')}</div>`;
}
function canUpload() { return R.mode === 'local' || !!R.assets; }
function photoPicker(path, list, opts) {
  opts = opts || {};
  if (!canUpload()) return `<p class="xs muted">Unggah foto belum tersedia untuk akun ini.</p>`;
  return `<div class="photos"><label class="photo-add ${opts.big ? 'big' : ''}">${icon('camera', 22)}<span>${esc(opts.label || 'Tambah Foto')}</span><input type="file" accept="image/*" ${opts.single ? '' : 'multiple'} data-photo="${path}" ${opts.single ? 'data-single="1"' : ''}></label>
    ${(list || []).map((p, i) => `<div class="photo-wrap"><img class="photo ${opts.big ? 'big' : ''}" src="${esc(photoSrc(p))}" alt="Foto ${i + 1}" ${opts.big ? 'style="width:132px;height:96px"' : ''}><button type="button" data-act="photoDel" data-path="${path}" data-i="${i}" aria-label="Hapus foto">${icon('x', 12)}</button></div>`).join('')}</div>`;
}
function selectEl(path, value, options, attrs) {
  return `<select class="select" data-f="${path}" ${attrs || ''}>${options.map(o => { const v = typeof o === 'string' ? o : o.v; const l = typeof o === 'string' ? o : o.l; return `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
}
function areaOptions(withBlank) {
  const r = BL.REGIONS[CFG().region || 'kupang'];
  const opts = Object.entries(r.areas).map(([k, a]) => ({ v: k, l: a.name }));
  return withBlank ? [{ v: '', l: 'Pilih kecamatan' }].concat(opts) : opts;
}
function areaName(k) { const r = BL.REGIONS[CFG().region || 'kupang']; return (r.areas[k] || {}).name || k || '–'; }
function input(path, value, attrs) { return `<input class="input" data-f="${path}" value="${esc(value == null ? '' : value)}" ${attrs || ''}>`; }
function textarea(path, value, attrs) { return `<textarea class="textarea" data-f="${path}" ${attrs || ''}>${esc(value || '')}</textarea>`; }
function fld(label, control, opts) {
  opts = opts || {};
  return `<label class="field"><span>${esc(label)}${opts.req ? ' <em>*</em>' : ''}${opts.opt ? ' <span class="hint">(opsional)</span>' : ''}</span>${control}${opts.err ? `<span class="err">${esc(opts.err)}</span>` : ''}${opts.hint ? `<span class="hint">${esc(opts.hint)}</span>` : ''}</label>`;
}
function qtyCtl(path, val, min, cls) {
  return `<div class="qty ${cls || ''}"><button type="button" data-act="qty" data-path="${path}" data-d="-1" data-min="${min || 0}" aria-label="Kurangi">−</button><input type="number" inputmode="numeric" data-f="${path}" value="${esc(val == null ? '' : val)}" min="${min || 0}" aria-label="Jumlah"><button type="button" data-act="qty" data-path="${path}" data-d="1" data-min="${min || 0}" aria-label="Tambah">+</button></div>`;
}
/** Isian dinamis layanan. Angka & pilihan tampil sebaris (label kiri, kontrol kanan) seperti mockup. */
function dynField(f, val, err, base) {
  const path = `${base}.${f.k}`;
  if (f.t === 'num') return `<div class="frow"><span class="lab">${esc(f.l)}${f.u ? ` <span class="muted small">(${esc(f.u)})</span>` : ''}${f.req ? ' <em>*</em>' : ''}</span>${qtyCtl(path, val, f.min)}${err ? `<span class="err">${esc(err)}</span>` : ''}</div>`;
  if (f.t === 'sel') { let ctl = selectEl(path, val || '', [{ v: '', l: 'Pilih' }].concat(f.o)); if (err) ctl = ctl.replace('class="select"', 'class="select bad"'); return `<label class="frow"><span class="lab">${esc(f.l)}${f.req ? ' <em>*</em>' : ''}</span>${ctl}${err ? `<span class="err">${esc(err)}</span>` : ''}</label>`; }
  const ctl = f.t === 'area' ? textarea(path, val, `placeholder="${esc(f.ph || '')}" ${err ? 'class="textarea bad"' : ''}`) : input(path, val, `placeholder="${esc(f.ph || '')}"`);
  return fld(f.l, ctl, { req: f.req, err });
}
/** Tombol geser untuk konfirmasi (seperti "Tiba di Lokasi" di mockup). */
function slider(label, act, data) {
  const attrs = Object.entries(data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<div class="slider" data-slide="${act}" ${attrs}><span class="trail"></span><button type="button" class="knob" aria-label="Geser untuk ${esc(label)}">${icon('chev', 24)}</button><span class="lbl">${esc(label)}</span></div>`;
}
/** Foto layanan: unggahan admin → foto bawaan → null (pakai ilustrasi). */
const DEFAULT_SVC_PHOTO = { ac_cuci: 'heroAc', ac_freon: 'heroAc', ac_pasang: 'heroAc', b_ac_gedung: 'heroAc', k_rumah: 'rumah', k_kantor: 'rumah' };
function catPhoto(catId) { const c = (CFG().cats || {})[catId]; return c && c.photo ? photoSrc(c.photo) : null; }
function svcPhoto(s) {
  const o = (CFG().services || {})[s.id];
  if (o && o.photo) return photoSrc(o.photo);
  const cp = catPhoto(s.cat);
  if (cp) return cp;
  const k = DEFAULT_SVC_PHOTO[s.id];
  return k && typeof IMG !== 'undefined' ? IMG[k] : null;
}

/* ---------- draf & jalur ---------- */
function getPath(path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S.d); }
function setPath(path, val) {
  const ks = path.split('.'); let o = S.d;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}
function draft(key, init) { if (!S.d[key]) S.d[key] = typeof init === 'function' ? init() : (init || {}); return S.d[key]; }

/* ---------- navigasi ---------- */
function cur() { const st = S.nav[S.role]; return st[st.length - 1]; }
function go(v, p) { S.nav[S.role].push({ v, p: p || {} }); scheduleRender(true); window.scrollTo(0, 0); }
function back() { const st = S.nav[S.role]; if (st.length > 1) st.pop(); scheduleRender(true); window.scrollTo(0, 0); }
function tab(v, p) { S.nav[S.role] = [{ v, p: p || {} }]; scheduleRender(true); window.scrollTo(0, 0); }
function replace(v, p) { const st = S.nav[S.role]; st[st.length - 1] = { v, p: p || {} }; scheduleRender(true); window.scrollTo(0, 0); }
function setRole(r) {
  const changed = S.role !== r;
  S.role = r; saveUI();
  if (changed && r !== 'ops') { S.splash = { role: r, until: Date.now() + 850 }; setTimeout(() => scheduleRender(true), 900); }
  scheduleRender(true); window.scrollTo(0, 0);
}

/* ---------- toast & lembar ---------- */
let toastT = null;
function toast(msg, bad) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, bad ? 4200 : 2600);
}
function ask(o) {
  S.sheet = Object.assign({ kind: 'ask', fields: [], ok: 'Simpan' }, o);
  S.d.__sheet = {};
  for (const f of S.sheet.fields) S.d.__sheet[f.k] = f.value != null ? f.value : '';
  SHEET_CB = o.onOk;
  scheduleRender(true);
}
function sheetHtml(title, html) { S.sheet = { kind: 'html', title, html }; SHEET_CB = null; scheduleRender(true); }
function closeSheet() { S.sheet = null; SHEET_CB = null; scheduleRender(true); }
function renderSheet() {
  const s = S.sheet; if (!s) return '';
  let body = '';
  if (s.kind === 'ask') {
    body = `<div class="stack"><h3>${esc(s.title)}</h3>${s.body ? `<div class="small muted">${s.body}</div>` : ''}
      ${s.fields.map(f => {
        const path = `__sheet.${f.k}`; const v = S.d.__sheet[f.k];
        const ctl = f.type === 'select' ? selectEl(path, v, f.options) : f.type === 'number' ? input(path, v, 'type="number" inputmode="numeric"') : f.type === 'text' ? input(path, v, `placeholder="${esc(f.ph || '')}"`) : f.type === 'date' ? `<input type="date" class="input" data-f="${path}" value="${esc(v)}">` : f.type === 'photo' ? photoPicker(path, v || [], { single: true }) : textarea(path, v, `placeholder="${esc(f.ph || '')}"`);
        return fld(f.label, ctl, { req: f.req, hint: f.hint });
      }).join('')}
      <div class="btnrow"><button class="btn btn-ghost" data-act="sheetCancel">Batal</button><button class="btn ${s.danger ? 'btn-danger' : 'btn-primary'}" data-act="sheetOk">${esc(s.ok)}</button></div></div>`;
  } else body = typeof s.html === 'function' ? s.html() : s.html;
  return `<div class="overlay" data-act="sheetBackdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(s.title || 'Dialog')}" data-stop>${body}</div></div>`;
}

/* ---------- layar pembuka ---------- */
function splashHtml(role) {
  const tag = role === 'worker' ? 'Kerja lebih mudah,<br>penghasilan lebih baik.' : 'Urusan beres,<br>hidup lebih mudah.';
  return `<div class="splash" aria-hidden="true"><svg class="blobs" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
    <path d="M400 0H230C250 60 300 90 340 120C370 145 390 190 400 230Z" fill="#16A34A"/>
    <path d="M400 0H300C320 40 350 60 380 70C392 74 398 80 400 90Z" fill="#22C55E"/>
    <path d="M0 520C60 540 110 600 120 680C126 730 110 770 90 800H0Z" fill="#16A34A"/>
    <path d="M0 610C40 620 70 660 74 710C77 750 66 780 54 800H0Z" fill="#22C55E"/>
    <path d="M400 600C350 610 300 650 270 710C255 740 250 770 252 800H400Z" fill="#FACC15"/>
    <path d="M400 690C370 700 345 730 335 765C331 780 330 792 331 800H400Z" fill="#FDE047"/>
  </svg><div class="mid">${logo(120)}<div class="word">Beresin</div><p class="tag">${tag}</p></div></div>`;
}

/* ---------- render ---------- */
let renderQueued = false;
function isTyping() {
  const a = document.activeElement;
  if (!a || !a.closest || !a.closest('#app')) return false;
  return a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'button', 'submit'].includes(a.type)) || a.tagName === 'SELECT';
}
function scheduleRender(force) {
  if (force) { doRender(true); return; }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; doRender(false); });
}
function viewHtml() {
  const c = cur();
  const fn = VIEWS[c.v];
  if (!fn) return empty('alert', 'Halaman tidak ditemukan', '', `<button class="btn btn-primary" data-act="home">Ke beranda</button>`);
  try { return fn(c.p || {}); }
  catch (e) { console.error(e); return note('danger', 'alert', 'Terjadi kesalahan saat menampilkan halaman ini. Coba kembali lalu buka lagi.'); }
}
function refreshLive() {
  const live = document.querySelectorAll('[data-live]');
  if (!live.length) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = viewHtml();
  live.forEach(el => { const n = tmp.querySelector(`[data-live="${el.dataset.live}"]`); if (n && n.innerHTML !== el.innerHTML) el.innerHTML = n.innerHTML; });
}
function doRender(force) {
  const app = $('#app');
  if (!app) return;
  if (!force && isTyping()) { S.dirty = true; refreshLive(); return; }
  S.dirty = false;
  if (R.needLogin) { app.innerHTML = loginScreen(); return; }
  const loading = R.mode === 'loading' || !allReady();
  if (loading || Date.now() < S.splash.until) {
    app.innerHTML = splashHtml(S.splash.role);
    if (!loading) setTimeout(() => scheduleRender(true), Math.max(0, S.splash.until - Date.now()) + 20);
    return;
  }
  if (S.role === 'ops' && !staffRole()) S.role = 'customer';
  const c = cur();
  const wide = S.role === 'ops';
  const html = viewHtml();
  const noTab = S.role === 'ops' || html.includes('class="actionbar"') || ['chat', 'c_book', 'c_service', 'w_job'].includes(c.v);
  app.innerHTML = `${topbar()}<main class="shell ${wide ? 'wide' : ''}" id="main">${banner()}${html}<p class="foot">BERESIN · Kupang, NTT · pembayaran & pencairan mode simulasi</p></main>${noTab ? '' : tabbar()}${renderSheet()}`;
}
function banner() {
  const parts = [];
  if (R.mode === 'local') parts.push(`<div class="modechip">${icon('info', 15)}<span><b>Mode demo</b> · data tersimpan di perangkat ini saja</span></div>`);
  if (R.mode === 'remote' && R.readonly) parts.push(note('warn', 'lock', '<b>Mode baca saja.</b> Akun Anda baru bisa melihat. Minta pemilik aplikasi memberi Anda akses yang bisa berinteraksi (Contributor) lewat menu Bagikan.'));
  if (R.error === 'revoked') parts.push(note('danger', 'alert', 'Akses ke data telah berubah. Muat ulang halaman.'));
  return parts.length ? `<div class="stack-sm" style="margin-bottom:12px">${parts.join('')}</div>` : '';
}
function topbar() {
  const ops = R.mode !== 'loading' && staffRole();
  const roles = [['customer', 'Pelanggan'], ['worker', 'Mitra']].concat(ops ? [['ops', 'Operasional']] : []);
  return `<header class="topbar"><div class="topbar-in">
    <button class="brand" data-act="home" aria-label="Beranda">${logo(24)}<b>Beresin</b></button>
    <span class="sync ${shared() ? 'ok' : ''}" title="${shared() ? 'Tersinkron dengan database bersama' : 'Data hanya di perangkat ini'}"><i></i><span>${shared() ? 'Online' : 'Demo'}</span></span>
    <nav class="rolesw" aria-label="Pilih aplikasi">${roles.map(([k, l]) => `<button data-act="role" data-r="${k}" aria-pressed="${S.role === k}">${l}</button>`).join('')}</nav>
  </div></header>`;
}
function tabbar() {
  const pid = actingPid(S.role);
  const unread = pid ? notifsFor([pid]).filter(n => !n.read).length : 0;
  const chats = pid ? unreadChats(pid) : 0;
  const tabs = S.role === 'customer'
    ? [['c_home', 'home', 'Beranda'], ['c_orders', 'receipt', 'Pesanan'], ['c_chats', 'chat', 'Chat', chats], ['notifs', 'bell', 'Notifikasi', unread], ['c_account', 'user', 'Akun']]
    : [['w_home', 'home', 'Beranda'], ['w_jobs', 'receipt', 'Pesanan'], ['w_chats', 'chat', 'Chat', chats], ['notifs', 'bell', 'Notifikasi', unread], ['w_profile', 'user', 'Akun']];
  const root = S.nav[S.role][0].v;
  return `<nav class="tabbar" aria-label="Navigasi utama"><div class="tabbar-in">${tabs.map(([v, ic, l, n]) => `<button class="tab" data-act="tab" data-v="${v}" ${root === v ? 'aria-current="page"' : ''}>${root === v && ['home', 'bell', 'user'].includes(ic) ? ficon(ic, 22) : icon(ic, 22)}<span>${l}</span>${n ? `<span class="dotn">${n > 9 ? '9+' : n}</span>` : ''}</button>`).join('')}</div></nav>`;
}
function actionbar(inner) { return `<div class="actionbar"><div class="actionbar-in">${inner}</div></div>`; }

/* ---------- penanganan event ---------- */
const A = {};
function runAct(name, data, el) {
  const fn = A[name]; if (!fn) return;
  Promise.resolve(fn(data, el)).catch(err => { console.error(err); }).finally(() => scheduleRender());
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'sheetBackdrop' && e.target.closest('[data-stop]')) return;
  if (!A[el.dataset.act]) return;
  e.preventDefault();
  runAct(el.dataset.act, el.dataset, el);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-f]');
  if (!el) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'number') v = el.value === '' ? '' : Number(el.value);
  setPath(el.dataset.f, v);
  refreshLive();
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.matches('select[data-f], input[type=checkbox][data-f]')) { scheduleRender(true); return; }
  if (el.matches('input[type=file][data-photo]')) {
    const path = el.dataset.photo; const files = Array.from(el.files || []).slice(0, 6);
    if (!files.length) return;
    toast('Mengunggah foto…');
    let list = el.dataset.single ? [] : (getPath(path) || []).slice();
    for (const f of files) { if (!/^image\//.test(f.type)) { toast('Hanya file gambar yang didukung.', true); continue; } const r = await uploadPhoto(f); if (r) list.push(r); }
    setPath(path, list); el.value = '';
    if (el.dataset.after && A[el.dataset.after]) await A[el.dataset.after]({ path });
    toast('Foto ditambahkan'); scheduleRender(true);
  }
});
document.addEventListener('focusout', () => { setTimeout(() => { if (S.dirty && !isTyping()) doRender(true); }, 0); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.sheet) closeSheet();
  if (e.key === 'Enter' && e.target.matches('[data-enter]')) { e.preventDefault(); runAct(e.target.dataset.enter, e.target.dataset, e.target); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.slider .knob')) { e.preventDefault(); const tr = e.target.parentElement; runAct(tr.dataset.slide, tr.dataset, tr); }
});
/* geser untuk konfirmasi */
let SL = null;
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('.slider .knob'); if (!h) return;
  const track = h.parentElement;
  SL = { h, track, x0: e.clientX, max: track.clientWidth - h.offsetWidth - 10, dx: 0 };
  try { h.setPointerCapture(e.pointerId); } catch (err) {}
  h.style.transition = 'none';
});
document.addEventListener('pointermove', e => {
  if (!SL) return;
  SL.dx = Math.max(0, Math.min(SL.max, e.clientX - SL.x0));
  SL.h.style.transform = `translateX(${SL.dx}px)`;
  SL.track.style.setProperty('--p', (SL.dx / SL.max).toFixed(3));
});
function endSlide() {
  if (!SL) return;
  const s = SL; SL = null; s.h.style.transition = '';
  if (s.dx >= s.max * 0.85) { s.h.style.transform = `translateX(${s.max}px)`; runAct(s.track.dataset.slide, s.track.dataset, s.track); }
  else { s.h.style.transform = ''; s.track.style.setProperty('--p', 0); if (s.dx < 6) toast('Geser tombol ke kanan untuk konfirmasi'); }
}
document.addEventListener('pointerup', endSlide);
document.addEventListener('pointercancel', endSlide);

Object.assign(A, {
  back: () => back(),
  home: () => tab(S.role === 'customer' ? 'c_home' : S.role === 'worker' ? 'w_home' : 'a_dash'),
  tab: d => tab(d.v),
  go: d => go(d.v, d.id ? { id: d.id, x: d.x } : (d.x ? { x: d.x } : {})),
  role: d => setRole(d.r),
  sheetCancel: () => closeSheet(),
  sheetBackdrop: () => closeSheet(),
  async sheetOk() {
    const vals = Object.assign({}, S.d.__sheet);
    for (const f of (S.sheet.fields || [])) if (f.req && !String(vals[f.k] == null ? '' : vals[f.k]).trim()) { toast(`${f.label} wajib diisi.`, true); return; }
    const cb = SHEET_CB; closeSheet();
    if (cb) await cb(vals);
    scheduleRender(true);
  },
  qty(d) { const v = Number(getPath(d.path)) || 0; setPath(d.path, Math.max(Number(d.min) || 0, v + Number(d.d))); scheduleRender(true); },
  photoDel(d) { const l = (getPath(d.path) || []).slice(); l.splice(Number(d.i), 1); setPath(d.path, l); scheduleRender(true); },
  ui(d) { S.ui[d.k] = d.val; scheduleRender(true); },
  noop: () => {}
});
const VIEWS = {};
/* =========================================================
   BERESIN — adaptor Firebase untuk hosting sendiri
   Aktif bila window.BERESIN_CONFIG.firebase diisi (lihat app/config.js).
   Firestore menyimpan koleksi yang sama dengan database artifact;
   login memakai akun Google (Firebase Authentication).
   ========================================================= */
async function initFirebase() {
  const cfg = window.BERESIN_CONFIG;
  if (!firebase.apps.length) firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const fs = firebase.firestore();
  R.fb = { auth, fs, storage: firebase.storage ? firebase.storage() : null };
  R.mode = 'firebase';
  // driver dengan bentuk yang sama seperti database artifact
  R.db = {
    doc(path) {
      const ref = fs.doc(path);
      return {
        set: body => ref.set(body),
        update: body => ref.set(body, { merge: true }),
        get: async () => { const s = await ref.get(); return { exists: s.exists, id: s.id, data: () => s.data() }; },
        acquire: async ({ holder }) => {
          // klaim lewat transaksi: hanya berhasil bila belum ada pemegang aktif
          const lockRef = fs.doc('locks/' + path.replace(/\//g, '__'));
          try {
            const ok = await fs.runTransaction(async tx => {
              const s = await tx.get(lockRef);
              const d = s.exists ? s.data() : null;
              if (d && d.holder !== holder && d.until > Date.now()) return false;
              tx.set(lockRef, { holder, until: Date.now() + 8000 });
              return true;
            });
            return { acquired: ok };
          } catch (e) { return { acquired: false }; }
        }
      };
    }
  };
  R.assets = R.fb.storage ? {
    upload: async blob => {
      const ref = R.fb.storage.ref(`uploads/${ME.uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`);
      await ref.put(blob, { contentType: 'image/jpeg' });
      return { url: await ref.getDownloadURL() };
    }
  } : null;
  R.downloads = null;
  const user = await new Promise(res => { const un = auth.onAuthStateChanged(u => { un(); res(u); }); });
  auth.onAuthStateChanged(u => { if (!u && R.fbUser) location.reload(); });
  if (!user) { R.needLogin = true; R.fbUser = null; COLS.forEach(c => { R.ready[c] = true; }); scheduleRender(true); return; }
  R.fbUser = user; R.needLogin = false;
  ME.uid = user.uid; ME.name = user.displayName || ''; ME.email = user.email || '';
  ME.isOwner = (cfg.owners || []).map(e => String(e).toLowerCase()).includes(String(user.email || '').toLowerCase());
  ME.canWrite = true;
  for (const c of COLS) {
    if (c === 'audit' && !ME.isOwner) { R.ready[c] = true; continue; } // log audit hanya untuk admin
    let q = fs.collection(c);
    if (c === 'notifications') q = q.orderBy('at', 'desc').limit(800);
    if (c === 'audit') q = q.orderBy('at', 'desc').limit(400);
    q.onSnapshot(snap => {
      const m = {};
      snap.forEach(d => { m[d.id] = Object.assign({}, d.data(), { id: d.id }); });
      D[c] = m; R.ready[c] = true; scheduleRender();
    }, err => { R.error = err && err.code; R.ready[c] = true; scheduleRender(); });
  }
  scheduleRender(true);
}
function loginScreen() {
  return `<div class="splash" style="position:fixed"><div class="mid" style="gap:10px">${logo(104)}<div class="word">Beresin</div><p class="tag">Urusan beres, hidup lebih mudah.</p>
    <button class="btn btn-primary btn-lg" style="margin-top:18px;min-width:260px" data-act="fbLogin">${googleG()} Masuk dengan Google</button>
    <p class="xs" style="color:#64748B;max-width:300px;margin-top:6px">Dengan masuk, Anda menyetujui ketentuan layanan dan kebijakan privasi BERESIN.</p></div></div>`;
}
function googleG() { return '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'; }
A.fbLogin = async () => {
  const p = new firebase.auth.GoogleAuthProvider();
  try { await R.fb.auth.signInWithPopup(p); location.reload(); }
  catch (e) { if (e && /popup/.test(e.code || '')) { await R.fb.auth.signInWithRedirect(p); } else toast('Gagal masuk: ' + ((e && e.message) || 'coba lagi'), true); }
};
A.fbLogout = async () => { await R.fb.auth.signOut(); location.reload(); };
/* =========================================================
   BERESIN — aplikasi Pelanggan (+ halaman bersama)
   ========================================================= */
function custGate(nextLabel) {
  return `<div class="card raise stack" style="text-align:center;align-items:center">${logo(56)}<h3>Lengkapi profil untuk ${esc(nextLabel || 'melanjutkan')}</h3><p class="small muted">Satu profil untuk memesan semua layanan BERESIN di Kupang.</p><button class="btn btn-primary btn-block" data-act="go" data-v="c_register">Buat profil pelanggan</button></div>`;
}
function testerSwitch(role) {
  if (!isTester()) return '';
  const list = Store.list('profiles').filter(p => p.role === role);
  if (!list.length) return '';
  const curPid = actingPid(role) || '';
  return `<details class="card soft tester-switch"><summary class="small strong" style="cursor:pointer">Mode uji admin · bertindak sebagai ${esc((prof(curPid) || {}).name || '…')}</summary><div class="stack-sm" style="margin-top:8px">
    ${selectEl('__act.' + role, curPid, [{ v: '', l: 'Profil saya sendiri' }].concat(list.map(p => ({ v: p.id, l: `${p.name}${p.demo ? ' (contoh)' : ''}${p.ownerUid === ME.uid ? ' · milik saya' : ''}` }))), `data-actsel="${role}"`)}
    <p class="xs muted">Hanya admin yang melihat pilihan ini, untuk menguji alur dari sisi pengguna lain.</p></div></details>`;
}
document.addEventListener('change', e => {
  const el = e.target.closest('[data-actsel]');
  if (!el) return;
  S.act[el.dataset.actsel] = el.value || null;
  const mine = myProfiles(el.dataset.actsel)[0];
  if (!el.value && mine) S.act[el.dataset.actsel] = mine.id;
  saveUI(); scheduleRender(true);
});
function greetWord() { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; }
function locArea() { const me = actor('customer'); return S.ui.loc || (me && me.area) || ''; }

/* ---------- Beranda ---------- */
VIEWS.c_home = () => {
  const me = actor('customer');
  const q = (S.d.search && S.d.search.q) || '';
  const active = me ? Store.list('bookings').filter(b => b.customerPid === me.id && !['selesai', 'dibatalkan'].includes(b.status)).sort((a, b) => b.at - a.at) : [];
  const unpaid = me ? Store.list('invoices').filter(i => i.customerPid === me.id && ['belum_dibayar', 'gagal', 'menunggu_pembayaran'].includes(i.status)) : [];
  const unread = me ? notifsFor([me.id]).filter(n => !n.read).length : 0;
  const popular = BL.SERVICES.filter(s => s.popular).map(s => svc(s.id)).filter(s => !s.inactive);
  const favs = me ? Object.keys(me.favs || {}).filter(k => me.favs[k]).map(id => svc(id)).filter(Boolean) : [];
  const banners = activeBanners();
  const area = locArea();
  const cats = BL.CATEGORIES.slice(0, 7);
  return `<div class="stack">
    <div class="apphead"><span class="wordmark">${logo(34)}Beresin</span>
      <button class="locchip" data-act="pickLoc" aria-label="Pilih lokasi">${area ? esc(areaName(area)) : 'Kupang'}, NTT ${icon('down', 14)}</button>
      <button class="ghostico" data-act="tab" data-v="notifs" aria-label="Notifikasi">${icon('bell', 22)}${unread ? `<span class="dotn">${unread > 9 ? '9+' : unread}</span>` : ''}</button></div>
    <div class="greet"><div><h2>${greetWord()}${me ? ', ' + esc(me.name.split(' ')[0]) : ''}</h2><p>Mau beresin apa hari ini?</p></div></div>
    <label class="search">${icon('search', 18)}<input data-f="search.q" value="${esc(q)}" placeholder="Cari layanan, misalnya &quot;cuci AC&quot;" aria-label="Cari layanan" type="search"></label>
    <div data-live="searchres">${searchResults(q)}</div>
    <div class="stack-sm"><div class="banners" id="bnr">
      <button class="banner" data-act="go" data-v="c_service" data-id="ac_cuci"><div class="txt"><h2>Urusan beres,<br>hidup lebih mudah.</h2><span class="cta">Pesan Sekarang</span></div><div class="pic"><img src="${IMG.bannerWoman}" alt=""></div></button>
      ${banners.map(b => `<button class="banner" data-act="openPromo" data-id="${b.id}"><div class="txt"><span class="pill accent" style="align-self:flex-start">Promo</span><h2>${esc(b.title)}</h2>${b.body ? `<p>${esc(b.body)}</p>` : ''}<span class="cta">${b.svc ? 'Pesan Sekarang' : 'Lihat'}</span></div><div class="pic">${b.image ? `<img src="${esc(photoSrc(b.image))}" alt="">` : `<span style="position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.35)">${icon(b.svc ? BL.catById((svc(b.svc) || {}).cat || 'ac').icon : 'megaphone', 64)}</span>`}</div></button>`).join('')}
    </div>${banners.length ? `<div class="dots">${[0].concat(banners.map((_, i) => i + 1)).map(i => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>
    ${unpaid.length ? `<button class="card raise row" data-act="go" data-v="c_pay" data-id="${unpaid[0].id}" style="text-align:left;width:100%"><span class="ico sm solid t-amber">${icon('money', 18)}</span><div class="grow"><h4>Tagihan menunggu pembayaran</h4><p class="small muted"><span class="mono">${esc(unpaid[0].code)}</span> · ${rp(unpaid[0].totals.total)}</p></div>${icon('chev', 18, ' class="chev"')}</button>` : ''}
    ${active.slice(0, 2).map(b => activeCard(b)).join('')}
    ${installCard()}
    <div class="catgrid">${cats.map(c => `<button class="cat" data-act="go" data-v="c_cat" data-id="${c.id}">${catIcon(c.id)}<span>${esc(c.name)}</span></button>`).join('')}
      <button class="cat" data-act="go" data-v="c_cat" data-id="all"><span class="ico t-violet">${icon('grid', 24)}</span><span>Lainnya</span></button></div>
    <section class="stack-sm"><div class="sectionhead"><h3>Layanan Populer</h3><button class="linkbtn" data-act="go" data-v="c_cat" data-id="all">Lihat Semua ${icon('chev', 14)}</button></div>
      <div class="svc-scroll">${popular.map(s => svcCard(s)).join('')}</div></section>
    ${favs.length ? `<section class="stack-sm"><div class="sectionhead"><h3>Favorit Anda</h3></div><div class="svc-scroll">${favs.map(s => svcCard(s)).join('')}</div></section>` : ''}
    <div class="trustrow"><div>${icon('shield', 22)}Mitra terverifikasi</div><div>${icon('tag', 22)}Harga transparan</div><div>${icon('award', 22)}Bergaransi</div></div>
  </div>`;
};
A.pickLoc = () => ask({ title: 'Lokasi Anda', body: 'Dipakai untuk memperkirakan jarak & biaya perjalanan. Saat ini melayani Kota Kupang dan sekitarnya.', fields: [{ k: 'a', label: 'Kecamatan', type: 'select', options: areaOptions(true), value: locArea() }], ok: 'Pakai lokasi ini', onOk: v => { S.ui.loc = v.a; saveUI(); } });
A.openPromo = d => { const b = (CFG().banners || {})[d.id]; if (b && b.svc && svc(b.svc)) go('c_service', { id: b.svc }); else sheetHtml(b.title, `<div class="stack">${b.image ? `<img src="${esc(photoSrc(b.image))}" alt="" style="width:100%;border-radius:14px;max-height:220px;object-fit:cover">` : ''}<h3>${esc(b.title)}</h3><p class="muted">${esc(b.body || '')}</p>${b.until ? `<p class="small">Berlaku hingga ${esc(b.until)}</p>` : ''}<button class="btn btn-primary" data-act="sheetCancel">Tutup</button></div>`); };
document.addEventListener('scroll', e => { const el = e.target; if (!el || !el.id || el.id !== 'bnr') return; const i = Math.round(el.scrollLeft / el.clientWidth); el.parentElement.querySelectorAll('.dots i').forEach((d, k) => d.classList.toggle('on', k === i)); }, true);

function svcCard(s) {
  const c = BL.catById(s.cat); const r = svcRating(s.id); const ph = svcPhoto(s);
  return `<button class="svc-card t-${c.tint}" data-act="go" data-v="c_service" data-id="${s.id}"><div class="art">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : icon(c.icon, 40)}</div><div class="body"><div class="name clip1">${esc(s.name)}</div><div class="xs muted">${priceFrom(s, true)}</div>${r.count ? `<div class="xs">${stars(r.avg, r.count, 12)}</div>` : ''}</div></button>`;
}
function priceFrom(s, short) {
  if (s.model === 'base_km') return `Mulai ${rp(s.base)}`;
  if (['unit', 'point', 'hour'].includes(s.model)) return short ? `Mulai ${rp(s.price)}` : `${rp(s.price)} / ${s.unit}${s.minQty > 1 ? ` · min. ${s.minQty}` : ''}`;
  if (s.model === 'sqm') return short ? `Mulai ${rp(s.price * (s.minQty || 1))}` : `${rp(s.price)} / m² · min. ${s.minQty} m²`;
  if (s.model === 'inspection') return short ? `Cek ${rp(s.price)}` : `Biaya cek ${rp(s.price)} · harga final setelah inspeksi`;
  if (s.model === 'project' || s.model === 'custom') return short ? `Mulai ${rp(s.price)}` : `Mulai ${rp(s.price)} · survei gratis`;
  return `${short ? 'Mulai ' : ''}${rp(s.price)}${short ? '' : ' / ' + s.unit}`;
}
function searchResults(q) {
  q = String(q || '').trim().toLowerCase();
  if (q.length < 2) return '';
  const res = BL.SERVICES.filter(s => (s.name + ' ' + s.desc + ' ' + BL.catById(s.cat).long).toLowerCase().includes(q)).map(s => svc(s.id)).filter(s => !s.inactive).slice(0, 8);
  if (!res.length) return `<p class="small muted">Tidak ada layanan untuk “${esc(q)}”. Coba kata lain, misalnya “AC”, “bersih”, atau “pindahan”.</p>`;
  return `<div class="list">${res.map(s => `<button class="li" data-act="go" data-v="c_service" data-id="${s.id}">${catIcon(s.cat, 'sm')}<div class="grow"><div class="strong">${esc(s.name)}</div><div class="small muted">${priceFrom(s)}</div></div>${icon('chev', 18, ' class="chev"')}</button>`).join('')}</div>`;
}
function activeCard(b) {
  const w = prof(b.workerPid);
  const pending = BL.quotesOf(b, null, 'menunggu').length;
  return `<button class="card raise stack-sm" data-act="go" data-v="c_order" data-id="${b.id}" style="text-align:left;width:100%">
    <div class="row between"><span class="label">Pesanan berlangsung</span>${statusPill(b.status)}</div>
    <div class="row">${w ? avatarP(w, 'sm') : catIcon(b.cat, 'sm')}<div class="grow"><h4>${esc(b.serviceName)}</h4><p class="small muted">${w ? esc(w.name) + ' · ' : 'Mencari mitra · '}<span class="mono">${esc(b.code)}</span></p></div>${icon('chev', 18, ' class="chev"')}</div>
    ${pending ? note('warn', 'alert', `<b>${pending} penawaran</b> menunggu persetujuan Anda.`) : ''}
    ${b.status === 'menunggu_konfirmasi' ? note('warn', 'check', 'Laporan akhir tersedia. Konfirmasi hasil pekerjaan.') : ''}</button>`;
}

/* ---------- Kategori ---------- */
VIEWS.c_cat = p => {
  const all = p.id === 'all';
  const c = all ? null : BL.catById(p.id);
  const list = BL.SERVICES.filter(s => all || s.cat === p.id).map(s => svc(s.id)).filter(s => !s.inactive);
  const row = s => { const ph = svcPhoto(s); const cc = BL.catById(s.cat); const r = svcRating(s.id); return `<button class="li" data-act="go" data-v="c_service" data-id="${s.id}">${ph ? `<img src="${esc(ph)}" alt="" style="width:64px;height:52px;border-radius:12px;object-fit:cover;flex:none">` : `<span class="ico sq t-${cc.tint}" style="width:64px;height:52px">${icon(cc.icon, 24)}</span>`}<div class="grow"><div class="strong">${esc(s.name)}</div><div class="small muted">${priceFrom(s)}</div><div class="xs faint">${esc(s.dur)}${s.risk === 'high' ? ' · mitra bersertifikat' : ''}</div></div>${r.count ? stars(r.avg, r.count, 12) : ''}${icon('chev', 18, ' class="chev"')}</button>`; };
  if (all) {
    return `<div class="stack">${pagehead('Semua Layanan')}<div class="catgrid">${BL.CATEGORIES.map(x => `<button class="cat" data-act="go" data-v="c_cat" data-id="${x.id}">${catIcon(x.id)}<span>${esc(x.name)}</span></button>`).join('')}</div>
      ${BL.CATEGORIES.map(x => `<section class="stack-sm"><h3>${esc(x.long)}</h3><div class="list">${list.filter(s => s.cat === x.id).map(row).join('')}</div></section>`).join('')}</div>`;
  }
  const cph = catPhoto(c.id);
  return `<div class="stack">${pagehead(c.name)}${cph ? `<div class="dhero bleed" style="height:170px;margin-top:0"><img src="${esc(cph)}" alt="${esc(c.long)}"></div>` : ''}<div class="row">${catIcon(c.id)}<div><h3>${esc(c.long)}</h3><p class="small muted">${list.length} layanan · mitra di wilayah Kupang</p></div></div><div class="list">${list.map(row).join('')}</div></div>`;
};

/* ---------- Detail layanan ---------- */
VIEWS.c_service = p => {
  const s = svc(p.id); if (!s) return empty('alert', 'Layanan tidak ditemukan');
  const c = BL.catById(s.cat); const r = svcRating(s.id); const ph = svcPhoto(s);
  const me = actor('customer'); const fav = me && (me.favs || {})[s.id];
  const tabSel = S.ui.svcTab || 'detail';
  const reviews = Store.list('feedback').filter(f => f.dir === 'c2w' && f.serviceId === s.id && !['disembunyikan', 'ditinjau'].includes(f.status)).sort((a, b) => b.at - a.at);
  const w = BL.warrantyInfo(s, 0, 0);
  let body = '';
  if (tabSel === 'detail') {
    body = `<div class="stack"><div class="stack-sm"><h3>Tentang Layanan</h3><p class="muted">${esc(s.desc)}</p></div>
      <div class="stack-sm"><h3>Termasuk</h3><ul class="ticks">${s.inc.map(i => `<li><span class="tick">${icon('check', 13)}</span><span>${esc(i)}</span></li>`).join('')}</ul></div>
      ${s.tools && s.tools.length ? `<div class="stack-sm"><h4>Peralatan mitra</h4><div class="chips">${s.tools.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div></div>` : ''}
      ${s.cert ? note('warn', 'shield', `<b>Pekerjaan berisiko tinggi.</b> Hanya dikerjakan mitra dengan ${esc(BL.CERTS[s.cert])} yang sudah diverifikasi tim BERESIN.`) : ''}
      <div class="kv small"><span class="muted">Perkiraan durasi</span><span class="v">${esc(s.dur)}</span><span class="muted">Garansi</span><span class="v">${s.w ? (s.w === 1 ? '24 jam' : s.w + ' hari') : 'sesuai kesepakatan'}</span></div></div>`;
  } else if (tabSel === 'harga') {
    const tiers = CFG().travelTiers;
    body = `<div class="stack"><div class="card soft kv"><span>Model harga</span><span class="v strong">${esc(BL.MODEL_LABEL[s.model])}</span><span>Tarif</span><span class="v strong">${priceFrom(s)}</span></div>
      ${BL.QUOTE_MODELS.includes(s.model) ? note('', 'info', 'Harga awal adalah <b>estimasi</b>. Mitra memeriksa kondisi lalu mengirim penawaran rinci. Tidak ada biaya tambahan tanpa persetujuan Anda.') : ''}
      <div class="stack-sm"><h4>Biaya perjalanan</h4>${s.travelIncluded ? '<p class="small muted">Sudah termasuk dalam tarif.</p>' : `<div class="kv small">${tiers.map((t, i) => `<span>${i === 0 ? '0' : '> ' + tiers[i - 1].upTo}–${t.upTo} km</span><span class="v">${t.fee ? rp(t.fee) : 'Gratis'}</span>`).join('')}<span>> ${tiers[tiers.length - 1].upTo} km</span><span class="v">Penawaran khusus</span></div><p class="xs muted">Dikunci saat mitra menerima, tidak pernah melebihi yang ditampilkan saat memesan.</p>`}</div>
      <div class="stack-sm"><h4>Pembayaran</h4><p class="small muted">${s.project ? 'Dibayar setelah proyek selesai, atau per termin yang Anda setujui sebelum pekerjaan dimulai.' : 'Dibayar setelah pekerjaan selesai dan Anda konfirmasi, lewat QRIS, virtual account, atau dompet digital.'}</p></div>
      <div class="stack-sm"><h4>Garansi</h4><p class="small muted">${esc(w.text)}</p></div>
      <div class="stack-sm"><h4>Kebijakan pembatalan</h4><p class="small muted">${esc(BL.CANCEL_POLICIES[s.cancel || 'standar'])}</p></div></div>`;
  } else {
    body = reviews.length ? `<div class="stack">${reviews.slice(0, 20).map(f => reviewItem(f)).join('')}</div>` : empty('star', 'Belum ada ulasan', 'Ulasan muncul setelah pelanggan menyelesaikan pesanan.');
  }
  return `<div class="stack">
    <div class="dhero bleed t-${c.tint}">${ph ? `<img src="${esc(ph)}" alt="${esc(s.name)}">` : icon(c.icon, 84)}
      <div class="ov"><button class="circbtn" data-act="back" aria-label="Kembali">${icon('back', 20)}</button><div><button class="circbtn" data-act="shareSvc" data-id="${s.id}" aria-label="Bagikan">${icon('share', 18)}</button><button class="circbtn ${fav ? 'on' : ''}" data-act="favSvc" data-id="${s.id}" aria-label="${fav ? 'Hapus dari favorit' : 'Simpan ke favorit'}">${fav ? ficon('heart', 18) : icon('heart', 18)}</button></div></div>
      ${ph ? '' : `<span class="wm">${logo(20)}Beresin</span>`}</div>
    <div class="stack-sm"><div class="titlerow"><h1>${esc(s.name)}</h1>${r.count ? `<span class="rating">${starIcon(true, 17)} ${r.avg.toFixed(1)} <span class="cnt">(${fmtCount(r.count)} ulasan)</span></span>` : stars(0, 0)}</div><p class="small muted">${esc(c.long)} · ${priceFrom(s)}</p></div>
    <div class="badges3"><span>${icon('user', 17)} Berpengalaman</span><span>${icon('shield', 17)} ${s.w ? 'Bergaransi' : 'Sesuai kesepakatan'}</span><span>${icon('clock', 17)} Tepat Waktu</span></div>
    <div class="utabs" role="tablist">${[['detail', 'Detail'], ['harga', 'Harga'], ['ulasan', 'Ulasan']].map(([k, l]) => `<button data-act="ui" data-k="svcTab" data-val="${k}" aria-pressed="${tabSel === k}">${l}</button>`).join('')}</div>
    ${body}
    ${actionbar(`<button class="btn btn-outline side" data-act="svcAsk" data-id="${s.id}">${icon('chat', 18)} Chat</button><button class="btn btn-primary" data-act="startBook" data-id="${s.id}">Pesan Sekarang</button>`)}</div>`;
};
function reviewItem(f) {
  const from = prof(f.fromPid);
  const resp = Object.values(f.responses || {});
  return `<div class="card stack-sm"><div class="row">${avatarP(from, 'sm')}<div class="grow"><div class="strong small">${esc(from ? from.name.split(' ')[0] : 'Pengguna')}</div><div class="xs muted">${ago(f.at)}</div></div><span class="rating">${starIcon(true, 14)} ${f.overall}.0</span></div>
    ${f.comment ? `<p class="small">${esc(f.comment)}</p>` : ''}${photoGrid(f.photos)}
    ${resp.map(r => `<div class="card soft small"><span class="strong">Tanggapan:</span> ${esc(r.text)}</div>`).join('')}</div>`;
}
A.favSvc = d => toggleFav(d.id);
A.shareSvc = async d => { const s = svc(d.id); const text = `${s.name} di BERESIN — ${priceFrom(s)}. Urusan beres, hidup lebih mudah.`; try { await navigator.clipboard.writeText(text); toast('Info layanan disalin, siap dibagikan'); } catch (e) { sheetHtml('Bagikan', `<div class="stack"><h3>Bagikan layanan</h3><p class="card soft small" style="user-select:all">${esc(text)}</p><button class="btn btn-primary" data-act="sheetCancel">Tutup</button></div>`); } };
A.svcAsk = d => { const s = svc(d.id); if (!actor('customer')) return go('c_register'); ask({ title: 'Tanya tentang ' + s.name, body: 'Pertanyaan Anda diteruskan ke tim BERESIN. Chat langsung dengan mitra tersedia setelah pesanan diterima.', fields: [{ k: 't', label: 'Pertanyaan', req: true, ph: 'Contoh: apakah bisa datang sore ini?' }], ok: 'Kirim', onOk: async v => { const tid = await openTicket({ type: 'lainnya', text: `[${s.name}] ${v.t}`, priority: 'rendah' }); if (tid) go('ticket', { id: tid }); } }); };
A.startBook = d => {
  const s = svc(d.id);
  const me = actor('customer');
  const init = {}; for (const f of s.fields) if (f.t === 'num') init[f.k] = f.min || 1;
  const addrs = me ? Object.entries(me.addresses || {}).filter(([, a]) => !a.removed) : [];
  const first = addrs[0];
  S.d.book = { serviceId: s.id, step: 0, fields: Object.assign(init, d.fields ? JSON.parse(d.fields) : {}), addrId: first ? first[0] : 'baru', area: first ? first[1].area : (locArea() || (me ? me.area : '')), detail: first ? first[1].detail : (me ? (me.address || '') : ''), addrNote: first ? first[1].note || '' : '', saveAddr: !first, addrLabel: 'Rumah', date: todayISO(0), time: '09:00', paymentPlan: 'A', photos: [], agree: false, errs: {} };
  go('c_book');
};

/* ---------- Pemesanan (3 langkah) ---------- */
const TIMES = ['Secepatnya', '07:00', '08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
VIEWS.c_book = () => {
  const d = S.d.book; if (!d) return empty('alert', 'Pilih layanan terlebih dahulu', '', '<button class="btn btn-primary" data-act="home">Ke beranda</button>');
  const s = svc(d.serviceId);
  const head = `${pagehead('Pemesanan')}<div class="card" style="padding:14px 6px">${steps(['Detail', 'Lokasi & Jadwal', 'Konfirmasi'], d.step)}</div>`;
  const estBar = `<div class="est" data-live="estbar">${estMini(d, s)}</div>`;
  if (d.step === 0) {
    const fields = s.fields.filter(f => f.k !== 'catatan');
    return `<div class="stack">${head}
      <section class="stack-sm"><h3>Detail Pekerjaan</h3><div class="stack-sm">${fields.map(f => dynField(f, d.fields[f.k], d.errs[f.k], 'book.fields')).join('')}</div></section>
      <section class="stack-sm"><span class="small strong">Tambahkan foto <span class="muted" style="font-weight:400">(opsional)</span></span>${photoPicker('book.photos', d.photos, { big: true })}</section>
      ${fld('Catatan tambahan', textarea('book.fields.catatan', d.fields.catatan, 'placeholder="Contoh: AC jarang diservis, ada suara berisik"'), { opt: true })}
      ${actionbar(`${estBar}<button class="btn btn-primary" data-act="bookNext">Lanjutkan</button>`)}</div>`;
  }
  if (d.step === 1) {
    const me = actor('customer');
    const addrs = me ? Object.entries(me.addresses || {}).filter(([, a]) => !a.removed) : [];
    const km = d.area ? nearestEstimateKm(d.area, s) : null;
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => { const dt = new Date(Date.now() + i * 86400000); return { iso: todayISO(i), top: i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : HARI[dt.getDay()].slice(0, 3), bot: `${dt.getDate()} ${BULAN[dt.getMonth()]}` }; });
    return `<div class="stack">${head}
      <section class="stack-sm"><h3>Lokasi Pekerjaan</h3>
        ${addrs.length ? `<div class="radio-cards">${addrs.map(([id, a]) => `<button class="radio-card" data-act="pickAddr" data-id="${id}" aria-pressed="${d.addrId === id}"><span class="rc-dot"></span><span class="grow"><b class="small">${esc(a.label)}</b><br><span class="small muted">${esc(a.detail)}, ${esc(areaName(a.area))}</span></span></button>`).join('')}<button class="radio-card" data-act="pickAddr" data-id="baru" aria-pressed="${d.addrId === 'baru'}"><span class="rc-dot"></span><span class="small strong">Alamat lain</span></button></div>` : ''}
        ${d.addrId === 'baru' ? `<div class="card stack">${fld('Kecamatan', selectEl('book.area', d.area, areaOptions(true)), { req: true, err: d.errs.area })}
          ${fld('Alamat lengkap', textarea('book.detail', d.detail, 'placeholder="Jalan, nomor rumah, RT/RW, kelurahan"'), { req: true, err: d.errs.detail })}
          ${fld('Patokan', input('book.addrNote', d.addrNote, 'placeholder="Contoh: pagar hijau dekat masjid"'), { opt: true })}
          ${me ? `<div class="row"><label class="check grow"><input type="checkbox" data-f="book.saveAddr" ${d.saveAddr ? 'checked' : ''}><span>Simpan alamat sebagai</span></label>${input('book.addrLabel', d.addrLabel, 'style="max-width:130px" aria-label="Nama alamat"')}</div>` : ''}</div>` : ''}
        <div class="card soft stack-sm"><div class="row between"><b class="small">Titik lokasi tepat</b><span class="hint">opsional</span></div><p class="xs muted">Bantu mitra menemukan Anda: tempel koordinat atau tautan dari Google Maps.</p>
          <div class="row">${input('book.geoText', d.geoText || '', 'placeholder="-10.1701, 123.6070 atau tautan Google Maps"')}<a class="btn btn-ghost btn-sm" style="flex:none" href="https://www.google.com/maps/@-10.17,123.60,13z" target="_blank" rel="noopener">${icon('pin', 15)} Peta</a></div><div data-live="geofb">${geoFeedback(d.geoText)}</div></div>
        ${d.area ? (km != null ? note('ok', 'route', `Mitra terdekat sekitar <b>±${km} km</b> (perkiraan antarkecamatan).`) : note('warn', 'info', 'Belum ada mitra yang memenuhi syarat di sekitar wilayah ini. Anda tetap bisa memesan; tim kami akan mencarikan mitra.')) : ''}</section>
      <section class="stack-sm"><h3>Jadwal</h3>
        <div class="svc-scroll" style="grid-auto-columns:76px">${days.map(x => `<button class="chip" data-act="pickDate" data-v="${x.iso}" aria-pressed="${d.date === x.iso}" style="flex-direction:column;border-radius:14px;padding:8px 4px;gap:0"><span class="xs" style="font-weight:600">${x.top}</span><span class="strong small">${x.bot}</span></button>`).join('')}</div>
        <div class="chips">${TIMES.map(t => `<button class="chip" data-act="pickTime" data-v="${t}" aria-pressed="${d.time === t}">${t}</button>`).join('')}</div>
        ${d.errs.date ? `<span class="small" style="color:var(--danger-text)">${esc(d.errs.date)}</span>` : ''}</section>
      ${s.project ? `<section class="stack-sm"><h3>Skema Pembayaran Proyek</h3><div class="radio-cards">
        <button class="radio-card" data-act="setPlan" data-val="A" aria-pressed="${d.paymentPlan === 'A'}"><span class="rc-dot"></span><span><b>Opsi A · Bayar di akhir</b><br><span class="small muted">Seluruh nilai dibayar setelah proyek selesai dan Anda terima.</span></span></button>
        <button class="radio-card" data-act="setPlan" data-val="B" aria-pressed="${d.paymentPlan === 'B'}"><span class="rc-dot"></span><span><b>Opsi B · Per termin</b><br><span class="small muted">Dibayar tiap termin yang selesai dan Anda terima, sesuai rencana proyek yang Anda setujui.</span></span></button></div></section>` : ''}
      ${actionbar(`<button class="btn btn-ghost side" data-act="bookPrev">Kembali</button><button class="btn btn-primary" data-act="bookNext">Lanjutkan</button>`)}</div>`;
  }
  const km = nearestEstimateKm(d.area, s);
  const est = BL.estimate(s, d.fields, km, CFG());
  const me = actor('customer');
  const ph = svcPhoto(s);
  return `<div class="stack">${head}
    <div class="card stack-sm"><div class="row">${ph ? `<img src="${esc(ph)}" alt="" style="width:64px;height:52px;border-radius:12px;object-fit:cover">` : catIcon(s.cat, 'sm')}<div class="grow"><h3>${esc(s.name)}</h3><p class="small muted">${esc(fieldSummary(s, d.fields))}</p></div></div>
      <div class="hr"></div><p class="small row top" style="gap:8px">${icon('pin', 16)}<span>${esc(d.detail)}, ${esc(areaName(d.area))}${d.addrNote ? ' · ' + esc(d.addrNote) : ''}</span></p>
      <p class="small row" style="gap:8px">${icon('calendar', 16)}${esc(HARI[new Date(d.date + 'T00:00').getDay()])}, ${esc(fmtDate(new Date(d.date + 'T00:00').getTime(), false))} · ${esc(d.time)}</p>
      ${d.fields.catatan ? `<p class="small row top" style="gap:8px">${icon('file', 16)}<span>${esc(d.fields.catatan)}</span></p>` : ''}${photoGrid(d.photos)}</div>
    <div class="card stack-sm"><div class="row between"><h3>Rincian Biaya</h3>${est.isEstimate ? pill('Estimasi', 'warn') : pill('Harga pasti', 'primary')}</div>
      ${linesKV(est.lines, { totalLabel: est.isEstimate ? 'Estimasi total' : 'Total' })}
      ${est.travelCustom ? note('warn', 'route', 'Jarak lebih dari 15 km: biaya perjalanan ditentukan lewat penawaran yang harus Anda setujui.') : ''}
      ${est.isEstimate ? note('', 'info', 'Harga final ditentukan setelah inspeksi lewat penawaran rinci. Pekerjaan & pembelian tambahan hanya dilakukan setelah Anda setujui.') : ''}
      ${s.project ? `<p class="small"><b>Skema bayar:</b> ${d.paymentPlan === 'B' ? 'Opsi B · per termin' : 'Opsi A · di akhir proyek'}</p>` : `<p class="small muted">Bayar setelah pekerjaan selesai.</p>`}</div>
    <details class="card"><summary class="small strong" style="cursor:pointer">Kebijakan pembatalan & garansi</summary><div class="stack-sm" style="margin-top:8px"><p class="small muted">${esc(BL.CANCEL_POLICIES[s.cancel || 'standar'])}</p><p class="small muted">${esc(BL.warrantyInfo(s, 0, 0).text)}</p></div></details>
    <label class="check"><input type="checkbox" data-f="book.agree" ${d.agree ? 'checked' : ''}><span>Saya menyetujui rincian biaya, kebijakan pembatalan, dan ketentuan layanan.</span></label>
    ${me ? '' : custGate('membuat pesanan')}
    ${actionbar(`<button class="btn btn-ghost side" data-act="bookPrev">Kembali</button><button class="btn btn-primary" data-act="bookSubmit" ${me ? '' : 'disabled'}>Buat Pesanan</button>`)}</div>`;
};
function estMini(d, s) {
  const km = d.area ? nearestEstimateKm(d.area, s) : null;
  const est = BL.estimate(s, d.fields, km, CFG());
  return `<span class="xs muted">${est.isEstimate ? 'Estimasi' : 'Perkiraan'}</span><span class="strong num">${rp(est.total)}</span>`;
}
function fieldSummary(s, fields) {
  return s.fields.filter(f => fields[f.k] !== '' && fields[f.k] != null && f.t !== 'area').map(f => `${f.l}: ${fields[f.k]}${f.u ? ' ' + f.u : ''}`).join(' · ') || s.desc;
}
A.setPlan = d => { S.d.book.paymentPlan = d.val; };
A.pickDate = d => { S.d.book.date = d.v; S.d.book.errs.date = ''; };
A.pickTime = d => { S.d.book.time = d.v; };
A.pickAddr = d => { const b = S.d.book; b.addrId = d.id; if (d.id !== 'baru') { const a = actor('customer').addresses[d.id]; b.area = a.area; b.detail = a.detail; b.addrNote = a.note || ''; b.saveAddr = false; } else { b.detail = ''; b.addrNote = ''; b.saveAddr = true; } };
A.bookPrev = () => { S.d.book.step = Math.max(0, S.d.book.step - 1); window.scrollTo(0, 0); };
A.bookNext = () => {
  const d = S.d.book; const s = svc(d.serviceId);
  if (d.step === 0) { d.errs = BL.validateFields(s, d.fields); if (Object.keys(d.errs).length) return toast('Lengkapi kolom yang wajib diisi.', true); }
  if (d.step === 1) {
    d.errs = {};
    if (!d.area) d.errs.area = 'Pilih kecamatan';
    if (!String(d.detail || '').trim()) d.errs.detail = 'Alamat wajib diisi';
    if (!d.date || d.date < todayISO(0)) d.errs.date = 'Tanggal tidak boleh lewat';
    if (Object.keys(d.errs).length) return toast('Lengkapi lokasi dan jadwal.', true);
  }
  d.step++; window.scrollTo(0, 0);
};
A.bookSubmit = async () => {
  if (!requireWrite()) return;
  const d = S.d.book; const s = svc(d.serviceId);
  if (!d.agree) return toast('Centang persetujuan ketentuan terlebih dahulu.', true);
  if (!actor('customer')) return go('c_register');
  const km = nearestEstimateKm(d.area, s);
  const geo = BL.parseGeo(d.geoText);
  const id = await createBooking({ serviceId: s.id, fields: d.fields, area: d.area, detail: d.detail, addrNote: d.addrNote, date: d.date, time: d.time, paymentPlan: d.paymentPlan, photos: d.photos, km, geo });
  if (!id) return;
  if (d.addrId === 'baru' && d.saveAddr) await saveAddress({ label: d.addrLabel, area: d.area, detail: d.detail, note: d.addrNote });
  S.d.book = null;
  S.nav.customer = [{ v: 'c_orders', p: {} }, { v: 'c_order', p: { id } }];
  toast('Pesanan dibuat'); scheduleRender(true); window.scrollTo(0, 0);
};
A.reorder = d => { const b = Store.get('bookings', d.id); const f = Object.assign({}, b.fields); A.startBook({ id: b.serviceId, fields: JSON.stringify(f) }); };

/* ---------- Daftar pesanan ---------- */
VIEWS.c_orders = () => {
  const me = actor('customer');
  if (!me) return `<div class="stack">${pagehead('Pesanan', { back: false })}${testerSwitch('customer')}${custGate('melihat pesanan')}</div>`;
  const t = S.ui.cOrders || 'aktif';
  const all = Store.list('bookings').filter(b => b.customerPid === me.id).sort((a, b) => b.at - a.at);
  const list = all.filter(b => t === 'aktif' ? !['selesai', 'dibatalkan'].includes(b.status) : t === 'riwayat' ? ['selesai', 'dibatalkan'].includes(b.status) : true);
  return `<div class="stack">${pagehead('Pesanan Saya', { back: false })}${testerSwitch('customer')}
    <div class="seg">${[['aktif', 'Aktif'], ['riwayat', 'Riwayat'], ['semua', 'Semua']].map(([k, l]) => `<button data-act="ui" data-k="cOrders" data-val="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>
    ${list.length ? `<div class="list">${list.map(b => orderRow(b, 'c_order')).join('')}</div>` : empty('receipt', t === 'aktif' ? 'Tidak ada pesanan aktif' : 'Belum ada pesanan', 'Pesan layanan dari beranda.', '<button class="btn btn-primary btn-sm" data-act="tab" data-v="c_home">Cari layanan</button>')}</div>`;
};
function orderRow(b, view) {
  const pend = BL.quotesOf(b, null, 'menunggu').length;
  const s = svc(b.serviceId); const ph = s ? svcPhoto(s) : null;
  return `<button class="li" data-act="go" data-v="${view}" data-id="${b.id}">${ph ? `<img src="${esc(ph)}" alt="" style="width:48px;height:48px;border-radius:12px;object-fit:cover;flex:none">` : catIcon(b.cat, 'sm sq')}<div class="grow"><div class="row between"><span class="strong clip1">${esc(b.serviceName)}</span>${statusPill(b.status)}</div>
    <div class="xs muted"><span class="mono">${esc(b.code)}</span> · ${esc(fmtSched(b.schedule))}</div>
    <div class="small row between"><span class="muted">${esc(areaName(b.address.area))}</span><span class="num strong">${b.pricing.isEstimate ? '± ' : ''}${rp(b.pricing.total)}</span></div>
    ${pend ? `<div class="xs" style="color:var(--warn-text);font-weight:700">${pend} penawaran menunggu keputusan</div>` : ''}</div></button>`;
}

/* ---------- Pesanan berlangsung ---------- */
function stepIndex(st) { return { menunggu_mitra: 0, ditugaskan: 1, dalam_perjalanan: 1, tiba: 2, dikerjakan: 2, menunggu_konfirmasi: 2, selesai: 4, dibatalkan: 0 }[st]; }
/* ---------- Peta pelacakan (skematis, koordinat nyata) ---------- */
function trackMap(b, role) {
  const t = trackOf(b.id) || {};
  const W = workerPoint(b), C = custPoint(b);
  const w = prof(b.workerPid);
  const path = (t.path || []).map(x => Array.isArray(x) ? { lat: x[0], lng: x[1] } : x);
  const pts = [W.p, C.p].concat(path).filter(p => p && p.lat != null);
  if (!pts.length) return '';
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  const cy = (Math.min(...lats) + Math.max(...lats)) / 2, cx = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const cosL = Math.cos(cy * Math.PI / 180);
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), 0.012);
  const spanLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * cosL, 0.012);
  const Wd = 340, Ht = 220, pad = 40;
  const sc = Math.min((Wd - 2 * pad) / spanLng, (Ht - 2 * pad - 20) / spanLat);
  const X = p => Wd / 2 + (p.lng - cx) * cosL * sc, Y = p => Ht / 2 + 10 - (p.lat - cy) * sc;
  const vb = { top: cy + (Ht / 2 + 10) / sc, bot: cy - (Ht / 2 - 10) / sc, left: cx - (Wd / 2) / (cosL * sc), right: cx + (Wd / 2) / (cosL * sc) };
  const nice = x => { const p10 = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p10; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p10; };
  const st = nice((vb.right - vb.left) / 7);
  const hsh = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
  const i0 = Math.floor(vb.left / st) - 1, i1 = Math.ceil(vb.right / st) + 1, j0 = Math.floor(vb.bot / st) - 1, j1 = Math.ceil(vb.top / st) + 1;
  let parks = '', minor = '', major = '';
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) if (hsh(i, j) < 0.13) { const x1 = X({ lng: i * st }), x2 = X({ lng: (i + 1) * st }), y1 = Y({ lat: (j + 1) * st }), y2 = Y({ lat: j * st }); parks += `<rect x="${(x1 + 5).toFixed(1)}" y="${(y1 + 5).toFixed(1)}" width="${(x2 - x1 - 10).toFixed(1)}" height="${(y2 - y1 - 10).toFixed(1)}" rx="6"/>`; }
  for (let i = i0; i <= i1; i++) { const x = X({ lng: i * st }).toFixed(1); (i % 4 === 0 ? (major += `M${x} -10V${Ht + 10}`) : (minor += `M${x} -10V${Ht + 10}`)); }
  for (let j = j0; j <= j1; j++) { const y = Y({ lat: j * st }).toFixed(1); (j % 3 === 0 ? (major += `M-10 ${y}H${Wd + 10}`) : (minor += `M-10 ${y}H${Wd + 10}`)); }
  const COAST = [[123.40, -10.23], [123.45, -10.205], [123.50, -10.185], [123.53, -10.172], [123.56, -10.160], [123.585, -10.152], [123.61, -10.147], [123.63, -10.143], [123.66, -10.136], [123.70, -10.127], [123.75, -10.12], [123.82, -10.11]];
  const coast = COAST.map(([lng, lat]) => `${X({ lng }).toFixed(1)},${Y({ lat }).toFixed(1)}`);
  const seaPoly = `${X({ lng: 123.82 }).toFixed(1)},-2000 ${X({ lng: 123.40 }).toFixed(1)},-2000 ${coast.join(' ')}`;
  const seaVisible = COAST.some(([lng, lat]) => lng > vb.left && lng < vb.right && lat < vb.top + 0.002);
  const seaLabel = seaVisible ? (() => { const lng = (vb.left + vb.right) / 2; const k = COAST.findIndex(c => c[0] > lng); const lat = k > 0 ? COAST[k][1] : COAST[0][1]; const y = Math.max(16, Y({ lat }) - 14); return y < Ht - 20 && y > 12 ? `<text x="${Wd / 2}" y="${y.toFixed(1)}" text-anchor="middle" font-size="10" font-style="italic" font-weight="600" fill="var(--map-label)" font-family="Plus Jakarta Sans, sans-serif">Teluk Kupang</text>` : ''; })() : '';
  const labels = Object.values(BL.REGIONS[CFG().region].areas).map(a => ({ x: X(a), y: Y(a), n: a.name })).filter(a => a.x > 24 && a.x < Wd - 24 && a.y > 30 && a.y < Ht - 14);
  const wx = W.p ? X(W.p) : null, wy = W.p ? Y(W.p) : null, cxp = X(C.p), cyp = Y(C.p);
  const live = W.at && now() - W.at < 90000 && ['gps', 'simulasi'].includes(W.src);
  const km = BL.geoDistanceKm(W.p, C.p), eta = BL.etaMinutes(km);
  const arrived = ['tiba', 'dikerjakan', 'menunggu_konfirmasi'].includes(b.status);
  const bubble = arrived ? 'Mitra di lokasi' : b.status === 'dalam_perjalanan' ? `Tiba sekitar ${eta} menit · ±${String(km).replace('.', ',')} km` : b.status === 'ditugaskan' ? `Mitra bersiap · ±${String(km).replace('.', ',')} km` : '';
  const srcLabel = { gps: 'GPS langsung', simulasi: 'Simulasi', manual: 'Titik dibagikan', area: 'Perkiraan wilayah' }[W.src];
  return `<div class="mapbox" style="height:220px"><svg viewBox="0 0 ${Wd} ${Ht}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Peta posisi mitra dan lokasi pelanggan">
    <rect width="${Wd}" height="${Ht}" fill="var(--map-bg)"/>
    <g fill="var(--map-park)">${parks}</g>
    <path d="${minor}" stroke="var(--map-road)" stroke-width="5" fill="none"/>
    <path d="${major}" stroke="var(--map-major-edge)" stroke-width="10" fill="none"/><path d="${major}" stroke="var(--map-major)" stroke-width="7.5" fill="none"/>
    <polygon points="${seaPoly}" fill="var(--map-water)"/>${seaLabel}
    ${labels.map(a => `<text x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" letter-spacing=".08em" fill="var(--map-label)" stroke="var(--map-bg)" stroke-width="3" paint-order="stroke" font-family="Plus Jakarta Sans, sans-serif">${esc(a.n.toUpperCase())}</text>`).join('')}
    ${W.p && !arrived ? `<path d="M${wx.toFixed(1)} ${wy.toFixed(1)} L${cxp.toFixed(1)} ${cyp.toFixed(1)}" stroke="var(--faint)" stroke-width="2" stroke-dasharray="5 6" fill="none"/>` : ''}
    ${path.length > 1 ? `<polyline points="${path.map(p => X(p).toFixed(1) + ',' + Y(p).toFixed(1)).join(' ')}" fill="none" stroke="#16A34A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    <g transform="translate(${cxp.toFixed(1)} ${cyp.toFixed(1)})">${C.exact ? '' : '<circle r="22" fill="#064E3B" opacity=".08"/>'}<path d="M0 0 C-13 -13 -13 -30 0 -32 C13 -30 13 -13 0 0Z" fill="#064E3B"/><circle cy="-20" r="5.5" fill="#fff"/></g>
    ${W.p ? `<g transform="translate(${wx.toFixed(1)} ${wy.toFixed(1)})">${live ? '<circle class="pulse" r="18" fill="#22C55E" opacity=".45"/>' : ''}${W.exact ? '' : '<circle r="26" fill="#16A34A" opacity=".1" stroke="#16A34A" stroke-dasharray="3 4"/>'}<circle r="17" fill="#fff" stroke="#16A34A" stroke-width="3"/><circle r="13" fill="${avatarColor(w ? w.name : '?')}"/><text y="4.5" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Plus Jakarta Sans, sans-serif">${esc(initials(w ? w.name : '?'))}</text></g>` : ''}
  </svg>${bubble ? `<span class="eta">${esc(bubble)}</span>` : ''}<span class="mapcap">${W.src === 'simulasi' ? '<b style="color:var(--accent-text)">SIMULASI</b> · ' : ''}${esc(srcLabel)}${W.at ? ' · ' + esc(ago(W.at)) : ''}</span></div>`;
}
function trackCard(b, role) {
  if (!b.workerPid || !TRACK_ACTIVE.includes(b.status)) return '';
  const t = trackOf(b.id) || {};
  const W = workerPoint(b), C = custPoint(b);
  const wl = t.workerLink, cl = t.customerLink;
  const destText = `${b.address.detail}, ${areaName(b.address.area)}, Kupang`;
  const routeUrl = W.p ? gmapsDir(W.p, C.p) : gmapsDir(null, C.p);
  const navUrl = C.exact ? gmapsDir(null, C.p) : (b.address.mapLink || gmapsDir(null, null, destText));
  const gpsOn = GEO.bid === b.id && GEO.watch != null;
  const simOn = GEO.sim && GEO.sim.bid === b.id;
  const ext = (href, cls, ic, label) => `<a class="btn ${cls}" href="${esc(href)}" target="_blank" rel="noopener">${icon(ic, 16)} ${label}</a>`;
  if (role === 'customer') {
    return `<section class="card stack-sm"><div class="row between"><h3>Lacak Mitra</h3>${wl ? pill('Live di Google Maps', 'primary') : W.src === 'simulasi' ? simPill() : W.src === 'gps' ? pill('GPS langsung', 'primary') : W.exact ? pill('Titik dibagikan', 'info') : pill('Perkiraan', '')}</div>
      <div data-live="trackmap">${trackMap(b, role)}</div>
      ${wl ? ext(wl.url, 'btn-primary btn-block', 'nav', 'Lacak posisi mitra secara live di Google Maps') : ''}
      <div class="btnrow">${W.exact ? ext(gmapsPin(W.p), 'btn-outline btn-sm', 'pin', 'Posisi mitra') : ''}${ext(routeUrl, 'btn-ghost btn-sm', 'route', 'Rute di Google Maps')}</div>
      ${!wl && !W.exact && b.status !== 'tiba' ? `<p class="xs muted">Mitra belum membagikan lokasi. Posisi ditampilkan sebagai perkiraan wilayah kerjanya.</p>` : ''}
      <div class="hr"></div>
      <div class="row"><span class="ico xs ${C.exact ? 'solid t-deep' : 't-slate'}">${icon('pin', 15)}</span><div class="grow"><b class="small">Lokasi Anda</b><div class="xs muted">${cl ? 'Lokasi live Anda dibagikan ke mitra' : C.exact ? 'Titik tepat dibagikan ke mitra' : 'Mitra hanya melihat alamat & perkiraan kecamatan'}</div></div><button class="btn btn-outline btn-sm" data-act="shareLoc" data-id="${b.id}" data-side="customer">${C.exact || cl ? 'Perbarui' : 'Bagikan'}</button></div>
      ${cl ? `<button class="linkbtn" data-act="stopShare" data-id="${b.id}" data-side="customer">Hentikan berbagi lokasi live</button>` : ''}</section>`;
  }
  if (role === 'worker') {
    return `<section class="card stack-sm"><div class="row between"><h3>Lokasi & Navigasi</h3>${simOn ? simPill() : gpsOn ? pill('GPS aktif', 'primary') : wl ? pill('Live dibagikan', 'primary') : ''}</div>
      <div data-live="trackmap">${trackMap(b, role)}</div>
      ${ext(navUrl, 'btn-primary btn-block', 'nav', 'Navigasi ke pelanggan (Google Maps)')}
      ${cl ? ext(cl.url, 'btn-outline btn-block', 'pin', 'Lokasi live pelanggan') : C.exact ? ext(gmapsPin(C.p), 'btn-ghost btn-sm', 'pin', 'Titik pelanggan di Google Maps') : `<p class="xs muted">Pelanggan belum membagikan titik tepat; navigasi memakai alamat teks.</p>`}
      <div class="hr"></div>
      <div class="stack-sm"><b class="small">Bagikan posisi Anda ke pelanggan</b>
        <p class="xs muted">${wl ? 'Tautan live Google Maps aktif. Pelanggan melihat titik Anda bergerak di Google Maps.' : gpsOn ? 'GPS langsung mengirim posisi Anda setiap beberapa detik.' : 'Pelanggan baru melihat perkiraan wilayah Anda.'}</p>
        <div class="btnrow"><button class="btn btn-outline btn-sm" data-act="shareLoc" data-id="${b.id}" data-side="worker">${icon('share', 15)} ${wl ? 'Ganti tautan/titik' : 'Bagikan lokasi live'}</button>${R.geo === 'available' ? `<button class="btn ${gpsOn ? 'btn-danger' : 'btn-ghost'} btn-sm" data-act="${gpsOn ? 'gpsStop' : 'gpsStart'}" data-id="${b.id}">${icon('nav', 15)} ${gpsOn ? 'Hentikan GPS' : 'GPS otomatis'}</button>` : ''}</div>
        ${wl ? `<button class="linkbtn" data-act="stopShare" data-id="${b.id}" data-side="worker">Hentikan berbagi lokasi live</button>` : ''}
        ${['ditugaskan', 'dalam_perjalanan'].includes(b.status) ? `<button class="linkbtn" data-act="${simOn ? 'simStop' : 'simStart'}" data-id="${b.id}">${simOn ? 'Hentikan simulasi' : 'Uji tampilan: simulasi perjalanan'}</button>` : ''}</div></section>`;
  }
  return `<section class="card stack-sm"><div class="row between"><h3>Pelacakan</h3>${W.src === 'simulasi' ? simPill() : ''}</div><div data-live="trackmap">${trackMap(b, role)}</div><div class="btnrow">${wl ? ext(wl.url, 'btn-outline btn-sm', 'nav', 'Live mitra') : ''}${cl ? ext(cl.url, 'btn-outline btn-sm', 'pin', 'Live pelanggan') : ''}${ext(routeUrl, 'btn-ghost btn-sm', 'route', 'Rute di Google Maps')}</div></section>`;
}
const SHARE_HELP = `<div class="card soft stack-sm small"><p><b>Lokasi live (titik bergerak):</b> di aplikasi Google Maps, ketuk foto profil → <b>Berbagi lokasi</b> → <b>Bagikan lokasi</b> → pilih durasi → <b>Salin</b>. Tempel tautannya di sini.</p><p><b>Titik saja:</b> tekan lama lokasi di Google Maps, salin koordinatnya (contoh <span class="mono">-10.1701, 123.6070</span>), lalu tempel.</p></div><a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/@-10.17,123.60,13z" target="_blank" rel="noopener">${icon('pin', 15)} Buka Google Maps</a>`;
A.shareLoc = d => ask({ title: d.side === 'worker' ? 'Bagikan lokasi Anda ke pelanggan' : 'Bagikan lokasi Anda ke mitra', body: SHARE_HELP, fields: [{ k: 'v', label: 'Tautan Google Maps atau koordinat', type: 'text', req: true, ph: 'https://maps.app.goo.gl/… atau -10.1701, 123.6070' }], ok: 'Bagikan', onOk: v => shareGeoText(d.id, d.side, v.v) });
A.stopShare = d => stopShareLink(d.id, d.side);
A.gpsStart = d => startGps(d.id, 'worker');
A.gpsStop = () => stopGps();
A.simStart = d => simulateTrip(d.id);
A.simStop = () => stopSim();
function geoFeedback(text) {
  if (!String(text || '').trim()) return '';
  const g = BL.parseGeo(text);
  if (!g) return `<p class="xs" style="color:var(--danger-text)">Format belum dikenali. Tempel koordinat seperti -10.1701, 123.6070 atau tautan Google Maps.</p>`;
  if (g.lat != null) return `<p class="xs" style="color:var(--primary-text)">${icon('check', 12)} Titik terbaca: ${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}${BL.nearKupang(g) ? '' : ' · <b>jauh dari Kupang, periksa kembali</b>'}</p>`;
  return `<p class="xs" style="color:var(--primary-text)">${icon('check', 12)} Tautan Google Maps disimpan; mitra membukanya untuk menavigasi.</p>`;
}
function workerCard(b) {
  const w = prof(b.workerPid); if (!w) return '';
  const r = ratingOf(w.id, 'c2w');
  return `<div class="card stack-sm"><div class="row"><button data-act="go" data-v="c_worker" data-id="${w.id}" style="background:none;border:0;padding:0" aria-label="Profil mitra">${avatarP(w, 'lg')}</button><div class="grow"><h3 class="clip1">${esc(w.name)}${w.demo ? ' ' + pill('contoh', '') : ''}</h3><div class="small">${stars(r.avg, r.count, 14)}</div><div class="xs muted">${esc(BL.ROLE_TITLE[b.cat] || 'Mitra BERESIN')}</div></div></div>
    <div class="btnrow"><button class="btn btn-outline btn-sm" data-act="go" data-v="chat" data-id="${b.id}">${icon('chat', 16)} Chat</button><button class="btn btn-outline btn-sm" data-act="showPhone" data-pid="${w.id}">${icon('phone', 16)} Telepon</button></div></div>`;
}
A.showPhone = d => {
  const p = prof(d.pid);
  sheetHtml('Nomor telepon', `<div class="stack"><div class="row">${avatarP(p)}<div><h3>${esc(p.name)}</h3><p class="xs muted">Nomor hanya untuk koordinasi pesanan yang berjalan.</p></div></div><div class="card soft row between"><span class="strong num" style="user-select:all">${esc(p.phone)}</span><button class="btn btn-sm btn-outline" data-act="copy" data-text="${esc(p.phone)}">Salin</button></div><a class="btn btn-primary btn-block" href="tel:${esc(p.phone)}">${icon('phone', 16)} Panggil</a><p class="xs muted">Jangan sepakati harga atau pembayaran di luar aplikasi.</p><button class="btn btn-ghost btn-block" data-act="sheetCancel">Tutup</button></div>`);
};
A.copy = async d => { try { await navigator.clipboard.writeText(d.text); toast('Disalin'); } catch (e) { toast('Pilih teks lalu salin secara manual'); } };

function quoteCard(b, q, role) {
  const items = BL.quoteItems(q);
  const w = prof(q.byPid);
  let body = '';
  if (q.kind === 'jadwal') body = `<div class="kv small"><span>Jadwal baru</span><span class="v strong">${esc(q.newDate)} ${esc(q.newTime || '')}</span>${q.estEnd ? `<span>Perkiraan selesai</span><span class="v">${esc(q.estEnd)}</span>` : ''}</div><p class="small"><b>Alasan:</b> ${esc(q.reason)}</p>`;
  else {
    const lines = items.map(it => ({ name: it.name + (it.spec ? ` (${it.spec})` : '') + (it.supplier ? ` · ${it.supplier}` : ''), qty: it.qty, unitPrice: it.unitPrice, amount: BL.itemAmount(it), type: it.type }));
    if (q.kind === 'rencana') {
      const ms = Object.values(q.milestones || {}).sort((a, c) => a.n - c.n);
      body = `<div class="stack-sm">${ms.map(m => `<div class="card soft stack-sm"><div class="row between"><b class="small">Termin ${m.n}: ${esc(m.title)}</b><span class="num strong small">${rp(m.value)}</span></div>${m.deliverable ? `<p class="xs muted">Hasil: ${esc(m.deliverable)}</p>` : ''}${m.criteria ? `<p class="xs muted">Kriteria terima: ${esc(m.criteria)}</p>` : ''}${m.due ? `<p class="xs muted">Target: ${esc(m.due)}</p>` : ''}</div>`).join('')}
        <p class="small">Perkiraan selesai: <b>${esc(q.estEnd)}</b>${q.duration ? ' · ' + esc(q.duration) : ''}</p>${lines.length ? linesKV(lines, { types: true, totalLabel: 'Material/lainnya' }) : ''}
        <div class="row between"><span class="strong">Total proyek</span><span class="strong num">${rp(q.total)}</span></div>
        <p class="xs muted">Skema bayar: ${b.paymentPlan === 'B' ? 'per termin (Opsi B)' : 'di akhir proyek (Opsi A)'}.</p></div>`;
    } else body = linesKV(lines, { types: true });
  }
  const tone = { menunggu: 'warn', disetujui: 'primary', ditolak: 'danger' }[q.status];
  const canDecide = role === 'customer' && q.status === 'menunggu' && actingPid('customer') === b.customerPid;
  return `<div class="card stack-sm" ${q.status === 'menunggu' ? 'style="border-color:color-mix(in srgb,var(--accent-text) 45%,var(--line));box-shadow:var(--shadow)"' : ''}>
    <div class="row between"><div class="row"><span class="ico xs solid t-amber">${icon(q.kind === 'jadwal' ? 'calendar' : q.kind === 'material' ? 'box' : 'tag', 16)}</span><h4>${esc(QUOTE_KINDS[q.kind])}</h4></div>${pill(q.status === 'menunggu' ? 'Menunggu persetujuan' : q.status === 'disetujui' ? 'Disetujui' : 'Ditolak', tone)}</div>
    <p class="xs muted">${esc(w ? w.name : 'Mitra')} · ${fmtDate(q.at)}</p>${body}
    ${q.note ? `<p class="small"><b>Catatan mitra:</b> ${esc(q.note)}</p>` : ''}${photoGrid(q.photos)}
    ${q.decisionReason ? `<p class="small muted">Alasan keputusan: ${esc(q.decisionReason)}</p>` : ''}
    ${canDecide ? `<div class="btnrow"><button class="btn btn-ghost btn-sm" data-act="quoteReject" data-b="${b.id}" data-q="${q.id}">Tolak</button><button class="btn btn-primary btn-sm" data-act="quoteApprove" data-b="${b.id}" data-q="${q.id}">Setujui${q.total ? ' ' + rp(q.total) : ''}</button></div>` : ''}</div>`;
}
A.quoteApprove = d => { const b = Store.get('bookings', d.b); const q = b.quotes[d.q]; ask({ title: 'Setujui penawaran?', body: `${esc(QUOTE_KINDS[q.kind])}${q.total ? ' senilai <b>' + rp(q.total) + '</b>' : ''} akan menjadi bagian dari tagihan. Persetujuan ini tercatat.`, ok: 'Setujui', onOk: () => decideQuote(d.b, d.q, 'disetujui') }); };
A.quoteReject = d => ask({ title: 'Tolak penawaran', fields: [{ k: 'r', label: 'Alasan penolakan', req: true, ph: 'Contoh: harga material terlalu tinggi' }], ok: 'Tolak', danger: true, onOk: v => decideQuote(d.b, d.q, 'ditolak', v.r) });

function reportTimeline(b) {
  const reps = Store.list('reports').filter(r => r.bookingId === b.id).sort((a, c) => c.at - a.at);
  if (!reps.length) return '<p class="small muted">Belum ada laporan dari mitra.</p>';
  return `<div class="timeline">${reps.map(r => { const st = REPORT_STATUS[r.status] || [r.status, '']; return `<button class="tl" data-act="go" data-v="report" data-id="${r.id}" style="text-align:left;background:none;border-left:0;border-right:0;border-bottom:0;color:inherit;width:100%"><span class="time">${fmtTime(r.at)}</span><div class="stack-sm" style="gap:6px"><div class="row wrap" style="gap:6px"><b class="small">${esc(REPORT_TYPES[r.type])}</b>${r.status !== 'diajukan' ? pill(st[0], st[1]) : ''}${r.version > 1 ? pill('v' + r.version, '') : ''}</div><p class="small">${esc(r.current.desc)}</p>${r.current.findings ? `<p class="xs muted">Temuan: ${esc(r.current.findings)}</p>` : ''}${r.current.progress != null ? `<div class="row small"><div class="bar grow"><i style="width:${Math.min(100, r.current.progress)}%"></i></div><span class="num">${r.current.progress}%</span></div>` : ''}${photoGrid(r.current.photos)}</div></button>`; }).join('')}</div>`;
}
function milestonesCard(b) {
  const ms = Object.entries(b.milestones || {}).sort((a, c) => a[1].n - c[1].n);
  if (!ms.length) return '';
  const lbl = { rencana: ['Direncanakan', ''], diajukan: ['Menunggu pemeriksaan', 'warn'], diterima: ['Diterima', 'primary'], revisi: ['Perlu revisi', 'danger'] };
  const invs = Store.list('invoices').filter(i => i.bookingId === b.id && i.kind === 'termin');
  const done = ms.filter(([, m]) => m.status === 'diterima').length;
  return `<div class="card stack-sm"><div class="row between"><h3>Termin Proyek</h3>${pill(b.paymentPlan === 'B' ? 'Bayar per termin' : 'Bayar di akhir', 'info')}</div>
    <div class="row small"><div class="bar grow"><i style="width:${done / ms.length * 100}%"></i></div><span class="num strong">${done}/${ms.length}</span></div>
    ${b.project && b.project.estEnd ? `<p class="small muted">Perkiraan selesai ${esc(b.project.estEnd)}${b.project.duration ? ' · ' + esc(b.project.duration) : ''}</p>` : ''}
    ${ms.map(([k, m]) => { const inv = invs.find(i => i.milestoneId === k); const l = lbl[m.status] || [m.status, '']; return `<div class="li" style="padding:10px 0"><span class="ico xs ${m.status === 'diterima' ? 'solid t-green' : 't-slate'}">${icon(m.status === 'diterima' ? 'check' : 'flag', 15)}</span><div class="grow"><div class="row between"><b class="small">Termin ${m.n}: ${esc(m.title)}</b><span class="num small strong">${rp(m.value)}</span></div><div class="row wrap" style="gap:6px">${pill(l[0], l[1])}${inv ? pill(inv.status === 'lunas' ? 'Lunas' : 'Tagihan terbit', inv.status === 'lunas' ? 'done' : 'warn') : ''}</div>${m.reportId ? `<button class="linkbtn" data-act="go" data-v="report" data-id="${m.reportId}">Lihat laporan termin ${icon('chev', 12)}</button>` : ''}</div></div>`; }).join('')}</div>`;
}
function invoicesCard(b, role) {
  const invs = Store.list('invoices').filter(i => i.bookingId === b.id).sort((a, c) => a.at - c.at);
  if (!invs.length) return '';
  return `<div class="card stack-sm"><h3>Tagihan</h3>${invs.map(i => `<button class="li" style="padding:10px 0" data-act="go" data-v="${role === 'customer' ? 'c_pay' : role === 'ops' ? 'a_invoice' : 'w_invoice'}" data-id="${i.id}">${icon('receipt', 18)}<div class="grow"><div class="row between"><span class="mono small">${esc(i.code)}</span>${invPill(i)}</div><div class="small muted">${{ akhir: 'Tagihan akhir', termin: 'Tagihan termin', batal: 'Biaya pembatalan' }[i.kind]} · <b class="num">${rp(i.totals.total)}</b></div></div>${icon('chev', 16, ' class="chev"')}</button>`).join('')}</div>`;
}
function invPill(i) { const m = { belum_dibayar: ['Belum dibayar', 'warn'], menunggu_pembayaran: ['Menunggu pembayaran', 'info'], lunas: ['Lunas', 'done'], gagal: ['Gagal', 'danger'], dikembalikan: ['Dikembalikan', 'muted'], sebagian_dikembalikan: ['Sebagian dikembalikan', 'muted'] }[i.status] || [i.status, '']; return pill(m[0], m[1]); }
function historyCard(b) {
  const h = Object.values(b.history || {}).sort((a, c) => a.at - c.at);
  return `<details class="card"><summary class="strong small" style="cursor:pointer">Riwayat status (${h.length})</summary><div class="timeline" style="margin-top:10px">${h.map(e => `<div class="tl"><span class="time">${fmtTime(e.at)}</span><div><b class="small">${esc((BL.BOOKING_STATUS[e.to] || {}).label || e.to)}</b><p class="xs muted">${fmtDate(e.at)} · ${esc({ customer: 'Pelanggan', worker: 'Mitra', ops: 'Operasional' }[e.role] || e.role)}${e.reason ? ' · ' + esc(e.reason) : ''}</p></div></div>`).join('')}</div></details>`;
}
function detailCard(b) {
  const s = svc(b.serviceId);
  return `<details class="card"><summary class="strong small" style="cursor:pointer">Detail pesanan</summary><div class="stack-sm" style="margin-top:10px">
    <div class="kv small">${s.fields.filter(f => b.fields[f.k] !== '' && b.fields[f.k] != null).map(f => `<span class="muted">${esc(f.l)}</span><span class="v">${esc(b.fields[f.k])}${f.u ? ' ' + esc(f.u) : ''}</span>`).join('')}</div>
    <p class="small row top" style="gap:6px">${icon('pin', 14)}<span>${esc(b.address.detail)}, ${esc(areaName(b.address.area))}${b.address.note ? ' · ' + esc(b.address.note) : ''}${b.address.geo ? ` · <a href="${esc(gmapsPin(b.address.geo))}" target="_blank" rel="noopener">titik peta</a>` : b.address.mapLink ? ` · <a href="${esc(b.address.mapLink)}" target="_blank" rel="noopener">tautan peta</a>` : ''}</span></p>
    <p class="small row" style="gap:6px">${icon('calendar', 14)} ${esc(fmtSched(b.schedule))}</p>${photoGrid(b.photos)}
    <div class="hr"></div><div class="row between"><b class="small">Rincian awal</b>${b.pricing.isEstimate ? pill('Estimasi', 'warn') : ''}</div>${linesKV(b.pricing.lines)}
    <p class="xs muted">Kebijakan pembatalan: ${esc(BL.CANCEL_POLICIES[b.cancelPolicy || 'standar'])}</p></div></details>`;
}

VIEWS.c_order = p => {
  const b = Store.get('bookings', p.id); if (!b) return `${pagehead('Pesanan')}${empty('alert', 'Pesanan tidak ditemukan')}`;
  const me = actor('customer');
  if (!me || (b.customerPid !== me.id && !isTester())) return `${pagehead('Pesanan')}${note('danger', 'lock', 'Anda tidak memiliki akses ke pesanan ini.')}`;
  const s = svc(b.serviceId);
  const pendingQ = BL.quotesOf(b, null, 'menunggu');
  const otherQ = Object.values(b.quotes || {}).filter(q => q.status !== 'menunggu').sort((a, c) => c.at - a.at);
  const finalRep = b.finalReportId ? Store.get('reports', b.finalReportId) : null;
  const pendingReports = Store.list('reports').filter(r => r.bookingId === b.id && r.status === 'menunggu_respons' && r.type !== 'akhir');
  const fbDone = Store.get('feedback', b.id + '__c2w');
  const w = BL.warrantyInfo(s, (b.track || {}).confirmedAt || 0, now());
  const canCancel = ['menunggu_mitra', 'ditugaskan', 'dalam_perjalanan'].includes(b.status) || (b.status === 'tiba' && BL.quotesOf(b, null, 'ditolak').some(q => q.kind === 'revisi' || q.kind === 'rencana'));
  const elig = b.status === 'menunggu_mitra' ? eligibleWorkers(b).filter(x => x.e.ok).length : 0;
  const ended = ['selesai', 'dibatalkan'].includes(b.status);
  return `<div class="stack">${pagehead(ended ? 'Detail Pesanan' : 'Pesanan Berlangsung')}
    <div class="row between small"><span class="mono muted">#${esc(b.code)}</span><span class="muted">${fmtDate(b.at)}</span></div>
    ${b.status === 'dibatalkan' ? note('danger', 'x', `<b>Pesanan dibatalkan.</b> ${esc((b.cancel || {}).reason || '')}${(b.cancel || {}).fee ? ' · biaya pembatalan ' + rp(b.cancel.fee) : ''}`) : steps([b.status === 'menunggu_mitra' ? 'Mencari Mitra' : 'Dikonfirmasi', 'Dalam Perjalanan', 'Pengerjaan', 'Selesai'], stepIndex(b.status), ['check', 'route', 'wrench', 'flag'])}
    ${b.status === 'menunggu_mitra' ? `<div class="card raise row"><div class="spin" aria-hidden="true"></div><div class="grow"><h4>Mencari mitra terbaik</h4><p class="small muted">${elig ? `${elig} mitra memenuhi syarat dan sudah menerima tawaran kerja.` : 'Belum ada mitra yang cocok saat ini. Tim operasional akan membantu.'}${Object.keys(b.declined || {}).length ? ` ${Object.keys(b.declined).length} mitra menolak.` : ''}</p></div></div>` : ''}
    ${workerCard(b)}
    ${trackCard(b, 'customer')}
    ${pendingQ.map(q => quoteCard(b, q, 'customer')).join('')}
    ${pendingReports.map(r => `<button class="card row" data-act="go" data-v="report" data-id="${r.id}" style="text-align:left;width:100%;border-color:color-mix(in srgb,var(--accent-text) 45%,var(--line))"><span class="ico xs solid t-blue">${icon('file', 16)}</span><div class="grow"><b class="small">${esc(REPORT_TYPES[r.type])} menunggu respons Anda</b><p class="xs muted">${esc(r.current.desc.slice(0, 80))}</p></div>${icon('chev', 16, ' class="chev"')}</button>`).join('')}
    ${b.status === 'menunggu_konfirmasi' && finalRep ? `<div class="card raise stack-sm"><div class="row"><span class="ico xs solid t-green">${icon('check', 16)}</span><h3>Pekerjaan selesai, cek hasilnya</h3></div><p class="small">${esc(finalRep.current.desc)}</p>${photoGrid(finalRep.current.photos)}<p class="xs muted">Tagihan diterbitkan setelah Anda mengonfirmasi.</p>
      <div class="btnrow"><button class="btn btn-ghost" data-act="custFix" data-id="${b.id}">Minta perbaikan</button><button class="btn btn-primary" data-act="custConfirm" data-id="${b.id}">Konfirmasi selesai</button></div></div>` : ''}
    ${milestonesCard(b)}${invoicesCard(b, 'customer')}
    ${b.status === 'selesai' && !fbDone ? `<button class="card row" data-act="go" data-v="c_feedback" data-id="${b.id}" style="text-align:left;width:100%"><span class="ico sm solid t-amber">${ficon('star', 18)}</span><div class="grow"><b class="small">Ulas pengalaman Anda</b><p class="xs muted">Bagikan penilaian untuk ${esc((prof(b.workerPid) || {}).name || 'mitra')}.</p></div>${icon('chev', 16, ' class="chev"')}</button>` : ''}
    ${fbDone ? `<div class="card soft small row">${starIcon(true, 16)} Anda memberi ${fbDone.overall}.0${fbDone.comment ? ' · ' + esc(fbDone.comment.slice(0, 80)) : ''}</div>` : ''}
    <section class="stack-sm"><h3>Laporan Terbaru</h3><div class="card">${reportTimeline(b)}</div></section>
    ${otherQ.length ? `<details class="card"><summary class="strong small" style="cursor:pointer">Penawaran yang sudah diputuskan (${otherQ.length})</summary><div class="stack-sm" style="margin-top:10px">${otherQ.map(q => quoteCard(b, q, 'customer')).join('')}</div></details>` : ''}
    ${detailCard(b)}${historyCard(b)}
    <div class="stack-sm">
      ${ended ? `<button class="btn btn-outline btn-block" data-act="reorder" data-id="${b.id}">${icon('repeat', 16)} Pesan lagi</button>` : ''}
      ${b.status === 'selesai' && w.covered ? `<button class="btn btn-ghost btn-block" data-act="go" data-v="ticket_new" data-id="${b.id}" data-x="garansi">${icon('shield', 16)} Klaim garansi (hingga ${fmtDate(w.end, false)})</button>` : ''}
      ${b.workerPid && b.status !== 'dibatalkan' ? `<button class="btn btn-ghost btn-block" data-act="go" data-v="ticket_new" data-id="${b.id}" data-x="keluhan">${icon('help', 16)} Laporkan masalah</button>` : ''}
      ${canCancel ? `<button class="btn btn-danger btn-block" data-act="custCancel" data-id="${b.id}">Batalkan pesanan</button>` : ''}
    </div></div>`;
};
A.custConfirm = d => ask({ title: 'Konfirmasi pekerjaan selesai?', body: 'Tagihan akhir diterbitkan sesuai rincian yang sudah Anda setujui. Masa garansi dimulai sejak konfirmasi ini.', ok: 'Ya, selesai', onOk: async () => { const b = Store.get('bookings', d.id); if (b.finalReportId) await decideReport(b.finalReportId, 'setujui', ''); else await confirmCompletion(d.id); } });
A.custFix = d => ask({ title: 'Minta perbaikan', fields: [{ k: 'r', label: 'Bagian yang perlu diperbaiki', req: true }], ok: 'Kirim permintaan', onOk: async v => { const b = Store.get('bookings', d.id); if (b.finalReportId) await decideReport(b.finalReportId, 'revisi', v.r); else await moveBooking(d.id, 'dikerjakan', 'customer', v.r); } });
A.custCancel = d => {
  const b = Store.get('bookings', d.id); const fee = BL.cancelFee(b, svc(b.serviceId), CFG());
  ask({ title: 'Batalkan pesanan?', body: fee ? `Mitra sudah berangkat. Sesuai kebijakan, biaya pembatalan <b>${rp(fee)}</b> akan ditagihkan.` : 'Pembatalan saat ini tidak dikenai biaya.', fields: [{ k: 'r', label: 'Alasan pembatalan', req: true }], ok: fee ? `Batalkan (${rp(fee)})` : 'Batalkan', danger: true, onOk: v => cancelBooking(d.id, 'customer', v.r) });
};

/* ---------- Profil publik mitra ---------- */
VIEWS.c_worker = p => {
  const w = prof(p.id); if (!w || w.role !== 'worker') return empty('alert', 'Mitra tidak ditemukan');
  const r = ratingOf(w.id, 'c2w');
  const done = Store.list('bookings').filter(b => b.workerPid === w.id && b.status === 'selesai').length;
  const reviews = Store.list('feedback').filter(f => f.dir === 'c2w' && f.toPid === w.id && !['disembunyikan', 'ditinjau'].includes(f.status)).sort((a, b) => b.at - a.at);
  return `<div class="stack">${pagehead('Profil Mitra')}<div class="card raise stack-sm" style="align-items:center;text-align:center">${avatarP(w, 'xl')}<h2>${esc(w.name)}</h2><div>${stars(r.avg, r.count)}</div>${w.verif === 'terverifikasi' ? pill('Terverifikasi BERESIN', 'primary') : ''}
    <div class="grid3" style="width:100%"><div class="stat"><div class="k">Selesai</div><div class="v">${done}</div></div><div class="stat"><div class="k">Rating</div><div class="v">${r.count ? r.avg.toFixed(1) : '–'}</div></div><div class="stat"><div class="k">Wilayah</div><div class="v" style="font-size:.95rem">${esc(areaName(w.area))}</div></div></div></div>
    <div class="chips">${(w.skills || []).map(c => `<span class="chip">${icon(BL.catById(c).icon, 14)} ${esc(BL.catById(c).name)}</span>`).join('')}</div>
    ${Object.keys(w.certs || {}).filter(k => w.certs[k]).length ? note('ok', 'shield', 'Sertifikasi terverifikasi: ' + Object.keys(w.certs).filter(k => w.certs[k]).map(k => esc(BL.CERTS[k])).join(', ')) : ''}
    ${w.bio ? `<p class="muted">${esc(w.bio)}</p>` : ''}
    ${(w.portfolio || []).length ? `<section class="stack-sm"><h3>Portofolio</h3>${photoGrid(w.portfolio)}</section>` : ''}
    <section class="stack-sm"><h3>Ulasan</h3>${reviews.length ? reviews.slice(0, 10).map(reviewItem).join('') : '<p class="small muted">Belum ada ulasan.</p>'}</section></div>`;
};

/* ---------- Pembayaran (SIMULASI) ---------- */
VIEWS.c_pay = p => {
  const inv = Store.get('invoices', p.id); if (!inv) return `${pagehead('Tagihan')}${empty('alert', 'Tagihan tidak ditemukan')}`;
  const me = actor('customer');
  if (!me || (inv.customerPid !== me.id && !isTester())) return `${pagehead('Tagihan')}${note('danger', 'lock', 'Anda tidak memiliki akses ke tagihan ini.')}`;
  const b = Store.get('bookings', inv.bookingId);
  const d = draft('pay_' + inv.id, { method: 'qris' });
  const attempts = Object.entries(inv.attempts || {}).sort((a, c) => c[1].at - a[1].at);
  const pending = attempts.find(([, a]) => a.status === 'menunggu');
  const paid = ['lunas', 'dikembalikan', 'sebagian_dikembalikan'].includes(inv.status);
  return `<div class="stack">${pagehead('Pembayaran')}
    <div class="card stack-sm"><div class="row between"><span class="mono small">${esc(inv.code)}</span>${invPill(inv)}</div><h3>${esc(b ? b.serviceName : '')}</h3><p class="small muted">${b ? '<span class="mono">' + esc(b.code) + '</span> · ' : ''}diterbitkan ${fmtDate(inv.at)}</p>
      <div class="hr"></div>${linesKV(inv.lines, { types: true })}${inv.refunded ? `<p class="small">Dikembalikan: <b>${rp(inv.refunded)}</b></p>` : ''}</div>
    ${paid ? `<div class="card stack-sm"><div class="row"><span class="ico xs solid t-green">${icon('check', 16)}</span><h3 class="grow">Pembayaran berhasil</h3>${simPill()}</div><div class="kv small"><span>Dibayar</span><span class="v">${fmtDate(inv.paidAt)}</span><span>Metode</span><span class="v">${esc(PAY_METHODS[(inv.attempts[inv.paidAttempt] || {}).method] || '-')}</span><span>Referensi</span><span class="v mono">${esc((inv.attempts[inv.paidAttempt] || {}).ref || '-')}</span><span>Jumlah</span><span class="v strong">${rp(inv.totals.total)}</span></div><p class="xs muted">Bukti ini dari mode simulasi; belum ada dana nyata yang berpindah.</p></div>` : `
    <section class="stack-sm"><h3>Metode Pembayaran</h3><div class="radio-cards">${Object.entries(PAY_METHODS).map(([k, l]) => `<button class="radio-card" data-act="payMethod" data-inv="${inv.id}" data-val="${k}" aria-pressed="${d.method === k}"><span class="rc-dot"></span><span class="strong small">${esc(l)}</span></button>`).join('')}</div>
      <p class="xs muted">Tunai dinonaktifkan sampai kontrol rekonsiliasi tersedia.</p></section>
    ${pending ? `<div class="sim-box stack-sm"><div class="row between"><span class="label">Mode simulasi gateway</span>${simPill()}</div><p class="small">Gateway pembayaran belum terhubung, jadi tidak ada uang yang berpindah. Referensi <span class="mono">${esc(pending[1].ref)}</span> via ${esc(PAY_METHODS[pending[1].method])}. Pilih hasil notifikasi gateway:</p>
      <div class="btnrow"><button class="btn btn-ghost btn-sm" data-act="simPay" data-inv="${inv.id}" data-a="${pending[0]}" data-r="gagal">Simulasikan gagal</button><button class="btn btn-primary btn-sm" data-act="simPay" data-inv="${inv.id}" data-a="${pending[0]}" data-r="berhasil">Simulasikan berhasil</button></div></div>` : ''}
    ${inv.status === 'gagal' ? note('danger', 'alert', 'Pembayaran sebelumnya gagal. Silakan coba lagi.') : ''}
    ${pending ? '' : actionbar(`<div class="est"><span class="xs muted">Total</span><span class="strong num">${rp(inv.totals.total)}</span></div><button class="btn btn-primary" data-act="payStart" data-inv="${inv.id}">Bayar Sekarang</button>`)}`}
    ${attempts.length ? `<details class="card"><summary class="strong small" style="cursor:pointer">Riwayat percobaan (${attempts.length})</summary><div class="kv small" style="margin-top:8px">${attempts.map(([, a]) => `<span>${fmtDate(a.at)} · ${esc(PAY_METHODS[a.method])}</span><span class="v">${esc(a.status)}</span>`).join('')}</div></details>` : ''}
    <button class="btn btn-ghost btn-block" data-act="go" data-v="ticket_new" data-id="${inv.bookingId}" data-x="tagihan">Ada masalah dengan tagihan?</button></div>`;
};
A.payMethod = d => { draft('pay_' + d.inv).method = d.val; };
A.payStart = async d => { if (!requireWrite()) return; const m = draft('pay_' + d.inv, { method: 'qris' }).method; await startPayment(d.inv, m); toast('Menunggu konfirmasi gateway (simulasi)'); };
A.simPay = async d => { if (!requireWrite()) return; const res = await gatewayEvent(d.inv, d.a, d.r, 'evt_' + d.a + '_' + d.r); toast({ diproses: 'Pembayaran berhasil (simulasi)', gagal: 'Pembayaran gagal (simulasi)', duplikat: 'Event duplikat diabaikan', sudah_lunas: 'Tagihan sudah lunas' }[res] || res, res === 'gagal'); };

/* ---------- Ulasan ---------- */
function starInput(path, val, size) {
  return `<div class="row" style="gap:4px">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="setStar" data-path="${path}" data-n="${n}" aria-label="${n} bintang" style="background:none;border:0;padding:2px;color:${n <= (val || 0) ? 'var(--t-amber)' : 'var(--line-strong)'}">${starIcon(true, size || 28)}</button>`).join('')}</div>`;
}
A.setStar = d => { setPath(d.path, Number(d.n)); scheduleRender(true); };
function feedbackForm(bid, dir) {
  const b = Store.get('bookings', bid);
  const key = 'fb_' + bid + dir;
  const d = draft(key, { overall: 0, sub: {}, comment: '', photos: [], complaint: '' });
  const subs = dir === 'c2w' ? [['kualitas', 'Kualitas pekerjaan'], ['ketepatan', 'Ketepatan waktu'], ['profesional', 'Profesionalisme'], ['komunikasi', 'Komunikasi'], ['lingkup', 'Sesuai lingkup']] : [['kejelasan', 'Kejelasan informasi'], ['komunikasi', 'Komunikasi'], ['ketepatan', 'Ketepatan waktu'], ['kepatuhan', 'Kepatuhan ketentuan'], ['kesiapan', 'Kesiapan lokasi']];
  const other = prof(dir === 'c2w' ? b.workerPid : b.customerPid);
  const words = ['', 'Sangat buruk', 'Kurang', 'Cukup', 'Baik', 'Sangat baik'];
  return `<div class="stack">${pagehead(dir === 'c2w' ? 'Ulas Mitra' : 'Ulas Pelanggan')}
    <div class="card raise stack-sm" style="align-items:center;text-align:center">${avatarP(other, 'xl')}<h3>${esc(other ? other.name : '')}</h3><p class="small muted">${esc(b.serviceName)} · <span class="mono">${esc(b.code)}</span></p>${starInput(key + '.overall', d.overall, 38)}<p class="small strong" style="color:var(--t-amber);min-height:1.2em">${words[d.overall] || ''}</p></div>
    <div class="card stack-sm">${subs.map(([k, l]) => `<div class="row between"><span class="small">${l}</span>${starInput(key + '.sub.' + k, d.sub[k], 20)}</div>`).join('')}</div>
    ${fld('Komentar', textarea(key + '.comment', d.comment, 'placeholder="Ceritakan pengalaman Anda secara profesional"'), { hint: 'Jangan cantumkan nomor telepon, alamat, atau data pribadi.' })}
    ${dir === 'c2w' ? `<div class="field"><span>Foto pendukung <span class="hint">(opsional)</span></span>${photoPicker(key + '.photos', d.photos)}</div>${fld('Keluhan pribadi', textarea(key + '.complaint', d.complaint, 'placeholder="Tidak ditampilkan publik; diteruskan sebagai tiket ke tim dukungan"'), { opt: true })}` : ''}
    ${actionbar(`<button class="btn btn-primary" data-act="fbSubmit" data-id="${bid}" data-dir="${dir}">Kirim Ulasan</button>`)}</div>`;
}
VIEWS.c_feedback = p => { const b = Store.get('bookings', p.id); if (!b) return empty('alert', 'Pesanan tidak ditemukan'); if (Store.get('feedback', p.id + '__c2w')) return `${pagehead('Ulasan')}${note('ok', 'check', 'Anda sudah mengulas pesanan ini. Koreksi hanya melalui pusat bantuan agar tercatat.')}`; return feedbackForm(p.id, 'c2w'); };
A.fbSubmit = async d => { if (!requireWrite()) return; const v = draft('fb_' + d.id + d.dir); await submitFeedback(d.id, d.dir, v); back(); };
function reviewsReceived(pid, role) {
  const list = Store.list('feedback').filter(f => f.toPid === pid).sort((a, b) => b.at - a.at);
  const r = BL.avgRating(list.filter(f => f.status !== 'disembunyikan'));
  return `<div class="stack">${pagehead('Ulasan untuk Saya')}<div class="card row"><div class="grow"><div class="label">Rata-rata</div><div style="font-size:1.7rem;font-weight:800" class="num">${r.count ? r.avg.toFixed(1) : '–'}</div></div><div class="small muted">${r.count} ulasan</div></div>
    ${list.length ? list.map(f => { const resp = Object.values(f.responses || {}); const st = { terkirim: '', ditinjau: 'Menunggu moderasi', dilaporkan: 'Dilaporkan', disembunyikan: 'Disembunyikan moderator', selesai_ditinjau: 'Sudah ditinjau' }[f.status]; return `<div class="card stack-sm"><div class="row between"><span class="rating">${starIcon(true, 14)} ${f.overall}.0</span><span class="xs muted">${ago(f.at)}</span></div>${st ? pill(st, 'warn') : ''}${f.comment ? `<p class="small">${esc(f.comment)}</p>` : ''}<div class="xs muted">${Object.entries(f.sub || {}).map(([k, v]) => esc(k) + ' ' + v).join(' · ')}</div>${resp.map(x => `<div class="card soft small"><b>Tanggapan Anda:</b> ${esc(x.text)}</div>`).join('')}${resp.length ? '' : `<div class="btnrow"><button class="btn btn-ghost btn-sm" data-act="fbReport" data-id="${f.id}" data-role="${role}">Laporkan</button><button class="btn btn-outline btn-sm" data-act="fbRespond" data-id="${f.id}" data-role="${role}">Tanggapi</button></div>`}</div>`; }).join('') : empty('star', 'Belum ada ulasan')}</div>`;
}
VIEWS.c_reviews = () => { const me = actor('customer'); return me ? reviewsReceived(me.id, 'customer') : custGate(); };
A.fbRespond = d => ask({ title: 'Tanggapi ulasan', body: 'Tanggapan bersifat publik dan hanya bisa dikirim sekali.', fields: [{ k: 't', label: 'Tanggapan profesional', req: true }], ok: 'Kirim', onOk: v => respondFeedback(d.id, v.t, d.role) });
A.fbReport = d => ask({ title: 'Laporkan ulasan', body: 'Ulasan negatif tidak dihapus hanya karena nilainya rendah. Laporkan bila berisi kata kasar, ancaman, data pribadi, atau tidak sesuai fakta.', fields: [{ k: 'r', label: 'Alasan', req: true }], ok: 'Laporkan', onOk: v => reportFeedback(d.id, v.r, d.role) });

/* ---------- Chat ---------- */
function chatList(pid) {
  const bs = Store.list('bookings').filter(b => (b.customerPid === pid || b.workerPid === pid) && b.workerPid).sort((a, b) => (b.updatedAt || b.at) - (a.updatedAt || a.at));
  if (!bs.length) return empty('chat', 'Belum ada percakapan', 'Chat tersedia setelah mitra ditugaskan pada pesanan.');
  return `<div class="list">${bs.map(b => { const c = Store.get('chats', b.id) || { msgs: {} }; const msgs = Object.values(c.msgs || {}).sort((x, y) => x.at - y.at); const last = msgs[msgs.length - 1]; const other = prof(b.customerPid === pid ? b.workerPid : b.customerPid); const r = (c.read || {})[pid] || 0; const un = msgs.filter(m => m.fromPid && m.fromPid !== pid && m.at > r).length; return `<button class="li ${un ? 'unread' : ''}" data-act="go" data-v="chat" data-id="${b.id}">${avatarP(other)}<div class="grow"><div class="row between"><span class="t strong small clip1">${esc(other ? other.name : '')}</span><span class="xs muted">${last ? ago(last.at) : ''}</span></div><div class="xs muted">${esc(b.serviceName)} · ${esc(b.code)}</div><div class="small clip1 ${un ? 'strong' : 'muted'}">${esc(last ? last.text : 'Belum ada pesan')}</div></div>${un ? `<span class="pill danger">${un}</span>` : ''}</button>`; }).join('')}</div>`;
}
VIEWS.c_chats = () => { const me = actor('customer'); return `<div class="stack">${pagehead('Chat', { back: false })}${me ? chatList(me.id) : custGate('melihat chat')}</div>`; };
VIEWS.chat = p => {
  const b = Store.get('bookings', p.id); if (!b) return empty('alert', 'Percakapan tidak ditemukan');
  const role = S.role; const me = actor(role);
  if (!me || ![b.customerPid, b.workerPid].includes(me.id)) return `${pagehead('Chat')}${note('danger', 'lock', 'Anda bukan peserta percakapan ini.')}`;
  const other = prof(me.id === b.customerPid ? b.workerPid : b.customerPid);
  setTimeout(() => markChatRead(b.id, me.id), 300);
  const d = draft('chat_' + b.id, { t: '' });
  const closed = ['selesai', 'dibatalkan'].includes(b.status) && b.track && now() - ((b.track.confirmedAt || b.track.canceledAt) || now()) > 7 * 86400000;
  return `<div class="stack"><div class="pagehead wide-r"><button class="backbtn" data-act="back" aria-label="Kembali">${icon('back', 22)}</button><div class="row" style="justify-content:center">${avatarP(other, 'sm')}<div style="min-width:0"><div class="strong clip1">${esc(other ? other.name : '')}</div><div class="xs muted clip1">${esc(b.serviceName)} · ${esc(b.code)}</div></div></div><div class="r"><button class="ghostico" data-act="go" data-v="${role === 'customer' ? 'c_order' : 'w_job'}" data-id="${b.id}" aria-label="Detail pesanan">${icon('receipt')}</button></div></div>
    ${note('', 'info', 'Perubahan harga, jadwal, material, dan persetujuan hanya sah lewat tombol penawaran di halaman pesanan, bukan lewat chat.')}
    <div class="chat" data-live="chat">${chatMsgs(b, me)}</div>
    ${closed ? note('', 'lock', 'Percakapan ditutup 7 hari setelah pesanan berakhir.') : actionbar(`<input class="input" data-f="chat_${b.id}.t" value="${esc(d.t)}" placeholder="Tulis pesan" maxlength="1000" data-enter="chatSend" data-id="${b.id}" aria-label="Pesan"><button class="btn btn-primary" style="flex:0 0 auto" data-act="chatSend" data-id="${b.id}" aria-label="Kirim">${icon('send', 18)}</button>`)}</div>`;
};
function chatMsgs(b, me) {
  const c = Store.get('chats', b.id) || { msgs: {} };
  const msgs = Object.entries(c.msgs || {}).sort((x, y) => x[1].at - y[1].at);
  const otherPid = me.id === b.customerPid ? b.workerPid : b.customerPid;
  const otherRead = (c.read || {})[otherPid] || 0;
  if (!msgs.length) return '<p class="small muted" style="text-align:center">Belum ada pesan.</p>';
  return msgs.map(([id, m]) => m.sys ? `<div class="msg sys">${esc(m.text)}</div>` : `<div class="msg ${m.fromPid === me.id ? 'me' : 'them'}">${esc(m.text)}<div class="meta">${fmtTime(m.at)}${m.fromPid === me.id ? (otherRead >= m.at ? ' · dibaca' : ' · terkirim') : ` · <button class="linkbtn xs" style="color:inherit;font-weight:600" data-act="chatReport" data-b="${b.id}" data-m="${id}">laporkan</button>`}</div></div>`).join('');
}
A.chatSend = async d => { if (!requireWrite()) return; const k = 'chat_' + d.id; const t = (S.d[k] || {}).t; if (!String(t || '').trim()) return; S.d[k].t = ''; const inp = document.querySelector(`[data-f="${k}.t"]`); if (inp) inp.value = ''; await sendChat(d.id, t, S.role); scheduleRender(true); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50); };
A.chatReport = d => ask({ title: 'Laporkan pesan', body: 'Pesan ini diteruskan ke tim dukungan sebagai laporan penyalahgunaan.', fields: [{ k: 'r', label: 'Alasan', req: true }], ok: 'Laporkan', danger: true, onOk: async v => { const c = Store.get('chats', d.b); const m = c.msgs[d.m]; await Store.patch('chats', d.b, { reported: { [d.m]: { by: actingPid(S.role), reason: v.r, at: now() } } }); await openTicket({ type: 'penyalahgunaan', bookingId: d.b, text: `Pesan dilaporkan: "${m.text.slice(0, 200)}" — ${v.r}`, priority: 'tinggi' }); } });

/* ---------- Notifikasi ---------- */
const NOTIF_ICON = { booking_created: ['receipt', 'green'], matching: ['search', 'blue'], worker_assigned: ['user', 'green'], job_assigned: ['brief', 'violet'], worker_declined: ['user', 'slate'], status_dalam_perjalanan: ['route', 'green'], status_tiba: ['pin', 'green'], status_dikerjakan: ['wrench', 'green'], status_menunggu_konfirmasi: ['file', 'blue'], status_selesai: ['check', 'deep'], status_dibatalkan: ['x', 'red'], quote_pending: ['tag', 'amber'], quote_disetujui: ['check', 'amber'], quote_ditolak: ['x', 'red'], payment_success: ['money', 'green'], payment_failed: ['alert', 'red'], invoice_payable: ['receipt', 'amber'], invoice_created: ['receipt', 'amber'], feedback_request: ['star', 'amber'], feedback_received: ['star', 'amber'], job_offer: ['brief', 'violet'], chat_message: ['chat', 'blue'], report_inspeksi: ['file', 'blue'], report_comment: ['chat', 'teal'], ticket_opened: ['ticket', 'orange'], ticket_status: ['ticket', 'orange'], deposit_low: ['wallet', 'red'], deposit: ['wallet', 'green'], promo: ['megaphone', 'pink'] };
VIEWS.notifs = () => {
  const role = S.role;
  const pid = actingPid(role);
  if (!pid) return `<div class="stack">${pagehead('Notifikasi', { back: false })}${role === 'customer' ? custGate('menerima notifikasi') : workerGate()}</div>`;
  const tabs = role === 'customer' ? [['semua', 'Semua'], ['pesanan', 'Pesanan'], ['promo', 'Promosi']] : [['semua', 'Semua'], ['pesanan', 'Pesanan'], ['sistem', 'Sistem']];
  const t = tabs.some(x => x[0] === S.ui.nTab) ? S.ui.nTab : 'semua';
  const all = notifsFor([pid]);
  const inTab = (n, k) => k === 'semua' || (k === 'pesanan' ? ['pesanan', 'bayar'].includes(n.cat) : n.cat === k);
  const list = all.filter(n => inTab(n, t));
  const cnt = k => all.filter(n => !n.read && inTab(n, k)).length;
  return `<div class="stack">${pagehead('Notifikasi', { back: false, right: `<button class="ghostico" data-act="go" data-v="notif_prefs" aria-label="Pengaturan notifikasi">${icon('settings', 20)}</button>` })}
    <div class="seg">${tabs.map(([k, l]) => `<button data-act="ui" data-k="nTab" data-val="${k}" aria-pressed="${t === k}">${l}${cnt(k) ? `<span class="cnt">${cnt(k)}</span>` : ''}</button>`).join('')}</div>
    ${all.some(n => !n.read) ? `<div class="row between"><span class="small muted">${all.filter(n => !n.read).length} belum dibaca</span><button class="linkbtn" data-act="readAll">Tandai semua dibaca</button></div>` : ''}
    ${list.length ? `<div>${list.slice(0, 120).map(n => { const ic = NOTIF_ICON[n.type] || (n.cat === 'bayar' ? ['money', 'green'] : n.cat === 'sistem' ? ['info', 'slate'] : ['bell', 'green']); return `<button class="nrow ${n.read ? '' : 'unread'}" data-act="openNotif" data-id="${n.id}"><span class="ico solid t-${ic[1]}" style="width:44px;height:44px">${icon(ic[0], 20)}</span><div class="grow"><div class="t">${esc(n.title)}</div><div class="small muted">${esc(n.body)}</div><div class="xs faint">${ago(n.at)}</div></div>${icon('chev', 18, ' class="chev"')}</button>`; }).join('')}</div>` : empty('bell', t === 'promo' ? 'Belum ada promo' : 'Belum ada notifikasi')}</div>`;
};
A.readAll = async () => { const pid = actingPid(S.role); const un = notifsFor([pid]).filter(n => !n.read); for (const n of un) await Store.patch('notifications', n.id, { read: true, readAt: now() }); toast('Semua notifikasi ditandai dibaca'); };
A.openNotif = async d => {
  const n = Store.get('notifications', d.id);
  if (!n.read) Store.patch('notifications', n.id, { read: true, readAt: now() }).catch(() => {});
  const r = n.ref || {}; if (!r.v) return;
  const map = { customer: { w_job: 'c_order', w_wallet: 'c_home' }, worker: { c_order: 'w_job', c_pay: 'w_job' } };
  let v = (map[S.role] || {})[r.v] || r.v;
  if (['a_booking', 'a_ticket', 'a_worker', 'a_finance', 'a_feedback'].includes(v) && staffRole()) { S.role = 'ops'; saveUI(); }
  if (v === 'c_home') return tab('c_home');
  go(v, r.id ? { id: r.id } : {});
};
VIEWS.notif_prefs = () => {
  const me = actor(S.role); if (!me) return empty('user', 'Buat profil terlebih dahulu');
  const pr = me.prefs || {};
  const on = k => k === 'promo' ? pr.promo !== false : !!pr[k];
  const row = (k, l, h, dis) => `<div class="li"><div class="grow"><div class="strong small">${l}</div><div class="xs muted">${h}</div></div><button class="switch" role="switch" aria-checked="${dis === 'on' ? 'true' : on(k)}" ${dis ? 'disabled' : ''} data-act="togglePref" data-k="${k}" aria-label="${l}"></button></div>`;
  return `<div class="stack">${pagehead('Pengaturan Notifikasi')}
    <div class="list">${row('inapp', 'Dalam aplikasi', 'Selalu aktif agar persetujuan dan tagihan tidak terlewat.', 'on')}${row('push', 'Notifikasi push', 'Belum dikonfigurasi. Preferensi disimpan untuk dipakai setelah layanan push terhubung.')}${row('email', 'Email', 'Belum dikonfigurasi. Preferensi disimpan untuk nanti.')}${S.role === 'customer' ? row('promo', 'Info promo', 'Terima kabar promo dan diskon dari BERESIN.') : ''}${row('wa', 'WhatsApp / SMS', 'Hanya lewat penyedia terverifikasi; belum terhubung.', true)}</div>
    ${note('', 'info', 'Status pengiriman tiap notifikasi tercatat. Saluran luar tidak pernah ditandai terkirim sebelum penyedia mengonfirmasi.')}</div>`;
};
A.togglePref = async d => { const me = actor(S.role); const pr = me.prefs || {}; const cur = d.k === 'promo' ? pr.promo !== false : !!pr[d.k]; await Store.patch('profiles', me.id, { prefs: { [d.k]: !cur } }); };

/* ---------- Akun pelanggan ---------- */
VIEWS.c_account = () => {
  const me = actor('customer');
  const myT = me ? Store.list('tickets').filter(t => t.openedByPid === me.id) : [];
  const openT = myT.filter(t => !['selesai', 'ditutup'].includes(t.status)).length;
  const nAddr = me ? Object.values(me.addresses || {}).filter(a => !a.removed).length : 0;
  const nFav = me ? Object.values(me.favs || {}).filter(Boolean).length : 0;
  const li = (act, v, ic, label, extra) => `<button class="li" data-act="${act}" ${act === 'role' ? `data-r="${v}"` : `data-v="${v}"`}><span class="ico xs t-green">${icon(ic, 17)}</span><span class="grow">${label}${extra || ''}</span>${icon('chev', 16, ' class="chev"')}</button>`;
  return `<div class="stack">${pagehead('Akun', { back: false, right: `<button class="ghostico" data-act="go" data-v="settings" aria-label="Pengaturan">${icon('settings', 20)}</button>` })}${testerSwitch('customer')}
    ${me ? `<div class="card raise row">${avatarP(me, 'lg')}<div class="grow"><h3>${esc(me.name)}</h3><p class="small muted">${esc(me.phone)} · ${esc(areaName(me.area))}</p>${me.ownerUid !== ME.uid ? pill('Mode uji', 'accent') : ''}</div><button class="btn btn-ghost btn-sm" data-act="go" data-v="c_register" data-id="${me.id}">Ubah</button></div>` : custGate('memesan layanan')}
    ${me ? `<div class="list">${li('tab', 'c_orders', 'receipt', 'Pesanan saya')}${li('go', 'c_addresses', 'pin', 'Alamat tersimpan', nAddr ? ` <span class="muted small">(${nAddr})</span>` : '')}${li('go', 'c_favs', 'heart', 'Layanan favorit', nFav ? ` <span class="muted small">(${nFav})</span>` : '')}${li('go', 'c_tickets', 'headset', 'Bantuan, keluhan & garansi', openT ? ` <span class="pill warn">${openT} aktif</span>` : '')}${li('go', 'c_reviews', 'star', 'Ulasan dari mitra')}${li('go', 'notif_prefs', 'bell', 'Pengaturan notifikasi')}</div>` : ''}
    <div class="list">${li('go', 'settings', 'settings', 'Pengaturan', ' <span class="muted small">· tema, akun, privasi</span>')}${li('role', 'worker', 'brief', 'Ingin jadi mitra? Buka aplikasi Mitra')}</div>
    ${R.mode === 'firebase' ? `<button class="btn btn-ghost btn-block" data-act="askLogout">${icon('logout', 18)} Keluar</button>` : ''}
    ${aboutCard()}</div>`;
};
function aboutCard() {
  return `<div class="card soft stack-sm"><h4>Tentang aplikasi ini</h4><p class="small muted">${shared() ? 'Data tersimpan di database bersama aplikasi ini dan tersinkron langsung antarperangkat.' : 'Mode lokal: data tersimpan di peramban ini saja.'} Pembayaran, deposit, dan pencairan berjalan dalam <b>mode simulasi</b> sampai gateway pembayaran berizin dihubungkan.</p></div>`;
}
VIEWS.c_register = p => {
  const ex = p.id ? prof(p.id) : null;
  const k = 'reg_c' + (p.id || '');
  const d = draft(k, () => ex ? { id: ex.id, name: ex.name, phone: ex.phone, area: ex.area, address: ex.address || '', photo: ex.photo ? [ex.photo] : [] } : { name: ME.name || '', phone: '', area: locArea(), address: '', photo: [] });
  return `<div class="stack">${pagehead(ex ? 'Ubah Profil' : 'Profil Pelanggan')}
    <div class="stack-sm" style="align-items:center;text-align:center">${avatar(d.name || '?', 'xl', d.photo[0])}${canUpload() ? `<label class="linkbtn" style="cursor:pointer">${icon('camera', 16)} ${d.photo.length ? 'Ganti foto' : 'Tambah foto profil'}<input type="file" accept="image/*" data-photo="${k}.photo" data-single="1" hidden></label>` : ''}</div>
    <div class="card stack">${fld('Nama lengkap', input(`${k}.name`, d.name, 'autocomplete="name"'), { req: true })}
    ${fld('Nomor HP', input(`${k}.phone`, d.phone, 'type="tel" inputmode="tel" placeholder="08xxxxxxxxxx" autocomplete="tel"'), { req: true, hint: 'Hanya ditampilkan ke mitra yang menangani pesanan Anda.' })}
    ${fld('Kecamatan', selectEl(`${k}.area`, d.area, areaOptions(true)), { req: true })}
    ${ex ? '' : fld('Alamat rumah', textarea(`${k}.address`, d.address, 'placeholder="Jalan, nomor, kelurahan"'), { hint: 'Disimpan sebagai alamat “Rumah” untuk pemesanan cepat.' })}</div>
    ${actionbar(`<button class="btn btn-primary" data-act="saveCust" data-k="${k}">Simpan Profil</button>`)}</div>`;
};
A.saveCust = async d => { if (!requireWrite()) return; const v = Object.assign({}, S.d[d.k]); v.photo = (v.photo || [])[0] || null; const id = await saveProfile('customer', v); if (id) { S.d[d.k] = null; toast('Profil tersimpan'); back(); } };
VIEWS.c_addresses = () => {
  const me = actor('customer'); if (!me) return custGate();
  const list = Object.entries(me.addresses || {}).filter(([, a]) => !a.removed);
  return `<div class="stack">${pagehead('Alamat Tersimpan')}
    ${list.length ? `<div class="list">${list.map(([id, a]) => `<div class="li"><span class="ico xs t-green">${icon('pin', 16)}</span><div class="grow"><b class="small">${esc(a.label)}</b><div class="small muted">${esc(a.detail)}, ${esc(areaName(a.area))}${a.note ? ' · ' + esc(a.note) : ''}</div></div><button class="linkbtn" data-act="editAddr" data-id="${id}">Ubah</button><button class="linkbtn" style="color:var(--danger-text)" data-act="delAddr" data-id="${id}">Hapus</button></div>`).join('')}</div>` : empty('pin', 'Belum ada alamat', 'Simpan alamat rumah atau kantor untuk pemesanan cepat.')}
    <button class="addrow" data-act="editAddr">${icon('plus', 16)} Tambah alamat</button></div>`;
};
A.editAddr = d => { const me = actor('customer'); const a = d.id ? me.addresses[d.id] : { label: 'Kantor', area: me.area, detail: '', note: '' }; ask({ title: d.id ? 'Ubah alamat' : 'Alamat baru', fields: [{ k: 'label', label: 'Nama alamat', type: 'text', value: a.label, req: true, ph: 'Rumah, Kantor, Kos' }, { k: 'area', label: 'Kecamatan', type: 'select', options: areaOptions(true), value: a.area, req: true }, { k: 'detail', label: 'Alamat lengkap', value: a.detail, req: true }, { k: 'note', label: 'Patokan', type: 'text', value: a.note || '' }], ok: 'Simpan', onOk: v => saveAddress(Object.assign({ id: d.id }, v)) }); };
A.delAddr = d => ask({ title: 'Hapus alamat?', ok: 'Hapus', danger: true, onOk: () => updateMyProfile('customer', { addresses: { [d.id]: { removed: true } } }, 'address') });
VIEWS.c_favs = () => { const me = actor('customer'); if (!me) return custGate(); const favs = Object.keys(me.favs || {}).filter(k => me.favs[k]).map(id => svc(id)).filter(Boolean); return `<div class="stack">${pagehead('Layanan Favorit')}${favs.length ? `<div class="grid2">${favs.map(svcCard).join('')}</div>` : empty('heart', 'Belum ada favorit', 'Ketuk ikon hati pada halaman layanan untuk menyimpannya.')}</div>`; };

/* ---------- Tiket (pelanggan & mitra) ---------- */
VIEWS.c_tickets = () => ticketList(actor('customer'));
function ticketList(me) {
  if (!me) return `${pagehead('Bantuan')}${empty('user', 'Buat profil terlebih dahulu')}`;
  const list = Store.list('tickets').filter(t => t.openedByPid === me.id || t.againstPid === me.id).sort((a, b) => b.at - a.at);
  return `<div class="stack">${pagehead('Pusat Bantuan')}
    <div class="card raise row"><span class="ico solid t-green">${icon('headset', 22)}</span><div class="grow"><h4>Ada kendala?</h4><p class="xs muted">Untuk masalah pesanan, buka pesanan terkait lalu pilih “Laporkan masalah” atau “Klaim garansi”.</p></div></div>
    <button class="addrow" data-act="go" data-v="ticket_new" data-x="lainnya">${icon('plus', 16)} Kirim pertanyaan umum</button>
    ${list.length ? `<div class="list">${list.map(t => { const st = TICKET_STATUS[t.status]; const b = t.bookingId ? Store.get('bookings', t.bookingId) : null; return `<button class="li" data-act="go" data-v="ticket" data-id="${t.id}"><span class="ico xs t-orange">${icon('ticket', 16)}</span><div class="grow"><div class="row between"><b class="small">${esc(TICKET_TYPES[t.type])}</b>${pill(st[0], st[1])}</div><div class="xs muted"><span class="mono">${esc(t.code)}</span>${b ? ' · ' + esc(b.code) : ''} · ${ago(t.at)}${t.againstPid === me.id ? ' · terkait Anda' : ''}</div></div></button>`; }).join('')}</div>` : empty('ticket', 'Belum ada tiket')}</div>`;
}
VIEWS.ticket_new = p => {
  const role = S.role; const me = actor(role);
  if (!me) return empty('user', 'Buat profil terlebih dahulu');
  const b = p.id ? Store.get('bookings', p.id) : null;
  const key = 'tk_' + (p.id || 'x') + (p.x || '');
  const d = draft(key, { type: p.x || 'keluhan', text: '', photos: [] });
  const s = b ? svc(b.serviceId) : null;
  const w = b && s ? BL.warrantyInfo(s, (b.track || {}).confirmedAt || 0, now()) : null;
  return `<div class="stack">${pagehead(d.type === 'garansi' ? 'Klaim Garansi' : d.type === 'lainnya' ? 'Pertanyaan' : 'Laporkan Masalah')}
    ${b ? `<div class="card soft small row">${catIcon(b.cat, 'xs')}<span><b>${esc(b.serviceName)}</b> · <span class="mono">${esc(b.code)}</span></span></div>` : ''}
    ${fld('Jenis', selectEl(key + '.type', d.type, Object.entries(TICKET_TYPES).filter(([k]) => b || ['lainnya', 'keselamatan'].includes(k)).map(([v, l]) => ({ v, l }))))}
    ${d.type === 'garansi' && w ? note(w.covered ? 'ok' : 'danger', 'shield', `${esc(w.text)} ${w.covered ? `Berlaku hingga <b>${fmtDate(w.end)}</b>.` : '<b>Masa garansi sudah berakhir.</b>'}`) : ''}
    ${d.type === 'keselamatan' ? note('danger', 'alert', 'Jika ada bahaya langsung, hubungi 112 terlebih dahulu. Tiket keselamatan diprioritaskan kritis.') : ''}
    ${fld('Jelaskan masalahnya', textarea(key + '.text', d.text, 'placeholder="Apa yang terjadi, kapan, dan apa yang Anda harapkan"'), { req: true })}
    <div class="field"><span>Bukti foto</span>${photoPicker(key + '.photos', d.photos)}</div>
    ${b ? '<p class="xs muted">Laporan, pesan, penawaran, persetujuan, dan pembayaran pesanan ini otomatis disertakan sebagai bukti. Keputusan mengikuti kebijakan dan hasil peninjauan.</p>' : ''}
    ${actionbar(`<button class="btn btn-primary" data-act="ticketSubmit" data-k="${key}" data-id="${p.id || ''}">Kirim</button>`)}</div>`;
};
A.ticketSubmit = async d => { if (!requireWrite()) return; const v = S.d[d.k]; const tid = await openTicket({ type: v.type, bookingId: d.id || null, text: v.text, photos: v.photos }); if (tid) { S.d[d.k] = null; replace('ticket', { id: tid }); } };
VIEWS.ticket = p => {
  const t = Store.get('tickets', p.id); if (!t) return empty('alert', 'Tiket tidak ditemukan');
  const me = actor(S.role);
  if (!me || (t.openedByPid !== me.id && t.againstPid !== me.id && !isTester())) return `${pagehead('Tiket')}${note('danger', 'lock', 'Anda tidak memiliki akses ke tiket ini.')}`;
  const st = TICKET_STATUS[t.status];
  const tl = Object.values(t.timeline || {}).filter(e => e.kind === 'publik').sort((a, b) => a.at - b.at);
  const key = 'tkmsg_' + t.id; const d = draft(key, { t: '' });
  return `<div class="stack">${pagehead(t.code)}<div class="card stack-sm"><div class="row between"><h3>${esc(TICKET_TYPES[t.type])}</h3>${pill(st[0], st[1])}</div><p class="small muted">Prioritas ${esc(t.priority)} · dibuka ${fmtDate(t.at)}</p>${photoGrid(t.evidence)}
    ${t.resolution ? note('ok', 'check', `<b>Penyelesaian:</b> ${esc(t.resolution.text)}${t.resolution.refund ? ' · pengembalian ' + rp(t.resolution.refund) : ''}`) : ''}</div>
    <div class="chat">${tl.map(e => `<div class="msg ${e.byOps ? 'them' : (e.byPid === me.id ? 'me' : 'them')}">${e.byOps ? '<b class="xs">Tim BERESIN</b><br>' : ''}${esc(e.text)}<div class="meta">${fmtDate(e.at)}</div></div>`).join('')}</div>
    ${['selesai', 'ditutup'].includes(t.status) ? '' : actionbar(`${input(key + '.t', d.t, 'placeholder="Tambahkan informasi"')}<button class="btn btn-primary" style="flex:0 0 auto" data-act="ticketMsg" data-id="${t.id}" aria-label="Kirim">${icon('send', 16)}</button>`)}</div>`;
};
A.ticketMsg = async d => { const k = 'tkmsg_' + d.id; const t = (S.d[k] || {}).t; if (!String(t || '').trim()) return; S.d[k].t = ''; const tk = Store.get('tickets', d.id); await Store.patch('tickets', d.id, { timeline: { ['e' + Date.now().toString(36)]: { at: now(), byPid: actingPid(S.role), kind: 'publik', text: t } }, status: tk.status === 'menunggu_info' ? 'diproses' : tk.status }); await notify('ops', 'tkreply:' + d.id + ':' + Math.floor(now() / 60000), { type: 'ticket_reply', cat: 'sistem', title: 'Balasan pengguna · ' + tk.code, body: t.slice(0, 80), ref: { v: 'a_ticket', id: d.id } }); };

/* ---------- Detail laporan (bersama) ---------- */
VIEWS.report = p => {
  const r = Store.get('reports', p.id); if (!r) return empty('alert', 'Laporan tidak ditemukan');
  const b = Store.get('bookings', r.bookingId);
  const role = S.role; const me = role === 'ops' ? null : actor(role);
  if (role !== 'ops' && (!me || ![b.customerPid, b.workerPid].includes(me.id))) return `${pagehead('Laporan')}${note('danger', 'lock', 'Anda tidak memiliki akses ke laporan ini.')}`;
  const st = REPORT_STATUS[r.status] || [r.status, ''];
  const c = r.current; const author = prof(r.byPid);
  const comments = Object.values(r.comments || {}).sort((a, b2) => a.at - b2.at);
  const revs = Object.entries(r.revisions || {}).sort((a, b2) => b2[1].at - a[1].at);
  const ms = c.milestoneId && b.milestones ? b.milestones[c.milestoneId] : null;
  const canDecide = role === 'customer' && r.status === 'menunggu_respons' && me.id === b.customerPid;
  const key = 'rc_' + r.id; const d = draft(key, { t: '' });
  return `<div class="stack">${pagehead(REPORT_TYPES[r.type])}
    <div class="card stack-sm"><div class="row">${avatarP(author, 'sm')}<div class="grow"><b class="small">${esc(author ? author.name : '')}</b><div class="xs muted">${fmtDate(r.at)} · versi ${r.version}</div></div>${pill(st[0], st[1])}</div>
      ${ms ? `<p class="small"><b>Termin ${ms.n}:</b> ${esc(ms.title)} · ${rp(ms.value)}</p>${ms.criteria ? `<p class="xs muted">Kriteria terima: ${esc(ms.criteria)}</p>` : ''}` : ''}
      <p>${esc(c.desc)}</p>
      ${c.progress != null ? `<div class="row small"><span class="muted">Progres</span><div class="bar grow"><i style="width:${Math.min(100, c.progress)}%"></i></div><span class="num strong">${c.progress}%</span></div>` : ''}
      ${c.findings ? `<p class="small"><b>Temuan:</b> ${esc(c.findings)}</p>` : ''}${c.next ? `<p class="small"><b>Tindakan berikutnya:</b> ${esc(c.next)}</p>` : ''}
      ${photoGrid(c.photos)}
      ${r.decision ? `<p class="small muted">Keputusan pelanggan: ${esc(r.decision.decision)}${r.decision.note ? ' · ' + esc(r.decision.note) : ''} (${fmtDate(r.decision.at)})</p>` : ''}
      <p class="xs muted"><span class="mono">${esc(b.code)}</span> · ${esc(b.serviceName)}</p></div>
    ${canDecide ? `<div class="card raise stack-sm"><h4>Tanggapan Anda diperlukan</h4><div class="btnrow"><button class="btn btn-primary btn-sm" data-act="repDecide" data-id="${r.id}" data-dec="setujui">Setujui</button><button class="btn btn-outline btn-sm" data-act="repDecide" data-id="${r.id}" data-dec="revisi">Minta revisi</button></div><div class="btnrow"><button class="btn btn-ghost btn-sm" data-act="repDecide" data-id="${r.id}" data-dec="tolak">Tolak</button><button class="btn btn-danger btn-sm" data-act="repDecide" data-id="${r.id}" data-dec="eskalasi">Eskalasi ke dukungan</button></div></div>` : ''}
    ${role === 'worker' && me.id === b.workerPid && r.status !== 'disetujui' ? `<button class="btn btn-outline btn-block" data-act="go" data-v="w_report" data-id="${b.id}" data-x="${r.id}">${icon('edit', 16)} Revisi laporan</button>` : ''}
    <section class="stack-sm"><h3>Komentar</h3>${comments.length ? comments.map(cm => { const a = prof(cm.byPid); return `<div class="card soft stack-sm"><div class="row between"><b class="small">${esc(a ? a.name : '')} <span class="muted xs">${cm.role === 'customer' ? 'Pelanggan' : 'Mitra'}</span></b><span class="xs muted">${ago(cm.at)}</span></div><p class="small">${esc(cm.text)}</p></div>`; }).join('') : '<p class="small muted">Belum ada komentar.</p>'}
      ${role !== 'ops' ? `<div class="row">${input(key + '.t', d.t, `placeholder="${role === 'customer' ? 'Tanya atau minta klarifikasi' : 'Tanggapi komentar'}"`)}<button class="btn btn-primary" data-act="repComment" data-id="${r.id}" aria-label="Kirim">${icon('send', 16)}</button></div>` : ''}</section>
    <details class="card"><summary class="strong small" style="cursor:pointer">Riwayat revisi (${revs.length})</summary><div class="stack-sm" style="margin-top:10px">${revs.map(([v, x]) => `<div class="card soft stack-sm"><div class="row between"><b class="small">${esc(v)}</b><span class="xs muted">${fmtDate(x.at)}</span></div><p class="xs muted">Alasan: ${esc(x.reason)}</p><p class="small">${esc(x.desc)}</p>${x.progress != null ? `<p class="xs">Progres ${x.progress}%</p>` : ''}</div>`).join('')}</div></details></div>`;
};
A.repDecide = d => {
  const labels = { setujui: ['Setujui laporan?', 'Setujui'], revisi: ['Minta revisi', 'Kirim'], tolak: ['Tolak laporan', 'Tolak'], eskalasi: ['Eskalasi ke dukungan', 'Eskalasi'] };
  const [title, ok] = labels[d.dec];
  ask({ title, body: d.dec === 'setujui' ? 'Persetujuan Anda tercatat dan dapat memicu langkah berikutnya (misalnya tagihan termin).' : '', fields: d.dec === 'setujui' ? [] : [{ k: 'r', label: 'Alasan', req: true }], ok, danger: d.dec === 'tolak' || d.dec === 'eskalasi', onOk: v => decideReport(d.id, d.dec, v.r || '') });
};
A.repComment = async d => { const k = 'rc_' + d.id; const t = (S.d[k] || {}).t; if (!String(t || '').trim()) return; S.d[k].t = ''; await commentReport(d.id, t, S.role); };
/* =========================================================
   BERESIN — aplikasi Mitra (pekerja)
   ========================================================= */
function workerGate() {
  return `<div class="card raise stack" style="text-align:center;align-items:center">${logo(64)}<h2>Kerja lebih mudah,<br>penghasilan lebih baik.</h2><p class="small muted">Daftar sebagai mitra BERESIN, kirim dokumen verifikasi, lalu terima pesanan sesuai keahlian dan wilayah Anda.</p><button class="btn btn-primary btn-block" data-act="go" data-v="w_register">Daftar jadi mitra</button></div>`;
}
const VERIF = { menunggu: ['Menunggu verifikasi', 'warn'], terverifikasi: ['Terverifikasi', 'primary'], ditolak: ['Verifikasi ditolak', 'danger'], ditangguhkan: ['Ditangguhkan', 'danger'] };

VIEWS.w_home = () => {
  const w = actor('worker');
  if (!w) return `<div class="stack">${testerSwitch('worker')}${workerGate()}</div>`;
  const cfg = CFG();
  const bal = balancesOf(w.id);
  const offers = openOffers(w);
  const jobs = Store.list('bookings').filter(b => b.workerPid === w.id);
  const active = jobs.filter(b => BL.ACTIVE_STATUSES.includes(b.status)).sort((a, b) => (a.schedule.date + a.schedule.time).localeCompare(b.schedule.date + b.schedule.time));
  const done = jobs.filter(b => b.status === 'selesai').length;
  const r = ratingOf(w.id, 'c2w');
  const unread = notifsFor([w.id]).filter(n => !n.read).length;
  const canOnline = w.verif === 'terverifikasi';
  return `<div class="stack">${testerSwitch('worker')}
    <div class="row">${avatarP(w, 'lg')}<div class="grow"><h3 class="clip1">${esc(w.name)}${w.demo ? ' ' + pill('contoh', '') : ''}</h3>
      <div class="row" style="gap:8px"><span class="online ${w.online ? 'on' : ''}"><i></i>${w.online ? 'Online' : 'Offline'}</span><button class="switch" role="switch" aria-checked="${!!w.online}" aria-label="Status online" data-act="toggleOnline" ${canOnline ? '' : 'disabled'} style="transform:scale(.8);transform-origin:left"></button></div></div>
      <button class="ghostico" data-act="tab" data-v="notifs" aria-label="Notifikasi">${icon('bell', 22)}${unread ? `<span class="dotn">${unread > 9 ? '9+' : unread}</span>` : ''}</button></div>
    ${w.verif !== 'terverifikasi' ? note(w.verif === 'menunggu' ? 'warn' : 'danger', 'shield', `<b>${VERIF[w.verif][0]}.</b> ${w.verif === 'menunggu' ? 'Tim kami sedang memeriksa dokumen Anda. Anda belum dapat menerima pesanan.' : esc(w.verifNote || 'Hubungi pusat bantuan.')}`) : ''}
    ${bal.deposit < cfg.minDeposit ? note('danger', 'wallet', `Deposit ${rp(bal.deposit)} di bawah minimum ${rp(cfg.minDeposit)}. <button class="linkbtn" data-act="go" data-v="w_wallet">Isi deposit</button>`) : ''}
    <button class="gcard" data-act="wJobsTab" data-t="tawaran"><div class="grow"><div class="k">Pesanan Baru</div><div class="big">${offers.length}</div></div><span class="gbtn">Lihat</span></button>
    <div class="grid3"><div class="stat"><div class="k">Pesanan Aktif</div><div class="v">${active.length}</div></div><div class="stat"><div class="k">Selesai</div><div class="v">${done}</div></div><div class="stat"><div class="k">Rating</div><div class="v">${r.count ? r.avg.toFixed(1) : '–'}</div></div></div>
    <button class="gcard deep" data-act="go" data-v="w_wallet"><div class="grow"><div class="k">Saldo Tersedia</div><div class="big money">${rp(bal.earnings)}</div>${bal.payoutPending ? `<div class="xs" style="opacity:.85">Pencairan diproses ${rp(bal.payoutPending)}</div>` : ''}</div><span class="small strong row" style="gap:2px;position:relative;z-index:1">Detail ${icon('chev', 14)}</span></button>
    <div class="quick">
      <button data-act="go" data-v="w_schedule"><span class="ico solid t-green">${icon('calendar', 22)}</span>Jadwal</button>
      <button data-act="go" data-v="w_wallet"><span class="ico solid t-green">${icon('wallet', 22)}</span>Dompet</button>
      <button data-act="go" data-v="w_perf"><span class="ico solid t-green">${icon('chart', 22)}</span>Performa</button>
      <button data-act="go" data-v="w_tickets"><span class="ico solid t-green">${icon('headset', 22)}</span>Bantuan</button></div>
    <section class="stack-sm"><div class="sectionhead"><h3>Pekerjaan Aktif</h3>${active.length ? `<button class="linkbtn" data-act="wJobsTab" data-t="aktif">Semua ${icon('chev', 14)}</button>` : ''}</div>${active.length ? `<div class="list">${active.slice(0, 5).map(b => orderRow(b, 'w_job')).join('')}</div>` : '<p class="small muted">Tidak ada pekerjaan aktif.</p>'}</section></div>`;
};
A.wJobsTab = d => { S.ui.wJobs = d.t; tab('w_jobs'); };
A.toggleOnline = async () => { if (!requireWrite()) return; const w = actor('worker'); await Store.patch('profiles', w.id, { online: !w.online }); await audit('worker.online', 'profiles/' + w.id, '', { online: !w.online }); toast(!w.online ? 'Anda online dan dapat menerima pesanan' : 'Anda offline'); };

function openOffers(w) {
  const cfg = CFG(); const dep = balancesOf(w.id).deposit; const act = activeJobsOf(w.id);
  return Store.list('bookings').filter(b => b.status === 'menunggu_mitra').map(b => ({ b, e: BL.eligibility(w, b, { svc: svc(b.serviceId), cfg, deposit: dep, activeJobs: act, region: cfg.region }) })).filter(x => x.e.ok).sort((a, c) => c.b.at - a.b.at);
}
VIEWS.w_jobs = () => {
  const w = actor('worker');
  if (!w) return `<div class="stack">${pagehead('Pesanan', { back: false })}${testerSwitch('worker')}${workerGate()}</div>`;
  const t = S.ui.wJobs || 'tawaran';
  const offers = openOffers(w);
  const jobs = Store.list('bookings').filter(b => b.workerPid === w.id).sort((a, b) => b.at - a.at);
  let body;
  if (t === 'tawaran') {
    const cfg = CFG(); const dep = balancesOf(w.id).deposit;
    const why = [];
    if (w.verif !== 'terverifikasi') why.push('akun belum terverifikasi');
    if (!w.online) why.push('status Anda offline');
    if (dep < cfg.minDeposit) why.push('deposit di bawah minimum');
    if (activeJobsOf(w.id) >= cfg.maxActiveJobs) why.push('kapasitas pekerjaan aktif penuh');
    body = offers.length ? offers.map(({ b, e }) => offerCard(b, e)).join('') : empty('brief', 'Belum ada tawaran yang cocok', why.length ? 'Penyebab: ' + why.join(', ') + '.' : 'Tawaran muncul saat ada pesanan sesuai keahlian, area, dan jadwal kerja Anda.');
  } else {
    const list = jobs.filter(b => t === 'aktif' ? BL.ACTIVE_STATUSES.includes(b.status) : ['selesai', 'dibatalkan'].includes(b.status));
    body = list.length ? `<div class="list">${list.map(b => orderRow(b, 'w_job')).join('')}</div>` : empty('receipt', t === 'aktif' ? 'Tidak ada pekerjaan aktif' : 'Belum ada riwayat');
  }
  return `<div class="stack">${pagehead('Pesanan', { back: false })}${testerSwitch('worker')}
    <div class="seg">${[['tawaran', `Pesanan Baru${offers.length ? ' (' + offers.length + ')' : ''}`], ['aktif', 'Aktif'], ['riwayat', 'Riwayat']].map(([k, l]) => `<button data-act="ui" data-k="wJobs" data-val="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>${body}</div>`;
};
function offerCard(b, e) {
  const s = svc(b.serviceId);
  const cfg = CFG();
  const travel = BL.lockedTravelFee(b, e.km, cfg);
  const lines = (b.pricing.lines || []).filter(l => l.type !== 'travel');
  const labor = lines.reduce((a, l) => a + l.amount, 0);
  const comm = Math.round(labor * cfg.commissionPct / 100);
  const c = prof(b.customerPid);
  const ph = svcPhoto(s);
  return `<div class="card raise stack-sm"><div class="row">${ph ? `<img src="${esc(ph)}" alt="" style="width:56px;height:56px;border-radius:14px;object-fit:cover">` : catIcon(b.cat, 'sq')}<div class="grow"><h4>${esc(b.serviceName)}</h4><p class="xs muted">${esc(c ? c.name.split(' ')[0] : '')} · ${ago(b.at)}</p></div>${b.pricing.isEstimate ? pill('Estimasi', 'warn') : pill(rp(b.pricing.total), 'primary')}</div>
    <div class="row wrap small" style="gap:14px"><span class="row" style="gap:4px">${icon('pin', 15)} ${esc(areaName(b.address.area))} · ±${e.km} km</span><span class="row" style="gap:4px">${icon('calendar', 15)} ${esc(fmtSched(b.schedule))}</span></div>
    <p class="xs muted">${esc(fieldSummary(s, b.fields))}</p>
    <div class="card soft kv small"><span class="muted">Nilai jasa</span><span class="v">${rp(labor)}</span><span class="muted">Biaya perjalanan</span><span class="v">${b.pricing.travelIncluded ? 'termasuk tarif' : b.pricing.travelCustom ? 'lewat penawaran' : rp(travel)}</span><span class="muted">Komisi ${cfg.commissionPct}%</span><span class="v">− ${rp(comm)}</span><span class="strong">Perkiraan diterima</span><span class="v strong">${rp(labor - comm + travel)}</span></div>
    <div class="btnrow"><button class="btn btn-ghost btn-sm" data-act="jobDecline" data-id="${b.id}">Tolak</button><button class="btn btn-primary btn-sm" data-act="jobAccept" data-id="${b.id}">Terima Pesanan</button></div></div>`;
}
A.jobAccept = async d => { if (!requireWrite()) return; await acceptJob(d.id); };
A.jobDecline = d => ask({ title: 'Tolak tawaran', fields: [{ k: 'r', label: 'Alasan', type: 'select', options: ['Jadwal bentrok', 'Lokasi terlalu jauh', 'Di luar keahlian', 'Peralatan tidak tersedia', 'Lainnya'], value: 'Jadwal bentrok', req: true }], ok: 'Tolak', danger: true, onOk: v => declineJob(d.id, v.r) });

/* ---------- Detail pesanan (mitra) ---------- */
VIEWS.w_job = p => {
  const b = Store.get('bookings', p.id); if (!b) return `${pagehead('Detail Pesanan')}${empty('alert', 'Pesanan tidak ditemukan')}`;
  const w = actor('worker');
  const mine = w && b.workerPid === w.id;
  if (!mine) {
    if (b.status === 'menunggu_mitra' && w) { const e = BL.eligibility(w, b, { svc: svc(b.serviceId), cfg: CFG(), deposit: balancesOf(w.id).deposit, activeJobs: activeJobsOf(w.id), region: CFG().region }); return `<div class="stack">${pagehead('Tawaran Kerja')}${e.ok ? offerCard(b, e) : note('warn', 'info', 'Anda belum memenuhi syarat: ' + esc(e.reasons.join(', ')))}</div>`; }
    return `${pagehead('Detail Pesanan')}${note('danger', 'lock', b.workerPid ? 'Pesanan ini sudah ditangani mitra lain.' : 'Anda tidak memiliki akses ke pesanan ini.')}`;
  }
  const s = svc(b.serviceId);
  const c = prof(b.customerPid);
  const cr = ratingOf(c.id, 'w2c');
  const base = BL.approvedBaseQuote(b);
  const rejectedBase = BL.quotesOf(b, null, 'ditolak').some(q => q.kind === 'revisi' || q.kind === 'rencana');
  const pendingBase = BL.quotesOf(b, null, 'menunggu').some(q => q.kind === 'revisi' || q.kind === 'rencana');
  const quotes = Object.values(b.quotes || {}).sort((a, c2) => c2.at - a.at);
  const fb = Store.get('feedback', b.id + '__w2c');
  const qtyF = s.qtyField && b.fields[s.qtyField] ? ` (${b.fields[s.qtyField]} ${s.unit})` : '';
  let flow = ''; let bar = '';
  if (b.status === 'ditugaskan') { bar = slider('Berangkat ke Lokasi', 'wMove', { id: b.id, to: 'dalam_perjalanan' }); flow = `<button class="btn btn-ghost btn-block" data-act="wRelease" data-id="${b.id}">Lepas pesanan</button>`; }
  else if (b.status === 'dalam_perjalanan') bar = slider('Tiba di Lokasi', 'wArrive', { id: b.id });
  else if (b.status === 'tiba') {
    if (b.pricing.needsQuote && !base) {
      if (pendingBase) flow = note('warn', 'clock', 'Menunggu pelanggan menyetujui penawaran Anda.');
      else if (rejectedBase) flow = `${note('danger', 'x', 'Penawaran ditolak pelanggan.')}${b.pricing.model === 'inspection' ? `<button class="btn btn-primary btn-block" data-act="wInspectOnly" data-id="${b.id}">Selesaikan dengan biaya pemeriksaan saja</button>` : ''}<button class="btn btn-outline btn-block" data-act="go" data-v="w_quote" data-id="${b.id}" data-x="${s.project ? 'rencana' : 'revisi'}">Kirim penawaran baru</button><button class="btn btn-danger btn-block" data-act="wCancelRejected" data-id="${b.id}">Batalkan pesanan (penawaran ditolak)</button>`;
      else { flow = `${note('', 'info', s.project ? 'Lakukan survei lalu kirim rencana proyek berisi termin, nilai, dan target selesai.' : 'Periksa kondisi lalu kirim penawaran rinci. Pekerjaan dimulai setelah pelanggan menyetujui.')}<button class="btn btn-outline btn-block" data-act="go" data-v="w_report" data-id="${b.id}" data-x="new:inspeksi">${icon('file', 16)} Kirim laporan inspeksi</button>`; bar = `<button class="btn btn-primary" data-act="go" data-v="w_quote" data-id="${b.id}" data-x="${s.project ? 'rencana' : 'revisi'}">${icon('tag', 18)} ${s.project ? 'Kirim Rencana Proyek' : 'Kirim Penawaran'}</button>`; }
    } else { flow = `<div class="grid2"><button class="btn btn-outline btn-sm" data-act="go" data-v="w_report" data-id="${b.id}" data-x="new:inspeksi">${icon('search', 16)} Laporan inspeksi</button><button class="btn btn-outline btn-sm" data-act="go" data-v="w_quote" data-id="${b.id}" data-x="tambahan">${icon('plus', 16)} Penawaran tambahan</button></div>`; bar = slider('Mulai Pekerjaan', 'wMove', { id: b.id, to: 'dikerjakan' }); }
  } else if (b.status === 'dikerjakan') {
    const ms = Object.entries(b.milestones || {}).sort((a, c2) => a[1].n - c2[1].n);
    const nextMs = ms.find(([, m]) => m.status === 'rencana' || m.status === 'revisi');
    flow = `<div class="grid2"><button class="btn btn-outline btn-sm" data-act="go" data-v="w_report" data-id="${b.id}" data-x="new:progres">${icon('file', 16)} Laporan progres</button><button class="btn btn-outline btn-sm" data-act="go" data-v="w_quote" data-id="${b.id}" data-x="tambahan">${icon('plus', 16)} Pekerjaan tambahan</button><button class="btn btn-outline btn-sm" data-act="go" data-v="w_quote" data-id="${b.id}" data-x="material">${icon('box', 16)} Ajukan material</button><button class="btn btn-outline btn-sm" data-act="go" data-v="w_quote" data-id="${b.id}" data-x="jadwal">${icon('calendar', 16)} Ubah jadwal</button><button class="btn btn-outline btn-sm" data-act="go" data-v="w_report" data-id="${b.id}" data-x="new:material">${icon('box', 16)} Pemakaian material</button><button class="btn btn-outline btn-sm" data-act="go" data-v="w_report" data-id="${b.id}" data-x="new:insiden">${icon('alert', 16)} Lapor masalah</button></div>
      ${nextMs ? `<button class="btn btn-outline btn-block" data-act="go" data-v="w_report" data-id="${b.id}" data-x="new:termin:${nextMs[0]}">${icon('flag', 16)} Lapor selesai termin ${nextMs[1].n}: ${esc(nextMs[1].title)}</button>` : ''}`;
    bar = `<button class="btn btn-primary" data-act="go" data-v="w_report" data-id="${b.id}" data-x="new:akhir">${icon('check', 18)} Kirim Laporan Akhir</button>`;
  } else if (b.status === 'menunggu_konfirmasi') flow = note('warn', 'clock', 'Laporan akhir terkirim. Menunggu pelanggan mengonfirmasi atau meminta perbaikan.');
  else if (b.status === 'selesai') flow = fb ? `<div class="card soft small row">${starIcon(true, 16)} Anda memberi pelanggan ${fb.overall}.0</div>` : `<button class="btn btn-primary btn-block" data-act="go" data-v="w_feedback" data-id="${b.id}">${icon('star', 16)} Beri ulasan pelanggan</button>`;
  const ended = ['selesai', 'dibatalkan'].includes(b.status);
  return `<div class="stack">${pagehead('Detail Pesanan')}
    <div class="row between"><span class="mono small muted">#${esc(b.code)}</span>${statusPill(b.status)}</div>
    <div class="card stack-sm"><div class="row">${avatarP(c, 'lg')}<div class="grow"><h3 class="clip1">${esc(c.name)}</h3><div class="small">${stars(cr.avg, cr.count, 13)}</div></div></div>
      <p class="small row top" style="gap:8px">${icon('pin', 16)}<span>${ended ? esc(areaName(b.address.area)) : esc(b.address.detail) + ', ' + esc(areaName(b.address.area)) + (b.address.note ? ' · ' + esc(b.address.note) : '')}</span></p></div>
    <div class="card stack-sm"><div class="row">${catIcon(b.cat, 'sm')}<div class="grow"><h4>${esc(b.serviceName)}${esc(qtyF)}</h4><p class="xs muted">Estimasi ${esc(s.dur)} · ${esc(fmtSched(b.schedule))}</p></div><span class="strong num">${b.pricing.isEstimate ? '± ' : ''}${rp(b.pricing.total)}</span></div></div>
    ${ended ? '' : `<div class="tiles3"><button class="tile" data-act="showPhone" data-pid="${c.id}">${icon('phone', 22)}Hubungi</button><button class="tile" data-act="go" data-v="chat" data-id="${b.id}">${icon('chat', 22)}Chat</button><a class="tile" href="${esc(custPoint(b).exact ? gmapsDir(null, custPoint(b).p) : (b.address.mapLink || gmapsDir(null, null, b.address.detail + ', ' + areaName(b.address.area) + ', Kupang')))}" target="_blank" rel="noopener">${icon('nav', 22)}Rute</a></div>`}
    ${trackCard(b, 'worker')}
    <section class="stack-sm"><h3>Catatan Pelanggan</h3><p class="small muted">${esc(b.fields.catatan || fieldSummary(s, b.fields))}</p>${b.fields.catatan ? `<p class="xs muted">${esc(fieldSummary(s, b.fields))}</p>` : ''}${s.fields.filter(f => f.t === 'area' && f.k !== 'catatan' && b.fields[f.k]).map(f => `<p class="small">${esc(b.fields[f.k])}</p>`).join('')}${photoGrid(b.photos)}</section>
    ${flow ? `<div class="stack-sm">${flow}</div>` : ''}
    ${quotes.length ? `<section class="stack-sm"><h3>Penawaran</h3>${quotes.map(q => quoteCard(b, q, 'worker')).join('')}</section>` : ''}
    ${milestonesCard(b)}${invoicesCard(b, 'worker')}
    <section class="stack-sm"><h3>Laporan</h3><div class="card">${reportTimeline(b)}</div></section>
    ${detailCard(b)}${historyCard(b)}
    ${b.status !== 'dibatalkan' ? `<button class="btn btn-ghost btn-block" data-act="go" data-v="ticket_new" data-id="${b.id}" data-x="keluhan">${icon('headset', 16)} Hubungi dukungan</button>` : ''}
    ${bar ? actionbar(bar) : ''}</div>`;
};
A.wMove = async d => { if (!requireWrite()) return; const ok = await moveBooking(d.id, d.to, 'worker', ''); if (ok) toast(d.to === 'dalam_perjalanan' ? 'Status: dalam perjalanan' : 'Pekerjaan dimulai'); };
A.wArrive = async d => {
  if (!requireWrite()) return;
  const ok = await moveBooking(d.id, 'tiba', 'worker', '');
  if (ok) { await submitReport(d.id, { type: 'kedatangan', desc: 'Mitra telah tiba di lokasi dan melakukan pemeriksaan awal.' }); toast('Pelanggan diberi tahu Anda sudah tiba'); }
};
A.wRelease = d => ask({ title: 'Lepas pesanan?', body: 'Pesanan dikembalikan ke antrean pencarian mitra. Terlalu sering melepas pesanan memengaruhi performa Anda.', fields: [{ k: 'r', label: 'Alasan', req: true }], ok: 'Lepas', danger: true, onOk: v => moveBooking(d.id, 'menunggu_mitra', 'worker', v.r) });
A.wInspectOnly = d => ask({ title: 'Selesaikan dengan biaya pemeriksaan', body: 'Pelanggan hanya ditagih biaya pemeriksaan dan perjalanan. Tulis hasil diagnosa untuk laporan akhir.', fields: [{ k: 'r', label: 'Ringkasan hasil diagnosa', req: true }], ok: 'Kirim laporan akhir', onOk: async v => { await submitReportInspectOnly(d.id, v.r); } });
async function submitReportInspectOnly(bid, desc) {
  const w = actor('worker');
  const id = rid('r');
  const ok = await moveBooking(bid, 'menunggu_konfirmasi', 'worker', 'Penawaran ditolak; hanya pemeriksaan');
  if (!ok) return;
  const cur = { desc, progress: 100, findings: '', next: '', photos: [], milestoneId: null };
  await Store.set('reports', id, { bookingId: bid, type: 'akhir', byPid: w.id, at: now(), status: 'menunggu_respons', needsApproval: true, version: 1, current: cur, revisions: { v1: Object.assign({ at: now(), reason: 'Kiriman pertama' }, cur) }, comments: {} });
  await Store.patch('bookings', bid, { finalReportId: id });
  toast('Laporan akhir terkirim');
}
A.wCancelRejected = d => ask({ title: 'Batalkan pesanan', body: 'Pelanggan tidak ditagih karena penawaran ditolak sebelum pekerjaan dimulai.', fields: [{ k: 'r', label: 'Alasan', req: true, value: 'Penawaran ditolak pelanggan' }], ok: 'Batalkan', danger: true, onOk: v => cancelBooking(d.id, 'worker', v.r) });

/* ---------- Laporan pekerjaan ---------- */
VIEWS.w_report = p => {
  const b = Store.get('bookings', p.id); const w = actor('worker');
  if (!b || !w || b.workerPid !== w.id) return `${pagehead('Laporan')}${note('danger', 'lock', 'Anda tidak memiliki akses.')}`;
  const editId = p.x && !p.x.startsWith('new') ? p.x : null;
  const ex = editId ? Store.get('reports', editId) : null;
  const parts = (p.x || 'new:progres').split(':');
  const key = 'rep_' + b.id + '_' + (editId || parts.slice(1).join('_'));
  const presets = BL.findingsFor(b.cat);
  const d = draft(key, () => {
    if (ex) { const f = ex.current.findings || ''; const known = presets.includes(f); return { type: ex.type, desc: ex.current.desc, progress: ex.current.progress, findSel: known ? f : (f ? 'lain' : ''), findOther: known ? '' : f, next: ex.current.next, photos: (ex.current.photos || []).slice(), milestoneId: ex.current.milestoneId, needsApproval: ex.needsApproval, reason: '' }; }
    return { type: parts[1] || 'progres', desc: '', progress: parts[1] === 'akhir' ? 100 : '', findSel: '', findOther: '', next: '', photos: [], milestoneId: parts[2] || '', needsApproval: false };
  });
  const ms = Object.entries(b.milestones || {}).filter(([, m]) => m.status !== 'diterima');
  const types = Object.entries(REPORT_TYPES).filter(([k]) => !['kedatangan', 'akhir', 'termin'].includes(k) || k === d.type);
  const stepCur = d.type === 'akhir' ? 2 : ['inspeksi', 'kondisi_awal'].includes(d.type) ? 0 : 1;
  const descLabel = ['inspeksi', 'kondisi_awal'].includes(d.type) ? 'Kondisi Awal' : d.type === 'akhir' ? 'Hasil Pekerjaan' : 'Deskripsi';
  return `<div class="stack">${pagehead(ex ? 'Revisi Laporan' : 'Laporan Pekerjaan')}
    <div class="card" style="padding:14px 6px">${steps(['Inspeksi', 'Progres', 'Selesai'], stepCur, ['search', 'wrench', 'check'])}</div>
    <p class="small muted"><span class="mono">${esc(b.code)}</span> · ${esc(b.serviceName)}</p>
    ${ex ? `<p class="strong">${esc(REPORT_TYPES[d.type])}</p>` : fld('Jenis laporan', selectEl(key + '.type', d.type, types.map(([v, l]) => ({ v, l }))))}
    ${d.type === 'termin' ? fld('Termin', selectEl(key + '.milestoneId', d.milestoneId, [{ v: '', l: 'Pilih termin' }].concat(ms.map(([k, m]) => ({ v: k, l: `Termin ${m.n}: ${m.title} (${rp(m.value)})` })))), { req: true }) : ''}
    ${fld(descLabel, textarea(key + '.desc', d.desc, `placeholder="${['inspeksi', 'kondisi_awal'].includes(d.type) ? 'Jelaskan kondisi unit/lokasi saat diperiksa' : 'Apa yang sudah dikerjakan'}"`), { req: true })}
    <section class="stack-sm"><span class="small strong">Foto ${['akhir', 'termin'].includes(d.type) ? 'Bukti <span style="color:var(--danger-text)">*</span>' : 'Kondisi'}</span>${photoPicker(key + '.photos', d.photos, { big: true })}</section>
    ${fld('Temuan', selectEl(key + '.findSel', d.findSel, [{ v: '', l: 'Pilih temuan' }].concat(presets.map(x => ({ v: x, l: x }))).concat([{ v: 'lain', l: 'Lainnya (tulis sendiri)' }])))}
    ${d.findSel === 'lain' ? input(key + '.findOther', d.findOther, 'placeholder="Tulis temuan"') : ''}
    ${['progres', 'termin', 'akhir'].includes(d.type) ? `<div class="frow"><span class="lab">Progres pekerjaan</span><div class="row" style="justify-content:flex-end">${input(key + '.progress', d.progress, 'type="number" min="0" max="100" inputmode="numeric" style="max-width:90px;text-align:right"')}<span class="muted">%</span></div></div>` : ''}
    ${fld('Tindakan berikutnya', input(key + '.next', d.next, 'placeholder="Contoh: ganti kapasitor setelah disetujui"'), { opt: true })}
    ${!['termin', 'akhir'].includes(d.type) && !ex ? `<label class="check"><input type="checkbox" data-f="${key}.needsApproval" ${d.needsApproval ? 'checked' : ''}><span>Minta persetujuan pelanggan atas laporan ini</span></label>` : ''}
    ${ex ? fld('Alasan revisi', input(key + '.reason', d.reason, 'placeholder="Contoh: menambah foto sesuai permintaan"'), { req: true, hint: 'Versi sebelumnya tetap tersimpan dan dapat dilihat pelanggan.' }) : ''}
    ${d.type === 'akhir' ? note('warn', 'info', 'Laporan akhir mengubah status menjadi “menunggu konfirmasi”. Pastikan tidak ada penawaran yang belum diputuskan dan semua termin sudah diterima.') : ''}
    ${['tambahan', 'jadwal'].includes(d.type) ? note('', 'tag', 'Biaya tambahan atau perubahan jadwal wajib diajukan lewat <b>penawaran</b> agar pelanggan dapat menyetujui secara resmi.') : ''}
    ${actionbar(`<button class="btn btn-primary" data-act="repSubmit" data-k="${key}" data-id="${b.id}" data-edit="${editId || ''}">${ex ? 'Kirim Revisi' : 'Kirim Laporan'}</button>`)}</div>`;
};
A.repSubmit = async d => {
  if (!requireWrite()) return;
  const v = Object.assign({}, S.d[d.k]);
  v.findings = v.findSel === 'lain' ? (v.findOther || '') : (v.findSel || '');
  if (v.type === 'termin' && !v.milestoneId) return toast('Pilih termin yang dilaporkan.', true);
  if (d.edit) { await reviseReport(d.edit, v, v.reason); S.d[d.k] = null; back(); return; }
  const id = await submitReport(d.id, v);
  if (id) { S.d[d.k] = null; back(); }
};

/* ---------- Penawaran ---------- */
const ITEM_TYPES = [{ v: 'additional', l: 'Pekerjaan tambahan' }, { v: 'labor', l: 'Jasa' }, { v: 'material', l: 'Material' }, { v: 'procurement', l: 'Pengadaan' }, { v: 'delivery', l: 'Pengiriman' }, { v: 'travel', l: 'Perjalanan' }];
VIEWS.w_quote = p => {
  const b = Store.get('bookings', p.id); const w = actor('worker');
  if (!b || !w || b.workerPid !== w.id) return `${pagehead('Penawaran')}${note('danger', 'lock', 'Anda tidak memiliki akses.')}`;
  const key = 'q_' + b.id + '_' + p.x;
  const d = draft(key, { kind: p.x, items: [], milestones: [], note: '', reason: '', newDate: b.schedule.date, newTime: b.schedule.time, estEnd: '', duration: '', photos: [] });
  const title = { tambahan: 'Penawaran Tambahan', material: 'Pengajuan Material', revisi: 'Penawaran Hasil Inspeksi', rencana: 'Rencana Proyek', jadwal: 'Perubahan Jadwal' }[d.kind];
  const total = BL.quoteTotal({ kind: d.kind, items: Object.fromEntries(d.items.map((x, i) => ['i' + i, x])), milestones: Object.fromEntries(d.milestones.map((x, i) => ['m' + i, x])) });
  return `<div class="stack">${pagehead(title)}
    <p class="small muted"><span class="mono">${esc(b.code)}</span> · ${esc(b.serviceName)}</p>
    ${d.kind === 'revisi' ? note('', 'info', 'Penawaran ini <b>menggantikan estimasi awal</b> setelah disetujui. Rinci jasa dan material secara terpisah.') : ''}
    ${d.kind === 'material' ? note('', 'box', 'Belanja hanya setelah pelanggan menyetujui. Unggah struk di laporan pemakaian material.') : ''}
    ${d.kind === 'jadwal' ? `<div class="card stack">${fld('Tanggal baru', `<input type="date" class="input" data-f="${key}.newDate" value="${esc(d.newDate)}" min="${todayISO(0)}">`, { req: true })}${fld('Jam', selectEl(key + '.newTime', d.newTime, TIMES))}${fld('Perkiraan selesai', `<input type="date" class="input" data-f="${key}.estEnd" value="${esc(d.estEnd)}">`, { opt: true })}${fld('Alasan perubahan', textarea(key + '.reason', d.reason, 'placeholder="Contoh: material pesanan baru tiba hari Kamis"'), { req: true })}</div>` : ''}
    ${d.kind === 'rencana' ? `<section class="stack-sm"><h3>Termin</h3>${d.milestones.map((m, i) => `<div class="card row"><span class="ico xs t-green">${icon('flag', 15)}</span><div class="grow"><b class="small">Termin ${i + 1}: ${esc(m.title)}</b><div class="xs muted">${m.due ? 'Target ' + esc(m.due) + ' · ' : ''}${esc(m.criteria || m.deliverable || '')}</div></div><span class="strong num small">${rp(m.value)}</span><button class="ghostico" data-act="qDelMs" data-k="${key}" data-i="${i}" aria-label="Hapus termin">${icon('x', 16)}</button></div>`).join('')}
      <button class="addrow" data-act="qAddMs" data-k="${key}">${icon('plus', 16)} Tambah Termin</button>
      <div class="grid2">${fld('Perkiraan selesai', `<input type="date" class="input" data-f="${key}.estEnd" value="${esc(d.estEnd)}" min="${todayISO(0)}">`, { req: true })}${fld('Durasi', input(key + '.duration', d.duration, 'placeholder="9 hari kerja"'))}</div>
      <p class="xs muted">Skema bayar pesanan: ${b.paymentPlan === 'B' ? '<b>per termin (Opsi B)</b>, tiap termin yang diterima langsung ditagihkan.' : '<b>di akhir (Opsi A)</b>, seluruh termin ditagih setelah proyek selesai.'}</p></section>` : ''}
    ${d.kind !== 'jadwal' ? `<section class="stack-sm">${d.kind === 'rencana' ? '<h3>Material & biaya lain</h3>' : ''}${d.items.map((it, i) => `<div class="card row"><div class="grow"><b class="small">${esc(it.name)}</b><div class="small strong num">${rp(it.unitPrice)}${it.unit ? `<span class="muted" style="font-weight:400"> / ${esc(it.unit)}</span>` : ''}</div><div class="xs muted">${esc((ITEM_TYPES.find(t => t.v === it.type) || {}).l || it.type)}${it.spec ? ' · ' + esc(it.spec) : ''}${it.supplier ? ' · ' + esc(it.supplier) : ''}</div></div>${qtyCtl(`${key}.items.${i}.qty`, it.qty, 1, 'sm')}<button class="ghostico" data-act="qDelItem" data-k="${key}" data-i="${i}" aria-label="Hapus item">${icon('x', 16)}</button></div>`).join('')}
      <button class="addrow" data-act="qAddItem" data-k="${key}">${icon('plus', 16)} Tambah Item</button></section>
      ${fld('Catatan untuk pelanggan', textarea(key + '.note', d.note, 'placeholder="Contoh: outdoor sangat kotor sehingga perlu dibersihkan agar AC lebih optimal"'))}` : ''}
    <section class="stack-sm"><span class="small strong">Foto Pendukung</span>${photoPicker(key + '.photos', d.photos, { big: true })}</section>
    ${d.kind !== 'jadwal' ? `<div class="row between" data-live="qtotal"><span class="strong">Total ${d.kind === 'rencana' ? 'Proyek' : d.kind === 'tambahan' ? 'Tambahan' : ''}</span><span class="strong num" style="font-size:1.2rem">${rp(total)}</span></div>` : ''}
    ${actionbar(`<button class="btn btn-primary" data-act="qSubmit" data-k="${key}" data-id="${b.id}">Kirim Penawaran</button>`)}</div>`;
};
A.qAddItem = d => {
  const kind = S.d[d.k].kind;
  const def = { tambahan: 'additional', material: 'material', revisi: 'labor' }[kind] || 'material';
  ask({ title: 'Tambah item', fields: [{ k: 'type', label: 'Jenis', type: 'select', options: ITEM_TYPES, value: def }, { k: 'name', label: 'Nama item', type: 'text', req: true, ph: kind === 'material' ? 'Contoh: Pipa AC 1/4"' : 'Contoh: Pembersihan outdoor' }, { k: 'unitPrice', label: 'Harga satuan (Rp)', type: 'number', req: true }, { k: 'unit', label: 'Satuan', type: 'text', value: 'unit' }, { k: 'qty', label: 'Jumlah', type: 'number', value: '1', req: true }, { k: 'spec', label: 'Spesifikasi (material)', type: 'text', ph: 'Merek, ukuran' }, { k: 'supplier', label: 'Toko/pemasok', type: 'text' }], ok: 'Tambahkan', onOk: v => {
    if (!(Number(v.unitPrice) >= 0) || !(Number(v.qty) > 0)) return toast('Harga dan jumlah harus valid.', true);
    S.d[d.k].items.push({ type: v.type, name: v.name, unitPrice: Number(v.unitPrice), unit: v.unit, qty: Number(v.qty), spec: v.spec, supplier: v.supplier });
  } });
};
A.qDelItem = d => { S.d[d.k].items.splice(Number(d.i), 1); };
A.qAddMs = d => ask({ title: 'Tambah termin', fields: [{ k: 'title', label: 'Judul termin', type: 'text', req: true, ph: 'Contoh: Bongkar keramik lama' }, { k: 'value', label: 'Nilai (Rp)', type: 'number', req: true }, { k: 'due', label: 'Target selesai', type: 'date' }, { k: 'deliverable', label: 'Hasil/deliverable', type: 'text' }, { k: 'criteria', label: 'Kriteria penerimaan', type: 'text', ph: 'Contoh: keramik rata, nat rapi' }], ok: 'Tambahkan', onOk: v => { if (!(Number(v.value) > 0)) return toast('Nilai termin harus lebih dari 0.', true); S.d[d.k].milestones.push({ title: v.title, value: Number(v.value), due: v.due, deliverable: v.deliverable, criteria: v.criteria }); } });
A.qDelMs = d => { S.d[d.k].milestones.splice(Number(d.i), 1); };
A.qSubmit = async d => { if (!requireWrite()) return; const qid = await submitQuote(d.id, S.d[d.k]); if (qid) { S.d[d.k] = null; back(); } };

/* ---------- Jadwal & area kerja ---------- */
VIEWS.w_schedule = () => {
  const w = actor('worker'); if (!w) return workerGate();
  const av = w.avail || { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' };
  const areas = w.areas || [];
  const jobs = Store.list('bookings').filter(b => b.workerPid === w.id && BL.ACTIVE_STATUSES.includes(b.status)).sort((a, b) => (a.schedule.date + a.schedule.time).localeCompare(b.schedule.date + b.schedule.time));
  const byDate = {}; jobs.forEach(b => { (byDate[b.schedule.date] = byDate[b.schedule.date] || []).push(b); });
  const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '12:00', '14:00', '16:00', '17:00', '18:00', '20:00', '22:00'];
  return `<div class="stack">${pagehead('Jadwal & Area')}
    <section class="stack-sm"><h3>Agenda</h3>${Object.keys(byDate).length ? Object.entries(byDate).map(([dt, list]) => `<div class="stack-sm"><span class="label">${esc(HARI[new Date(dt + 'T00:00').getDay()])}, ${esc(fmtDate(new Date(dt + 'T00:00').getTime(), false))}${dt === todayISO(0) ? ' · Hari ini' : ''}</span><div class="list">${list.map(b => orderRow(b, 'w_job')).join('')}</div></div>`).join('') : '<p class="small muted">Belum ada pekerjaan terjadwal.</p>'}</section>
    <section class="card stack-sm"><h3>Hari kerja</h3><p class="xs muted">Anda hanya ditawari pesanan pada hari & jam ini.</p><div class="chips">${BL.DAY_NAMES.map((n, i) => `<button class="chip" data-act="availDay" data-i="${i}" aria-pressed="${av.days.includes(i)}">${n}</button>`).join('')}</div>
      <div class="grid2">${fld('Mulai', selectEl('__av.start', av.start, hours.concat([av.start]).filter((v, i, a) => a.indexOf(v) === i).sort(), 'data-avail="start"'))}${fld('Selesai', selectEl('__av.end', av.end, hours.concat([av.end]).filter((v, i, a) => a.indexOf(v) === i).sort(), 'data-avail="end"'))}</div></section>
    <section class="card stack-sm"><h3>Area layanan</h3><p class="xs muted">Kosongkan untuk menerima semua area dalam jangkauan ${CFG().maxMatchKm} km dari ${esc(areaName(w.area))}.</p><div class="chips">${areaOptions().map(o => `<button class="chip" data-act="availArea" data-a="${o.v}" aria-pressed="${areas.includes(o.v) || o.v === w.area}" ${o.v === w.area ? 'disabled' : ''}>${esc(o.l)}${o.v === w.area ? ' (utama)' : ''}</button>`).join('')}</div></section></div>`;
};
A.availDay = async d => { const w = actor('worker'); const av = Object.assign({ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' }, w.avail || {}); const i = Number(d.i); const days = av.days.includes(i) ? av.days.filter(x => x !== i) : av.days.concat([i]).sort(); if (!days.length) return toast('Pilih minimal satu hari kerja.', true); await updateMyProfile('worker', { avail: { days, start: av.start, end: av.end } }, 'availability'); };
A.availArea = async d => { const w = actor('worker'); const a = (w.areas || []).slice(); const i = a.indexOf(d.a); if (i >= 0) a.splice(i, 1); else a.push(d.a); await updateMyProfile('worker', { areas: a }, 'areas'); };
document.addEventListener('change', async e => { const el = e.target.closest('[data-avail]'); if (!el) return; const w = actor('worker'); const av = Object.assign({ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' }, w.avail || {}); av[el.dataset.avail] = el.value; if (av.start >= av.end) return toast('Jam mulai harus sebelum jam selesai.', true); await updateMyProfile('worker', { avail: av }, 'availability'); });

/* ---------- Performa ---------- */
VIEWS.w_perf = () => {
  const w = actor('worker'); if (!w) return workerGate();
  const jobs = Store.list('bookings').filter(b => b.workerPid === w.id);
  const done = jobs.filter(b => b.status === 'selesai');
  const canc = jobs.filter(b => b.status === 'dibatalkan').length;
  const released = Store.list('audit').filter(a => a.action === 'booking.status' && a.extra && a.extra.to === 'menunggu_mitra' && a.actorPid === w.id).length;
  const arrived = jobs.filter(b => b.track && b.track.arrivedAt && b.schedule.time !== 'Secepatnya');
  const onTime = arrived.filter(b => b.track.arrivedAt <= new Date(b.schedule.date + 'T' + b.schedule.time).getTime() + 30 * 60000).length;
  const fbs = Store.list('feedback').filter(f => f.dir === 'c2w' && f.toPid === w.id && f.status !== 'disembunyikan');
  const r = BL.avgRating(fbs);
  const subs = [['kualitas', 'Kualitas'], ['ketepatan', 'Ketepatan waktu'], ['profesional', 'Profesionalisme'], ['komunikasi', 'Komunikasi'], ['lingkup', 'Sesuai lingkup']].map(([k, l]) => { const v = fbs.map(f => (f.sub || {})[k]).filter(Boolean); return { l, avg: v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0, n: v.length }; });
  const earn = ledgerList().filter(e => e.workerPid === w.id && e.kind === 'earning');
  const weeks = []; for (let i = 7; i >= 0; i--) { const end = now() - i * 7 * 86400000; const st = end - 7 * 86400000; weeks.push({ st, v: earn.filter(e => e.at > st && e.at <= end).reduce((a, e) => a + e.amount, 0) }); }
  const mx = Math.max(1, ...weeks.map(x => x.v));
  const chart = `<svg viewBox="0 0 320 150" width="100%" role="img" aria-label="Pendapatan 8 minggu terakhir"><line x1="8" x2="312" y1="120" y2="120" stroke="var(--line)"/>${weeks.map((x, i) => { const h = x.v / mx * 96; const xx = 14 + i * 38; const dt = new Date(x.st + 7 * 86400000); return `<rect x="${xx}" y="${120 - h}" width="26" height="${Math.max(h, x.v ? 2 : 0)}" rx="5" fill="${i === 7 ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 40%, var(--surface))'}"/><text x="${xx + 13}" y="138" text-anchor="middle" font-size="9.5" fill="var(--muted)">${dt.getDate()}/${dt.getMonth() + 1}</text>${x.v ? `<text x="${xx + 13}" y="${114 - h}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--fg)">${Math.round(x.v / 1000)}rb</text>` : ''}`; }).join('')}</svg>`;
  return `<div class="stack">${pagehead('Performa')}
    <div class="grid2"><div class="stat"><div class="k">Rating</div><div class="v">${r.count ? r.avg.toFixed(1) : '–'}</div><div class="s">${r.count} ulasan</div></div><div class="stat"><div class="k">Pesanan selesai</div><div class="v">${done.length}</div><div class="s">${jobs.length ? Math.round(done.length / jobs.length * 100) : 0}% penyelesaian</div></div><div class="stat"><div class="k">Tepat waktu</div><div class="v">${arrived.length ? Math.round(onTime / arrived.length * 100) + '%' : '–'}</div><div class="s">tiba ≤ 30 menit dari jadwal</div></div><div class="stat"><div class="k">Batal / dilepas</div><div class="v">${canc} / ${released}</div></div></div>
    <div class="card stack-sm"><h3>Pendapatan 8 minggu terakhir</h3>${chart}<p class="xs muted">Bagian mitra setelah komisi, dari pembayaran terverifikasi (simulasi).</p></div>
    <div class="card stack-sm"><h3>Penilaian pelanggan</h3>${subs.map(x => `<div class="row small"><span style="width:130px;flex:none">${x.l}</span><div class="bar grow"><i style="width:${x.avg / 5 * 100}%;background:var(--t-amber)"></i></div><span class="num strong" style="width:30px;text-align:right">${x.n ? x.avg.toFixed(1) : '–'}</span></div>`).join('')}</div>
    <button class="btn btn-outline btn-block" data-act="go" data-v="w_reviews">${icon('star', 16)} Lihat semua ulasan</button></div>`;
};

/* ---------- Dompet ---------- */
const LEDGER_LABEL = { deposit_topup: 'Isi deposit', earning: 'Pendapatan pesanan', payout_request: 'Permintaan pencairan', payout_paid: 'Pencairan dibayar', payout_reversed: 'Pencairan dibatalkan', adjustment: 'Penyesuaian', refund: 'Pengembalian dana', payment: 'Pembayaran diterima', commission: 'Komisi platform' };
VIEWS.w_wallet = () => {
  const w = actor('worker'); if (!w) return workerGate();
  const cfg = CFG(); const bal = balancesOf(w.id);
  const entries = ledgerList().filter(e => e.workerPid === w.id && ['worker_deposit', 'worker_earnings'].includes(e.account)).sort((a, b) => b.at - a.at);
  const comm = ledgerList().filter(e => e.workerPid === w.id && e.account === 'platform_commission').reduce((a, e) => a + e.amount, 0);
  return `<div class="stack">${pagehead('Dompet')}
    <div class="gcard deep"><div class="grow"><div class="k">Saldo Tersedia</div><div class="big money">${rp(bal.earnings)}</div>${bal.payoutPending ? `<div class="xs" style="opacity:.85">Pencairan diproses ${rp(bal.payoutPending)}</div>` : ''}</div><button class="gbtn" data-act="wPayout" ${bal.earnings > 0 ? '' : 'disabled'}>Cairkan</button></div>
    <div class="grid2"><div class="stat ${bal.deposit < cfg.minDeposit ? 'alert' : ''}"><div class="k">Deposit</div><div class="v">${rp(bal.deposit)}</div><div class="s">Minimum ${rp(cfg.minDeposit)}</div></div><div class="stat"><div class="k">Komisi dibayar</div><div class="v">${rp(comm)}</div><div class="s">${cfg.commissionPct}% dari nilai jasa</div></div></div>
    <button class="addrow" data-act="wTopup">${icon('plus', 16)} Isi deposit (simulasi)</button>
    <div class="sim-box small">${simPill()} Deposit, pendapatan, dan pencairan dicatat dalam buku besar yang tidak bisa diubah diam-diam. Penyimpanan dan transfer dana nyata menunggu gateway berizin. Deposit bukan pendapatan platform dan tidak terpotong saat pekerjaan dimulai.</div>
    <section class="stack-sm"><h3>Riwayat Transaksi</h3>${entries.length ? `<div class="list">${entries.map(e => { const b = e.bookingId ? Store.get('bookings', e.bookingId) : null; return `<div class="li"><span class="ico xs solid ${e.amount >= 0 ? 't-green' : 't-red'}">${icon(e.account === 'worker_deposit' ? 'wallet' : 'money', 15)}</span><div class="grow"><div class="small strong">${esc(LEDGER_LABEL[e.kind] || e.kind)}</div><div class="xs muted">${fmtDate(e.at)}${b ? ' · ' + esc(b.code) : ''} · ${e.account === 'worker_deposit' ? 'deposit' : 'pendapatan'}${e.simulated ? ' · simulasi' : ''}</div></div><span class="num strong small" style="color:${e.amount >= 0 ? 'var(--primary-text)' : 'var(--danger-text)'}">${e.amount >= 0 ? '+' : '−'}${rp(Math.abs(e.amount))}</span></div>`; }).join('')}</div>` : '<p class="small muted">Belum ada transaksi.</p>'}</section></div>`;
};
A.wTopup = () => ask({ title: 'Isi deposit (simulasi)', body: 'Tidak ada dana nyata yang ditarik. Entri dicatat di buku besar sebagai simulasi.', fields: [{ k: 'a', label: 'Nominal', type: 'select', options: [{ v: '50000', l: 'Rp 50.000' }, { v: '100000', l: 'Rp 100.000' }, { v: '200000', l: 'Rp 200.000' }], value: '50000', req: true }], ok: 'Isi deposit', onOk: v => topupDeposit(Number(v.a)) });
A.wPayout = () => { const bal = balancesOf(actor('worker').id); ask({ title: 'Cairkan pendapatan', body: `Saldo tersedia ${rp(bal.earnings)}. Pencairan diproses tim keuangan.`, fields: [{ k: 'a', label: 'Nominal', type: 'number', value: String(bal.earnings), req: true }], ok: 'Ajukan pencairan', onOk: v => requestPayout(Math.round(Number(v.a))) }); };

/* ---------- Akun mitra ---------- */
VIEWS.w_profile = () => {
  const w = actor('worker');
  if (!w) return `<div class="stack">${pagehead('Akun', { back: false, right: `<button class="ghostico" data-act="go" data-v="settings" aria-label="Pengaturan">${icon('settings', 20)}</button>` })}${testerSwitch('worker')}${workerGate()}<div class="list"><button class="li" data-act="go" data-v="settings"><span class="ico xs t-green">${icon('settings', 17)}</span><span class="grow">Pengaturan</span>${icon('chev', 16, ' class="chev"')}</button></div>${aboutCard()}</div>`;
  const v = VERIF[w.verif] || [w.verif, ''];
  const li = (v2, ic, label, act) => `<button class="li" data-act="${act || 'go'}" ${act === 'role' ? `data-r="${v2}"` : `data-v="${v2}"`}><span class="ico xs t-green">${icon(ic, 17)}</span><span class="grow">${label}</span>${icon('chev', 16, ' class="chev"')}</button>`;
  return `<div class="stack">${pagehead('Akun Mitra', { back: false, right: `<button class="ghostico" data-act="go" data-v="settings" aria-label="Pengaturan">${icon('settings', 20)}</button>` })}${testerSwitch('worker')}
    <div class="card raise stack-sm"><div class="row">${avatarP(w, 'lg')}<div class="grow"><h3>${esc(w.name)}</h3><p class="small muted">${esc(w.phone)} · ${esc(areaName(w.area))}</p>${pill(v[0], v[1])}</div><button class="btn btn-ghost btn-sm" data-act="go" data-v="w_register" data-id="${w.id}">Ubah</button></div>
      <div class="chips">${(w.skills || []).map(c => `<span class="chip">${icon(BL.catById(c).icon, 14)} ${esc(BL.catById(c).name)}</span>`).join('')}</div>
      ${Object.keys(w.certs || {}).filter(k => w.certs[k]).length ? `<p class="small">${icon('shield', 14)} ${Object.keys(w.certs).filter(k => w.certs[k]).map(k => esc(BL.CERTS[k])).join(', ')}</p>` : ''}</div>
    <div class="list">${li('w_schedule', 'calendar', 'Jadwal & area kerja')}${li('w_wallet', 'wallet', 'Dompet, deposit & pencairan')}${li('w_perf', 'chart', 'Performa')}${li('w_portfolio', 'image', 'Portofolio')}${li('w_reviews', 'star', 'Ulasan dari pelanggan')}${li('w_tickets', 'headset', 'Bantuan & keluhan')}${li('notif_prefs', 'bell', 'Pengaturan notifikasi')}</div>
    <div class="list">${li('settings', 'settings', 'Pengaturan')}${li('customer', 'user', 'Buka aplikasi Pelanggan', 'role')}</div>
    ${R.mode === 'firebase' ? `<button class="btn btn-ghost btn-block" data-act="askLogout">${icon('logout', 18)} Keluar</button>` : ''}
    ${aboutCard()}</div>`;
};
VIEWS.w_portfolio = () => {
  const w = actor('worker'); if (!w) return workerGate();
  const d = draft('pf_' + w.id, () => ({ list: (w.portfolio || []).slice() }));
  return `<div class="stack">${pagehead('Portofolio')}<p class="small muted">Foto hasil kerja Anda tampil di profil mitra yang dilihat pelanggan.</p>
    ${photoPicker('pf_' + w.id + '.list', d.list, { big: true })}
    ${actionbar(`<button class="btn btn-primary" data-act="savePortfolio" data-k="pf_${w.id}">Simpan Portofolio</button>`)}</div>`;
};
A.savePortfolio = async d => { const ok = await updateMyProfile('worker', { portfolio: S.d[d.k].list.slice(0, 12) }, 'portfolio'); if (ok) { S.d[d.k] = null; toast('Portofolio disimpan'); back(); } };
VIEWS.w_reviews = () => { const w = actor('worker'); return w ? reviewsReceived(w.id, 'worker') : workerGate(); };
VIEWS.w_tickets = () => ticketList(actor('worker'));
VIEWS.w_chats = () => { const w = actor('worker'); return `<div class="stack">${pagehead('Chat', { back: false })}${w ? chatList(w.id) : workerGate()}</div>`; };
VIEWS.w_feedback = p => { const b = Store.get('bookings', p.id); if (!b) return empty('alert', 'Pesanan tidak ditemukan'); if (Store.get('feedback', p.id + '__w2c')) return `${pagehead('Ulasan')}${note('ok', 'check', 'Anda sudah mengulas pelanggan ini.')}`; return feedbackForm(p.id, 'w2c'); };
VIEWS.w_invoice = p => invoiceView(p.id, 'worker');
function invoiceView(iid, role) {
  const inv = Store.get('invoices', iid); if (!inv) return empty('alert', 'Tagihan tidak ditemukan');
  const b = Store.get('bookings', inv.bookingId);
  if (role === 'worker') { const w = actor('worker'); if (!w || inv.workerPid !== w.id) return `${pagehead('Tagihan')}${note('danger', 'lock', 'Tidak ada akses.')}`; }
  const t = inv.totals;
  return `<div class="stack">${role === 'ops' ? '' : pagehead(inv.code)}<div class="card stack-sm"><div class="row between"><span class="mono small">${esc(b.code)}</span>${invPill(inv)}</div>${linesKV(inv.lines, { types: true })}
    <div class="hr"></div><div class="kv small"><span>Nilai jasa kena komisi</span><span class="v">${rp(t.eligible)}</span><span>Komisi platform ${t.pct}%</span><span class="v">− ${rp(t.commission)}</span><span class="strong">Bagian mitra</span><span class="v strong">${rp(t.workerNet)}</span></div>
    <p class="xs muted">Material, perjalanan, pengadaan, dan pengiriman tidak dikenai komisi.</p></div>
    ${role === 'ops' ? opsInvoiceTools(inv) : ''}</div>`;
}
VIEWS.w_register = p => {
  const ex = p.id ? prof(p.id) : null;
  const k = 'reg_w' + (p.id || '');
  const d = draft(k, () => ex ? { id: ex.id, name: ex.name, phone: ex.phone, area: ex.area, address: ex.address || '', skills: (ex.skills || []).slice(), bio: ex.bio || '', experience: ex.experience || '', tools: ex.tools || '', certsClaimed: Object.assign({}, ex.certsClaimed || {}), photo: ex.photo ? [ex.photo] : [], docs: null, agree: true } : { name: ME.name || '', phone: '', area: '', address: '', skills: [], bio: '', experience: '', tools: '', certsClaimed: {}, photo: [], docs: { ktp: [], sertifikat: [] }, agree: false });
  return `<div class="stack">${pagehead(ex ? 'Ubah Profil Mitra' : 'Daftar Jadi Mitra')}
    <div class="stack-sm" style="align-items:center;text-align:center">${avatar(d.name || '?', 'xl', d.photo[0])}${canUpload() ? `<label class="linkbtn" style="cursor:pointer">${icon('camera', 16)} ${d.photo.length ? 'Ganti foto' : 'Tambah foto profil'}<input type="file" accept="image/*" data-photo="${k}.photo" data-single="1" hidden></label>` : ''}<p class="xs muted">Foto wajah jelas meningkatkan kepercayaan pelanggan.</p></div>
    <div class="card stack"><h3>Data diri</h3>${fld('Nama lengkap sesuai KTP', input(k + '.name', d.name), { req: true })}${fld('Nomor HP', input(k + '.phone', d.phone, 'type="tel" inputmode="tel" placeholder="08xxxxxxxxxx"'), { req: true })}
      ${fld('Wilayah kerja utama', selectEl(k + '.area', d.area, areaOptions(true)), { req: true, hint: 'Dipakai untuk menghitung jarak dan biaya perjalanan.' })}${fld('Alamat', textarea(k + '.address', d.address))}</div>
    <div class="card stack-sm"><h3>Keahlian</h3><p class="xs muted">Pilih kategori yang benar-benar Anda kuasai.</p><div class="chips">${BL.CATEGORIES.map(c => `<button class="chip" data-act="toggleSkill" data-k="${k}" data-c="${c.id}" aria-pressed="${d.skills.includes(c.id)}">${icon(c.icon, 14)} ${esc(c.name)}</button>`).join('')}</div></div>
    <div class="card stack">${fld('Pengalaman', textarea(k + '.experience', d.experience, 'placeholder="Contoh: 5 tahun teknisi AC di bengkel elektronik"'))}${fld('Peralatan yang dimiliki', input(k + '.tools', d.tools, 'placeholder="Contoh: jet cleaner, manifold, tangga"'))}${fld('Profil singkat', textarea(k + '.bio', d.bio, 'placeholder="Tampil di profil yang dilihat pelanggan"'))}</div>
    <div class="card stack-sm"><h3>Sertifikasi pekerjaan berisiko</h3><p class="xs muted">Diperiksa manual oleh tim verifikasi sebelum Anda menerima pekerjaan berisiko tinggi.</p>${Object.entries(BL.CERTS).map(([ck, cl]) => `<label class="check"><input type="checkbox" data-f="${k}.certsClaimed.${ck}" ${d.certsClaimed[ck] ? 'checked' : ''}><span>${esc(cl)}</span></label>`).join('')}</div>
    ${d.docs ? `<div class="card stack-sm"><h3>Dokumen verifikasi</h3>${note('', 'lock', 'Disimpan di area privat akun Anda dan hanya dapat dibuka pemilik aplikasi untuk verifikasi.')}<div class="field"><span>Foto KTP</span>${photoPicker(k + '.docs.ktp', d.docs.ktp)}</div><div class="field"><span>Sertifikat / bukti keahlian</span>${photoPicker(k + '.docs.sertifikat', d.docs.sertifikat)}</div></div>` : ''}
    ${ex ? '' : `<label class="check"><input type="checkbox" data-f="${k}.agree" ${d.agree ? 'checked' : ''}><span>Saya setuju dengan ketentuan mitra: komisi ${CFG().commissionPct}% dari nilai jasa, deposit minimum ${rp(CFG().minDeposit)}, dan kode etik layanan.</span></label>`}
    ${actionbar(`<button class="btn btn-primary" data-act="saveWorker" data-k="${k}">${ex ? 'Simpan' : 'Kirim Pendaftaran'}</button>`)}</div>`;
};
A.toggleSkill = d => { const s = S.d[d.k].skills; const i = s.indexOf(d.c); if (i >= 0) s.splice(i, 1); else s.push(d.c); };
A.saveWorker = async d => { if (!requireWrite()) return; const v = Object.assign({}, S.d[d.k]); if (!v.agree) return toast('Setujui ketentuan mitra terlebih dahulu.', true); v.photo = (v.photo || [])[0] || null; const id = await saveProfile('worker', v); if (id) { S.d[d.k] = null; toast(v.id ? 'Profil tersimpan' : 'Pendaftaran terkirim'); back(); } };
/* =========================================================
   BERESIN — Pengaturan: tampilan, akun, privasi & keamanan, keluar
   Preferensi tampilan disimpan per perangkat (localStorage).
   ========================================================= */
const APP_VERSION = '1.5';
const PREF_KEY = 'beresin.pref';
const PREF = { theme: 'auto', text: 'normal', motion: true };
const HOST_THEME = document.documentElement.getAttribute('data-theme');
function loadPrefs() {
  try { const o = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (o && typeof o === 'object') Object.assign(PREF, o); } catch (e) { /* abaikan */ }
  applyPrefs();
}
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(PREF)); } catch (e) { /* abaikan */ } applyPrefs(); }
function applyPrefs() {
  const r = document.documentElement;
  const t = PREF.theme === 'light' || PREF.theme === 'dark' ? PREF.theme : HOST_THEME;
  if (t) r.setAttribute('data-theme', t); else r.removeAttribute('data-theme');
  r.setAttribute('data-text', ['normal', 'besar', 'sangat'].includes(PREF.text) ? PREF.text : 'normal');
  r.classList.toggle('reduce-motion', PREF.motion === false);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    if (!meta.dataset.base) meta.dataset.base = meta.getAttribute('content') || '#16A34A';
    const dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', dark ? '#09110E' : meta.dataset.base);
  }
}
A.setPref = d => { PREF[d.k] = d.x; savePrefs(); };
A.toggleMotion = () => { PREF.motion = PREF.motion === false; savePrefs(); };

/* ---------- Pasang di layar utama (PWA) ---------- */
let INSTALL_EVT = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL_EVT = e; scheduleRender(); });
window.addEventListener('appinstalled', () => { INSTALL_EVT = null; try { localStorage.setItem('beresin.installed', '1'); } catch (e) { /* abaikan */ } toast('BERESIN terpasang di layar utama'); scheduleRender(); });
function isStandalone() { return !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone); }
function inFrame() { try { return window.self !== window.top; } catch (e) { return true; } }
function canInstall() { return /^https?:$/.test(location.protocol) && !inFrame() && !isStandalone(); }
function deviceOS() { const ua = navigator.userAgent || ''; if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'; if (/Android/i.test(ua)) return 'android'; return 'lain'; }
function installCard() {
  if (!canInstall()) return '';
  try { if (localStorage.getItem('beresin.installHide') === '1') return ''; } catch (e) { /* abaikan */ }
  if (deviceOS() === 'lain' && !INSTALL_EVT) return '';
  return `<div class="card raise row installcard"><span class="ico sm solid t-green">${icon('download', 18)}</span><div class="grow"><b class="small">Pasang BERESIN di HP</b><div class="xs muted">Buka lebih cepat dari layar utama, seperti aplikasi.</div></div><button class="btn btn-primary btn-sm" data-act="installApp">Pasang</button><button class="ghostico" data-act="hideInstall" aria-label="Tutup">${icon('x', 16)}</button></div>`;
}
A.hideInstall = () => { try { localStorage.setItem('beresin.installHide', '1'); } catch (e) { /* abaikan */ } };
const INSTALL_STEPS = {
  ios: ['iPhone / iPad (Safari)', [
    ['Buka di Safari', 'Pastikan halaman ini dibuka di <b>Safari</b>.'],
    ['Ketuk tombol Bagikan', 'Ketuk ikon <b>Bagikan</b> (kotak dengan panah ke atas) di bawah layar. Di iOS terbaru, ketuk <b>•••</b> dulu, lalu <b>Bagikan</b>.'],
    ['Tambah ke Layar Utama', 'Gulir ke bawah, pilih <b>Tambahkan ke Layar Utama</b>, lalu ketuk <b>Tambah</b> di kanan atas.']
  ]],
  android: ['Android (Chrome)', [
    ['Buka di Chrome', 'Pastikan halaman ini dibuka di <b>Chrome</b>.'],
    ['Ketuk menu ⋮', 'Ketuk <b>titik tiga ⋮</b> di kanan atas layar.'],
    ['Instal aplikasi', 'Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>, lalu ketuk <b>Instal</b>.']
  ]]
};
function installStepsHtml(os) {
  const list = os === 'ios' || os === 'android' ? [os] : ['android', 'ios'];
  return list.map(k => { const [title, steps] = INSTALL_STEPS[k]; return `<div class="stack-sm"><h4>${esc(title)}</h4><ol class="isteps">${steps.map(([h, t]) => `<li><span class="t">${esc(h)}</span><span class="d small muted">${t}</span></li>`).join('')}</ol></div>`; }).join('');
}
A.installApp = async () => {
  if (INSTALL_EVT) {
    const e = INSTALL_EVT; INSTALL_EVT = null;
    try { e.prompt(); const r = await e.userChoice; if (r && r.outcome === 'accepted') toast('Memasang BERESIN…'); } catch (err) { /* abaikan */ }
    return;
  }
  sheetHtml('Pasang BERESIN', `<div class="stack"><div class="row">${logo(44)}<div><h3>Pasang di layar utama</h3><p class="xs muted">Gratis, tanpa Play Store / App Store.</p></div></div>${installStepsHtml(deviceOS())}<button class="btn btn-primary btn-block" data-act="sheetCancel">Mengerti</button></div>`);
};

function setLi(o) {
  const tag = o.act ? 'button' : 'div';
  const attrs = o.act ? `data-act="${o.act}"${o.v ? ` data-v="${o.v}"` : ''}${o.id ? ` data-id="${esc(o.id)}"` : ''}${o.r ? ` data-r="${o.r}"` : ''}${o.x ? ` data-x="${o.x}"` : ''}` : '';
  return `<${tag} class="li ${o.danger ? 'danger' : ''}" ${attrs}><span class="ico xs ${o.danger ? 't-red' : (o.tone || 't-green')}">${icon(o.ic, 17)}</span><span class="grow"><span class="strong small" style="display:block">${esc(o.label)}</span>${o.hint ? `<span class="xs muted" style="display:block">${esc(o.hint)}</span>` : ''}</span>${o.val ? `<span class="val">${esc(o.val)}</span>` : ''}${o.act ? icon('chev', 16, ' class="chev"') : ''}</${tag}>`;
}
function segPref(key, opts, label) {
  return `<div class="seg full" role="group" aria-label="${esc(label)}">${opts.map(([v, l, ic]) => `<button data-act="setPref" data-k="${key}" data-x="${v}" aria-pressed="${PREF[key] === v}">${ic ? icon(ic, 15) : ''}<span>${esc(l)}</span></button>`).join('')}</div>`;
}
function geoStatusText() {
  if (!('geolocation' in navigator)) return 'Tidak didukung';
  return R.geo === 'unavailable' ? 'Diblokir' : 'Tanya dulu';
}

VIEWS.settings = () => {
  const role = S.role === 'worker' ? 'worker' : 'customer';
  const me = actor(role);
  const other = role === 'worker' ? ['customer', 'user', 'Buka aplikasi Pelanggan'] : ['worker', 'brief', 'Buka aplikasi Mitra'];
  const account = [
    me ? setLi({ act: 'go', v: role === 'worker' ? 'w_register' : 'c_register', id: me.id, ic: 'user', label: 'Profil saya', hint: 'Nama, nomor HP, foto, kecamatan' }) : setLi({ act: 'go', v: role === 'worker' ? 'w_register' : 'c_register', ic: 'user', label: role === 'worker' ? 'Daftar sebagai mitra' : 'Buat profil pelanggan' }),
    R.mode === 'firebase' && ME.email ? setLi({ ic: 'lock', label: 'Akun Google', hint: ME.email, tone: 't-blue' }) : '',
    me && role === 'customer' ? setLi({ act: 'go', v: 'c_addresses', ic: 'pin', label: 'Alamat tersimpan' }) : '',
    me && role === 'worker' ? setLi({ act: 'go', v: 'w_schedule', ic: 'calendar', label: 'Jadwal & area kerja' }) : '',
    me ? setLi({ act: 'go', v: 'notif_prefs', ic: 'bell', label: 'Notifikasi', hint: 'Promo, push, email' }) : '',
    setLi({ act: 'role', r: other[0], ic: other[1], label: other[2] })
  ].join('');
  const logout = R.mode === 'firebase'
    ? `<button class="btn btn-danger btn-block" data-act="askLogout">${icon('logout', 18)} Keluar</button>`
    : R.mode === 'local'
      ? note('', 'info', '<b>Mode demo</b> tidak memakai akun, jadi tidak ada tombol keluar. Untuk memulai dari awal, pakai <b>Hapus data demo</b> di atas.')
      : note('', 'info', 'Akun Anda dikelola oleh platform tempat aplikasi ini dibuka. Untuk keluar, keluar dari akun di platform tersebut.');
  return `<div class="stack">${pagehead('Pengaturan')}
    <div class="setsec">Tampilan</div>
    <div class="list">
      <div class="setrow"><div class="lbl"><span class="ico xs t-amber">${icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'moon' : 'sun', 17)}</span><span class="grow"><span class="strong small" style="display:block">Tema &amp; pencahayaan</span><span class="xs muted">Otomatis mengikuti mode terang/gelap HP Anda.</span></span></div>
        ${segPref('theme', [['light', 'Terang', 'sun'], ['dark', 'Gelap', 'moon'], ['auto', 'Otomatis', 'repeat']], 'Tema')}</div>
      <div class="setrow"><div class="lbl"><span class="ico xs t-blue">${icon('type', 17)}</span><span class="grow"><span class="strong small" style="display:block">Ukuran teks</span><span class="xs muted">Berlaku di seluruh aplikasi.</span></span></div>
        ${segPref('text', [['normal', 'Normal'], ['besar', 'Besar'], ['sangat', 'Sangat besar']], 'Ukuran teks')}</div>
      <div class="li"><span class="ico xs t-violet">${icon('sparkle', 17)}</span><span class="grow"><span class="strong small" style="display:block">Kurangi animasi</span><span class="xs muted">Matikan gerakan & transisi.</span></span><button class="switch" role="switch" aria-checked="${PREF.motion === false}" data-act="toggleMotion" aria-label="Kurangi animasi"></button></div>
    </div>
    <div class="setsec">Akun</div>
    <div class="list">${account}</div>
    <div class="setsec">Privasi &amp; keamanan</div>
    <div class="list">
      ${setLi({ act: 'go', v: 'legal', x: 'privasi', ic: 'shield', label: 'Kebijakan privasi' })}
      ${setLi({ act: 'go', v: 'legal', x: 'ketentuan', ic: 'file', label: 'Syarat & ketentuan' })}
      ${setLi({ ic: 'nav', label: 'Izin lokasi perangkat', hint: 'Lokasi hanya dibagikan selama pesanan aktif.', val: geoStatusText(), tone: 't-teal' })}
      ${me ? setLi({ act: 'askDeleteAccount', ic: 'trash', label: 'Ajukan penghapusan akun', danger: true }) : ''}
    </div>
    <div class="setsec">Bantuan &amp; info</div>
    <div class="list">
      ${canInstall() ? setLi({ act: 'installApp', ic: 'download', label: 'Pasang di layar utama HP', hint: 'Buka BERESIN seperti aplikasi biasa.' }) : ''}
      ${setLi({ act: 'go', v: role === 'worker' ? 'w_tickets' : 'c_tickets', ic: 'headset', label: 'Pusat bantuan' })}
      ${setLi({ act: 'aboutApp', ic: 'info', label: 'Tentang BERESIN', val: 'Versi ' + APP_VERSION })}
      ${R.mode === 'local'
        ? setLi({ act: 'askResetDevice', ic: 'trash', label: 'Hapus data demo', hint: 'Menghapus semua data di perangkat ini.', danger: true })
        : setLi({ act: 'askResetDevice', ic: 'repeat', label: 'Atur ulang perangkat ini', hint: 'Mengembalikan tampilan & pilihan ke bawaan.', tone: 't-slate' })}
    </div>
    ${logout}
    <p class="xs muted" style="text-align:center">Versi ${APP_VERSION}</p></div>`;
};

A.askLogout = () => ask({ title: 'Keluar dari BERESIN?', body: `Anda akan keluar dari akun ${esc(ME.email || '')} di perangkat ini. Pesanan dan data Anda tetap tersimpan.`, ok: 'Keluar', danger: true, onOk: () => A.fbLogout() });
A.askDeleteAccount = () => {
  const role = S.role === 'worker' ? 'worker' : 'customer';
  ask({
    title: 'Ajukan penghapusan akun',
    body: 'Permintaan dikirim ke tim BERESIN untuk ditinjau. Pesanan yang masih berjalan perlu diselesaikan dulu. Catatan transaksi di buku besar tetap disimpan.',
    fields: [{ k: 'reason', label: 'Alasan (opsional)', ph: 'Ceritakan alasan Anda' }],
    ok: 'Kirim permintaan', danger: true,
    onOk: async v => {
      const tid = await openTicket({ type: 'lainnya', subject: 'Permintaan penghapusan akun', text: `Saya meminta akun ${role === 'worker' ? 'mitra' : 'pelanggan'} saya beserta datanya dihapus.${v.reason ? ' Alasan: ' + v.reason : ''}` });
      if (tid) go('ticket', { id: tid });
    }
  });
};
A.askResetDevice = () => {
  const local = R.mode === 'local';
  ask({
    title: local ? 'Hapus data demo?' : 'Atur ulang perangkat ini?',
    body: local ? 'Semua pesanan, profil, dan pengaturan demo di perangkat ini akan dihapus. Tindakan ini tidak bisa dibatalkan.' : 'Tema, ukuran teks, dan pilihan tampilan kembali ke bawaan. Data akun Anda tidak terhapus.',
    ok: local ? 'Hapus' : 'Atur ulang', danger: local,
    onOk: () => {
      try { Object.keys(localStorage).filter(k => k.startsWith('beresin.') && (local || k === PREF_KEY || k === 'beresin.ui')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* abaikan */ }
      location.reload();
    }
  });
};
A.aboutApp = () => sheetHtml('Tentang BERESIN', `<div class="stack" style="align-items:center;text-align:center">${logo(64)}<h3>BERESIN</h3><p class="small muted">Urusan beres, hidup lebih mudah.<br>Versi ${APP_VERSION} · Kupang, NTT</p>
  <div class="card soft stack-sm" style="text-align:left;width:100%"><p class="small">${R.mode === 'local' ? 'Mode demo: data tersimpan di perangkat ini saja.' : 'Data tersimpan di database bersama dan tersinkron antarperangkat.'}</p><p class="small muted">Pembayaran, deposit, dan pencairan masih berjalan dalam <b>mode simulasi</b> sampai gateway pembayaran berizin dihubungkan. Notifikasi push, email, dan WhatsApp belum terhubung.</p></div>
  <button class="btn btn-primary btn-block" data-act="sheetCancel">Tutup</button></div>`);

const LEGAL = {
  privasi: ['Kebijakan Privasi', [
    ['Data yang kami kumpulkan', 'Nama, nomor HP, alamat dan kecamatan, foto profil, foto kondisi atau hasil pekerjaan, isi chat, ulasan, riwayat pesanan dan transaksi. Untuk mitra juga keahlian, sertifikat, dan dokumen verifikasi.'],
    ['Lokasi', 'Titik lokasi dan posisi perjalanan hanya dipakai selama pesanan aktif, untuk menampilkan jarak dan perkiraan tiba. Berbagi lokasi bisa dihentikan kapan saja dan berhenti otomatis saat pesanan selesai atau dibatalkan.'],
    ['Untuk apa data dipakai', 'Mencocokkan pesanan dengan mitra terdekat, menghitung biaya, memproses laporan dan tagihan, menangani keluhan dan garansi, serta menjaga keamanan layanan.'],
    ['Siapa yang bisa melihat', 'Nomor HP dan alamat lengkap hanya ditampilkan kepada mitra yang menangani pesanan Anda (dan sebaliknya). Dokumen verifikasi mitra hanya bisa dibuka oleh mitra itu sendiri dan admin. BERESIN tidak menjual data pribadi.'],
    ['Hak Anda', 'Anda dapat melihat dan mengubah profil kapan saja, mengatur notifikasi, dan mengajukan penghapusan akun lewat Pengaturan → Ajukan penghapusan akun. Catatan transaksi tetap disimpan untuk pembukuan.'],
    ['Hubungi kami', 'Pertanyaan tentang privasi dapat dikirim lewat Pusat Bantuan di aplikasi.']
  ]],
  ketentuan: ['Syarat & Ketentuan', [
    ['Peran BERESIN', 'BERESIN menghubungkan pelanggan dengan mitra jasa terverifikasi di Kupang dan sekitarnya. Pekerjaan dilakukan oleh mitra.'],
    ['Harga & persetujuan', 'Estimasi harga dan biaya perjalanan ditampilkan sebelum memesan. Pekerjaan tambahan, material, atau perubahan jadwal harus diajukan mitra dan disetujui pelanggan di aplikasi sebelum dikerjakan.'],
    ['Pembayaran', 'Pelanggan membayar setelah pekerjaan dikonfirmasi selesai, atau per termin untuk proyek yang disepakati. Selama masa uji coba, pembayaran berjalan dalam mode simulasi.'],
    ['Komisi mitra', 'BERESIN memotong komisi dari nilai jasa sesuai pengaturan yang berlaku. Material dan biaya perjalanan tidak dikenai komisi. Mitra wajib menjaga deposit minimum.'],
    ['Pembatalan', 'Pembatalan mengikuti kebijakan pembatalan yang tampil di halaman layanan. Biaya pembatalan dapat berlaku bila mitra sudah berangkat atau tiba.'],
    ['Garansi & keluhan', 'Masa garansi berbeda per layanan dan tercantum di halaman layanan. Keluhan dan klaim garansi diajukan lewat pesanan terkait dan ditinjau tim dukungan.'],
    ['Perilaku', 'Dilarang menyalahgunakan chat, membagikan data pihak lain tanpa izin, atau bertransaksi di luar aplikasi untuk menghindari komisi. Akun yang melanggar dapat dibatasi.']
  ]]
};
VIEWS.legal = p => {
  const doc = LEGAL[p.x] || LEGAL.privasi;
  return `<div class="stack">${pagehead(doc[0])}
    ${isTester() ? note('warn', 'alert', 'Draf awal untuk uji coba. Tinjau bersama penasihat hukum sebelum aplikasi dibuka untuk umum.') : ''}
    <div class="card stack">${doc[1].map(([h, t]) => `<div class="stack-sm"><h4>${esc(h)}</h4><p class="small muted">${esc(t)}</p></div>`).join('')}</div>
    <p class="xs muted" style="text-align:center">Berlaku untuk BERESIN versi ${APP_VERSION}</p></div>`;
};
/* =========================================================
   BERESIN — konsol Operasional: admin, dukungan, supervisor, keuangan
   ========================================================= */
const OPS_SECTIONS = [
  ['dash', 'a_dash', 'chart', 'Dasbor'], ['bookings', 'a_bookings', 'receipt', 'Pesanan'], ['tickets', 'a_tickets', 'ticket', 'Tiket & garansi'],
  ['workers', 'a_workers', 'shield', 'Mitra & verifikasi'], ['users', 'a_users', 'users', 'Pengguna & staf'], ['feedback', 'a_feedback', 'star', 'Ulasan'],
  ['finance', 'a_finance', 'money', 'Keuangan'], ['catalog', 'a_catalog', 'tag', 'Katalog & harga'], ['promo', 'a_promo', 'megaphone', 'Promo & banner'], ['config', 'a_config', 'settings', 'Konfigurasi'],
  ['notifs', 'a_notifs', 'bell', 'Notifikasi'], ['audit', 'a_audit', 'log', 'Log audit']
];
function opsCounts() {
  return {
    workers: Store.list('profiles').filter(p => p.role === 'worker' && p.verif === 'menunggu').length,
    tickets: Store.list('tickets').filter(t => !['selesai', 'ditutup'].includes(t.status)).length,
    feedback: Store.list('feedback').filter(f => ['dilaporkan', 'ditinjau'].includes(f.status)).length,
    finance: ledgerList().filter(e => e.kind === 'payout_request' && !Store.get('ledger', e.id + '_paid') && !Store.get('ledger', e.id + '_rev')).length,
    notifs: notifsFor(['ops']).filter(n => !n.read).length
  };
}
function opsShell(sec, title, content, right) {
  const role = staffRole();
  if (!role || !opsCan(sec)) return `<div class="ops">${opsNav(sec)}<div>${note('danger', 'lock', 'Peran Anda tidak memiliki akses ke bagian ini.')}</div></div>`;
  return `<div class="ops">${opsNav(sec)}<div class="stack" style="min-width:0"><div class="pagehead">${S.nav.ops.length > 1 ? `<button class="iconbtn" data-act="back" aria-label="Kembali">${icon('back')}</button>` : ''}<h1>${esc(title)}</h1>${right || ''}</div>${content}</div></div>`;
}
function opsNav(sec) {
  const c = opsCounts(); const role = staffRole();
  return `<nav class="opsnav" aria-label="Menu operasional"><div class="xs muted" style="padding:4px 12px;white-space:nowrap">Peran: <b>${esc({ admin: 'Admin', supervisor: 'Supervisor', support: 'Dukungan', finance: 'Keuangan' }[role] || '-')}</b></div>${OPS_SECTIONS.filter(([k]) => opsCan(k)).map(([k, v, ic, l]) => `<button data-act="tab" data-v="${v}" ${sec === k ? 'aria-current="page"' : ''}>${icon(ic, 17)}<span>${l}</span>${c[k] ? `<span class="cnt">${c[k]}</span>` : ''}</button>`).join('')}</nav>`;
}
function inRange(ts) { const r = S.ui.range || '30'; if (r === 'all') return true; return ts >= now() - Number(r) * 86400000; }
function dashFilters() {
  return `<div class="filters">${selectEl('__f.range', S.ui.range || '30', [{ v: '7', l: '7 hari' }, { v: '30', l: '30 hari' }, { v: '90', l: '90 hari' }, { v: 'all', l: 'Semua waktu' }], 'data-ui="range"')}
    ${selectEl('__f.area', S.ui.area || '', [{ v: '', l: 'Semua wilayah' }].concat(areaOptions()), 'data-ui="area"')}
    ${selectEl('__f.cat', S.ui.cat || '', [{ v: '', l: 'Semua kategori' }].concat(BL.CATEGORIES.map(c => ({ v: c.id, l: c.name }))), 'data-ui="cat"')}</div>`;
}
document.addEventListener('change', e => { const el = e.target.closest('[data-ui]'); if (el) { S.ui[el.dataset.ui] = el.value; scheduleRender(true); } });
function filteredBookings() { return Store.list('bookings').filter(b => inRange(b.at) && (!S.ui.area || b.address.area === S.ui.area) && (!S.ui.cat || b.cat === S.ui.cat)); }
function isOverdue(b) {
  if (!['menunggu_mitra', 'ditugaskan', 'dalam_perjalanan'].includes(b.status)) {
    if (b.status === 'dikerjakan' && b.project && b.project.estEnd) return b.project.estEnd < todayISO(0);
    return false;
  }
  const t = b.schedule.time === 'Secepatnya' ? '00:00' : b.schedule.time;
  return new Date(b.schedule.date + 'T' + t).getTime() + 2 * 3600000 < now();
}

/* ---------- Dasbor ---------- */
VIEWS.a_dash = () => {
  const bs = filteredBookings();
  const allW = Store.list('profiles').filter(p => p.role === 'worker');
  const custs = Store.list('profiles').filter(p => p.role === 'customer');
  const invs = Store.list('invoices').filter(i => bs.some(b => b.id === i.bookingId));
  const paid = invs.filter(i => i.paidAt);
  const L = ledgerList();
  const sum = (f) => L.filter(f).reduce((a, e) => a + e.amount, 0);
  const done = bs.filter(b => b.status === 'selesai').length, canc = bs.filter(b => b.status === 'dibatalkan').length;
  const fbs = Store.list('feedback').filter(f => f.dir === 'c2w' && f.status !== 'disembunyikan');
  const avg = BL.avgRating(fbs);
  const pendQ = bs.reduce((a, b) => a + BL.quotesOf(b, null, 'menunggu').length, 0);
  const pendR = Store.list('reports').filter(r => r.status === 'menunggu_respons').length;
  const failedN = Store.list('notifications').filter(n => Object.values(n.channels || {}).includes('gagal')).length;
  const kpi = (k, v, s, alert) => `<div class="stat ${alert ? 'alert' : ''}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  // grafik 14 hari
  const days = []; for (let i = 13; i >= 0; i--) { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const st = d0.getTime() - i * 86400000; days.push({ st, n: Store.list('bookings').filter(b => b.at >= st && b.at < st + 86400000 && (!S.ui.area || b.address.area === S.ui.area) && (!S.ui.cat || b.cat === S.ui.cat)).length }); }
  const mx = Math.max(1, ...days.map(d => d.n));
  const byCat = BL.CATEGORIES.map(c => ({ c, n: bs.filter(b => b.cat === c.id).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const chart = `<svg viewBox="0 0 560 170" width="100%" style="max-width:100%;display:block" role="img" aria-label="Pesanan per hari, 14 hari terakhir">
    ${[0, .5, 1].map(f => `<line x1="34" x2="552" y1="${140 - f * 120}" y2="${140 - f * 120}" stroke="var(--line)" stroke-width="1"/><text x="28" y="${144 - f * 120}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(mx * f)}</text>`).join('')}
    ${days.map((d, i) => { const h = d.n / mx * 120; const x = 40 + i * 37; const dt = new Date(d.st); return `<rect x="${x}" y="${140 - h}" width="24" height="${Math.max(h, d.n ? 2 : 0)}" rx="4" fill="${i === 13 ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 45%, var(--surface))'}"/><text x="${x + 12}" y="158" text-anchor="middle" font-size="10" fill="var(--muted)">${dt.getDate()}/${dt.getMonth() + 1}</text>${d.n ? `<text x="${x + 12}" y="${134 - h}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--fg)">${d.n}</text>` : ''}`; }).join('')}</svg>`;
  const guide = ME.isOwner && Store.list('bookings').length < 3 ? `<div class="card stack-sm"><div class="row between"><h3>Uji alur lengkap sendirian</h3>${pill('Pemilik', 'accent')}</div><p class="small muted">Database online ini masih kosong. Anda bisa menguji semua peran dari satu akun:</p>
    <ol class="small" style="margin:0;padding-left:20px;display:grid;gap:4px"><li>Buka <b>Pelanggan</b> → Akun → buat profil pelanggan.</li><li>Buka <b>Mitra</b> → daftar jadi mitra (pilih keahlian, misalnya AC).</li><li>Kembali ke <b>Operasional</b> → Mitra & verifikasi → verifikasi profil mitra Anda.</li><li>Di <b>Mitra</b>: isi deposit (simulasi) lalu nyalakan status online.</li><li>Di <b>Pelanggan</b>: pesan “Cuci AC”, lalu terima, laporkan, dan selesaikan dari sisi Mitra.</li></ol>
    <p class="xs muted">Untuk orang lain: bagikan aplikasi lewat tombol Bagikan di claude.ai dengan akses yang bisa menulis data (lihat catatan di Konfigurasi).</p></div>` : '';
  return opsShell('dash', 'Dasbor operasional', `${guide}${dashFilters()}
    <div class="kpis">
      ${kpi('Pelanggan', custs.length)}${kpi('Mitra terdaftar', allW.length, `${allW.filter(w => w.verif === 'terverifikasi').length} terverifikasi · ${allW.filter(w => w.online).length} online`)}
      ${kpi('Pesanan baru', bs.length, 'dalam rentang filter')}${kpi('Aktif', bs.filter(b => BL.ACTIVE_STATUSES.includes(b.status) || b.status === 'menunggu_mitra').length, `${bs.filter(b => b.status === 'menunggu_mitra').length} mencari mitra`)}
      ${kpi('Selesai', done, bs.length ? Math.round(done / bs.length * 100) + '% penyelesaian' : '')}${kpi('Terlambat', bs.filter(isOverdue).length, 'jadwal lewat > 2 jam', bs.filter(isOverdue).length > 0)}
      ${kpi('Tingkat pembatalan', bs.length ? Math.round(canc / bs.length * 100) + '%' : '–', `${canc} dibatalkan`)}${kpi('Nilai layanan', rp(invs.reduce((a, i) => a + i.totals.total, 0)), `${invs.length} tagihan`)}
      ${kpi('Pembayaran terverifikasi', rp(paid.reduce((a, i) => a + i.totals.total, 0)), 'simulasi')}${kpi('Komisi platform', rp(sum(e => e.account === 'platform_commission' && inRange(e.at))))}
      ${kpi('Saldo deposit mitra', rp(sum(e => e.account === 'worker_deposit')))}${kpi('Refund & pencairan', rp(-sum(e => e.account === 'refund' && inRange(e.at))), `pencairan ${rp(-sum(e => e.kind === 'payout_request' && inRange(e.at)))}`)}
      ${kpi('Keluhan terbuka', Store.list('tickets').filter(t => t.type !== 'garansi' && !['selesai', 'ditutup'].includes(t.status)).length, '', Store.list('tickets').some(t => t.priority === 'kritis' && !['selesai', 'ditutup'].includes(t.status)))}${kpi('Klaim garansi', Store.list('tickets').filter(t => t.type === 'garansi' && !['selesai', 'ditutup'].includes(t.status)).length, 'terbuka')}
      ${kpi('Laporan menunggu respons', pendR)}${kpi('Penawaran menunggu', pendQ)}
      ${kpi('Ulasan perlu moderasi', Store.list('feedback').filter(f => ['dilaporkan', 'ditinjau'].includes(f.status)).length)}${kpi('Gagal kirim notifikasi', failedN, 'saluran eksternal belum terhubung')}
      ${kpi('Rating rata-rata mitra', avg.count ? avg.avg.toFixed(1) : '–', `${avg.count} ulasan`)}${kpi('Verifikasi menunggu', allW.filter(w => w.verif === 'menunggu').length, '', allW.some(w => w.verif === 'menunggu'))}
    </div>
    <div class="card stack-sm"><h3>Pesanan per hari · 14 hari terakhir</h3><div style="overflow-x:auto">${chart}</div></div>
    <div class="card stack-sm"><h3>Pesanan per kategori</h3>${byCat.length ? byCat.map(x => `<div class="row small"><span style="width:150px;flex:none">${esc(x.c.name)}</span><div class="bar grow"><i style="width:${x.n / byCat[0].n * 100}%"></i></div><span class="num strong" style="width:30px;text-align:right">${x.n}</span></div>`).join('') : '<p class="small muted">Belum ada pesanan pada rentang ini.</p>'}</div>
    ${bs.filter(isOverdue).length ? `<div class="card stack-sm"><h3>Perlu perhatian: terlambat</h3><div class="list">${bs.filter(isOverdue).map(b => orderRow(b, 'a_booking')).join('')}</div></div>` : ''}`);
};

/* ---------- Pesanan ---------- */
VIEWS.a_bookings = () => {
  const st = S.ui.bSt || ''; const q = String((S.d.bq && S.d.bq.q) || '').toLowerCase();
  const list = filteredBookings().filter(b => (!st || (st === 'terlambat' ? isOverdue(b) : b.status === st)) && (!q || (b.code + ' ' + b.serviceName + ' ' + ((prof(b.customerPid) || {}).name || '') + ' ' + ((prof(b.workerPid) || {}).name || '')).toLowerCase().includes(q))).sort((a, b) => b.at - a.at);
  return opsShell('bookings', 'Pesanan & penugasan', `${dashFilters()}<div class="filters">${selectEl('__f.bSt', st, [{ v: '', l: 'Semua status' }, { v: 'terlambat', l: 'Terlambat' }].concat(Object.entries(BL.BOOKING_STATUS).map(([v, s]) => ({ v, l: s.label }))), 'data-ui="bSt"')}${input('bq.q', (S.d.bq || {}).q || '', 'placeholder="Cari kode, layanan, nama" type="search" style="min-width:220px;width:auto"')}</div>
    <div class="table-wrap" data-live="btable"><table class="tbl"><thead><tr><th>Kode</th><th>Layanan</th><th>Pelanggan</th><th>Mitra</th><th>Jadwal</th><th>Status</th><th class="num">Nilai</th></tr></thead><tbody>
    ${list.slice(0, 200).map(b => `<tr class="click" data-act="go" data-v="a_booking" data-id="${b.id}"><td class="mono">${esc(b.code)}</td><td>${esc(b.serviceName)}<div class="xs muted">${esc(areaName(b.address.area))}</div></td><td>${esc((prof(b.customerPid) || {}).name || '-')}</td><td>${esc((prof(b.workerPid) || {}).name || '–')}</td><td class="small">${esc(fmtSched(b.schedule))}${isOverdue(b) ? ' ' + pill('terlambat', 'danger') : ''}</td><td>${statusPill(b.status)}</td><td class="num">${rp(b.pricing.total)}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">Tidak ada pesanan.</td></tr>`}</tbody></table></div>`);
};
VIEWS.a_booking = p => {
  const b = Store.get('bookings', p.id); if (!b) return opsShell('bookings', 'Pesanan', empty('alert', 'Tidak ditemukan'));
  const c = prof(b.customerPid), w = prof(b.workerPid);
  const elig = b.status === 'menunggu_mitra' ? eligibleWorkers(b) : [];
  const tickets = Store.list('tickets').filter(t => t.bookingId === b.id);
  const chat = Store.get('chats', b.id);
  const msgs = chat ? Object.values(chat.msgs || {}).sort((x, y) => x.at - y.at) : [];
  const role = staffRole();
  const canManage = ['admin', 'supervisor'].includes(role) || role === 'support';
  return opsShell('bookings', b.code, `<div class="row wrap">${statusPill(b.status)}${isOverdue(b) ? pill('Terlambat', 'danger') : ''}<span class="small muted">${esc(b.serviceName)} · dibuat ${fmtDate(b.at)}</span></div>
    <div class="grid2"><div class="card stack-sm"><div class="label">Pelanggan</div><b>${esc(c ? c.name : '-')}</b><p class="small muted">${esc(c ? c.phone : '')}</p><p class="small">${esc(b.address.detail)}, ${esc(areaName(b.address.area))}</p></div>
      <div class="card stack-sm"><div class="label">Mitra</div>${w ? `<b>${esc(w.name)}</b><p class="small muted">${esc(w.phone)} · ${esc(areaName(w.area))}</p>` : '<p class="small muted">Belum ditugaskan</p>'}</div></div>
    ${canManage ? `<div class="card stack-sm"><h3>Tindakan operasional</h3><div class="btnrow">
      ${b.status === 'menunggu_konfirmasi' && ['admin', 'supervisor'].includes(role) ? `<button class="btn btn-outline btn-sm" data-act="opsComplete" data-id="${b.id}">Tandai selesai (pelanggan tidak merespons)</button>` : ''}
      ${['ditugaskan'].includes(b.status) ? `<button class="btn btn-ghost btn-sm" data-act="opsRelease" data-id="${b.id}">Lepas dari mitra</button>` : ''}
      ${!['selesai', 'dibatalkan'].includes(b.status) && ['admin', 'supervisor'].includes(role) ? `<button class="btn btn-danger btn-sm" data-act="opsCancel" data-id="${b.id}">Batalkan pesanan</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-act="opsTicket" data-id="${b.id}">Buat tiket</button></div>
      ${b.status === 'menunggu_mitra' ? `<h4>Penugasan manual</h4><div class="table-wrap"><table class="tbl"><thead><tr><th>Mitra</th><th>Jarak</th><th>Kelayakan</th><th></th></tr></thead><tbody>${elig.map(({ w: x, e }) => `<tr><td>${esc(x.name)}${x.demo ? ' ' + pill('contoh', '') : ''}</td><td class="num">${e.km != null ? '±' + e.km + ' km' : '-'}</td><td class="small">${e.ok ? pill('Memenuhi syarat', 'primary') : esc(e.reasons.join(', '))}</td><td>${e.ok ? `<button class="btn btn-primary btn-sm" data-act="opsAssign" data-id="${b.id}" data-w="${x.id}">Tugaskan</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada mitra terdaftar.</td></tr>'}</tbody></table></div><p class="xs muted">Mitra yang tidak memenuhi syarat (misalnya belum bersertifikat untuk pekerjaan berisiko) tidak dapat ditugaskan.</p>` : ''}</div>` : ''}
    ${trackCard(b, 'ops')}
    ${Object.values(b.quotes || {}).length ? `<section class="stack-sm"><h3>Penawaran</h3>${Object.values(b.quotes).sort((a, x) => x.at - a.at).map(q => quoteCard(b, q, 'ops')).join('')}</section>` : ''}
    ${milestonesCard(b, 'ops')}${invoicesCard(b, 'ops')}
    <section class="stack-sm"><h3>Laporan kerja</h3>${reportTimeline(b)}</section>
    ${tickets.length ? `<section class="stack-sm"><h3>Tiket terkait</h3><div class="list">${tickets.map(t => `<button class="li" data-act="go" data-v="a_ticket" data-id="${t.id}">${icon('ticket', 18)}<span class="grow small"><span class="mono">${esc(t.code)}</span> · ${esc(TICKET_TYPES[t.type])}</span>${pill(TICKET_STATUS[t.status][0], TICKET_STATUS[t.status][1])}</button>`).join('')}</div></section>` : ''}
    <details class="card"><summary class="strong" style="cursor:pointer">Riwayat chat (${msgs.length}) · akses tercatat</summary><div class="chat" style="margin-top:10px">${msgs.map(m => `<div class="msg ${m.sys ? 'sys' : 'them'}"><b class="xs">${esc(m.sys ? 'Sistem' : (prof(m.fromPid) || {}).name || '')}</b><br>${esc(m.text)}<div class="meta">${fmtDate(m.at)}</div></div>`).join('') || '<p class="small muted">Belum ada pesan.</p>'}</div></details>
    ${detailCard(b)}${historyCard(b)}`);
};
A.opsAssign = d => ask({ title: 'Tugaskan mitra', fields: [{ k: 'r', label: 'Alasan penugasan manual', req: true }], ok: 'Tugaskan', onOk: async v => {
  const b = await Store.fresh('bookings', d.id); const w = prof(d.w); const cfg = CFG();
  if (!b || b.status !== 'menunggu_mitra') return toast('Pesanan sudah ditangani.', true);
  const e = BL.eligibility(w, b, { svc: svc(b.serviceId), cfg, deposit: balancesOf(w.id).deposit, activeJobs: activeJobsOf(w.id), region: cfg.region });
  if (!e.ok) return toast('Mitra tidak memenuhi syarat: ' + e.reasons.join(', '), true);
  const travel = BL.lockedTravelFee(b, e.km, cfg);
  const lines = (b.pricing.lines || []).map(l => l.type === 'travel' ? Object.assign({}, l, { name: `Biaya perjalanan (±${e.km} km)`, amount: travel, unitPrice: travel }) : l);
  const ok = await moveBooking(d.id, 'ditugaskan', 'ops', 'Penugasan manual: ' + v.r, { patch: { workerPid: w.id, workerUid: w.ownerUid, assignedAt: now(), pricing: { travelFee: travel, workerKm: e.km, lines, total: lines.reduce((a, l) => a + l.amount, 0) } } });
  if (!ok) return;
  await Store.set('chats', d.id, { bookingId: d.id, members: [b.customerPid, w.id], msgs: { m0: { fromPid: null, sys: true, text: `${w.name} ditugaskan oleh tim operasional.`, at: now() } }, read: {} });
  if (!Store.get('tracks', d.id)) await Store.set('tracks', d.id, { bookingId: d.id, workerPid: w.id, customerPid: b.customerPid, path: [], at: now() });
  else await Store.patch('tracks', d.id, { workerPid: w.id, worker: null, workerLink: null, path: [] });
  await notify(b.customerPid, 'assigned:' + d.id + ':' + w.id, { type: 'worker_assigned', title: 'Mitra ditugaskan', body: `${w.name} akan menangani pesanan ${b.code}.`, ref: { v: 'c_order', id: d.id } });
  await notify(w.id, 'opsassign:' + d.id, { type: 'job_assigned', title: 'Pekerjaan ditugaskan kepada Anda', body: `${b.serviceName} · ${b.code}`, ref: { v: 'w_job', id: d.id } });
  toast('Mitra ditugaskan');
} });
A.opsRelease = d => ask({ title: 'Lepas pesanan dari mitra', fields: [{ k: 'r', label: 'Alasan', req: true }], ok: 'Lepas', danger: true, onOk: v => moveBooking(d.id, 'menunggu_mitra', 'ops', v.r) });
A.opsCancel = d => ask({ title: 'Batalkan pesanan', body: 'Pembatalan oleh operasional tidak menagih biaya otomatis. Gunakan tiket untuk keputusan biaya.', fields: [{ k: 'r', label: 'Alasan', req: true }], ok: 'Batalkan', danger: true, onOk: v => cancelBooking(d.id, 'ops', v.r) });
A.opsComplete = d => ask({ title: 'Tandai selesai', body: 'Gunakan hanya bila pelanggan tidak merespons sesuai kebijakan. Tagihan akhir akan diterbitkan.', fields: [{ k: 'r', label: 'Alasan & bukti', req: true }], ok: 'Tandai selesai', onOk: v => confirmCompletion(d.id, 'ops', v.r) });
A.opsTicket = d => ask({ title: 'Buat tiket internal', fields: [{ k: 't', label: 'Jenis', type: 'select', options: Object.entries(TICKET_TYPES).map(([v, l]) => ({ v, l })), value: 'keterlambatan', req: true }, { k: 'x', label: 'Keterangan', req: true }], ok: 'Buat', onOk: async v => { const b = Store.get('bookings', d.id); const tid = rid('t'); await Store.set('tickets', tid, { code: 'TKT-' + Math.random().toString(36).slice(2, 7).toUpperCase(), type: v.t, bookingId: d.id, subject: TICKET_TYPES[v.t], openedByPid: b.customerPid, openedRole: 'ops', againstPid: b.workerPid, priority: 'sedang', status: 'diproses', assignedUid: ME.uid, at: now(), evidence: [], timeline: { e0: { at: now(), byUid: ME.uid, byOps: true, kind: 'internal', text: v.x } } }); await audit('ticket.open_ops', 'tickets/' + tid, v.x); toast('Tiket dibuat'); } });

/* ---------- Tiket ---------- */
VIEWS.a_tickets = () => {
  const st = S.ui.tSt || 'terbuka'; const ty = S.ui.tTy || '';
  const role = staffRole();
  let list = Store.list('tickets').filter(t => (st === 'terbuka' ? !['selesai', 'ditutup'].includes(t.status) : st === 'saya' ? t.assignedUid === ME.uid : st === 'eskalasi' ? t.status === 'eskalasi' : true) && (!ty || t.type === ty));
  const pr = { kritis: 0, tinggi: 1, sedang: 2, rendah: 3 };
  list = list.sort((a, b) => (pr[a.priority] - pr[b.priority]) || (b.at - a.at));
  return opsShell('tickets', 'Tiket, keluhan & garansi', `<div class="filters">${selectEl('__f.tSt', st, [{ v: 'terbuka', l: 'Terbuka' }, { v: 'saya', l: 'Ditugaskan ke saya' }, { v: 'eskalasi', l: 'Eskalasi' }, { v: 'semua', l: 'Semua' }], 'data-ui="tSt"')}${selectEl('__f.tTy', ty, [{ v: '', l: 'Semua jenis' }].concat(Object.entries(TICKET_TYPES).map(([v, l]) => ({ v, l }))), 'data-ui="tTy"')}</div>
    ${role === 'supervisor' ? note('', 'info', 'Sebagai supervisor, fokus pada tiket eskalasi dan keputusan yang butuh kewenangan lebih tinggi.') : ''}
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Kode</th><th>Jenis</th><th>Pesanan</th><th>Prioritas</th><th>Status</th><th>Petugas</th><th>Dibuka</th></tr></thead><tbody>
    ${list.map(t => { const b = t.bookingId ? Store.get('bookings', t.bookingId) : null; const s = TICKET_STATUS[t.status]; return `<tr class="click" data-act="go" data-v="a_ticket" data-id="${t.id}"><td class="mono">${esc(t.code)}</td><td>${esc(TICKET_TYPES[t.type])}</td><td class="mono small">${esc(b ? b.code : '-')}</td><td>${pill(t.priority, t.priority === 'kritis' ? 'danger' : t.priority === 'tinggi' ? 'warn' : '')}</td><td>${pill(s[0], s[1])}</td><td class="small">${t.assignedUid ? (t.assignedUid === ME.uid ? 'Saya' : 'Petugas lain') : '–'}</td><td class="small">${ago(t.at)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Tidak ada tiket.</td></tr>'}</tbody></table></div>`);
};
VIEWS.a_ticket = p => {
  const t = Store.get('tickets', p.id); if (!t) return opsShell('tickets', 'Tiket', empty('alert', 'Tidak ditemukan'));
  const b = t.bookingId ? Store.get('bookings', t.bookingId) : null;
  const tl = Object.values(t.timeline || {}).sort((a, x) => a.at - x.at);
  const s = TICKET_STATUS[t.status];
  const role = staffRole();
  const key = 'atk_' + t.id; const d = draft(key, { t: '', kind: 'publik' });
  const reps = b ? Store.list('reports').filter(r => r.bookingId === b.id) : [];
  const invs = b ? Store.list('invoices').filter(i => i.bookingId === b.id) : [];
  const w = b ? BL.warrantyInfo(svc(b.serviceId), (b.track || {}).confirmedAt || 0, t.at) : null;
  return opsShell('tickets', t.code, `<div class="row wrap">${pill(s[0], s[1])}${pill('Prioritas ' + t.priority, t.priority === 'kritis' ? 'danger' : t.priority === 'tinggi' ? 'warn' : '')}<span class="small muted">${esc(TICKET_TYPES[t.type])} · dibuka ${fmtDate(t.at)} oleh ${esc((prof(t.openedByPid) || {}).name || '-')}${t.againstPid ? ' · terkait ' + esc((prof(t.againstPid) || {}).name || '') : ''}</span></div>
    ${t.type === 'garansi' && w ? note(w.covered ? 'ok' : 'danger', 'shield', `Klaim diajukan ${w.covered ? 'dalam' : '<b>di luar</b>'} masa garansi (${esc(w.text)}).`) : ''}
    <div class="card stack-sm"><h3>Tindakan</h3><div class="btnrow">
      ${t.assignedUid !== ME.uid ? `<button class="btn btn-outline btn-sm" data-act="tkAssign" data-id="${t.id}">Tangani tiket ini</button>` : ''}
      ${selectEl('__f.tkst', t.status, Object.entries(TICKET_STATUS).map(([v, x]) => ({ v, l: 'Status: ' + x[0] })), `data-tkstatus="${t.id}" style="flex:1 1 160px"`)}
      ${selectEl('__f.tkpr', t.priority, ['rendah', 'sedang', 'tinggi', 'kritis'].map(v => ({ v, l: 'Prioritas: ' + v })), `data-tkprio="${t.id}" style="flex:1 1 160px"`)}</div>
      <div class="btnrow">${t.status !== 'eskalasi' ? `<button class="btn btn-ghost btn-sm" data-act="tkEscalate" data-id="${t.id}">Eskalasi ke supervisor</button>` : ''}${['admin', 'supervisor', 'finance'].includes(role) && !['selesai', 'ditutup'].includes(t.status) ? `<button class="btn btn-primary btn-sm" data-act="tkResolve" data-id="${t.id}">Selesaikan dengan keputusan</button>` : ''}${t.status === 'selesai' ? `<button class="btn btn-ghost btn-sm" data-act="tkClose" data-id="${t.id}">Tutup tiket</button>` : ''}</div>
      ${t.resolution ? note('ok', 'check', `<b>Keputusan:</b> ${esc(t.resolution.text)}${t.resolution.refund ? ` · pengembalian ${rp(t.resolution.refund)} dibebankan ke ${esc(t.resolution.chargeTo)}` : ''}`) : ''}</div>
    <div class="card stack-sm"><h3>Linimasa</h3><div class="chat">${tl.map(e => `<div class="msg ${e.byOps ? 'me' : 'them'}" ${e.kind === 'internal' ? 'style="background:var(--accent-soft);color:var(--fg);border:1px dashed var(--line-strong)"' : ''}><b class="xs">${e.byOps ? 'Tim' : esc((prof(e.byPid) || {}).name || 'Pengguna')}${e.kind === 'internal' ? ' · catatan internal' : ''}</b><br>${esc(e.text)}<div class="meta">${fmtDate(e.at)}</div></div>`).join('')}</div>
      <div class="filters">${selectEl(key + '.kind', d.kind, [{ v: 'publik', l: 'Balasan ke pengguna' }, { v: 'internal', l: 'Catatan internal' }], 'style="width:auto"')}</div>
      <div class="row">${input(key + '.t', d.t, 'placeholder="Tulis balasan atau catatan"')}<button class="btn btn-primary" data-act="tkMsg" data-id="${t.id}">${icon('send', 16)}</button></div></div>
    ${photoGrid(t.evidence)}
    ${b ? `<div class="card stack-sm"><h3>Bukti terkait pesanan</h3><button class="li" data-act="go" data-v="a_booking" data-id="${b.id}" style="padding:8px 0">${catIcon(b.cat, 'sm')}<span class="grow"><b class="small">${esc(b.serviceName)}</b><br><span class="mono xs">${esc(b.code)}</span></span>${statusPill(b.status)}</button>
      <p class="small">${reps.length} laporan · ${Object.keys(b.quotes || {}).length} penawaran · ${invs.length} tagihan · ${Object.keys((Store.get('chats', b.id) || {}).msgs || {}).length} pesan chat</p>
      ${invs.map(i => `<p class="small"><span class="mono">${esc(i.code)}</span> · ${rp(i.totals.total)} · ${esc(i.status)}${i.refunded ? ' · dikembalikan ' + rp(i.refunded) : ''}</p>`).join('')}</div>` : ''}`);
};
document.addEventListener('change', async e => {
  const st = e.target.closest('[data-tkstatus]'); const pr = e.target.closest('[data-tkprio]');
  if (st) { const v = st.value; const id = st.dataset.tkstatus; ask({ title: 'Ubah status tiket', fields: [{ k: 'r', label: 'Alasan', req: true }], ok: 'Simpan', onOk: x => ticketUpdate(id, { status: v }, { kind: 'internal', text: `Status diubah ke ${TICKET_STATUS[v][0]}: ${x.r}` }, x.r) }); }
  if (pr) { await ticketUpdate(pr.dataset.tkprio, { priority: pr.value }, { kind: 'internal', text: 'Prioritas diubah ke ' + pr.value }, 'ubah prioritas'); }
});
A.tkAssign = d => ticketUpdate(d.id, { assignedUid: ME.uid, status: Store.get('tickets', d.id).status === 'baru' ? 'diproses' : Store.get('tickets', d.id).status }, { kind: 'internal', text: 'Tiket diambil oleh petugas.' }, 'ambil tiket');
A.tkEscalate = d => ask({ title: 'Eskalasi ke supervisor', fields: [{ k: 'r', label: 'Alasan eskalasi', req: true }], ok: 'Eskalasi', onOk: async v => { await ticketUpdate(d.id, { status: 'eskalasi' }, { kind: 'internal', text: 'Eskalasi: ' + v.r }, v.r); await notify('ops', 'esc:' + d.id, { type: 'ticket_escalated', cat: 'sistem', title: 'Tiket dieskalasi', body: Store.get('tickets', d.id).code + ': ' + v.r, ref: { v: 'a_ticket', id: d.id } }); } });
A.tkMsg = async d => { const k = 'atk_' + d.id; const v = S.d[k]; if (!String(v.t || '').trim()) return; const text = v.t; v.t = ''; await ticketUpdate(d.id, {}, { kind: v.kind, text }, ''); };
A.tkClose = d => ask({ title: 'Tutup tiket', fields: [{ k: 'r', label: 'Alasan penutupan', req: true }], ok: 'Tutup', onOk: v => ticketUpdate(d.id, { status: 'ditutup', closeReason: v.r, closedAt: now() }, { kind: 'internal', text: 'Ditutup: ' + v.r }, v.r) });
A.tkResolve = d => {
  const t = Store.get('tickets', d.id);
  const inv = Store.list('invoices').find(i => i.bookingId === t.bookingId && i.paidAt);
  const role = staffRole();
  const fields = [{ k: 'text', label: 'Keputusan untuk pengguna', req: true, ph: 'Contoh: mitra akan datang ulang tanpa biaya pada 20 Okt' }];
  if (inv && ['admin', 'finance', 'supervisor'].includes(role)) fields.push({ k: 'refund', label: `Pengembalian dana (maks ${rp(inv.totals.total - (inv.refunded || 0))}, isi 0 bila tidak ada)`, type: 'number', value: '0' }, { k: 'chargeTo', label: 'Dibebankan kepada', type: 'select', options: [{ v: 'platform', l: 'Platform' }, { v: 'mitra', l: 'Mitra (sesuai bukti)' }], value: 'platform' });
  ask({ title: 'Selesaikan tiket', body: 'Keputusan mengikuti kebijakan dan bukti. Tidak ada pembebanan otomatis.', fields, ok: 'Simpan keputusan', onOk: async v => {
    const amt = Math.round(Number(v.refund || 0));
    if (amt > 0) { await refundForTicket(d.id, amt, v.chargeTo, v.text); if (!Store.get('ledger', 'rf_' + d.id)) return; }
    await ticketUpdate(d.id, { status: 'selesai', resolution: { text: v.text, refund: amt, chargeTo: amt ? v.chargeTo : null, at: now(), byUid: ME.uid } }, { kind: 'publik', text: 'Keputusan: ' + v.text }, v.text);
  } });
};

/* ---------- Mitra & verifikasi ---------- */
VIEWS.a_workers = () => {
  const st = S.ui.wSt || 'menunggu';
  const list = Store.list('profiles').filter(p => p.role === 'worker' && (st === 'semua' || p.verif === st)).sort((a, b) => b.at - a.at);
  return opsShell('workers', 'Mitra & verifikasi', `<div class="seg">${[['menunggu', 'Menunggu'], ['terverifikasi', 'Terverifikasi'], ['ditolak', 'Ditolak'], ['ditangguhkan', 'Ditangguhkan'], ['semua', 'Semua']].map(([k, l]) => `<button data-act="ui" data-k="wSt" data-val="${k}" aria-pressed="${st === k}">${l}</button>`).join('')}</div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Wilayah</th><th>Keahlian</th><th>Status</th><th class="num">Deposit</th><th class="num">Rating</th><th>Daftar</th></tr></thead><tbody>
    ${list.map(w => { const v = VERIF[w.verif] || [w.verif, '']; const r = ratingOf(w.id, 'c2w'); return `<tr class="click" data-act="go" data-v="a_worker" data-id="${w.id}"><td>${esc(w.name)}${w.demo ? ' ' + pill('contoh', '') : ''}${w.online ? ' ' + pill('online', 'primary') : ''}</td><td>${esc(areaName(w.area))}</td><td class="small">${(w.skills || []).map(c => esc(BL.catById(c).name)).join(', ')}</td><td>${pill(v[0], v[1])}</td><td class="num">${rp(balancesOf(w.id).deposit)}</td><td class="num">${r.count ? r.avg.toFixed(1) : '–'}</td><td class="small">${fmtDate(w.at, false)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Tidak ada mitra.</td></tr>'}</tbody></table></div>`);
};
const PRIV_CACHE = {};
VIEWS.a_worker = p => {
  const w = prof(p.id); if (!w) return opsShell('workers', 'Mitra', empty('alert', 'Tidak ditemukan'));
  const pk = w.ownerUid + '|' + w.id;
  if (!(pk in PRIV_CACHE) && ME.isOwner) { PRIV_CACHE[pk] = null; Store.privGet(w.ownerUid, 'verif_' + w.id).then(v => { PRIV_CACHE[pk] = v || false; scheduleRender(); }); }
  const docs = PRIV_CACHE[pk];
  const bal = balancesOf(w.id); const r = ratingOf(w.id, 'c2w');
  const jobs = Store.list('bookings').filter(b => b.workerPid === w.id);
  const v = VERIF[w.verif] || [w.verif, ''];
  const key = 'vf_' + w.id; const d = draft(key, () => ({ certs: Object.assign({}, w.certs || {}) }));
  return opsShell('workers', w.name, `<div class="row wrap">${pill(v[0], v[1])}${w.demo ? pill('Data contoh', '') : ''}<span class="small muted">${esc(w.phone)} · ${esc(areaName(w.area))} · daftar ${fmtDate(w.at)}</span></div>
    <div class="grid2"><div class="card stack-sm"><h3>Profil</h3><div class="chips">${(w.skills || []).map(c => `<span class="chip">${esc(BL.catById(c).name)}</span>`).join('')}</div><p class="small"><b>Pengalaman:</b> ${esc(w.experience || '-')}</p><p class="small"><b>Peralatan:</b> ${esc(w.tools || '-')}</p><p class="small muted">${esc(w.bio || '')}</p></div>
      <div class="card stack-sm"><h3>Kinerja & saldo</h3><div class="kv small"><span>Deposit</span><span class="v">${rp(bal.deposit)}</span><span>Pendapatan tersedia</span><span class="v">${rp(bal.earnings)}</span><span>Pesanan</span><span class="v">${jobs.length} (${jobs.filter(b => b.status === 'selesai').length} selesai)</span><span>Rating</span><span class="v">${r.count ? r.avg.toFixed(1) + ' dari ' + r.count : '–'}</span></div></div></div>
    <div class="card stack-sm"><h3>Dokumen verifikasi</h3>${!ME.isOwner ? note('', 'lock', 'Dokumen privat hanya dapat dibuka oleh pemilik aplikasi.') : docs === null ? '<p class="small muted">Memuat dokumen…</p>' : docs ? `<p class="small"><b>KTP</b></p>${photoGrid(docs.docs.ktp) || '<p class="small muted">Tidak diunggah</p>'}<p class="small"><b>Sertifikat</b></p>${photoGrid(docs.docs.sertifikat) || '<p class="small muted">Tidak diunggah</p>'}<p class="xs muted">Diunggah ${fmtDate(docs.at)}</p>` : '<p class="small muted">Tidak ada dokumen yang diunggah.</p>'}</div>
    <div class="card stack-sm"><h3>Sertifikasi untuk pekerjaan berisiko</h3>${Object.entries(BL.CERTS).map(([ck, cl]) => `<label class="check"><input type="checkbox" data-f="${key}.certs.${ck}" ${d.certs[ck] ? 'checked' : ''}><span>${esc(cl)} ${(w.certsClaimed || {})[ck] ? pill('diklaim mitra', 'info') : ''}</span></label>`).join('')}
      <p class="xs muted">Centang hanya bila bukti sah sudah diperiksa. Tanpa centang, mitra tidak akan dicocokkan ke layanan berisiko terkait.</p>
      <div class="btnrow"><button class="btn btn-primary btn-sm" data-act="vfDo" data-id="${w.id}" data-dec="terverifikasi">${w.verif === 'terverifikasi' ? 'Simpan sertifikasi' : 'Verifikasi mitra'}</button><button class="btn btn-ghost btn-sm" data-act="vfDo" data-id="${w.id}" data-dec="ditolak">Tolak</button><button class="btn btn-danger btn-sm" data-act="vfDo" data-id="${w.id}" data-dec="ditangguhkan">Tangguhkan</button></div></div>
    ${jobs.length ? `<div class="card stack-sm"><h3>Pesanan</h3><div class="list">${jobs.sort((a, b) => b.at - a.at).slice(0, 15).map(b => orderRow(b, 'a_booking')).join('')}</div></div>` : ''}`);
};
A.vfDo = d => { const v = S.d['vf_' + d.id]; ask({ title: { terverifikasi: 'Verifikasi mitra', ditolak: 'Tolak verifikasi', ditangguhkan: 'Tangguhkan mitra' }[d.dec], fields: [{ k: 'r', label: d.dec === 'terverifikasi' ? 'Catatan (opsional)' : 'Alasan', req: d.dec !== 'terverifikasi' }], ok: 'Simpan', danger: d.dec !== 'terverifikasi', onOk: x => verifyWorker(d.id, d.dec, v.certs, x.r) }); };

/* ---------- Pengguna & staf ---------- */
VIEWS.a_users = () => {
  const custs = Store.list('profiles').filter(p => p.role === 'customer').sort((a, b) => b.at - a.at);
  const staff = Store.list('profiles').filter(p => p.role === 'staff');
  return opsShell('users', 'Pengguna & staf', `<div class="card stack-sm"><h3>Staf operasional</h3>${note('', 'info', 'Pemilik aplikasi selalu berperan Admin. Beri peran staf kepada pengguna yang sudah membuat profil di perangkatnya.')}
    ${staff.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Peran</th><th>Status</th><th>Diberikan</th></tr></thead><tbody>${staff.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.staffRole)}</td><td>${s.active === false ? pill('dicabut', 'muted') : pill('aktif', 'primary')}</td><td class="small">${fmtDate(s.at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Belum ada staf selain pemilik.</p>'}</div>
    <div class="card stack-sm"><h3>Pelanggan (${custs.length})</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>HP</th><th>Wilayah</th><th class="num">Pesanan</th><th>Daftar</th><th></th></tr></thead><tbody>
    ${custs.map(c => `<tr><td>${esc(c.name)}${c.ownerUid === ME.uid ? ' ' + pill('saya', 'info') : ''}</td><td class="small">${esc(c.phone)}</td><td>${esc(areaName(c.area))}</td><td class="num">${Store.list('bookings').filter(b => b.customerPid === c.id).length}</td><td class="small">${fmtDate(c.at, false)}</td><td>${ME.isOwner && c.ownerUid !== ME.uid ? `<button class="btn btn-ghost btn-sm" data-act="grantStaff" data-id="${c.id}">Peran staf</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada pelanggan.</td></tr>'}</tbody></table></div></div>`);
};
A.grantStaff = d => ask({ title: 'Atur peran staf', fields: [{ k: 'r', label: 'Peran', type: 'select', options: [{ v: 'support', l: 'Call center / dukungan' }, { v: 'supervisor', l: 'Supervisor' }, { v: 'finance', l: 'Keuangan' }, { v: 'admin', l: 'Admin' }, { v: 'cabut', l: 'Cabut peran staf' }], value: 'support', req: true }, { k: 'x', label: 'Alasan', req: true }], ok: 'Simpan', onOk: v => grantStaff(d.id, v.r, v.x) });

/* ---------- Ulasan ---------- */
VIEWS.a_feedback = () => {
  const st = S.ui.fSt || 'perlu';
  const list = Store.list('feedback').filter(f => st === 'perlu' ? ['dilaporkan', 'ditinjau'].includes(f.status) : true).sort((a, b) => b.at - a.at);
  return opsShell('feedback', 'Ulasan & moderasi', `<div class="seg">${[['perlu', 'Perlu ditinjau'], ['semua', 'Semua']].map(([k, l]) => `<button data-act="ui" data-k="fSt" data-val="${k}" aria-pressed="${st === k}">${l}</button>`).join('')}</div>
    ${note('', 'info', 'Ulasan tidak dihapus hanya karena nilainya rendah. Sembunyikan hanya bila berisi kata kasar, ancaman, data pribadi, atau terbukti palsu.')}
    ${list.length ? list.map(f => { const b = Store.get('bookings', f.bookingId); return `<div class="card stack-sm"><div class="row between"><span class="small"><b>${esc((prof(f.fromPid) || {}).name || '')}</b> → ${esc((prof(f.toPid) || {}).name || '')} · ${f.dir === 'c2w' ? 'pelanggan ke mitra' : 'mitra ke pelanggan'}</span><span class="stars">${starIcon(true, 14)} ${f.overall}.0</span></div>
      <p class="small">${esc(f.comment || '(tanpa komentar)')}</p><p class="xs muted"><span class="mono">${esc(b ? b.code : '')}</span> · ${ago(f.at)} · status ${esc(f.status)}${(f.autoFlags || []).length ? ' · terdeteksi: ' + esc(f.autoFlags.join(', ')) : ''}</p>
      ${Object.values(f.reports || {}).map(r => `<p class="xs">Dilaporkan: ${esc(r.reason)}</p>`).join('')}${f.moderation ? `<p class="xs muted">Moderasi: ${esc(f.moderation.decision)} · ${esc(f.moderation.reason)}</p>` : ''}
      ${['dilaporkan', 'ditinjau'].includes(f.status) ? `<div class="btnrow"><button class="btn btn-primary btn-sm" data-act="modFb" data-id="${f.id}" data-dec="tampilkan">Tampilkan</button><button class="btn btn-danger btn-sm" data-act="modFb" data-id="${f.id}" data-dec="sembunyikan">Sembunyikan</button></div>` : ''}</div>`; }).join('') : empty('star', 'Tidak ada ulasan untuk ditinjau')}`);
};
A.modFb = d => ask({ title: d.dec === 'tampilkan' ? 'Tampilkan ulasan' : 'Sembunyikan ulasan', fields: [{ k: 'r', label: 'Alasan moderasi', req: true }], ok: 'Simpan', danger: d.dec !== 'tampilkan', onOk: v => moderateFeedback(d.id, d.dec, v.r) });

/* ---------- Keuangan ---------- */
VIEWS.a_finance = () => {
  const L = ledgerList();
  const s = f => L.filter(f).reduce((a, e) => a + e.amount, 0);
  const invs = Store.list('invoices').sort((a, b) => b.at - a.at);
  const reqs = L.filter(e => e.kind === 'payout_request').sort((a, b) => b.at - a.at);
  const paidInv = invs.filter(i => i.paidAt);
  // rekonsiliasi: setiap tagihan lunas wajib punya pay/comm/earn dan pay = comm + earn
  const recon = paidInv.map(i => { const p = Store.get('ledger', 'pay_' + i.id), c = Store.get('ledger', 'comm_' + i.id), e = Store.get('ledger', 'earn_' + i.id); const ok = p && c && e && p.amount === c.amount + e.amount && p.amount === i.totals.total; return { i, ok }; });
  const bad = recon.filter(r => !r.ok);
  const t = S.ui.finTab || 'ringkasan';
  let body = '';
  if (t === 'ringkasan') body = `<div class="kpis">
      <div class="stat"><div class="k">Pembayaran diterima</div><div class="v">${rp(s(e => e.account === 'payment_received'))}</div><div class="s">${paidInv.length} tagihan lunas</div></div>
      <div class="stat"><div class="k">Komisi platform</div><div class="v">${rp(s(e => e.account === 'platform_commission'))}</div></div>
      <div class="stat"><div class="k">Kewajiban ke mitra</div><div class="v">${rp(s(e => e.account === 'worker_earnings'))}</div><div class="s">saldo pendapatan belum dicairkan</div></div>
      <div class="stat"><div class="k">Deposit mitra (dititipkan)</div><div class="v">${rp(s(e => e.account === 'worker_deposit'))}</div><div class="s">bukan pendapatan platform</div></div>
      <div class="stat"><div class="k">Piutang (belum dibayar)</div><div class="v">${rp(invs.filter(i => !i.paidAt).reduce((a, i) => a + i.totals.total, 0))}</div></div>
      <div class="stat"><div class="k">Refund</div><div class="v">${rp(-s(e => e.account === 'refund'))}</div></div></div>
    <div class="card stack-sm"><div class="row between"><h3>Rekonsiliasi</h3>${bad.length ? pill(bad.length + ' selisih', 'danger') : pill('Seimbang', 'primary')}</div><p class="small muted">Setiap tagihan lunas diperiksa: pembayaran = komisi + bagian mitra = total tagihan.</p>${bad.map(r => `<p class="small"><span class="mono">${esc(r.i.code)}</span> tidak seimbang atau entri hilang</p>`).join('')}</div>
    ${note('warn', 'alert', 'Semua angka berasal dari <b>mode simulasi</b>. Sebelum menahan, menyimpan, atau mencairkan dana nyata, tinjau ketentuan Bank Indonesia/OJK dan gunakan gateway berizin.')}`;
  if (t === 'tagihan') body = `<div class="table-wrap"><table class="tbl"><thead><tr><th>Kode</th><th>Jenis</th><th>Pelanggan</th><th>Status</th><th class="num">Total</th><th class="num">Komisi</th><th>Terbit</th></tr></thead><tbody>${invs.map(i => `<tr class="click" data-act="go" data-v="a_invoice" data-id="${i.id}"><td class="mono">${esc(i.code)}</td><td>${esc(i.kind)}</td><td>${esc((prof(i.customerPid) || {}).name || '')}</td><td>${invPill(i)}</td><td class="num">${rp(i.totals.total)}</td><td class="num">${rp(i.totals.commission)}</td><td class="small">${fmtDate(i.at)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Belum ada tagihan.</td></tr>'}</tbody></table></div>`;
  if (t === 'pencairan') body = `<div class="table-wrap"><table class="tbl"><thead><tr><th>Mitra</th><th class="num">Nominal</th><th>Diminta</th><th>Status</th><th></th></tr></thead><tbody>${reqs.map(e => { const paid = Store.get('ledger', e.id + '_paid'), rev = Store.get('ledger', e.id + '_rev'); return `<tr><td>${esc((prof(e.workerPid) || {}).name || '')}</td><td class="num">${rp(-e.amount)}</td><td class="small">${fmtDate(e.at)}</td><td>${paid ? pill('Dibayar (simulasi)', 'done') : rev ? pill('Ditolak', 'muted') : pill('Menunggu', 'warn')}</td><td>${!paid && !rev ? `<div class="row"><button class="btn btn-primary btn-sm" data-act="poDo" data-id="${e.id}" data-dec="bayar">Tandai dibayar</button><button class="btn btn-ghost btn-sm" data-act="poDo" data-id="${e.id}" data-dec="tolak">Tolak</button></div>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Belum ada permintaan.</td></tr>'}</tbody></table></div>`;
  if (t === 'buku') body = `<p class="small muted">Buku besar hanya bisa ditambah, tidak diubah. Koreksi dilakukan dengan entri penyesuaian.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Akun</th><th>Jenis</th><th>Mitra</th><th>Referensi</th><th class="num">Jumlah</th></tr></thead><tbody>${L.sort((a, b) => b.at - a.at).slice(0, 300).map(e => `<tr><td class="small">${fmtDate(e.at)}</td><td class="small">${esc(e.account)}</td><td class="small">${esc(LEDGER_LABEL[e.kind] || e.kind)}${e.simulated ? ' · sim' : ''}</td><td class="small">${esc((prof(e.workerPid) || {}).name || '–')}</td><td class="mono xs">${esc(e.id)}</td><td class="num">${e.amount >= 0 ? '' : '−'}${rp(Math.abs(e.amount))}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Kosong.</td></tr>'}</tbody></table></div>`;
  return opsShell('finance', 'Keuangan', `<div class="row wrap between"><div class="seg">${[['ringkasan', 'Ringkasan'], ['tagihan', 'Tagihan'], ['pencairan', 'Pencairan'], ['buku', 'Buku besar']].map(([k, l]) => `<button data-act="ui" data-k="finTab" data-val="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>${R.downloads || R.mode !== 'remote' ? `<button class="btn btn-outline btn-sm" data-act="exportLedger">${icon('download', 16)} Ekspor CSV</button>` : ''}</div>${body}`);
};
A.poDo = d => ask({ title: d.dec === 'bayar' ? 'Tandai pencairan dibayar' : 'Tolak pencairan', body: d.dec === 'bayar' ? 'Mode simulasi: tidak ada transfer bank nyata.' : '', fields: d.dec === 'tolak' ? [{ k: 'r', label: 'Alasan', req: true }] : [], ok: 'Simpan', onOk: v => payoutDecision(d.id, d.dec, v.r) });
A.exportLedger = async () => {
  const rows = [['id', 'waktu', 'akun', 'jenis', 'mitra', 'tagihan', 'pesanan', 'jumlah', 'simulasi', 'catatan']].concat(ledgerList().sort((a, b) => a.at - b.at).map(e => [e.id, new Date(e.at).toISOString(), e.account, e.kind, (prof(e.workerPid) || {}).name || '', e.invoiceId || '', (Store.get('bookings', e.bookingId) || {}).code || '', e.amount, e.simulated ? 'ya' : 'tidak', e.note || '']));
  const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  if (!R.downloads) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `beresin-buku-besar-${todayISO(0)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); await audit('finance.export', 'ledger', '', { rows: rows.length - 1 }); return; }
  try { await R.downloads.save({ filename: `beresin-buku-besar-${todayISO(0)}.csv`, data: csv }); await audit('finance.export', 'ledger', '', { rows: rows.length - 1 }); toast('File CSV disimpan'); }
  catch (e) { if (e && e.code !== 'declined') toast('Ekspor tidak tersedia di tampilan ini.', true); }
};
VIEWS.a_invoice = p => opsShell('finance', 'Tagihan', invoiceView(p.id, 'ops'));
function opsInvoiceTools(inv) {
  const evs = Object.entries(inv.events || {}).sort((a, b) => a[1].at - b[1].at);
  const firstOk = evs.find(([, e]) => e.result === 'berhasil');
  return `<div class="card stack-sm"><h3>Event gateway</h3>${evs.length ? `<div class="kv small">${evs.map(([id, e]) => `<span class="mono xs">${esc(id)}</span><span class="v">${esc(e.result)} · ${fmtDate(e.at)}</span>`).join('')}</div>` : '<p class="small muted">Belum ada event.</p>'}
    ${firstOk ? `<div class="sim-box stack-sm"><span class="label">Uji idempotensi</span><p class="small">Kirim ulang event <span class="mono">${esc(firstOk[0])}</span>. Sistem harus mengabaikannya tanpa menggandakan entri buku besar.</p><button class="btn btn-outline btn-sm" data-act="dupWebhook" data-inv="${inv.id}" data-a="${esc(firstOk[1].attempt)}" data-e="${esc(firstOk[0])}">Kirim ulang event yang sama</button></div>` : ''}
    <p class="small">Entri buku besar: ${['pay_', 'comm_', 'earn_'].map(pfx => Store.get('ledger', pfx + inv.id) ? `<span class="mono xs">${pfx}${esc(inv.id)}</span>` : '').filter(Boolean).join(', ') || '–'}</p></div>`;
}
A.dupWebhook = async d => { const r = await gatewayEvent(d.inv, d.a, 'berhasil', d.e); toast(r === 'duplikat' ? 'Event duplikat terdeteksi dan diabaikan' : 'Hasil: ' + r, r !== 'duplikat'); };

/* ---------- Katalog & harga ---------- */
VIEWS.a_catalog = () => {
  const cat = S.ui.cat || '';
  const list = BL.SERVICES.filter(s => !cat || s.cat === cat).map(s => svc(s.id));
  return opsShell('catalog', 'Katalog & harga', `${!ME.isOwner ? note('', 'lock', 'Hanya pemilik aplikasi yang dapat mengubah harga, foto, dan status layanan.') : note('', 'info', 'Perubahan harga berlaku untuk pesanan baru. Pesanan berjalan tetap memakai harga saat dipesan.')}
    <section class="card stack-sm"><div class="row between"><h3>Foto kategori</h3><span class="small muted">${BL.CATEGORIES.filter(c => catPhoto(c.id)).length}/${BL.CATEGORIES.length} terisi</span></div>
      <p class="small muted">Satu foto per kategori otomatis dipakai semua layanannya (beranda, daftar, detail). Gunakan foto lanskap minimal 1600 px. Foto layanan spesifik di tabel bawah akan menggantikannya.</p>
      <div class="grid2" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${BL.CATEGORIES.map(c => { const ph = catPhoto(c.id); return `<div class="svc-card t-${c.tint}" style="cursor:default"><div class="art">${ph ? `<img src="${esc(ph)}" alt="">` : icon(c.icon, 34)}</div><div class="body"><b class="small">${esc(c.name)}</b><div class="row wrap" style="gap:8px">${ME.isOwner && canUpload() ? `<button class="linkbtn xs" data-act="catPhotoEdit" data-id="${c.id}">${ph ? 'Ganti' : 'Unggah'}</button>` : ''}<a class="linkbtn xs" href="https://unsplash.com/s/photos/${encodeURIComponent(PHOTO_TERMS[c.id]).replace(/%20/g, '-')}" target="_blank" rel="noopener">Cari foto</a></div></div></div>`; }).join('')}</div>
      <p class="xs muted">Tautan “Cari foto” membuka Unsplash; foto di sana berlisensi gratis untuk penggunaan komersial (tetap periksa ketentuannya). Foto asli mitra & pekerjaan BERESIN paling meyakinkan pelanggan.</p></section>
    <div class="filters">${selectEl('__f.cat', cat, [{ v: '', l: 'Semua kategori' }].concat(BL.CATEGORIES.map(c => ({ v: c.id, l: c.name }))), 'data-ui="cat"')}</div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Foto</th><th>Layanan</th><th>Kategori</th><th>Model</th><th class="num">Tarif</th><th>Risiko</th><th>Garansi</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(s => `<tr><td>${svcPhoto(s) ? `<img class="thumb" src="${esc(svcPhoto(s))}" alt="">` : `<span class="ico xs sq t-${BL.catById(s.cat).tint}">${icon(BL.catById(s.cat).icon, 15)}</span>`}${ME.isOwner && canUpload() ? `<div><button class="linkbtn xs" data-act="svcPhotoEdit" data-id="${s.id}">${svcPhoto(s) ? 'Ganti' : 'Unggah'}</button></div>` : ''}</td><td>${esc(s.name)}</td><td class="small">${esc(BL.catById(s.cat).name)}</td><td class="small">${esc(BL.MODEL_LABEL[s.model])}</td><td class="num">${s.model === 'base_km' ? rp(s.base) + ' + ' : ''}${rp(s.price)}${s.unit ? '<span class="xs muted"> /' + esc(s.model === 'base_km' ? 'km' : s.unit) + '</span>' : ''}</td><td>${pill(s.risk === 'high' ? 'Tinggi' : s.risk === 'medium' ? 'Sedang' : 'Rendah', s.risk === 'high' ? 'danger' : s.risk === 'medium' ? 'warn' : '')}${s.cert ? '<div class="xs muted">' + esc(BL.CERTS[s.cert]) + '</div>' : ''}</td><td class="small">${s.w ? (s.w === 1 ? '24 jam' : s.w + ' hari') : 'sesuai kontrak'}</td><td>${s.inactive ? pill('Nonaktif', 'muted') : pill('Aktif', 'primary')}</td><td>${ME.isOwner ? `<button class="btn btn-ghost btn-sm" data-act="editSvc" data-id="${s.id}">Ubah</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`);
};
A.editSvc = d => { const s = svc(d.id); ask({ title: 'Ubah ' + s.name, fields: [{ k: 'price', label: s.model === 'base_km' ? 'Tarif per km (Rp)' : 'Tarif (Rp)', type: 'number', value: String(s.price), req: true }, { k: 'active', label: 'Status', type: 'select', options: [{ v: '1', l: 'Aktif' }, { v: '0', l: 'Nonaktif' }], value: s.inactive ? '0' : '1' }, { k: 'r', label: 'Alasan perubahan', req: true }], ok: 'Simpan', onOk: v => { const pr = Math.round(Number(v.price)); if (!(pr > 0)) return toast('Tarif harus lebih dari 0.', true); return saveConfig({ services: { [d.id]: { price: pr, active: v.active === '1' } } }, v.r); } }); };

const PHOTO_TERMS = { kebersihan: 'house cleaning service', ac: 'air conditioner repair technician', listrik: 'electrician plumber at work', pertukangan: 'carpenter home renovation', taman: 'gardener mowing lawn', kendaraan: 'roadside assistance tow truck', pindahan: 'movers carrying boxes', teknologi: 'computer repair technician', hewan: 'dog grooming', harian: 'housekeeper ironing', profesional: 'event photographer', komersial: 'office cleaning team' };
A.catPhotoEdit = d => { const c = BL.catById(d.id); ask({ title: 'Foto kategori · ' + c.long, body: 'Dipakai untuk semua layanan di kategori ini yang belum punya foto sendiri.', fields: [{ k: 'p', label: 'Foto', type: 'photo', value: [] }, { k: 'r', label: 'Alasan', type: 'text', value: 'Foto kategori', req: true }], ok: 'Simpan foto', onOk: v => { const ph = (v.p || [])[0]; if (!ph) return toast('Pilih foto terlebih dahulu.', true); return saveConfig({ cats: { [d.id]: { photo: ph } } }, v.r); } }); };
A.svcPhotoEdit = d => { const s = svc(d.id); ask({ title: 'Foto layanan · ' + s.name, body: 'Gunakan foto mendatar (lanskap) beresolusi tinggi. Foto tampil di beranda, daftar layanan, dan halaman detail.', fields: [{ k: 'p', label: 'Foto', type: 'photo', value: [] }, { k: 'r', label: 'Alasan', type: 'text', value: 'Foto layanan', req: true }], ok: 'Simpan foto', onOk: v => { const ph = (v.p || [])[0]; if (!ph) return toast('Pilih foto terlebih dahulu.', true); return saveConfig({ services: { [d.id]: { photo: ph } } }, v.r); } }); };

/* ---------- Promo & banner ---------- */
VIEWS.a_promo = () => {
  const all = Object.entries(CFG().banners || {}).sort((a, b) => b[1].at - a[1].at);
  const sent = id => Store.list('notifications').filter(n => n.key === 'promo:' + id).length;
  return opsShell('promo', 'Promo & banner', `${note('', 'info', 'Promo aktif tampil sebagai banner geser di beranda pelanggan. Bila dikirim, pelanggan menerima notifikasi di tab <b>Promosi</b>.')}
    ${ME.isOwner ? `<button class="addrow" data-act="promoEdit">${icon('plus', 16)} Buat promo</button>` : note('', 'lock', 'Hanya pemilik aplikasi yang dapat membuat promo.')}
    ${all.length ? `<div class="stack-sm">${all.map(([id, b]) => `<div class="card row top">${b.image ? `<img src="${esc(photoSrc(b.image))}" alt="" style="width:88px;height:64px;border-radius:12px;object-fit:cover;flex:none">` : `<span class="ico sq t-pink" style="width:88px;height:64px">${icon('megaphone', 26)}</span>`}<div class="grow stack-sm" style="gap:4px"><div class="row between"><b>${esc(b.title)}</b>${b.active === false ? pill('Nonaktif', 'muted') : b.until && b.until < todayISO(0) ? pill('Berakhir', 'muted') : pill('Aktif', 'primary')}</div><p class="small muted">${esc(b.body || '')}</p><p class="xs muted">${b.svc ? 'Layanan: ' + esc((svc(b.svc) || {}).name || b.svc) + ' · ' : ''}${b.until ? 'Hingga ' + esc(b.until) + ' · ' : ''}terkirim ke ${sent(id)} pelanggan</p>
      ${ME.isOwner ? `<div class="row wrap"><button class="btn btn-ghost btn-sm" data-act="promoEdit" data-id="${id}">Ubah</button><button class="btn btn-ghost btn-sm" data-act="promoToggle" data-id="${id}">${b.active === false ? 'Aktifkan' : 'Nonaktifkan'}</button><button class="btn btn-outline btn-sm" data-act="promoSend" data-id="${id}">${icon('send', 14)} Kirim notifikasi</button></div>` : ''}</div></div>`).join('')}</div>` : empty('megaphone', 'Belum ada promo', 'Banner bawaan “Urusan beres, hidup lebih mudah.” tetap tampil di beranda.')}`);
};
A.promoEdit = d => {
  const b = d.id ? CFG().banners[d.id] : { title: '', body: '', svc: '', until: '' };
  ask({ title: d.id ? 'Ubah promo' : 'Promo baru', fields: [{ k: 'title', label: 'Judul', type: 'text', value: b.title, req: true, ph: 'Diskon cuci AC 20%' }, { k: 'body', label: 'Keterangan', value: b.body, ph: 'Berlaku untuk wilayah Kota Kupang' }, { k: 'svc', label: 'Arahkan ke layanan', type: 'select', options: [{ v: '', l: 'Tidak ada (info saja)' }].concat(BL.SERVICES.map(s => ({ v: s.id, l: s.name }))), value: b.svc || '' }, { k: 'until', label: 'Berlaku hingga', type: 'date', value: b.until || '' }, { k: 'image', label: 'Gambar banner (opsional)', type: 'photo', value: b.image ? [b.image] : [] }, { k: 'send', label: 'Kirim notifikasi ke pelanggan sekarang?', type: 'select', options: [{ v: '0', l: 'Tidak, tampilkan di banner saja' }, { v: '1', l: 'Ya, kirim ke tab Promosi' }], value: '0' }], ok: 'Simpan promo', onOk: v => savePromo({ id: d.id, title: v.title, body: v.body, svc: v.svc, until: v.until, image: (v.image || [])[0] || null, at: b.at, active: b.active }, v.send === '1') });
};
A.promoToggle = d => { const b = CFG().banners[d.id]; return saveConfig({ banners: { [d.id]: { active: b.active === false } } }, b.active === false ? 'Aktifkan promo' : 'Nonaktifkan promo'); };
A.promoSend = d => { const b = CFG().banners[d.id]; ask({ title: 'Kirim promo ke pelanggan?', body: `“${esc(b.title)}” dikirim ke tab Promosi semua pelanggan. Pelanggan yang sudah menerimanya tidak menerima duplikat.`, ok: 'Kirim', onOk: () => savePromo(Object.assign({ id: d.id }, b), true) }); };

/* ---------- Konfigurasi ---------- */
VIEWS.a_config = () => {
  const c = CFG(); const key = 'cfg';
  const d = draft(key, () => ({ commissionPct: c.commissionPct, minDeposit: c.minDeposit, maxActiveJobs: c.maxActiveJobs, maxMatchKm: c.maxMatchKm, cancelFeeMin: c.cancelFeeMin, tiers: c.travelTiers.map(t => Object.assign({}, t)), reason: '' }));
  const dis = ME.isOwner ? '' : 'disabled';
  return opsShell('config', 'Konfigurasi platform', `${note('warn', 'info', 'Nilai awal adalah <b>usulan kebijakan</b> yang perlu divalidasi secara lokal (operasional & hukum) sebelum dipakai untuk transaksi nyata.')}
    <div class="card stack"><h3>Komisi & mitra</h3><div class="grid2">${fld('Komisi platform (%)', input(key + '.commissionPct', d.commissionPct, `type="number" min="0" max="50" ${dis}`), { hint: 'Dari nilai jasa; material & perjalanan tidak dikenai komisi.' })}${fld('Deposit minimum mitra (Rp)', input(key + '.minDeposit', d.minDeposit, `type="number" min="0" ${dis}`))}${fld('Maks. pekerjaan aktif per mitra', input(key + '.maxActiveJobs', d.maxActiveJobs, `type="number" min="1" ${dis}`))}${fld('Biaya batal minimum (Rp)', input(key + '.cancelFeeMin', d.cancelFeeMin, `type="number" min="0" ${dis}`))}</div></div>
    <div class="card stack-sm"><h3>Biaya perjalanan · ${esc(BL.REGIONS[c.region].name)}</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Sampai (km)</th><th>Biaya (Rp)</th></tr></thead><tbody>${d.tiers.map((t, i) => `<tr><td>${input(`${key}.tiers.${i}.upTo`, t.upTo, `type="number" min="0" ${dis}`)}</td><td>${input(`${key}.tiers.${i}.fee`, t.fee, `type="number" min="0" ${dis}`)}</td></tr>`).join('')}</tbody></table></div><p class="xs muted">Di atas tingkat terakhir: penawaran khusus sebelum konfirmasi. Jarak = garis lurus antarkecamatan × 1,3 (perkiraan sampai penyedia rute dihubungkan).</p></div>
    ${ME.isOwner ? `${fld('Alasan perubahan', input(key + '.reason', d.reason, 'placeholder="Wajib, tercatat di log audit"'), { req: true })}<button class="btn btn-primary btn-lg" data-act="saveCfg">Simpan konfigurasi</button>` : note('', 'lock', 'Hanya pemilik aplikasi yang dapat mengubah konfigurasi.')}
    <div class="card stack-sm"><h3>Akses pengguna</h3><p class="small muted">Data hanya terbaca oleh orang yang diberi akses <b>Contributor</b> ke atas (paket tim/perusahaan) atau diundang lewat email sebagai <b>Editor</b> (paket pribadi; editor juga bisa menerbitkan versi halaman, jadi undang orang tepercaya). Pengunjung tautan publik tidak bisa membaca data pelanggan. Dokumen verifikasi mitra disimpan di area privat yang hanya dapat dibuka pemilik.</p></div>
    <div class="card stack-sm"><h3>Integrasi</h3><div class="kv small"><span>Database bersama</span><span class="v">${shared() ? pill(R.mode === 'firebase' ? 'Firebase' : 'Terhubung', 'primary') : pill('Mode lokal', 'warn')}</span><span>Penyimpanan foto</span><span class="v">${R.assets || R.mode === 'local' ? pill('Tersedia', 'primary') : pill('Tidak tersedia', 'muted')}</span><span>Gateway pembayaran</span><span class="v">${simPill()}</span><span>Push / email / WhatsApp</span><span class="v">${pill('Belum dikonfigurasi', 'muted')}</span><span>Peta & rute</span><span class="v">${pill('Perkiraan antarkecamatan', 'warn')}</span></div></div>`);
};
A.saveCfg = async () => {
  const d = S.d.cfg;
  const tiers = d.tiers.map(t => ({ upTo: Number(t.upTo), fee: Math.round(Number(t.fee)) }));
  for (let i = 0; i < tiers.length; i++) if (!(tiers[i].upTo > 0) || tiers[i].fee < 0 || (i && tiers[i].upTo <= tiers[i - 1].upTo)) return toast('Tingkat jarak harus naik berurutan dan biaya tidak negatif.', true);
  const pct = Number(d.commissionPct);
  if (!(pct >= 0 && pct <= 50)) return toast('Komisi harus 0–50%.', true);
  await saveConfig({ commissionPct: pct, minDeposit: Math.round(Number(d.minDeposit)), maxActiveJobs: Math.max(1, Math.round(Number(d.maxActiveJobs))), cancelFeeMin: Math.round(Number(d.cancelFeeMin)), travelTiers: tiers, maxMatchKm: tiers[tiers.length - 1].upTo }, d.reason);
  S.d.cfg = null;
};

/* ---------- Notifikasi & audit ---------- */
VIEWS.a_notifs = () => {
  const mine = notifsFor(['ops']);
  const all = Store.list('notifications');
  const by = {}; all.forEach(n => { by[n.type] = (by[n.type] || 0) + 1; });
  return opsShell('notifs', 'Notifikasi', `<div class="row between"><h3>Untuk tim operasional</h3>${mine.some(n => !n.read) ? `<button class="linkbtn" data-act="opsReadAll">Tandai semua dibaca</button>` : ''}</div>
    ${mine.length ? `<div class="list">${mine.slice(0, 60).map(n => `<button class="li ${n.read ? '' : 'unread'}" data-act="openNotif" data-id="${n.id}">${icon('bell', 18)}<div class="grow"><div class="t small">${esc(n.title)}</div><div class="xs muted">${esc(n.body)} · ${ago(n.at)}</div></div></button>`).join('')}</div>` : empty('bell', 'Belum ada notifikasi')}
    <div class="card stack-sm"><h3>Pengiriman (${all.length} notifikasi terakhir)</h3><div class="kv small"><span>Dalam aplikasi terkirim</span><span class="v">${all.filter(n => (n.channels || {}).inapp === 'terkirim').length}</span><span>Dibaca</span><span class="v">${all.filter(n => n.read).length}</span><span>Push/email diminta tapi belum dikonfigurasi</span><span class="v">${all.filter(n => Object.values(n.channels || {}).includes('tidak_dikonfigurasi')).length}</span><span>Gagal</span><span class="v">${all.filter(n => Object.values(n.channels || {}).includes('gagal')).length}</span></div>
      <p class="xs muted">ID notifikasi dibentuk dari kunci peristiwa + penerima sehingga pengiriman ulang tidak menggandakan notifikasi.</p>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Jenis peristiwa</th><th class="num">Jumlah</th></tr></thead><tbody>${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td class="mono xs">${esc(k)}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table></div></div>`);
};
A.opsReadAll = async () => { for (const n of notifsFor(['ops']).filter(n => !n.read)) await Store.patch('notifications', n.id, { read: true, readAt: now() }); };
VIEWS.a_audit = () => {
  const q = String((S.d.aq && S.d.aq.q) || '').toLowerCase();
  const list = Store.list('audit').filter(a => !q || (a.action + ' ' + a.target + ' ' + a.reason).toLowerCase().includes(q)).sort((a, b) => b.at - a.at);
  return opsShell('audit', 'Log audit', `${input('aq.q', (S.d.aq || {}).q || '', 'type="search" placeholder="Filter aksi, target, alasan"')}
    <div class="table-wrap" data-live="audit"><table class="tbl"><thead><tr><th>Waktu</th><th>Peran</th><th>Aksi</th><th>Target</th><th>Alasan</th></tr></thead><tbody>${list.slice(0, 300).map(a => `<tr><td class="small">${fmtDate(a.at)}</td><td class="small">${esc(a.role)}${a.actorPid ? '<div class="xs muted">' + esc((prof(a.actorPid) || {}).name || '') + '</div>' : ''}</td><td class="mono xs">${esc(a.action)}</td><td class="mono xs">${esc(a.target)}</td><td class="small">${esc(a.reason || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada entri.</td></tr>'}</tbody></table></div>`);
};
/* =========================================================
   BERESIN — mulai
   ========================================================= */
loadUI();
loadPrefs();
if (location.hash === '#mitra') { S.role = 'worker'; S.splash.role = 'worker'; }
if (/^#admin\b/.test(location.hash)) S.role = 'ops';
detectGeo().then(() => scheduleRender());
scheduleRender(true);
initStore().then(() => {
  // pilih profil bawaan bila belum ada pilihan
  ['customer', 'worker'].forEach(r => { if (!S.act[r]) { const m = myProfiles(r)[0]; if (m) S.act[r] = m.id; } });
  scheduleRender(true);
}).catch(err => {
  console.error(err);
  R.mode = 'local'; COLS.forEach(c => { R.ready[c] = true; });
  scheduleRender(true);
});
// segarkan label waktu relatif
setInterval(() => { if (!S.sheet && !isTyping()) scheduleRender(); }, 60000);

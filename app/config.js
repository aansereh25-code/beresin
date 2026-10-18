// Konfigurasi BERESIN (lihat PANDUAN-PASANG.md).
// Biarkan firebase: null untuk mode demo (data hanya di perangkat masing-masing).
// Setelah membuat proyek Firebase, tempel konfigurasi Web App di bawah dan isi email pemilik.
window.BERESIN_CONFIG = {
  firebase: null,
  // firebase: { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." },
  owners: [], // contoh: ["pemilik@gmail.com"] — email Google yang menjadi admin
  ownerHashes: [], // alternatif agar email admin tidak terlihat publik: SHA-256 dari email (huruf kecil)
  storage: false // true hanya bila Firebase Storage aktif (paket Blaze). false = foto disimpan di Firestore (paket gratis)
};

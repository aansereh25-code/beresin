# Panduan Pasang BERESIN di Domain Sendiri

Situs ini terdiri dari:

- `index.html` — halaman depan (untuk Google & calon pelanggan/mitra)
- `app/` — aplikasi BERESIN (Pelanggan, Mitra, Operasional), bisa dipasang ke layar utama HP
- `firestore.rules`, `storage.rules` — aturan keamanan database Firebase

Tanpa Firebase, aplikasi berjalan dalam **mode demo** (data tersimpan di perangkat masing-masing). Agar pelanggan, mitra, dan admin berbagi data yang sama, lakukan langkah 2.

## 1A. Cara tercepat: Netlify (seret & lepas, tanpa coding)

1. Buka <https://app.netlify.com/drop> dan buat akun gratis (bisa pakai akun Google).
2. Ekstrak `beresin-situs.zip`, lalu seret **folder hasil ekstrak** ke kotak unggah di halaman itu.
3. Setelah aktif, buka **Site configuration → Change site name** → isi misalnya `beresin-kupang`.
   Alamat Anda menjadi `https://beresin-kupang.netlify.app` (tanpa kata "claude").
4. Untuk memperbarui situs: menu **Deploys** → seret folder versi baru.

Catatan: unggahan tanpa akun dikunci kata sandi dan dihapus otomatis bila tidak diklaim, jadi pastikan masuk dengan akun.

## 1B. Alternatif: GitHub Pages

1. Buat repositori publik, misalnya `beresin`, lalu unggah seluruh isi folder ini.
2. Buka **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → **Save**.
3. Situs aktif di `https://NAMA-AKUN.github.io/beresin/` (beberapa menit).

## 2. Database & login (Firebase, gratis untuk skala awal)

1. Buka <https://console.firebase.google.com> → **Add project** → nama `beresin`.
2. **Build → Authentication → Get started → Google → Enable.** Di tab *Settings → Authorized domains*, tambahkan alamat situs Anda (mis. `beresin-kupang.netlify.app` atau `NAMA-AKUN.github.io`) dan domain Anda (mis. `beresin.id`).
3. **Build → Firestore Database → Create database** → mode *production* → lokasi `asia-southeast2 (Jakarta)`.
   Tab **Rules**: tempel isi `firestore.rules`, ganti `GANTI-EMAIL-PEMILIK@gmail.com` dengan email Google Anda → **Publish**.
4. **Build → Storage → Get started** → tab **Rules**: tempel isi `storage.rules` → **Publish**.
5. **Project settings → Your apps → Web (</>)** → daftarkan aplikasi → salin objek `firebaseConfig`.
6. Edit `app/config.js`:

```js
window.BERESIN_CONFIG = {
  firebase: { apiKey: "…", authDomain: "…", projectId: "…", storageBucket: "…", messagingSenderId: "…", appId: "…" },
  owners: ["email-anda@gmail.com"]
};
```

Konfigurasi web Firebase bukan rahasia; keamanannya dijaga oleh aturan di langkah 3–4.

## 3. Domain sendiri (mis. `beresin.id`)

1. Beli domain di registrar Indonesia (PANDI-accredited untuk `.id`) atau registrar internasional untuk `.com`.
2. Di pengaturan DNS domain:
   - 4 record **A** untuk `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - record **CNAME** `www` → `NAMA-AKUN.github.io`
3. Di GitHub **Settings → Pages → Custom domain** isi `beresin.id` → Save → centang **Enforce HTTPS** setelah sertifikat aktif.
   Bila memakai Netlify: **Domain management → Add a domain** → ikuti petunjuk DNS dari Netlify (bukan record GitHub di atas).
4. Rakit ulang dengan alamat final agar tautan kanonik, sitemap, dan gambar pratinjau (saat link dibagikan di WhatsApp/Facebook) benar:
   `node site/build.js https://beresin.id` — lalu unggah ulang folder `site/out`.

## 4. Muncul di Google

1. Buka <https://search.google.com/search-console> → **Add property** → masukkan domain → verifikasi (record TXT di DNS).
2. Menu **Sitemaps** → kirim `sitemap.xml`.
3. Opsional: buat **Google Business Profile** untuk BERESIN di Kupang agar muncul di Google Maps & pencarian lokal.

Pengindeksan biasanya butuh beberapa hari hingga beberapa minggu.

## Akses pengguna & admin

| Siapa | Cara masuk | Yang terlihat |
|---|---|---|
| **Pelanggan** | Buka `https://ALAMAT-ANDA/app/` → (dengan Firebase) *Masuk dengan Google* → isi profil saat memesan pertama kali | Aplikasi Pelanggan & Mitra |
| **Mitra** | Buka `https://ALAMAT-ANDA/app/#mitra` → daftar sebagai mitra → tunggu verifikasi admin | Aplikasi Mitra (bisa menerima pesanan setelah terverifikasi) |
| **Admin (pemilik)** | Dengan Firebase: masuk memakai email yang tercantum di `owners` (`app/config.js`) dan di `firestore.rules` | Menu **Operasional** muncul otomatis |
| **Staf** (CS, supervisor, keuangan) | Admin membuka Operasional → **Pengguna & staf** → beri peran | Operasional sesuai perannya |

Pengunjung biasa **tidak pernah** melihat menu Operasional.

**Mode demo (tanpa Firebase):** semua pengunjung adalah pengguna biasa dan datanya hanya di perangkat masing-masing. Untuk mencoba Operasional di perangkat Anda sendiri, buka `https://ALAMAT-ANDA/app/#admin` sekali. Untuk menutupnya, buka `/app/#keluar-admin`. Pengaturan ini hanya berlaku di perangkat itu dan tidak memberi akses ke data orang lain.

Untuk menguji sebagai pelanggan, buka link di jendela penyamaran (incognito) atau masuk dengan akun Google lain.

## Yang masih simulasi

- Pembayaran, deposit, dan pencairan berlabel **SIMULASI**. Untuk dana nyata perlu payment gateway berizin (mis. Midtrans/Xendit) dan fungsi server (Cloud Functions) untuk memverifikasi webhook.
- Notifikasi push/email/WhatsApp belum terhubung.
- Peta di dalam aplikasi bersifat skematis; posisi live memakai *Berbagi lokasi* Google Maps. GPS otomatis aktif di hosting sendiri bila pengguna mengizinkan lokasi.

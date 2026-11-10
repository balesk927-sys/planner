# Valeska's Study Planner — realtime Notion edition

Aplikasi Next.js untuk menampilkan dua sumber Notion yang sudah dipilih: **CALENDER** dan **Assignment/Exam Schedule**. Fitur: PIN editor, create/edit/delete agenda, two-way sync, Notion connection webhook, live updates via Supabase Realtime, auto-reschedule agenda fleksibel, dan Web Push reminder.

> **Status:** source project siap dikonfigurasi. Ini belum menjadi website online. Pemilik perlu menyiapkan Notion integration, Supabase project, Vercel/Git deployment, dan secrets. Jangan mengirim token, PIN, atau private key lewat chat.

## 1. Prasyarat

- Node.js 22 (lihat `.nvmrc`).
- Akun Notion dan izin membuat Internal Integration.
- Supabase project.
- Vercel (atau hosting Node.js kompatibel dengan Next.js). Gunakan HTTPS untuk push notifications.

## 2. Siapkan Notion

1. Buat **Internal Integration** dari Notion Settings → Connections → Develop your own connections.
2. Beri permission **Read content**, **Update content**, dan **Insert content**. Token hanya disimpan sebagai `NOTION_TOKEN` di hosting.
3. Share halaman `Valeska’s Study Planner` atau kedua database `CALENDER` dan `Assignment/Exam Schedule` ke integration tersebut.
4. Gunakan data-source IDs berikut (sudah disiapkan di `.env.example`):
   - CALENDER: `3c8725e0-e9ef-80f3-b5fd-000bb43152dd`
   - Assignment/Exam Schedule: `6f2703ea-118d-4cdf-bdb8-820ae958c1df`
5. Properti yang digunakan:
   - CALENDER: `Name` (title), `Date` (date), `Tags` (multi-select).
   - Assignment/Exam Schedule: `Name` (title), `Dates` (date), `Notes` (rich text), `Status` (checkbox), `Task` (multi-select), `Course` (select), `Weighting` (rich text).
6. Pada tahap pertama, jangan ubah nama properti database yang sudah ada.

**Penting untuk auto-reschedule:** status `Tetap/Fleksibel` dan reminder khusus website disimpan di cache Supabase. Menandai agenda “Jadwal tetap” di website akan melindunginya dari auto-reschedule; aturan ini tidak mengubah struktur kolom database Notion. Tag `Tetap`, `Fixed`, atau `Kuliah` yang sudah ada juga dibaca sebagai agenda tetap saat sinkronisasi awal.

## 3. Siapkan Supabase

1. Buat project Supabase.
2. Buka SQL Editor, jalankan `supabase/migrations/001_initial.sql`.
3. Salin Project URL, anon/public key, dan service_role key. `service_role` hanya ke server; jangan pernah gunakan dengan prefix `NEXT_PUBLIC_`.
4. Aktifkan Realtime untuk tabel `planner_events` (Database → Publications / Realtime).
5. Tabel `planner_events` memiliki policy SELECT publik karena kalender memang dipilih untuk dapat dilihat tanpa login. Operasi tulis tetap hanya lewat API server dengan PIN. Tabel push subscription dan rahasia tidak memiliki policy publik.

## 4. Konfigurasi environment

Salin `.env.example` menjadi `.env.local` untuk lokal, lalu isi nilai privat sendiri. Buat secret yang berbeda untuk `PLANNER_SESSION_SECRET` dan `CRON_SECRET` (minimal 32 karakter acak), misalnya jalankan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` dua kali. Atur `PLANNER_PIN` sendiri. Jangan pernah commit `.env.local`.

Buat VAPID key pair:

```bash
npx web-push generate-vapid-keys
```

Simpan public key ke `NEXT_PUBLIC_VAPID_PUBLIC_KEY` dan private key ke `VAPID_PRIVATE_KEY`. Isi `VAPID_SUBJECT` dengan alamat kontak yang kamu kelola.

## 5. Jalankan dan tes lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Masukkan PIN untuk membuka editor. Tes membuat agenda, mengedit waktu/catatan, tandai tetap/fleksibel, hapus, dan sync. Push notification perlu HTTPS (localhost biasanya dianggap secure context oleh browser).

## 6. Deploy online

1. Push folder project ke repository Git privat.
2. Import repository ke Vercel.
3. Tambahkan semua environment variables dari `.env.example` di Project Settings → Environment Variables. Jangan masukkan `.env.local` ke Git.
4. Deploy. Setelah domain HTTPS tersedia, gunakan URL tersebut sebagai `planner_base_url` di Supabase.
5. Di Supabase SQL Editor, jalankan `supabase/cron-setup.sql` setelah mengganti placeholder URL website dan `CRON_SECRET`. Skrip ini menjalankan pemeriksaan push setiap menit dan full-sync setiap lima menit lewat pg_cron/pg_net. Jika project Supabase tidak menyediakan Vault/pg_cron/pg_net pada plan yang dipakai, gunakan layanan scheduler eksternal atau cron plan yang sesuai.

## 7. Aktifkan Notion webhook untuk perubahan real-time

1. Buka developer portal Notion → integration milikmu → Webhooks.
2. Daftarkan URL: `https://YOUR-PLANNER.vercel.app/api/webhooks/notion`.
3. Pilih event page created, page updated, page deleted, dan database/data-source events yang tersedia.
4. Simpan URL webhook. Notion mengirim handshake pertama berisi `verification_token` tanpa signature; server menangkap token itu sekali. Setelah itu, event berikutnya diverifikasi dengan HMAC-SHA256. (Jangan mengirim token tersebut melalui chat.)
5. Buka website, unlock dengan PIN, lalu buka `https://YOUR-PLANNER.vercel.app/api/webhooks/notion/token` pada browser yang sama. Salin nilai `verificationToken` dari respons JSON dan tempelkan ke kolom Verification token di Notion, lalu klik Verify subscription. Endpoint token ini hanya dapat dibuka setelah PIN editor aktif.
6. Uji dengan mengubah judul atau tanggal agenda di Notion. Perubahan masuk ke cache dan disiarkan melalui Supabase Realtime ke tab website yang sedang terbuka.

Notion API dan webhook tunduk pada batas request/rate limit. Sinkronisasi penuh tiap lima menit dipakai sebagai jaring pengaman; webhook adalah jalur pembaruan segera. Webhook hanya memantau halaman/database yang sudah dibagikan ke integration.

## 8. Aturan auto-reschedule

- Jadwal tetap tidak pernah dipindah otomatis.
- Ketika agenda mendadak ditambahkan, agenda fleksibel yang waktunya bentrok dicari slot kosong berikutnya.
- Durasi agenda yang dipindah dipertahankan; pencarian dilakukan per 15 menit pada jam 06.00–22.00, hingga 14 hari ke depan.
- Agenda yang tidak menemukan slot ditampilkan sebagai konflik untuk diselesaikan manual.
- Agenda yang dipindah dikirim kembali ke Notion dan cache live diperbarui.

Auto-reschedule berjalan saat agenda baru dibuat atau tanggal/jam agenda diubah dari website maupun langsung di Notion. Perubahan metadata seperti judul atau catatan tidak menggeser agenda lain. Untuk perubahan dari Notion, webhook menjadi pemicu utama dan full sync terjadwal menjadi fallback. Perubahan simultan yang menimbulkan konflik diproses berurutan; jika beberapa agenda tetap saling bertabrakan, konflik ditandai untuk pemeriksaan manual.

## 9. Notifikasi

- Buka website, unlock dengan PIN, lalu klik **Aktifkan notifikasi** pada Planner tools.
- Izinkan push notification di browser/perangkat.
- Reminder default 10 menit; dapat diubah per agenda.
- Web Push dapat muncul ketika tab tidak terbuka selama browser/perangkat mendukung Push API dan layanan push aktif. Pengguna tetap perlu mengizinkan notifikasi; mode hemat daya, pengaturan sistem, atau browser dapat membatasi pengiriman.

## Batasan yang perlu diketahui

- Website memakai public view untuk dua database yang disetujui; siapa pun yang memiliki URL dapat melihat agenda di dalam cache. PIN hanya mengunci operasi edit, bukan menyembunyikan isi agenda.
- Plugin Notion di ChatGPT tidak otomatis menjadi kredensial API website. Website memerlukan Internal Integration token sendiri.
- PIN editor dibatasi maksimal lima percobaan per 15 menit per alamat jaringan yang di-hash; tabel penyimpanan percobaan tidak mengekspos IP mentah.
- Auto-reschedule memakai aturan sederhana dan slot 15 menit, bukan optimasi kalender penuh. Konflik yang tidak menemukan slot perlu keputusan manual.
- Notion webhook real-time bergantung pada subscription aktif; full sync terjadwal menjadi fallback.
- Tidak ada URL publik sebelum project dideploy ke hosting dan environment variables diisi.

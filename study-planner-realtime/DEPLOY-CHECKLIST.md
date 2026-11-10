# Checklist deploy — Study Planner

Ikuti berurutan; jangan mengirim token, PIN, atau private key ke chat.

## A. Akun dan database

- [ ] Buat Internal Integration Notion dengan izin Read, Update, dan Insert.
- [ ] Share hanya database `CALENDER` dan `Assignment/Exam Schedule` kepada integration tersebut.
- [ ] Buat project Supabase.
- [ ] Jalankan `supabase/migrations/001_initial.sql` di Supabase SQL Editor.
- [ ] Aktifkan Realtime untuk tabel `planner_events`.

## B. Jalankan di komputer

- [ ] Pastikan Node.js 22 aktif (`node -v`).
- [ ] Salin `.env.example` menjadi `.env.local`.
- [ ] Isi seluruh environment variable secara lokal. `NOTION_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `PLANNER_PIN`, `PLANNER_SESSION_SECRET`, `CRON_SECRET`, dan `VAPID_PRIVATE_KEY` adalah rahasia server.
- [ ] Buat VAPID key dengan `npx web-push generate-vapid-keys`.
- [ ] Jalankan `npm install`, lalu `npm run dev`.
- [ ] Buka `http://localhost:3000`, unlock dengan PIN, lalu tes tambah/edit/hapus agenda.

## C. Deploy

- [ ] Simpan project dalam repository Git privat.
- [ ] Import repository ke Vercel.
- [ ] Tambahkan environment variable yang sama di Vercel Project Settings.
- [ ] Deploy dan buka URL HTTPS hasil deploy.
- [ ] Ganti URL placeholder di `supabase/cron-setup.sql` dan masukkan `CRON_SECRET` milikmu melalui Supabase Vault, lalu jalankan SQL tersebut.

## D. Hubungkan webhook Notion

- [ ] Daftarkan `https://DOMAIN-KAMU/api/webhooks/notion` di pengaturan Webhooks untuk Internal Integration.
- [ ] Setelah handshake diterima, unlock website dengan PIN.
- [ ] Buka `https://DOMAIN-KAMU/api/webhooks/notion/token` pada browser yang sama.
- [ ] Salin `verificationToken` dari respons JSON ke kolom Verification token di Notion, lalu verifikasi subscription.
- [ ] Ubah satu judul/tanggal di Notion dan cek website; lalu edit satu agenda di website dan cek Notion.

## E. Uji notifikasi dan penjadwalan

- [ ] Aktifkan notifikasi di browser/perangkat yang akan menerima pengingat.
- [ ] Pastikan browser mengizinkan notifikasi dan service worker aktif.
- [ ] Uji agenda fleksibel yang bertabrakan dengan agenda baru.
- [ ] Uji agenda tetap; sistem tidak boleh memindahkannya dan harus memberi tahu jika ada benturan.
- [ ] Uji satu agenda dengan reminder 5 menit untuk memastikan Web Push diterima.

**Catatan:** Sinkronisasi webhook bersifat event-driven, dengan full sync setiap 5 menit sebagai jaring pengaman. Pemeriksaan pengingat berjalan setiap menit, sehingga waktu notifikasi dapat sedikit bergeser. Notifikasi hanya masuk ke perangkat yang sudah memberikan izin dan mendaftarkan subscription.

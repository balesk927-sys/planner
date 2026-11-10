-- Jalankan SETELAH migrasi, setelah mengisi URL publik website dan membuat secret.
-- Memerlukan pg_cron + pg_net. Secret disimpan di Supabase Vault, bukan di SQL yang dipublikasikan.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Simpan rahasia sekali dari SQL Editor; ganti kedua placeholder.
select vault.create_secret('https://YOUR-PLANNER.vercel.app', 'planner_base_url');
select vault.create_secret('YOUR_CRON_SECRET', 'planner_cron_secret');

-- Notifikasi diperiksa setiap menit, sinkronisasi penuh sebagai jaring pengaman tiap 5 menit.
select cron.schedule('planner-push-every-minute', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='planner_base_url') || '/api/notifications/dispatch',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='planner_cron_secret')),
    body := '{}'::jsonb
  );
$$);
select cron.schedule('planner-sync-every-five-minutes', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='planner_base_url') || '/api/sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='planner_cron_secret')),
    body := '{}'::jsonb
  );
$$);

# Deploy Edge Function via Supabase Dashboard

Karena Supabase CLI memerlukan Docker, kita bisa deploy langsung via Dashboard.

## Cara 1: Via Supabase Dashboard (Recommended)

1. Buka Supabase Dashboard: https://supabase.com/dashboard
2. Pilih project: `aoxxjvnwwnedlxikyzds`
3. Pergi ke **Edge Functions** di sidebar kiri
4. Klik **Create a new function**
5. Nama function: `validate-download`
6. Copy-paste isi file `supabase/functions/validate-download/index.ts` ke editor
7. Klik **Deploy**

## Cara 2: Install Docker (Jika ingin pakai CLI)

Jika ingin menggunakan CLI di masa depan:

1. Install Docker Desktop: https://docs.docker.com/desktop
2. Start Docker Desktop
3. Jalankan: `supabase functions deploy validate-download`

## Verifikasi Deployment

Setelah deploy, test function:
```bash
curl "https://aoxxjvnwwnedlxikyzds.supabase.co/functions/v1/validate-download?photoId=01223015-a94b-4327-b186-6caead5c5429&token=VT2gKrwJZS2of1DMQAyEA1PUiEnXEJJo0a7xbbCVjHo"
```

Atau test di browser:
```
https://aoxxjvnwwnedlxikyzds.supabase.co/functions/v1/validate-download?photoId=01223015-a94b-4327-b186-6caead5c5429&token=VT2gKrwJZS2of1DMQAyEA1PUiEnXEJJo0a7xbbCVjHo
```

## Environment Variables

Pastikan environment variables sudah set di Dashboard:
- `SUPABASE_URL`: Otomatis tersedia
- `SUPABASE_SERVICE_ROLE_KEY`: Set di Dashboard > Project Settings > API > service_role key

## Troubleshooting

Jika masih ada CORS error setelah deploy:
1. Pastikan function sudah di-deploy dan aktif
2. Check function logs di Dashboard untuk error
3. Pastikan CORS headers sudah include di semua response


# Setup Notifikasi Build GitHub Actions

Sistem notifikasi telah ditambahkan ke workflow build Android APK. Notifikasi akan dikirim otomatis setelah build selesai (baik berhasil maupun gagal).

## Fitur Notifikasi

? **Notifikasi Multi-Channel**:
- Discord Webhook
- Slack Webhook
- Telegram Bot
- GitHub PR Comments (otomatis jika build dari PR)
- Email (via SMTP - perlu setup tambahan)

? **Informasi yang Dikirim**:
- Status build (Berhasil/Gagal)
- Build type (debug/release)
- Version APK
- Nama file APK
- Link ke workflow run
- Link download artifacts

## Setup Notifikasi

### 1. Discord Webhook (Paling Mudah)

1. Buka Discord Server Anda
2. Pergi ke **Server Settings** ? **Integrations** ? **Webhooks**
3. Klik **New Webhook** atau **Create Webhook**
4. Copy URL webhook (format: `https://discord.com/api/webhooks/...`)
5. Di GitHub, buka **Repository Settings** ? **Secrets and variables** ? **Actions**
6. Tambah secret baru:
   - **Name**: `DISCORD_WEBHOOK_URL`
   - **Value**: URL webhook yang sudah di-copy
7. Klik **Add secret**

### 2. Slack Webhook

1. Buka https://api.slack.com/apps
2. Buat aplikasi baru atau gunakan yang sudah ada
3. Pergi ke **Incoming Webhooks** ? **Activate Incoming Webhooks**
4. Klik **Add New Webhook to Workspace**
5. Pilih channel untuk notifikasi
6. Copy Webhook URL
7. Di GitHub, tambah secret:
   - **Name**: `SLACK_WEBHOOK_URL`
   - **Value**: Webhook URL dari Slack

### 3. Telegram Bot

1. Chat dengan [@BotFather](https://t.me/botfather) di Telegram
2. Kirim `/newbot` dan ikuti instruksi
3. Copy **Bot Token** yang diberikan
4. Untuk mendapatkan **Chat ID**:
   - Chat dengan bot Anda
   - Kirim pesan apapun ke bot
   - Buka: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
   - Cari `chat.id` di response
5. Di GitHub, tambah 2 secrets:
   - **Name**: `TELEGRAM_BOT_TOKEN` ? **Value**: Bot token
   - **Name**: `TELEGRAM_CHAT_ID` ? **Value**: Chat ID

### 4. GitHub PR Comments (Otomatis)

Tidak perlu setup! Jika build dipicu dari Pull Request, notifikasi akan otomatis muncul sebagai comment di PR tersebut.

### 5. Email via SMTP

**Note**: Untuk email, diperlukan action tambahan. Workflow sudah disiapkan tapi perlu install action email.

1. Install action: `dawidd6/action-send-mail@v3` (tambahkan step di workflow)
2. Setup secrets:
   - `SMTP_HOST`: SMTP server (contoh: `smtp.gmail.com`)
   - `SMTP_PORT`: Port SMTP (contoh: `587`)
   - `SMTP_USER`: Email pengirim
   - `SMTP_PASSWORD`: Password email
   - `EMAIL_TO`: Email penerima

## Cara Kerja

1. Build selesai (berhasil atau gagal)
2. Job `notify` otomatis berjalan
3. Sistem cek secrets yang tersedia
4. Kirim notifikasi ke semua channel yang dikonfigurasi
5. Jika build dari PR, otomatis comment di PR

## Testing

Untuk test notifikasi:

1. **Test tanpa setup**: Job notify akan tetap berjalan, hanya tidak mengirim notifikasi jika secrets tidak ada
2. **Test dengan setup**: Setup salah satu channel (Discord paling mudah), lalu trigger build
3. Cek channel untuk verifikasi notifikasi terkirim

## Troubleshooting

### Notifikasi Tidak Terkirim

1. **Cek secrets**: Pastikan nama secret exact match (case sensitive)
2. **Cek webhook URL**: Pastikan URL valid dan tidak expired
3. **Cek logs**: Lihat job `notify` di GitHub Actions untuk error messages

### Discord Notifikasi Tidak Muncul

- Pastikan webhook URL benar
- Pastikan channel di Discord masih ada
- Cek permissions webhook

### Telegram Bot Tidak Respon

- Pastikan bot token benar
- Pastikan chat ID benar (format: angka, bisa negatif untuk groups)
- Pastikan sudah chat dengan bot sebelum menggunakan

### Slack Notifikasi Error

- Pastikan webhook URL aktif
- Cek format JSON di logs
- Pastikan app Slack punya permission untuk post messages

## Contoh Notifikasi

### Discord
```
? Build Android APK Berhasil

Build Details:
- Build Type: `release`
- Version: `v1.0.0`
- APK: `morobooth-v1.0.0-release-20250131-143022.apk`
- Status: **Berhasil**

Links:
- View Workflow Run
- Download Artifacts

Build completed at 2025-01-31 14:30:22 UTC
```

### Telegram
```
? Build Android APK Berhasil

Build Details:
? Build Type: `release`
? Version: `v1.0.0`
? APK: `morobooth-v1.0.0-release-20250131-143022.apk`
? Status: Berhasil

Links:
? View Workflow
? Download APK

2025-01-31 14:30:22 UTC
```

## Catatan

- **Tidak perlu setup semua channel**: Pilih 1-2 channel yang paling nyaman digunakan
- **Discord recommended**: Paling mudah setup dan reliable
- **GitHub notifications**: Otomatis aktif via email GitHub (jika dikonfigurasi di GitHub settings)
- **Build gagal juga dapat notifikasi**: Sistem akan mengirim notifikasi baik build berhasil maupun gagal

## Support

Jika ada masalah dengan notifikasi, cek:
1. Workflow file: `.github/workflows/android-build.yml`
2. Job logs: GitHub Actions ? Workflow runs ? Notify job
3. Secrets: Repository Settings ? Secrets and variables ? Actions

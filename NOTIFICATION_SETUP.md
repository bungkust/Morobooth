# Setup Notifikasi GitHub Actions Build

## Overview

GitHub Actions workflow sudah dikonfigurasi untuk mengirim notifikasi otomatis ketika build selesai (baik sukses maupun gagal). Ada dua pilihan notifikasi:

1. **Telegram** - Mudah setup, gratis, bisa personal atau grup
2. **Discord** - Populer untuk tim development

Notifikasi akan menampilkan:
- ?/? Status build (berhasil/gagal)
- ?? Nama aplikasi
- ?? Version
- ??? Build type (debug/release)
- ?? APK size (jika berhasil)
- ?? WebView URL yang digunakan
- ?? Link untuk download APK atau lihat error logs

## Option 1: Telegram Notification

### Keuntungan
- ? Gratis dan mudah setup
- ? Bisa di personal chat atau grup
- ? Push notification langsung ke HP
- ? Tidak perlu server atau workspace

### Setup Steps

#### 1. Buat Bot Telegram

1. Buka Telegram dan cari `@BotFather`
2. Kirim command: `/newbot`
3. Ikuti instruksi untuk beri nama bot
4. Simpan **Bot Token** yang diberikan (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

#### 2. Dapatkan Chat ID

**Untuk Personal Chat:**
1. Buka chat dengan bot Anda
2. Kirim pesan apa saja ke bot
3. Buka browser dan akses:
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   ```
   Ganti `<BOT_TOKEN>` dengan token bot Anda
4. Cari bagian `"chat":{"id":123456789}`
5. Simpan **Chat ID** (angka tersebut)

**Untuk Group Chat:**
1. Tambahkan bot ke grup Telegram Anda
2. Kirim pesan apa saja di grup
3. Buka browser dan akses URL yang sama seperti di atas
4. Cari Chat ID grup (biasanya angka negatif seperti `-987654321`)

#### 3. Setup GitHub Repository Variables

1. Buka repository di GitHub
2. Go to: `Settings` ? `Secrets and variables` ? `Actions` ? Tab `Variables`
3. Klik `New repository variable`
4. Tambahkan dua variables:

**Variable 1:**
- Name: `TELEGRAM_BOT_TOKEN`
- Value: Token bot Anda (contoh: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**Variable 2:**
- Name: `TELEGRAM_CHAT_ID`
- Value: Chat ID Anda (contoh: `123456789` atau `-987654321` untuk grup)

#### 4. Test Notifikasi

1. Trigger GitHub Actions workflow (Run workflow)
2. Tunggu build selesai
3. Anda akan dapat notifikasi di Telegram!

### Contoh Notifikasi Telegram

**Berhasil:**
```
? Build Android Berhasil!

?? Aplikasi: MoroBooth
?? Version: 1.0.0
??? Build Type: release
?? APK Size: 45M
?? WebView URL: https://morobooth.netlify.app
?? Build Time: 20250131-143022

?? Lihat Detail Build
```

**Gagal:**
```
? Build Android Gagal!

?? Aplikasi: MoroBooth
?? Version: 1.0.0
??? Build Type: release

?? Lihat Error Logs
```

## Option 2: Discord Notification

### Keuntungan
- ? Terintegrasi dengan Discord server
- ? Rich embeds dengan format yang bagus
- ? Bisa di channel khusus untuk build notifications

### Setup Steps

#### 1. Buat Discord Webhook

1. Buka Discord server Anda
2. Pilih channel untuk notifikasi (atau buat channel baru seperti `#build-notifications`)
3. Klik gear icon (??) di samping nama channel ? `Integrations`
4. Klik `Webhooks` ? `New Webhook`
5. Beri nama webhook (contoh: "GitHub Actions Build")
6. Klik `Copy Webhook URL`
7. Simpan URL webhook tersebut

#### 2. Setup GitHub Repository Variable

1. Buka repository di GitHub
2. Go to: `Settings` ? `Secrets and variables` ? `Actions` ? Tab `Variables`
3. Klik `New repository variable`
4. Tambahkan variable:

**Variable:**
- Name: `DISCORD_WEBHOOK_URL`
- Value: Webhook URL dari Discord (contoh: `https://discord.com/api/webhooks/...`)

#### 3. Test Notifikasi

1. Trigger GitHub Actions workflow
2. Tunggu build selesai
3. Notifikasi akan muncul di Discord channel!

### Contoh Notifikasi Discord

Discord akan menampilkan **Rich Embed** dengan:
- **Green color** (?) untuk build berhasil
- **Red color** (?) untuk build gagal
- Field-field informasi (App name, Version, Build type, APK size, dll)
- Link untuk download artifacts
- Timestamp otomatis

## Menggunakan Kedua Notifikasi Sekaligus

Anda bisa setup **Telegram DAN Discord** bersamaan! Workflow akan mengirim ke keduanya jika variables di-set.

Setup semua variables:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `DISCORD_WEBHOOK_URL`

## Troubleshooting

### Telegram: Tidak Dapat Notifikasi

**Check:**
1. Bot token benar?
2. Chat ID benar?
3. Sudah kirim pesan ke bot minimal 1x?
4. Untuk grup: Bot sudah ditambahkan ke grup?

**Debug:**
- Test manual dengan curl:
  ```bash
  curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/sendMessage" \
    -d "chat_id=<CHAT_ID>" \
    -d "text=Test message"
  ```

### Discord: Webhook Error

**Check:**
1. Webhook URL lengkap dan benar?
2. Channel masih ada?
3. Webhook tidak dihapus?

**Debug:**
- Test manual dengan curl:
  ```bash
  curl -H "Content-Type: application/json" \
    -d '{"content": "Test message"}' \
    "<WEBHOOK_URL>"
  ```

### Notifikasi Tidak Terkirim Sama Sekali

**Possible causes:**
1. Variables belum di-set di GitHub
2. Nama variable salah (harus exact match, case sensitive)
3. Variables di-set sebagai **Secrets** bukan **Variables**

**Solusi:**
- Pastikan variables di tab `Variables`, bukan tab `Secrets`
- GitHub Actions menggunakan `vars.VARIABLE_NAME` untuk variables
- Check workflow logs untuk error message

## Menonaktifkan Notifikasi

Jika ingin menonaktifkan notifikasi:

1. **Hapus variables** dari repository settings, atau
2. **Kosongkan value** dari variables

Workflow akan skip notifikasi jika variables tidak ada atau kosong.

## Security Notes

### Telegram Bot Token & Discord Webhook

?? **Penting:**
- Bot token dan webhook URL sebaiknya di-set sebagai **Variables** (bukan Secrets) karena tidak terlalu sensitif
- Variables bisa dibaca oleh siapa saja yang punya akses ke workflow logs
- Jika sangat concern tentang security, gunakan **Secrets** (tapi perlu ubah workflow sedikit)

### Menggunakan Secrets (Opsional)

Jika ingin lebih aman, ubah workflow dari `vars.` ke `secrets.`:

**Di workflow file:**
```yaml
# Ubah dari:
if: success() && vars.TELEGRAM_BOT_TOKEN != ''

# Ke:
if: success() && secrets.TELEGRAM_BOT_TOKEN != ''
```

**Di GitHub Settings:**
- Set di tab `Secrets` instead of `Variables`
- Secrets tidak akan terlihat di logs

## Tips

1. **Gunakan Grup Telegram** untuk tim development
2. **Buat Discord channel khusus** untuk build notifications agar tidak spam channel lain
3. **Test dengan debug build** dulu sebelum setup untuk production
4. **Monitor first notification** untuk pastikan format sudah sesuai

## Example Workflow Structure

Workflow sudah include notification steps:

```
1. Checkout code
2. Setup environment
3. Build APK
4. Upload artifact
5. Get APK info (size, etc) ? NEW
6. Send Telegram notification ? NEW
7. Send Discord notification ? NEW
```

Notifikasi akan:
- ? Terkirim jika build **berhasil** (success notification)
- ? Terkirim jika build **gagal** (failure notification)
- ?? Tidak terkirim jika variables tidak di-set

## Questions?

Jika ada masalah atau pertanyaan, check:
1. Workflow logs di GitHub Actions
2. Test webhook/bot token secara manual
3. Verify variables sudah di-set dengan benar

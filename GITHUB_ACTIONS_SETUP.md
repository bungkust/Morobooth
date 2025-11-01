# Setup GitHub Actions untuk Build Android APK

## Prerequisites

1. **Repository GitHub**
   - Pastikan repository sudah di-push ke GitHub
   - Workflow file: `.github/workflows/android-build.yml`

2. **GitHub Actions Extension untuk VS Code** (Optional tapi recommended)
   - Install dari VS Code Marketplace
   - Sign in dengan GitHub account
   - Manage workflows langsung dari VS Code

## Setup GitHub Secrets (Untuk Release Build)

### Lokasi: Repository Settings → Secrets and variables → Actions → Repository secrets

Buka: `https://github.com/{username}/{repo}/settings/secrets/actions`

### Secrets yang harus di-set:

#### 1. ANDROID_KEYSTORE_BASE64
- **Value**: Base64 encoded keystore file
- **Cara generate**:
  ```bash
  base64 -i path/to/your-release.keystore | pbcopy  # macOS
  # atau
  base64 -i path/to/your-release.keystore           # Linux
  ```
- **Paste** hasil base64 ke secret

#### 2. ANDROID_KEYSTORE_PASSWORD
- **Value**: Password keystore
- **Contoh**: `8029046ff061266c82ef96871ac71009`

#### 3. ANDROID_KEY_ALIAS
- **Value**: Key alias name
- **Contoh**: `ab7605f4047ad1ac90b3fa07429f050c`

#### 4. ANDROID_KEY_ALIAS_PASSWORD
- **Value**: Password key alias
- **Contoh**: `91bbecc4c62656256d1cac57201a52d0`

## Workflow Configuration

### File: `.github/workflows/android-build.yml`

Workflow sudah dikonfigurasi untuk:
- ✅ Build debug APK (tidak perlu secrets)
- ✅ Build release APK (butuh secrets)
- ✅ Auto naming dengan version + timestamp
- ✅ Upload artifact
- ✅ Custom WebView URL support (optional input)

### Workflow Inputs

Saat trigger workflow, Anda bisa set:

1. **Build type** (required)
   - `debug`: Build untuk testing, tidak perlu secrets
   - `release`: Build untuk production, butuh semua secrets

2. **WebView URL** (optional)
   - Default: `https://morobooth.netlify.app` (dari `app.json`)
   - Bisa override untuk test dengan URL lain
   - Contoh: `https://staging-morobooth.netlify.app` atau local URL untuk testing

### Build Type Details

- **Debug**: 
  - Tidak perlu secrets
  - Untuk testing dan development
  - APK tidak signed (pakai debug keystore)

- **Release**: 
  - Butuh semua 4 secrets
  - Untuk production/distribution
  - APK signed dengan release keystore

## Cara Menggunakan

### Via GitHub Web

1. Buka repository di GitHub
2. Tab **Actions**
3. Pilih workflow **"Android APK Build"**
4. Klik **"Run workflow"**
5. Pilih:
   - Branch: `main` (atau branch yang diinginkan)
   - Build type: `debug` atau `release`
   - WebView URL: (optional) Custom URL atau kosongkan untuk pakai default
6. Klik **"Run workflow"**
7. Tunggu build selesai (~13 menit pertama kali, ~5-8 menit berikutnya)
8. Download APK dari **Artifacts**

### Via VS Code GitHub Actions Extension

1. Buka sidebar GitHub Actions (icon GitHub Actions)
2. Lihat workflow **"Android APK Build"**
3. Klik kanan → **"Run Workflow"**
4. Pilih branch dan build type
5. Monitor progress di VS Code
6. Download artifact dari VS Code

## APK Naming Format

APK akan dinamai dengan format:
```
morobooth-v{VERSION}-{BUILD_TYPE}-{DATE}-{TIME}.apk
```

**Contoh:**
- `morobooth-v1.0.0-debug-20250131-143022.apk`
- `morobooth-v1.0.0-release-20250131-143022.apk`

## Troubleshooting

### Build Gagal

**Check logs di:**
- GitHub Actions tab → Workflow run → Build logs
- VS Code: GitHub Actions sidebar → Workflow runs → Logs

**Common issues:**
1. **Missing secrets** (release build)
   - Pastikan semua 4 secrets sudah di-set
   - Cek nama secrets harus exact match (case sensitive)

2. **Dependencies error**
   - Cek `package.json` di `apps/mobile`
   - Pastikan `npm ci` berhasil

3. **Gradle error**
   - Cek Android SDK setup
   - Pastikan Java 17 terinstall

4. **Keystore path error** (FIXED ✅)
   - Error: `file '.../app/app/release.keystore' which doesn't exist`
   - Cause: Relative path menyebabkan Gradle salah interpret
   - Fix: Gunakan absolute path `$(pwd)/app/release.keystore`
   - Status: ✅ Sudah diperbaiki dengan absolute path + verification

### APK Tidak Bisa Install

**Check:**
- APK signature (untuk release)
- Android version compatibility
- Previous version conflict (uninstall dulu)

### APK Menampilkan "Development Build"

**Issue:** APK mencari dev server, tidak langsung load WebView

**Fix:** 
- Pastikan `app.json` extra.webviewUrl sudah set
- Pastikan JavaScript bundle terbuat (cek build logs)
- Environment variable `EXPO_PUBLIC_WEBVIEW_URL` harus ter-set

## Perbedaan GitHub Actions vs EAS Cloud Build

### Kesamaan (Setelah Update)

✅ **Konfigurasi yang Sama:**
- WebView URL diinjeksi dari input/environment variable
- Node.js version 20 (sama dengan EAS)
- Bundle command menggunakan `expo export:embed`
- app.json diupdate sebelum prebuild (matching EAS behavior)
- JavaScript bundle di-embed ke APK assets

### Cara Kerja Build Process

**EAS Cloud Build:**
1. Baca environment variables dari `eas.json`
2. Update app.json dengan env vars
3. Run `eas build` yang handle semua proses
4. Bundle JS dan assets otomatis
5. Build APK dengan konfigurasi yang benar

**GitHub Actions Build (Updated):**
1. Baca input parameters dari workflow
2. **Update app.json dengan webviewUrl** (matching EAS)
3. Run `expo prebuild` untuk generate Android project
4. Build dengan Gradle (bundleCommand akan jalankan `expo export:embed`)
5. Verify bundle berhasil dibuat

### Key Fixes Applied

1. ✅ **app.json Update**: WebView URL sekarang diinjeksi ke app.json sebelum prebuild (sama seperti EAS)
2. ✅ **Node.js Version**: Update ke Node 20 (sama dengan EAS latest)
3. ✅ **Build Verification**: Tambah logging untuk verify bundle berhasil dibuat
4. ✅ **Constants.expoConfig**: Sekarang baca dari app.json yang sudah diupdate

### Hasil Build Sekarang Identik

Dengan perubahan ini, APK dari GitHub Actions akan:
- Load WebView URL yang sama dengan EAS build
- Punya konfigurasi app.json yang identik
- Bundle size yang sama
- Behavior yang sama persis dengan EAS cloud build

## Build Time

- **First build**: ~13 menit (download dependencies)
- **Subsequent builds**: ~5-8 menit (dengan cache)

## Tips

1. **Build debug dulu** untuk test, baru build release
2. **Monitor dari VS Code** untuk logging yang lebih mudah
3. **Check artifacts** setelah build selesai
4. **Update version** di `apps/mobile/app.json` untuk tracking

## Environment Variables

Workflow menggunakan environment variables berikut:

- `EXPO_PUBLIC_WEBVIEW_URL`: URL WebView untuk PWA (default: `https://morobooth.netlify.app`)
- `NODE_ENV`: `production` untuk production builds
- Keystore secrets (hanya untuk release)

## Version Update

Update version di `apps/mobile/app.json`:
```json
{
  "expo": {
    "version": "1.0.1"  // Update ini
  }
}
```

APK akan otomatis menggunakan version ini untuk naming.

## Build Notifications (NEW! ✨)

Workflow sekarang bisa mengirim notifikasi otomatis ketika build selesai!

### Setup Notifikasi

**Pilihan:**
1. **Telegram** - Mudah, gratis, push notification ke HP
2. **Discord** - Rich embeds di Discord channel
3. **Keduanya** - Setup semua untuk dapat notifikasi di 2 platform

**Notifikasi akan menampilkan:**
- ✅/❌ Status build (berhasil/gagal)
- 📱 App name, version, build type
- 📦 APK size
- 🌐 WebView URL
- 🔗 Link download atau error logs

### Quick Setup

**Telegram:**
1. Buat bot via [@BotFather](https://t.me/BotFather)
2. Dapatkan Chat ID
3. Set GitHub Variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

**Discord:**
1. Buat webhook di Discord channel
2. Set GitHub Variable:
   - `DISCORD_WEBHOOK_URL`

**📖 Dokumentasi lengkap:** Lihat file `NOTIFICATION_SETUP.md`

### Cara Kerja

- Notifikasi otomatis terkirim setelah build selesai
- Jika build berhasil → Notifikasi sukses dengan info APK
- Jika build gagal → Notifikasi error dengan link logs
- Tidak terkirim jika variables tidak di-set (optional)

## Support

- **Workflow file**: `.github/workflows/android-build.yml`
- **Build logs**: GitHub Actions → Workflow runs
- **Artifacts**: Tersimpan 30 hari
- **Notification setup**: `NOTIFICATION_SETUP.md`


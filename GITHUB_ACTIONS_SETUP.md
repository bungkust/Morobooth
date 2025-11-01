# Setup GitHub Actions untuk Build Android APK

## Prerequisites

1. **Repository GitHub**
   - Pastikan repository sudah di-push ke GitHub
   - Workflow file: `.github/workflows/android-build.yml`

2. **GitHub Actions Extension untuk VS Code** (Optional tapi recommended)
   - Install dari VS Code Marketplace
   - Sign in dengan GitHub account
   - Manage workflows langsung dari VS Code

## Setup GitHub Secrets

### Lokasi: Repository Settings → Secrets and variables → Actions → Repository secrets

Buka: `https://github.com/{username}/{repo}/settings/secrets/actions`

### Secrets yang harus di-set:

#### 1. EXPO_TOKEN (Required)
- **Value**: Expo access token untuk authentication
- **Cara mendapatkan**:
  1. Login ke https://expo.dev
  2. Buka: https://expo.dev/accounts/[your-account]/settings/access-tokens
  3. Klik "Create Token"
  4. Copy token dan paste ke GitHub Secret
- **Penting**: Token ini digunakan untuk authenticate dengan Expo/EAS untuk build

**Catatan**: Build sekarang menggunakan EAS (Expo Application Services) yang sama dengan Expo Cloud, jadi hasil build akan **100% identik** dengan build langsung di Expo Cloud.

## Workflow Configuration

### File: `.github/workflows/android-build.yml`

Workflow sudah dikonfigurasi untuk:
- ✅ Build menggunakan EAS (Expo Application Services) - **sama persis dengan Expo Cloud**
- ✅ Build profiles: `debug`, `preview`, `production` (dari `eas.json`)
- ✅ Auto naming dengan version + timestamp
- ✅ Upload artifact ke GitHub
- ✅ Custom WebView URL support (optional input)
- ✅ Menggunakan build infrastructure yang sama dengan Expo Cloud untuk hasil identik

### Workflow Inputs

Saat trigger workflow, Anda bisa set:

1. **Build type** (required)
   - `debug`: Build untuk testing
   - `preview`: Build untuk staging
   - `production`: Build untuk production/release
   - Semua profile menggunakan konfigurasi dari `apps/mobile/eas.json`

2. **WebView URL** (optional)
   - Default: Menggunakan dari `eas.json` profile
   - Bisa override untuk test dengan URL lain
   - Contoh: `https://staging-morobooth.netlify.app`

### Build Type Details

Semua build types menggunakan EAS profiles dari `eas.json`:

- **Debug**: 
  - Profile: `debug` dari `eas.json`
  - WebView URL: `https://morobooth.netlify.app`
  - Untuk testing dan development

- **Preview**: 
  - Profile: `preview` dari `eas.json`
  - WebView URL: `https://staging-morobooth.netlify.app`
  - Untuk staging/testing

- **Production**: 
  - Profile: `production` dari `eas.json`
  - WebView URL: `https://morobooth.netlify.app`
  - Untuk production/release
  - Signed dengan keystore dari EAS (otomatis)

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
1. **Missing EXPO_TOKEN secret**
   - Pastikan `EXPO_TOKEN` sudah di-set di GitHub Secrets
   - Token harus valid dan tidak expired
   - Dapatkan token dari: https://expo.dev/accounts/[your-account]/settings/access-tokens

2. **Build fails with authentication error**
   - Pastikan EXPO_TOKEN valid
   - Cek apakah project ID di `app.json` dan `eas.json` benar
   - Cek apakah user memiliki akses ke project

3. **Dependencies error**
   - Cek `package.json` di `apps/mobile`
   - Pastikan `npm ci` berhasil

4. **Build timeout**
   - EAS Cloud builds biasanya memakan waktu 10-20 menit
   - Pastikan workflow tidak timeout (default timeout cukup)

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

## Build Time

- **EAS Cloud builds**: ~10-20 menit (tergantung traffic)
- Build dilakukan di Expo Cloud infrastructure (sama dengan build langsung di Expo)
- Build time lebih konsisten karena menggunakan dedicated build servers

## Tips

1. **Build debug dulu** untuk test, baru build production
2. **Monitor dari VS Code** untuk logging yang lebih mudah
3. **Check artifacts** setelah build selesai
4. **Update version** di `apps/mobile/app.json` untuk tracking
5. **Hasil build identik** dengan build langsung di Expo Cloud karena menggunakan infrastructure yang sama
6. **Cek EAS dashboard** untuk detail build: https://expo.dev

## Environment Variables

Workflow menggunakan environment variables dari `eas.json` profiles:

- `EXPO_PUBLIC_WEBVIEW_URL`: URL WebView untuk PWA (default dari profile di `eas.json`)
- Environment variables bisa di-override via workflow input `webviewUrl`
- Semua environment variables dikonfigurasi di `apps/mobile/eas.json` per profile

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

## Support

- **Workflow file**: `.github/workflows/android-build.yml`
- **Build logs**: GitHub Actions → Workflow runs
- **Artifacts**: Tersimpan 30 hari


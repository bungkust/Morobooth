# Cara Build Release APK yang Benar

## ? Masalah: Error Metro Bundler

Jika Anda melihat error seperti ini:
```
Could not connect to development server
Unable to load script. Make sure you're either running Metro...
```

**Penyebab:** Anda sedang menggunakan **DEBUG APK** yang membutuhkan Metro bundler.

## ? Solusi: Build RELEASE APK

Release APK sudah include semua JavaScript bundle, tidak butuh Metro bundler.

---

## ?? Cara Build Release APK via GitHub Actions

### Step 1: Setup GitHub Secrets (WAJIB untuk Release)

Buka: `https://github.com/{username}/{repo}/settings/secrets/actions`

**Tambahkan 4 secrets berikut:**

#### 1. ANDROID_KEYSTORE_BASE64
```bash
# Convert keystore ke base64
base64 -i apps/mobile/android/app/release.keystore | pbcopy  # macOS
# atau
base64 -i apps/mobile/android/app/release.keystore           # Linux

# Paste hasilnya ke secret
```

#### 2. ANDROID_KEYSTORE_PASSWORD
Contoh: `your-keystore-password-here`

#### 3. ANDROID_KEY_ALIAS  
Contoh: `your-key-alias`

#### 4. ANDROID_KEY_ALIAS_PASSWORD
Contoh: `your-key-password`

> **PENTING:** Secrets ini WAJIB untuk build release. Tanpa ini, build akan gagal!

---

### Step 2: Trigger Release Build

#### Via GitHub Web:

1. Buka repository di GitHub
2. Klik tab **"Actions"**
3. Pilih workflow **"Android APK Build"**
4. Klik **"Run workflow"** (tombol hijau)
5. Isi parameter:
   - **Branch:** `main` (atau branch yang Anda inginkan)
   - **Build type:** **`release`** ?? PILIH RELEASE, BUKAN DEBUG!
   - **WebView URL:** `https://morobooth.netlify.app` (atau kosongkan)
6. Klik **"Run workflow"**
7. Tunggu ~10-15 menit
8. Download APK dari **Artifacts** setelah selesai

#### Via VS Code (dengan GitHub Actions Extension):

1. Install extension "GitHub Actions" dari VS Code Marketplace
2. Login dengan GitHub account
3. Buka sidebar GitHub Actions
4. Cari workflow "Android APK Build"
5. Klik kanan ? "Run Workflow"
6. Pilih:
   - Branch: `main`
   - **buildType: `release`** ??
   - webviewUrl: (kosongkan untuk default)
7. Monitor progress di VS Code
8. Download artifact setelah selesai

---

## ?? Cara Verify Build Berhasil

### 1. Check Build Logs

Cari pesan sukses berikut di logs:

```
? Keystore created successfully
   Location: /home/runner/work/.../app/release.keystore
   Size: 2.0K

? JavaScript bundle created successfully
   Bundle size: 2.3M
   Bundle contains app.json configuration with webviewUrl

BUILD SUCCESSFUL in 8m 23s
```

### 2. Download APK

Setelah build selesai:
1. Scroll ke bawah di workflow run page
2. Section **"Artifacts"**
3. Download: `morobooth-v1.0.0-release-{timestamp}.apk`

### 3. Install dan Test

```bash
# Install via adb
adb install morobooth-v1.0.0-release-{timestamp}.apk

# Atau langsung transfer ke HP dan install
```

**APK Release akan:**
- ? Langsung load WebView (tidak perlu Metro)
- ? Tidak ada error "Could not connect to development server"
- ? Siap untuk production/distribusi
- ? Signed dengan release keystore

---

## ?? Perbedaan Debug vs Release

### Debug APK
- ? Butuh Metro bundler running
- ? Tidak bisa digunakan tanpa dev server
- ? Untuk development/testing dengan hot reload
- ? Tidak perlu secrets
- ? Build cepat (~5-8 menit)

### Release APK  
- ? JavaScript bundle sudah embedded
- ? Bisa digunakan standalone tanpa dev server
- ? Untuk production/distribusi
- ?? Perlu 4 secrets untuk signing
- ?? Build ~10-15 menit

---

## ?? Common Issues

### 1. Build Gagal: "Secret not found"
**Problem:** Secrets belum di-set  
**Solution:** Set semua 4 secrets di GitHub (lihat Step 1)

### 2. Build Gagal: "Keystore not found"
**Problem:** ANDROID_KEYSTORE_BASE64 salah atau corrupt  
**Solution:** Generate ulang base64 dari keystore yang valid

### 3. APK Tidak Bisa Install
**Problem:** Signature conflict dengan versi sebelumnya  
**Solution:** Uninstall APK lama dulu, baru install yang baru

### 4. APK Masih Muncul Error Metro
**Problem:** Build type masih **debug**, bukan **release**  
**Solution:** Ulangi build dengan **buildType: release**

---

## ?? Quick Command Reference

### Generate Base64 dari Keystore
```bash
# macOS
base64 -i path/to/release.keystore | pbcopy

# Linux
base64 -i path/to/release.keystore

# Windows (Git Bash)
base64 -w 0 path/to/release.keystore | clip
```

### Install APK via ADB
```bash
# Check devices
adb devices

# Install APK
adb install -r path/to/app.apk

# If multiple devices
adb -s DEVICE_ID install -r path/to/app.apk
```

### Uninstall Old APK
```bash
adb uninstall com.bungkust.morobooth
```

### Check APK Info
```bash
# Android package name
aapt dump badging app.apk | grep package

# Signing info
apksigner verify --print-certs app.apk
```

---

## ?? More Information

- **Full workflow documentation:** `GITHUB_ACTIONS_SETUP.md`
- **Build comparison (GitHub vs EAS):** `BUILD_COMPARISON_FIX.md`
- **Troubleshooting guide:** `COMPLETE_FIX_SUMMARY.md`

---

## ? Summary

1. **Error Metro Bundler** = Anda pakai debug APK
2. **Solusi** = Build **release APK** via GitHub Actions
3. **Requirements** = Setup 4 secrets di GitHub
4. **Trigger** = Actions ? Run workflow ? **buildType: release**
5. **Result** = APK yang bisa langsung dipakai tanpa Metro

**Sekali lagi: PILIH `release`, BUKAN `debug`!** ??

---

**Last updated:** 2025-11-01  
**Status:** ? Ready to use

# ?? Fix Error Metro Bundler - SOLUSI LENGKAP

## ? Error yang Anda Alami

Berdasarkan screenshot yang Anda kirim:

```
Could not connect to development server.

Unable to load script. Make sure you're either running Metro 
(run 'npx react-native start') or that your bundle 
'index.android.bundle' is packaged correctly for release.
```

## ?? Root Cause

**Anda sedang menggunakan DEBUG APK yang membutuhkan Metro bundler!**

### Debug vs Release APK

| Type | Metro Bundler | JavaScript Bundle | Use Case |
|------|---------------|-------------------|----------|
| **Debug** | ? Required (must be running) | Not included | Development only |
| **Release** | ? Not needed | ? Embedded in APK | Production ready |

## ? SOLUSI: Build Release APK

Anda perlu build **RELEASE APK**, bukan debug APK.

---

## ?? Step-by-Step Solution

### Step 1: Setup GitHub Secrets (One-time only)

Release APK butuh 4 secrets untuk signing. Setup ini cukup sekali saja.

1. Buka: `https://github.com/{your-username}/{your-repo}/settings/secrets/actions`

2. Klik **"New repository secret"** untuk masing-masing secret:

#### Secret 1: ANDROID_KEYSTORE_BASE64
```bash
# Generate dari keystore file Anda
base64 -i apps/mobile/android/app/release.keystore

# Copy output dan paste sebagai secret value
```

#### Secret 2: ANDROID_KEYSTORE_PASSWORD
```
Contoh: mySecurePassword123
```

#### Secret 3: ANDROID_KEY_ALIAS
```
Contoh: myKeyAlias
```

#### Secret 4: ANDROID_KEY_ALIAS_PASSWORD
```
Contoh: myAliasPassword456
```

> ?? **PENTING:** Tanpa 4 secrets ini, release build akan GAGAL!

---

### Step 2: Trigger Release Build

#### Via GitHub Web:

1. Buka repository Anda di GitHub
2. Klik tab **"Actions"**
3. Pilih workflow **"Android APK Build"**
4. Klik tombol hijau **"Run workflow"**
5. Isi form:
   ```
   Branch: main (atau branch Anda)
   Build type: release  ?? PILIH RELEASE!
   WebView URL: https://morobooth.netlify.app (atau kosongkan)
   ```
6. Klik **"Run workflow"**
7. Tunggu ~10-15 menit

---

### Step 3: Download APK

Setelah build selesai (status ? hijau):

1. Scroll ke bawah di workflow run page
2. Lihat section **"Artifacts"**
3. Download file: `morobooth-v1.0.0-release-{timestamp}.apk`

---

### Step 4: Install APK

#### Via USB (ADB):
```bash
# Check device connected
adb devices

# Install APK
adb install -r morobooth-v1.0.0-release-{timestamp}.apk
```

#### Via Transfer:
1. Transfer APK ke HP via email/drive/etc
2. Buka APK di HP
3. Allow "Install from unknown sources" jika diminta
4. Install

---

### Step 5: Test

Buka app, seharusnya:
- ? Langsung load WebView (tidak ada error)
- ? Tidak ada "Could not connect to development server"
- ? Tidak ada "Unable to load script"
- ? App langsung bisa digunakan

---

## ?? Verify Build Berhasil

### Check di Build Logs

Cari tanda-tanda ini di logs (klik workflow run ? job ? expand steps):

```
? Keystore created successfully
   Location: /home/runner/work/.../app/release.keystore
   Size: 2.0K

? JavaScript bundle created successfully
   Bundle size: 2.3M

BUILD SUCCESSFUL in 8m 23s
```

### Check APK Downloaded

```bash
# Check package name
aapt dump badging morobooth-*.apk | grep package

# Should show:
package: name='com.bungkust.morobooth' versionCode='1' versionName='1.0.0'
```

---

## ?? Troubleshooting

### 1. Build Gagal: "Secret not found"
**Problem:** Secrets belum di-set  
**Solution:** Set semua 4 secrets (lihat Step 1)

### 2. Build Gagal: "Keystore verification failed"  
**Problem:** ANDROID_KEYSTORE_BASE64 salah atau corrupt  
**Solution:** 
```bash
# Re-generate base64 dengan benar
base64 -i path/to/release.keystore | pbcopy  # macOS
base64 -i path/to/release.keystore           # Linux

# Update secret dengan nilai baru
```

### 3. APK Masih Error Metro Bundler
**Problem:** Build type masih DEBUG, bukan RELEASE  
**Solution:** Ulangi Step 2, pastikan pilih **buildType: release**

### 4. APK Tidak Bisa Install
**Problem:** Signature conflict dengan APK lama  
**Solution:**
```bash
# Uninstall APK lama dulu
adb uninstall com.bungkust.morobooth

# Atau uninstall manual dari HP
# Settings ? Apps ? Morobooth ? Uninstall

# Baru install APK baru
adb install -r morobooth-*.apk
```

### 5. APK Install Tapi Crash
**Problem:** Mungkin ada error di app code  
**Solution:** Check logs:
```bash
# Real-time logs
adb logcat | grep -i morobooth

# Atau check di Chrome DevTools
chrome://inspect/#devices
```

---

## ?? Dokumentasi Lengkap

Untuk informasi lebih detail, lihat:

- **`HOW_TO_BUILD_RELEASE_APK.md`** - Panduan lengkap build release
- **`GITHUB_ACTIONS_SETUP.md`** - Setup GitHub Actions
- **`README.md`** - Project overview

---

## ?? Expected Result

Setelah install Release APK:

? App langsung load WebView  
? Tidak ada error Metro bundler  
? Tidak butuh dev server  
? Siap untuk production  
? Bisa print ke thermal printer  

---

## ?? Quick Reference

### Build Command (GitHub Actions)
```
Actions ? Run workflow
  Branch: main
  Build type: release  ??
  WebView URL: (kosongkan untuk default)
```

### Install Command
```bash
adb install -r morobooth-v1.0.0-release-{timestamp}.apk
```

### Uninstall Command
```bash
adb uninstall com.bungkust.morobooth
```

### Check Logs
```bash
adb logcat | grep -E "(morobooth|ReactNative|Expo)"
```

---

## ?? Key Points

1. ? **DEBUG APK** = Butuh Metro ? Error yang Anda lihat
2. ? **RELEASE APK** = Standalone ? Tidak ada error
3. ?? **PENTING:** Setup 4 secrets dulu sebelum build release
4. ?? **Install:** Uninstall APK lama sebelum install baru

---

## ? Summary

**Error Anda:** Metro bundler connection error  
**Root Cause:** Menggunakan debug APK  
**Solution:** Build release APK via GitHub Actions  
**Steps:**
1. Setup 4 secrets (one-time)
2. Trigger release build (buildType: release)
3. Download APK dari artifacts
4. Install ke HP

**Result:** App akan langsung work tanpa error! ?

---

**Created:** 2025-11-01  
**Status:** ? Ready to follow

**Ikuti steps di atas dan error Anda akan hilang!** ??

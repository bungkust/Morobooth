# Perbaikan Error GitHub Actions Build

## Masalah yang Sudah Diperbaiki

### 1. ? Workflow Duplicate Dihapus
- **Masalah**: Ada workflow duplicate di `apps/web/.github/workflows/android-build.yml`
- **Solusi**: Workflow duplicate sudah dihapus
- **Impact**: Menghindari kebingungan dan konflik

### 2. ? Workflow Utama Sudah Terverifikasi
- Workflow di `.github/workflows/android-build.yml` sudah lengkap dan benar
- Semua path sudah benar
- Absolute path untuk keystore sudah digunakan
- Node.js version 20 sudah di-set

## Kemungkinan Error dan Solusinya

### Error 1: Missing Secrets (Release Build)

**Gejala:**
```
Error: ANDROID_KEYSTORE_BASE64 is not set
```

**Solusi:**
1. Buka: `https://github.com/{username}/{repo}/settings/secrets/actions`
2. Pastikan semua secrets berikut sudah di-set:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_ALIAS_PASSWORD`

**Catatan:** Untuk debug build, secrets tidak diperlukan.

---

### Error 2: APK File Not Found

**Gejala:**
```
? APK file not found!
```

**Kemungkinan Penyebab:**
1. Build gagal sebelum APK dibuat
2. Path ke APK salah
3. Gradle build error

**Solusi:**
1. Cek build logs untuk melihat di step mana build gagal
2. Verifikasi Gradle build berhasil dengan melihat log:
   ```
   BUILD SUCCESSFUL
   ```
3. Jika Gradle gagal, cek error message di log

---

### Error 3: Keystore Path Error

**Gejala:**
```
ERROR: file '.../app/app/release.keystore' which doesn't exist
```

**Status:** ? Sudah diperbaiki dengan absolute path

**Verifikasi:** Workflow sekarang menggunakan:
```bash
KEYSTORE_PATH="$(pwd)/app/release.keystore"
```

---

### Error 4: Dependencies Error

**Gejala:**
```
npm ERR! Could not resolve dependency
npm ERR! Cannot find module
```

**Solusi:**
1. Cek `apps/mobile/package.json` valid
2. Pastikan `package-lock.json` ada dan up-to-date
3. Clear cache dan retry:
   - GitHub Actions akan auto-clear cache jika dependency path berubah

---

### Error 5: Android SDK / Gradle Error

**Gejala:**
```
SDK location not found
Gradle build failed
```

**Solusi:**
1. Workflow sudah menggunakan `android-actions/setup-android@v3`
2. Java 17 sudah di-setup dengan `setup-java@v4`
3. Jika masih error, cek:
   - Android SDK versions di `app.json` (compileSdkVersion, targetSdkVersion)
   - Gradle wrapper version

---

### Error 6: Prebuild Error

**Gejala:**
```
Error running expo prebuild
```

**Kemungkinan Penyebab:**
1. `app.json` tidak valid
2. Missing dependencies
3. Expo version mismatch

**Solusi:**
1. Verifikasi `apps/mobile/app.json` valid JSON
2. Pastikan semua dependencies terinstall (`npm ci` berhasil)
3. Cek Expo version di `package.json`

---

### Error 7: Bundle Not Created

**Gejala:**
```
?? JavaScript bundle not found
```

**Kemungkinan Penyebab:**
1. `expo export:embed` gagal
2. Assets directory tidak ada

**Solusi:**
1. Workflow sudah ada step "Ensure assets directory exists"
2. Cek log untuk `expo export:embed` output
3. Verifikasi `build.gradle` memiliki bundleCommand yang benar

---

## Checklist Troubleshooting

Jika build masih gagal, ikuti checklist ini:

### Step 1: Cek Build Logs
- [ ] Buka GitHub Actions ? Workflow runs ? Latest run
- [ ] Lihat di step mana build gagal
- [ ] Copy error message lengkap

### Step 2: Verifikasi Konfigurasi
- [ ] `apps/mobile/app.json` valid
- [ ] `apps/mobile/package.json` valid
- [ ] Semua secrets ter-set (untuk release build)

### Step 3: Verifikasi Workflow
- [ ] Workflow file: `.github/workflows/android-build.yml` ada
- [ ] Tidak ada workflow duplicate
- [ ] Path ke `apps/mobile` benar

### Step 4: Test Build Type
- [ ] Coba build debug dulu (tidak perlu secrets)
- [ ] Jika debug berhasil, coba release
- [ ] Bandingkan error message

---

## Langkah Debugging

### 1. Enable Verbose Logging

Workflow sudah menggunakan `--info` flag untuk Gradle, tapi bisa tambahkan lebih banyak logging jika perlu:

```yaml
- name: Debug - List files
  working-directory: ./apps/mobile
  run: |
    echo "Current directory: $(pwd)"
    echo "Files in apps/mobile:"
    ls -la
    echo "Files in android (if exists):"
    ls -la android/ 2>/dev/null || echo "android/ not found yet"
```

### 2. Test Locally

Sebelum commit, test workflow logic secara lokal:

```bash
cd apps/mobile

# Test app.json update
export WEBVIEW_URL="https://morobooth.netlify.app"
node -e "
  const fs = require('fs');
  const config = require('./app.json');
  if (!config.expo.extra) config.expo.extra = {};
  config.expo.extra.webviewUrl = process.env.WEBVIEW_URL;
  fs.writeFileSync('./app.json', JSON.stringify(config, null, 2));
  console.log('Updated:', config.expo.extra.webviewUrl);
"

# Test prebuild (optional, but slow)
# npx expo prebuild --platform android --clean
```

### 3. Check Common Issues

- [ ] Node version: harus 20 (sudah di-set)
- [ ] Java version: harus 17 (sudah di-set)
- [ ] Working directory: semua step sudah benar
- [ ] Path resolution: absolute path untuk keystore

---

## Status Perbaikan

| Item | Status | Notes |
|------|--------|-------|
| Workflow duplicate | ? Fixed | Dihapus |
| Keystore path | ? Fixed | Menggunakan absolute path |
| app.json update | ? Fixed | Update sebelum prebuild |
| Node.js version | ? Fixed | Version 20 |
| Error handling | ? Fixed | Fail-fast dengan clear messages |
| Logging | ? Fixed | Enhanced logging di setiap step |
| Documentation | ? Fixed | Comprehensive docs |

---

## Jika Masih Error

Jika build masih gagal setelah semua perbaikan ini:

1. **Share error message lengkap** dari GitHub Actions logs
2. **Share step yang gagal** (nama step dan error message)
3. **Cek apakah error konsisten** atau intermittent
4. **Coba build debug dulu** untuk isolate masalah

### Format Error Report

```
Build Type: [debug/release]
Failed Step: [nama step]
Error Message: [copy dari logs]
Full Log: [link ke GitHub Actions run]
```

---

## Quick Fixes

### Fix 1: Retry Build
Kadang error bersifat transient (network, cache, dll). Coba retry build.

### Fix 2: Clear Cache
Jika ada dependency error, workflow akan auto-clear cache karena dependency path sudah benar.

### Fix 3: Check Secrets
Untuk release build, pastikan semua 4 secrets ter-set dan nama exact match (case sensitive).

### Fix 4: Update Dependencies
Jika ada dependency conflicts, update `package.json` dan commit `package-lock.json`.

---

## Support

- **Workflow file**: `.github/workflows/android-build.yml`
- **Setup guide**: `GITHUB_ACTIONS_SETUP.md`
- **Build comparison**: `BUILD_COMPARISON_FIX.md`
- **Complete fix summary**: `COMPLETE_FIX_SUMMARY.md`

---

**Last Updated:** 2025-01-31
**Status:** ? Workflow sudah optimal dan siap digunakan

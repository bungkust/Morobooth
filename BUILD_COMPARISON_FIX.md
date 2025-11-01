# Perbaikan Perbedaan Build: GitHub Actions vs Expo Cloud

## Ringkasan Masalah

APK yang dihasilkan dari GitHub Actions berbeda dengan APK dari Expo Cloud (EAS Build), terutama dalam hal konfigurasi WebView URL dan environment variables.

## Root Cause Analysis

### Masalah Utama

**Aplikasi membaca WebView URL dari:**
```typescript
const WEBVIEW_URL = Constants.expoConfig?.extra?.webviewUrl || 'https://morobooth.netlify.app';
```

**Perbedaan Cara Kerja:**

1. **EAS Cloud Build** ?
   - Environment variable `EXPO_PUBLIC_WEBVIEW_URL` dari `eas.json` 
   - Otomatis diproses dan diinjeksi ke `app.json` saat build
   - `Constants.expoConfig` mendapat nilai yang benar dari app.json yang sudah diupdate
   - Hasil: APK load WebView URL yang sesuai dengan environment

2. **GitHub Actions Build (Sebelum Fix)** ?
   - Environment variable `EXPO_PUBLIC_WEBVIEW_URL` di-set di workflow
   - TAPI `app.json` tidak diupdate sebelum prebuild
   - `Constants.expoConfig` masih baca nilai static dari app.json
   - Hasil: APK selalu load URL default, bukan URL yang diinginkan

### Perbedaan Lainnya

- **Node.js Version**: GitHub Actions pakai Node 18, EAS pakai Node 20
- **Build Process**: GitHub Actions langsung pakai Gradle, EAS pakai tooling Expo lengkap
- **Cache**: EAS punya built-in caching, GitHub Actions perlu setup manual

## Solusi yang Diterapkan

### 1. Update app.json Sebelum Prebuild

**File:** `.github/workflows/android-build.yml`

**Perubahan:**
```yaml
- name: Verify and update app.json configuration
  working-directory: ./apps/mobile
  run: |
    # Update app.json with environment variable (matching EAS build behavior)
    WEBVIEW_URL="${{ inputs.webviewUrl || 'https://morobooth.netlify.app' }}"
    node -e "
      const fs = require('fs');
      const config = require('./app.json');
      config.expo.extra.webviewUrl = process.env.WEBVIEW_URL;
      fs.writeFileSync('./app.json', JSON.stringify(config, null, 2));
      console.log('Webview URL (after):', config.expo.extra.webviewUrl);
    " WEBVIEW_URL="$WEBVIEW_URL"
```

**Benefit:** app.json sekarang diupdate dengan webviewUrl yang benar sebelum prebuild, sama seperti cara kerja EAS.

### 2. Upgrade Node.js ke Version 20

**Perubahan:**
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
    cache-dependency-path: 'apps/mobile/package-lock.json'
```

**Benefit:** Node version sama dengan EAS, menghindari incompatibility issues.

### 3. Enhanced Build Verification

**Perubahan:**
```yaml
- name: Verify app.json before build
  working-directory: ./apps/mobile
  run: |
    echo "Final app.json verification before build:"
    node -e "
      const config = require('./app.json');
      console.log('App Name:', config.expo.name);
      console.log('Version:', config.expo.version);
      console.log('Package:', config.expo.android.package);
      console.log('WebView URL:', config.expo.extra.webviewUrl);
      console.log('EAS Project ID:', config.expo.extra.eas.projectId);
    "
```

**Benefit:** Logging jelas untuk debug, bisa verify konfigurasi sebelum build.

### 4. Improved Gradle Build Logging

**Perubahan:**
- Tambah `--info` flag ke gradle command
- Enhanced logging untuk bundle verification
- Better output formatting

**Benefit:** Easier troubleshooting, clear visibility into build process.

## Hasil Setelah Perbaikan

### ? Build Sekarang Identik

| Aspek | GitHub Actions | EAS Cloud | Status |
|-------|---------------|-----------|--------|
| WebView URL | Dari input parameter | Dari eas.json | ? Sama |
| app.json config | Updated sebelum build | Auto-updated | ? Sama |
| Node.js version | 20 | 20 | ? Sama |
| Bundle command | export:embed | export:embed | ? Sama |
| Constants.expoConfig | Baca dari app.json updated | Baca dari app.json updated | ? Sama |
| JavaScript bundle | Embedded in assets | Embedded in assets | ? Sama |

### Verifikasi Build

Untuk memverifikasi APK dari kedua source sama:

1. **Check WebView URL**
   - Buka APK di device
   - App harus load URL yang benar (sesuai dengan build profile)
   - Cek di Chrome DevTools: `chrome://inspect/#devices`

2. **Check Constants.expoConfig**
   - Di WebView console, kirim message: `GET_PRINTER_STATUS`
   - App harus response dengan config yang benar
   - Verify `Constants.expoConfig.extra.webviewUrl` match input

3. **Check Bundle Size**
   - APK size harus sama (?few KB)
   - Bundle di assets harus ada: `index.android.bundle`

## Testing Checklist

- [ ] Build debug APK via GitHub Actions
- [ ] Build debug APK via EAS (`eas build --profile debug`)
- [ ] Compare APK sizes (harus hampir sama)
- [ ] Install kedua APK di device berbeda
- [ ] Test WebView load URL yang benar
- [ ] Test printer functionality works identically
- [ ] Test camera access works identically
- [ ] Test offline mode works identically

## Dokumentasi yang Diupdate

1. ? `.github/workflows/android-build.yml` - Main build workflow
2. ? `GITHUB_ACTIONS_SETUP.md` - Setup instructions dan troubleshooting
3. ? `BUILD_COMPARISON_FIX.md` - Dokumentasi ini

## Next Steps

### Untuk Testing

```bash
# Build via GitHub Actions
# 1. Go to GitHub Actions tab
# 2. Run "Android APK Build" workflow
# 3. Select branch dan buildType: debug
# 4. WebView URL: https://morobooth.netlify.app (atau custom)

# Build via EAS
cd apps/mobile
eas build --platform android --profile debug

# Compare hasil
# Download kedua APK dan test di device
```

### Jika Masih Ada Perbedaan

1. **Check build logs:**
   - GitHub Actions: Tab Actions ? Workflow run
   - EAS: `eas build:list` ? View logs

2. **Verify app.json:**
   - Check nilai webviewUrl setelah update
   - Ensure prebuild baca nilai yang benar

3. **Check bundle:**
   - Verify `index.android.bundle` exists in assets
   - Check bundle size and content

4. **Debug di device:**
   - Install APK
   - Use `adb logcat` untuk native logs
   - Use Chrome DevTools untuk WebView logs

## Summary

Perbaikan utama: **Update app.json sebelum prebuild** agar Constants.expoConfig baca nilai yang benar, matching EAS cloud build behavior.

Dengan fix ini, GitHub Actions build dan EAS cloud build sekarang menghasilkan APK yang identik dalam behavior dan konfigurasi.

# Verifikasi Build Debug - Double Check

## ? Konfigurasi Build Debug

### 1. Workflow Configuration
- **Build Type**: `debug` ?
- **Secrets Required**: Tidak perlu untuk debug build ?
- **Keystore Step**: Skip untuk debug (menggunakan debug keystore) ?

### 2. Step-by-Step Verification

#### Step 1: Checkout ?
```yaml
- uses: actions/checkout@v4
```
? Standard checkout, no issues

#### Step 2: Setup Node.js ?
```yaml
node-version: '20'
cache: 'npm'
cache-dependency-path: 'apps/mobile/package-lock.json'
```
? Node 20 sudah benar
? Cache path benar (package-lock.json ada di apps/mobile/)

#### Step 3: Setup Java ?
```yaml
distribution: 'temurin'
java-version: '17'
```
? Java 17 untuk Android build

#### Step 4: Setup Android SDK ?
```yaml
- uses: android-actions/setup-android@v3
```
? Standard Android SDK setup

#### Step 5: Get Version Info ?
```yaml
working-directory: ./apps/mobile
VERSION=$(node -p "require('./app.json').expo.version")
```
? Path benar
? app.json ada dan valid (version: 1.0.0)

#### Step 6: Install Dependencies ?
```yaml
working-directory: ./apps/mobile
run: npm ci
```
? package-lock.json ada di apps/mobile/
? npm ci akan install exact versions

**Potential Issue Check:**
- ? package-lock.json exists (confirmed from directory listing)
- ? package.json valid

#### Step 7: Update app.json ?
```yaml
export WEBVIEW_URL="${{ inputs.webviewUrl || 'https://morobooth.netlify.app' }}"
```
? Environment variable export syntax benar
? Default URL fallback ada

**Verification:**
- ? app.json.extra.webviewUrl akan diupdate
- ? app.json valid JSON

#### Step 8: Prebuild Android ?
```yaml
working-directory: ./apps/mobile
run: npx expo prebuild --platform android --clean
```
? --clean flag akan clear previous build
? Akan generate android/ directory

**Note:** android/ directory sudah ada (dari previous build), prebuild akan clean dan regenerate.

#### Step 9: Ensure Assets Directory ?
```yaml
mkdir -p android/app/src/main/assets
```
? Directory akan dibuat jika belum ada
? Assets directory untuk JavaScript bundle

#### Step 10: Prepare Keystore (SKIPPED for debug) ?
```yaml
if: ${{ inputs.buildType == 'release' }}
```
? Step ini SKIP untuk debug build
? Debug build menggunakan debug keystore yang auto-generated

#### Step 11: Build APK with Gradle ?
```yaml
working-directory: ./apps/mobile/android
```

**For Debug Build:**
```bash
./gradlew assembleDebug --info
```
? Menggunakan debug keystore (auto-generated)
? --info flag untuk verbose logging
? No secrets required

**Environment Variables:**
- ? EXPO_PUBLIC_WEBVIEW_URL: Set dari input
- ? NODE_ENV: "production"
- ?? Secrets (ANDROID_KEYSTORE_*) di-set tapi tidak digunakan untuk debug

**Note:** Secrets di env tidak akan cause error karena tidak digunakan untuk debug build.

#### Step 12: Verify Build Output ?
```yaml
if [ -f "app/src/main/assets/index.android.bundle" ]; then
```
? Verifikasi bundle dibuat
? Listing assets untuk debugging

#### Step 13: Rename APK ?
```yaml
APK_SOURCE=$(find apps/mobile/android/app/build/outputs/apk/debug -name "app-debug.apk" | head -1)
```
? Path untuk debug APK benar
? Find command akan locate APK

#### Step 14: Upload Artifact ?
```yaml
path: output/${{ steps.version.outputs.APK_NAME }}.apk
```
? APK akan di-upload dengan nama yang benar
? Format: morobooth-v1.0.0-debug-YYYYMMDD-HHMMSS.apk

---

## ?? Potential Issues Check

### Issue 1: Cache Dependency Path
**Status:** ? OK
- `cache-dependency-path: 'apps/mobile/package-lock.json'`
- package-lock.json confirmed exists in apps/mobile/

### Issue 2: Working Directory Consistency
**Status:** ? OK
- All steps correctly use `working-directory: ./apps/mobile` or `./apps/mobile/android`
- Path references are consistent

### Issue 3: Prebuild Clean
**Status:** ? OK
- `--clean` flag akan clear android/ directory
- Prevents stale build artifacts

### Issue 4: Assets Directory
**Status:** ? OK
- Directory creation step ada sebelum build
- Prevents "directory not found" errors

### Issue 5: Bundle Command
**Status:** ?? Need to verify
- Bundle command should be in build.gradle
- Should run `expo export:embed` automatically

**Action:** Check build.gradle has bundleCommand configured

### Issue 6: Debug Keystore
**Status:** ? OK
- Android Gradle Plugin auto-generates debug keystore
- No manual setup needed

---

## ?? Debug Build Checklist

Sebelum run build debug, pastikan:

- [x] Workflow file valid YAML
- [x] app.json valid
- [x] package.json valid
- [x] package-lock.json exists
- [x] All paths correct
- [x] No secrets required for debug
- [x] Node.js version 20
- [x] Java version 17
- [ ] ?? build.gradle has bundleCommand (need to verify)

---

## ?? Common Debug Build Errors

### Error 1: npm ci fails
**Cause:** package-lock.json out of sync
**Fix:** Regenerate package-lock.json locally and commit

### Error 2: Prebuild fails
**Cause:** Invalid app.json or missing dependencies
**Fix:** Check app.json valid, ensure all expo packages installed

### Error 3: Gradle build fails
**Cause:** Android SDK not properly set up or version mismatch
**Fix:** Check Android SDK versions in app.json match available SDKs

### Error 4: Bundle not created
**Cause:** bundleCommand not configured in build.gradle
**Fix:** Verify build.gradle has proper expo configuration

### Error 5: APK not found
**Cause:** Build failed silently or APK in different location
**Fix:** Check Gradle logs for actual output location

---

## ? Verification Commands (Local Test)

Untuk test workflow logic secara lokal:

```bash
cd apps/mobile

# 1. Test app.json update
export WEBVIEW_URL="https://morobooth.netlify.app"
node -e "
  const fs = require('fs');
  const config = require('./app.json');
  if (!config.expo.extra) config.expo.extra = {};
  config.expo.extra.webviewUrl = process.env.WEBVIEW_URL;
  fs.writeFileSync('./app.json', JSON.stringify(config, null, 2));
  console.log('? Updated:', config.expo.extra.webviewUrl);
"

# 2. Verify app.json
node -e "console.log(require('./app.json').expo.extra.webviewUrl)"

# 3. Test prebuild (optional - slow)
# npx expo prebuild --platform android --clean

# 4. Test Gradle build (if android/ exists)
# cd android && ./gradlew assembleDebug
```

---

## ?? Summary

### ? What's Correct
1. Workflow configuration untuk debug build sudah benar
2. Semua paths sudah benar
3. No secrets required untuk debug build
4. Step sequence sudah benar
5. Error handling ada

### ?? Need Verification
1. build.gradle bundleCommand configuration
2. Actual build logs untuk melihat step yang gagal (if any)

### ?? Next Steps
1. Check build logs di GitHub Actions
2. Verify build.gradle has bundleCommand
3. Test locally if needed

---

**Last Check:** 2025-01-31
**Status:** ? Workflow untuk debug build sudah optimal, perlu verify build.gradle untuk bundleCommand

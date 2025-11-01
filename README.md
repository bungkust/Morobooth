# Morobooth - Photo Booth Application

Photo booth application with PWA web app and React Native mobile wrapper for thermal printing.

## ?? Project Structure

```
morobooth/
??? apps/
?   ??? mobile/          # React Native/Expo mobile app
?   ??? web/             # (optional web configs)
??? src/                 # Web PWA source code
??? dist/                # Web build output
??? .github/workflows/   # CI/CD configurations
```

## ?? Web PWA (Main App)

The main photo booth application is a Progressive Web App (PWA) built with React + TypeScript + Vite.

### Development
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Deploy
The web app is automatically deployed to Netlify:
- **Production:** https://morobooth.netlify.app

## ?? Mobile App (Thermal Printing)

React Native wrapper that loads the PWA in a WebView and provides native Bluetooth printing capabilities.

### Location
```
apps/mobile/
```

### Features
- WebView loads the PWA
- Native Bluetooth Low Energy (BLE) printer support
- Auto-reconnect to last used printer
- Offline mode support

### Build Options

#### Option 1: GitHub Actions (Recommended)
Build APK via GitHub Actions without needing local Android setup.

**?? IMPORTANT: Build RELEASE APK, not DEBUG!**

**Debug APK** = Needs Metro bundler (will show connection errors)  
**Release APK** = Standalone, ready to use

?? **See:** `HOW_TO_BUILD_RELEASE_APK.md` for complete instructions

Quick steps:
1. Go to GitHub Actions
2. Run "Android APK Build" workflow
3. **Select: buildType = `release`** (NOT debug!)
4. Wait ~10-15 minutes
5. Download APK from Artifacts

#### Option 2: EAS Cloud Build
```bash
cd apps/mobile
eas build --platform android --profile production
```

#### Option 3: Local Build
```bash
cd apps/mobile
npm install
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

## ?? Documentation

### Build & Deployment
- **`HOW_TO_BUILD_RELEASE_APK.md`** - ? How to build release APK correctly
- **`GITHUB_ACTIONS_SETUP.md`** - GitHub Actions setup and troubleshooting
- **`BUILD_COMPARISON_FIX.md`** - GitHub vs EAS build comparison

### Mobile App
- **`apps/mobile/BUILD-GUIDE.md`** - Complete mobile build guide
- **`apps/mobile/BLUETOOTH_CONNECTION_FLOW.md`** - Bluetooth printer flow
- **`apps/mobile/PERMISSION_FLOW.md`** - Permission handling
- **`apps/mobile/PREFERRED_PRINTER_FLOW.md`** - Auto-connect flow

### Fixes & Verification
- **`COMPLETE_FIX_SUMMARY.md`** - All fixes applied
- **`FINAL_DOUBLE_CHECK_REPORT.md`** - Comprehensive verification
- **`KEYSTORE_PATH_FIX.md`** - Keystore path issue fix

## ?? Common Issues

### "Could not connect to development server" Error
**Cause:** You're using a DEBUG APK that needs Metro bundler.  
**Solution:** Build a **RELEASE APK** instead. See `HOW_TO_BUILD_RELEASE_APK.md`

### GitHub Actions Build Fails
**Cause:** Missing secrets for release builds.  
**Solution:** Set up 4 required secrets in GitHub. See `GITHUB_ACTIONS_SETUP.md`

### APK Won't Install
**Cause:** Signature conflict with previous version.  
**Solution:** Uninstall old APK first: `adb uninstall com.bungkust.morobooth`

## ?? Requirements

### Web Development
- Node.js 20+
- npm or yarn

### Mobile Development
- Node.js 20+
- Android SDK (for local builds)
- Java 17 (for local builds)

### Mobile Build via GitHub Actions
- Just need GitHub account
- No local Android setup needed!

## ?? Quick Start

### Web App
```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

### Mobile App (via GitHub Actions)
1. See `HOW_TO_BUILD_RELEASE_APK.md`
2. Setup secrets in GitHub
3. Trigger release build
4. Download and install APK

## ?? License

Private project

## ?? Contributing

This is a private project. For internal use only.

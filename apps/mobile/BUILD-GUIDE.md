# Morobooth Android App - Build & Debug Guide

> **Quick Start:** Untuk debugging APK yang sudah di-install, lihat [APK-DEBUG-GUIDE.md](../../APK-DEBUG-GUIDE.md)

## Build Profiles

### 1. Debug Build (Testing)
```bash
cd morobooth-expo
eas build --platform android --profile debug
```
- **WebView URL**: `https://morobooth.netlify.app`
- **Features**: Full debug logging, no minification
- **Distribution**: Internal testing
- **Use Case**: Local testing with real thermal printer

### 2. Preview Build (Staging)
```bash
eas build --platform android --profile preview
```
- **WebView URL**: `https://staging-morobooth.netlify.app`
- **Features**: Staging environment
- **Distribution**: Internal testing
- **Use Case**: Testing with staging backend

### 3. Production Build (Release)
```bash
eas build --platform android --profile production
```
- **WebView URL**: `https://morobooth.netlify.app`
- **Features**: Proguard minification, Sentry error tracking
- **Distribution**: Store (Play Store ready)
- **Use Case**: Public release

## Debugging APK yang sudah di-install

### Setup Debugging
1. **Install APK ke device**
   ```bash
   # Connect device via USB
   adb devices
   
   # Install APK
   adb install path/to/app.apk
   
   # Or via file manager di device
   ```

2. **Enable Developer Options di Android device**
   - Settings → About phone → Tap "Build number" 7x
   - Settings → Developer options → Enable "USB debugging"

### 1. PWA WebView Debugging
```bash
# Open Chrome di PC/Mac
chrome://inspect/#devices

# Select your device and "inspect" the WebView
# Console logs will show PWA-side logs
# Gunakan untuk debug:
# - JavaScript errors di PWA
# - Network requests
# - Console.log dari PhotoBoothApp, AdminPage, etc
```

### 2. Native React Native Debugging
```bash
# Connect device via USB
adb devices

# View real-time logs
adb logcat | grep -E "ReactNativeJS|ReactNative|BLE|Bluetooth|Print|Error"

# View app-specific logs
adb logcat | grep "com.bungkust.morobooth"

# View all app logs (recommended)
adb logcat *:S ReactNativeJS:V ReactNative:V com.bungkust.morobooth:* | grep -v "chromium"

# Clear logs dan mulai fresh
adb logcat -c && adb logcat | grep "com.bungkust.morobooth"
```

### 3. Sentry Error Tracking
- Production builds automatically send errors to Sentry
- Dashboard: https://sentry.io
- View errors, stack traces, and device info

### 4. Quick Debug Commands
```bash
# Check installed app version
adb shell dumpsys package com.bungkust.morobooth | grep versionName

# Clear app data and reinstall
adb uninstall com.bungkust.morobooth
# Then reinstall APK

# View app permissions
adb shell dumpsys package com.bungkust.morobooth | grep permission

# Monitor Bluetooth connections
adb shell dumpsys bluetooth_manager | grep -A 5 "Bonded devices"
```

## Real-time Debugging Workflow

### Step-by-step Debugging
```bash
# 1. Connect device
adb devices

# 2. Clear old logs
adb logcat -c

# 3. Start monitoring logs (keep terminal running)
adb logcat *:S ReactNativeJS:V ReactNative:V com.bungkust.morobooth:* | grep -v "chromium"

# 4. Install APK (in another terminal)
adb install morobooth-debug.apk

# 5. Watch logs while using app
# Logs akan muncul real-time saat:
# - App starting
# - WebView loading
# - Bluetooth scanning
# - Printer connecting
# - Printing photos
```

### Filter Logs by Feature
```bash
# Bluetooth only
adb logcat | grep -E "Bluetooth|BLE|print"

# WebView only
adb logcat | grep "WebView"

# Errors only
adb logcat | grep -E "Error|Exception|FATAL"

# All app activity
adb logcat | grep "com.bungkust.morobooth"
```

## Key Debug Points

### Bluetooth Connection Flow
1. **Scan Printers**: `SCAN_BLUETOOTH_PRINTERS` message
2. **Connect**: `CONNECT_BLUETOOTH_PRINTER` with deviceId
3. **Print**: `PRINT_DITHERED_BITMAP` with base64 bitmap
4. **Status**: Monitor `BLUETOOTH_CONNECTED`, `PRINT_SUCCESS`, `BLUETOOTH_ERROR`

### Common Issues

#### Printer Not Found
```bash
# Check Bluetooth state
adb shell dumpsys bluetooth_manager | grep -i "state"

# Should show: mState=ON

# Check scan results in logs
adb logcat | grep "Devices found"
```

#### Print Fails
```bash
# Check bitmap conversion logs
adb logcat | grep "Dithered bitmap"

# Check MTU size
adb logcat | grep "MTU:"

# Should show: MTU: 512 or MTU: 20
```

#### WebView Not Loading
```bash
# Check network connectivity
adb shell ping -c 3 morobooth.netlify.app

# Check WebView errors
adb logcat | grep "WebView error"
```

## Environment Variables

Set in `eas.json`:
- `EXPO_PUBLIC_WEBVIEW_URL`: PWA URL to load in WebView
- `EXPO_PUBLIC_SENTRY_DSN`: Sentry DSN for error tracking (production only)

## Testing Checklist

- [ ] Camera access works in WebView
- [ ] Photo capture & save to IndexedDB
- [ ] Bluetooth printer discovery
- [ ] Printer connection with proper UUID discovery
- [ ] Print with 58mm thermal printer
- [ ] Print with 80mm thermal printer (if available)
- [ ] Image dithering quality acceptable
- [ ] QR code generation & download link
- [ ] Offline mode (no internet) still works
- [ ] Deep linking from QR code opens app
- [ ] Admin panel access (`/admin`)
- [ ] Session management
- [ ] Photo upload to Supabase (if configured)
- [ ] Back button navigation
- [ ] Screen orientation locked to portrait
- [ ] Screen wake lock during photo session

## Troubleshooting

### Build Fails
```bash
# Clear EAS cache
eas build --clear-cache --platform android --profile debug

# Check EAS project
eas project:info
```

### APK Won't Install
```bash
# Uninstall existing version first
adb uninstall com.bungkust.morobooth

# Check signature
adb install --apk morobooth-debug.apk
```

### Bluetooth Permissions
```bash
# Reset app permissions
adb shell pm reset-permissions com.bungkust.morobooth

# Reinstall app
# Permissions will be requested on first launch
```

## Network Configuration

### Local Development (PWA)
```bash
# Start PWA dev server
cd morobooth
npm run dev

# Note the local IP (e.g., http://192.168.1.100:5173)
# Update eas.json env to use this URL for local testing
```

### Testing Different WebView URLs
```bash
# Build with custom environment
eas build --platform android --profile debug --env EXPO_PUBLIC_WEBVIEW_URL=https://your-custom-url.com
```

## Release Process

1. **Update version** in `app.json`:
```json
{
  "expo": {
    "version": "1.0.1"
  }
}
```

2. **Build production APK**:
```bash
eas build --platform android --profile production
```

3. **Test the APK**:
```bash
# Download APK from EAS dashboard
# Install on test device
# Run full test checklist
```

4. **Submit to Play Store**:
```bash
# Configure app signing (one-time setup)
eas submit --platform android

# Or manually upload APK from Play Console
```

## File Structure

```
morobooth-expo/
├── App.tsx                 # Main Expo app with WebView
├── eas.json                # EAS build configuration
├── app.json                # Expo app configuration
├── services/
│   ├── NativeBLEPrinter.ts # Bluetooth ESC/POS printing
│   └── PrinterStorage.ts   # Last printer storage
├── components/
│   └── PrinterSelectionModal.tsx
└── android/
    ├── app/build.gradle    # Android build config
    └── gradle.properties   # Gradle properties
```

## Support

- **EAS Dashboard**: https://expo.dev
- **Build Logs**: Check EAS dashboard for detailed logs
- **Sentry**: https://sentry.io (production errors)
- **PWA Repo**: https://github.com/bungkust/Morobooth

## Notes

- Debug builds include full console logging
- Production builds are minified and obfuscated with Proguard
- All builds use the same keystore from EAS
- WebView content is loaded from `EXPO_PUBLIC_WEBVIEW_URL`
- Camera access requires physical device (not emulator)
- Bluetooth printing requires physical thermal printer


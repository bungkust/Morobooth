# Debug APK yang Sudah Di-Install

## Prerequisites

1. **Android device** dengan USB debugging enabled
2. **ADB installed** di komputer Anda
3. **APK file** yang sudah di-build

## Setup Debugging

### 1. Enable USB Debugging di Android

**Steps:**
1. Settings → About phone → Build number (tap 7x sampai muncul "You are now a developer")
2. Settings → Developer options → USB debugging (enable)
3. Settings → Developer options → Install via USB (enable)

### 2. Connect Device

```bash
# Check device connected
adb devices

# Should show:
# List of devices attached
# XXXXXXXXXX    device
```

Jika device tidak muncul, coba:
- Unlock device
- Accept "Allow USB debugging" popup
- Check USB cable
- Try different USB port

### 3. Install APK

```bash
# Install APK
adb install morobooth-v1.0.0-debug.apk

# Install dengan force replace jika sudah ada
adb install -r morobooth-v1.0.0-debug.apk

# Uninstall dulu jika ada masalah
adb uninstall com.bungkust.morobooth
```

## Debugging Methods

### Method 1: Real-time Log Monitoring (Recommended)

**Best untuk:** Debugging issues secara real-time saat app running

```bash
# Open 2 terminal windows

# Terminal 1: Monitor all logs
adb logcat *:S ReactNativeJS:V ReactNative:V com.bungkust.morobooth:*

# Terminal 2: Install or interact
adb install morobooth-debug.apk

# Watch logs muncul saat:
# - App starting
# - WebView loading URL
# - Bluetooth scanning
# - Printer connecting/disconnecting
# - Printing photos
# - Errors
```

**Filter by category:**
```bash
# Bluetooth only
adb logcat | grep -E "Bluetooth|BLE|print|Printer"

# WebView only
adb logcat | grep -E "WebView|javascript"

# Errors only
adb logcat | grep -E "Error|Exception|FATAL|ERROR"

# Your app only
adb logcat | grep "com.bungkust.morobooth"

# Clear logs dan start fresh
adb logcat -c && adb logcat *:S ReactNativeJS:V
```

### Method 2: Chrome DevTools (PWA WebView)

**Best untuk:** Debugging PWA JavaScript, Network, Console

**Steps:**
1. Connect device via USB
2. Open Chrome di PC/Mac
3. Go to: `chrome://inspect/#devices`
4. Find "Morobooth" or "WebView"
5. Click "inspect"
6. Open Console tab untuk melihat logs
7. Network tab untuk request/response
8. Elements tab untuk DOM inspection

**Use cases:**
- Debug JavaScript errors di PhotoBoothApp
- Check Network requests ke Supabase
- View console.log dari AdminPage
- Inspect WebView rendered content

### Method 3: Sentry (Production Error Tracking)

**Best untuk:** Error tracking di production builds

1. Setup Sentry DSN di `app.json` extra.sentryDsn
2. Build production APK
3. Errors otomatis terkirim ke Sentry dashboard
4. View di: https://sentry.io

**Use cases:**
- Crash reports
- User-facing errors
- Performance monitoring
- Release tracking

## Common Debug Scenarios

### Scenario 1: App Crash on Launch

```bash
# View crash logs
adb logcat | grep -E "FATAL|AndroidRuntime"

# Check app process
adb shell ps | grep morobooth

# View recent crashes
adb shell dumpsys dropbox --print

# Uninstall and reinstall
adb uninstall com.bungkust.morobooth
adb install morobooth-debug.apk
```

### Scenario 2: WebView Not Loading

```bash
# Check network connectivity
adb shell ping -c 3 morobooth.netlify.app

# Check WebView logs
adb logcat | grep WebView

# Check DNS resolution
adb shell nslookup morobooth.netlify.app

# Use Chrome DevTools Method 2
```

### Scenario 3: Bluetooth Not Working

```bash
# Check Bluetooth status
adb shell dumpsys bluetooth_manager | grep -i "state"

# Check bonded devices
adb shell dumpsys bluetooth_manager | grep -A 5 "Bonded devices"

# View BLE logs
adb logcat | grep -E "BleManager|Bluetooth|BLE"

# Check permissions
adb shell dumpsys package com.bungkust.morobooth | grep permission
```

### Scenario 4: Printer Not Found

```bash
# Monitor scan process
adb logcat | grep "Getting bonded"

# Check if devices found
adb logcat | grep "Found.*bonded devices"

# View device list
adb logcat | grep "Devices found:"

# Test with another Bluetooth app
# If other apps work, check our code
```

### Scenario 5: Print Fails

```bash
# Monitor print process
adb logcat | grep -E "Print|bitmap|ESCPOS"

# Check MTU negotiation
adb logcat | grep "MTU"

# Check connection status
adb logcat | grep "Connect|Disconnect"

# Check bitmap conversion
adb logcat | grep "Dithered bitmap"
```

## Quick Debug Commands

```bash
# App version info
adb shell dumpsys package com.bungkust.morobooth | grep versionName

# View all permissions
adb shell dumpsys package com.bungkust.morobooth | grep permission

# Clear app data
adb shell pm clear com.bungkust.morobooth

# Force stop app
adb shell am force-stop com.bungkust.morobooth

# Start app
adb shell monkey -p com.bungkust.morobooth -c android.intent.category.LAUNCHER 1

# View running processes
adb shell ps | grep morobooth

# Check disk space
adb shell df -h

# View current activity
adb shell dumpsys window windows | grep -E 'mCurrentFocus'

# Take screenshot
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png

# Record screen
adb shell screenrecord /sdcard/recording.mp4
# Press Ctrl+C to stop
adb pull /sdcard/recording.mp4
```

## Debugging Checklist

### Pre-launch Checks
- [ ] Device connected (`adb devices`)
- [ ] USB debugging enabled
- [ ] APK installed successfully
- [ ] Logs monitoring running

### App Launch Checks
- [ ] App opens without crash
- [ ] WebView loads URL correctly
- [ ] No WebView errors in Chrome DevTools
- [ ] Console.log dari App.tsx muncul

### Bluetooth Checks
- [ ] Bluetooth enabled di device
- [ ] Printer paired di Bluetooth settings
- [ ] Permissions granted (scan + connect)
- [ ] Printer devices list muncul
- [ ] Connection successful

### Print Checks
- [ ] Photo captured successfully
- [ ] Dithering applied
- [ ] Bitmap converted to ESC/POS
- [ ] Printer receives data
- [ ] Print output correct

## Export Logs untuk Analysis

```bash
# Export all logs to file
adb logcat > morobooth-debug.log

# Export filtered logs
adb logcat | grep "com.bungkust.morobooth" > app-logs.log

# Export with timestamp
adb logcat -v time > logs-with-time.log

# Share untuk debugging
# Upload file ke GitHub issue atau paste to gist
```

## Tips & Tricks

1. **Use `adb logcat -c`** sebelum testing untuk clean slate
2. **Keep 2 terminals open** - satu untuk logs, satu untuk commands
3. **Use grep filters** untuk focus pada specific issues
4. **Chrome DevTools** lebih baik untuk PWA JavaScript debugging
5. **Sentry** automatic untuk production error tracking
6. **Take screenshots/recordings** untuk visual debugging
7. **Clear app data** jika behavior tidak expected
8. **Check permissions** jika features tidak work

## Still Having Issues?

1. Check BUILD-GUIDE.md untuk build-specific issues
2. View GitHub Actions logs untuk build errors
3. Check Expo/React Native forums untuk common issues
4. Search Sentry dashboard untuk similar errors
5. Create detailed issue with logs and screenshots


# Morobooth 📸

A modern, cross-platform photo booth application that captures instant photos and prints them via Bluetooth thermal printers. Perfect for events, parties, and gatherings!

## Features

- 📸 **Instant Photo Capture**: Multi-photo sessions with configurable templates
- 🖨️ **Bluetooth Printing**: Direct printing to thermal printers from both web and mobile
- 🌐 **Progressive Web App**: Works offline with full PWA capabilities
- 📱 **Native Mobile Apps**: Android and iOS support via React Native
- 🎨 **Customizable Templates**: Multiple layout options (vertical, horizontal, grid)
- 📥 **Digital Downloads**: QR code generation for easy photo sharing
- 🔄 **Offline Support**: Works without internet connection
- 💾 **Photo Storage**: Cloud storage integration with Supabase

## Tech Stack

- **Web**: React + TypeScript + Vite
- **Mobile**: React Native + Expo
- **Bluetooth**: Native BLE integration
- **Storage**: Supabase
- **Image Processing**: P5.js, Canvas API

## How It Works

### Architecture Overview

Morobooth is a hybrid application that works seamlessly across web browsers (PWA) and native mobile platforms. The core photo booth functionality is built as a web application that runs inside a React Native WebView, allowing code reuse while providing native Bluetooth capabilities on mobile devices.

### Photo Capture Flow

1. **Template Selection**: Users choose from predefined templates (vertical strip, horizontal strip, or grid layout)
2. **Camera Preview**: Real-time camera feed using the device's camera
3. **Countdown**: 3-2-1 countdown with audio feedback
4. **Multi-Photo Capture**: Automatically captures 2-6 photos at 2.5-second intervals
5. **Image Processing**: 
   - Each photo is captured at high resolution using P5.js
   - Photos are dithered using Floyd-Steinberg algorithm for thermal printer compatibility
   - Composed into final strip based on template layout
6. **Review Mode**: User can preview the composite before printing/downloading

### Printing Architecture

#### Hybrid Printing Service

The app uses a hybrid approach that automatically selects the best printing method:

**On Mobile (Native App):**
- Uses React Native BLE Manager for native Bluetooth Low Energy (BLE) communication
- Direct connection to thermal printer via Bluetooth
- Supports ESC/POS commands for thermal printers
- Better performance and reliability

**On Web (PWA):**
- Uses Web Bluetooth API when available
- Falls back to browser print dialog for physical printers
- Can print to thermal printers if Web Bluetooth is supported

#### Printing Process

1. **Connection**: User pairs/connects to Bluetooth thermal printer (typically 58mm or 80mm)
2. **Image Conversion**: 
   - High-resolution composite is converted to grayscale
   - Dithering applied (Floyd-Steinberg algorithm)
   - Image resized to match thermal paper width
3. **ESC/POS Commands**: Image data is encoded into printer commands
4. **Printing**: Commands sent to printer via Bluetooth
5. **Progress Tracking**: Real-time progress updates shown to user

### Data Management

#### Local Storage (IndexedDB)

- **Sessions**: Event sessions with unique codes (e.g., `WEDDING-A1B2C3`)
- **Photos**: All photos stored locally with metadata (timestamp, session, upload status)
- **Offline Support**: Full functionality without internet connection

#### Cloud Storage (Supabase)

- **Background Upload**: Photos automatically uploaded when internet available
- **Download URLs**: Generated for sharing via QR codes
- **Session Management**: Centralized photo storage and retrieval

### Template System

Templates define how photos are arranged:

- **Vertical**: Photos stacked top-to-bottom
- **Horizontal**: Photos arranged left-to-right
- **Grid**: Photos in a grid pattern (2x2, 3x2, etc.)

Each template specifies:
- Number of photos to capture
- Layout type
- Paper dimensions (thermal size)
- Custom header/footer text

### QR Code Integration

Every printed photo includes:
- QR code for digital download
- User scans to download high-resolution version
- Deep linking support: `morobooth://download/{photoId}`

## Project Structure

```
morobooth/
├── apps/
│   ├── mobile/           # React Native mobile app
│   │   ├── android/      # Android native code
│   │   ├── App.tsx       # Main app with WebView
│   │   └── services/     # Native BLE printer service
│   └── web/              # Web application (PWA)
│       ├── src/
│       │   ├── components/   # React components
│       │   ├── services/     # Business logic
│       │   ├── utils/        # Utilities
│       │   └── hooks/        # Custom hooks
├── src/                  # Shared web source (root)
└── dist/                 # Built web assets
```

### Key Components

**PhotoBooth.tsx**: Core photo capture logic using P5.js
- Camera management
- Multi-photo capture loop
- Countdown with audio
- Image composition

**PhotoBoothApp.tsx**: Main application flow
- Template selection
- Print/download actions
- Bluetooth connection management
- Modal management

**HybridBluetoothPrinterService.ts**: Smart printer service
- Detects native vs web environment
- Routes to appropriate printer implementation
- Unified API for printing

**nativeBridgeService.ts**: Web <-> Native communication
- Message passing between WebView and React Native
- Event handling
- Status synchronization

**photoComposer.ts**: Image composition engine
- Layout calculations
- Dithering application
- QR code integration
- Multiple output formats (review vs print)

**dithering.ts**: Image processing algorithms
- Ordered dither (Bayer 4x4): Fast preview
- Floyd-Steinberg: High-quality print output

### Services

- **photoStorageService.ts**: IndexedDB management
- **uploadService.ts**: Supabase integration
- **sessionService.ts**: Session lifecycle
- **configService.ts**: App configuration
- **universalBluetoothPrinterService.ts**: Web Bluetooth

## Quick Start

### Web Version

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Mobile Version

```bash
cd apps/mobile

# Install dependencies
npm install

# Start Expo development server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Build for production
eas build --platform android
eas build --platform ios
```

### Environment Setup

1. **Supabase** (optional, for cloud storage):
   - Create Supabase project
   - Add credentials to `config.ts`
   - Run `SUPABASE_DATABASE_SETUP.sql`

2. **Mobile Build**:
   - Configure `eas.json` with your signing certificates
   - See `apps/mobile/BUILD-GUIDE.md` for detailed instructions

### Bundle Version Automation

Every merge to `main` should bump the Expo bundle metadata so mobile testers can confirm they are running the latest build.

- Prepare the version string and patch `apps/mobile/app.json` with:

  ```bash
  pnpm run bump:bundle
  # or: npm run bump:bundle / yarn bump:bundle
  ```

- The script performs two actions:
  1. Increments `expo.version` (patch segment).
  2. Sets `expo.extra.bundleVersion` to `<YYYYMMDD>-<HHMMSS>-<shortGitSha>`.

- The value is exposed at runtime through:
  - Logcat (`App bundle version: ...`)
  - Admin login header (`Bundle: ...`)

Add this command to your CI pipeline (e.g., post-merge hook) to ensure every production bundle carries a unique identifier.

## Development

### Required Permissions

**Web (PWA):**
- Camera access
- Bluetooth (if Web Bluetooth supported)

**Mobile:**
- Camera
- Bluetooth Scan
- Bluetooth Connect
- Fine Location (for Bluetooth scanning)
- Wake Lock (keep screen on during photo sessions)

### Key Dependencies

**Web:**
- React 19
- P5.js (camera + image processing)
- idb (IndexedDB wrapper)
- qrcode (QR code generation)
- html2canvas (screenshot utility)

**Mobile:**
- React Native 0.74
- Expo SDK 51
- react-native-ble-manager (Bluetooth)
- react-native-webview (WebView container)
- expo-keep-awake (screen wake lock)

## Build

See individual build guides:
- `apps/mobile/BUILD-GUIDE.md` - Android build instructions
- `apps/web/README.md` - Web deployment

## Deployment

**Web**: Deployed to Netlify at `https://morobooth.netlify.app`

**Mobile**: Built with EAS (Expo Application Services)
- Android APK/AAB
- iOS IPA

## License

Private project - All rights reserved

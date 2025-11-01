# ??? Preferred Printer & Auto-Connect Flow

## ?? Goal
**User connects printer ONCE ? Next time they open app ? Auto-connects ? Can print directly without any extra steps**

---

## ?? Complete User Flow

### 1?? **First Time Setup**
```
User opens app (first time)
  ?
Permission request (as usual)
  ?
User clicks "Connect Printer"
  ?
Modal shows ? User selects printer
  ?
Connection successful
  ?
? Printer info SAVED to storage
? Toast: "Printer ready: [name]"
? WebView notified: BLUETOOTH_CONNECTED
  ?
Modal closes
```

### 2?? **Next Time App Opens**
```
User opens app (2nd time+)
  ?
App startup
  ?
Check: Is there a saved printer?
  ?
[YES] ? Auto-connect
  |
  ?? Toast: "?? Reconnecting to printer..."
  ?
  Connection attempt (10s timeout)
  ?
  ?????????????????????????????
  ?                           ?
[SUCCESS]                  [FAILED]
  ?                           ?
  ?? Set connectedDevice      ?? Clear saved printer
  ?? Toast: "? Connected"    ?? Silent (no error toast)
  ?? Send: BLUETOOTH_CONNECTED?? Send: BLUETOOTH_DISCONNECTED
  ?                           ?   (reason: auto-connect-failed)
  ?                           ?
App ready                   App ready
Printer connected           No printer connected
(can print directly)        (will ask when user prints)
```

### 3?? **Taking Photo & Printing (Printer Connected)**
```
User takes photo
  ?
User clicks "Print" button
  ?
WebView sends: PRINT_DITHERED_BITMAP
  ?
Native checks: Is printer connected?
  ?
[YES, CONNECTED] ? This is the preferred flow!
  ?
  ?? Print directly (no modal!)
  ?? Show progress to WebView
  ?? Send: PRINT_SUCCESS or PRINT_FAILED
  ?
Done! Photo printed ??
```

### 4?? **Printing When NOT Connected**
```
User takes photo
  ?
User clicks "Print" button
  ?
WebView sends: PRINT_DITHERED_BITMAP
  ?
Native checks: Is printer connected?
  ?
[NO, NOT CONNECTED]
  ?
  ?? Open connection modal automatically
  ?? Send: PRINT_FAILED (needsConnection: true)
  ?? User connects printer in modal
  ?? After connection, user clicks Print again
  ?
Now connected ? Print directly!
```

---

## ?? Auto-Connect Logic

### When It Happens
- **App startup** (after permission granted)
- **Runs once per session**
- **Runs in background** (user sees toast)

### Implementation
```typescript
// apps/mobile/App.tsx

const autoConnectLastPrinter = async () => {
  try {
    // 1. Check if there's a saved printer
    const lastPrinter = await PrinterStorage.getLastPrinter();
    
    if (!lastPrinter) {
      // No saved printer ? Send disconnected status
      sendMessageToWebView({
        type: 'BLUETOOTH_DISCONNECTED',
        data: { connected: false, reason: 'no-saved-printer' }
      });
      return;
    }
    
    // 2. Show toast: reconnecting
    ToastAndroid.show('?? Reconnecting to printer...', ToastAndroid.SHORT);
    
    // 3. Try to connect (10s timeout)
    try {
      await printer.connect(lastPrinter.id);
      
      // SUCCESS!
      setConnectedDevice(lastPrinter);
      
      // Notify WebView
      sendMessageToWebView({
        type: 'BLUETOOTH_CONNECTED',
        data: { 
          connected: true, 
          device: lastPrinter,
          autoConnected: true  // Flag to indicate it's auto-connected
        }
      });
      
      // Show success toast
      ToastAndroid.show(`? Connected to ${lastPrinter.name}`, ToastAndroid.SHORT);
      
    } catch (error) {
      // FAILED - Printer might be off, out of range, etc.
      
      // Clear saved printer (so we don't try again next time)
      await PrinterStorage.clearLastPrinter();
      
      // Notify WebView
      sendMessageToWebView({
        type: 'BLUETOOTH_DISCONNECTED',
        data: { connected: false, reason: 'auto-connect-failed' }
      });
      
      // Don't show error toast - user will be asked when they try to print
    }
    
  } catch (error) {
    console.error('Auto-connect error:', error);
  }
};
```

### Why Clear on Failure?
- Printer might be broken/lost/unpaired
- Don't want to keep trying failed printer every app start
- User can easily reconnect by clicking "Connect" button
- Better UX than showing error every time

---

## ?? Storage Implementation

### Saved Data Structure
```typescript
// Stored in AsyncStorage with key: '@printer_storage:last_printer'

interface PrinterDevice {
  id: string;      // Bluetooth MAC address: "00:11:22:33:44:55"
  name: string;    // Device name: "BlueTooth Printer"
  rssi?: number;   // Signal strength (optional)
}
```

### Storage Functions
```typescript
// apps/mobile/services/PrinterStorage.ts

class PrinterStorage {
  // Save printer after successful connection
  static async saveLastPrinter(device: PrinterDevice): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  }
  
  // Get saved printer on app startup
  static async getLastPrinter(): Promise<PrinterDevice | null> {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  }
  
  // Clear when user disconnects or auto-connect fails
  static async clearLastPrinter(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}
```

---

## ?? Message Protocol (Native ? WebView)

### WebView ? Native

#### 1. Get Printer Status (on page load)
```typescript
// WebView sends
window.ReactNativeWebView.postMessage(JSON.stringify({
  type: 'GET_PRINTER_STATUS'
}));

// Native responds with either:
// BLUETOOTH_CONNECTED or BLUETOOTH_DISCONNECTED
```

#### 2. Print Request
```typescript
// WebView sends
window.ReactNativeWebView.postMessage(JSON.stringify({
  type: 'PRINT_DITHERED_BITMAP',
  data: {
    bitmapBase64: '...',
    width: 384,
    height: 500
  }
}));

// If NOT connected:
// ? Native opens modal
// ? Native sends PRINT_FAILED (needsConnection: true)

// If connected:
// ? Native prints directly
// ? Native sends PRINT_SUCCESS or PRINT_FAILED
```

### Native ? WebView

#### 1. Connected Status
```typescript
{
  type: 'BLUETOOTH_CONNECTED',
  data: {
    connected: true,
    device: {
      id: "00:11:22:33:44:55",
      name: "BlueTooth Printer"
    },
    autoConnected: true  // Only present if auto-connected on startup
  }
}
```

#### 2. Disconnected Status
```typescript
{
  type: 'BLUETOOTH_DISCONNECTED',
  data: {
    connected: false,
    reason: 'no-saved-printer' | 'auto-connect-failed' | 'user-disconnected'
  }
}
```

#### 3. Print Result
```typescript
// Success
{
  type: 'PRINT_SUCCESS',
  data: {
    success: true,
    progress: 100
  }
}

// Failed - needs connection
{
  type: 'PRINT_FAILED',
  data: {
    success: false,
    error: 'No printer connected. Please connect to a printer first.',
    needsConnection: true  // Flag: modal was opened
  }
}

// Failed - other error
{
  type: 'BLUETOOTH_ERROR',
  data: {
    error: 'Connection timeout...',
    errorCode: 'PRINT_ERROR'
  }
}
```

---

## ?? User Feedback (Toasts)

All toasts are shown on Android using `ToastAndroid.show()`:

| Event | Toast Message | Duration |
|-------|--------------|----------|
| Auto-connecting | ?? Reconnecting to printer... | SHORT (2s) |
| Auto-connect success | ? Connected to [name] | SHORT (2s) |
| Manual connection success | ? Printer ready: [name] | SHORT (2s) |
| Disconnection | Disconnected from [name] | SHORT (2s) |
| Auto-connect failure | *(no toast)* | - |

**Why no toast on auto-connect failure?**
- Don't want to annoy user with error on every app start
- User will be prompted when they try to print
- Keeps startup experience clean

---

## ?? Permission Integration

Auto-connect only happens if:
1. ? Bluetooth permission granted
2. ? There's a saved printer
3. ? App just started

```typescript
// apps/mobile/App.tsx - initializeApp()

const initializeApp = async () => {
  await printer.init();
  
  // Request permission on startup
  const permissionGranted = await requestAllPermissions();
  
  // Only auto-connect if we have permissions
  if (permissionGranted) {
    await autoConnectLastPrinter();  // ? Only runs if permission granted
  }
  
  // ... rest of init
};
```

---

## ?? Flow Diagram: Print Button Click

```
?????????????????????
? User Clicks Print ?
?????????????????????
          ?
          ?
???????????????????????
? WebView sends:      ?
? PRINT_DITHERED_     ?
? BITMAP              ?
???????????????????????
          ?
          ?
???????????????????????
? Native receives     ?
? message             ?
???????????????????????
          ?
          ?
    ?????????????
    ? Printer   ?
    ? Connected??
    ?????????????
          ?
    ?????????????
    ?           ?
  YES          NO
    ?           ?
    ?           ?
    ?    ????????????????????
    ?    ? Open Modal       ?
    ?    ? automatically    ?
    ?    ????????????????????
    ?             ?
    ?             ?
    ?    ????????????????????
    ?    ? Send:            ?
    ?    ? PRINT_FAILED     ?
    ?    ? needsConnection  ?
    ?    ? = true           ?
    ?    ????????????????????
    ?             ?
    ?             ?
    ?    ????????????????????
    ?    ? User selects     ?
    ?    ? printer in modal ?
    ?    ????????????????????
    ?             ?
    ?             ?
    ?    ????????????????????
    ?    ? Connect success  ?
    ?    ????????????????????
    ?             ?
    ?    ??????????
    ?    ? (User clicks Print again)
    ?    ?
    ?    ?
????????????????????????
? Print Directly!      ?
? No modal needed      ?
????????????????????????
          ?
          ?
????????????????????????
? Send progress        ?
? PRINT_PROGRESS: 50   ?
????????????????????????
          ?
          ?
????????????????????????
? Print to device      ?
? (10-30 seconds)      ?
????????????????????????
          ?
    ?????????????
    ?           ?
 SUCCESS      FAILED
    ?           ?
    ?           ?
??????????? ????????????
? PRINT_  ? ? BLUETOOTH?
? SUCCESS ? ? _ERROR   ?
??????????? ????????????
```

---

## ? Benefits of This Approach

### 1. **Seamless UX (Preferred Flow)**
```
User ? Take photo ? Click Print ? Photo printed!
```
**No modals, no connection steps, instant printing! ??**

### 2. **Smart Fallback**
- If printer not connected ? Automatically show modal
- User connects ? Can print
- Next time ? Direct printing again

### 3. **Persistent Preference**
- Connect once ? Remember forever
- App restart ? Auto-reconnect
- Works until user explicitly disconnects

### 4. **Clear Feedback**
- Toast on auto-connect attempt
- Toast on success
- No annoying errors on failure

### 5. **WebView Integration**
- WebView can check printer status anytime
- WebView knows if auto-connected
- WebView can handle failures gracefully

---

## ?? Testing Scenarios

### Test 1: First Time User
1. Fresh install
2. Grant permission
3. Click "Connect" ? Select printer ? Success
4. ? Toast: "Printer ready: [name]"
5. Take photo ? Click Print
6. ? Prints directly (no modal)

### Test 2: Auto-Connect on App Restart
1. Connected printer in previous session
2. Close app completely
3. Reopen app
4. ? Toast: "?? Reconnecting to printer..."
5. ? Toast: "? Connected to [name]"
6. Take photo ? Click Print
7. ? Prints directly

### Test 3: Auto-Connect Failure (Printer Off)
1. Connected printer in previous session
2. Turn printer OFF
3. Close app completely
4. Reopen app
5. ? Toast: "?? Reconnecting to printer..." (appears)
6. ? No error toast (silent failure)
7. Take photo ? Click Print
8. ? Modal opens automatically
9. User connects ? Print works

### Test 4: Manual Disconnect
1. Printer connected
2. Open modal ? Click "Disconnect"
3. ? Toast: "Disconnected from [name]"
4. Take photo ? Click Print
5. ? Modal opens automatically

### Test 5: Printer Out of Range
1. Connected printer
2. Move far away (out of Bluetooth range)
3. Click Print
4. ? Connection fails during print
5. ? Error shown with retry button

### Test 6: WebView Status Check
1. Page loads/reloads
2. WebView sends: GET_PRINTER_STATUS
3. ? Native responds immediately with current status
4. ? WebView can show/hide UI based on status

---

## ?? Key Implementation Points

### 1. **Always Save on Success**
```typescript
// After successful connection
setConnectedDevice(device);
await PrinterStorage.saveLastPrinter(device);  // ? Important!
```

### 2. **Clear on Failure or Disconnect**
```typescript
// Auto-connect failed
await PrinterStorage.clearLastPrinter();

// User disconnected
await PrinterStorage.clearLastPrinter();
```

### 3. **Check Before Print**
```typescript
case 'PRINT_DITHERED_BITMAP':
  if (!connectedDevice) {
    // Not connected ? Show modal
    await checkPermissionAndOpenModal();
    sendMessageToWebView({ type: 'PRINT_FAILED', needsConnection: true });
  } else {
    // Connected ? Print directly
    await handlePrintBitmap(...);
  }
```

### 4. **Notify WebView**
```typescript
// Always send status after connect/disconnect/startup
sendMessageToWebView({
  type: 'BLUETOOTH_CONNECTED' | 'BLUETOOTH_DISCONNECTED',
  data: { ... }
});
```

---

## ?? Future Enhancements

- [ ] Multiple saved printers (list of favorites)
- [ ] Quick switch between printers
- [ ] Printer nickname/labels
- [ ] Print queue management
- [ ] Auto-retry on connection drop during print
- [ ] Background keep-alive for connection
- [ ] Smart printer selection based on location/time

---

## ?? Summary

| Question | Answer |
|----------|--------|
| **Butuh set preferred device?** | ? YES - Auto-saved after first connection |
| **Auto-connect on startup?** | ? YES - Automatic with toast feedback |
| **Print tanpa modal?** | ? YES - If already connected |
| **Kalau belum connected?** | Modal muncul otomatis pas klik Print |
| **Saved dimana?** | AsyncStorage (`@printer_storage:last_printer`) |
| **Cleared kapan?** | Auto-connect failure or user disconnect |
| **WebView tahu status?** | ? YES - Can request via GET_PRINTER_STATUS |

---

**Result:** User experience yang smooth! Connect 1x ? Print langsung selamanya! ??

**Author:** AI Assistant  
**Date:** 2025-11-01  
**Version:** 2.0.0 (Preferred Printer Flow)

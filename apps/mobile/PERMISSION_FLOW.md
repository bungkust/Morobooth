# Bluetooth Permission Flow

## ?? Permission Strategy

### Design Philosophy
**Bluetooth permission is MANDATORY** for this app to function. Without it, users cannot print photos, which is the core feature. Therefore, we implement a **persistent permission request** strategy.

---

## ?? Flow Diagram

```
????????????????????
?   App Startup    ?
????????????????????
         ?
         ?
????????????????????????????????????????????
? Alert: "??? Bluetooth Permission Required"?
?                                          ?
? "Morobooth needs Bluetooth permission   ?
?  to connect to your thermal printer.    ?
?                                          ?
?  Without this permission, you cannot    ?
?  print photos."                          ?
?                                          ?
?         [Grant Permission]               ?
????????????????????????????????????????????
         ?
         ?
  ???????????????
  ? Permission  ?
  ?  Granted?   ?
  ???????????????
         ?
    ???????????
    ?   YES   ?          NO
    ?         ????????????????
    ???????????              ?
         ?                   ?
         ?         ??????????????????????
         ?         ? Alert: "?? Denied" ?
         ?         ?                    ?
         ?         ? "You'll be asked   ?
         ?         ?  again when you    ?
         ?         ?  try to connect."  ?
         ?         ?                    ?
         ?         ?      [OK]          ?
         ?         ??????????????????????
         ?
         ?
????????????????????
?  Auto-Connect    ?
?  Last Printer    ?
?  (if available)  ?
????????????????????
         ?
         ?
????????????????????
?   App Running    ?
????????????????????
         ?
         ?
????????????????????
? User Clicks      ?
? "Connect"        ?
????????????????????
         ?
         ?
????????????????????
? Check Permission ?
????????????????????
         ?
    ???????????
    ?Granted? ?
    ???????????
         ?
    ???????????
    ?   YES   ?          NO
    ?         ????????????????????????
    ???????????                      ?
         ?                           ?
         ?              ??????????????????????????????
         ?              ? Alert:                     ?
         ?              ? "??? Permission Required"  ?
         ?              ?                            ?
         ?              ? "Morobooth needs BT to    ?
         ?              ?  connect to your printer." ?
         ?              ?                            ?
         ?              ?  [Cancel] [Grant]          ?
         ?              ??????????????????????????????
         ?                       ?
         ?                  ???????????
         ?                  ?  User   ?
         ?                  ? Choice? ?
         ?                  ???????????
         ?                       ?
         ?                 ?????????????
         ?                 ?           ?
         ?              Grant       Cancel
         ?                 ?           ?
         ?                 ?           ?
         ?           ???????????  ??????????
         ?           ? Granted??  ? Stop   ?
         ?           ???????????  ??????????
         ?                ?
         ?           ???????????
         ?           ?   YES   ?       NO
         ?           ?         ???????????????
         ?           ???????????             ?
         ?                ?                  ?
         ?                ?        ????????????????????
         ?                ?        ? Alert: "??"      ?
         ?                ?        ?                  ?
         ?                ?        ? "Permission is   ?
         ?                ?        ?  required..."    ?
         ?                ?        ?                  ?
         ?                ?        ? [Try Again]      ?
         ?                ?        ? [Cancel]         ?
         ?                ?        ????????????????????
         ?                ?                 ?
         ?                ?            Try Again
         ?                ?                 ?
         ?                ?                 ?
         ?                ???????????????????
         ?                          ?
         ?                          ?
         ????????????????????????????
         ?
         ?
????????????????????
?  Open Modal      ?
?  Show Devices    ?
????????????????????
```

---

## ?? Implementation Details

### 1. **App Startup (First Launch)**

```typescript
// apps/mobile/App.tsx - initializeApp()

const requestAllPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    // Show explanation alert
    Alert.alert(
      '??? Bluetooth Permission Required',
      'Morobooth needs Bluetooth permission to connect to your thermal printer.\n\nWithout this permission, you cannot print photos.',
      [
        {
          text: 'Grant Permission',
          onPress: async () => {
            const results = await PermissionsAndroid.requestMultiple([
              BLUETOOTH_SCAN,
              BLUETOOTH_CONNECT,
              ACCESS_FINE_LOCATION,
              CAMERA,
            ]);
            
            const bluetoothGranted = /* check results */;
            
            if (!bluetoothGranted) {
              Alert.alert(
                '?? Permission Denied',
                'You will be asked again when you try to connect to a printer.'
              );
            }
            
            return bluetoothGranted;
          }
        }
      ]
    );
  }
  return true;
};
```

**Why on startup?**
- User understands immediately what the app needs
- Better UX than requesting randomly mid-usage
- Allows auto-connect to last printer if permission granted

**If denied:**
- Show message: "You'll be asked again when connecting"
- App still loads normally
- Feature unavailable until permission granted

---

### 2. **Every Time User Clicks "Connect"**

```typescript
// apps/mobile/App.tsx - checkPermissionAndOpenModal()

const checkPermissionAndOpenModal = async () => {
  // Check current permission status
  const scanGranted = await PermissionsAndroid.check(BLUETOOTH_SCAN);
  const connectGranted = await PermissionsAndroid.check(BLUETOOTH_CONNECT);
  
  if (!scanGranted || !connectGranted) {
    // Not granted, ask again
    Alert.alert(
      '??? Bluetooth Permission Required',
      'Morobooth needs Bluetooth permission to connect to your thermal printer.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Grant Permission',
          onPress: async () => {
            const results = await PermissionsAndroid.requestMultiple([...]);
            
            if (bluetoothGranted) {
              // Open modal
              setShowPrinterModal(true);
            } else {
              // Still denied, offer retry
              Alert.alert(
                '?? Permission Required',
                'Bluetooth permission is required to connect to the printer.',
                [
                  {
                    text: 'Try Again',
                    onPress: () => checkPermissionAndOpenModal() // RECURSIVE!
                  },
                  {
                    text: 'Cancel',
                    style: 'cancel'
                  }
                ]
              );
            }
          }
        }
      ]
    );
    return;
  }
  
  // Permission already granted
  setShowPrinterModal(true);
};
```

**Key Points:**
- ? Checks permission status BEFORE opening modal
- ? If denied, requests permission with explanation
- ? If user denies, offers "Try Again" (recursive call)
- ? User can cancel at any time
- ? Only opens modal when permission is granted

---

### 3. **Modal Behavior**

```typescript
// apps/mobile/components/PrinterSelectionModal.tsx

const handleScan = async () => {
  setState('scanning');
  
  // NO permission check here!
  // Permission is already guaranteed by App.tsx
  
  const foundDevices = await printer.scanDevices();
  
  if (foundDevices.length === 0) {
    // Show "pair device" instructions
  } else {
    setState('device-list');
  }
};
```

**Why no permission check in modal?**
- Permission is checked BEFORE modal opens
- Cleaner separation of concerns
- Reduces modal complexity
- Better UX (no permission dialogs inside modal)

---

## ? Permission Flow Summary

| Scenario | Behavior |
|----------|----------|
| **First app launch** | Alert on startup ? Request permission ? Auto-connect if granted |
| **Permission granted** | Direct to device list when clicking "Connect" |
| **Permission denied on startup** | App loads normally, ask again on "Connect" |
| **User clicks "Connect" without permission** | Alert ? Request ? If denied, offer "Try Again" ? Loop until granted or cancelled |
| **User denies permission multiple times** | Keep offering "Try Again" (persistent) |
| **User cancels permission request** | Stop asking (until next "Connect" click) |

---

## ?? Retry Loop Logic

```
User clicks "Connect"
  ?
Permission granted? ???YES??? Open Modal
  ?
  NO
  ?
Show Alert: "Grant Permission"
  ?
User clicks "Grant Permission"
  ?
Android Permission Dialog
  ?
Permission granted? ???YES??? Open Modal
  ?
  NO
  ?
Show Alert: "Try Again" or "Cancel"
  ?
User clicks "Try Again"
  ?
(Recursive call to checkPermissionAndOpenModal)
  ?
Loop continues until:
  - Permission granted ? Open modal
  - User clicks "Cancel" ? Stop
```

**This ensures:**
- ? Permission is ALWAYS requested until granted
- ? User is never stuck without a way to grant permission
- ? User can exit the loop at any time (Cancel button)
- ? Clear messaging about why permission is needed

---

## ?? Android System Behavior

### Important Notes:

1. **"Don't ask again" checkbox:**
   - After user denies twice, Android shows "Don't ask again" checkbox
   - If checked, `requestPermissions()` will immediately return DENIED
   - Our "Try Again" button will keep showing the alert, but permission dialog won't appear
   - User must manually enable in Settings ? Apps ? Morobooth ? Permissions

2. **Permission in Settings:**
   - User reported: "Di setting gak ada permission Bluetooth"
   - This is expected! Android doesn't show a "Bluetooth" permission in Settings
   - Instead, it shows as "Nearby devices" or similar
   - Our runtime permission request is the PRIMARY way to grant it

3. **Runtime vs Settings:**
   - Runtime permission (our implementation): ? Works, shows in our app
   - Settings permission: ? Not visible as "Bluetooth"
   - This is why we MUST use runtime permission requests

---

## ?? Edge Cases Handled

### 1. User Denies Permanently ("Don't Ask Again")
**Detection:** Permission request returns DENIED immediately
**Behavior:** 
- Show alert: "Permission is required..."
- Offer "Try Again" (will show alert again, not system dialog)
- User must go to Settings manually

**Future improvement:** Detect "never ask again" and show "Open Settings" button

### 2. User Revokes Permission While App Running
**Detection:** Permission check before each "Connect" click
**Behavior:** Same as first-time denial ? Request again

### 3. App Reinstalled
**Detection:** No previous permission state
**Behavior:** Fresh permission request on startup

### 4. Android Version < 12 (No BLUETOOTH_SCAN/CONNECT)
**Behavior:** Falls back to older Bluetooth permissions (handled by PermissionsAndroid)

---

## ?? Benefits of This Approach

? **Clear Communication:** User knows why permission is needed
? **Persistent:** Keeps asking until granted (but allows cancel)
? **Non-Blocking:** User can cancel and try later
? **Startup Request:** Best practice for critical permissions
? **Fallback on Connect:** Catches cases where permission was denied/revoked
? **Recursive Retry:** User can try again immediately if they denied by accident

---

## ?? Testing Checklist

- [ ] First launch ? Shows permission alert on startup
- [ ] Grant on startup ? Auto-connects to last printer
- [ ] Deny on startup ? App loads, asks again on "Connect"
- [ ] Grant on "Connect" ? Opens device modal
- [ ] Deny on "Connect" ? Shows "Try Again" alert
- [ ] Click "Try Again" ? Shows permission request again
- [ ] Deny multiple times ? "Don't ask again" appears (Android behavior)
- [ ] Click "Cancel" ? Stops asking (until next "Connect")
- [ ] Revoke permission in Settings ? Asks again on next "Connect"
- [ ] Already granted ? Direct to modal (no alerts)

---

## ?? Code Locations

- **Startup Request:** `apps/mobile/App.tsx` ? `requestAllPermissions()`
- **Connect-Time Check:** `apps/mobile/App.tsx` ? `checkPermissionAndOpenModal()`
- **Message Handlers:** `apps/mobile/App.tsx` ? `handleWebViewMessage()`
- **Modal:** `apps/mobile/components/PrinterSelectionModal.tsx` (no permission logic)

---

## ?? User Messages

### Startup
```
??? Bluetooth Permission Required

Morobooth needs Bluetooth permission to connect 
to your thermal printer.

Without this permission, you cannot print photos.

[Grant Permission]
```

### On Connect (Not Granted)
```
??? Bluetooth Permission Required

Morobooth needs Bluetooth permission to connect 
to your thermal printer.

[Cancel] [Grant Permission]
```

### After Denial
```
?? Permission Required

Bluetooth permission is required to connect to 
the printer. Please grant the permission to continue.

[Try Again] [Cancel]
```

All messages are clear, friendly, and actionable! ??

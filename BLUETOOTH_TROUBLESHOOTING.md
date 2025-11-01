# Bluetooth Troubleshooting Guide

## Masalah: Modal Bluetooth Tidak Muncul

### Penyebab Umum dan Solusi

#### 1. **Browser Tidak Mendukung Web Bluetooth API**
Web Bluetooth API hanya didukung oleh browser tertentu:

? **Didukung:**
- Google Chrome (desktop & Android)
- Microsoft Edge (desktop)
- Opera (desktop & Android)
- Samsung Internet

? **TIDAK Didukung:**
- Firefox
- Safari (iOS/macOS)
- Internet Explorer

**Solusi:** Gunakan Google Chrome atau Microsoft Edge.

---

#### 2. **Koneksi Tidak Menggunakan HTTPS atau Localhost**
Web Bluetooth API hanya bisa digunakan di secure context (HTTPS atau localhost).

**Cek URL Anda:**
- ? `https://example.com` - OK
- ? `http://localhost:3000` - OK
- ? `http://127.0.0.1:3000` - OK
- ? `http://192.168.x.x` - TIDAK OK
- ? `http://example.com` - TIDAK OK

**Solusi:**
- Untuk development: Gunakan `localhost` atau `127.0.0.1`
- Untuk production: Gunakan HTTPS
- Untuk testing di jaringan lokal: Setup HTTPS dengan self-signed certificate

---

#### 3. **Bluetooth Perangkat Tidak Aktif**
Pastikan Bluetooth pada komputer/laptop Anda aktif.

**Solusi:**
- Windows: Buka Settings ? Bluetooth & devices ? Pastikan ON
- macOS: System Preferences ? Bluetooth ? Turn Bluetooth On
- Linux: Gunakan `bluetoothctl` atau GUI settings

---

#### 4. **Permission Bluetooth Diblokir**
Browser mungkin memblokir akses Bluetooth.

**Cek Permission:**
1. Klik ikon gembok/info di address bar
2. Cari "Bluetooth"
3. Pastikan statusnya "Allow"

**Solusi:** 
- Reset permission: Settings ? Privacy ? Bluetooth ? Reset untuk situs ini
- Atau klik kanan di address bar ? Site settings ? Bluetooth ? Allow

---

#### 5. **User Gesture Diperlukan**
`navigator.bluetooth.requestDevice()` hanya bisa dipanggil sebagai respons langsung dari user action (klik, tap, dll).

**Solusi:**
Pastikan Anda klik tombol "Connect Bluetooth Printer" langsung, bukan dari script otomatis.

---

#### 6. **Printer Bluetooth Tidak Dalam Mode Pairing**
Printer harus dalam mode discoverable/pairing.

**Solusi:**
1. Nyalakan printer
2. Aktifkan mode Bluetooth pairing (biasanya dengan menekan tombol Bluetooth di printer)
3. Coba scan lagi dari aplikasi

---

#### 7. **Filter Terlalu Ketat**
Jika printer Anda tidak muncul di daftar, mungkin filter terlalu ketat.

**Printer yang didukung:**
- EPPOS EPX-58B
- XPRINTER XP-P300
- HOIN HOP H58
- BellaV EP-58A
- Generic 58mm/80mm printer
- Semua printer dengan prefix: EPPOS, EPX, XPRINTER, HOIN, BellaV, Printer, Thermal

**Solusi:**
Pastikan nama printer Anda mengandung salah satu kata kunci di atas.

---

### Debugging dengan Console

Sekarang aplikasi memiliki logging yang lebih detail. Buka Developer Console untuk melihat log:

**Cara membuka Console:**
- Windows/Linux: `F12` atau `Ctrl + Shift + J`
- macOS: `Cmd + Option + J`

**Log yang akan muncul:**
```
handleConnectBluetooth called
Using Web Bluetooth API
Calling bluetoothPrinter.connect()...
HybridBluetoothPrinterService.connect() called, isNative: false
Using Web Bluetooth, creating UniversalBluetoothPrinterService...
Calling webBluetooth.connect()...
UniversalBluetoothPrinterService.connect() called
Calling navigator.bluetooth.requestDevice with filters: [...]
```

**Jika modal tidak muncul, cek:**
1. Apakah ada error message di console?
2. Apakah log berhenti di suatu titik?
3. Apakah ada pesan "User cancelled" atau "not allowed"?

---

### Error Messages dan Solusinya

| Error Message | Penyebab | Solusi |
|--------------|----------|--------|
| "Web Bluetooth not supported" | Browser tidak support | Gunakan Chrome/Edge |
| "User cancelled" | User menutup modal | Normal, coba lagi |
| "Bluetooth requires HTTPS" | Tidak di HTTPS/localhost | Gunakan HTTPS atau localhost |
| "navigator.bluetooth is not available" | Browser/context tidak support | Cek browser dan URL |
| "NotFoundError" | Tidak ada device ditemukan | Aktifkan mode pairing di printer |
| "SecurityError" | Permission denied | Reset permission di browser |
| "NotAllowedError" | User gesture required | Klik tombol langsung |

---

### Testing Bluetooth Support

Untuk mengecek apakah browser mendukung Bluetooth, buka Console dan jalankan:

```javascript
console.log('Bluetooth supported:', 'bluetooth' in navigator);
```

Atau test langsung dengan:

```javascript
navigator.bluetooth.requestDevice({ acceptAllDevices: true })
  .then(device => console.log('Device selected:', device.name))
  .catch(error => console.error('Error:', error));
```

---

### Langkah-Langkah Troubleshooting

1. **Buka Console** (F12)
2. **Klik tombol "Connect Bluetooth Printer"**
3. **Perhatikan log yang muncul**
4. **Jika modal tidak muncul:**
   - Cek apakah ada error di console
   - Cek URL (harus HTTPS atau localhost)
   - Cek browser (harus Chrome/Edge)
   - Cek Bluetooth device aktif
   - Cek permission browser

5. **Jika modal muncul tapi printer tidak ada:**
   - Pastikan printer dalam mode pairing
   - Pastikan nama printer sesuai filter
   - Coba scan ulang

---

### Kontak Support

Jika masalah masih berlanjut setelah mengikuti panduan di atas:
1. Screenshot error message dari console
2. Catat browser & versi yang digunakan
3. Catat OS yang digunakan
4. Catat URL yang diakses
5. Hubungi developer dengan informasi di atas

Flow lengkap: Print → QR code → Download (dengan fresh signed URL)
1. User klik tombol Print
Lokasi: PhotoBoothApp.tsx - handlePrint() (baris 244-322)
User klik "Print" button
    ↓
Cek: Printer connected?
    ├─ NO → Show error "Please connect printer"
    └─ YES → Continue
User klik "Print" button    ↓Cek: Printer connected?    ├─ NO → Show error "Please connect printer"    └─ YES → Continue
2. Save photo ke local storage
Lokasi: PhotoBoothApp.tsx - handlePrint() (baris 259-292)
Cek: Photo sudah disimpan? (ada photoId?)
    ├─ YES → Reuse existing photoId
    │
    └─ NO → Save photo ke IndexedDB
        ↓
    savePhotoLocally(highResDataURL)
        ↓
    Generate photoId: {sessionCode}-{photoNumber}
        Contoh: "ABC123-001"
        ↓
    Simpan ke IndexedDB dengan:
        - id: photoId
        - imageDataURL: base64 image
        - timestamp: ISO timestamp
        - uploaded: false
        - supabasePath: null (belum ada)
        ↓
    Set photoId di PhotoBooth ref
Cek: Photo sudah disimpan? (ada photoId?)    ├─ YES → Reuse existing photoId    │    └─ NO → Save photo ke IndexedDB        ↓    savePhotoLocally(highResDataURL)        ↓    Generate photoId: {sessionCode}-{photoNumber}        Contoh: "ABC123-001"        ↓    Simpan ke IndexedDB dengan:        - id: photoId        - imageDataURL: base64 image        - timestamp: ISO timestamp        - uploaded: false        - supabasePath: null (belum ada)        ↓    Set photoId di PhotoBooth ref
3. Generate QR code
Lokasi: PhotoBoothApp.tsx - composeImageForPrint() (baris 68-98)
Dengan photoId yang sudah ada:
    ↓
getDownloadURL(photoId)
    ↓
Format: {baseUrl}/download/{photoId}
    Contoh: "https://morobooth.com/download/ABC123-001"
    atau: "http://localhost:5173/download/ABC123-001"
    ↓
generateQRCodeDataURL(downloadURL)
    ↓
QR Code generated:
    - Width: 200px
    - Error correction: Level M
    - Colors: Black on white
    ↓
QR Code sebagai DataURL (base64)
Dengan photoId yang sudah ada:    ↓getDownloadURL(photoId)    ↓Format: {baseUrl}/download/{photoId}    Contoh: "https://morobooth.com/download/ABC123-001"    atau: "http://localhost:5173/download/ABC123-001"    ↓generateQRCodeDataURL(downloadURL)    ↓QR Code generated:    - Width: 200px    - Error correction: Level M    - Colors: Black on white    ↓QR Code sebagai DataURL (base64)
4. Compose image dengan QR code
Lokasi: photoComposer.ts - composeResult() (baris 112-397)
composeResult(frames, template, qrCodeDataURL)
    ↓
1. Load header (image/text)
2. Render photos dengan dithering
3. Calculate QR position berdasarkan layout:
    - Vertical: Below photos, center
    - Horizontal: Right side, proportional
    - Grid: Bottom center, proportional
    ↓
4. Draw QR code di canvas
5. Add text: "Scan untuk download" + "(Valid 24 jam)"
    ↓
Final composite image (with QR code)
    ↓
Convert to DataURL (PNG)
composeResult(frames, template, qrCodeDataURL)    ↓1. Load header (image/text)2. Render photos dengan dithering3. Calculate QR position berdasarkan layout:    - Vertical: Below photos, center    - Horizontal: Right side, proportional    - Grid: Bottom center, proportional    ↓4. Draw QR code di canvas5. Add text: "Scan untuk download" + "(Valid 24 jam)"    ↓Final composite image (with QR code)    ↓Convert to DataURL (PNG)
5. Print via Bluetooth
Lokasi: PhotoBoothApp.tsx - handlePrint() (baris 306-314)
bluetoothPrinter.printImage(printDataURL)
    ↓
[HybridBluetoothPrinterService]
    ↓
Cek: Native or Web?
    ├─ Native → Convert to dithered bitmap
    │   ↓
    │   Send to native bridge
    │   ↓
    │   Native prints via Bluetooth
    │
    └─ Web → Use Web Bluetooth API
        ↓
    Send image data to printer
    ↓
Print complete! ✅
    Photo tercetak dengan QR code
bluetoothPrinter.printImage(printDataURL)    ↓[HybridBluetoothPrinterService]    ↓Cek: Native or Web?    ├─ Native → Convert to dithered bitmap    │   ↓    │   Send to native bridge    │   ↓    │   Native prints via Bluetooth    │    └─ Web → Use Web Bluetooth API        ↓    Send image data to printer    ↓Print complete! ✅    Photo tercetak dengan QR code
6. Upload photo (manual dari admin)
Lokasi: AdminPage.tsx - Tab Upload (baris 832-889)
Admin buka Admin Panel → Tab "Upload"
    ↓
Tampilkan unuploaded photos
    ↓
Admin klik "Upload All Photos"
    ↓
bulkUploadPhotos(unuploadedPhotos)
    ↓
Untuk setiap photo:
    1. Convert imageDataURL → Blob
    2. Upload ke Supabase Storage
       Path: photos/{photoId}.png
       Contoh: photos/ABC123-001.png
    3. Generate signed URL (24 jam) - untuk backward compat
    4. Mark photo as uploaded:
       - uploaded: true
       - supabaseUrl: signed URL (temporary)
       - supabasePath: "ABC123-001.png" ✅ (permanent)
    ↓
Photo sekarang tersedia di cloud
Admin buka Admin Panel → Tab "Upload"    ↓Tampilkan unuploaded photos    ↓Admin klik "Upload All Photos"    ↓bulkUploadPhotos(unuploadedPhotos)    ↓Untuk setiap photo:    1. Convert imageDataURL → Blob    2. Upload ke Supabase Storage       Path: photos/{photoId}.png       Contoh: photos/ABC123-001.png    3. Generate signed URL (24 jam) - untuk backward compat    4. Mark photo as uploaded:       - uploaded: true       - supabaseUrl: signed URL (temporary)       - supabasePath: "ABC123-001.png" ✅ (permanent)    ↓Photo sekarang tersedia di cloud
7. User scan QR code
User scan QR code dari printed photo
    ↓
QR code berisi: https://morobooth.com/download/ABC123-001
    ↓
Browser buka URL: /download/ABC123-001
    ↓
App routing detect: path.startsWith('/download/')
    ↓
Extract photoId: "ABC123-001"
    ↓
Navigate ke DownloadPage dengan photoId
User scan QR code dari printed photo    ↓QR code berisi: https://morobooth.com/download/ABC123-001    ↓Browser buka URL: /download/ABC123-001    ↓App routing detect: path.startsWith('/download/')    ↓Extract photoId: "ABC123-001"    ↓Navigate ke DownloadPage dengan photoId
8. Download page load photo (fresh signed URL)
Lokasi: DownloadPage.tsx - loadPhoto() (enhanced version)
DownloadPage loads
    ↓
loadPhoto()
    ↓
1. getPhotoById(photoId) dari IndexedDB
    ↓
2. Validasi 24 jam:
    - photoTime = new Date(photo.timestamp)
    - now = new Date()
    - hoursSincePhoto = (now - photoTime) / (1000 * 60 * 60)
    - If hoursSincePhoto > 24 → Error "Photo expired"
    ↓
3. Cek upload status:
    ├─ Uploaded & supabasePath exists?
    │   ↓
    │   ✅ Generate fresh signed URL on-demand
    │   getFreshSignedUrl(photo.supabasePath)
    │   ↓
    │   Supabase: createSignedUrl("ABC123-001.png", 86400)
    │   ↓
    │   Dapat fresh signed URL (valid 24 jam dari sekarang)
    │   ↓
    │   Set downloadUrl = fresh signed URL
    │   ↓
    │   Display photo + download button ✅
    │
    └─ Not uploaded OR no supabasePath?
        ↓
    Fallback ke local storage
    (hanya device yang sama)
    ↓
    Set downloadUrl = photo.imageDataURL
    ↓
    Display photo + download button
    (dengan warning "Local only" jika belum uploaded)
DownloadPage loads    ↓loadPhoto()    ↓1. getPhotoById(photoId) dari IndexedDB    ↓2. Validasi 24 jam:    - photoTime = new Date(photo.timestamp)    - now = new Date()    - hoursSincePhoto = (now - photoTime) / (1000 * 60 * 60)    - If hoursSincePhoto > 24 → Error "Photo expired"    ↓3. Cek upload status:    ├─ Uploaded & supabasePath exists?    │   ↓    │   ✅ Generate fresh signed URL on-demand    │   getFreshSignedUrl(photo.supabasePath)    │   ↓    │   Supabase: createSignedUrl("ABC123-001.png", 86400)    │   ↓    │   Dapat fresh signed URL (valid 24 jam dari sekarang)    │   ↓    │   Set downloadUrl = fresh signed URL    │   ↓    │   Display photo + download button ✅    │    └─ Not uploaded OR no supabasePath?        ↓    Fallback ke local storage    (hanya device yang sama)    ↓    Set downloadUrl = photo.imageDataURL    ↓    Display photo + download button    (dengan warning "Local only" jika belum uploaded)
9. User download photo
Lokasi: DownloadPage.tsx - handleDownload() (baris 32-39)
User klik "Download Photo"
    ↓
handleDownload()
    ↓
Create download link:
    - href: downloadUrl (fresh signed URL atau local)
    - download: "{photoId}.png"
    ↓
Trigger download
    ↓
Photo downloaded! ✅
User klik "Download Photo"    ↓handleDownload()    ↓Create download link:    - href: downloadUrl (fresh signed URL atau local)    - download: "{photoId}.png"    ↓Trigger download    ↓Photo downloaded! ✅
Flow diagram lengkap (updated)
┌─────────────────────────────────────────────────────────────┐
│ 1. USER KLIK PRINT BUTTON                                    │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SAVE PHOTO TO LOCAL STORAGE                              │
│    - Cek: Photo sudah disimpan?                             │
│    - Jika belum: savePhotoLocally()                         │
│    - Generate photoId: "ABC123-001"                         │
│    - Simpan ke IndexedDB:                                    │
│      • uploaded: false                                      │
│      • supabasePath: null                                    │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. GENERATE QR CODE                                          │
│    - getDownloadURL(photoId)                                │
│    - URL: "https://morobooth.com/download/ABC123-001"       │
│    - generateQRCodeDataURL(url)                             │
│    - QR Code sebagai DataURL                                │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. COMPOSE IMAGE WITH QR CODE                                │
│    - composeResult(frames, template, qrCodeDataURL)         │
│    - Render photos + header                                 │
│    - Draw QR code (position based on layout)                │
│    - Add text: "Scan untuk download"                        │
│    - Final composite as DataURL                             │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. PRINT VIA BLUETOOTH                                       │
│    - bluetoothPrinter.printImage(printDataURL)              │
│    - Convert to dithered bitmap (native)                     │
│    - Send to printer                                         │
│    - Print complete! ✅                                       │
│    Photo tercetak dengan QR code                            │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. UPLOAD PHOTO (Manual dari Admin)                          │
│    - Admin → Tab Upload                                      │
│    - Klik "Upload All Photos"                               │
│    - bulkUploadPhotos() → Supabase Storage                  │
│    - Upload: photos/ABC123-001.png                          │
│    - Mark as uploaded:                                      │
│      • uploaded: true                                       │
│      • supabasePath: "ABC123-001.png" ✅                     │
│      • supabaseUrl: signed URL (temporary, untuk compat)    │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. USER SCAN QR CODE                                         │
│    - QR code: "https://morobooth.com/download/ABC123-001"   │
│    - Browser buka /download/ABC123-001                      │
│    - Navigate ke DownloadPage                                │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. DOWNLOAD PAGE LOAD PHOTO (FRESH SIGNED URL)              │
│    - getPhotoById(photoId) dari IndexedDB                  │
│    - Validasi 24 jam ✓                                       │
│    - Cek: uploaded & supabasePath?                          │
│      ├─ YES → getFreshSignedUrl("ABC123-001.png")           │
│      │        ↓                                              │
│      │        Generate fresh signed URL (valid 24 jam)      │
│      │        ↓                                              │
│      │        Display photo dari cloud ✅                   │
│      │                                                       │
│      └─ NO → Fallback ke local storage                      │
│              Display photo dari local                       │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. USER DOWNLOAD PHOTO                                       │
│    - Klik "Download Photo"                                   │
│    - Download dari fresh signed URL atau local              │
│    - Photo downloaded! ✅                                    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐│ 1. USER KLIK PRINT BUTTON                                    │└─────────────────────────────────────────────────────────────┘                    ↓┌─────────────────────────────────────────────────────────────┐│ 2. SAVE PHOTO TO LOCAL STORAGE                              ││    - Cek: Photo sudah disimpan?                             ││    - Jika belum: savePhotoLocally()                         ││    - Generate photoId: "ABC123-001"                         ││    - Simpan ke IndexedDB:                                    ││      • uploaded: false                                      ││      • supabasePath: null                                    │└─────────────────────────────────────────────────────────────┘                    ↓┌─────────────────────────────────────────────────────────────┐│ 3. GENERATE QR CODE                                          ││    - getDownloadURL(photoId)                                ││    - URL: "https://morobooth.com/download/ABC123-001"       ││    - generateQRCodeDataURL(url)                             ││    - QR Code sebagai DataURL                                │└─────────────────────────────────────────────────────────────┘                    ↓┌─────────────────────────────────────────────────────────────┐│ 4. COMPOSE IMAGE WITH QR CODE                                ││    - composeResult(frames, template, qrCodeDataURL)         ││    - Render photos + header                                 ││    - Draw QR code (position based on layout)                ││    - Add text: "Scan untuk download"                        ││    - Final composite as DataURL                             │└─────────────────────────────────────────────────────────────┘                    ↓┌─────────────────────────────────────────────────────────────┐│ 5. PRINT VIA BLUETOOTH                                       ││    - bluetoothPrinter.printImage(printDataURL)              ││    - Convert to dithered bitmap (native)                     ││    - Send to printer                                         ││    - Print complete! ✅                                       ││    Photo tercetak dengan QR code                            │└─────────────────────────────────────────────────────────────┘                    ↓┌─────────────────────────────────────────────────────────────┐│ 6. UPLOAD PHOTO (Manual dari Admin)                          ││    - Admin → Tab Upload                                      ││    - Klik "Upload All Photos"                               ││    - bulkUploadPhotos() → Supabase Storage                  ││    - Upload: photos/ABC123-001.png                          ││    - Mark as uploaded:                                      ││      • uploaded: true                                       ││      • supabasePath: "ABC123-001.png" ✅                     ││      • supabaseUrl: signed URL (temporary, untuk compat)    │└─────────────────────────────────────────────────────────────┘                    ↓┌─────────────────────────────────────────────────────────────┐│ 7. USER SCAN QR CODE                                         ││    - QR code: "https://morobooth.com/download/ABC123-001"   ││    - Browser buka /download/ABC123-001                      ││    - Navigate ke DownloadPage                                │└─────────────────────────────────────────────────────────────┘                    ↓┌─────────────────────────────────────────────────────────────┐│ 8. DOWNLOAD PAGE LOAD PHOTO (FRESH SIGNED URL)              ││    - getPhotoById(photoId) dari IndexedDB                  ││    - Validasi 24 jam ✓                                       ││    - Cek: uploaded & supabasePath?                          ││      ├─ YES → getFreshSignedUrl("ABC123-001.png")           ││      │        ↓                                              ││      │        Generate fresh signed URL (valid 24 jam)      ││      │        ↓                                              ││      │        Display photo dari cloud ✅                   ││      │                                                       ││      └─ NO → Fallback ke local storage                      ││              Display photo dari local                       │└─────────────────────────────────────────────────────────────┘                    ↓┌─────────────────────────────────────────────────────────────┐│ 9. USER DOWNLOAD PHOTO                                       ││    - Klik "Download Photo"                                   ││    - Download dari fresh signed URL atau local              ││    - Photo downloaded! ✅                                    │└─────────────────────────────────────────────────────────────┘
Timeline & status (updated)
Step	Status	Location	Data Stored
1. Print clicked	✅	PhotoBoothApp.tsx	-
2. Photo saved	✅	IndexedDB	photoId, imageDataURL, timestamp, uploaded: false, supabasePath: null
3. QR generated	✅	qrCodeGenerator.ts	QR code dengan /download/{photoId}
4. Image composed	✅	photoComposer.ts	Final image dengan QR code
5. Printed	✅	Bluetooth printer	Physical print dengan QR
6. Upload (manual)	⚠️ Manual	AdminPage.tsx	uploaded: true, supabasePath: "ABC123-001.png" ✅
7. QR scanned	✅	User's device	-
8. Download page	✅	DownloadPage.tsx	Load photo → Generate fresh signed URL on-demand
9. Photo downloaded	✅	DownloadPage.tsx	File downloaded dari fresh signed URL
Poin penting (updated)
QR code tetap pendek: /download/{photoId} (tidak pakai signed URL panjang)
Photo disimpan saat print (bukan saat capture)
Upload manual dari Admin Panel (tab Upload)
Simpan supabasePath (permanent), bukan signed URL (expired)
Download page:
Validasi 24 jam dari timestamp photo
Generate fresh signed URL on-demand jika sudah uploaded
Signed URL selalu fresh (tidak pernah expired)
Fallback ke local jika belum uploaded
Offline support:
QR code tetap bisa di-generate
Download dari local storage (device yang sama)
Upload saat online
Keuntungan flow ini
QR code pendek dan clean: /download/{photoId}
Signed URL selalu fresh (generate on-demand)
Tidak ada expired signed URL di storage
Web app sebagai perantara (sudah ada)
Fallback ke local storage jika belum uploaded
Validasi 24 jam dari timestamp photo (bukan dari signed URL)
Flow ini sudah optimal dan siap diimplementasikan.



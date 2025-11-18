import { UniversalBluetoothPrinterService } from './universalBluetoothPrinterService';
import { nativeBridge } from './nativeBridgeService';
import { createStreetCoffeeReceipt } from './receiptTemplates';
import { DEFAULT_PRINTER_OUTPUT } from './configService';

interface PrinterInfo {
  name: string;
  width?: number;
  dpi?: number;
  address?: string;
}

export class HybridBluetoothPrinterService {
  private webBluetooth: UniversalBluetoothPrinterService | null = null;
  private isNative: boolean = false;
  private isConnected: boolean = false;
  private printerInfo: PrinterInfo | null = null;
  private listenersSetup: boolean = false;

  constructor() {
    this.isNative = nativeBridge.isNativeApp() && nativeBridge.hasNativeBluetooth();
    
    if (this.isNative) {
      this.setupNativeListeners();
    }
  }

  private setupNativeListeners(): void {
    if (this.listenersSetup) {
      console.log('Listeners already setup, skipping');
      return;
    }
    this.listenersSetup = true;
    nativeBridge.onMessage('BLUETOOTH_DEVICES_FOUND', (data) => {
      console.log('Devices found:', data.devices);
      // Notify UI
      const event = new CustomEvent('bluetoothDevicesFound', { detail: { devices: data.devices } });
      window.dispatchEvent(event);
    });

    nativeBridge.onMessage('BLUETOOTH_CONNECTED', (data) => {
      this.isConnected = data.connected;
      this.printerInfo = { name: data.device?.name ?? 'Native Bluetooth Printer', address: data.device?.id };
      
      // Notify UI
      const event = new CustomEvent('bluetoothStatusChange', { 
        detail: { connected: true, info: this.printerInfo } 
      });
      window.dispatchEvent(event);
    });

    nativeBridge.onMessage('BLUETOOTH_DISCONNECTED', () => {
      this.isConnected = false;
      this.printerInfo = null;
      
      // Notify UI
      const event = new CustomEvent('bluetoothStatusChange', { 
        detail: { connected: false, info: null } 
      });
      window.dispatchEvent(event);
    });

    nativeBridge.onMessage('BLUETOOTH_ERROR', (data) => {
      console.error('Native Bluetooth error:', data.error);
      // Dispatch custom event instead of alert
      const event = new CustomEvent('bluetoothError', { 
        detail: { error: data.error } 
      });
      window.dispatchEvent(event);
    });

    nativeBridge.onMessage('PRINT_SUCCESS', (data) => {
      if (data.success) {
        console.log('Print successful via native');
        // Notify UI
        const event = new CustomEvent('printProgress', { 
          detail: { status: 'Printed', progress: 100 } 
        });
        window.dispatchEvent(event);
      }
    });

    nativeBridge.onMessage('PRINT_PROGRESS', (data) => {
      // Trigger UI update
      const event = new CustomEvent('printProgress', { detail: data });
      window.dispatchEvent(event);
    });
  }

  async scanPrinters(): Promise<unknown[]> {
    if (this.isNative) {
      nativeBridge.sendMessage('SCAN_BLUETOOTH_PRINTERS');
      return []; // Results will come via onMessage
    }
    return [];
  }

  async connect(address?: string): Promise<boolean> {
    if (this.isNative) {
      if (address) {
        nativeBridge.sendMessage('CONNECT_BLUETOOTH_PRINTER', { deviceId: address });
        return true;
      } else {
        // Trigger scan first
        await this.scanPrinters();
        return false;
      }
    } else {
      // Fallback to Web Bluetooth
      this.webBluetooth = new UniversalBluetoothPrinterService();
      const connected = await this.webBluetooth.connect();
      this.isConnected = connected;
      if (connected) {
        const info = this.webBluetooth.getPrinterInfo();
        if (info) {
          this.printerInfo = {
            name: info.name,
            width: info.width,
            dpi: info.dpi
          };
        }
      }
      return connected;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isNative) {
      nativeBridge.sendMessage('DISCONNECT_BLUETOOTH_PRINTER');
    } else if (this.webBluetooth) {
      await this.webBluetooth.disconnect();
    }
    this.isConnected = false;
    this.printerInfo = null;
  }

  async printImage(imageDataURL: string, width: number = 384): Promise<boolean> {
    if (this.isNative) {
      // Convert image to 1-bit dithered bitmap
      const bitmap = await this.convertToDitheredBitmap(imageDataURL, width);
      
      nativeBridge.sendMessage('PRINT_DITHERED_BITMAP', {
        bitmapBase64: bitmap.base64,
        width: bitmap.width,
        height: bitmap.height
      });
      
      return true;
    } else {
      // Web Bluetooth fallback
      return await this.webBluetooth?.printImage(imageDataURL) || false;
    }
  }

  async printStreetCoffeeReceipt(width?: number): Promise<boolean> {
    const targetWidth = width ?? this.printerInfo?.width ?? 384;
    console.log('Generating Street Coffee receipt for test print...');
    const receiptDataURL = createStreetCoffeeReceipt(targetWidth);
    return this.printImage(receiptDataURL, targetWidth);
  }

  private async convertToDitheredBitmap(
    imageDataURL: string,
    targetWidth: number
  ): Promise<{ base64: string; width: number; height: number }> {
    const IMAGE_LOAD_TIMEOUT = 10000; // 10 seconds timeout
    
    // Load custom printer output settings from localStorage if available
    let customSettings: { threshold?: number; gamma?: number; dithering?: boolean; sharpen?: number } | null = null;
    try {
      const stored = localStorage.getItem('morobooth_printer_output_settings');
      if (stored) {
        customSettings = JSON.parse(stored);
        console.log('Native printer: Using custom settings:', customSettings);
      }
    } catch (error) {
      console.warn('Native printer: Failed to load custom settings:', error);
    }
    
    // Get settings with defaults
    // Use explicit checks to preserve 0 and false values
    // Use DEFAULT_PRINTER_OUTPUT from configService for consistency
    const threshold = customSettings?.threshold !== undefined 
      ? customSettings.threshold 
      : DEFAULT_PRINTER_OUTPUT.threshold!;
    const gamma = customSettings?.gamma !== undefined 
      ? customSettings.gamma 
      : DEFAULT_PRINTER_OUTPUT.gamma!;
    const applyDithering = customSettings?.dithering !== undefined 
      ? customSettings.dithering 
      : DEFAULT_PRINTER_OUTPUT.dithering!;
    const sharpenAmount = customSettings?.sharpen !== undefined 
      ? customSettings.sharpen 
      : DEFAULT_PRINTER_OUTPUT.sharpen!;
    
    return Promise.race<{ base64: string; width: number; height: number }>([
      new Promise<{ base64: string; width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        let resolved = false;
        
        img.onload = () => {
          if (resolved) return; // Prevent multiple calls
          resolved = true;
          
          try {
            const aspectRatio = img.height / img.width;
            const targetHeight = Math.floor(targetWidth * aspectRatio);
            
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas context not available'));
              return;
            }
            
            // CRITICAL: Disable image smoothing for thermal printer (preserve pure black/white)
            ctx.imageSmoothingEnabled = false;
            
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            
            // Apply sharpen if enabled
            if (sharpenAmount > 0) {
              this.applySharpenToImageData(imageData, sharpenAmount);
            }
            
            // Apply gamma correction
            if (gamma !== 1) {
              this.applyGammaToImageData(imageData, gamma);
            }
            
            // Apply dithering based on settings
            if (applyDithering) {
              // Use ordered dithering for native (faster than Floyd-Steinberg)
              this.applyOrderedDither(imageData);
            } else {
              // Simple threshold without dithering
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                const gray = data[i]; // R channel (already grayscale)
                const value = gray < threshold ? 0 : 255;
                data[i] = value;
                data[i + 1] = value;
                data[i + 2] = value;
              }
            }
            
            // Convert to 1-bit bitmap (0=white, 1=black)
            const bitmap = new Uint8Array(targetWidth * targetHeight);
            let blackCount = 0;
            let whiteCount = 0;
            for (let i = 0; i < imageData.data.length; i += 4) {
              const pixelIndex = i / 4;
              const gray = imageData.data[i]; // R channel
              // Optimize: if dithering was not applied, imageData is already 0 or 255
              // So we can use direct comparison instead of redundant threshold check
              const v = applyDithering 
                ? (gray < threshold ? 1 : 0)  // Dithering applied: may have values 0-255, use threshold
                : (gray === 0 ? 1 : 0);        // No dithering: already 0 or 255, use direct check
              bitmap[pixelIndex] = v;
              if (v === 1) blackCount++; else whiteCount++;
            }
            
            // Convert to base64 (chunked for large arrays)
            const base64 = this.arrayToBase64(bitmap);
            
            // Debug stats untuk memastikan ada black pixels
            console.log('Dithered bitmap stats:', {
              width: targetWidth,
              height: targetHeight,
              totalPixels: blackCount + whiteCount,
              blackPixels: blackCount,
              whitePixels: whiteCount,
              blackPercentage: (blackCount + whiteCount) > 0 ? ((blackCount / (blackCount + whiteCount)) * 100).toFixed(2) + '%' : '0%',
              threshold,
              gamma,
              sharpen: sharpenAmount,
              dithering: applyDithering,
              usingCustomSettings: customSettings !== null
            });
            
            // Enhanced debug logging for chunking
            console.log('Dithered bitmap conversion:', {
              width: targetWidth,
              height: targetHeight,
              bitmapArrayLength: bitmap.length,
              base64Length: base64.length,
              expectedPackedBytes: Math.ceil(targetWidth / 8) * targetHeight,
              expectedUnpackedPixels: targetWidth * targetHeight,
              willBeChunked: true // Always true now
            });

            resolve({
              base64,
              width: targetWidth,
              height: targetHeight
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error('Failed to process image'));
          }
        };
        
        img.onerror = () => {
          if (resolved) return; // Prevent multiple calls
          resolved = true;
          reject(new Error('Failed to load image'));
        };
        
        img.src = imageDataURL;
      }),
      new Promise<{ base64: string; width: number; height: number }>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Image conversion timeout after ${IMAGE_LOAD_TIMEOUT / 1000} seconds`));
        }, IMAGE_LOAD_TIMEOUT);
      })
    ]);
  }

  private arrayToBase64(arr: Uint8Array): string {
    // Build the binary string in manageable chunks, then encode once.
    const chunkSize = 0x8000; // 32k - safe for String.fromCharCode spreads
    const segments: string[] = [];
    
    for (let i = 0; i < arr.length; i += chunkSize) {
      const chunk = arr.subarray(i, i + chunkSize);
      segments.push(String.fromCharCode(...chunk));
    }
    
    return btoa(segments.join(''));
  }

  private applySharpenToImageData(imageData: ImageData, amount: number): void {
    const strength = Math.min(Math.max(amount, 0), 1);
    if (strength <= 0) return;

    const { data, width, height } = imageData;
    const original = new Uint8ClampedArray(data);
    const kernel = [
      0, -strength, 0,
      -strength, 1 + 4 * strength, -strength,
      0, -strength, 0
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let value = 0;

        for (let ky = -1; ky <= 1; ky++) {
          const sampleY = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const sampleX = Math.min(width - 1, Math.max(0, x + kx));
            const weight = kernel[(ky + 1) * 3 + (kx + 1)];
            const idx = (sampleY * width + sampleX) * 4;
            value += original[idx] * weight; // Use R channel (grayscale)
          }
        }

        const destIdx = (y * width + x) * 4;
        const clamped = Math.min(255, Math.max(0, Math.round(value)));
        data[destIdx] = clamped;
        data[destIdx + 1] = clamped;
        data[destIdx + 2] = clamped;
      }
    }
  }

  private applyGammaToImageData(imageData: ImageData, gamma: number): void {
    if (gamma === 1) return;

    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i]; // R channel (grayscale)
      const normalized = gray / 255;
      const gammaCorrected = Math.pow(normalized, gamma);
      const adjusted = Math.min(255, Math.max(0, Math.round(gammaCorrected * 255)));
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
  }

  private applyOrderedDither(imageData: ImageData): void {
    const M4 = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    
    const M = M4;
    const n = M.length;
    const n2 = n * n;
    const scale = 255 / n2;
    
    for (let y = 0; y < imageData.height; y++) {
      for (let x = 0; x < imageData.width; x++) {
        const idx = (y * imageData.width + x) * 4;
        const lum = imageData.data[idx];
        const threshold = M[y % n][x % n] * scale;
        const v = lum < threshold ? 0 : 255;
        
        imageData.data[idx] = v;
        imageData.data[idx + 1] = v;
        imageData.data[idx + 2] = v;
      }
    }
  }

  getPrinterInfo(): PrinterInfo | null {
    return this.printerInfo;
  }

  isNativeEnvironment(): boolean {
    // Re-check at runtime in case window.isNativeApp was not available during construction
    const nowNative = nativeBridge.isNativeApp() && nativeBridge.hasNativeBluetooth();
    if (nowNative && !this.isNative) {
      console.log('Native environment detected at runtime, updating state');
      this.isNative = nowNative;
      if (nowNative) {
        this.setupNativeListeners();
      }
    }
    return this.isNative;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

// Export singleton instance
let singletonInstance: HybridBluetoothPrinterService | null = null;

export function getHybridBluetoothPrinterService(): HybridBluetoothPrinterService {
  if (!singletonInstance) {
    console.log('Creating singleton HybridBluetoothPrinterService');
    singletonInstance = new HybridBluetoothPrinterService();
  }
  return singletonInstance;
}
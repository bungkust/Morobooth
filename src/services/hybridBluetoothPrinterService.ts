import { UniversalBluetoothPrinterService } from './universalBluetoothPrinterService';
import { nativeBridge } from './nativeBridgeService';
import { createStreetCoffeeReceipt } from './receiptTemplates';

export class HybridBluetoothPrinterService {
  private webBluetooth: UniversalBluetoothPrinterService | null = null;
  private isNative: boolean = false;
  private isConnected: boolean = false;
  private printerInfo: any = null;
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

  async scanPrinters(): Promise<any[]> {
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
        this.printerInfo = this.webBluetooth.getPrinterInfo();
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
            
            // Apply ordered dithering directly to ImageData
            this.applyOrderedDither(imageData);
            
            // Convert to 1-bit bitmap (0=white, 1=black)
            const bitmap = new Uint8Array(targetWidth * targetHeight);
            let blackCount = 0;
            let whiteCount = 0;
            for (let i = 0; i < imageData.data.length; i += 4) {
              const pixelIndex = i / 4;
              const gray = imageData.data[i]; // R channel
              const v = gray < 128 ? 1 : 0;
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
              blackPercentage: (blackCount + whiteCount) > 0 ? ((blackCount / (blackCount + whiteCount)) * 100).toFixed(2) + '%' : '0%'
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

  getPrinterInfo(): any {
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
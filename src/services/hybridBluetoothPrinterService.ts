import { UniversalBluetoothPrinterService } from './universalBluetoothPrinterService';
import { nativeBridge } from './nativeBridgeService';
import { orderedDither } from '../utils/dithering';

export class HybridBluetoothPrinterService {
  private webBluetooth: UniversalBluetoothPrinterService | null = null;
  private isNative: boolean = false;
  private isConnected: boolean = false;
  private printerInfo: any = null;

  constructor() {
    this.isNative = nativeBridge.isNativeApp() && nativeBridge.hasNativeBluetooth();
    
    if (this.isNative) {
      this.setupNativeListeners();
    }
  }

  private setupNativeListeners(): void {
    nativeBridge.onMessage('BLUETOOTH_DEVICES_FOUND', (data) => {
      console.log('Devices found:', data.devices);
      // Could trigger UI update here
    });

    nativeBridge.onMessage('BLUETOOTH_CONNECTED', (data) => {
      this.isConnected = data.connected;
      this.printerInfo = { name: 'Native Bluetooth Printer', address: data.device?.id };
    });

    nativeBridge.onMessage('BLUETOOTH_DISCONNECTED', () => {
      this.isConnected = false;
      this.printerInfo = null;
    });

    nativeBridge.onMessage('BLUETOOTH_ERROR', (data) => {
      console.error('Native Bluetooth error:', data.error);
      alert('Bluetooth Error: ' + data.error);
    });

    nativeBridge.onMessage('PRINT_SUCCESS', (data) => {
      if (data.success) {
        console.log('Print successful via native');
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

  private async convertToDitheredBitmap(
    imageDataURL: string,
    targetWidth: number
  ): Promise<{ base64: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.height / img.width;
        const targetHeight = Math.floor(targetWidth * aspectRatio);
        
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context not available'));
        
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        
        // Apply dithering (reuse existing orderedDither)
        const dithered = orderedDither(imageData);
        
        // Convert to 1-bit bitmap (0=white, 1=black)
        const bitmap = new Uint8Array(targetWidth * targetHeight);
        for (let i = 0; i < dithered.data.length; i += 4) {
          const pixelIndex = i / 4;
          const gray = dithered.data[i]; // R channel (already B&W)
          bitmap[pixelIndex] = gray < 128 ? 1 : 0;
        }
        
        // Convert to base64 (chunked for large arrays)
        const base64 = this.arrayToBase64(bitmap);
        
        resolve({
          base64,
          width: targetWidth,
          height: targetHeight
        });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageDataURL;
    });
  }

  private arrayToBase64(arr: Uint8Array): string {
    // Chunked conversion to avoid stack overflow with large arrays
    const chunkSize = 8192;
    let result = '';
    
    for (let i = 0; i < arr.length; i += chunkSize) {
      const chunk = arr.slice(i, i + chunkSize);
      result += btoa(String.fromCharCode(...chunk));
    }
    
    return result;
  }

  getPrinterInfo(): any {
    return this.printerInfo;
  }

  isNativeEnvironment(): boolean {
    return this.isNative;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}




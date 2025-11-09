import BleManager from 'react-native-ble-manager';
import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import { Buffer } from 'buffer';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export interface PrinterDevice {
  id: string;
  name: string;
  rssi?: number;
}

export class NativeBLEPrinter {
  private connectedDeviceId: string | null = null;
  private characteristicUUID: string = '0000ff02-0000-1000-8000-00805f9b34fb';
  private serviceUUID: string = '0000ff00-0000-1000-8000-00805f9b34fb';
  private mtu: number = 20;
  private characteristicProperties: any = null;
  
  private listeners: any[] = [];

  async init(): Promise<void> {
    await BleManager.start({ showAlert: false });
    
    // Setup listeners
    this.listeners.push(
      bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.handleDisconnect)
    );
  }

  private handleDisconnect = (data: any) => {
    console.log('Printer disconnected:', data);
    if (data.peripheral === this.connectedDeviceId) {
      this.connectedDeviceId = null;
      // Skip auto-reconnect to prevent infinite loop
      // User can manually reconnect if needed
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      
      return Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  }

  async scanDevices(): Promise<PrinterDevice[]> {
    try {
      console.log('Getting bonded/paired devices...');
      const peripherals = await BleManager.getBondedPeripherals();
      console.log(`Found ${peripherals.length} bonded devices`);
      
      // Filter out null/undefined devices and map to PrinterDevice
      const printers = peripherals
        .filter((device: any) => device && device.id)
        .map((device: any) => ({
          id: device.id,
          name: device.name ?? 'Unknown Device',
          rssi: device.rssi
        }));
      
      console.log(`Returning ${printers.length} devices`);
      return printers;
    } catch (error) {
      console.error('Error getting bonded peripherals:', error);
      return [];
    }
  }

  async connect(deviceId: string): Promise<boolean> {
    try {
      console.log('Connecting to device:', deviceId);
      
      // Add timeout to prevent hanging
      const connectPromise = BleManager.connect(deviceId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout after 10 seconds. Make sure the printer is turned on and nearby.')), 10000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      console.log('Connected, discovering services...');
      const peripheralInfo: any = await BleManager.retrieveServices(deviceId);
      
      console.log('peripheralInfo structure:', JSON.stringify(Object.keys(peripheralInfo)));
      console.log('Has services:', !!peripheralInfo.services);
      console.log('Has characteristics:', !!peripheralInfo.characteristics);
      
      // Check if characteristics are directly available (new API)
      if (peripheralInfo.characteristics && peripheralInfo.characteristics.length > 0) {
        console.log('Found characteristics directly in peripheralInfo:', peripheralInfo.characteristics.length);
        
        for (const char of peripheralInfo.characteristics as any[]) {
          const c: any = char;
          console.log('Checking characteristic:', c.characteristic, 'properties:', c.properties);
          
          if (c.properties?.Write || c.properties?.WriteWithoutResponse) {
            console.log('Found writable characteristic:', c.characteristic);
            
            // Find the service UUID for this characteristic
            let foundService: any = null;
            if (peripheralInfo.services && peripheralInfo.services.length > 0) {
              // Try to match characteristic to service by checking service UUID
              for (const service of peripheralInfo.services as any[]) {
                const s: any = service;
                if (c.service === s.uuid || c.serviceUUID === s.uuid) {
                  foundService = s;
                  break;
                }
              }
              // Fallback: use first service if no match found
              if (!foundService) {
                foundService = peripheralInfo.services[0];
              }
            }
            
            if (foundService) {
              this.serviceUUID = foundService.uuid;
            }
            
            this.characteristicUUID = c.characteristic;
            this.characteristicProperties = c.properties;
            
            // MTU negotiation with proper error handling
            try {
              console.log('Requesting MTU...');
              await BleManager.requestMTU(deviceId, 512);
              // MTU request is async, wait a bit for it to complete
              await new Promise(resolve => setTimeout(resolve, 500));
              // Default to 512 if MTU negotiation succeeded
              this.mtu = 509; // 512 - 3 bytes overhead
              console.log('MTU negotiation succeeded, using MTU:', this.mtu);
            } catch (e) {
              console.log('MTU negotiation failed, using default MTU:', this.mtu);
            }
            
            this.connectedDeviceId = deviceId;
            console.log('Successfully connected to printer');
            return true;
          }
        }
      }
      
      // Fallback: Old API with services (should not reach here in v11.5.0)
      if (peripheralInfo.services && peripheralInfo.services.length > 0) {
        console.log('Trying old API with services:', peripheralInfo.services.length);
        for (const service of peripheralInfo.services as any[]) {
          const s: any = service;
          console.log('Service UUID:', s.uuid);
          // In old API, service should have characteristics
          if (s.characteristics && s.characteristics.length > 0) {
            for (const char of s.characteristics as any[]) {
              const c: any = char;
              if (c.properties?.Write || c.properties?.WriteWithoutResponse) {
                console.log('Found writable characteristic:', c.characteristic);
                this.serviceUUID = s.uuid;
                this.characteristicUUID = c.characteristic;
                this.characteristicProperties = c.properties;
                
                // MTU negotiation
                try {
                  console.log('Requesting MTU...');
                  await BleManager.requestMTU(deviceId, 512);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  this.mtu = 509;
                  console.log('MTU negotiation succeeded, using MTU:', this.mtu);
                } catch (e) {
                  console.log('MTU negotiation failed, using default MTU:', this.mtu);
                }
                
                this.connectedDeviceId = deviceId;
                console.log('Successfully connected to printer');
                return true;
              }
            }
          }
        }
      }
      
      throw new Error('No writable characteristic found. The device does not support printing.');
    } catch (error) {
      console.error('Connect error:', error);
      // Make sure to disconnect on failure
      try {
        await BleManager.disconnect(deviceId);
      } catch (e) {
        // Ignore disconnect errors
      }
      // Re-throw the error instead of returning false so we get proper error messages
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedDeviceId) {
      try {
        await BleManager.disconnect(this.connectedDeviceId);
      } catch (error) {
        console.error('Disconnect error:', error);
      }
      this.connectedDeviceId = null;
    }
  }

  /**
   * Print pre-dithered 1-bit bitmap from PWA
   * Input: base64 string of 1-bit bitmap (0=white, 1=black)
   */
  async printDitheredBitmap(
    bitmapBase64: string,
    width: number,
    height: number
  ): Promise<boolean> {
    if (!this.connectedDeviceId) {
      throw new Error('No printer connected');
    }

    try {
      const bitmapData = Buffer.from(bitmapBase64, 'base64');
      const raw = new Uint8Array(bitmapData);

      // Normalize input to unpacked 0/1 per-pixel array of length width*height
      const expectedPixels = width * height;
      const bytesPerRow = Math.ceil(width / 8);
      let pixels: Uint8Array;
      if (raw.length === expectedPixels) {
        // Already unpacked (0/1 per pixel)
        pixels = raw;
      } else if (raw.length === bytesPerRow * height) {
        // Packed bits -> unpack to 0/1 per pixel (MSB first)
        pixels = new Uint8Array(expectedPixels);
        let idx = 0;
        for (let y = 0; y < height; y++) {
          for (let bx = 0; bx < bytesPerRow; bx++) {
            const byte = raw[y * bytesPerRow + bx];
            for (let bit = 0; bit < 8; bit++) {
              const x = bx * 8 + bit;
              if (x < width) {
                const bitVal = (byte & (0x80 >> bit)) ? 1 : 0; // 1 = black
                pixels[idx++] = bitVal;
              }
            }
          }
        }
      } else {
        console.warn('Bitmap length does not match width*height or packed size. Attempting best-effort print.', {
          providedLength: raw.length,
          expectedPixels,
          expectedPacked: bytesPerRow * height
        });
        // Fallback: truncate or pad to expectedPixels
        pixels = new Uint8Array(expectedPixels);
        const len = Math.min(expectedPixels, raw.length);
        for (let i = 0; i < len; i++) pixels[i] = raw[i] ? 1 : 0;
      }

      // Debug stats after normalization
      let blackCount = 0;
      for (let i = 0; i < pixels.length; i++) if (pixels[i] === 1) blackCount++;
      console.log('Native bitmap stats (normalized):', {
        width,
        height,
        totalPixels: pixels.length,
        blackPixels: blackCount,
        whitePixels: pixels.length - blackCount,
        blackPercentage: pixels.length > 0 ? ((blackCount / pixels.length) * 100).toFixed(2) + '%' : '0%'
      });

      // Use ESC/POS raster bit image (GS v 0) for broader compatibility
      const escposCommands = this.generateRasterFromBitmap(pixels, width, height);
      console.log('Native raster payload stats:', {
        totalBytes: escposCommands.length,
        dataBytes: escposCommands.length - 8, // approximate after header
        chunkSize: this.mtu
      });
      
      // Send in optimized chunks
      const chunkSize = this.mtu;
      for (let i = 0; i < escposCommands.length; i += chunkSize) {
        const chunk = escposCommands.slice(i, i + chunkSize);
        const base64Chunk = Buffer.from(chunk).toString('base64');
        
        const writeMethod = this.characteristicProperties?.WriteWithoutResponse
          ? 'writeWithoutResponse'
          : 'write';
        
        console.log('Native: sending chunk', {
          offset: i,
          chunkBytes: chunk.length,
          base64Length: base64Chunk.length,
          writeMethod
        });
        
        await BleManager[writeMethod](
          this.connectedDeviceId,
          this.serviceUUID,
          this.characteristicUUID,
          base64Chunk as any
        );
        
        // Adaptive delay based on chunk size
        if (chunkSize < 100) {
          await new Promise(r => setTimeout(r, 50));
        } else {
          await new Promise(r => setTimeout(r, 20));
        }
      }
      
      return true;
    } catch (error) {
      console.error('Print error:', error);
      throw error;
    }
  }

  private generateRasterFromBitmap(
    bitmap: Uint8Array,
    width: number,
    height: number
  ): Uint8Array {
    const commands: number[] = [];
    
    // ESC @ - Initialize printer
    commands.push(0x1B, 0x40);
    
    // GS v 0 m xL xH yL yH [data]  — raster bit image (most compatible)
    const mode = 0x00; // normal
    const bytesPerRow = Math.ceil(width / 8);
    const xL = bytesPerRow & 0xFF;
    const xH = (bytesPerRow >> 8) & 0xFF;
    const yL = height & 0xFF;
    const yH = (height >> 8) & 0xFF;
    
    commands.push(0x1D, 0x76, 0x30, mode, xL, xH, yL, yH);
    console.log('Native: raster header', {
      mode,
      bytesPerRow,
      width,
      height
    });
      
    // Build data row-wise; each byte packs 8 horizontal pixels, MSB first
    for (let y = 0; y < height; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < width) {
            const pixelIndex = y * width + x;
            // 1 = black, set bit to print dot; 0 = white
            if (bitmap[pixelIndex] === 1) {
              byte |= (0x80 >> bit);
            }
          }
        }
        commands.push(byte);
      }
    }
    
    // Feed a bit
    commands.push(0x0A, 0x0A);
    
    // Try cut (ignored by most 58mm)
    commands.push(0x1D, 0x56, 0x00);
    
    return new Uint8Array(commands);
  }

  cleanup(): void {
    this.listeners.forEach(listener => listener.remove());
    if (this.connectedDeviceId) {
      this.disconnect();
    }
  }
}




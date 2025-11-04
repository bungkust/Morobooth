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
      const peripheralInfo = await BleManager.retrieveServices(deviceId);
      
      console.log('peripheralInfo structure:', JSON.stringify(Object.keys(peripheralInfo)));
      console.log('Has services:', !!peripheralInfo.services);
      console.log('Has characteristics:', !!peripheralInfo.characteristics);
      
      // Check if characteristics are directly available (new API)
      if (peripheralInfo.characteristics && peripheralInfo.characteristics.length > 0) {
        console.log('Found characteristics directly in peripheralInfo:', peripheralInfo.characteristics.length);
        
        for (const char of peripheralInfo.characteristics) {
          console.log('Checking characteristic:', char.characteristic, 'properties:', char.properties);
          
          if (char.properties?.Write || char.properties?.WriteWithoutResponse) {
            console.log('Found writable characteristic:', char.characteristic);
            
            // Find the service UUID for this characteristic
            let foundService: any = null;
            if (peripheralInfo.services && peripheralInfo.services.length > 0) {
              // Try to match characteristic to service by checking service UUID
              for (const service of peripheralInfo.services) {
                if (char.service === service.uuid || char.serviceUUID === service.uuid) {
                  foundService = service;
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
            
            this.characteristicUUID = char.characteristic;
            this.characteristicProperties = char.properties;
            
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
        for (const service of peripheralInfo.services) {
          console.log('Service UUID:', service.uuid);
          // In old API, service should have characteristics
          if (service.characteristics && service.characteristics.length > 0) {
            for (const char of service.characteristics) {
              if (char.properties?.Write || char.properties?.WriteWithoutResponse) {
                console.log('Found writable characteristic:', char.characteristic);
                this.serviceUUID = service.uuid;
                this.characteristicUUID = char.characteristic;
                this.characteristicProperties = char.properties;
                
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
  async printText(text: string): Promise<boolean> {
    if (!this.connectedDeviceId) {
      throw new Error('No printer connected');
    }

    try {
      const commands: number[] = [];
      
      // ESC @ - Initialize printer
      commands.push(0x1B, 0x40);
      
      // ESC a 1 - Center alignment
      commands.push(0x1B, 0x61, 0x01);
      
      // ESC ! 0 - Normal size (0x08 = double height, 0x10 = double width, 0x18 = double both)
      commands.push(0x1B, 0x21, 0x00);
      
      // Convert text to bytes (UTF-8)
      const textBytes = Buffer.from(text, 'utf8');
      commands.push(...Array.from(textBytes));
      
      // Line feed
      commands.push(0x0A);
      
      // Feed paper
      commands.push(0x0A, 0x0A);
      
      // Cut paper (GS V 0)
      commands.push(0x1D, 0x56, 0x00);
      
      // Send in chunks
      const chunkSize = this.mtu;
      const commandArray = new Uint8Array(commands);
      
      for (let i = 0; i < commandArray.length; i += chunkSize) {
        const chunk = commandArray.slice(i, i + chunkSize);
        
        const writeMethod = this.characteristicProperties?.WriteWithoutResponse
          ? 'writeWithoutResponse'
          : 'write';
        
        await BleManager[writeMethod](
          this.connectedDeviceId,
          this.serviceUUID,
          this.characteristicUUID,
          Array.from(chunk)
        );
        
        await new Promise(r => setTimeout(r, 20));
      }
      
      return true;
    } catch (error) {
      console.error('Print text error:', error);
      throw error;
    }
  }

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
      const escposCommands = this.generateESCPOSFromBitmap(
        new Uint8Array(bitmapData),
        width,
        height
      );
      
      // Send in optimized chunks
      const chunkSize = this.mtu;
      for (let i = 0; i < escposCommands.length; i += chunkSize) {
        const chunk = escposCommands.slice(i, i + chunkSize);
        
        const writeMethod = this.characteristicProperties?.WriteWithoutResponse
          ? 'writeWithoutResponse'
          : 'write';
        
        await BleManager[writeMethod](
          this.connectedDeviceId,
          this.serviceUUID,
          this.characteristicUUID,
          Array.from(chunk)
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

  private generateESCPOSFromBitmap(
    bitmap: Uint8Array,
    width: number,
    height: number
  ): Uint8Array {
    const commands: number[] = [];
    
    // ESC @ - Initialize printer
    commands.push(0x1B, 0x40);
    
    // ESC a 1 - Center alignment
    commands.push(0x1B, 0x61, 0x01);
    
    // Process in 8-dot rows (ESC * 33 for 8-dot single density)
    for (let y = 0; y < height; y += 8) {
      commands.push(0x1B, 0x2A, 0x21); // ESC * 33
      commands.push(width & 0xFF, (width >> 8) & 0xFF);
      
      for (let x = 0; x < width; x++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelY = y + bit;
          if (pixelY < height) {
            const pixelIndex = pixelY * width + x;
            if (bitmap[pixelIndex] === 1) {
              byte |= 1 << (7 - bit);
            }
          }
        }
        commands.push(byte);
      }
      commands.push(0x0A); // LF
    }
    
    // Feed paper
    commands.push(0x0A, 0x0A, 0x0A);
    
    // Cut paper (GS V 0)
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




/// <reference types="@types/web-bluetooth" />

export interface PrinterConfig {
  name: string;
  width: number; // printable pixel width (58mm -> ~384px, 80mm -> ~576px)
  dpi: number;
  commands: {
    init: string;
    center: string;
    feed: string; // few new lines to feed paper
    cut: string; // some mobile printers may ignore cut
    image: string; // raster bit image header (ESC * m)
  };
}

export class UniversalBluetoothPrinterService {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private config: PrinterConfig | null = null;

  private static PRINTER_CONFIGS: Record<string, PrinterConfig> = {
    'EPPOS EPX-58B': {
      name: 'EPPOS EPX-58B',
      width: 384,
      dpi: 203,
      commands: {
        init: '\x1B\x40',
        center: '\x1B\x61\x01',
        feed: '\x0A\x0A\x0A',
        cut: '\x1D\x56\x00',
        image: '\x1B\x2A\x00'
      }
    },
    'XPRINTER XP-P300': {
      name: 'XPRINTER XP-P300',
      width: 384,
      dpi: 203,
      commands: {
        init: '\x1B\x40',
        center: '\x1B\x61\x01',
        feed: '\x0A\x0A\x0A',
        cut: '\x1D\x56\x00',
        image: '\x1B\x2A\x00'
      }
    },
    'HOIN HOP H58': {
      name: 'HOIN HOP H58',
      width: 384,
      dpi: 203,
      commands: {
        init: '\x1B\x40',
        center: '\x1B\x61\x01',
        feed: '\x0A\x0A\x0A',
        cut: '\x1D\x56\x00',
        image: '\x1B\x2A\x00'
      }
    },
    'BellaV EP-58A': {
      name: 'BellaV EP-58A',
      width: 384,
      dpi: 203,
      commands: {
        init: '\x1B\x40',
        center: '\x1B\x61\x01',
        feed: '\x0A\x0A\x0A',
        cut: '\x1D\x56\x00',
        image: '\x1B\x2A\x00'
      }
    },
    'Generic 58mm': {
      name: 'Generic 58mm',
      width: 384,
      dpi: 203,
      commands: {
        init: '\x1B\x40',
        center: '\x1B\x61\x01',
        feed: '\x0A\x0A\x0A',
        cut: '\x1D\x56\x00',
        image: '\x1B\x2A\x00'
      }
    },
    'Generic 80mm': {
      name: 'Generic 80mm',
      width: 576,
      dpi: 203,
      commands: {
        init: '\x1B\x40',
        center: '\x1B\x61\x01',
        feed: '\x0A\x0A\x0A',
        cut: '\x1D\x56\x00',
        image: '\x1B\x2A\x00'
      }
    }
  };

  async connect(): Promise<boolean> {
    try {
      const filters: any[] = [];
      Object.keys(UniversalBluetoothPrinterService.PRINTER_CONFIGS).forEach((name) => {
        filters.push({ name });
      });
      filters.push(
        { namePrefix: 'EPPOS' },
        { namePrefix: 'EPX' },
        { namePrefix: 'XPRINTER' },
        { namePrefix: 'HOIN' },
        { namePrefix: 'BellaV' },
        { namePrefix: 'Printer' },
        { namePrefix: 'Thermal' }
      );

      this.device = await navigator.bluetooth.requestDevice({
        filters,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Serial
          '00001101-0000-1000-8000-00805f9b34fb', // SPP
          '0000ffe0-0000-1000-8000-00805f9b34fb'  // Generic
        ]
      });

      const detectedName = this.device.name || 'Generic 58mm';
      this.config = this.detectPrinterConfig(detectedName);

      const server = await this.device.gatt?.connect();
      const services = [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '00001101-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb'
      ];

      for (const uuid of services) {
        try {
          const service = await server?.getPrimaryService(uuid);
          const chars = await service?.getCharacteristics();
          for (const c of chars || []) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              this.characteristic = c;
              return true;
            }
          }
        } catch {
          // try next
        }
      }
      return false;
    } catch (e) {
      console.error('Bluetooth connect error:', e);
      return false;
    }
  }

  private detectPrinterConfig(deviceName: string): PrinterConfig {
    if (UniversalBluetoothPrinterService.PRINTER_CONFIGS[deviceName]) {
      return UniversalBluetoothPrinterService.PRINTER_CONFIGS[deviceName];
    }
    const n = deviceName.toLowerCase();
    if (n.includes('eppos') || n.includes('epx')) return UniversalBluetoothPrinterService.PRINTER_CONFIGS['EPPOS EPX-58B'];
    if (n.includes('xprinter') || n.includes('xp-p300')) return UniversalBluetoothPrinterService.PRINTER_CONFIGS['XPRINTER XP-P300'];
    if (n.includes('hoin') || n.includes('h58')) return UniversalBluetoothPrinterService.PRINTER_CONFIGS['HOIN HOP H58'];
    if (n.includes('bellav') || n.includes('58a')) return UniversalBluetoothPrinterService.PRINTER_CONFIGS['BellaV EP-58A'];
    if (n.includes('80')) return UniversalBluetoothPrinterService.PRINTER_CONFIGS['Generic 80mm'];
    return UniversalBluetoothPrinterService.PRINTER_CONFIGS['Generic 58mm'];
  }

  async printImage(imageDataURL: string): Promise<boolean> {
    if (!this.characteristic || !this.config) return false;
    try {
      const payload = await this.convertToThermalFormat(imageDataURL, this.config);
      const cmds = [
        this.config.commands.init,
        this.config.commands.center,
        payload,
        this.config.commands.feed,
        this.config.commands.cut
      ];

      for (const cmd of cmds) {
        const data = new TextEncoder().encode(cmd);
        if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(data);
        } else {
          await this.characteristic.writeValue(data);
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      return true;
    } catch (e) {
      console.error('Print error:', e);
      return false;
    }
  }

  private async convertToThermalFormat(imageDataURL: string, config: PrinterConfig): Promise<string> {
    const IMAGE_LOAD_TIMEOUT = 10000; // 10 seconds timeout
    
    return Promise.race<string>([
      new Promise<string>((resolve, reject) => {
        const img = new Image();
        let resolved = false;
        
        img.onload = () => {
          if (resolved) return; // Prevent multiple calls
          resolved = true;
          
          try {
            const targetWidth = config.width;
            const targetHeight = Math.round((img.height * targetWidth) / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Failed to create canvas context'));
              return;
            }
            
            // CRITICAL: Disable image smoothing for thermal printer (preserve pure black/white)
            ctx.imageSmoothingEnabled = false;
            
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            
            // Force pure black/white conversion for thermal printer
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              // Use proper luminance formula
              const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
              // Force to pure black or white (threshold 128)
              const value = gray < 128 ? 0 : 255;
              data[i] = value;     // R
              data[i + 1] = value; // G
              data[i + 2] = value; // B
              // Alpha stays the same
            }
            
            const bitmap = this.imageDataToEscPosBitmap(imageData);
            resolve(bitmap);
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
      new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Image conversion timeout after ${IMAGE_LOAD_TIMEOUT / 1000} seconds`));
        }, IMAGE_LOAD_TIMEOUT);
      })
    ]);
  }

  private imageDataToEscPosBitmap(imageData: ImageData): string {
    const { data, width, height } = imageData;
    let out = '';
    
    // Process in 8-dot rows (vertical bit packing)
    for (let y = 0; y < height; y += 8) {
      // ESC * m nL nH - m=0 (8-dot single density), n=width in dots
      out += '\x1B\x2A\x00'; // ESC * 0 (8-dot single density, normal)
      const nL = width & 0xFF;
      const nH = (width >> 8) & 0xFF;
      out += String.fromCharCode(nL);
      out += String.fromCharCode(nH);
      
      // Build bitmap bytes column by column (vertical bit packing)
      for (let x = 0; x < width; x++) {
        let byte = 0;
        // Vertical bit packing: 8 pixels per byte, top to bottom
        // MSB first: bit 7 = top pixel (y), bit 0 = bottom pixel (y+7)
        for (let bit = 0; bit < 8; bit++) {
          const pixelY = y + bit;
          if (pixelY < height) {
            const idx = (pixelY * width + x) * 4;
            // Since we already forced pure black/white in convertToThermalFormat,
            // R, G, B are all the same. Just check if it's black (value < 128)
            const gray = data[idx]; // R channel (already pure black/white)
            // Black pixel = 1, White pixel = 0
            if (gray < 128) { // Black pixel
              byte |= (1 << (7 - bit)); // Set bit for black pixel (MSB first)
            }
          }
        }
        out += String.fromCharCode(byte);
      }
      // Add line feed after each row (required for some printers)
      out += '\x0A';
    }
    
    return out;
  }

  getPrinterInfo(): { name: string; width: number; dpi: number } | null {
    if (!this.config) return null;
    return { name: this.config.name, width: this.config.width, dpi: this.config.dpi };
  }

  async disconnect(): Promise<void> {
    try {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    } finally {
      this.device = null;
      this.characteristic = null;
      this.config = null;
    }
  }
}



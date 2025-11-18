/// <reference types="@types/web-bluetooth" />

export interface PrinterConfig {
  name: string;
  width: number; // printable pixel width (58mm -> ~384px, 80mm -> ~576px)
  dpi: number;
  /**
   * Threshold defines the cut-off (0-255) used when converting the source canvas
   * to pure black/white. Higher value => more pixels become black.
   */
  threshold?: number;
  /**
   * Gamma (>= 1 darkens mid tones). Default 1 (no adjustment).
   */
  gamma?: number;
  /**
   * Optional flag to enable error-diffusion dithering (Floyd-Steinberg)
   */
  dithering?: boolean;
  /**
   * Optional sharpen amount (0-1). Applies simple unsharp mask before thresholding.
   */
  sharpen?: number;
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
      threshold: 165,
      gamma: 1.25,
      dithering: false,
      sharpen: 0.45,
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
      threshold: 165,
      gamma: 1.25,
      dithering: true,
      sharpen: 0.45,
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
      threshold: 165,
      gamma: 1.25,
      dithering: true,
      sharpen: 0.45,
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
      threshold: 165,
      gamma: 1.25,
      dithering: true,
      sharpen: 0.45,
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
      threshold: 165,
      gamma: 1.25,
      dithering: true,
      sharpen: 0.45,
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
      threshold: 165,
      gamma: 1.25,
      dithering: true,
      sharpen: 0.45,
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
    } catch (e: any) {
      console.error('Bluetooth connect error:', e);
      
      // Throw error with user-friendly message
      if (e.name === 'SecurityError' || e.name === 'NotAllowedError') {
        throw new Error('Bluetooth permission denied. Please allow Bluetooth access in your browser settings.');
      } else if (e.name === 'NotFoundError') {
        throw new Error('No Bluetooth printer found. Make sure your printer is turned on and in pairing mode.');
      } else if (e.name === 'NetworkError') {
        throw new Error('Failed to connect to printer. Please try again.');
      } else if (e.message) {
        throw new Error(e.message);
      } else {
        throw new Error('Bluetooth connection failed. Please check your printer and try again.');
      }
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
      const asciiEncoder = new TextEncoder();
      const init = asciiEncoder.encode(this.config.commands.init);
      const center = asciiEncoder.encode(this.config.commands.center);
      const feed = asciiEncoder.encode(this.config.commands.feed);
      const cut = asciiEncoder.encode(this.config.commands.cut);

      const payloadBytes = new Uint8Array(payload.length);
      let nonZeroBytes = 0;
      for (let i = 0; i < payload.length; i++) {
        const value = payload.charCodeAt(i) & 0xff;
        payloadBytes[i] = value;
        if (value !== 0) nonZeroBytes++;
      }

      if (nonZeroBytes === 0) {
        console.warn('Generated payload contains only zero bytes. Print may appear blank.');
      }

      const commandQueue: Array<{ label: string; data: Uint8Array }> = [
        { label: 'init', data: init },
        { label: 'center', data: center },
        { label: 'payload', data: payloadBytes },
        { label: 'feed', data: feed },
        { label: 'cut', data: cut }
      ];

      for (const cmd of commandQueue) {
        await this.writeInChunks(cmd.data, cmd.label);
      }
      return true;
    } catch (e) {
      console.error('Print error:', e);
      return false;
    }
  }

  private async convertToThermalFormat(imageDataURL: string, config: PrinterConfig): Promise<string> {
    const IMAGE_LOAD_TIMEOUT = 10000; // 10 seconds timeout
    
    // Load custom printer output settings from localStorage if available
    let customSettings: { threshold?: number; gamma?: number; dithering?: boolean; sharpen?: number } | null = null;
    try {
      const stored = localStorage.getItem('morobooth_printer_output_settings');
      if (stored) {
        customSettings = JSON.parse(stored);
        console.log('Web Bluetooth printer: Using custom settings:', customSettings);
      }
    } catch (error) {
      console.warn('Web Bluetooth printer: Failed to load custom settings:', error);
    }
    
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

            // Use custom settings if available, otherwise fall back to config
            // Use explicit checks to preserve 0 and false values
            const sharpenAmount = customSettings?.sharpen !== undefined 
              ? customSettings.sharpen 
              : (config.sharpen ?? 0);
            if (sharpenAmount > 0) {
              this.applySharpen(imageData, sharpenAmount);
            }
            
            // Force pure black/white conversion for thermal printer
            const data = imageData.data;
            let blackCount = 0;
            let whiteCount = 0;
            const threshold = customSettings?.threshold !== undefined 
              ? customSettings.threshold 
              : (config.threshold ?? 150);
            const gamma = customSettings?.gamma !== undefined 
              ? customSettings.gamma 
              : (config.gamma ?? 1);
            const applyDithering = customSettings?.dithering !== undefined 
              ? customSettings.dithering 
              : (config.dithering ?? false);

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              // Use proper luminance formula
              const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
              // Apply gamma to darken mid-tones (gamma > 1 => darker)
              const normalized = gray / 255;
              const gammaCorrected = Math.pow(normalized, gamma);
              const adjusted = Math.min(255, Math.max(0, Math.round(gammaCorrected * 255)));

              // For dithering, defer thresholding after error diffusion; for non-dither just threshold now
              if (!applyDithering) {
                const value = adjusted < threshold ? 0 : 255;
                data[i] = value;     // R
                data[i + 1] = value; // G
                data[i + 2] = value; // B
                if (value < 128) blackCount++;
                else whiteCount++;
              } else {
                // Temporarily store adjusted grayscale in channels (R=G=B)
                data[i] = adjusted;
                data[i + 1] = adjusted;
                data[i + 2] = adjusted;
              }
            }
            
            if (applyDithering) {
              // Apply Floyd-Steinberg dithering on the temporary grayscale values
              this.applyFloydSteinbergDither(imageData, threshold);

              // After dithering, update stats and clamp to pure B/W
              for (let i = 0; i < data.length; i += 4) {
                const value = data[i] < threshold ? 0 : 255;
                data[i] = value;
                data[i + 1] = value;
                data[i + 2] = value;
                if (value < 128) blackCount++;
                else whiteCount++;
              }
            }

            // Debug logging for image conversion
            const totalPixels = blackCount + whiteCount;
            console.log('Image conversion stats:', {
              width: targetWidth,
              height: targetHeight,
              totalPixels,
              blackPixels: blackCount,
              whitePixels: whiteCount,
              blackPercentage: totalPixels > 0 ? ((blackCount / totalPixels) * 100).toFixed(2) + '%' : '0%',
              threshold,
              gamma,
              sharpen: sharpenAmount,
              dithering: applyDithering,
              usingCustomSettings: customSettings !== null
            });
            
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
    
    // Debug stats
    let totalBytes = 0;
    let bytesWithBits = 0;
    let totalBitsSet = 0;
    
    // Process in 8-dot rows (vertical bit packing)
    // ESC/POS format: ESC * m nL nH [data bytes]
    // Mode 0 = 8-dot single density (normal)
    for (let y = 0; y < height; y += 8) {
      // ESC * m nL nH - m=0 (8-dot single density), n=width in dots
      out += '\x1B\x2A\x00'; // ESC * 0 (8-dot single density, normal)
      const nL = width & 0xFF;
      const nH = (width >> 8) & 0xFF;
      out += String.fromCharCode(nL);
      out += String.fromCharCode(nH);
      
      // Build bitmap bytes column by column (vertical bit packing)
      // Each byte = 8 vertical pixels in one column
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
            
            // ESC/POS standard: Bit 1 = print (black), Bit 0 = no print (white)
            // Black pixels (gray < 128) should set bit = 1 to print
            if (gray < 128) { // Black pixel = set bit to 1
              byte |= (1 << (7 - bit)); // Set bit for black pixel (MSB first)
              totalBitsSet++;
            }
          }
        }
        if (byte > 0) bytesWithBits++;
        totalBytes++;
        out += String.fromCharCode(byte);
      }
      // ESC/POS requires explicit line feed after each bitmap row to advance print head
      // Without LF, all rows will overlap at the same vertical position
      out += '\x0A'; // Line feed to advance to next row
    }
    
    // Debug logging for bitmap generation
    console.log('Bitmap generation stats:', {
      width,
      height,
      rows: Math.ceil(height / 8),
      totalBytes,
      bytesWithBits,
      bytesWithBitsPercentage: totalBytes > 0 ? ((bytesWithBits / totalBytes) * 100).toFixed(2) + '%' : '0%',
      totalBitsSet,
      payloadLength: out.length
    });
    
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

  private async writeInChunks(data: Uint8Array, label: string): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Bluetooth characteristic not ready');
    }

    const DEFAULT_CHUNK_SIZE = 180;
    const chunkSize = Math.max(20, DEFAULT_CHUNK_SIZE);
    const totalChunks = Math.ceil(data.length / chunkSize) || 1;

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      const chunkIndex = Math.floor(i / chunkSize);
      try {
        if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.characteristic.writeValue(chunk);
        }
      } catch (err) {
        console.error(`Failed to write chunk ${chunkIndex + 1}/${totalChunks} for ${label}`, err);
        throw err;
      }
      if (chunkSize >= 100) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }
    console.log(
      `Sent ${label} in ${totalChunks} chunk${totalChunks > 1 ? 's' : ''} (${data.length} bytes)`
    );
  }

  private clampByte(value: number): number {
    if (value < 0) return 0;
    if (value > 255) return 255;
    return Math.round(value);
  }

  private applySharpen(imageData: ImageData, amount = 0.5): void {
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
        let r = 0;
        let g = 0;
        let b = 0;

        for (let ky = -1; ky <= 1; ky++) {
          const sampleY = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const sampleX = Math.min(width - 1, Math.max(0, x + kx));
            const weight = kernel[(ky + 1) * 3 + (kx + 1)];
            const idx = (sampleY * width + sampleX) * 4;
            r += original[idx] * weight;
            g += original[idx + 1] * weight;
            b += original[idx + 2] * weight;
          }
        }

        const destIdx = (y * width + x) * 4;
        data[destIdx] = this.clampByte(r);
        data[destIdx + 1] = this.clampByte(g);
        data[destIdx + 2] = this.clampByte(b);
        data[destIdx + 3] = original[destIdx + 3];
      }
    }
  }

  private applyFloydSteinbergDither(imageData: ImageData, threshold: number): void {
    const { data, width, height } = imageData;

    const clamp = (value: number) => Math.min(255, Math.max(0, value));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const oldPixel = data[idx];
        const newPixel = oldPixel < threshold ? 0 : 255;
        const error = oldPixel - newPixel;

        data[idx] = newPixel;
        data[idx + 1] = newPixel;
        data[idx + 2] = newPixel;

        const distribute = (offsetX: number, offsetY: number, factor: number) => {
          const newX = x + offsetX;
          const newY = y + offsetY;
          if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
            const targetIdx = (newY * width + newX) * 4;
            const updated = data[targetIdx] + error * factor;
            const clamped = clamp(updated);
            data[targetIdx] = clamped;
            data[targetIdx + 1] = clamped;
            data[targetIdx + 2] = clamped;
          }
        };

        // Floyd-Steinberg diffusion coefficients
        distribute(1, 0, 7 / 16);
        distribute(-1, 1, 3 / 16);
        distribute(0, 1, 5 / 16);
        distribute(1, 1, 1 / 16);
      }
    }
  }
}



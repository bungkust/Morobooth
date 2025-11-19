// Configuration management service for Morobooth
// Handles both config.txt and localStorage overrides

export type HeaderMode = 'text' | 'image';

export interface ConfigHeader {
  mode: HeaderMode;
  mainText: string;
  subText: string;
  imageUrl: string;
}

export interface ConfigBody {
  mainText: string;
  subText: string;
}

export interface Config {
  header: ConfigHeader;
  body: ConfigBody;
}

export interface ConfigOverride {
  enabled: boolean;
  sessionCode?: string;
  header: ConfigHeader;
  body: ConfigBody;
}

const DEFAULT_HEADER: ConfigHeader = {
  mode: 'text',
  mainText: 'Morobooth',
  subText: '2025',
  imageUrl: ''
};

const DEFAULT_BODY: ConfigBody = {
  mainText: 'Morobooth',
  subText: '2025'
};

let cachedConfig: Config | null = null;

function normalizeHeader(raw: any): ConfigHeader {
  const mode: HeaderMode = raw?.mode === 'image' || raw?.useImage ? 'image' : 'text';
  return {
    mode,
    mainText: raw?.mainText ?? '',
    subText: raw?.subText ?? '',
    imageUrl: mode === 'image' ? (raw?.imageUrl ?? '') : ''
  };
}

function normalizeBody(raw: any, fallback?: Partial<ConfigBody>): ConfigBody {
  return {
    mainText: raw?.mainText ?? fallback?.mainText ?? DEFAULT_BODY.mainText,
    subText: raw?.subText ?? fallback?.subText ?? DEFAULT_BODY.subText,
  };
}

function normalizeOverride(raw: any): ConfigOverride {
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: false,
      header: { ...DEFAULT_HEADER, mainText: '', subText: '' },
      body: { ...DEFAULT_BODY }
    };
  }

  const header = normalizeHeader(raw.header ?? {
    mode: raw.useImage ? 'image' : 'text',
    mainText: raw.headerMainText ?? raw.mainText ?? '',
    subText: raw.headerSubText ?? raw.subText ?? '',
    imageUrl: raw.imageUrl
  });

  const body = normalizeBody(raw.body ?? {
    mainText: raw.mainText,
    subText: raw.subText
  });

  return {
    enabled: Boolean(raw.enabled),
    sessionCode: raw.sessionCode,
    header,
    body
  };
}

export async function loadConfig(): Promise<Config> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const override = getConfigOverride();
    if (override.enabled) {
      const header = override.header;
      const body = override.body;

      if (header.mode === 'image' && header.imageUrl) {
        cachedConfig = {
          header,
          body: normalizeBody(body)
        };
        return cachedConfig;
      }

      cachedConfig = {
        header: {
          mode: 'text',
          mainText: header.mainText || DEFAULT_HEADER.mainText,
          subText: header.subText || DEFAULT_HEADER.subText,
          imageUrl: ''
        },
        body: normalizeBody(body)
      };
      return cachedConfig;
    }

    cachedConfig = { header: { ...DEFAULT_HEADER }, body: { ...DEFAULT_BODY } };
    return cachedConfig;
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
    cachedConfig = { header: { ...DEFAULT_HEADER }, body: { ...DEFAULT_BODY } };
    return cachedConfig;
  }
}

export function getConfigOverride(): ConfigOverride {
  try {
    const stored = localStorage.getItem('morobooth_config_override') || localStorage.getItem('pixelbooth_config_override');
    if (stored) {
      return normalizeOverride(JSON.parse(stored));
    }
  } catch (error) {
    console.warn('Failed to parse config override:', error);
  }
  
  return {
    enabled: false,
    header: {
      mode: 'text',
    mainText: '',
      subText: '',
      imageUrl: ''
    },
    body: { ...DEFAULT_BODY }
  };
}

export function setConfigOverride(config: ConfigOverride): void {
  try {
    const payload: ConfigOverride = {
      enabled: config.enabled,
      sessionCode: config.sessionCode,
      header: normalizeHeader(config.header),
      body: normalizeBody(config.body, DEFAULT_BODY)
    };
    localStorage.setItem('morobooth_config_override', JSON.stringify(payload));
    clearConfigCache();
  } catch (error) {
    console.error('Failed to save config override:', error);
    throw new Error('Failed to save configuration');
  }
}

export function clearConfigOverride(): void {
  try {
    localStorage.removeItem('morobooth_config_override');
    try { localStorage.removeItem('pixelbooth_config_override'); } catch {}
    clearConfigCache();
  } catch (error) {
    console.error('Failed to clear config override:', error);
  }
}

export function clearConfigCache() {
  cachedConfig = null;
}

export function getConfigPreview(): string {
  const override = getConfigOverride();
  if (override.enabled) {
    if (override.header.mode === 'image' && override.header.imageUrl) {
      return 'Custom image enabled';
    }
    return `${override.header.mainText || DEFAULT_HEADER.mainText}\n${override.header.subText || DEFAULT_HEADER.subText}`;
  }
  return 'Using config.txt values';
}

// Printer Output Settings
export interface PrinterOutputSettings {
  // Existing Print Settings
  threshold?: number; // 0-255
  gamma?: number; // >= 1
  dithering?: boolean;
  sharpen?: number; // 0-1
  
  // New: Capture Stage
  captureGrayscale?: boolean; // Enable/disable grayscale at capture (default: true)
  
  // New: Preview Stage
  previewGrayscale?: boolean; // Enable/disable grayscale in preview (default: true)
  previewDither?: boolean; // Enable/disable ordered dither in preview (default: true)
  
  // New: Composition Stage
  compositionDither?: boolean; // Enable/disable Floyd-Steinberg dither (default: true)
  compositionDitherThreshold?: number; // Threshold for composition dither (0-255, default: 128)
}

export const DEFAULT_PRINTER_OUTPUT: Required<PrinterOutputSettings> = {
  threshold: 165,
  gamma: 1.25,
  dithering: true,
  sharpen: 0.45,
  captureGrayscale: true,
  previewGrayscale: true,
  previewDither: true,
  compositionDither: true,
  compositionDitherThreshold: 128
};

export function getPrinterOutputSettings(): PrinterOutputSettings {
  try {
    const stored = localStorage.getItem('morobooth_printer_output_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Use explicit checks to preserve 0 and false values
      return {
        threshold: parsed.threshold !== undefined ? parsed.threshold : DEFAULT_PRINTER_OUTPUT.threshold,
        gamma: parsed.gamma !== undefined ? parsed.gamma : DEFAULT_PRINTER_OUTPUT.gamma,
        dithering: parsed.dithering !== undefined ? parsed.dithering : DEFAULT_PRINTER_OUTPUT.dithering,
        sharpen: parsed.sharpen !== undefined ? parsed.sharpen : DEFAULT_PRINTER_OUTPUT.sharpen,
        // New fields
        captureGrayscale: parsed.captureGrayscale !== undefined ? parsed.captureGrayscale : DEFAULT_PRINTER_OUTPUT.captureGrayscale,
        previewGrayscale: parsed.previewGrayscale !== undefined ? parsed.previewGrayscale : DEFAULT_PRINTER_OUTPUT.previewGrayscale,
        previewDither: parsed.previewDither !== undefined ? parsed.previewDither : DEFAULT_PRINTER_OUTPUT.previewDither,
        compositionDither: parsed.compositionDither !== undefined ? parsed.compositionDither : DEFAULT_PRINTER_OUTPUT.compositionDither,
        compositionDitherThreshold: parsed.compositionDitherThreshold !== undefined ? parsed.compositionDitherThreshold : DEFAULT_PRINTER_OUTPUT.compositionDitherThreshold
      };
    }
  } catch (error) {
    console.warn('Failed to parse printer output settings:', error);
  }
  
  return { ...DEFAULT_PRINTER_OUTPUT };
}

export function setPrinterOutputSettings(settings: PrinterOutputSettings): void {
  try {
    // Use explicit checks to preserve 0 and false values
    const payload: Required<PrinterOutputSettings> = {
      threshold: settings.threshold !== undefined ? settings.threshold : DEFAULT_PRINTER_OUTPUT.threshold,
      gamma: settings.gamma !== undefined ? settings.gamma : DEFAULT_PRINTER_OUTPUT.gamma,
      dithering: settings.dithering !== undefined ? settings.dithering : DEFAULT_PRINTER_OUTPUT.dithering,
      sharpen: settings.sharpen !== undefined ? settings.sharpen : DEFAULT_PRINTER_OUTPUT.sharpen,
      // New fields
      captureGrayscale: settings.captureGrayscale !== undefined ? settings.captureGrayscale : DEFAULT_PRINTER_OUTPUT.captureGrayscale,
      previewGrayscale: settings.previewGrayscale !== undefined ? settings.previewGrayscale : DEFAULT_PRINTER_OUTPUT.previewGrayscale,
      previewDither: settings.previewDither !== undefined ? settings.previewDither : DEFAULT_PRINTER_OUTPUT.previewDither,
      compositionDither: settings.compositionDither !== undefined ? settings.compositionDither : DEFAULT_PRINTER_OUTPUT.compositionDither,
      compositionDitherThreshold: settings.compositionDitherThreshold !== undefined ? settings.compositionDitherThreshold : DEFAULT_PRINTER_OUTPUT.compositionDitherThreshold
    };
    localStorage.setItem('morobooth_printer_output_settings', JSON.stringify(payload));
    console.log('Printer output settings saved:', payload);
  } catch (error) {
    console.error('Failed to save printer output settings:', error);
    throw new Error('Failed to save printer output settings');
  }
}

export function resetPrinterOutputSettings(): void {
  try {
    localStorage.removeItem('morobooth_printer_output_settings');
  } catch (error) {
    console.error('Failed to reset printer output settings:', error);
  }
}

// QR Code Settings
export interface QRCodeSettings {
  enabled?: boolean; // Show QR code on print
  width?: number; // 100-400px
  margin?: number; // 0-4
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  colorDark?: string; // Hex color
  colorLight?: string; // Hex color
}

export const DEFAULT_QR_SETTINGS: Required<QRCodeSettings> = {
  enabled: true, // Default: QR code enabled
  width: 200,
  margin: 1,
  errorCorrectionLevel: 'M',
  colorDark: '#000000',
  colorLight: '#FFFFFF'
};

export function getQRCodeSettings(): QRCodeSettings {
  try {
    const stored = localStorage.getItem('morobooth_qr_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Use explicit checks to preserve 0 and false values
      return {
        enabled: parsed.enabled !== undefined ? parsed.enabled : DEFAULT_QR_SETTINGS.enabled,
        width: parsed.width !== undefined ? parsed.width : DEFAULT_QR_SETTINGS.width,
        margin: parsed.margin !== undefined ? parsed.margin : DEFAULT_QR_SETTINGS.margin,
        errorCorrectionLevel: parsed.errorCorrectionLevel !== undefined ? parsed.errorCorrectionLevel : DEFAULT_QR_SETTINGS.errorCorrectionLevel,
        colorDark: parsed.colorDark !== undefined ? parsed.colorDark : DEFAULT_QR_SETTINGS.colorDark,
        colorLight: parsed.colorLight !== undefined ? parsed.colorLight : DEFAULT_QR_SETTINGS.colorLight
      };
    }
  } catch (error) {
    console.warn('Failed to parse QR code settings:', error);
  }
  
  return { ...DEFAULT_QR_SETTINGS };
}

export function setQRCodeSettings(settings: QRCodeSettings): void {
  try {
    // Use explicit checks to preserve 0 and false values
    const payload: Required<QRCodeSettings> = {
      enabled: settings.enabled !== undefined ? settings.enabled : DEFAULT_QR_SETTINGS.enabled,
      width: settings.width !== undefined ? settings.width : DEFAULT_QR_SETTINGS.width,
      margin: settings.margin !== undefined ? settings.margin : DEFAULT_QR_SETTINGS.margin,
      errorCorrectionLevel: settings.errorCorrectionLevel !== undefined ? settings.errorCorrectionLevel : DEFAULT_QR_SETTINGS.errorCorrectionLevel,
      colorDark: settings.colorDark !== undefined ? settings.colorDark : DEFAULT_QR_SETTINGS.colorDark,
      colorLight: settings.colorLight !== undefined ? settings.colorLight : DEFAULT_QR_SETTINGS.colorLight
    };
    localStorage.setItem('morobooth_qr_settings', JSON.stringify(payload));
    console.log('QR code settings saved:', payload);
  } catch (error) {
    console.error('Failed to save QR code settings:', error);
    throw new Error('Failed to save QR code settings');
  }
}

export function resetQRCodeSettings(): void {
  try {
    localStorage.removeItem('morobooth_qr_settings');
  } catch (error) {
    console.error('Failed to reset QR code settings:', error);
  }
}

// Upload Settings
export interface UploadSettings {
  saveBeforePrint?: boolean; // Save photo to storage before print (default: true)
}

export const DEFAULT_UPLOAD_SETTINGS: Required<UploadSettings> = {
  saveBeforePrint: true // Default: save before print (backward compatible)
};

export function getUploadSettings(): UploadSettings {
  try {
    const stored = localStorage.getItem('morobooth_upload_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Use explicit checks to preserve false values
      return {
        saveBeforePrint: parsed.saveBeforePrint !== undefined ? parsed.saveBeforePrint : DEFAULT_UPLOAD_SETTINGS.saveBeforePrint
      };
    }
  } catch (error) {
    console.warn('Failed to parse upload settings:', error);
  }
  
  return { ...DEFAULT_UPLOAD_SETTINGS };
}

export function setUploadSettings(settings: UploadSettings): void {
  try {
    // Use explicit checks to preserve false values
    const payload: Required<UploadSettings> = {
      saveBeforePrint: settings.saveBeforePrint !== undefined ? settings.saveBeforePrint : DEFAULT_UPLOAD_SETTINGS.saveBeforePrint
    };
    localStorage.setItem('morobooth_upload_settings', JSON.stringify(payload));
    console.log('Upload settings saved:', payload);
  } catch (error) {
    console.error('Failed to save upload settings:', error);
    throw new Error('Failed to save upload settings');
  }
}

export function resetUploadSettings(): void {
  try {
    localStorage.removeItem('morobooth_upload_settings');
  } catch (error) {
    console.error('Failed to reset upload settings:', error);
  }
}

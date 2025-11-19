import QRCode from 'qrcode';
import type { QRCodeSettings } from '../services/configService';
import { getQRCodeSettings, DEFAULT_QR_SETTINGS } from '../services/configService';

const BASE_URL_CACHE_KEY = 'morobooth_base_url';

/**
 * Update base URL cache if needed (called when online)
 */
export function updateBaseUrlIfNeeded(): void {
  if (typeof window === 'undefined') return;
  
  // If VITE_APP_URL is set, update cache
  if (import.meta.env.VITE_APP_URL) {
    const currentCached = localStorage.getItem(BASE_URL_CACHE_KEY);
    const envUrl = import.meta.env.VITE_APP_URL;
    
    if (currentCached !== envUrl) {
      localStorage.setItem(BASE_URL_CACHE_KEY, envUrl);
      console.log('Base URL updated to:', envUrl);
    }
  }
}

/**
 * Get base URL with caching for offline support
 */
function getBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  
  // Priority 1: Environment variable (production)
  if (import.meta.env.VITE_APP_URL) {
    const envUrl = import.meta.env.VITE_APP_URL;
    // Cache it
    localStorage.setItem(BASE_URL_CACHE_KEY, envUrl);
    return envUrl;
  }
  
  // Priority 2: Cached base URL (for consistency when offline)
  const cachedBaseUrl = localStorage.getItem(BASE_URL_CACHE_KEY);
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  
  // Priority 3: Current origin (works offline, but only for same device)
  const origin = window.location.origin;
  localStorage.setItem(BASE_URL_CACHE_KEY, origin);
  return origin;
}

/**
 * Generate QR code as DataURL
 * @param url - URL to encode in QR code
 * @param settings - Optional QR code settings (if not provided, loads from configService)
 * @returns DataURL string of the QR code, or empty string on error
 */
export async function generateQRCodeDataURL(
  url: string,
  settings?: QRCodeSettings
): Promise<string> {
  try {
    // Validate URL format
    try {
      new URL(url);
    } catch {
      console.error('Invalid URL format for QR code:', url);
      return '';
    }
    
    console.log('Generating QR code for URL:', url);
    
    // Load settings from configService if not provided
    const qrSettings = settings || getQRCodeSettings();
    
    // Merge with defaults
    const finalSettings = {
      width: qrSettings.width ?? DEFAULT_QR_SETTINGS.width,
      margin: qrSettings.margin ?? DEFAULT_QR_SETTINGS.margin,
      errorCorrectionLevel: qrSettings.errorCorrectionLevel ?? DEFAULT_QR_SETTINGS.errorCorrectionLevel,
      color: {
        dark: qrSettings.colorDark ?? DEFAULT_QR_SETTINGS.colorDark,
        light: qrSettings.colorLight ?? DEFAULT_QR_SETTINGS.colorLight
      }
    };
    
    // Validate settings
    if (finalSettings.width < 100 || finalSettings.width > 400) {
      console.warn('QR width out of range, using default:', finalSettings.width);
      finalSettings.width = DEFAULT_QR_SETTINGS.width;
    }
    
    if (finalSettings.margin < 0 || finalSettings.margin > 4) {
      console.warn('QR margin out of range, using default:', finalSettings.margin);
      finalSettings.margin = DEFAULT_QR_SETTINGS.margin;
    }
    
    const dataURL = await QRCode.toDataURL(url, finalSettings);
    console.log('QR code generated successfully, length:', dataURL.length);
    return dataURL;
  } catch (error) {
    console.error('QR generation failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return '';
  }
}

/**
 * Get download URL for a photo ID
 * Uses cached base URL for offline support
 */
export function getDownloadURL(photoId: string): string {
  // Validate photoId format (should be like "ABC123-001")
  if (!photoId || typeof photoId !== 'string') {
    console.error('Invalid photoId:', photoId);
    return '';
  }
  
  const baseUrl = getBaseUrl();
  const downloadUrl = `${baseUrl}/download/${photoId}`;
  
  // Validate the constructed URL
  try {
    new URL(downloadUrl);
    return downloadUrl;
  } catch {
    console.error('Failed to construct valid download URL:', downloadUrl);
    return '';
  }
}

// Initialize base URL cache on module load
if (typeof window !== 'undefined') {
  updateBaseUrlIfNeeded();
  
  // Update cache when coming online
  window.addEventListener('online', () => {
    updateBaseUrlIfNeeded();
  });
}

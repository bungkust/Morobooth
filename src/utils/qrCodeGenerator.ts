import QRCode from 'qrcode';
import type { QRCodeSettings } from '../services/configService';
import { getQRCodeSettings, DEFAULT_QR_SETTINGS, getBaseUrlSettings } from '../services/configService';

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
 * Check if URL is localhost/127.0.0.1 (development)
 */
function isLocalhost(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname === '0.0.0.0' ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname.startsWith('172.');
  } catch {
    return false;
  }
}

/**
 * Get base URL with caching for offline support
 */
function getBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  
  // Priority 1: Admin panel setting (highest priority)
  const adminSetting = getBaseUrlSettings();
  if (adminSetting && !isLocalhost(adminSetting)) {
    console.log('[QR] Using admin panel base URL setting:', adminSetting);
    return adminSetting;
  } else if (adminSetting && isLocalhost(adminSetting)) {
    console.warn('[QR] Admin panel base URL is localhost, ignoring:', adminSetting);
  }
  
  // Priority 2: Environment variable (production)
  if (import.meta.env.VITE_APP_URL) {
    const envUrl = import.meta.env.VITE_APP_URL.trim();
    if (envUrl && !isLocalhost(envUrl)) {
      // Cache it
      localStorage.setItem(BASE_URL_CACHE_KEY, envUrl);
      console.log('[QR] Using VITE_APP_URL:', envUrl);
      return envUrl;
    } else if (isLocalhost(envUrl)) {
      console.warn('[QR] VITE_APP_URL is set to localhost, ignoring:', envUrl);
    }
  }
  
  // Priority 3: Cached base URL (for consistency when offline)
  const cachedBaseUrl = localStorage.getItem(BASE_URL_CACHE_KEY);
  if (cachedBaseUrl && !isLocalhost(cachedBaseUrl)) {
    console.log('[QR] Using cached base URL:', cachedBaseUrl);
    return cachedBaseUrl;
  } else if (cachedBaseUrl && isLocalhost(cachedBaseUrl)) {
    console.warn('[QR] Cached base URL is localhost, ignoring:', cachedBaseUrl);
    // Clear invalid cache
    localStorage.removeItem(BASE_URL_CACHE_KEY);
  }
  
  // Priority 4: Default production URL
  const defaultUrl = 'https://morobooth.netlify.app';
  console.log('[QR] Using default production URL:', defaultUrl);
  return defaultUrl;
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
 * Manually set base URL (useful for admin override)
 * This now uses configService to persist the setting
 */
export function setBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const { setBaseUrlSettings } = require('../services/configService');
    setBaseUrlSettings(url);
    console.log('[QR] Base URL set via admin panel:', url);
  } catch (error) {
    console.error('[QR] Invalid URL provided:', url, error);
    throw error;
  }
}

/**
 * Get current base URL (for debugging/admin)
 */
export function getCurrentBaseUrl(): string {
  return getBaseUrl();
}

/**
 * Get download URL for a photo ID
 * Uses cached base URL for offline support
 */
export function getDownloadURL(photoId: string): string {
  // Validate photoId format (should be like "ABC123-001")
  if (!photoId || typeof photoId !== 'string') {
    console.error('[QR] Invalid photoId:', photoId);
    return '';
  }
  
  const baseUrl = getBaseUrl();
  const downloadUrl = `${baseUrl}/download/${photoId}`;
  
  // Validate the constructed URL
  try {
    // Validate URL format
    new URL(downloadUrl);
    console.log('[QR] Generated download URL:', downloadUrl);
    
    // Warn if using localhost
    if (isLocalhost(downloadUrl)) {
      console.warn('[QR] WARNING: Download URL uses localhost! QR codes will not work from other devices.');
    }
    
    return downloadUrl;
  } catch (error) {
    console.error('[QR] Failed to construct valid download URL:', downloadUrl, error);
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

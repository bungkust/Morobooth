import React, { useState, useRef, useEffect, useCallback } from 'react';
import p5 from 'p5';
import { PhotoBooth, type PhotoBoothRef, type AppState } from './PhotoBooth';
import { Controls } from './Controls';
import { PreviewModal } from './PreviewModal';
import { useWakeLock } from '../hooks/useWakeLock';
import { generateQRCodeDataURL, getDownloadURL } from '../utils/qrCodeGenerator';
import { getHybridBluetoothPrinterService, type HybridBluetoothPrinterService } from '../services/hybridBluetoothPrinterService';
import { nativeBridge } from '../services/nativeBridgeService';
import { getPrinterSizeSettings } from '../services/configService';

interface Template {
  id: string;
  name: string;
  description: string;
  width: number; // mm
  height: number; // mm
  photoCount: number;
  layout: 'vertical' | 'horizontal' | 'grid';
  thermalSize: '58mm' | '80mm';
}

interface PhotoBoothAppProps {
  template: Template;
  onBackToTemplate: () => void;
}

export const PhotoBoothApp: React.FC<PhotoBoothAppProps> = ({ template, onBackToTemplate }) => {
  const photoBoothRef = useRef<PhotoBoothRef>(null);
  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const detectNativeEnvironment = useCallback(() => {
    const fromBridge = nativeBridge.isNativeApp();
    const hasRNWebView = typeof window !== 'undefined' && Boolean(
      (window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView
    );
    const uaHint =
      typeof navigator !== 'undefined' && /morobooth(app)?/i.test((navigator as Navigator).userAgent ?? '');
    const detected = fromBridge || hasRNWebView || uaHint;

    if (typeof window !== 'undefined') {
      console.log('[env-detect]', {
        fromBridge,
        hasRNWebView,
        uaHint,
        detected,
        location: window.location.href
      });
    }

    return detected;
  }, []);

  const [isNativeApp, setIsNativeApp] = useState<boolean>(false);
  const [appState, setAppState] = useState<AppState>('PREVIEW');
  const [countdownText, setCountdownText] = useState('');
  const [, setFrames] = useState<p5.Image[]>([]);
  const [, setFinalComposite] = useState<p5.Graphics | null>(null);
  const [, setCanvasSize] = useState({ width: 640, height: 480 });
  const [, setIsReviewMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [highResImageDataURL, setHighResImageDataURL] = useState<string | null>(null);
  const [bluetoothPrinter, setBluetoothPrinter] = useState<HybridBluetoothPrinterService | null>(null);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const saveLockRef = useRef(false);
  const printLockRef = useRef(false); // Synchronous guard for concurrent print prevention

  // Helper untuk show notification (ganti alert)
  const showNotification = (message: string, type: 'success' | 'error' = 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Helper: compose final image (with QR if available) and return dataURL
  const composeImageForPrint = async (photoId?: string): Promise<string | null> => {
    if (!photoBoothRef.current) return null;
    let dataURL: string | null = null;
    
    // Use provided photoId or get from ref (with safe access)
    const currentPhotoId = photoId || (photoBoothRef.current?.getPhotoIdForPrint() ?? null);
    // Fix: Re-check after accessing ref
    if (!photoBoothRef.current) return null;
    console.log('[COMPOSE_IMAGE_FOR_PRINT] PhotoId:', currentPhotoId || 'none');
    
    // Validate photoId format
    if (currentPhotoId && (!currentPhotoId.includes('-') || currentPhotoId.split('-').length !== 2)) {
      console.error('[COMPOSE_IMAGE_FOR_PRINT] Invalid photoId format:', currentPhotoId);
      // Fallback to high-res without QR
      const fallback = photoBoothRef.current.getFinalCompositeDataURL();
      if (!fallback) {
        console.error('[COMPOSE_IMAGE_FOR_PRINT] Fallback getFinalCompositeDataURL returned null');
      }
      return fallback;
    }
    
    if (currentPhotoId) {
      try {
      const downloadURL = getDownloadURL(currentPhotoId);
      console.log('[COMPOSE_IMAGE_FOR_PRINT] Download URL:', downloadURL);
        
        if (!downloadURL) {
          console.error('[COMPOSE_IMAGE_FOR_PRINT] Failed to generate download URL for photoId:', currentPhotoId);
          // Fallback to high-res without QR
          const fallback = photoBoothRef.current.getFinalCompositeDataURL();
          if (!fallback) {
            console.error('[COMPOSE_IMAGE_FOR_PRINT] Fallback getFinalCompositeDataURL returned null');
          }
          return fallback;
        }
        
        // Load QR settings from configService
        const { getQRCodeSettings } = await import('../services/configService');
        // Fix: Re-check after await
        if (!photoBoothRef.current) {
          console.error('[COMPOSE_IMAGE_FOR_PRINT] photoBoothRef became null after import');
          return null;
        }
        const qrSettings = getQRCodeSettings();
        console.log('[COMPOSE_IMAGE_FOR_PRINT] QR settings:', { enabled: qrSettings.enabled, width: qrSettings.width });
        
        // Check if QR code is enabled
        if (qrSettings.enabled === false) {
          console.log('[COMPOSE_IMAGE_FOR_PRINT] QR code is disabled in settings, printing without QR code');
          // Fallback to high-res without QR
          const fallback = photoBoothRef.current.getFinalCompositeDataURL();
          if (!fallback) {
            console.error('[COMPOSE_IMAGE_FOR_PRINT] Fallback getFinalCompositeDataURL returned null');
          }
          return fallback;
        }
        
        const qrCodeDataURL = await generateQRCodeDataURL(downloadURL, qrSettings);
        // Fix: Re-check after await
        if (!photoBoothRef.current) {
          console.error('[COMPOSE_IMAGE_FOR_PRINT] photoBoothRef became null after QR generation');
          return null;
        }
        console.log('[COMPOSE_IMAGE_FOR_PRINT] QR code generated:', !!qrCodeDataURL, qrCodeDataURL ? `length: ${qrCodeDataURL.length}` : '');
        
        // Validate QR code data URL format and length
        let isValidQRCode = false;
        if (qrCodeDataURL && typeof qrCodeDataURL === 'string') {
          // Fix: Check format
          if (!qrCodeDataURL.startsWith('data:image')) {
            console.error('[COMPOSE_IMAGE_FOR_PRINT] Invalid QR code data URL format, skipping QR code:', qrCodeDataURL.substring(0, 50));
          }
          // Fix: Check length (max 10MB to prevent memory issues)
          else if (qrCodeDataURL.length > 10 * 1024 * 1024) {
            console.error('[COMPOSE_IMAGE_FOR_PRINT] QR code data URL too large:', qrCodeDataURL.length, 'bytes (max 10MB)');
          } else {
            isValidQRCode = true;
          }
        }
        
      if (isValidQRCode) {
        const { composeResult } = await import('../utils/photoComposer');
        // Fix: Re-check after await
        if (!photoBoothRef.current) {
          console.error('[COMPOSE_IMAGE_FOR_PRINT] photoBoothRef became null after import composeResult');
          return null;
        }
        
        // FIX 1: Retry mechanism untuk mendapatkan p5Instance dan frames
        let p5Instance = photoBoothRef.current.getP5Instance?.();
        let frames = photoBoothRef.current.getFrames?.();
        
        // Retry jika tidak tersedia (max 3 kali, delay 100ms)
        let retries = 0;
        const maxRetries = 3;
        // Fix: Check for both too few and too many frames
        while (retries < maxRetries) {
          const hasValidFrames = frames && frames.length > 0 && frames.length === template.photoCount;
          if (p5Instance && frames && hasValidFrames) {
            break; // Exit early if valid
          }
          
          console.warn(`[COMPOSE_IMAGE_FOR_PRINT] Retry ${retries + 1}/${maxRetries}: Waiting for p5Instance/frames...`, {
            hasP5: !!p5Instance,
            framesLength: frames?.length || 0,
            expectedCount: template.photoCount,
            isValid: hasValidFrames
          });
          await new Promise(resolve => setTimeout(resolve, 100));
          // Fix: Re-check after await
          if (!photoBoothRef.current) {
            console.error('[COMPOSE_IMAGE_FOR_PRINT] photoBoothRef became null during retry');
            break;
          }
          p5Instance = photoBoothRef.current.getP5Instance?.();
          frames = photoBoothRef.current.getFrames?.();
          retries++;
        }
        
        console.log('[COMPOSE_IMAGE_FOR_PRINT] P5 instance:', !!p5Instance, 'Frames:', frames?.length || 0, `(after ${retries} retries)`);
        
        // Fix: Re-check p5Instance validity after retry
        if (p5Instance && typeof p5Instance.createGraphics !== 'function') {
          console.error('[COMPOSE_IMAGE_FOR_PRINT] p5Instance invalid after retry (missing createGraphics method)');
          p5Instance = null;
        }
          
        // Check if we have valid frames for normal composition
        const hasValidFramesForCompose = p5Instance && frames && frames.length > 0 && frames.length === template.photoCount;
        
        if (hasValidFramesForCompose) {
          try {
          const printComposite = await composeResult(
            p5Instance,
            frames,
            template,
            qrCodeDataURL
          );
            // Fix: Validate printComposite before accessing .canvas
            if (!printComposite || !printComposite.canvas || typeof printComposite.canvas.toDataURL !== 'function') {
              throw new Error('Invalid printComposite: missing canvas or toDataURL method');
            }
          dataURL = printComposite.canvas.toDataURL('image/png');
          if (dataURL) {
            console.log('[COMPOSE_IMAGE_FOR_PRINT] ✓ QR code composed successfully, dataURL length:', dataURL.length);
          } else {
              console.error('[COMPOSE_IMAGE_FOR_PRINT] ❌ Failed to convert composite to dataURL');
              // Try alternative method if composeResult succeeded but toDataURL failed
              dataURL = null;
            }
          } catch (composeError) {
            console.error('[COMPOSE_IMAGE_FOR_PRINT] ❌ Error in composeResult:', composeError);
            if (composeError instanceof Error) {
              console.error('[COMPOSE_IMAGE_FOR_PRINT] Error details:', composeError.message, composeError.stack);
            }
            // Try alternative method if composeResult fails
            dataURL = null;
          }
        }
        
        // If normal composition failed or frames not available, try alternative method
        if (!dataURL) {
          // FIX 2: Alternative method - add QR code to existing composite
          console.error('[COMPOSE_IMAGE_FOR_PRINT] ❌ CRITICAL: Cannot compose QR code - missing dependencies', {
              hasP5: !!p5Instance,
            framesLength: frames?.length || 0,
            templatePhotoCount: template.photoCount,
            appState: appState,
            photoId: currentPhotoId,
            retriesAttempted: retries
          });
          
          // Try alternative: load existing composite and add QR code manually
          // Fix: Re-check before accessing ref
          if (!photoBoothRef.current) {
            console.error('[COMPOSE_IMAGE_FOR_PRINT] photoBoothRef became null before alternative method');
            dataURL = null;
          } else {
            let existingComposite = photoBoothRef.current.getFinalCompositeDataURL();
            
            // Fix: Validate existingComposite format
          if (existingComposite && typeof existingComposite === 'string') {
            if (!existingComposite.startsWith('data:image')) {
              console.error('[COMPOSE_IMAGE_FOR_PRINT] Invalid existing composite format, not a data URL');
              existingComposite = null;
            } else if (existingComposite.length > 50 * 1024 * 1024) { // 50MB limit for existing composite
              console.error('[COMPOSE_IMAGE_FOR_PRINT] Existing composite too large:', existingComposite.length, 'bytes');
              existingComposite = null;
            }
          }
          
          // Fix: Check if p5Instance is still valid before using
          if (existingComposite && p5Instance && typeof p5Instance.createGraphics === 'function') {
            console.log('[COMPOSE_IMAGE_FOR_PRINT] Attempting alternative: Add QR to existing composite...');
            try {
              // Helper: Load image with timeout (fixed race condition)
              const loadImageWithTimeout = (src: string, timeoutMs: number = 10000): Promise<p5.Image> => {
                return new Promise((resolve, reject) => {
                  let timeoutId: ReturnType<typeof setTimeout> | null = null;
                  let resolved = false;
                  
                  const cleanup = () => {
                    if (timeoutId) {
                      clearTimeout(timeoutId);
                      timeoutId = null;
                    }
                  };
                  
                  timeoutId = setTimeout(() => {
                    if (!resolved) {
                      resolved = true;
                      cleanup();
                      reject(new Error(`Image load timeout after ${timeoutMs}ms`));
                    }
                  }, timeoutMs);
                  
                  p5Instance!.loadImage(src, (img: p5.Image) => {
                    if (!resolved) {
                      resolved = true;
                      cleanup();
                      if (img) resolve(img);
                      else reject(new Error('Failed to load image'));
                    }
                  }, () => {
                    if (!resolved) {
                      resolved = true;
                      cleanup();
                      reject(new Error('Failed to load image'));
                    }
                  });
                });
              };
              
              // Load existing image with timeout
              const existingImg = await loadImageWithTimeout(existingComposite);
              
              // Validate dimensions
              if (!existingImg || existingImg.width <= 0 || existingImg.height <= 0) {
                throw new Error(`Invalid existing image dimensions: ${existingImg?.width}x${existingImg?.height}`);
              }
              
              // Fix: Validate height to prevent division by zero
              if (existingImg.height <= 0) {
                throw new Error(`Invalid existing image height: ${existingImg.height}`);
              }
              
              // Get dimensions - use same calculation as composeResult
              // Fix: Validate template.width before calculation
              if (!template.width || template.width <= 0 || !isFinite(template.width)) {
                throw new Error(`Invalid template width: ${template.width}`);
              }
              const W = template.width * 16;
              
              // Fix: Validate calculated width (prevent overflow, reasonable max 10000px)
              if (!isFinite(W) || W <= 0 || W > 10000) {
                throw new Error(`Invalid calculated width: ${W} (template.width: ${template.width})`);
              }
              
              // Fix aspect ratio: preserve existing image aspect ratio
              const existingAspectRatio = existingImg.width / existingImg.height;
              
              // Fix: Validate aspect ratio (finite, not NaN, not Infinity, > 0)
              if (!isFinite(existingAspectRatio) || existingAspectRatio <= 0 || isNaN(existingAspectRatio)) {
                throw new Error(`Invalid aspect ratio: ${existingAspectRatio} (width: ${existingImg.width}, height: ${existingImg.height})`);
              }
              
              const calculatedH = W / existingAspectRatio;
              // Use existing height as base, but ensure we don't crop
              const H = Math.max(calculatedH, existingImg.height);
              
              // Validate calculated dimensions
              if (W <= 0 || H <= 0 || !isFinite(W) || !isFinite(H)) {
                throw new Error(`Invalid calculated dimensions: W=${W}, H=${H}, aspectRatio=${existingAspectRatio}`);
              }
              
              console.log('[COMPOSE_IMAGE_FOR_PRINT] Alternative method - dimensions:', {
                originalWidth: existingImg.width,
                originalHeight: existingImg.height,
                aspectRatio: existingAspectRatio,
                calculatedW: W,
                calculatedH: H
              });
              
              // Use same constants as composeResult for consistency
              const minQrSize = 80;
              const qrSizePercent = 0.7; // 70% of paper width
              const textHeight = 50; // Space for "Scan untuk download" + "(Valid 24 jam)"
              const qrSpacing = 80; // Spacing below photos before QR
              
              // Calculate QR size (same as composeResult)
              const qrSize = Math.max(minQrSize, Math.floor(W * qrSizePercent));
              
              // Calculate QR position with bounds checking (same logic as composeResult)
              const qrX = (W - qrSize) / 2;
              let qrY = H - qrSize - textHeight - qrSpacing;
              const textX = W / 2;
              let textY = qrY + qrSize + 20;
              
              // Bounds check - ensure QR and text fit within canvas
              const textBottom = textY + 30;
              if (textBottom > H || qrY < 0) {
                console.warn('[COMPOSE_IMAGE_FOR_PRINT] QR code text would overflow, adjusting position');
                qrY = Math.max(0, H - qrSize - textHeight - 10);
                textY = qrY + qrSize + 20;
              }
              
              console.log('[COMPOSE_IMAGE_FOR_PRINT] Alternative method - QR position:', {
                qrX, qrY, textX, textY,
                canvasH: H,
                qrSize,
                paperWidth: W,
                qrSizePercent: `${(qrSize / W * 100).toFixed(1)}%`
              });
              
              // Create new graphics
              const out = p5Instance.createGraphics(W, H);
              out.background(255);
              
              // Draw existing composite - preserve aspect ratio
              // Calculate draw dimensions to fit within W x H while maintaining aspect ratio
              // Fix: Validate before division
              if (existingImg.height <= 0 || H <= 0) {
                throw new Error(`Invalid dimensions for aspect ratio calculation: imgH=${existingImg.height}, canvasH=${H}`);
              }
              const drawAspectRatio = existingImg.width / existingImg.height;
              const canvasAspectRatio = W / H;
              
              // Fix: Validate aspect ratios
              if (!isFinite(drawAspectRatio) || !isFinite(canvasAspectRatio) || drawAspectRatio <= 0 || canvasAspectRatio <= 0) {
                throw new Error(`Invalid aspect ratios: drawAspectRatio=${drawAspectRatio}, canvasAspectRatio=${canvasAspectRatio}`);
              }
              
              let drawW = W;
              let drawH = H;
              let drawX = 0;
              let drawY = 0;
              
              if (drawAspectRatio > canvasAspectRatio) {
                // Image is wider - fit to width
                drawW = W;
                drawH = W / drawAspectRatio;
                drawY = (H - drawH) / 2; // Center vertically
              } else {
                // Image is taller - fit to height
                drawH = H;
                drawW = H * drawAspectRatio;
                drawX = (W - drawW) / 2; // Center horizontally
              }
              
              out.image(existingImg, drawX, drawY, drawW, drawH);
              
              // Load QR code with timeout
              const qrImg = await loadImageWithTimeout(qrCodeDataURL);
              
              if (!qrImg || qrImg.width <= 0 || qrImg.height <= 0) {
                throw new Error(`Invalid QR image dimensions: ${qrImg?.width}x${qrImg?.height}`);
              }
              
              // Draw QR code
              out.image(qrImg, qrX, qrY, qrSize, qrSize);
              
              // Add instruction text (same as composeResult)
              out.textSize(18);
              out.fill(0);
              out.noStroke();
              out.textAlign(out.CENTER);
              out.textFont('monospace'); // Same font as composeResult
              out.text('Scan untuk download', textX, textY);
              out.textSize(14);
              out.text('(Valid 24 jam)', textX, textY + 20);
              
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dataURL = (out as any).canvas.toDataURL('image/png');
              if (dataURL) {
                console.log('[COMPOSE_IMAGE_FOR_PRINT] ✓ QR code added to existing composite (alternative method), dataURL length:', dataURL.length);
              } else {
                console.error('[COMPOSE_IMAGE_FOR_PRINT] ❌ Failed to convert alternative composite to dataURL');
              }
            } catch (altError) {
              console.error('[COMPOSE_IMAGE_FOR_PRINT] ❌ Alternative method failed:', altError);
              if (altError instanceof Error) {
                console.error('[COMPOSE_IMAGE_FOR_PRINT] Alternative error details:', altError.message, altError.stack);
              }
              // Don't throw - let it fallback to high-res without QR
              // Set dataURL to null so it will use fallback
              dataURL = null;
          }
          } else {
            // No alternative available - log and let fallback handle it
            console.error('[COMPOSE_IMAGE_FOR_PRINT] ❌ Alternative method not available:', {
              hasExistingComposite: !!existingComposite,
              hasP5: !!p5Instance
            });
            dataURL = null;
          }
          }
      }
        } else {
          console.warn('[COMPOSE_IMAGE_FOR_PRINT] QR code generation failed, falling back to high-res without QR');
        }
      } catch (error) {
        console.error('[COMPOSE_IMAGE_FOR_PRINT] Error composing image with QR code:', error);
        if (error instanceof Error) {
          console.error('[COMPOSE_IMAGE_FOR_PRINT] Error details:', error.message, error.stack);
        }
      // FIX 3: Jangan silent fallback - user harus tahu QR code tidak bisa ditambahkan
      console.error('[COMPOSE_IMAGE_FOR_PRINT] ⚠️ WARNING: Printing without QR code due to error above');
        // Fallback to high-res without QR
      }
    } else {
      console.log('[COMPOSE_IMAGE_FOR_PRINT] No photoId available, composing without QR code');
    }
    
  // FIX 4: Validasi dataURL sebelum return
    if (!dataURL) {
    if (currentPhotoId) {
      console.error('[COMPOSE_IMAGE_FOR_PRINT] ❌ CRITICAL: photoId exists but dataURL is null - QR code was not added!');
    }
      dataURL = photoBoothRef.current.getFinalCompositeDataURL();
      if (!dataURL) {
        console.error('[COMPOSE_IMAGE_FOR_PRINT] getFinalCompositeDataURL returned null');
      } else {
      console.log('[COMPOSE_IMAGE_FOR_PRINT] Using fallback high-res dataURL (without QR code), length:', dataURL.length);
      }
    }
    return dataURL;
  };

  // Initialize native bridge and printer instance
  useEffect(() => {
    nativeBridge.init();

    const initialDetection = detectNativeEnvironment();
    setIsNativeApp(initialDetection);

    const confirmationTimer = window.setInterval(() => {
      const detected = detectNativeEnvironment();
      if (detected) {
        setIsNativeApp(true);
        window.clearInterval(confirmationTimer);
        window.clearTimeout(confirmationTimeout);
      }
    }, 500);

    const confirmationTimeout = window.setTimeout(() => {
      window.clearInterval(confirmationTimer);
    }, 5000);
    
    // Get singleton printer instance
    const printerInstance = getHybridBluetoothPrinterService();
    setBluetoothPrinter(printerInstance);
    
    // Request initial printer status from native
    if (nativeBridge.isNativeApp() && nativeBridge.hasNativeBluetooth()) {
      console.log('PhotoBoothApp: Requesting initial printer status from native...');
      nativeBridge.sendMessage('GET_PRINTER_STATUS');
    } else {
      // Web environment - check singleton status
      console.log('PhotoBoothApp: Checking initial Bluetooth connection status...');
      const currentlyConnected = printerInstance.getIsConnected();
      console.log('PhotoBoothApp: Current connection status:', currentlyConnected);
      if (currentlyConnected) {
        setIsBluetoothConnected(true);
        console.log('PhotoBoothApp: Bluetooth already connected on mount');
      }
    }
    
    // Listen for Bluetooth status changes
    const statusHandler = (event: CustomEvent<{ connected: boolean; info?: unknown }>) => {
      console.log('PhotoBoothApp: Received bluetoothStatusChange event:', event.detail);
      setIsBluetoothConnected(event.detail.connected);
      if (event.detail.connected) {
        console.log('Bluetooth connected:', event.detail.info);
      } else {
        console.log('Bluetooth disconnected');
      }
    };
    window.addEventListener('bluetoothStatusChange', statusHandler as EventListener);
    
    return () => {
      window.clearInterval(confirmationTimer);
      window.clearTimeout(confirmationTimeout);
      window.removeEventListener('bluetoothStatusChange', statusHandler as EventListener);
    };
  }, [detectNativeEnvironment]);

  // Initialize wake lock when component mounts
  useEffect(() => {
    requestWakeLock();
    
    return () => {
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  const handleStart = () => {
    if (photoBoothRef.current) {
      photoBoothRef.current.startCountdown(3);
    }
  };

  const handleRetake = () => {
    // Clear photoId when retaking to ensure fresh capture
    if (photoBoothRef.current?.setPhotoIdForPrint) {
      photoBoothRef.current.setPhotoIdForPrint(null);
    }
    onBackToTemplate();
  };

  const handleCanvasClick = async () => {
    if (appState === 'REVIEW' && photoBoothRef.current) {
      // Fix: Helper function to reduce code duplication
      const fallbackToHighRes = () => {
        const highResDataURL = photoBoothRef.current?.getFinalCompositeDataURL();
        if (highResDataURL) {
          setHighResImageDataURL(highResDataURL);
          setIsModalOpen(true);
        }
      };
      
      const photoId = photoBoothRef.current.getPhotoIdForPrint?.();
      if (photoId) {
        // Generate QR code for download page
        const downloadURL = getDownloadURL(photoId);
        console.log('Download URL for modal:', downloadURL);
        const qrCodeDataURL = await generateQRCodeDataURL(downloadURL);
        // Fix: Re-check after await
        if (!photoBoothRef.current) {
          console.error('photoBoothRef became null after QR generation');
          fallbackToHighRes();
          return;
        }
        console.log('QR Code generated for modal:', !!qrCodeDataURL);
        
        if (qrCodeDataURL) {
          // Compose modal version with QR code
          try {
          const { composeResult } = await import('../utils/photoComposer');
          // Fix: Re-check after await
          if (!photoBoothRef.current) {
            console.error('photoBoothRef became null after import composeResult');
            fallbackToHighRes();
            return;
          }
          const p5Instance = photoBoothRef.current.getP5Instance?.();
          const frames = photoBoothRef.current.getFrames?.();
          
          console.log('P5 instance for modal:', !!p5Instance, 'Frames:', frames?.length);
          
            // Fix: Validate frames length matches template
            if (p5Instance && frames && frames.length === template.photoCount) {
            const modalComposite = await composeResult(
              p5Instance,
              frames,
              template,
              qrCodeDataURL
            );
            
              // Fix: Re-check after await
              if (!photoBoothRef.current) {
                console.error('photoBoothRef became null after composeResult');
                fallbackToHighRes();
              } else if (modalComposite) {
                // Fix: Validate modalComposite before accessing .canvas
                if (!modalComposite.canvas || typeof modalComposite.canvas.toDataURL !== 'function') {
                  console.error('Invalid modalComposite: missing canvas or toDataURL method');
                  fallbackToHighRes();
                } else {
              const modalDataURL = modalComposite.canvas.toDataURL('image/png');
                  if (modalDataURL) {
              setHighResImageDataURL(modalDataURL);
              setIsModalOpen(true);
              console.log('Modal opened with QR code');
                  } else {
                    console.error('Failed to convert modal composite to dataURL');
                    fallbackToHighRes();
            }
          }
        } else {
                console.error('Modal composite is null');
                fallbackToHighRes();
              }
        } else {
              console.warn('Modal: Invalid p5Instance or frames, falling back to high-res without QR', {
                hasP5: !!p5Instance,
                framesLength: frames?.length || 0,
                expectedCount: template.photoCount
              });
              fallbackToHighRes();
            }
          } catch (modalError) {
            console.error('Error composing modal with QR code:', modalError);
            if (modalError instanceof Error) {
              console.error('Modal error details:', modalError.message, modalError.stack);
            }
            fallbackToHighRes();
        }
      } else {
        // Fallback to high-res without QR code
          fallbackToHighRes();
        }
      } else {
        // Fallback to high-res without QR code
        fallbackToHighRes();
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setHighResImageDataURL(null);
  };

  const handleDownload = () => {
    console.log('Download button clicked');
    if (photoBoothRef.current) {
      console.log('Calling downloadComposite');
      photoBoothRef.current.downloadComposite();
    } else {
      console.error('photoBoothRef.current is null');
    }
  };

  const handlePrint = async () => {
    // Guard: Prevent concurrent prints using synchronous ref (React state is async)
    if (printLockRef.current) {
      console.warn('[HANDLE_PRINT] Print already in progress, ignoring duplicate request');
      showNotification('Print sedang diproses, tunggu sebentar...', 'error');
      return;
    }

    // Set lock immediately (synchronous) to prevent race condition
    printLockRef.current = true;
    setIsPrinting(true); // Update state for UI feedback
    
    try {
      if (!photoBoothRef.current) {
        console.error('PhotoBooth ref not found');
        printLockRef.current = false;
        setIsPrinting(false);
        return;
      }

      // Check if printer is connected
      console.log('Print check - bluetoothPrinter:', !!bluetoothPrinter);
      console.log('Print check - isBluetoothConnected:', isBluetoothConnected);
      if (!bluetoothPrinter || !isBluetoothConnected) {
        showNotification('Please connect printer in admin page first', 'error');
        printLockRef.current = false;
        setIsPrinting(false);
        return;
      }

      // Check upload settings
      const { getUploadSettings } = await import('../services/configService');
      const uploadSettings = getUploadSettings();
      const saveBeforePrint = uploadSettings.saveBeforePrint ?? true;
      
      console.log('[HANDLE_PRINT] Upload settings - saveBeforePrint:', saveBeforePrint);

      // Get high-res composite dataURL for print
      const highResDataURL = photoBoothRef.current.getFinalCompositeDataURL();
      if (!highResDataURL) {
        console.error('Final composite not found for print');
        showNotification('Failed: Photo not found', 'error');
        printLockRef.current = false;
        setIsPrinting(false);
        return;
      }
      
      // Fix: Validate highResDataURL format
      if (typeof highResDataURL !== 'string' || !highResDataURL.startsWith('data:image')) {
        console.error('[HANDLE_PRINT] Invalid highResDataURL format:', highResDataURL?.substring(0, 50));
        showNotification('Failed: Invalid photo format', 'error');
        printLockRef.current = false;
        setIsPrinting(false);
        return;
      }

      let photoId: string | null = null;

      // If saveBeforePrint is enabled, save photo first
      if (saveBeforePrint) {
        // Atomic check-and-save with lock to prevent duplicate saves
        if (!saveLockRef.current) {
          saveLockRef.current = true;
          try {
            // First check
            photoId = photoBoothRef.current.getPhotoIdForPrint();
            
            // If photo hasn't been saved yet, save it now
            if (!photoId) {
              // Double-check after acquiring lock (another thread might have saved it)
              photoId = photoBoothRef.current.getPhotoIdForPrint();
              
              if (!photoId) {
                // Save photo to IndexedDB (becomes pending for upload)
                console.log('[HANDLE_PRINT] Starting to save photo locally before print...');
                console.log('[HANDLE_PRINT] highResDataURL exists:', !!highResDataURL);
                console.log('[HANDLE_PRINT] highResDataURL type:', typeof highResDataURL);
                console.log('[HANDLE_PRINT] highResDataURL length:', highResDataURL?.length || 0);
                
                const { savePhotoLocally } = await import('../services/photoStorageService');
                let photoRecord;
                try {
                  console.log('[HANDLE_PRINT] Calling savePhotoLocally...');
                  photoRecord = await savePhotoLocally(highResDataURL);
                  photoId = photoRecord.id;
                  console.log('[HANDLE_PRINT] ✓ Photo saved locally successfully');
                  console.log('[HANDLE_PRINT] Photo ID:', photoId);
                  console.log('[HANDLE_PRINT] Photo record:', JSON.stringify({
                    id: photoRecord.id,
                    sessionCode: photoRecord.sessionCode,
                    photoNumber: photoRecord.photoNumber,
                    timestamp: photoRecord.timestamp
                  }));
                  
                  // Update photoId in PhotoBooth ref so it's available for next print
                  if (photoBoothRef.current.setPhotoIdForPrint) {
                    console.log('[HANDLE_PRINT] Updating photoId in PhotoBooth ref');
                    photoBoothRef.current.setPhotoIdForPrint(photoId);
                  }
                } catch (saveError) {
                  console.error('[HANDLE_PRINT] ERROR: Failed to save photo locally');
                  console.error('[HANDLE_PRINT] Error type:', typeof saveError);
                  if (saveError instanceof Error) {
                    console.error('[HANDLE_PRINT] Error name:', saveError.name);
                    console.error('[HANDLE_PRINT] Error message:', saveError.message);
                    console.error('[HANDLE_PRINT] Error stack:', saveError.stack);
                  } else {
                    console.error('[HANDLE_PRINT] Error value:', String(saveError));
                  }
                  
                  // Clear photoId on error to maintain state consistency
                  if (photoBoothRef.current.setPhotoIdForPrint) {
                    photoBoothRef.current.setPhotoIdForPrint(null);
                  }
                  
                  // Show more specific error message
                  let errorMessage = 'Failed to save photo. Please try again.';
                  if (saveError instanceof Error) {
                    errorMessage = saveError.message || errorMessage;
                  }
                  
                  console.error('[HANDLE_PRINT] Showing error notification:', errorMessage);
                  showNotification(errorMessage, 'error');
                  return;
                }
              } else {
                console.log('[HANDLE_PRINT] Photo was saved by another operation while waiting for lock');
              }
            } else {
              console.log('Photo already saved with ID:', photoId, '- Reusing existing photo');
            }
          } finally {
            saveLockRef.current = false;
          }
        } else {
          // Lock is held by another operation, wait briefly and check again
          console.log('[HANDLE_PRINT] Save lock is held, waiting...');
          let retries = 0;
          const maxRetries = 10;
          while (saveLockRef.current && retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
          }
          
          // After lock is released, check if photo was saved
          photoId = photoBoothRef.current.getPhotoIdForPrint();
          if (!photoId) {
            console.warn('[HANDLE_PRINT] Photo still not saved after lock release, proceeding without save');
          } else {
            console.log('[HANDLE_PRINT] Photo was saved by another operation:', photoId);
          }
        }
      } else {
        // saveBeforePrint is disabled - BUT we still need photoId for QR code generation
        console.log('[HANDLE_PRINT] saveBeforePrint is disabled - checking for existing photoId for QR code');
        photoId = photoBoothRef.current.getPhotoIdForPrint();
        
        // If no photoId exists, we need to save it temporarily for QR code
        if (!photoId) {
          console.log('[HANDLE_PRINT] No photoId found, saving temporarily for QR code generation');
          try {
            const { savePhotoLocally } = await import('../services/photoStorageService');
            const photoRecord = await savePhotoLocally(highResDataURL);
            photoId = photoRecord.id;
            
            // Store photoId temporarily (will be used for QR code)
            if (photoBoothRef.current.setPhotoIdForPrint) {
              photoBoothRef.current.setPhotoIdForPrint(photoId);
            }
            console.log('[HANDLE_PRINT] ✓ Photo saved temporarily for QR code, ID:', photoId);
          } catch (saveError) {
            console.error('[HANDLE_PRINT] Failed to save photo for QR code:', saveError);
            // Continue without QR code - non-fatal error
            photoId = null;
          }
        } else {
          console.log('[HANDLE_PRINT] Using existing photoId for QR code:', photoId);
        }
      }

      // Compose image for print (with QR code using photoId if available)
      console.log('Composing image for print...');
      const dataURL = await composeImageForPrint(photoId || undefined);

      if (!dataURL) {
        // Fallback to high-res dataURL if composeImageForPrint fails
        console.warn('composeImageForPrint returned null, using high-res dataURL');
      }
      
      // Get high-res dataURL as fallback if composeImageForPrint fails
      const highResDataURLFallback = photoBoothRef.current.getFinalCompositeDataURL();
      
      // Print via Bluetooth (use composed image with QR code or fallback to high-res)
      console.log('Starting Bluetooth print...');
      const printDataURL = dataURL || highResDataURLFallback;
      if (!printDataURL) {
        showNotification('Failed: Photo not found for print', 'error');
        return;
      }
      
      // Get width from printerInfo or settings, convert mm to pixels
      let printWidth: number;
      const printerInfo = bluetoothPrinter.getPrinterInfo();
      if (printerInfo?.width) {
        printWidth = printerInfo.width;
        console.log('[HANDLE_PRINT] Using width from printerInfo:', printWidth);
      } else {
        // Fallback to settings
        const settings = getPrinterSizeSettings();
        printWidth = settings.thermalSize === '80mm' ? 576 : 384;
        console.log('[HANDLE_PRINT] Using width from settings:', printWidth, `(${settings.thermalSize})`);
      }
      
      await bluetoothPrinter.printImage(printDataURL, printWidth);
      console.log('[HANDLE_PRINT] Print command sent');
      if (photoId) {
        if (saveBeforePrint) {
          console.log('[HANDLE_PRINT] Photo ID:', photoId, '- Status: PENDING UPLOAD');
        } else {
          console.log('[HANDLE_PRINT] Photo ID:', photoId, '- Saved temporarily for QR code (saveBeforePrint disabled)');
        }
      } else {
        console.log('[HANDLE_PRINT] Photo printed directly without QR code (no photoId available)');
      }
      // Note: Actual print result will come via PRINT_SUCCESS event
      
    } catch (error) {
      console.error('Print failed:', error);
      showNotification('Failed to print. Please try again.', 'error');
    } finally {
      // Release lock synchronously
      printLockRef.current = false;
      setIsPrinting(false); // Update state for UI
    }
  };


  const handleStateChange = (newState: AppState) => {
    setAppState(newState);
    
    // Clear photoId when starting new capture (PREVIEW state)
    if (newState === 'PREVIEW' && photoBoothRef.current?.setPhotoIdForPrint) {
      photoBoothRef.current.setPhotoIdForPrint(null);
    }
    
    // Release wake lock when in review mode
    if (newState === 'REVIEW') {
      releaseWakeLock();
    }
  };

  const handleFramesUpdate = (newFrames: p5.Image[]) => {
    setFrames(newFrames);
  };

  const handleFinalCompositeUpdate = (composite: p5.Graphics | null) => {
    setFinalComposite(composite);
  };

  const handleCountdownTextUpdate = (text: string) => {
    setCountdownText(text);
  };

  const handleCanvasResize = (width: number, height: number) => {
    setCanvasSize({ width, height });
  };

  const handleCanvasModeChange = (isReview: boolean) => {
    setIsReviewMode(isReview);
    
    // Add/remove review-mode class to canvas wrap
    const canvasWrap = document.getElementById('canvas-wrap');
    if (canvasWrap) {
      if (isReview) {
        canvasWrap.classList.add('review-mode');
      } else {
        canvasWrap.classList.remove('review-mode');
      }
    }
  };

  return (
    <>
      {notification && (
        <div 
          className={`photo-notification photo-notification-${notification.type}`}
          onClick={() => setNotification(null)}
        >
          {notification.message}
          <button 
            className="photo-notification-close"
            onClick={(e) => {
              e.stopPropagation();
              setNotification(null);
            }}
          >
            ×
          </button>
        </div>
      )}
      {/* Capture Content - Same structure as template selector */}
      <div className="capture-content">
        {/* Header */}
        <h1 className="capture-title">MOROBOOTH</h1>
        <p className="capture-subtitle">Layout: {template.name}</p>
        
        {/* Camera Preview Area - Center like template grid */}
        <div className="capture-preview-wrapper" onClick={handleCanvasClick}>
          <div className="capture-preview-container">
            <PhotoBooth
              ref={photoBoothRef}
              state={appState}
              countdownText={countdownText}
              template={template}
              onStateChange={handleStateChange}
              onFramesUpdate={handleFramesUpdate}
              onFinalCompositeUpdate={handleFinalCompositeUpdate}
              onCountdownTextUpdate={handleCountdownTextUpdate}
              onCanvasResize={handleCanvasResize}
              onCanvasModeChange={handleCanvasModeChange}
            />
            {/* Dynamic Overlay Mask based on template */}
            {appState === 'PREVIEW' && (
              <div className={`capture-overlay capture-overlay-${template.id}`}></div>
            )}
          </div>
        </div>
        
        {/* Footer Button */}
        {appState === 'PREVIEW' && (
          <>
            <button className="capture-start-button" onClick={handleStart}>
              START
            </button>
            <p className="capture-instruction">Press START when ready</p>
          </>
        )}
        {appState === 'REVIEW' && (
          <div id="ui-overlay">
            <Controls
              state={appState}
              onStart={handleStart}
              onRetake={handleRetake}
              onDownload={handleDownload}
              onPrint={handlePrint}
              isNativeApp={isNativeApp}
              isPrinting={isPrinting}
              isBluetoothConnected={isBluetoothConnected}
            />
          </div>
        )}
      </div>
      
      <PreviewModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        imageDataURL={highResImageDataURL}
      />
    </>
  );
};


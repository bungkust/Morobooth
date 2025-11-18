import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PhotoBooth, type PhotoBoothRef, type AppState } from './PhotoBooth';
import { Controls } from './Controls';
import { PreviewModal } from './PreviewModal';
import { useWakeLock } from '../hooks/useWakeLock';
import { generateQRCodeDataURL, getDownloadURL } from '../utils/qrCodeGenerator';
import { getHybridBluetoothPrinterService, type HybridBluetoothPrinterService } from '../services/hybridBluetoothPrinterService';
import { nativeBridge } from '../services/nativeBridgeService';

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
    const hasRNWebView = typeof window !== 'undefined' && Boolean((window as any).ReactNativeWebView);
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
  const [, setFrames] = useState<any[]>([]);
  const [, setFinalComposite] = useState<any | null>(null);
  const [, setCanvasSize] = useState({ width: 640, height: 480 });
  const [, setIsReviewMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [highResImageDataURL, setHighResImageDataURL] = useState<string | null>(null);
  const [bluetoothPrinter, setBluetoothPrinter] = useState<HybridBluetoothPrinterService | null>(null);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Helper untuk show notification (ganti alert)
  const showNotification = (message: string, type: 'success' | 'error' = 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Helper: compose final image (with QR if available) and return dataURL
  const composeImageForPrint = async (photoId?: string): Promise<string | null> => {
    if (!photoBoothRef.current) return null;
    let dataURL: string | null = null;
    
    // Use provided photoId or get from ref
    const currentPhotoId = photoId || photoBoothRef.current.getPhotoIdForPrint();
    
    if (currentPhotoId) {
      const downloadURL = getDownloadURL(currentPhotoId);
      const qrCodeDataURL = await generateQRCodeDataURL(downloadURL);
      if (qrCodeDataURL) {
        const { composeResult } = await import('../utils/photoComposer');
        const p5Instance = photoBoothRef.current.getP5Instance?.();
        const frames = photoBoothRef.current.getFrames?.();
        if (p5Instance && frames) {
          const printComposite = await composeResult(
            p5Instance,
            frames,
            template,
            qrCodeDataURL
          );
          dataURL = printComposite.canvas.toDataURL('image/png');
        }
      }
    }
    if (!dataURL) {
      dataURL = photoBoothRef.current.getFinalCompositeDataURL();
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
    const statusHandler = (event: any) => {
      console.log('PhotoBoothApp: Received bluetoothStatusChange event:', event.detail);
      setIsBluetoothConnected(event.detail.connected);
      if (event.detail.connected) {
        console.log('Bluetooth connected:', event.detail.info);
      } else {
        console.log('Bluetooth disconnected');
      }
    };
    window.addEventListener('bluetoothStatusChange', statusHandler);
    
    return () => {
      window.clearInterval(confirmationTimer);
      window.clearTimeout(confirmationTimeout);
      window.removeEventListener('bluetoothStatusChange', statusHandler);
    };
  }, []);

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
    onBackToTemplate();
  };

  const handleCanvasClick = async () => {
    if (appState === 'REVIEW' && photoBoothRef.current) {
      const photoId = photoBoothRef.current.getPhotoIdForPrint?.();
      if (photoId) {
        // Generate QR code for download page
        const downloadURL = getDownloadURL(photoId);
        console.log('Download URL for modal:', downloadURL);
        const qrCodeDataURL = await generateQRCodeDataURL(downloadURL);
        console.log('QR Code generated for modal:', !!qrCodeDataURL);
        
        if (qrCodeDataURL) {
          // Compose modal version with QR code
          const { composeResult } = await import('../utils/photoComposer');
          const p5Instance = photoBoothRef.current.getP5Instance?.();
          const frames = photoBoothRef.current.getFrames?.();
          
          console.log('P5 instance for modal:', !!p5Instance, 'Frames:', frames?.length);
          
          if (p5Instance && frames) {
            const modalComposite = await composeResult(
              p5Instance,
              frames,
              template,
              qrCodeDataURL
            );
            
            if (modalComposite) {
              const modalDataURL = modalComposite.canvas.toDataURL('image/png');
              setHighResImageDataURL(modalDataURL);
              setIsModalOpen(true);
              console.log('Modal opened with QR code');
            }
          }
        } else {
          // Fallback to high-res without QR code
          const highResDataURL = photoBoothRef.current.getFinalCompositeDataURL();
          if (highResDataURL) {
            setHighResImageDataURL(highResDataURL);
            setIsModalOpen(true);
          }
        }
      } else {
        // Fallback to high-res without QR code
        const highResDataURL = photoBoothRef.current.getFinalCompositeDataURL();
        if (highResDataURL) {
          setHighResImageDataURL(highResDataURL);
          setIsModalOpen(true);
        }
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
    try {
      if (!photoBoothRef.current) {
        console.error('PhotoBooth ref not found');
        return;
      }

      // Check if printer is connected
      console.log('Print check - bluetoothPrinter:', !!bluetoothPrinter);
      console.log('Print check - isBluetoothConnected:', isBluetoothConnected);
      if (!bluetoothPrinter || !isBluetoothConnected) {
        showNotification('Silakan connect printer di halaman admin terlebih dahulu', 'error');
        return;
      }

      // Check if photo has already been saved (to avoid duplicates)
      let photoId = photoBoothRef.current.getPhotoIdForPrint();
      
      // If photo hasn't been saved yet, save it now
      if (!photoId) {
        // Get high-res composite dataURL for saving
        const highResDataURL = photoBoothRef.current.getFinalCompositeDataURL();
        if (!highResDataURL) {
          console.error('Final composite not found for saving');
          showNotification('Gagal: Foto tidak ditemukan', 'error');
          return;
        }

        // Save photo to IndexedDB (becomes pending for upload)
        console.log('Saving photo locally before print...');
        const { savePhotoLocally } = await import('../services/photoStorageService');
        let photoRecord;
        try {
          photoRecord = await savePhotoLocally(highResDataURL);
          photoId = photoRecord.id;
          console.log('Photo saved locally:', photoId);
          
          // Update photoId in PhotoBooth ref so it's available for next print
          if (photoBoothRef.current.setPhotoIdForPrint) {
            photoBoothRef.current.setPhotoIdForPrint(photoId);
          }
        } catch (saveError) {
          console.error('Failed to save photo locally:', saveError);
          showNotification('Gagal menyimpan foto. Silakan coba lagi.', 'error');
          return;
        }
      } else {
        console.log('Photo already saved with ID:', photoId, '- Reusing existing photo');
      }

      // Compose image for print (with QR code using photoId)
      console.log('Composing image for print with QR code...');
      const dataURL = await composeImageForPrint(photoId);

      if (!dataURL) {
        // Fallback to high-res dataURL if composeImageForPrint fails
        console.warn('composeImageForPrint returned null, using high-res dataURL');
      }
      
      // Get high-res dataURL as fallback if composeImageForPrint fails
      const highResDataURL = photoBoothRef.current.getFinalCompositeDataURL();
      
      // Print via Bluetooth (use composed image with QR code or fallback to high-res)
      console.log('Starting Bluetooth print...');
      const printDataURL = dataURL || highResDataURL;
      if (!printDataURL) {
        showNotification('Gagal: Foto tidak ditemukan untuk print', 'error');
        return;
      }
      await bluetoothPrinter.printImage(printDataURL);
      console.log('Print command sent');
      console.log('Photo ID:', photoId, '- Status: PENDING UPLOAD');
      // Note: Actual print result will come via PRINT_SUCCESS event
      
    } catch (error) {
      console.error('Print failed:', error);
      showNotification('Gagal mencetak. Silakan coba lagi.', 'error');
    }
  };


  const handleStateChange = (newState: AppState) => {
    setAppState(newState);
    
    // Release wake lock when in review mode
    if (newState === 'REVIEW') {
      releaseWakeLock();
    }
  };

  const handleFramesUpdate = (newFrames: any[]) => {
    setFrames(newFrames);
  };

  const handleFinalCompositeUpdate = (composite: any | null) => {
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
      <div className="app-header">
        <h1 className="app-title">MOROBOOTH</h1>
        <p className="template-info">Layout: {template.name}</p>
        <p className="app-description">
          SNAP & PRINT! PRESS START FOR A QUICK<br/>
          PHOTO SESSION, COUNTDOWN BEGINS IN...<br/>
          3-2-1-SMILE! {template.photoCount} PHOTOS WILL BE TAKEN<br/>
          AUTOMATICALLY! READY TO PRINT!
        </p>
      </div>
      
      <div onClick={handleCanvasClick}>
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
      </div>
      
      <div id="ui-overlay">
        <Controls
          state={appState}
          onStart={handleStart}
          onRetake={handleRetake}
          onDownload={handleDownload}
          onPrint={handlePrint}
          isNativeApp={isNativeApp}
        />
      </div>
      
      <div className="app-footer">
        <div className="stars">****</div>
        <div>THANK YOU FOR SMILING WITH MOROBOOTH</div>
      </div>
      
      <PreviewModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        imageDataURL={highResImageDataURL}
      />
    </>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { PhotoBooth, type PhotoBoothRef, type AppState } from './PhotoBooth';
import { Controls } from './Controls';
import { PreviewModal } from './PreviewModal';
import { useWakeLock } from '../hooks/useWakeLock';
import { generateQRCodeDataURL, getDownloadURL } from '../utils/qrCodeGenerator';
import { HybridBluetoothPrinterService } from '../services/hybridBluetoothPrinterService';
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

  // Helper: compose final image (with QR if available) and return dataURL
  const composeImageForPrint = async (): Promise<string | null> => {
    if (!photoBoothRef.current) return null;
    let dataURL: string | null = null;
    const photoId = photoBoothRef.current.getPhotoIdForPrint();
    if (photoId) {
      const downloadURL = getDownloadURL(photoId);
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
  
  const [printProgress, setPrintProgress] = useState<{status: string, progress: number} | null>(null);

  // Initialize native bridge and printer instance
  useEffect(() => {
    nativeBridge.init();
    
    // Create shared printer instance
    const printerInstance = new HybridBluetoothPrinterService();
    setBluetoothPrinter(printerInstance);
    
    // Listen for print progress
    const progressHandler = (event: any) => {
      setPrintProgress(event.detail);
    };
    window.addEventListener('printProgress', progressHandler);
    
    // Listen for Bluetooth status changes
    const statusHandler = (event: any) => {
      console.log('PhotoBoothApp: Received bluetoothStatusChange event:', event.detail);
      setIsBluetoothConnected(event.detail.connected);
      if (event.detail.connected) {
        console.log('Bluetooth connected:', event.detail.info);
      }
    };
    window.addEventListener('bluetoothStatusChange', statusHandler);
    
    return () => {
      window.removeEventListener('printProgress', progressHandler);
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

      const dataURL = await composeImageForPrint();

      if (!dataURL) {
        console.error('Final composite not found for printing');
        alert('Gagal: Foto tidak ditemukan');
        return;
      }

      // Check if printer is connected
      console.log('Print check - bluetoothPrinter:', !!bluetoothPrinter);
      console.log('Print check - isBluetoothConnected:', isBluetoothConnected);
      if (!bluetoothPrinter || !isBluetoothConnected) {
        alert('Silahkan connect printer di halaman admin terlebih dahulu');
        return;
      }

      // Print via Bluetooth
      console.log('Starting Bluetooth print...');
      await bluetoothPrinter.printImage(dataURL);
      console.log('Print command sent');
      // Note: Actual print result will come via PRINT_SUCCESS event
      
    } catch (error) {
      console.error('Print failed:', error);
      alert('Gagal mencetak. Silakan coba lagi.');
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

      {/* Print progress indicator */}
      {printProgress && (
        <div className="print-progress">
          <div className="progress-bar" style={{ width: `${printProgress.progress}%` }} />
          <span>{printProgress.status}...</span>
        </div>
      )}
      
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

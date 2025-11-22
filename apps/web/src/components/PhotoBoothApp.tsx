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
    if (photoBoothRef.current) {
      photoBoothRef.current.downloadComposite();
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
        return;
      }

      // Try Bluetooth printing first
      if (isBluetoothConnected && bluetoothPrinter) {
        const ok = await bluetoothPrinter.printImage(dataURL);
        if (ok) {
          alert('Printed via Bluetooth');
          return;
        }
      }

      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        console.error('Failed to open print window');
        return;
      }
      
      // Create print-friendly HTML (58mm thermal paper)
      const printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Morobooth Print</title>
          <style>
            @page {
              size: 58mm auto; /* Thermal roll width */
              margin: 3mm;     /* Small margins */
            }
            body {
              margin: 0;
              padding: 0;
              font-family: monospace;
              background: white;
            }
            .print-container {
              width: 58mm;       /* lock container to paper width */
              display: flex;
              flex-direction: column;
              align-items: center;
              margin: 0 auto;
            }
            .print-image {
              width: 100%;
              height: auto;
              image-rendering: pixelated;
              image-rendering: -moz-crisp-edges;
              image-rendering: crisp-edges;
            }
            .print-footer {
              text-align: center;
              font-size: 12px;
              margin-top: 10px;
              padding: 5px;
            }
            @media print {
              body { margin: 0; }
              .print-container { width: 58mm; }
              .print-image { width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            <img src="${dataURL}" alt="Morobooth Photo" class="print-image" />
            <div class="print-footer">
              MOROBOOTH<br/>
              ${new Date().toLocaleDateString('id-ID')}
            </div>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(printHTML);
      printWindow.document.close();
      
      // Wait for image to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      };
      
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
      {/* Header Section - 10vh */}
      <div className="capture-header">
        <h1 className="capture-title">MOROBOOTH</h1>
        <p className="capture-subtitle">Layout: {template.name}</p>
      </div>

      {/* Print progress indicator */}
      {printProgress && (
        <div className="print-progress">
          <div className="progress-bar" style={{ width: `${printProgress.progress}%` }} />
          <span>{printProgress.status}...</span>
        </div>
      )}
      
      {/* Camera Preview Area - 70-75vh */}
      <div className="capture-preview-area" onClick={handleCanvasClick}>
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
      
      {/* Footer Section - 15-20vh */}
      <div className="capture-footer">
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

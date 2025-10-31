import { useState, useRef, useEffect } from 'react';
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
  const [bluetoothError, setBluetoothError] = useState<string>('');
  const [printerInfo, setPrinterInfo] = useState<{ name: string; width: number; dpi: number } | null>(null);

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

  // Initialize native bridge
  useEffect(() => {
    nativeBridge.init();
    
    // Listen for print progress
    const handler = (event: any) => {
      setPrintProgress(event.detail);
    };
    window.addEventListener('printProgress', handler);
    
    return () => {
      window.removeEventListener('printProgress', handler);
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

  const handleShareToPrintApp = async () => {
    try {
      const dataURL = await composeImageForPrint();
      if (!dataURL) return alert('Gambar belum siap untuk dibagikan');
      if (typeof (navigator as any).share === 'function') {
        const resp = await fetch(dataURL);
        const blob = await resp.blob();
        const file = new File([blob], 'morobooth-58mm.png', { type: 'image/png' });
        const shareData: any = { files: [file], title: 'Morobooth', text: 'Print via thermal printer' };
        const canShareFn = (navigator as any).canShare;
        const canShare = typeof canShareFn === 'function' ? canShareFn.call(navigator, shareData) : false;
        if (canShare) {
          await (navigator as any).share(shareData);
          return;
        }
      }
      await handlePrint();
    } catch (e) {
      console.error('Share print error:', e);
      alert('Gagal membuka aplikasi print. Coba gunakan tombol PRINT.');
    }
  };

  // Open ESC POS Print Service app via Android intent (no chooser)
  const openEscPosApp = () => {
    try {
      const pkg = 'com.loopedlabs.escposprintservice';
      const intentUrl = 'intent:#Intent;scheme=escposprintservice;package=' + pkg + ';end';
      // Try open the app directly
      window.location.href = intentUrl;
      // Fallback: open Play Store if not installed
      setTimeout(() => {
        try {
          window.location.href = 'market://details?id=' + pkg;
        } catch {}
      }, 800);
    } catch (e) {
      console.error('Open ESC POS app failed', e);
    }
  };

  const handleConnectBluetooth = async () => {
    try {
      setBluetoothError('');
      const svc = new HybridBluetoothPrinterService();
      
      if (svc.isNativeEnvironment()) {
        // Native: akan trigger scan & connect
        await svc.connect();
        setBluetoothPrinter(svc);
        setIsBluetoothConnected(true);
      } else {
        // Web Bluetooth fallback
        if (!('bluetooth' in navigator)) {
          setBluetoothError('Web Bluetooth not supported');
          alert('Web Bluetooth not supported in this browser');
          return;
        }
        
        const connected = await svc.connect();
        if (connected) {
          setBluetoothPrinter(svc);
          setIsBluetoothConnected(true);
          setPrinterInfo(svc.getPrinterInfo());
          alert(`Connected to ${svc.getPrinterInfo()?.name || 'Printer'}`);
        } else {
          setBluetoothError('Failed to connect to printer');
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setBluetoothError(msg);
      alert('Bluetooth connect error: ' + msg);
    }
  };

  const handleDisconnectBluetooth = async () => {
    try {
      await bluetoothPrinter?.disconnect();
    } finally {
      setBluetoothPrinter(null);
      setIsBluetoothConnected(false);
      setPrinterInfo(null);
      setBluetoothError('');
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

      {/* Bluetooth controls */}
      <div className="bluetooth-controls">
        {!isBluetoothConnected ? (
          <button
            className="bluetooth-btn"
            onClick={handleConnectBluetooth}
            disabled={!('bluetooth' in navigator)}
          >
            {('bluetooth' in navigator) ? 'Connect Bluetooth Printer' : 'Bluetooth Not Supported'}
          </button>
        ) : (
          <div className="bluetooth-status">
            <div className="printer-info">
              <span>Connected: {printerInfo?.name}</span>
              {printerInfo && (
                <span className="printer-specs">{printerInfo.width}px · {printerInfo.dpi} DPI</span>
              )}
            </div>
            <button className="disconnect-btn" onClick={handleDisconnectBluetooth}>Disconnect</button>
          </div>
        )}
        {bluetoothError && <div className="bluetooth-error">{bluetoothError}</div>}
        {/* Print progress indicator */}
        {printProgress && (
          <div className="print-progress">
            <div className="progress-bar" style={{ width: `${printProgress.progress}%` }} />
            <span>{printProgress.status}...</span>
          </div>
        )}
        {/* Share/Print helpers */}
        <button className="bluetooth-btn" onClick={handlePrint}>PRINT (Dialog)</button>
        <button className="bluetooth-btn" onClick={handleShareToPrintApp}>Share to Print App</button>
        <button className="bluetooth-btn" onClick={openEscPosApp}>Open ESC POS Print Service</button>
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

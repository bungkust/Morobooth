import React from 'react';
import type { AppState } from './PhotoBooth';

interface ControlsProps {
  state: AppState;
  onStart: () => void;
  onRetake: () => void;
  onDownload: () => void;
  onPrint: () => void;
  isNativeApp?: boolean;
  isPrinting?: boolean;
  isBluetoothConnected?: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  state,
  onStart,
  onRetake,
  onDownload,
  onPrint,
  isNativeApp = false,
  isPrinting = false,
  isBluetoothConnected = false
}) => {
  if (state === 'PREVIEW') {
    return (
      <div className="controls">
        <button className="start-button" onClick={onStart}>
          START
        </button>
      </div>
    );
  }

  if (state === 'REVIEW') {
    const printDisabled = isPrinting || !isBluetoothConnected;
    
    return (
      <div className="controls">
        <div className="button-row">
          <button className="retake-button" onClick={onRetake} disabled={isPrinting}>
            RETAKE
          </button>
        {isNativeApp ? (
            <button 
              className="print-button" 
              onClick={onPrint}
              disabled={printDisabled}
              title={isPrinting ? 'Print sedang diproses...' : !isBluetoothConnected ? 'Printer tidak terhubung' : ''}
            >
              {isPrinting ? 'PRINTING...' : 'PRINT'}
            </button>
          ) : (
          <button className="download-button" onClick={onDownload} disabled={isPrinting}>
            DOWNLOAD
          </button>
          )}
        </div>
      </div>
    );
  }

  return null;
};

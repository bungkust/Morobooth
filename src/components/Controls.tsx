import React from 'react';
import type { AppState } from './PhotoBooth';

interface ControlsProps {
  state: AppState;
  onStart: () => void;
  onRetake: () => void;
  onDownload: () => void;
  onPrint: () => void;
  isNativeApp?: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  state,
  onStart,
  onRetake,
  onDownload,
  onPrint,
  isNativeApp = false
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
    return (
      <div className="controls">
        <div className="button-row">
          <button className="retake-button" onClick={onRetake}>
            RETAKE
          </button>
        {isNativeApp ? (
            <button className="print-button" onClick={onPrint}>
              PRINT
            </button>
          ) : (
            <button className="download-button" onClick={onDownload}>
              DOWNLOAD
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
};

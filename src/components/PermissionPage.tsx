import React, { useState, useEffect, useRef } from 'react';

interface PermissionPageProps {
  onPermissionGranted: () => void;
  isAdminPage?: boolean; // Add this prop
  autoProceedIfGranted?: boolean;
}

export const PermissionPage: React.FC<PermissionPageProps> = ({
  onPermissionGranted,
  isAdminPage = false,
  autoProceedIfGranted = true
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isGranted, setIsGranted] = useState(false);
  const [, setAdminTapCount] = useState<number>(0);
  const adminTapTimeoutRef = useRef<number | null>(null);

  const checkCameraPermission = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      
      if (result.state === 'granted') {
        setIsGranted(true);
        if (!isAdminPage && autoProceedIfGranted) {
        onPermissionGranted();
        return;
        }
      }
      
      setIsChecking(false);
    } catch {
      console.log('Permission API not supported, will request manually');
      setIsChecking(false);
    }
  };

  // Check camera permission on mount
  useEffect(() => {
    checkCameraPermission();
    
    // Cleanup admin tap timeout on unmount
    return () => {
      if (adminTapTimeoutRef.current) {
        window.clearTimeout(adminTapTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRequestPermission = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      stream.getTracks().forEach(track => track.stop());
      onPermissionGranted();
    } catch (err) {
      console.error('Failed to initialize:', err);
      
      // User-friendly error messages
      let errorMessage = 'Camera access denied. ';
      
      const error = err as DOMException;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow camera access in your browser settings, then refresh the page.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage += 'Camera not found. Make sure the camera is connected and not being used by another app.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage += 'Camera is being used by another app. Close other apps using the camera, then try again.';
      } else {
        errorMessage += 'Please refresh the page and try again.';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminSecretTap = () => {
    setAdminTapCount((prev) => {
      const next = prev + 1;
      if (adminTapTimeoutRef.current) {
        window.clearTimeout(adminTapTimeoutRef.current);
        adminTapTimeoutRef.current = null;
      }

      if (next >= 4) {
        setTimeout(() => {
          window.location.href = '/admin';
        }, 0);
        return 0;
      }

      adminTapTimeoutRef.current = window.setTimeout(() => {
        setAdminTapCount(0);
        adminTapTimeoutRef.current = null;
      }, 1500);
      return next;
    });
  };

  if (isChecking) {
    return (
      <div id="permission-gate">
        <div className="permission-content">
          <div className="permission-icon">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="30" width="80" height="60" rx="8" stroke="currentColor" strokeWidth="4" fill="none"/>
              <circle cx="60" cy="60" r="15" stroke="currentColor" strokeWidth="4" fill="none"/>
              <circle cx="60" cy="60" r="8" fill="currentColor"/>
              <rect x="30" y="20" width="20" height="15" rx="3" fill="currentColor"/>
            </svg>
          </div>
          <h1>Morobooth</h1>
          <p>Checking camera permission...</p>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div id="permission-gate">
      <div className="permission-content">
        <div className="permission-icon">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="30" width="80" height="60" rx="8" stroke="currentColor" strokeWidth="4" fill="none"/>
            <circle cx="60" cy="60" r="15" stroke="currentColor" strokeWidth="4" fill="none"/>
            <circle cx="60" cy="60" r="8" fill="currentColor"/>
            <rect x="30" y="20" width="20" height="15" rx="3" fill="currentColor"/>
          </svg>
        </div>
        <h1 onClick={handleAdminSecretTap} style={{ cursor: 'pointer' }}>
          Morobooth
        </h1>
        <p>Allow camera access to start your photo session.</p>
        <button 
          id="permissionBtn" 
          onClick={handleRequestPermission}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : isGranted ? 'Start Photo' : 'Allow Camera'}
        </button>
        {error && (
          <p id="permission-error" className="error-message">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

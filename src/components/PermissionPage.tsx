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
  const [adminTapCount, setAdminTapCount] = useState<number>(0);
  const adminTapTimeoutRef = useRef<number | null>(null);

  // Check camera permission on mount
  useEffect(() => {
    checkCameraPermission();
    
    // Cleanup admin tap timeout on unmount
    return () => {
      if (adminTapTimeoutRef.current) {
        window.clearTimeout(adminTapTimeoutRef.current);
      }
    };
  }, []);

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
    } catch (err) {
      console.log('Permission API not supported, will request manually');
      setIsChecking(false);
    }
  };

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
    } catch (err: any) {
      console.error('Failed to initialize:', err);
      
      // User-friendly error messages
      let errorMessage = 'Camera access denied. ';
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow camera access in your browser settings, then refresh the page.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage += 'Camera not found. Make sure the camera is connected and not being used by another app.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
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

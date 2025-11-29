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
      // CRITICAL: Don't check permission if we're on special pages (admin, download, session-photos, session-details)
      // These pages don't need camera permission
      const path = window.location.pathname;
      const isSpecialPage = path === '/admin' || 
                           path.startsWith('/download/') || 
                           (path.startsWith('/session/') && (path.includes('/photos') || path.includes('/details')));
      
      if (isSpecialPage) {
        console.log('[PermissionPage] CRITICAL: Skipping permission check - on special page:', path);
        setIsChecking(false);
        return;
      }

      // CRITICAL: Only check permission if we're on root path
      if (path !== '/' && path !== '') {
        console.log('[PermissionPage] CRITICAL: Skipping permission check - not on root path:', path);
        setIsChecking(false);
        return;
      }

      // Double-check path before proceeding
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/download/') || 
          (currentPath.startsWith('/session/') && (currentPath.includes('/photos') || currentPath.includes('/details'))) ||
          currentPath === '/admin') {
        console.log('[PermissionPage] CRITICAL: Path changed during check, aborting:', currentPath);
        setIsChecking(false);
        return;
      }

      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      
      // Triple-check path before auto-proceeding
      const finalPath = window.location.pathname;
      if (finalPath.startsWith('/download/') || 
          (finalPath.startsWith('/session/') && (finalPath.includes('/photos') || finalPath.includes('/details'))) ||
          finalPath === '/admin') {
        console.log('[PermissionPage] CRITICAL: Path changed after permission check, aborting auto-proceed:', finalPath);
        setIsChecking(false);
        return;
      }
      
      if (result.state === 'granted') {
        setIsGranted(true);
        
        // Only auto-proceed if we're STILL on root path and not admin page
        if (!isAdminPage && autoProceedIfGranted && (finalPath === '/' || finalPath === '')) {
          console.log('[PermissionPage] Auto-proceeding to template');
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
    // Don't check permission if we're on special pages (admin, download, session-photos, session-details)
    const path = window.location.pathname;
    const isSpecialPage = path === '/admin' || 
                         path.startsWith('/download/') || 
                         (path.startsWith('/session/') && (path.includes('/photos') || path.includes('/details')));
    
    if (isSpecialPage) {
      setIsChecking(false);
      return;
    }
    
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
    // CRITICAL: Check path before requesting permission
    const path = window.location.pathname;
    if (path.startsWith('/download/') || 
        (path.startsWith('/session/') && (path.includes('/photos') || path.includes('/details'))) ||
        path === '/admin') {
      console.log('[PermissionPage] CRITICAL: Cannot request permission on special page:', path);
      return;
    }

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
      
      // CRITICAL: Check path again before calling onPermissionGranted
      const finalPath = window.location.pathname;
      if (finalPath.startsWith('/download/') || 
          finalPath.startsWith('/session/') || 
          finalPath === '/admin') {
        console.log('[PermissionPage] CRITICAL: Path changed during permission request, aborting:', finalPath);
        return;
      }
      
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

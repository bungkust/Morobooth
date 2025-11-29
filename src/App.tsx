import { useState, useEffect, lazy, Suspense } from 'react';
import { PermissionPage } from './components/PermissionPage';
import { TemplateSelector } from './components/TemplateSelector';
import './App.css';

// Lazy load heavy components (route-based code splitting)
const PhotoBoothApp = lazy(() => import('./components/PhotoBoothApp').then(m => ({ default: m.PhotoBoothApp })));
const AdminPage = lazy(() => import('./components/AdminPage').then(m => ({ default: m.AdminPage })));
const DownloadPage = lazy(() => import('./components/DownloadPage').then(m => ({ default: m.DownloadPage })));
const SessionPhotosPage = lazy(() => import('./components/SessionPhotosPage').then(m => ({ default: m.SessionPhotosPage })));
const SessionDetailsPage = lazy(() => import('./components/SessionDetailsPage').then(m => ({ default: m.SessionDetailsPage })));

type AppPage = 'permission' | 'template' | 'photobooth' | 'admin' | 'download' | 'session-photos' | 'session-details';

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

function App() {
  // Initialize currentPage based on path to prevent wrong initial render
  // CRITICAL: This runs synchronously before any render, so it's the source of truth
  const getInitialState = () => {
    const path = window.location.pathname;
    console.log('[App] getInitialState - path:', path);
    
    // Priority order: download > session-photos > session-details > admin > root
    if (path.startsWith('/download/')) {
      const photoId = path.split('/')[2];
      console.log('[App] getInitialState - download path, photoId:', photoId);
      return { page: 'download' as AppPage, photoId: photoId || '', sessionCode: '', sessionCodeForDetails: '' };
    }
    if (path.startsWith('/session/') && path.includes('/photos')) {
      const parts = path.split('/');
      if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'photos') {
        const sessionCode = parts[2];
        console.log('[App] getInitialState - session-photos path, sessionCode:', sessionCode);
        return { page: 'session-photos' as AppPage, photoId: '', sessionCode: sessionCode || '', sessionCodeForDetails: '' };
      }
    }
    if (path.startsWith('/session/') && path.includes('/details')) {
      const parts = path.split('/');
      if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'details') {
        const sessionCode = parts[2];
        console.log('[App] getInitialState - session-details path, sessionCode:', sessionCode);
        return { page: 'session-details' as AppPage, photoId: '', sessionCode: '', sessionCodeForDetails: sessionCode || '' };
      }
    }
    if (path === '/admin') {
      console.log('[App] getInitialState - admin path');
      return { page: 'admin' as AppPage, photoId: '', sessionCode: '', sessionCodeForDetails: '' };
    }
    if (path === '/' || path === '') {
      console.log('[App] getInitialState - root path');
      return { page: 'permission' as AppPage, photoId: '', sessionCode: '', sessionCodeForDetails: '' };
    }
    console.log('[App] getInitialState - unknown path, defaulting to permission');
    return { page: 'permission' as AppPage, photoId: '', sessionCode: '', sessionCodeForDetails: '' };
  };

  const initialState = getInitialState();
  const [currentPage, setCurrentPage] = useState<AppPage>(initialState.page);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [photoIdToDownload, setPhotoIdToDownload] = useState<string>(initialState.photoId);
  const [sessionCodeForPhotos, setSessionCodeForPhotos] = useState<string>(initialState.sessionCode);
  const [sessionCodeForDetails, setSessionCodeForDetails] = useState<string>(initialState.sessionCodeForDetails);
  // Set permissionAutoProceed to false for special paths (download, session-photos, session-details, admin)
  const initialPath = window.location.pathname;
  const isSpecialPathInitial = initialPath.startsWith('/download/') || 
                               (initialPath.startsWith('/session/') && (initialPath.includes('/photos') || initialPath.includes('/details'))) ||
                               initialPath === '/admin';
  const [permissionAutoProceed, setPermissionAutoProceed] = useState(!isSpecialPathInitial);

  // Add route detection in useEffect - run immediately on mount
  // This ensures routing is correct even before first render
  useEffect(() => {
    const path = window.location.pathname;
    console.log('[App] Route detection on mount - path:', path, 'initialState.page:', initialState.page);
    
    // Force routing based on path - always sync with URL
    // Priority: download > session-photos > admin > root
    if (path.startsWith('/download/')) {
      const photoId = path.split('/')[2];
      console.log('[App] Setting page to download, photoId:', photoId);
      if (photoId) {
        setPhotoIdToDownload(photoId);
        setCurrentPage('download');
        // Prevent permission auto-proceed
        setPermissionAutoProceed(false);
      } else {
        console.error('[App] Invalid download path - no photoId');
      }
    } else if (path.startsWith('/session/') && path.includes('/photos')) {
      // Route: /session/{sessionCode}/photos
      const parts = path.split('/');
      console.log('[App] Setting page to session-photos, path:', path, 'parts:', parts);
      if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'photos') {
        const sessionCode = parts[2];
        console.log('[App] Setting page to session-photos, sessionCode:', sessionCode);
        setSessionCodeForPhotos(sessionCode);
        setCurrentPage('session-photos');
        // Prevent permission auto-proceed
        setPermissionAutoProceed(false);
      } else {
        console.warn('[App] Invalid session photos path format:', path);
      }
    } else if (path.startsWith('/session/') && path.includes('/details')) {
      // Route: /session/{sessionCode}/details
      const parts = path.split('/');
      console.log('[App] Setting page to session-details, path:', path, 'parts:', parts);
      if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'details') {
        const sessionCode = parts[2];
        console.log('[App] Setting page to session-details, sessionCode:', sessionCode);
        setSessionCodeForDetails(sessionCode);
        setCurrentPage('session-details');
        // Prevent permission auto-proceed
        setPermissionAutoProceed(false);
      } else {
        console.warn('[App] Invalid session details path format:', path);
      }
    } else if (path === '/admin') {
      console.log('[App] Setting page to admin');
      setCurrentPage('admin');
      // Prevent permission auto-proceed
      setPermissionAutoProceed(false);
    } else if (path === '/' || path === '') {
      console.log('[App] Setting page to permission (root)');
      setCurrentPage('permission');
      setPermissionAutoProceed(true);
    } else {
      console.log('[App] Unknown path, defaulting to permission:', path);
      setCurrentPage('permission');
      setPermissionAutoProceed(true);
    }
  }, []); // Empty dependency array - only run once on mount

  // Sync state with path changes (for cases where path changes without navigation events)
  // This ensures state stays in sync with URL without calling setters during render
  useEffect(() => {
    const currentPath = window.location.pathname;
    
    // Sync photoIdToDownload if on download path
    if (currentPath.startsWith('/download/')) {
      const photoIdFromPath = currentPath.split('/')[2];
      if (photoIdFromPath && photoIdFromPath !== photoIdToDownload) {
        setPhotoIdToDownload(photoIdFromPath);
      }
    }
    
    // Sync sessionCodeForPhotos if on session-photos path
    if (currentPath.startsWith('/session/') && currentPath.includes('/photos')) {
      const parts = currentPath.split('/');
      if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'photos') {
        const sessionCodeFromPath = parts[2];
        if (sessionCodeFromPath && sessionCodeFromPath !== sessionCodeForPhotos) {
          setSessionCodeForPhotos(sessionCodeFromPath);
        }
      }
    }
    
    // Sync sessionCodeForDetails if on session-details path
    if (currentPath.startsWith('/session/') && currentPath.includes('/details')) {
      const parts = currentPath.split('/');
      if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'details') {
        const sessionCodeFromPath = parts[2];
        if (sessionCodeFromPath && sessionCodeFromPath !== sessionCodeForDetails) {
          setSessionCodeForDetails(sessionCodeFromPath);
        }
      }
    }
  }, [photoIdToDownload, sessionCodeForPhotos, sessionCodeForDetails]); // Watch state, path is read inside effect

  // Listen for popstate events (back/forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      console.log('[App] Popstate - path:', path);
      
      if (path === '/admin') {
        setCurrentPage('admin');
      } else if (path.startsWith('/download/')) {
        const photoId = path.split('/')[2];
        if (photoId) {
          setPhotoIdToDownload(photoId);
          setCurrentPage('download');
        }
      } else if (path.startsWith('/session/') && path.includes('/photos')) {
        const parts = path.split('/');
        if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'photos') {
          const sessionCode = parts[2];
          setSessionCodeForPhotos(sessionCode);
          setCurrentPage('session-photos');
        }
      } else if (path.startsWith('/session/') && path.includes('/details')) {
        const parts = path.split('/');
        if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'details') {
          const sessionCode = parts[2];
          setSessionCodeForDetails(sessionCode);
          setCurrentPage('session-details');
        }
      } else if (path === '/' || path === '') {
        setCurrentPage('permission');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handlePermissionGranted = () => {
    const path = window.location.pathname;
    // Don't change page if we're on special pages (admin, download, session-photos, session-details)
    // These pages don't need camera permission
    if (path === '/admin' || 
        path.startsWith('/download/') || 
        (path.startsWith('/session/') && (path.includes('/photos') || path.includes('/details')))) {
      console.log('[App] handlePermissionGranted: Ignoring - on special page:', path);
      return;
    }
    // Only proceed to template if we're on root path
    if (path === '/' || path === '') {
      setCurrentPage('template');
      setPermissionAutoProceed(true);
    }
  };

  const handleTemplateSelected = (template: Template) => {
    setSelectedTemplate(template);
    setCurrentPage('photobooth');
  };

  const handleBackToPermission = () => {
    setSelectedTemplate(null);
    setPermissionAutoProceed(false);
    setCurrentPage('permission');
  };
  const handleBackToTemplate = () => {
    setCurrentPage('template');
  };

  // Loading fallback component for lazy-loaded routes
  const LoadingFallback = () => (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Loading...
    </div>
  );

  // Determine which page to render - use path as source of truth
  const path = window.location.pathname;
  const isDownloadPath = path.startsWith('/download/');
  const isSessionPhotosPath = path.startsWith('/session/') && path.includes('/photos');
  const isSessionDetailsPath = path.startsWith('/session/') && path.includes('/details');
  const isAdminPath = path === '/admin';
  const isRootPath = path === '/' || path === '';
  const isSpecialPath = isDownloadPath || isSessionPhotosPath || isSessionDetailsPath || isAdminPath;

  // Extract sessionCode from path if needed
  let effectiveSessionCode = sessionCodeForPhotos;
  if (isSessionPhotosPath && !effectiveSessionCode) {
    const parts = path.split('/');
    if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'photos') {
      effectiveSessionCode = parts[2];
    }
  }

  let effectiveSessionCodeForDetails = sessionCodeForDetails;
  if (isSessionDetailsPath && !effectiveSessionCodeForDetails) {
    const parts = path.split('/');
    if (parts.length >= 4 && parts[1] === 'session' && parts[3] === 'details') {
      effectiveSessionCodeForDetails = parts[2];
    }
  }

  // Extract photoId from path if needed
  let effectivePhotoId = photoIdToDownload;
  if (isDownloadPath && !effectivePhotoId) {
    effectivePhotoId = path.split('/')[2];
  }

  // Debug logging
  console.log('[App] Render - path:', path, 'currentPage:', currentPage, 'isDownloadPath:', isDownloadPath, 'effectivePhotoId:', effectivePhotoId, 'isSpecialPath:', isSpecialPath);

  // CRITICAL: If we're on a download path, NEVER render PermissionPage or TemplateSelector
  // This prevents any permission-related redirects
  if (isDownloadPath) {
    // Extract photoId directly from path if not already set in state
    const photoIdFromPath = path.split('/')[2];
    const finalPhotoId = effectivePhotoId || photoIdFromPath;
    
    return (
      <div id="app-container">
        {finalPhotoId ? (
          <Suspense fallback={<LoadingFallback />}>
            <DownloadPage photoId={finalPhotoId} />
          </Suspense>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h1>Invalid Download Link</h1>
            <p>Photo ID not found in URL.</p>
            <p>URL: {path}</p>
          </div>
        )}
      </div>
    );
  }

  // CRITICAL: If we're on session-photos path, NEVER render PermissionPage or TemplateSelector
  if (isSessionPhotosPath) {
    // Extract sessionCode directly from path if not already set
    const parts = path.split('/');
    const sessionCodeFromPath = parts.length >= 4 && parts[1] === 'session' && parts[3] === 'photos' ? parts[2] : null;
    const finalSessionCode = effectiveSessionCode || sessionCodeFromPath;
    
    return (
      <div id="app-container">
        {finalSessionCode ? (
          <Suspense fallback={<LoadingFallback />}>
            <SessionPhotosPage sessionCode={finalSessionCode} />
          </Suspense>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h1>Invalid Session Link</h1>
            <p>Session code not found in URL.</p>
            <p>URL: {path}</p>
          </div>
        )}
      </div>
    );
  }

  // CRITICAL: If we're on session-details path, NEVER render PermissionPage or TemplateSelector
  if (isSessionDetailsPath) {
    // Extract sessionCode directly from path if not already set
    const parts = path.split('/');
    const sessionCodeFromPath = parts.length >= 4 && parts[1] === 'session' && parts[3] === 'details' ? parts[2] : null;
    const finalSessionCode = effectiveSessionCodeForDetails || sessionCodeFromPath;
    
    return (
      <div id="app-container">
        {finalSessionCode ? (
          <Suspense fallback={<LoadingFallback />}>
            <SessionDetailsPage sessionCode={finalSessionCode} />
          </Suspense>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h1>Invalid Session Link</h1>
            <p>Session code not found in URL.</p>
            <p>URL: {path}</p>
          </div>
        )}
      </div>
    );
  }

  // CRITICAL: If we're on admin path, NEVER render PermissionPage or TemplateSelector
  if (isAdminPath) {
    return (
      <div id="app-container">
        <Suspense fallback={<LoadingFallback />}>
          <AdminPage />
        </Suspense>
      </div>
    );
  }

  // For root path and other paths, render normally
  // CRITICAL: Never render TemplateSelector or PermissionPage on special paths
  return (
    <div id="app-container" className={currentPage === 'photobooth' ? 'capture-screen' : ''}>
      {/* Template selector - only if not on special paths */}
      {currentPage === 'template' && !isSpecialPath && (
        <TemplateSelector
          onTemplateSelected={handleTemplateSelected}
          onBack={handleBackToPermission}
        />
      )}
      
      {/* Photo booth - only if not on special paths */}
      {currentPage === 'photobooth' && selectedTemplate && !isSpecialPath && (
        <Suspense fallback={<LoadingFallback />}>
          <PhotoBoothApp template={selectedTemplate} onBackToTemplate={handleBackToTemplate} />
        </Suspense>
      )}
      
      {/* Permission page - ONLY if root path and not on special paths */}
      {isRootPath && !isSpecialPath && (
        <PermissionPage
          onPermissionGranted={handlePermissionGranted}
          autoProceedIfGranted={permissionAutoProceed}
        />
      )}
    </div>
  );
}

export default App;

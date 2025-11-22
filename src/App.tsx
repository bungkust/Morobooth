import { useState, useEffect, lazy, Suspense } from 'react';
import { PermissionPage } from './components/PermissionPage';
import { TemplateSelector } from './components/TemplateSelector';
import './App.css';

// Lazy load heavy components (route-based code splitting)
const PhotoBoothApp = lazy(() => import('./components/PhotoBoothApp').then(m => ({ default: m.PhotoBoothApp })));
const AdminPage = lazy(() => import('./components/AdminPage').then(m => ({ default: m.AdminPage })));
const DownloadPage = lazy(() => import('./components/DownloadPage').then(m => ({ default: m.DownloadPage })));

type AppPage = 'permission' | 'template' | 'photobooth' | 'admin' | 'download';

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
  const [currentPage, setCurrentPage] = useState<AppPage>('permission');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [photoIdToDownload, setPhotoIdToDownload] = useState<string>('');
  const [permissionAutoProceed, setPermissionAutoProceed] = useState(true);

  // Add route detection in useEffect
  useEffect(() => {
    const path = window.location.pathname;
    
    // Simple routing logic - only run once on mount
    if (path === '/admin') {
      setCurrentPage('admin');
    } else if (path.startsWith('/download/')) {
      const photoId = path.split('/')[2];
      setPhotoIdToDownload(photoId);
      setCurrentPage('download');
    } else if (path === '/' || path === '') {
      // Only set to permission if we're on root
      setCurrentPage('permission');
    }
    // Don't change currentPage for other paths
  }, []); // Empty dependency array - only run once

  // Listen for popstate events (back/forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      console.log('Popstate - path:', path);
      
      if (path === '/admin') {
        setCurrentPage('admin');
      } else if (path.startsWith('/download/')) {
        const photoId = path.split('/')[2];
        setPhotoIdToDownload(photoId);
        setCurrentPage('download');
      } else if (path === '/' || path === '') {
        setCurrentPage('permission');
      }
      // Don't change currentPage for other paths
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handlePermissionGranted = () => {
    // Don't change page if we're on admin
    if (window.location.pathname === '/admin') {
      return;
    }
    setCurrentPage('template');
    setPermissionAutoProceed(true);
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

  return (
    <div id="app-container" className={currentPage === 'photobooth' ? 'capture-screen' : ''}>
      {currentPage === 'permission' && (
        <PermissionPage
          onPermissionGranted={handlePermissionGranted}
          autoProceedIfGranted={permissionAutoProceed}
        />
      )}
      {currentPage === 'template' && (
        <TemplateSelector
          onTemplateSelected={handleTemplateSelected}
          onBack={handleBackToPermission}
        />
      )}
      {currentPage === 'photobooth' && selectedTemplate && (
        <Suspense fallback={<LoadingFallback />}>
          <PhotoBoothApp template={selectedTemplate} onBackToTemplate={handleBackToTemplate} />
        </Suspense>
      )}
      {currentPage === 'admin' && (
        <Suspense fallback={<LoadingFallback />}>
          <AdminPage />
        </Suspense>
      )}
      {currentPage === 'download' && (
        <Suspense fallback={<LoadingFallback />}>
          <DownloadPage photoId={photoIdToDownload} />
        </Suspense>
      )}
    </div>
  );
}

export default App;

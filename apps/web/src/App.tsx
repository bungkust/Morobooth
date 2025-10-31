import { useState, useEffect } from 'react';
import { PermissionPage } from './components/PermissionPage';
import { TemplateSelector } from './components/TemplateSelector';
import { PhotoBoothApp } from './components/PhotoBoothApp';
import { AdminPage } from './components/AdminPage';
import { DownloadPage } from './components/DownloadPage';
import './App.css';

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
  };

  const handleTemplateSelected = (template: Template) => {
    setSelectedTemplate(template);
    setCurrentPage('photobooth');
  };

  const handleBackToTemplate = () => {
    setCurrentPage('template');
  };

  return (
    <div id="app-container">
      {currentPage === 'permission' && (
        <PermissionPage onPermissionGranted={handlePermissionGranted} />
      )}
      {currentPage === 'template' && (
        <TemplateSelector onTemplateSelected={handleTemplateSelected} />
      )}
      {currentPage === 'photobooth' && selectedTemplate && (
        <PhotoBoothApp template={selectedTemplate} onBackToTemplate={handleBackToTemplate} />
      )}
      {currentPage === 'admin' && (
        <AdminPage />
      )}
      {currentPage === 'download' && (
        <DownloadPage photoId={photoIdToDownload} />
      )}
    </div>
  );
}

export default App;

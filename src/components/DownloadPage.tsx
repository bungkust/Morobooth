import { useState, useEffect } from 'react';
import { getPhotoById } from '../services/photoStorageService';
import { getFreshSignedUrl } from '../services/uploadService';

interface DownloadPageProps {
  photoId: string;
}

export const DownloadPage: React.FC<DownloadPageProps> = ({ photoId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLocalOnly, setIsLocalOnly] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [signedUrlCache, setSignedUrlCache] = useState<{ url: string; expiry: number } | null>(null);

  useEffect(() => {
    // Monitor online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    loadPhoto();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [photoId]);

  async function loadPhoto() {
    try {
      setLoading(true);
      setError('');
      
      // Step 1: Get photo from IndexedDB
      const record = await getPhotoById(photoId);
      
      if (!record) {
        setError('Photo not found. It may have been deleted or expired.');
        setLoading(false);
        return;
      }

      // Step 2: Validate 24 hours from timestamp
      const photoTime = new Date(record.timestamp);
      const now = new Date();
      const hoursSincePhoto = (now.getTime() - photoTime.getTime()) / (1000 * 60 * 60);
      
      if (hoursSincePhoto > 24) {
        setError('Photo expired. Download link is only valid for 24 hours after printing.');
        setLoading(false);
        return;
      }

        // Photo record loaded successfully

      // Step 3: Check if photo is uploaded and has supabasePath
      if (record.uploaded && record.supabasePath) {
        // Photo is in Supabase - try to get fresh signed URL
        if (isOnline) {
          // Check cache first
          if (signedUrlCache && signedUrlCache.expiry > Date.now()) {
            setDownloadUrl(signedUrlCache.url);
            setIsLocalOnly(false);
            setLoading(false);
            return;
          }
          
          // Generate fresh signed URL on-demand
          const freshUrl = await getFreshSignedUrl(record.supabasePath);
          
          if (freshUrl) {
            // Cache the signed URL (expires in 23 hours to be safe)
            const cacheExpiry = Date.now() + (23 * 60 * 60 * 1000);
            setSignedUrlCache({ url: freshUrl, expiry: cacheExpiry });
            setDownloadUrl(freshUrl);
            setIsLocalOnly(false);
            setLoading(false);
            return;
          }
          
          // If fresh signed URL generation failed, fallback to local if available
          console.warn('Failed to get fresh signed URL, falling back to local storage');
        }
        
        // Offline or failed to get signed URL - fallback to local if available
        if (record.imageDataURL) {
          setDownloadUrl(record.imageDataURL);
          setIsLocalOnly(true);
          setLoading(false);
          return;
        }
        
        // No local fallback available
        setError('Photo is uploaded but not available offline. Please connect to internet.');
        setLoading(false);
        return;
      }

      // Step 4: Photo not uploaded or no supabasePath - use local storage
      if (record.imageDataURL) {
        setDownloadUrl(record.imageDataURL);
        setIsLocalOnly(true);
        
        // If online and not uploaded, trigger on-demand upload
        if (isOnline && !record.uploaded) {
          uploadPhotoOnDemand(photoId).catch((err) => {
            console.error('On-demand upload failed:', err);
          });
        }
        
        setLoading(false);
      } else {
        setError('Photo data not available');
        setLoading(false);
      }
      
    } catch (err) {
      console.error('Error loading photo:', err);
      setError('Failed to load photo. Please try again.');
      setLoading(false);
    }
  }

  async function uploadPhotoOnDemand(photoId: string) {
    if (!isOnline) {
      console.log('Offline - skipping upload');
      return;
    }
    
    const photo = await getPhotoById(photoId);
    if (!photo || photo.uploaded) return;
    
    setIsUploading(true);
    
    try {
      const { uploadPhotoToSupabase } = await import('../services/uploadService');
      const result = await uploadPhotoToSupabase(photo);
      
      if (result.success && result.url && result.path) {
        const { markPhotoAsUploaded } = await import('../services/photoStorageService');
        await markPhotoAsUploaded(photoId, result.url, result.path);
        
        // Update UI if still on this page
        if (photo.id === photoId) {
          // Get fresh signed URL for display
          const freshUrl = await getFreshSignedUrl(result.path);
          if (freshUrl) {
            const cacheExpiry = Date.now() + (23 * 60 * 60 * 1000);
            setSignedUrlCache({ url: freshUrl, expiry: cacheExpiry });
            setDownloadUrl(freshUrl);
            setIsLocalOnly(false);
          }
        }
      }
    } catch (err) {
      console.error('On-demand upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  }

  function handleDownload() {
    if (!downloadUrl) return;
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${photoId}.png`;
    link.click();
  }

  if (loading) {
    return (
      <div className="download-page">
        <div className="download-container">
          <p>Loading photo...</p>
          {!isOnline && <p className="offline-notice">⚠️ You are offline</p>}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="download-page">
        <div className="error-container">
          <h1>Download Failed</h1>
          <p>{error}</p>
          {isLocalOnly && (
            <p className="warning">
              ⚠️ This photo is only available on this device.
              {!isOnline && ' Connect to internet to upload and share.'}
            </p>
          )}
          {!isOnline && (
            <p className="info">
              💡 Connect to internet to access photos from cloud storage.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="download-page">
      <div className="download-container">
        <h1>Download Your Photo</h1>
        <img src={downloadUrl} alt="Photo" className="preview-image" />
        <p className="photo-id">Photo ID: {photoId}</p>
        
        {isLocalOnly && (
          <div className="local-only-banner">
            <p>⚠️ Local Only</p>
            <p className="small">
              This photo is currently only available on this device.
              {isUploading && ' Uploading to cloud...'}
              {!isUploading && !isOnline && ' Connect to internet to upload and share.'}
              {!isUploading && isOnline && ' Will be uploaded automatically.'}
            </p>
          </div>
        )}
        
        {isUploading && (
          <div className="uploading-banner">
            <p>📤 Uploading to cloud...</p>
          </div>
        )}
        
        <button onClick={handleDownload} className="download-btn" disabled={!downloadUrl}>
          Download Photo
        </button>
        
        <p className="expiry-notice">
          This link is valid for 24 hours from printing time.
        </p>
        
        {!isOnline && (
          <p className="offline-notice">
            ⚠️ You are offline. Some features may be limited.
          </p>
        )}
      </div>
    </div>
  );
};

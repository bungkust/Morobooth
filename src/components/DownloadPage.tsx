import { useState, useEffect } from 'react';
import { getPhotoById } from '../services/photoStorageService';
import { getFreshSignedUrl } from '../services/uploadService';
import { getSessionByCode, getDefaultSessionSettings } from '../services/sessionService';
import { supabase, isSupabaseConfigured } from '../config/supabase';

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
      
      // Step 1: Always try to load from Supabase first (for cross-device access)
      let record = null;
      let sessionCode = '';
      
      if (isSupabaseConfigured() && supabase && isOnline) {
        console.log('[DownloadPage] Loading photo from Supabase...');
        
        // Extract session code from photoId (format: SESSIONCODE-001)
        // Pattern: any uppercase letters, numbers, and hyphens, followed by hyphen and digits
        const sessionCodeMatch = photoId.match(/^([A-Z0-9-]+)-(\d+)$/);
        if (sessionCodeMatch && sessionCodeMatch[1]) {
          sessionCode = sessionCodeMatch[1];
          console.log('[DownloadPage] Extracted session code from photoId:', sessionCode, 'from:', photoId);
          const photoNumber = parseInt(photoId.split('-').pop() || '0');
          
          // Try to find photo in Supabase storage
          const filePath = `${sessionCode}/${photoId}.png`;
          
          try {
            // Check if file exists and get signed URL
            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
              .from('photos')
              .createSignedUrl(filePath, 86400);
            
            if (!signedUrlError && signedUrlData?.signedUrl) {
              // Photo exists in Supabase, create a record
              record = {
                id: photoId,
                sessionCode: sessionCode,
                photoNumber: photoNumber,
                imageDataURL: '', // Will use signed URL
                timestamp: new Date().toISOString(), // Will try to get from file metadata
                uploaded: true,
                supabasePath: filePath
              };
              
              // Store the signed URL immediately so we can use it later
              const cacheExpiry = Date.now() + (23 * 60 * 60 * 1000);
              setSignedUrlCache({ url: signedUrlData.signedUrl, expiry: cacheExpiry });
              
              console.log('[DownloadPage] Photo found in Supabase storage, signed URL cached:', signedUrlData.signedUrl.substring(0, 50) + '...');
              
              // Try to get file metadata for timestamp (non-blocking)
              try {
                const { data: fileList, error: listError } = await supabase.storage
                  .from('photos')
                  .list(sessionCode, {
                    search: `${photoId}.png`
                  });
                
                if (!listError && fileList && fileList.length > 0) {
                  const file = fileList[0];
                  if (file.created_at) {
                    record.timestamp = file.created_at;
                  } else if (file.updated_at) {
                    record.timestamp = file.updated_at;
                  }
                  console.log('[DownloadPage] File metadata retrieved, timestamp:', record.timestamp);
                }
              } catch (metadataErr) {
                console.warn('[DownloadPage] Failed to get file metadata (non-critical), using current time:', metadataErr);
              }
            } else {
              console.error('[DownloadPage] Photo not found in Supabase storage. Error:', signedUrlError);
              console.error('[DownloadPage] File path attempted:', filePath);
              console.error('[DownloadPage] Signed URL data:', signedUrlData);
              
              // Check if it's a permission error
              if (signedUrlError) {
                const errorMsg = signedUrlError.message || String(signedUrlError);
                console.error('[DownloadPage] Error message:', errorMsg);
                // Log error object for debugging (may contain additional properties)
                console.error('[DownloadPage] Error object:', signedUrlError);
                
                if (errorMsg.toLowerCase().includes('permission') || 
                    errorMsg.toLowerCase().includes('access') || 
                    errorMsg.toLowerCase().includes('denied') ||
                    errorMsg.toLowerCase().includes('forbidden') ||
                    errorMsg.toLowerCase().includes('unauthorized')) {
                  console.error('[DownloadPage] PERMISSION ERROR: Storage bucket may not allow public read access or signed URL generation');
                  console.error('[DownloadPage] Please check Supabase storage bucket policies for "photos" bucket');
                } else if (errorMsg.toLowerCase().includes('not found') || 
                          errorMsg.toLowerCase().includes('does not exist')) {
                  console.error('[DownloadPage] FILE NOT FOUND: Photo file does not exist in storage');
                }
              }
            }
          } catch (err) {
            console.warn('[DownloadPage] Failed to check Supabase storage:', err);
            // Store error for later use in error message
            if (err instanceof Error) {
              (window as any).__lastSupabaseError = err;
            }
          }
        }
      }
      
      // Fallback to IndexedDB only if Supabase failed and we're offline
      if (!record) {
        console.log('[DownloadPage] Trying IndexedDB as fallback...');
        const localRecord = await getPhotoById(photoId);
        if (localRecord) {
          record = localRecord;
          sessionCode = localRecord.sessionCode;
          console.log('[DownloadPage] Photo found in IndexedDB');
        }
      }
      
      if (!record) {
        console.error('[DownloadPage] Photo not found in Supabase or IndexedDB');
        if (!isOnline) {
          setError('Photo not found. Please check your internet connection and try again.');
        } else if (!isSupabaseConfigured() || !supabase) {
          setError('Photo not found. Storage service is not configured.');
        } else {
          setError(`Photo "${photoId}" not found. It may have been deleted, expired, or the link is invalid.`);
        }
        setLoading(false);
        return;
      }
      
      // Use sessionCode from record if we got it
      if (!sessionCode && record.sessionCode) {
        sessionCode = record.sessionCode;
      }
      
      console.log('[DownloadPage] Photo record loaded:', {
        id: record.id,
        sessionCode: sessionCode || record.sessionCode,
        uploaded: record.uploaded,
        supabasePath: record.supabasePath,
        hasImageData: !!record.imageDataURL
      });

      // Step 2: Validate expired time from session settings
      const photoTime = new Date(record.timestamp);
      const now = new Date();
      const hoursSincePhoto = (now.getTime() - photoTime.getTime()) / (1000 * 60 * 60);
      
      // Load session settings to get expired hours
      let expiredHours = 24;
      let enableExpiredCheck = true;
      let allowDownloadAfterExpired = false;
      
      try {
        const session = await getSessionByCode(sessionCode || record.sessionCode);
        if (session?.settings) {
          expiredHours = session.settings.photoExpiredHours || 24;
          enableExpiredCheck = session.settings.enableExpiredCheck !== false;
          allowDownloadAfterExpired = session.settings.allowDownloadAfterExpired || false;
        } else {
          const defaults = getDefaultSessionSettings();
          expiredHours = defaults.photoExpiredHours;
          enableExpiredCheck = defaults.enableExpiredCheck;
          allowDownloadAfterExpired = defaults.allowDownloadAfterExpired || false;
        }
      } catch (err) {
        console.warn('Failed to load session settings, using defaults:', err);
        const defaults = getDefaultSessionSettings();
        expiredHours = defaults.photoExpiredHours;
        enableExpiredCheck = defaults.enableExpiredCheck;
        allowDownloadAfterExpired = defaults.allowDownloadAfterExpired || false;
      }
      
      if (enableExpiredCheck && hoursSincePhoto > expiredHours) {
        if (allowDownloadAfterExpired) {
          // Allow download but show warning
          console.warn('Photo expired but download allowed by settings');
        } else {
          const days = Math.floor(expiredHours / 24);
          const hours = expiredHours % 24;
          let timeStr = '';
          if (days > 0) {
            timeStr = `${days} day${days !== 1 ? 's' : ''}`;
            if (hours > 0) {
              timeStr += ` and ${hours} hour${hours !== 1 ? 's' : ''}`;
            }
          } else {
            timeStr = `${expiredHours} hour${expiredHours !== 1 ? 's' : ''}`;
          }
          setError(`Photo expired. Download link is only valid for ${timeStr} after printing.`);
          setLoading(false);
          return;
        }
      }

        // Photo record loaded successfully

      // Step 3: Check if photo is uploaded and has supabasePath
      // CRITICAL: If we already have signed URL in cache (from step 1), use it immediately after expired check
      if (signedUrlCache && signedUrlCache.expiry > Date.now() && signedUrlCache.url && record.uploaded) {
        console.log('[DownloadPage] Using cached signed URL from step 1 (already validated expired)');
        setDownloadUrl(signedUrlCache.url);
        setIsLocalOnly(false);
        setLoading(false);
        return;
      }
      
      if (record.uploaded && record.supabasePath) {
        console.log('[DownloadPage] Photo is uploaded, getting signed URL from:', record.supabasePath);
        // Photo is in Supabase - try to get fresh signed URL
        if (isOnline) {
          // Check cache first (shouldn't reach here if cache was valid, but double-check)
          if (signedUrlCache && signedUrlCache.expiry > Date.now()) {
            console.log('[DownloadPage] Using cached signed URL');
            setDownloadUrl(signedUrlCache.url);
            setIsLocalOnly(false);
            setLoading(false);
            return;
          }
          
          // Generate fresh signed URL on-demand
          console.log('[DownloadPage] Generating fresh signed URL...');
          const freshUrl = await getFreshSignedUrl(record.supabasePath);
          
          if (freshUrl) {
            console.log('[DownloadPage] Signed URL generated successfully');
            // Cache the signed URL (expires in 23 hours to be safe)
            const cacheExpiry = Date.now() + (23 * 60 * 60 * 1000);
            setSignedUrlCache({ url: freshUrl, expiry: cacheExpiry });
            setDownloadUrl(freshUrl);
            setIsLocalOnly(false);
            setLoading(false);
            return;
          }
          
          // If fresh signed URL generation failed, fallback to local if available
          console.warn('[DownloadPage] Failed to get fresh signed URL, falling back to local storage');
        } else {
          console.log('[DownloadPage] Offline mode, checking for local data');
        }
        
        // Offline or failed to get signed URL - fallback to local if available
        if (record.imageDataURL) {
          console.log('[DownloadPage] Using local image data');
          setDownloadUrl(record.imageDataURL);
          setIsLocalOnly(true);
          setLoading(false);
          return;
        }
        
        // No local fallback available
        console.error('[DownloadPage] No signed URL and no local data available');
        if (!isOnline) {
          setError('Photo is uploaded but not available offline. Please connect to the internet to download.');
        } else {
          setError('Failed to generate download link. The photo may have been deleted from storage. Please contact support if this issue persists.');
        }
        setLoading(false);
        return;
      }
      
      // If record doesn't have supabasePath but we know it should be in Supabase
      if (record.uploaded && !record.supabasePath && sessionCode) {
        console.log('[DownloadPage] Record marked as uploaded but no supabasePath, trying to construct path...');
        const filePath = `${sessionCode}/${photoId}.png`;
        try {
          const freshUrl = await getFreshSignedUrl(filePath);
          if (freshUrl) {
            console.log('[DownloadPage] Successfully got signed URL with constructed path');
            setDownloadUrl(freshUrl);
            setIsLocalOnly(false);
            setLoading(false);
            return;
          } else {
            setError(`Photo "${photoId}" is marked as uploaded but could not be found in storage. The file may have been deleted.`);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('[DownloadPage] Failed to get signed URL with constructed path:', err);
          setError(`Failed to access photo "${photoId}". Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setLoading(false);
          return;
        }
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
        console.error('[DownloadPage] No image data available and photo not in Supabase');
        if (!isOnline) {
          setError('Photo data not available offline. Please connect to the internet to download.');
        } else if (!record.uploaded) {
          setError('Photo has not been uploaded yet. Please wait a moment and try again, or contact support if the issue persists.');
        } else {
          setError(`Photo "${photoId}" data is not available. The photo may have been deleted or corrupted.`);
        }
        setLoading(false);
      }
      
    } catch (err) {
      console.error('[DownloadPage] Error loading photo:', err);
      console.error('[DownloadPage] Error details:', {
        photoId,
        isOnline,
        supabaseConfigured: isSupabaseConfigured(),
        error: err instanceof Error ? err.message : String(err)
      });
      setError(`Failed to load photo: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`);
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
          <div className="error-message">
            <p style={{ fontSize: '18px', marginBottom: '16px', fontWeight: 600 }}>{error}</p>
          </div>
          {isLocalOnly && (
            <div className="warning" style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>⚠️ Local Only</p>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                This photo is only available on this device.
                {!isOnline && ' Connect to internet to upload and share.'}
              </p>
            </div>
          )}
          {!isOnline && (
            <div className="info" style={{ marginTop: '16px', padding: '12px', backgroundColor: '#d1ecf1', border: '1px solid #bee5eb', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>💡 Connection Required</p>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                Connect to internet to access photos from cloud storage.
              </p>
            </div>
          )}
          <div style={{ marginTop: '24px' }}>
            <button 
              onClick={() => window.location.reload()} 
              className="download-btn"
              style={{ marginRight: '12px' }}
            >
              Retry
            </button>
            <button 
              onClick={() => window.location.href = '/'} 
              className="secondary-btn"
            >
              Go Home
            </button>
          </div>
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
          This link is valid for a limited time from printing time.
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

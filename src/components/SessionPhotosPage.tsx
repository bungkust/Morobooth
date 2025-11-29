import { useState, useEffect } from 'react';
import { getPhotosBySession, type PhotoRecord } from '../services/photoStorageService';
import { generateQRCodeDataURL, getDownloadURL } from '../utils/qrCodeGenerator';
import { supabase, isSupabaseConfigured } from '../config/supabase';
import { getFreshSignedUrl } from '../services/uploadService';
import { getSessionByCode, getDefaultSessionSettings } from '../services/sessionService';

interface SessionPhotosPageProps {
  sessionCode: string;
}

export const SessionPhotosPage: React.FC<SessionPhotosPageProps> = ({ sessionCode }) => {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [allPhotos, setAllPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [expiredHours, setExpiredHours] = useState(24); // Default expired hours
  const [enableExpiredCheck, setEnableExpiredCheck] = useState(true);
  const itemsPerPage = 5;

  useEffect(() => {
    loadSessionSettings();
    loadPhotos();
  }, [sessionCode]);

  async function loadSessionSettings() {
    try {
      const session = await getSessionByCode(sessionCode);
      if (session?.settings) {
        setExpiredHours(session.settings.photoExpiredHours || 24);
        setEnableExpiredCheck(session.settings.enableExpiredCheck !== false);
      } else {
        // Use defaults
        const defaults = getDefaultSessionSettings();
        setExpiredHours(defaults.photoExpiredHours);
        setEnableExpiredCheck(defaults.enableExpiredCheck);
      }
    } catch (err) {
      console.error('Error loading session settings:', err);
      // Use defaults on error
      const defaults = getDefaultSessionSettings();
      setExpiredHours(defaults.photoExpiredHours);
      setEnableExpiredCheck(defaults.enableExpiredCheck);
    }
  }

  async function loadPhotosFromSupabase(): Promise<PhotoRecord[]> {
    if (!isSupabaseConfigured() || !supabase) {
      return [];
    }

    try {
      // List files in the session folder
      const { data: files, error } = await supabase.storage
        .from('photos')
        .list(sessionCode, {
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error) {
        console.warn('[SessionPhotosPage] Failed to list files from Supabase:', error);
        return [];
      }

      if (!files || files.length === 0) {
        return [];
      }

      // Convert storage files to PhotoRecord format
      const photosFromStorage: PhotoRecord[] = [];
      
      for (const file of files) {
        // Extract photo ID from filename (e.g., "MOTOSIX-GKSSPZ-001.png" -> "MOTOSIX-GKSSPZ-001")
        if (file.name.endsWith('.png')) {
          const photoId = file.name.replace('.png', '');
          const supabasePath = `${sessionCode}/${file.name}`;
          
          // Don't generate signed URL here - lazy load it later for better performance
          // This prevents loading all signed URLs at once (important for large photo counts)
          
          // Extract photo number from photo ID (e.g., "MOTOSIX-GKSSPZ-001" -> 1)
          const photoNumberMatch = photoId.match(/-(\d+)$/);
          const photoNumber = photoNumberMatch ? parseInt(photoNumberMatch[1], 10) : 0;
          
          // Create a virtual PhotoRecord from storage
          // imageDataURL will be loaded lazily when needed
          const photoRecord: PhotoRecord = {
            id: photoId,
            sessionCode: sessionCode,
            photoNumber: photoNumber,
            imageDataURL: '', // Will be loaded lazily
            timestamp: file.created_at || file.updated_at || new Date().toISOString(),
            uploaded: true,
            supabasePath: supabasePath
          };
          
          photosFromStorage.push(photoRecord);
        }
      }

      return photosFromStorage;
    } catch (err) {
      console.error('[SessionPhotosPage] Error loading photos from Supabase:', err);
      return [];
    }
  }

  async function loadPhotos() {
    try {
      setLoading(true);
      setError('');
      
      // Load photos from IndexedDB
      const sessionPhotos = await getPhotosBySession(sessionCode);
      // Store all photos to check if there are unuploaded ones
      setAllPhotos(sessionPhotos);
      
      // Load photos from Supabase storage
      const photosFromStorage = await loadPhotosFromSupabase();
      
      // Merge photos: prioritize IndexedDB, but add photos from storage that don't exist in IndexedDB
      const photoMap = new Map<string, PhotoRecord>();
      
      // Add photos from IndexedDB (prioritize these as they have full data)
      for (const photo of sessionPhotos) {
        if (photo.uploaded) {
          photoMap.set(photo.id, photo);
        }
      }
      
      // Add photos from storage that don't exist in IndexedDB
      for (const photo of photosFromStorage) {
        if (!photoMap.has(photo.id)) {
          photoMap.set(photo.id, photo);
        }
      }
      
      // Convert map to array and sort by photo number
      const uploadedPhotos = Array.from(photoMap.values());
      uploadedPhotos.sort((a, b) => a.photoNumber - b.photoNumber);
      
      setPhotos(uploadedPhotos);
      
      // Only generate download URLs (not QR codes) - QR codes will be lazy loaded when user clicks photo detail
      // This significantly improves performance for large photo counts (e.g., 5000+ photos)
      const urlMap: Record<string, string> = {};
      for (const photo of uploadedPhotos) {
        // Use access token from photo record if available
        urlMap[photo.id] = getDownloadURL(photo.id, photo.accessToken);
      }
      setDownloadUrls(urlMap);
      
      // QR codes will be generated lazily when user clicks on a photo detail
      // This prevents generating 5000+ QR codes on page load
    } catch (err) {
      console.error('Error loading photos:', err);
      setError('Failed to load photos. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    // Always redirect to admin panel, not back in history (which might go to login)
    window.location.href = '/admin';
  }

  function handleCopyLink(photoId: string) {
    const url = downloadUrls[photoId];
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard!');
      }).catch(() => {
        alert('Failed to copy link');
      });
    }
  }

  async function handlePhotoClick(photo: PhotoRecord) {
    setSelectedPhoto(photo);
    
    // Lazy load QR code only when user clicks to view photo detail
    // This prevents generating QR codes for all photos on page load
    if (!qrCodes[photo.id]) {
      const downloadUrl = downloadUrls[photo.id] || getDownloadURL(photo.id, photo.accessToken);
      if (downloadUrl) {
        try {
          // Check cache first
          const qrCacheKey = `qr-cache-${sessionCode}`;
          interface QRCacheEntry {
            qrCode: string;
            downloadUrl: string;
          }
          let cachedQRCodes: Record<string, QRCacheEntry> = {};
          try {
            const cached = localStorage.getItem(qrCacheKey);
            if (cached) {
              cachedQRCodes = JSON.parse(cached);
            }
          } catch (err) {
            // Ignore cache errors
          }
          
          const cachedEntry = cachedQRCodes[photo.id];
          if (cachedEntry && cachedEntry.downloadUrl === downloadUrl && cachedEntry.qrCode) {
            // Use cached QR code
            setQrCodes(prev => ({ ...prev, [photo.id]: cachedEntry.qrCode }));
          } else {
            // Generate new QR code
            const qrDataURL = await generateQRCodeDataURL(downloadUrl);
            if (qrDataURL) {
              setQrCodes(prev => ({ ...prev, [photo.id]: qrDataURL }));
              // Cache it
              cachedQRCodes[photo.id] = { qrCode: qrDataURL, downloadUrl };
              try {
                localStorage.setItem(qrCacheKey, JSON.stringify(cachedQRCodes));
              } catch (err) {
                // Ignore storage errors (e.g., quota exceeded)
                if (err instanceof DOMException && err.name === 'QuotaExceededError') {
                  // Try to clean up old cache entries
                  try {
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i);
                      if (key && key.startsWith('qr-cache-') && key !== qrCacheKey) {
                        localStorage.removeItem(key);
                      }
                    }
                    localStorage.setItem(qrCacheKey, JSON.stringify(cachedQRCodes));
                  } catch (retryErr) {
                    // Ignore retry errors
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error(`[SessionPhotosPage] Failed to generate QR for ${photo.id}:`, err);
        }
      }
    }
  }

  function handleCloseDetail() {
    setSelectedPhoto(null);
  }

  // Filter photos based on search query
  const filteredPhotos = photos.filter(photo => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    // Search in photo ID, photo number, and timestamp
    return (
      photo.id.toLowerCase().includes(query) ||
      photo.photoNumber.toString().includes(query) ||
      new Date(photo.timestamp).toLocaleString().toLowerCase().includes(query)
    );
  });

  // Pagination calculations based on filtered photos
  const totalPages = Math.ceil(filteredPhotos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPhotos = filteredPhotos.slice(startIndex, endIndex);

  function handlePageChange(page: number) {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      // Scroll to top when page changes
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Reset to page 1 when photos change or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [photos.length, searchQuery]);

  // Lazy load signed URLs only for photos displayed on current page
  useEffect(() => {
    async function loadSignedUrlsForCurrentPage() {
      // Only load signed URLs for photos that:
      // 1. Are on the current page
      // 2. Have supabasePath but no imageDataURL yet
      const photosToLoad = currentPhotos.filter(photo => 
        photo.supabasePath && !photo.imageDataURL
      );
      
      if (photosToLoad.length === 0) return;
      
      // Load signed URLs in parallel for better performance
      const loadPromises = photosToLoad.map(async (photo) => {
        if (!photo.supabasePath) return null;
        try {
          const signedUrl = await getFreshSignedUrl(photo.supabasePath);
          return { photoId: photo.id, signedUrl };
        } catch (err) {
          console.error(`[SessionPhotosPage] Failed to load signed URL for ${photo.id}:`, err);
          return null;
        }
      });
      
      const results = await Promise.all(loadPromises);
      
      // Update photos with loaded signed URLs
      setPhotos(prevPhotos => {
        const updated = [...prevPhotos];
        results.forEach(result => {
          if (result && result.signedUrl) {
            const index = updated.findIndex(p => p.id === result.photoId);
            if (index >= 0) {
              updated[index] = {
                ...updated[index],
                imageDataURL: result.signedUrl
              };
            }
          }
        });
        return updated;
      });
    }
    
    // Only load if we have photos to load
    if (currentPhotos.length > 0) {
      loadSignedUrlsForCurrentPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, sessionCode]); // Re-run when page changes or session changes

  // Lazy load signed URL for selected photo if not already loaded
  useEffect(() => {
    async function loadSelectedPhotoImage() {
      if (selectedPhoto && selectedPhoto.supabasePath && !selectedPhoto.imageDataURL) {
        try {
          const signedUrl = await getFreshSignedUrl(selectedPhoto.supabasePath);
          if (signedUrl) {
            setPhotos(prev => {
              const updated = [...prev];
              const index = updated.findIndex(p => p.id === selectedPhoto.id);
              if (index >= 0) {
                updated[index] = { ...updated[index], imageDataURL: signedUrl };
              }
              return updated;
            });
            setSelectedPhoto(prev => prev ? { ...prev, imageDataURL: signedUrl } : null);
          }
        } catch (err) {
          console.error(`[SessionPhotosPage] Failed to load image for selected photo ${selectedPhoto.id}:`, err);
        }
      }
    }
    
    if (selectedPhoto) {
      loadSelectedPhotoImage();
    }
  }, [selectedPhoto]);

  if (loading) {
    return (
      <div className="session-photos-page">
        <div className="session-photos-container">
          <div className="session-photos-header">
            <button onClick={handleBack} className="back-btn-small">←</button>
            <h1>Session Photos</h1>
            <div style={{ width: '40px' }}></div>
          </div>
          <div className="session-photos-content">
            <p>Loading photos...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-photos-page">
        <div className="session-photos-container">
          <div className="session-photos-header">
            <button onClick={handleBack} className="back-btn-small">←</button>
            <h1>Session Photos</h1>
            <div style={{ width: '40px' }}></div>
          </div>
          <div className="session-photos-content">
            <div className="error-message">{error}</div>
            <button onClick={handleBack} className="back-btn">← Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="session-photos-page">
      <div className="session-photos-container">
        <div className="session-photos-header">
          <button onClick={handleBack} className="back-btn-small">←</button>
          <h1>Session Photos</h1>
          <div style={{ width: '40px' }}></div>
        </div>
        
        <div className="session-photos-content">
          <div className="session-info-bar">
            <span className="session-code">Session: {sessionCode}</span>
            <span className="photo-count">
              {searchQuery ? (
                <>
                  {filteredPhotos.length} of {photos.length} photos
                </>
              ) : (
                <>
                  {photos.length} uploaded photos
                </>
              )}
            </span>
          </div>

          {/* Search Bar */}
          <div className="session-photos-search">
            <input
              type="text"
              placeholder="Search by photo ID, number, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="search-clear-btn"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

        {filteredPhotos.length === 0 && photos.length > 0 ? (
          <div className="no-photos">
            <div className="empty-state-icon">🔍</div>
            <h2>No Photos Found</h2>
            <p className="empty-state-message">
              No photos match your search query: <strong>"{searchQuery}"</strong>
            </p>
            <p className="empty-state-instruction">
              Try searching by photo ID, photo number, or date.
            </p>
            <div className="empty-state-actions">
              <button 
                onClick={() => setSearchQuery('')} 
                className="primary-btn"
              >
                Clear Search
              </button>
            </div>
          </div>
        ) : photos.length === 0 ? (
          <div className="no-photos">
            <div className="empty-state-icon">📷</div>
            <h2>Belum Ada Photo yang Di-upload</h2>
            {allPhotos.length === 0 ? (
              <>
                <p className="empty-state-message">
                  Belum ada photo yang diambil untuk session ini.
                </p>
                <p className="empty-state-instruction">
                  Silakan ambil photo terlebih dahulu di halaman utama, kemudian upload photo tersebut di Admin Panel.
                </p>
              </>
            ) : (
              <>
                <p className="empty-state-message">
                  Ada {allPhotos.length} photo yang sudah diambil, tapi belum di-upload.
                </p>
                <p className="empty-state-instruction">
                  Silakan upload photo terlebih dahulu di Admin Panel (tab Upload) agar bisa dilihat dan di-download di sini.
                </p>
              </>
            )}
            <div className="empty-state-actions">
              <button onClick={handleBack} className="back-btn">← Kembali ke Admin</button>
              <button 
                onClick={() => window.location.href = '/admin'} 
                className="primary-btn"
              >
                Buka Admin Panel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="photos-list">
              {currentPhotos.map((photo) => {
                const photoTime = new Date(photo.timestamp);
                const hoursSincePhoto = (Date.now() - photoTime.getTime()) / (1000 * 60 * 60);
                const isExpired = enableExpiredCheck && hoursSincePhoto > expiredHours;

                return (
                  <div key={photo.id} className="photo-list-item" onClick={() => handlePhotoClick(photo)}>
                    <div className="photo-list-info">
                      <span className="photo-list-name">{photo.id}</span>
                      <span className="photo-list-number">#{photo.photoNumber}</span>
                    </div>
                    <div className="photo-list-meta">
                      <span className="photo-list-time">{photoTime.toLocaleString()}</span>
                      {isExpired ? (
                        <span className="expired-badge">⚠️ Expired</span>
                      ) : (
                        <span className="valid-badge">✓ Valid</span>
                      )}
                    </div>
                    <div className="photo-list-arrow">→</div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination-container">
                <div className="pagination-info">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredPhotos.length)} of {filteredPhotos.length} photos
                  {searchQuery && ` (filtered from ${photos.length} total)`}
                </div>
                <div className="pagination-controls">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="pagination-btn"
                  >
                    ← Previous
                  </button>
                  
                  <div className="pagination-pages">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Show first page, last page, current page, and pages around current
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`pagination-page-btn ${currentPage === page ? 'active' : ''}`}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        page === currentPage - 2 ||
                        page === currentPage + 2
                      ) {
                        return <span key={page} className="pagination-ellipsis">...</span>;
                      }
                      return null;
                    })}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="pagination-btn"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Photo Detail Modal */}
            {selectedPhoto && (
              <div className="photo-detail-modal" onClick={handleCloseDetail}>
                <div className="photo-detail-content" onClick={(e) => e.stopPropagation()}>
                  <div className="photo-detail-header">
                    <h2>{selectedPhoto.id}</h2>
                    <button className="photo-detail-close" onClick={handleCloseDetail}>×</button>
                  </div>
                  
                  <div className="photo-detail-body">
                    <div className="photo-detail-preview">
                      {selectedPhoto.imageDataURL ? (
                        <img 
                          src={selectedPhoto.imageDataURL} 
                          alt={`Photo ${selectedPhoto.photoNumber}`}
                          className="photo-detail-image"
                          onError={async (e) => {
                            if (selectedPhoto.supabasePath) {
                              try {
                                const url = await getFreshSignedUrl(selectedPhoto.supabasePath);
                                if (url && e.currentTarget) {
                                  e.currentTarget.src = url;
                                  // Update photo record with new URL
                                  setPhotos(prev => {
                                    const updated = [...prev];
                                    const index = updated.findIndex(p => p.id === selectedPhoto.id);
                                    if (index >= 0) {
                                      updated[index] = { ...updated[index], imageDataURL: url };
                                    }
                                    return updated;
                                  });
                                  // Update selected photo
                                  setSelectedPhoto(prev => prev ? { ...prev, imageDataURL: url } : null);
                                }
                              } catch (err) {
                                console.error(`[SessionPhotosPage] Failed to reload image for ${selectedPhoto.id}:`, err);
                              }
                            }
                          }}
                        />
                      ) : selectedPhoto.supabasePath ? (
                        <div className="photo-loading">
                          <p>Loading photo...</p>
                        </div>
                      ) : (
                        <div className="photo-error">Photo not available</div>
                      )}
                    </div>
                    
                    {qrCodes[selectedPhoto.id] && (
                      <div className="photo-detail-qr">
                        <h3>QR Code</h3>
                        <img 
                          src={qrCodes[selectedPhoto.id]} 
                          alt="QR Code" 
                          className="photo-detail-qr-code"
                        />
                      </div>
                    )}
                    
                    {downloadUrls[selectedPhoto.id] && (
                      <div className="photo-detail-actions">
                        <a 
                          href={downloadUrls[selectedPhoto.id]} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="download-link-btn"
                        >
                          Open Download Page
                        </a>
                        <button 
                          onClick={() => handleCopyLink(selectedPhoto.id)}
                          className="copy-link-btn"
                        >
                          Copy Link
                        </button>
                      </div>
                    )}
                    
                    <div className="photo-detail-info">
                      <div className="photo-detail-info-row">
                        <span className="photo-detail-label">Photo Number:</span>
                        <span className="photo-detail-value">#{selectedPhoto.photoNumber}</span>
                      </div>
                      <div className="photo-detail-info-row">
                        <span className="photo-detail-label">Timestamp:</span>
                        <span className="photo-detail-value">{new Date(selectedPhoto.timestamp).toLocaleString()}</span>
                      </div>
                      {selectedPhoto.supabasePath && (
                        <div className="photo-detail-info-row">
                          <span className="photo-detail-label">Storage Path:</span>
                          <span className="photo-detail-value">{selectedPhoto.supabasePath}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
};


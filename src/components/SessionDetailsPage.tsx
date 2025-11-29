import { useState, useEffect } from 'react';
import { getSessionByCode, updateSessionSettings, getDefaultSessionSettings, type SessionInfo, type SessionSettings } from '../services/sessionService';
import { getPhotosBySession, type PhotoRecord } from '../services/photoStorageService';

interface SessionDetailsPageProps {
  sessionCode: string;
}

export const SessionDetailsPage: React.FC<SessionDetailsPageProps> = ({ sessionCode }) => {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [settings, setSettings] = useState<SessionSettings>(getDefaultSessionSettings());
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalPhotos: 0,
    uploadedPhotos: 0,
    expiredPhotos: 0,
    validPhotos: 0,
    oldestPhoto: null as Date | null,
    newestPhoto: null as Date | null
  });

  useEffect(() => {
    loadSessionDetails();
  }, [sessionCode]);

  async function loadSessionDetails() {
    try {
      setLoading(true);
      setError('');
      
      console.log('[SessionDetails] Loading session details for:', sessionCode);
      
      // Load session
      const sessionData = await getSessionByCode(sessionCode);
      if (!sessionData) {
        console.error('[SessionDetails] Session not found:', sessionCode);
        setError('Session not found');
        return;
      }
      
      console.log('[SessionDetails] Session loaded:', {
        sessionCode: sessionData.sessionCode,
        eventName: sessionData.eventName,
        photoCount: sessionData.photoCount,
        hasSettings: !!sessionData.settings
      });
      
      setSession(sessionData);
      const defaultSettings = getDefaultSessionSettings();
      const sessionSettings = sessionData.settings || defaultSettings;
      setSettings(sessionSettings);
      
      console.log('[SessionDetails] Settings:', sessionSettings);
      
      // Load photos for stats
      console.log('[SessionDetails] Loading photos for session:', sessionCode);
      const sessionPhotos = await getPhotosBySession(sessionCode);
      console.log('[SessionDetails] Loaded photos count:', sessionPhotos.length);
      console.log('[SessionDetails] Session photo_count from DB:', sessionData.photoCount);
      
      if (sessionPhotos.length > 0) {
        console.log('[SessionDetails] First photo sample:', {
          id: sessionPhotos[0].id,
          sessionCode: sessionPhotos[0].sessionCode,
          timestamp: sessionPhotos[0].timestamp,
          uploaded: sessionPhotos[0].uploaded
        });
      } else {
        console.warn('[SessionDetails] No photos found in photos table');
        console.warn('[SessionDetails] Session photo_count from DB:', sessionData.photoCount);
      }
      
      setPhotos(sessionPhotos);
      
      // Calculate stats with session settings
      // Use photo_count from session if photos table is empty
      console.log('[SessionDetails] Calculating stats...');
      calculateStats(sessionPhotos, sessionSettings, sessionData.photoCount);
      
    } catch (err) {
      console.error('[SessionDetails] Error loading session details:', err);
      if (err instanceof Error) {
        console.error('[SessionDetails] Error message:', err.message);
        console.error('[SessionDetails] Error stack:', err.stack);
      }
      setError('Failed to load session details');
    } finally {
      setLoading(false);
    }
  }

  function calculateStats(photos: PhotoRecord[], currentSettings: SessionSettings, sessionPhotoCount?: number) {
    try {
      console.log('[calculateStats] Starting calculation with:', {
        photosCount: photos?.length || 0,
        sessionPhotoCount: sessionPhotoCount,
        settings: currentSettings
      });
      
      const now = new Date();
      const expiredHours = currentSettings.photoExpiredHours || 24;
      
      let expiredCount = 0;
      let validCount = 0;
      let oldestDate: Date | null = null;
      let newestDate: Date | null = null;
      
      // Use session photo_count if photos array is empty but session has photo_count
      const totalPhotos = (photos && photos.length > 0) ? photos.length : (sessionPhotoCount || 0);
      
      if (totalPhotos === 0) {
        console.log('[calculateStats] No photos, setting all stats to 0');
        setStats({
          totalPhotos: 0,
          uploadedPhotos: 0,
          expiredPhotos: 0,
          validPhotos: 0,
          oldestPhoto: null,
          newestPhoto: null
        });
        return;
      }
      
      // If we have actual photo records, calculate detailed stats
      if (photos && photos.length > 0) {
        console.log('[calculateStats] Processing', photos.length, 'photos with detailed data');
        
        photos.forEach(photo => {
        if (!photo || !photo.timestamp) {
          console.warn('Invalid photo record:', photo);
          return;
        }
        
        const photoTime = new Date(photo.timestamp);
        
        // Validate date
        if (isNaN(photoTime.getTime())) {
          console.warn('Invalid timestamp for photo:', photo.id, photo.timestamp);
          return;
        }
        
        // Calculate hours since photo was taken
        const hoursSincePhoto = (now.getTime() - photoTime.getTime()) / (1000 * 60 * 60);
        
        // Only check for expired if expired check is enabled
        if (currentSettings.enableExpiredCheck) {
          if (hoursSincePhoto > expiredHours) {
            expiredCount++;
          } else {
            validCount++;
          }
        } else {
          // If expired check is disabled, all photos are considered valid
          validCount++;
        }
        
        // Track oldest and newest photos
        if (!oldestDate || photoTime < oldestDate) {
          oldestDate = photoTime;
        }
        if (!newestDate || photoTime > newestDate) {
          newestDate = photoTime;
        }
        });
        
        const uploadedCount = photos.filter(p => p && p.uploaded).length;
        
        const finalStats = {
          totalPhotos: totalPhotos,
          uploadedPhotos: uploadedCount,
          expiredPhotos: expiredCount,
          validPhotos: validCount,
          oldestPhoto: oldestDate,
          newestPhoto: newestDate
        };
        
        console.log('[calculateStats] Final stats (with detailed data):', finalStats);
        
        setStats(finalStats);
      } else {
        // If we only have photo_count but no photo records, use session photo_count
        console.log('[calculateStats] Using session photo_count:', sessionPhotoCount);
        console.warn('[calculateStats] No detailed photo data available, using session photo_count only');
        
        const finalStats = {
          totalPhotos: totalPhotos,
          uploadedPhotos: 0, // Can't determine without photo records
          expiredPhotos: 0, // Can't determine without photo records
          validPhotos: totalPhotos, // Assume all valid if we can't check
          oldestPhoto: null,
          newestPhoto: null
        };
        
        console.log('[calculateStats] Final stats (from session photo_count only):', finalStats);
        
        setStats(finalStats);
      }
    } catch (error) {
      console.error('[calculateStats] Error calculating stats:', error);
      if (error instanceof Error) {
        console.error('[calculateStats] Error message:', error.message);
        console.error('[calculateStats] Error stack:', error.stack);
      }
      setStats({
        totalPhotos: photos?.length || 0,
        uploadedPhotos: 0,
        expiredPhotos: 0,
        validPhotos: 0,
        oldestPhoto: null,
        newestPhoto: null
      });
    }
  }

  async function handleSaveSettings() {
    if (!sessionCode) return;
    
    setSaving(true);
    setError('');
    
    try {
      const success = await updateSessionSettings(sessionCode, settings);
      if (success) {
        // Update local session state
        if (session) {
          setSession({ ...session, settings });
        }
        // Recalculate stats with new settings
        calculateStats(photos, settings);
        alert('Settings saved successfully!');
      } else {
        setError('Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    window.location.href = '/admin';
  }

  function handleResetSettings() {
    const defaultSettings = getDefaultSessionSettings();
    setSettings(defaultSettings);
  }

  if (loading) {
    return (
      <div className="session-details-page">
        <div className="session-details-container">
          <div className="session-details-header">
            <button onClick={handleBack} className="back-btn-small">←</button>
            <h1>Session Details</h1>
            <div style={{ width: '40px' }}></div>
          </div>
          <div className="session-details-content">
            <p>Loading session details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="session-details-page">
        <div className="session-details-container">
          <div className="session-details-header">
            <button onClick={handleBack} className="back-btn-small">←</button>
            <h1>Session Details</h1>
            <div style={{ width: '40px' }}></div>
          </div>
          <div className="session-details-content">
            <div className="error-message">{error}</div>
            <button onClick={handleBack} className="back-btn">← Back to Admin</button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const sessionAge = new Date().getTime() - new Date(session.createdAt).getTime();
  const sessionAgeDays = Math.floor(sessionAge / (1000 * 60 * 60 * 24));
  const sessionAgeHours = Math.floor((sessionAge % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return (
    <div className="session-details-page">
      <div className="session-details-container">
        <div className="session-details-header">
          <button onClick={handleBack} className="back-btn-small">←</button>
          <h1>Session Details</h1>
          <div style={{ width: '40px' }}></div>
        </div>
        
        <div className="session-details-content">
          {/* Session Info & Statistics - Side by Side */}
          <div className="session-details-top-section">
            <div className="admin-card session-info-card">
              <div className="card-header">
                <h2>Session Information</h2>
              </div>
              <div className="info-grid">
                <div className="info-row">
                  <span className="label">Event Name:</span>
                  <span className="value">{session.eventName}</span>
                </div>
                <div className="info-row">
                  <span className="label">Session Code:</span>
                  <span className="value code">{session.sessionCode}</span>
                </div>
                <div className="info-row">
                  <span className="label">Created:</span>
                  <span className="value">{new Date(session.createdAt).toLocaleString()}</span>
                </div>
                <div className="info-row">
                  <span className="label">Age:</span>
                  <span className="value">
                    {sessionAgeDays > 0 ? `${sessionAgeDays} days, ` : ''}
                    {sessionAgeHours} hours
                  </span>
                </div>
              </div>
            </div>

            {/* Session Statistics */}
            <div className="admin-card session-stats-card">
              <div className="card-header">
                <h2>Statistics</h2>
              </div>
              <div className="info-grid">
                <div className="info-row">
                  <span className="label">Total Photos:</span>
                  <span className="value">{stats.totalPhotos}</span>
                </div>
                <div className="info-row">
                  <span className="label">Uploaded Photos:</span>
                  <span className="value">{stats.uploadedPhotos}</span>
                </div>
                <div className="info-row">
                  <span className="label">Valid Photos:</span>
                  <span className="value valid">{stats.validPhotos}</span>
                </div>
                <div className="info-row">
                  <span className="label">Expired Photos:</span>
                  <span className="value expired">{stats.expiredPhotos}</span>
                </div>
                {stats.oldestPhoto && (
                  <div className="info-row">
                    <span className="label">Oldest Photo:</span>
                    <span className="value">{stats.oldestPhoto.toLocaleString()}</span>
                  </div>
                )}
                {stats.newestPhoto && (
                  <div className="info-row">
                    <span className="label">Newest Photo:</span>
                    <span className="value">{stats.newestPhoto.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <div className="session-details-settings-section">
            {/* Expired Settings */}
            <div className="admin-card settings-card">
              <div className="card-header">
                <h2>Photo Expired Settings</h2>
              </div>
              <div className="settings-content">
                <div className="setting-group">
                  <label className="field-label toggle-label">
                    <span>Enable Expired Check</span>
                    <input
                      type="checkbox"
                      checked={settings.enableExpiredCheck}
                      onChange={(e) => {
                        const newSettings = { ...settings, enableExpiredCheck: e.target.checked };
                        setSettings(newSettings);
                        // Recalculate stats immediately
                        calculateStats(photos, newSettings);
                      }}
                    />
                  </label>
                  <p className="setting-help">
                    If enabled, photos will be marked as expired after the specified hours.
                  </p>
                </div>
                <div className="setting-group">
                  <label className="field-label">
                    Photo Expired Hours
                    <span className="setting-help-inline">(hours after photo is taken)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="8760"
                    value={settings.photoExpiredHours}
                    onChange={(e) => {
                      const newSettings = { ...settings, photoExpiredHours: parseInt(e.target.value) || 24 };
                      setSettings(newSettings);
                      // Recalculate stats immediately
                      calculateStats(photos, newSettings);
                    }}
                    className="text-input"
                    disabled={!settings.enableExpiredCheck}
                  />
                  <p className="setting-help">
                    Photos will expire after {settings.photoExpiredHours} hours ({Math.floor(settings.photoExpiredHours / 24)} days)
                  </p>
                </div>
                <div className="setting-group">
                  <label className="field-label toggle-label">
                    <span>Allow Download After Expired</span>
                    <input
                      type="checkbox"
                      checked={settings.allowDownloadAfterExpired}
                      onChange={(e) => setSettings({ ...settings, allowDownloadAfterExpired: e.target.checked })}
                    />
                  </label>
                  <p className="setting-help">
                    If enabled, users can still download photos even after they expire.
                  </p>
                </div>
              </div>
            </div>

            {/* Delete Settings */}
            <div className="admin-card settings-card">
              <div className="card-header">
                <h2>Auto Delete Settings</h2>
              </div>
              <div className="settings-content">
                <div className="setting-group">
                  <label className="field-label toggle-label">
                    <span>Enable Auto Delete</span>
                    <input
                      type="checkbox"
                      checked={settings.enableAutoDelete}
                      onChange={(e) => setSettings({ ...settings, enableAutoDelete: e.target.checked })}
                    />
                  </label>
                  <p className="setting-help">
                    If enabled, photos will be automatically deleted after the specified days.
                  </p>
                </div>
                <div className="setting-group">
                  <label className="field-label">
                    Database Delete Days
                    <span className="setting-help-inline">(days before deleting from database)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={settings.autoDeleteDays}
                    onChange={(e) => setSettings({ ...settings, autoDeleteDays: parseInt(e.target.value) || 30 })}
                    className="text-input"
                    disabled={!settings.enableAutoDelete}
                  />
                  <p className="setting-help">
                    Photo records will be deleted from database after {settings.autoDeleteDays} days
                  </p>
                </div>
                <div className="setting-group">
                  <label className="field-label">
                    Storage Delete Days
                    <span className="setting-help-inline">(days before deleting from storage)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={settings.storageDeleteDays}
                    onChange={(e) => setSettings({ ...settings, storageDeleteDays: parseInt(e.target.value) || 5 })}
                    className="text-input"
                    disabled={!settings.enableAutoDelete}
                  />
                  <p className="setting-help">
                    Photo files will be deleted from storage after {settings.storageDeleteDays} days
                  </p>
                </div>
              </div>
            </div>

            {/* Other Settings */}
            <div className="admin-card settings-card">
              <div className="card-header">
                <h2>Other Settings</h2>
              </div>
              <div className="settings-content">
                <div className="setting-group">
                  <label className="field-label">
                    Max Photos (Optional)
                    <span className="setting-help-inline">(leave empty for unlimited)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.maxPhotos || ''}
                    onChange={(e) => setSettings({ 
                      ...settings, 
                      maxPhotos: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                    className="text-input"
                    placeholder="Unlimited"
                  />
                  <p className="setting-help">
                    {settings.maxPhotos 
                      ? `Session will stop accepting new photos after ${settings.maxPhotos} photos`
                      : 'No limit on number of photos'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="admin-card actions-card">
            <div className="session-details-actions">
              <button 
                onClick={handleSaveSettings} 
                className="primary-btn save-btn"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              <div className="actions-secondary">
                <button 
                  onClick={handleResetSettings} 
                  className="secondary-btn"
                >
                  Reset to Default
                </button>
                <button 
                  onClick={() => window.location.href = `/session/${sessionCode}/photos`} 
                  className="primary-btn"
                >
                  View Photos List
                </button>
              </div>
              {error && <div className="error-message" style={{ marginTop: '16px' }}>{error}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


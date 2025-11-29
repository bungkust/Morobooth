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
      
      // Load session
      const sessionData = await getSessionByCode(sessionCode);
      if (!sessionData) {
        setError('Session not found');
        return;
      }
      
      setSession(sessionData);
      setSettings(sessionData.settings || getDefaultSessionSettings());
      
      // Load photos for stats
      const sessionPhotos = await getPhotosBySession(sessionCode);
      setPhotos(sessionPhotos);
      
      // Calculate stats
      calculateStats(sessionPhotos, sessionData.settings || getDefaultSessionSettings());
      
    } catch (err) {
      console.error('Error loading session details:', err);
      setError('Failed to load session details');
    } finally {
      setLoading(false);
    }
  }

  function calculateStats(photos: PhotoRecord[], currentSettings: SessionSettings) {
    const now = new Date();
    const expiredHours = currentSettings.photoExpiredHours || 24;
    
    let expiredCount = 0;
    let validCount = 0;
    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;
    
    photos.forEach(photo => {
      const photoTime = new Date(photo.timestamp);
      const hoursSincePhoto = (now.getTime() - photoTime.getTime()) / (1000 * 60 * 60);
      
      if (currentSettings.enableExpiredCheck && hoursSincePhoto > expiredHours) {
        expiredCount++;
      } else {
        validCount++;
      }
      
      if (!oldestDate || photoTime < oldestDate) {
        oldestDate = photoTime;
      }
      if (!newestDate || photoTime > newestDate) {
        newestDate = photoTime;
      }
    });
    
    setStats({
      totalPhotos: photos.length,
      uploadedPhotos: photos.filter(p => p.uploaded).length,
      expiredPhotos: expiredCount,
      validPhotos: validCount,
      oldestPhoto: oldestDate,
      newestPhoto: newestDate
    });
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
          {/* Session Info */}
          <div className="admin-card">
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
          <div className="admin-card">
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

          {/* Expired Settings */}
          <div className="admin-card">
            <div className="card-header">
              <h2>Photo Expired Settings</h2>
            </div>
            <div className="setting-group">
              <label className="field-label">
                <input
                  type="checkbox"
                  checked={settings.enableExpiredCheck}
                  onChange={(e) => setSettings({ ...settings, enableExpiredCheck: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                Enable Expired Check
              </label>
              <p className="setting-help">
                If enabled, photos will be marked as expired after the specified hours.
              </p>
            </div>
            <div className="setting-group">
              <label className="field-label">
                Photo Expired Hours
                <span className="setting-help">(hours after photo is taken)</span>
              </label>
              <input
                type="number"
                min="1"
                max="8760"
                value={settings.photoExpiredHours}
                onChange={(e) => setSettings({ ...settings, photoExpiredHours: parseInt(e.target.value) || 24 })}
                className="text-input"
                disabled={!settings.enableExpiredCheck}
              />
              <p className="setting-help">
                Photos will expire after {settings.photoExpiredHours} hours ({Math.floor(settings.photoExpiredHours / 24)} days)
              </p>
            </div>
            <div className="setting-group">
              <label className="field-label">
                <input
                  type="checkbox"
                  checked={settings.allowDownloadAfterExpired}
                  onChange={(e) => setSettings({ ...settings, allowDownloadAfterExpired: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                Allow Download After Expired
              </label>
              <p className="setting-help">
                If enabled, users can still download photos even after they expire.
              </p>
            </div>
          </div>

          {/* Delete Settings */}
          <div className="admin-card">
            <div className="card-header">
              <h2>Auto Delete Settings</h2>
            </div>
            <div className="setting-group">
              <label className="field-label">
                <input
                  type="checkbox"
                  checked={settings.enableAutoDelete}
                  onChange={(e) => setSettings({ ...settings, enableAutoDelete: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                Enable Auto Delete
              </label>
              <p className="setting-help">
                If enabled, photos will be automatically deleted after the specified days.
              </p>
            </div>
            <div className="setting-group">
              <label className="field-label">
                Database Delete Days
                <span className="setting-help">(days before deleting from database)</span>
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
                <span className="setting-help">(days before deleting from storage)</span>
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

          {/* Other Settings */}
          <div className="admin-card">
            <div className="card-header">
              <h2>Other Settings</h2>
            </div>
            <div className="setting-group">
              <label className="field-label">
                Max Photos (Optional)
                <span className="setting-help">(leave empty for unlimited)</span>
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

          {/* Actions */}
          <div className="admin-card">
            <div className="card-header">
              <h2>Actions</h2>
            </div>
            <div className="session-details-actions">
              <button 
                onClick={handleSaveSettings} 
                className="primary-btn"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
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
              {error && <div className="error-message" style={{ marginTop: '12px' }}>{error}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


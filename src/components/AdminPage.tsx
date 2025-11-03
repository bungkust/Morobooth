import { useState, useEffect, useCallback } from 'react';
import { 
  getCurrentSession, 
  createSession, 
  getAllSessions, 
  clearSession,
  clearAllData,
  type SessionInfo 
} from '../services/sessionService';
import { getPhotosBySession, getUnuploadedPhotos, markPhotoAsUploaded } from '../services/photoStorageService';
import { bulkUploadPhotos, type UploadResult } from '../services/uploadService';
import { isSupabaseConfigured } from '../config/supabase';
import { 
  getConfigOverride, 
  setConfigOverride, 
  clearConfigOverride, 
  clearConfigCache,
  type ConfigOverride 
} from '../services/configService';
import { getHybridBluetoothPrinterService } from '../services/hybridBluetoothPrinterService';
import { nativeBridge } from '../services/nativeBridgeService';

export const AdminPage = () => {
  
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [currentSession, setCurrentSession] = useState<SessionInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newEventName, setNewEventName] = useState('');
  const [error, setError] = useState('');
  
  // Upload states
  const [unuploadedPhotos, setUnuploadedPhotos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);

  // Config states
  const [configOverride, setConfigOverrideState] = useState<ConfigOverride>({
    enabled: false,
    mainText: '',
    subText: ''
  });
  const [configError, setConfigError] = useState('');

  // Tab state
  const [activeTab, setActiveTab] = useState<'session' | 'upload' | 'config' | 'history' | 'bluetooth'>('session');
  
  // Bluetooth states
  const [bluetoothPrinter, setBluetoothPrinter] = useState<HybridBluetoothPrinterService | null>(null);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<string>('');
  const [printerInfo, setPrinterInfo] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const current = await getCurrentSession();
      setCurrentSession(current);
      
      const all = await getAllSessions();
      setSessions(all);
      
      // Only try to get unuploaded photos if we have a session
      if (current) {
        try {
          const unuploaded = await getUnuploadedPhotos();
          setUnuploadedPhotos(unuploaded);
        } catch (error) {
          console.warn('Could not load unuploaded photos:', error);
          setUnuploadedPhotos([]);
        }
      } else {
        setUnuploadedPhotos([]);
      }

      // Load config override
      const config = getConfigOverride();
      setConfigOverrideState(config);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data. Please refresh the page.');
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadData();
    }
  }, [authenticated, loadData]);

  // Initialize native bridge
  useEffect(() => {
    nativeBridge.init();
    
    // Check native environment
    console.log('AdminPage: window.isNativeApp =', window.isNativeApp);
    console.log('AdminPage: window.hasNativeBluetooth =', window.hasNativeBluetooth);
    console.log('AdminPage: nativeBridge.isNativeApp() =', nativeBridge.isNativeApp());
    console.log('AdminPage: nativeBridge.hasNativeBluetooth() =', nativeBridge.hasNativeBluetooth());
    
    // Get singleton printer instance
    const printerInstance = getHybridBluetoothPrinterService();
    console.log('AdminPage: printerInstance.isNativeEnvironment() =', printerInstance.isNativeEnvironment());
    setBluetoothPrinter(printerInstance);
    
    // Listen for Bluetooth status changes
    const statusHandler = (event: any) => {
      setIsBluetoothConnected(event.detail.connected);
      setPrinterInfo(event.detail.info);
      if (event.detail.connected) {
        console.log('Bluetooth connected:', event.detail.info);
      }
    };
    window.addEventListener('bluetoothStatusChange', statusHandler);
    
    return () => {
      window.removeEventListener('bluetoothStatusChange', statusHandler);
    };
  }, []);

  const handleLogin = useCallback(() => {
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';
    if (password === adminPassword) {
      setAuthenticated(true);
      setError('');
    } else {
      setError('Invalid password');
    }
  }, [password]);

  const handleCreateSession = useCallback(async () => {
    if (!newEventName.trim()) {
      setError('Event name required');
      return;
    }
    
    try {
      await createSession(newEventName.trim());
      setNewEventName('');
      setError('');
      await loadData();
    } catch (err) {
      console.error('Error creating session:', err);
      setError(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [newEventName, loadData]);

  async function handleClearSession() {
    if (confirm('Clear current session? This will not delete photos.')) {
      await clearSession();
      await loadData();
    }
  }

  async function handleClearAllData() {
    if (confirm('Clear ALL data including photos? This cannot be undone.')) {
      try {
        await clearAllData();
        setError('');
        await loadData();
        alert('All data cleared successfully!');
      } catch (err) {
        console.error('Error clearing all data:', err);
        setError('Failed to clear all data');
      }
    }
  }

  async function viewSessionPhotos(sessionCode: string) {
    const photos = await getPhotosBySession(sessionCode);
    const uploaded = photos.filter(p => p.uploaded).length;
    alert(`Session ${sessionCode}:\n${photos.length} total photos\n${uploaded} uploaded to cloud\n${photos.length - uploaded} pending upload`);
  }

  // Config handlers
  function handleConfigSave() {
    try {
      setConfigOverride(configOverride);
      clearConfigCache();
      setConfigError('');
      alert('Configuration saved successfully!');
    } catch (err) {
      setConfigError('Failed to save configuration');
    }
  }

  function handleConfigClear() {
    if (confirm('Clear custom configuration? This will revert to default values.')) {
      try {
        clearConfigOverride();
        setConfigOverrideState({
          enabled: false,
          mainText: '',
          subText: ''
        });
        setConfigError('');
        alert('Configuration cleared!');
      } catch (err) {
        setConfigError('Failed to clear configuration');
      }
    }
  }

  async function handleUpload() {
    if (!isSupabaseConfigured()) {
      setError('Supabase not configured. Please check environment variables.');
      return;
    }

    setUploading(true);
    setError('');
    setUploadResults([]);
    
    try {
      const results = await bulkUploadPhotos(unuploadedPhotos);
      
      // Mark successful uploads
      for (const result of results) {
        if (result.success && result.url) {
          await markPhotoAsUploaded(result.photoId, result.url);
        }
      }
      
      setUploadResults(results);
      await loadData(); // Refresh unuploaded list
    } catch (err) {
      setError('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setUploading(false);
    }
  }

  const handleConnectBluetooth = async () => {
    try {
      setBluetoothError('');
      
      if (!bluetoothPrinter) {
        setBluetoothError('Bluetooth service not initialized');
        return;
      }
      
      if (bluetoothPrinter.isNativeEnvironment()) {
        await bluetoothPrinter.connect();
        // State will be updated via bluetoothStatusChange event
      } else {
        if (!('bluetooth' in navigator)) {
          setBluetoothError('Web Bluetooth not supported');
          alert('Web Bluetooth not supported in this browser');
          return;
        }
        
        const connected = await bluetoothPrinter.connect();
        if (connected) {
          setIsBluetoothConnected(true);
          setPrinterInfo(bluetoothPrinter.getPrinterInfo());
          alert(`Connected to ${bluetoothPrinter.getPrinterInfo()?.name || 'Printer'}`);
        } else {
          setBluetoothError('Failed to connect to printer');
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setBluetoothError(msg);
      alert('Bluetooth connect error: ' + msg);
    }
  };

  const handleDisconnectBluetooth = async () => {
    try {
      await bluetoothPrinter?.disconnect();
    } finally {
      setBluetoothPrinter(null);
      setIsBluetoothConnected(false);
      setPrinterInfo(null);
      setBluetoothError('');
    }
  };

  if (!authenticated) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <h1>Admin Panel</h1>
          {error && <div className="error-message">{error}</div>}
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin}>Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin Panel</h1>
          <button onClick={() => window.location.href = '/'} className="back-btn">
            ← Back to Booth
          </button>
        </div>

        <div className="admin-content">
          {/* Tab Content */}
          {activeTab === 'session' && (
            <div className="tab-content">
              {/* Current Session Card */}
              <div className="admin-card current-session-card">
                <div className="card-header">
                  <h2>Current Session</h2>
                  <div className="status-indicator active"></div>
                </div>
                     {currentSession ? (
                       <div className="session-info">
                         <div className="info-row">
                           <span className="label">Status:</span>
                           <span className="value status-active">🟢 ACTIVE SESSION</span>
                         </div>
                         <div className="info-row">
                           <span className="label">Event:</span>
                           <span className="value">{currentSession.eventName}</span>
                         </div>
                         <div className="info-row">
                           <span className="label">Code:</span>
                           <span className="value code">{currentSession.sessionCode}</span>
                         </div>
                         <div className="info-row">
                           <span className="label">Photos:</span>
                           <span className="value">{currentSession.photoCount}</span>
                         </div>
                         <div className="info-row">
                           <span className="label">Created:</span>
                           <span className="value">{new Date(currentSession.createdAt).toLocaleDateString()}</span>
                         </div>
                         <div className="session-actions">
                           <button onClick={handleClearSession} className="danger-btn">
                             Clear Session
                           </button>
                           <button onClick={handleClearAllData} className="danger-btn">
                             Clear All Data
                           </button>
                         </div>
                       </div>
                ) : (
                  <div className="no-session">
                    <p>No active session</p>
                    <p className="subtitle">Create a session below to start taking photos</p>
                  </div>
                )}
              </div>

              {/* Create Session Card */}
              <div className="admin-card create-session-card">
                <div className="card-header">
                  <h2>Create New Session</h2>
                  <div className="status-indicator"></div>
                </div>
                {error && error.includes('create') && <div className="error-message">{error}</div>}
                <div className="create-form">
                  <input
                    type="text"
                    placeholder="Event Name (e.g., Wedding Kus & Lira)"
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateSession()}
                  />
                  <button onClick={handleCreateSession} className="primary-btn">
                    Create Session
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="tab-content">
              <div className="admin-card upload-card">
                <div className="card-header">
                  <h2>Upload Photos</h2>
                  <div className={`status-indicator ${isSupabaseConfigured() ? 'success' : 'error'}`}></div>
                </div>
                {error && error.includes('Supabase') && <div className="error-message">{error}</div>}
                
                <div className="upload-stats">
                  <div className="stat-item">
                    <span className="stat-number">{unuploadedPhotos.length}</span>
                    <span className="stat-label">Pending Uploads</span>
                  </div>
                  <div className="config-status">
                    {isSupabaseConfigured() ? (
                      <span className="success">✓ Supabase Ready</span>
                    ) : (
                      <span className="error">✗ Supabase Not Configured</span>
                    )}
                  </div>
                </div>

                {unuploadedPhotos.length > 0 && (
                  <button 
                    onClick={handleUpload} 
                    disabled={uploading || !isSupabaseConfigured()}
                    className="upload-btn"
                  >
                    {uploading ? `Uploading... (${uploadResults.length}/${unuploadedPhotos.length})` : 'Upload All Photos'}
                  </button>
                )}

                {uploadResults.length > 0 && (
                  <div className="upload-results">
                    <h3>Upload Results</h3>
                    <div className="results-summary">
                      <span className="success-count">
                        ✓ {uploadResults.filter(r => r.success).length} Success
                      </span>
                      <span className="error-count">
                        ✗ {uploadResults.filter(r => !r.success).length} Failed
                      </span>
                    </div>
                    <div className="results-list">
                      {uploadResults.slice(0, 5).map(r => (
                        <div key={r.photoId} className={`result-item ${r.success ? 'success' : 'error'}`}>
                          {r.photoId}: {r.success ? '✓' : '✗'}
                        </div>
                      ))}
                      {uploadResults.length > 5 && (
                        <div className="more-results">... and {uploadResults.length - 5} more</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="tab-content">
              <div className="admin-card config-card">
                <div className="card-header">
                  <h2>Custom Text</h2>
                  <div className={`status-indicator ${configOverride.enabled ? 'active' : ''}`}></div>
                </div>
                {configError && <div className="error-message">{configError}</div>}
                
                <div className="config-preview">
                  <div className="preview-text">
                    <div className="main-text">{configOverride.enabled ? (configOverride.mainText || 'Morobooth') : 'Morobooth (default)'}</div>
                    <div className="sub-text">{configOverride.enabled ? (configOverride.subText || '2025') : '2025 (default)'}</div>
                  </div>
                </div>

                <div className="config-form">
                  <input
                    type="text"
                    placeholder="Main Text (e.g., Kus & Lira)"
                    value={configOverride.mainText}
                    onChange={(e) => setConfigOverrideState({
                      ...configOverride,
                      mainText: e.target.value
                    })}
                  />
                  <input
                    type="text"
                    placeholder="Sub Text (e.g., #Bahagia Selamanya)"
                    value={configOverride.subText}
                    onChange={(e) => setConfigOverrideState({
                      ...configOverride,
                      subText: e.target.value
                    })}
                  />
                  <div className="config-controls">
                    <button 
                      onClick={() => setConfigOverrideState({
                        ...configOverride,
                        enabled: !configOverride.enabled
                      })}
                      className={configOverride.enabled ? 'danger-btn' : 'secondary-btn'}
                    >
                      {configOverride.enabled ? 'Disable' : 'Enable'} Custom Text
                    </button>
                    <button onClick={handleConfigSave} disabled={!configOverride.enabled} className="primary-btn">
                      Save
                    </button>
                    <button onClick={handleConfigClear} className="danger-btn">
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="tab-content">
              <div className="admin-card history-card">
                <div className="card-header">
                  <h2>Session History</h2>
                  <div className="status-indicator"></div>
                </div>
                {sessions.length === 0 ? (
                  <div className="no-data">
                    <p>No sessions yet</p>
                  </div>
                ) : (
                  <div className="sessions-list">
                    {sessions.slice(0, 10).map(s => {
                      const isActive = currentSession?.sessionCode === s.sessionCode;
                      return (
                        <div key={s.sessionCode} className={`session-item ${isActive ? 'active-session' : ''}`}>
                          <div className="session-info">
                            <div className="session-header">
                              <div className="session-code">{s.sessionCode}</div>
                              <div className={`session-status ${isActive ? 'active' : 'inactive'}`}>
                                {isActive ? '🟢 ACTIVE' : '⚪ INACTIVE'}
                              </div>
                            </div>
                            <div className="session-event">{s.eventName}</div>
                          </div>
                          <div className="session-stats">
                            <span className="photo-count">{s.photoCount} photos</span>
                            <span className="session-date">{new Date(s.createdAt).toLocaleDateString()}</span>
                          </div>
                          <button onClick={() => viewSessionPhotos(s.sessionCode)} className="small-btn">
                            View
                          </button>
                        </div>
                      );
                    })}
                    {sessions.length > 10 && (
                      <div className="more-sessions">... and {sessions.length - 10} more sessions</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'bluetooth' && (
            <div className="tab-content">
              <div className="admin-card bluetooth-card">
                <div className="card-header">
                  <h2>Bluetooth Printer</h2>
                  <div className={`status-indicator ${isBluetoothConnected ? 'active' : ''}`}></div>
                </div>
                
                {bluetoothError && <div className="error-message">{bluetoothError}</div>}
                
                {!isBluetoothConnected ? (
                  <div className="bluetooth-not-connected">
                    <div className="bluetooth-icon">📡</div>
                    <p className="bluetooth-status-text">Printer not connected</p>
                    <p className="bluetooth-help-text">
                      Click the button below to scan for and connect to a Bluetooth printer
                    </p>
                    <button 
                      onClick={handleConnectBluetooth} 
                      className="primary-btn bluetooth-btn"
                    >
                      Connect Bluetooth Printer
                    </button>
                  </div>
                ) : (
                  <div className="bluetooth-connected">
                    <div className="bluetooth-icon connected">✓</div>
                    <p className="bluetooth-status-text">Printer connected</p>
                    {printerInfo && (
                      <div className="printer-details">
                        <div className="info-row">
                          <span className="label">Name:</span>
                          <span className="value">{printerInfo.name || 'Unknown'}</span>
                        </div>
                        {printerInfo.address && (
                          <div className="info-row">
                            <span className="label">Address:</span>
                            <span className="value code">{printerInfo.address}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <button 
                      onClick={handleDisconnectBluetooth} 
                      className="danger-btn disconnect-btn"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          <button 
            className={`nav-btn ${activeTab === 'session' ? 'active' : ''}`}
            onClick={() => setActiveTab('session')}
          >
            <span className="nav-icon">📷</span>
            <span className="nav-label">Session</span>
          </button>
          <button 
            className={`nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <span className="nav-icon">☁️</span>
            <span className="nav-label">Upload</span>
          </button>
          <button 
            className={`nav-btn ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Config</span>
          </button>
          <button 
            className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <span className="nav-icon">📋</span>
            <span className="nav-label">History</span>
          </button>
          <button 
            className={`nav-btn ${activeTab === 'bluetooth' ? 'active' : ''}`}
            onClick={() => setActiveTab('bluetooth')}
          >
            <span className="nav-icon">🖨️</span>
            <span className="nav-label">Printer</span>
          </button>
        </div>
      </div>
    </div>
  );
};

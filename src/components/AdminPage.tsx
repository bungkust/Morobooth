import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    MoroboothBundleVersion?: string;
  }
}
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
import { supabase, isSupabaseConfigured } from '../config/supabase';
import type { ConfigOverride, ConfigHeader, ConfigBody, HeaderMode } from '../services/configService';
import { getConfigOverride, setConfigOverride } from '../services/configService';
import { getHybridBluetoothPrinterService, HybridBluetoothPrinterService } from '../services/hybridBluetoothPrinterService';
import { nativeBridge } from '../services/nativeBridgeService';
import { uploadHeaderImage, deleteHeaderImage } from '../services/headerImageUploadService';

const SESSIONS_TABLE = 'sessions';
const DEFAULT_BODY_MAIN = 'Morobooth';
const DEFAULT_BODY_SUB = '2025';

async function syncConfigToSupabase(config: ConfigOverride, fallbackSessionCode?: string) {
  if (!isSupabaseConfigured() || !supabase) {
    return;
  }

  const sessionCode = config.sessionCode ?? fallbackSessionCode;
  if (!sessionCode) {
    console.warn('syncConfigToSupabase skipped: no session code available');
    return;
  }

  const headerMode = config.header.mode ?? 'text';
  const bodyMain = config.body.mainText ?? DEFAULT_BODY_MAIN;
  const bodySub = config.body.subText ?? DEFAULT_BODY_SUB;

  try {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({
        config_enabled: config.enabled,
        config_header_mode: headerMode,
        config_header_main_text: config.header.mainText ?? '',
        config_header_sub_text: config.header.subText ?? '',
        config_header_image_url: headerMode === 'image' ? (config.header.imageUrl ?? '') : null,
        config_body_main_text: bodyMain,
        config_body_sub_text: bodySub,
      })
      .eq('session_code', sessionCode);

    if (error) {
      console.error('Supabase syncConfigToSupabase error:', error);
    }
  } catch (error) {
    console.error('Supabase syncConfigToSupabase exception:', error);
  }
}

async function loadConfigFromSupabase(activeSessionCode?: string): Promise<ConfigOverride | null> {
  if (!isSupabaseConfigured() || !supabase) {
    return null;
  }

  try {
    const baseQuery = supabase
      .from(SESSIONS_TABLE)
      .select('session_code, config_enabled, config_header_mode, config_header_main_text, config_header_sub_text, config_header_image_url, config_body_main_text, config_body_sub_text')
      .order('created_at', { ascending: false })
      .limit(1);

    const { data, error } = activeSessionCode
      ? await baseQuery.eq('session_code', activeSessionCode)
      : await baseQuery.eq('is_active', true);

    if (error) {
      console.error('Supabase loadConfigFromSupabase error:', error);
      return null;
    }

    if (data && data.length > 0) {
      const row = data[0];
      const headerMode: HeaderMode = (row.config_header_mode as HeaderMode) ?? 'text';
      const headerImage = headerMode === 'image' ? (row.config_header_image_url ?? '') : '';
      const headerMain = row.config_header_main_text ?? '';
      const headerSub = row.config_header_sub_text ?? '';
      const bodyMain = row.config_body_main_text ?? DEFAULT_BODY_MAIN;
      const bodySub = row.config_body_sub_text ?? DEFAULT_BODY_SUB;

      return {
        enabled: row.config_enabled ?? false,
        sessionCode: row.session_code ?? activeSessionCode,
        header: {
          mode: headerMode,
          mainText: headerMain,
          subText: headerSub,
          imageUrl: headerImage
        },
        body: {
          mainText: bodyMain,
          subText: bodySub
        }
      } as ConfigOverride;
    }
  } catch (error) {
    console.error('Supabase loadConfigFromSupabase exception:', error);
  }

  return null;
}

type ConfigHeaderPatch = Partial<ConfigHeader>;
type ConfigBodyPatch = Partial<ConfigBody>;

type ConfigOverridePatch = Omit<Partial<ConfigOverride>, 'header' | 'body'> & {
  header?: ConfigHeaderPatch;
  body?: ConfigBodyPatch;
};

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
    header: {
      mode: 'text',
    mainText: '',
      subText: '',
      imageUrl: ''
    },
    body: {
      mainText: 'Morobooth',
      subText: '2025'
    }
  });
  const [configError, setConfigError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadImageError, setUploadImageError] = useState('');

  const updateConfigOverride = useCallback((patch: ConfigOverridePatch) => {
    setConfigOverrideState((prev) => {
      const { header: headerPatch, body: bodyPatch, ...rest } = patch;
      const nextHeader: ConfigHeader = {
        ...prev.header,
        ...(headerPatch ?? {})
      };
      const nextBody: ConfigBody = {
        ...prev.body,
        ...(bodyPatch ?? {})
      };
      const next: ConfigOverride = {
        ...prev,
        ...rest,
        header: nextHeader,
        body: nextBody,
      };
      if (!next.sessionCode && currentSession?.sessionCode) {
        next.sessionCode = currentSession.sessionCode;
      }
      return next;
    });
  }, [currentSession?.sessionCode]);

  // Tab state
  const [activeTab, setActiveTab] = useState<'session' | 'upload' | 'config' | 'history' | 'bluetooth'>('session');
  
  // Bluetooth states
  const [bluetoothPrinter, setBluetoothPrinter] = useState<HybridBluetoothPrinterService | null>(null);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<string>('');
  const [printerInfo, setPrinterInfo] = useState<any>(null);
  const [testPrintLoading, setTestPrintLoading] = useState(false);
  const [bundleVersion, setBundleVersion] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Helper untuk show notification (ganti alert)
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const current = await getCurrentSession();
      setCurrentSession(current);
      
      const all = await getAllSessions();
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSessions(all);
      
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

      let remoteConfig: ConfigOverride | null = null;
      if (isSupabaseConfigured()) {
        remoteConfig = await loadConfigFromSupabase(current?.sessionCode);
      }

      if (remoteConfig) {
        if (current && !remoteConfig.sessionCode) {
          remoteConfig.sessionCode = current.sessionCode;
        }
        setConfigOverrideState(remoteConfig);
        setConfigOverride(remoteConfig);
      } else {
        const localConfig = getConfigOverride();
        if (!localConfig.sessionCode && current) {
          localConfig.sessionCode = current.sessionCode;
          setConfigOverride(localConfig);
        }
        setConfigOverrideState(localConfig);
      }
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
    setBundleVersion(window?.MoroboothBundleVersion ?? null);
    
    // Check native environment
    console.log('AdminPage: window.isNativeApp =', window.isNativeApp);
    console.log('AdminPage: window.hasNativeBluetooth =', window.hasNativeBluetooth);
    console.log('AdminPage: nativeBridge.isNativeApp() =', nativeBridge.isNativeApp());
    console.log('AdminPage: nativeBridge.hasNativeBluetooth() =', nativeBridge.hasNativeBluetooth());
    
    // Get singleton printer instance
    const printerInstance = getHybridBluetoothPrinterService();
    console.log('AdminPage: printerInstance.isNativeEnvironment() =', printerInstance.isNativeEnvironment());
    setBluetoothPrinter(printerInstance);
    
    // Request initial printer status from native
    if (nativeBridge.isNativeApp() && nativeBridge.hasNativeBluetooth()) {
      console.log('AdminPage: Requesting initial printer status from native...');
      nativeBridge.sendMessage('GET_PRINTER_STATUS');
    } else {
      // Web environment - check singleton status
      const currentlyConnected = printerInstance.getIsConnected();
      console.log('AdminPage: Current connection status:', currentlyConnected);
      if (currentlyConnected) {
        setIsBluetoothConnected(true);
        console.log('AdminPage: Bluetooth already connected on mount');
      }
    }
    
    // Listen for Bluetooth status changes
    const statusHandler = (event: any) => {
      console.log('AdminPage: Received bluetoothStatusChange event:', event.detail);
      const connected = event.detail.connected === true;
      setIsBluetoothConnected(connected);
      setPrinterInfo(event.detail.info || null);
      if (connected) {
        console.log('AdminPage: Bluetooth connected - showing test print button');
        console.log('AdminPage: Printer info:', event.detail.info);
      } else {
        console.log('AdminPage: Bluetooth disconnected');
      }
    };
    window.addEventListener('bluetoothStatusChange', statusHandler);
    
    // Also check initial status periodically in case event doesn't fire
    const checkStatus = setInterval(() => {
      if (bluetoothPrinter) {
        const connected = bluetoothPrinter.getIsConnected();
        if (connected && !isBluetoothConnected) {
          console.log('AdminPage: Detected connection via status check');
          setIsBluetoothConnected(true);
          setPrinterInfo(bluetoothPrinter.getPrinterInfo());
        }
      }
    }, 1000);
    
    // Listen for Bluetooth errors from service
    const handleBluetoothError = (e: any) => {
      showNotification('Bluetooth Error: ' + e.detail.error, 'error');
    };
    window.addEventListener('bluetoothError', handleBluetoothError);

    return () => {
      window.removeEventListener('bluetoothStatusChange', statusHandler);
      window.removeEventListener('bluetoothError', handleBluetoothError);
      clearInterval(checkStatus);
    };
  }, [bluetoothPrinter, isBluetoothConnected, showNotification]);

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
      const session = await createSession(newEventName.trim());
      setNewEventName('');
      setError('');
      updateConfigOverride({
        sessionCode: session.sessionCode,
      });
      await loadData();
    } catch (err) {
      console.error('Error creating session:', err);
      setError(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [newEventName, loadData, updateConfigOverride]);

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
        showNotification('Semua data berhasil dihapus!', 'success');
      } catch (err) {
        console.error('Error clearing all data:', err);
        setError('Failed to clear all data');
      }
    }
  }

  async function viewSessionPhotos(sessionCode: string) {
    const photos = await getPhotosBySession(sessionCode);
    const uploaded = photos.filter(p => p.uploaded).length;
    showNotification(`Session ${sessionCode}: ${photos.length} foto total, ${uploaded} terupload, ${photos.length - uploaded} pending`, 'info');
  }

  // Config handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadImageError('Please select an image file');
      return;
    }
    
    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setUploadImageError('Image too large (max 10MB)');
      return;
    }
    
    setUploadingImage(true);
    setUploadImageError('');
    
    try {
      const result = await uploadHeaderImage(file, currentSession?.sessionCode);
      
      if (result.success && result.url) {
        updateConfigOverride({
          enabled: true,
          header: { mode: 'image', imageUrl: result.url }
        });
        setUploadImageError('');
      } else {
        setUploadImageError(result.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Image upload error:', error);
      setUploadImageError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setUploadingImage(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleRemoveImage = async () => {
    const imageUrl = configOverride.header.imageUrl;
    if (!imageUrl) return;
    
    // Only delete from Supabase if it's a Supabase URL
    if (imageUrl.includes('supabase.co')) {
      await deleteHeaderImage(imageUrl);
    }
    
    updateConfigOverride({ header: { imageUrl: '' } });
    setUploadImageError('');
  };

  function handleConfigSave() {
    try {
      if (configOverride.enabled && configOverride.header.mode === 'image' && !configOverride.header.imageUrl) {
        setConfigError('Please provide an image URL or upload an image before saving.');
        return;
      }
      const overrideToSave: ConfigOverride = {
        ...configOverride,
        sessionCode: configOverride.sessionCode ?? currentSession?.sessionCode,
      };
      setConfigOverride(overrideToSave);
      syncConfigToSupabase(overrideToSave, currentSession?.sessionCode).catch((error) => {
        console.error('syncConfigToSupabase failed:', error);
      });
      setConfigError('');
      showNotification('Konfigurasi berhasil disimpan!', 'success');
    } catch (err) {
      setConfigError('Failed to save configuration');
    }
  }

  function handleConfigClear() {
    if (confirm('Clear custom configuration? This will revert to default values.')) {
      try {
        const clearedConfig: ConfigOverride = {
          enabled: false,
          sessionCode: configOverride.sessionCode ?? currentSession?.sessionCode,
          header: {
            mode: 'text',
          mainText: '',
            subText: '',
            imageUrl: ''
          },
          body: {
            mainText: DEFAULT_BODY_MAIN,
            subText: DEFAULT_BODY_SUB
          }
        };
        setConfigOverride(clearedConfig);
        setConfigOverrideState(clearedConfig);
        syncConfigToSupabase(clearedConfig, currentSession?.sessionCode).catch((error) => {
          console.error('syncConfigToSupabase (clear) failed:', error);
        });
        setConfigError('');
        showNotification('Konfigurasi berhasil dihapus!', 'success');
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
        // Give it a moment for the event to fire, then check status
        setTimeout(() => {
          const isConnected = bluetoothPrinter?.getIsConnected();
          if (isConnected) {
            setIsBluetoothConnected(true);
            setPrinterInfo(bluetoothPrinter?.getPrinterInfo());
          }
        }, 500);
      } else {
        if (!('bluetooth' in navigator)) {
          setBluetoothError('Web Bluetooth not supported');
          showNotification('Web Bluetooth tidak didukung di browser ini', 'error');
          return;
        }
        
        const connected = await bluetoothPrinter.connect();
        if (connected) {
          setIsBluetoothConnected(true);
          const info = bluetoothPrinter.getPrinterInfo();
          setPrinterInfo(info);
          showNotification(`Terhubung ke ${info?.name || 'Printer'}`, 'success');
        } else {
          setBluetoothError('Failed to connect to printer');
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setBluetoothError(msg);
      showNotification('Error koneksi Bluetooth: ' + msg, 'error');
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

  const handleTestPrint = async () => {
    if (!bluetoothPrinter || !isBluetoothConnected) {
      showNotification('Printer tidak terhubung. Silakan connect printer terlebih dahulu.', 'error');
      return;
    }

    setTestPrintLoading(true);
    setBluetoothError('');

    try {
      console.log('Test print: Generating Street Coffee receipt...');
      const receiptWidth = printerInfo?.width ?? 384;
      const success = await bluetoothPrinter.printStreetCoffeeReceipt(receiptWidth);
      
      if (success) {
        showNotification('Test print berhasil dikirim! Cek printer Anda untuk struk Street Coffee.', 'success');
      } else {
        throw new Error('Print gagal');
      }
    } catch (error) {
      console.error('Test print error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setBluetoothError('Test print gagal: ' + errorMsg);
      showNotification('Test print gagal: ' + errorMsg, 'error');
    } finally {
      setTestPrintLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <div className="admin-login-card">
            <div className="admin-login-header">
              <div className="title-group">
          <h1>Admin Panel</h1>
                {bundleVersion && (
                  <span className="bundle-version">
                    Bundle: {bundleVersion}
                  </span>
                )}
              </div>
            </div>
          {error && <div className="error-message">{error}</div>}
            <div className="login-form">
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleLogin();
                }}
          />
              <button onClick={handleLogin} className="primary-btn">
                Login
              </button>
              <button
                type="button"
                className="ghost-back-btn"
                onClick={() => (window.location.href = '/')}
              >
                ← Back ke Booth
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {notification && (
        <div 
          className={`admin-notification admin-notification-${notification.type}`}
          onClick={() => setNotification(null)}
        >
          {notification.message}
          <button 
            className="admin-notification-close"
            onClick={(e) => {
              e.stopPropagation();
              setNotification(null);
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin Panel</h1>
          {bundleVersion && (
            <span className="bundle-version">
              Bundle: {bundleVersion}
            </span>
          )}
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
                  {configOverride.enabled ? (
                    configOverride.header.mode === 'image' ? (
                      configOverride.header.imageUrl ? (
                        <img
                          src={configOverride.header.imageUrl}
                          alt="Custom logo"
                          className="preview-image"
                        />
                      ) : (
                        <div className="image-placeholder">No image selected</div>
                      )
                    ) : (
                  <div className="preview-text">
                        {configOverride.header.mainText?.trim() ? (
                          <div className="main-text">{configOverride.header.mainText.trim()}</div>
                        ) : null}
                        {configOverride.header.subText?.trim() ? (
                          <div className="sub-text">{configOverride.header.subText.trim()}</div>
                        ) : null}
                  </div>
                    )
                  ) : (
                    <div className="preview-text">
                      <div className="main-text">Morobooth (default)</div>
                      <div className="sub-text">2025 (default)</div>
                    </div>
                  )}

                  {(() => {
                    const bodyMain = configOverride.enabled ? configOverride.body.mainText?.trim() ?? '' : DEFAULT_BODY_MAIN;
                    const bodySub = configOverride.enabled ? configOverride.body.subText?.trim() ?? '' : DEFAULT_BODY_SUB;
                    const showMain = configOverride.enabled ? bodyMain.length > 0 : true;
                    const showSub = configOverride.enabled ? bodySub.length > 0 : true;
                    if (!showMain && !showSub) return null;
                    return (
                      <div className="preview-text body-preview">
                        {showMain && <div className="main-text">{bodyMain}</div>}
                        {showSub && <div className="sub-text">{bodySub}</div>}
                      </div>
                    );
                  })()}
                </div>

                <div className="config-form">
                  <div className="display-mode">
                    <button
                      type="button"
                      className={`mode-btn ${configOverride.header.mode === 'text' ? 'active' : ''}`}
                      onClick={() => updateConfigOverride({ header: { mode: 'text', imageUrl: '' } })}
                    >
                      Text Mode
                    </button>
                    <button
                      type="button"
                      className={`mode-btn ${configOverride.header.mode === 'image' ? 'active' : ''}`}
                      onClick={() => updateConfigOverride({ enabled: true, header: { mode: 'image' } })}
                    >
                      Image Mode
                    </button>
                  </div>

                  {configOverride.header.mode === 'text' && (
                    <>
                      <label className="field-label">Header Main Text</label>
                  <input
                    type="text"
                        placeholder="Header Main Text (e.g., Wedding of)"
                        value={configOverride.header.mainText}
                        onChange={(e) => updateConfigOverride({ header: { mainText: e.target.value } })}
                  />
                      <label className="field-label">Header Sub Text</label>
                  <input
                    type="text"
                        placeholder="Header Sub Text (e.g., Kus & Lira)"
                        value={configOverride.header.subText}
                        onChange={(e) => updateConfigOverride({ header: { subText: e.target.value } })}
                      />
                      <label className="field-label">Main Text (Body)</label>
                      <input
                        type="text"
                        placeholder="Main Text (e.g., Morobooth)"
                        value={configOverride.body.mainText}
                        onChange={(e) => updateConfigOverride({ body: { mainText: e.target.value } })}
                      />
                      <label className="field-label">Sub Text (Body)</label>
                      <input
                        type="text"
                        placeholder="Sub Text (e.g., 2025)"
                        value={configOverride.body.subText}
                        onChange={(e) => updateConfigOverride({ body: { subText: e.target.value } })}
                  />
                    </>
                  )}
 
                  {configOverride.header.mode === 'image' && (
                    <div className="image-config">
                      <input
                        type="text"
                        placeholder="Image URL (https://...) or upload below"
                        value={configOverride.header.imageUrl ?? ''}
                        onChange={(e) => updateConfigOverride({ header: { imageUrl: e.target.value } })}
                        disabled={uploadingImage}
                      />
                      <div className="file-input-row">
                        <label className={`file-upload-btn ${uploadingImage ? 'disabled' : ''}`}>
                          {uploadingImage ? 'Uploading...' : 'Upload Image (WebP)'}
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp, image/*"
                            disabled={uploadingImage}
                            onChange={handleImageUpload}
                          />
                        </label>
                        {configOverride.header.imageUrl && (
                    <button 
                            type="button"
                            className="secondary-btn"
                            onClick={handleRemoveImage}
                            disabled={uploadingImage}
                          >
                            Remove Image
                          </button>
                        )}
                      </div>
                      {uploadImageError && (
                        <div className="error-message" style={{ marginTop: '8px' }}>
                          {uploadImageError}
                        </div>
                      )}
                      {uploadingImage && (
                        <div className="upload-progress" style={{ marginTop: '8px', color: '#666' }}>
                          Converting to WebP and uploading...
                        </div>
                      )}
                    </div>
                  )}

                  <div className="toggle-row">
                    <button 
                      onClick={() => updateConfigOverride({
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
                    <p className="bluetooth-status-text connected-text">Printer Connected Successfully!</p>
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
                    <div className="bluetooth-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px', flexDirection: 'column', width: '100%' }}>
                      <button 
                        onClick={handleDisconnectBluetooth} 
                        className="danger-btn disconnect-btn"
                        style={{ width: '100%' }}
                      >
                        Disconnect Printer
                      </button>
                      <button 
                        onClick={handleTestPrint}
                        disabled={testPrintLoading}
                        className="primary-btn"
                        style={{ width: '100%' }}
                      >
                        {testPrintLoading ? '🔄 Printing Test...' : '🖨️ Print Test'}
                      </button>
                    </div>
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

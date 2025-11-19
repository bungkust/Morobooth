import { useState, useEffect, useCallback, useRef } from 'react';

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
import type { ConfigOverride, ConfigHeader, ConfigBody, HeaderMode, PrinterOutputSettings, QRCodeSettings } from '../services/configService';
import { getConfigOverride, setConfigOverride, getPrinterOutputSettings, setPrinterOutputSettings, resetPrinterOutputSettings, getQRCodeSettings, setQRCodeSettings, resetQRCodeSettings, DEFAULT_QR_SETTINGS } from '../services/configService';
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
  const [testPrintImageLoading, setTestPrintImageLoading] = useState(false);
  const testPrintImageInputRef = useRef<HTMLInputElement>(null);
  const [bundleVersion, setBundleVersion] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // Printer output settings
  const [printerOutputSettings, setPrinterOutputSettingsState] = useState<PrinterOutputSettings>({
    threshold: 165,
    gamma: 1.25,
    dithering: true,
    sharpen: 0.45
  });

  // QR code settings
  const [qrCodeSettings, setQrCodeSettingsState] = useState<QRCodeSettings>({
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
    colorDark: '#000000',
    colorLight: '#FFFFFF'
  });
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string>('');

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
      // Load printer output settings
      const savedSettings = getPrinterOutputSettings();
      setPrinterOutputSettingsState(savedSettings);
      // Load QR code settings
      const savedQrSettings = getQRCodeSettings();
      setQrCodeSettingsState(savedQrSettings);
      // Generate preview QR code
      generateQRPreview(savedQrSettings);
    }
  }, [authenticated, loadData]);

  // Generate QR preview
  const generateQRPreview = async (settings?: QRCodeSettings) => {
    try {
      const currentSettings = settings || qrCodeSettings;
      // Only generate preview if QR is enabled
      if (currentSettings.enabled === false) {
        setQrPreviewUrl('');
        return;
      }
      const { generateQRCodeDataURL } = await import('../utils/qrCodeGenerator');
      const testUrl = 'https://morobooth.com/download/TEST-001';
      const preview = await generateQRCodeDataURL(testUrl, currentSettings);
      setQrPreviewUrl(preview);
    } catch (error) {
      console.error('Failed to generate QR preview:', error);
      setQrPreviewUrl('');
    }
  };

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
        showNotification('All data cleared successfully!', 'success');
      } catch (err) {
        console.error('Error clearing all data:', err);
        setError('Failed to clear all data');
      }
    }
  }

  async function viewSessionPhotos(sessionCode: string) {
    const photos = await getPhotosBySession(sessionCode);
    const uploaded = photos.filter(p => p.uploaded).length;
    showNotification(`Session ${sessionCode}: ${photos.length} total photos, ${uploaded} uploaded, ${photos.length - uploaded} pending`, 'info');
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
        setConfigError('Please upload an image before saving.');
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
      showNotification('Configuration saved successfully!', 'success');
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
        showNotification('Configuration cleared successfully!', 'success');
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
      
      // Mark successful uploads with supabasePath
      let successCount = 0;
      let failCount = 0;
      
      for (const result of results) {
        if (result.success && result.url) {
          try {
            // Save supabasePath if available
            await markPhotoAsUploaded(result.photoId, result.url, result.path);
            successCount++;
          } catch (markError) {
            // Log error but don't break the flow
            console.error(`Failed to mark photo ${result.photoId} as uploaded:`, markError);
            failCount++;
            // Still count as success for upload, but mark failed for notification
          }
        } else {
          failCount++;
        }
      }
      
      setUploadResults(results);
      await loadData(); // Refresh unuploaded list
      
      // Show success notification with count
      if (successCount > 0) {
        showNotification(
          `✓ ${successCount} photos uploaded successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
          failCount > 0 ? 'info' : 'success'
        );
      } else {
        showNotification('All uploads failed. Please check your connection.', 'error');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Upload failed: ' + errorMessage);
      showNotification('Upload failed: ' + errorMessage, 'error');
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
          showNotification('Web Bluetooth is not supported in this browser', 'error');
          return;
        }
        
        const connected = await bluetoothPrinter.connect();
        if (connected) {
          setIsBluetoothConnected(true);
          const info = bluetoothPrinter.getPrinterInfo();
          setPrinterInfo(info);
          showNotification(`Connected to ${info?.name || 'Printer'}`, 'success');
        } else {
          setBluetoothError('Failed to connect to printer');
        }
      }
    } catch (e) {
      let errorMessage = 'Bluetooth connection failed.';
      
      if (e instanceof Error) {
        // Use the error message if it's user-friendly
        if (e.message.includes('permission') || e.message.includes('denied')) {
          errorMessage = e.message;
        } else if (e.message.includes('not found') || e.message.includes('No Bluetooth')) {
          errorMessage = e.message;
        } else if (e.message.includes('NetworkError') || e.message.includes('Failed to connect')) {
          errorMessage = e.message;
        } else {
          errorMessage = 'Bluetooth connection failed: ' + e.message;
        }
      } else {
        errorMessage = 'Bluetooth connection failed. Please try again.';
      }
      
      setBluetoothError(errorMessage);
      showNotification(errorMessage, 'error');
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
      showNotification('Printer not connected. Please connect printer first.', 'error');
      return;
    }

    setTestPrintLoading(true);
    setBluetoothError('');

    try {
      console.log('Test print: Generating Street Coffee receipt...');
      const receiptWidth = printerInfo?.width ?? 384;
      const success = await bluetoothPrinter.printStreetCoffeeReceipt(receiptWidth);
      
      if (success) {
        showNotification('Test print sent successfully! Check your printer for Street Coffee receipt.', 'success');
      } else {
        throw new Error('Print failed');
      }
    } catch (error) {
      console.error('Test print error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setBluetoothError('Test print failed: ' + errorMsg);
      showNotification('Test print failed: ' + errorMsg, 'error');
    } finally {
      setTestPrintLoading(false);
    }
  };

  const handleTestPrintImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    // Reset file input immediately to allow selecting same file again
    if (testPrintImageInputRef.current) {
      testPrintImageInputRef.current.value = '';
    }

    if (!file) return;

    if (!bluetoothPrinter || !isBluetoothConnected) {
      showNotification('Printer not connected. Please connect printer first.', 'error');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showNotification('Please select an image file', 'error');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showNotification('Image too large (max 10MB)', 'error');
      return;
    }

    setTestPrintImageLoading(true);
    setBluetoothError('');

    try {
      // Convert file to dataURL using FileReader
      const imageDataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to read image file'));
          }
        };
        reader.onerror = () => {
          reject(new Error('Failed to read image file'));
        };
        reader.readAsDataURL(file);
      });

      // Get printer width from printer info or use default
      const receiptWidth = printerInfo?.width ?? 384;
      
      console.log('Test print image: Printing uploaded image...');
      const success = await bluetoothPrinter.printImage(imageDataURL, receiptWidth);
      
      if (success) {
        showNotification('Test print sent successfully! Check your printer.', 'success');
      } else {
        throw new Error('Print failed');
      }
    } catch (error) {
      console.error('Test print image error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setBluetoothError('Test print failed: ' + errorMsg);
      showNotification('Test print failed: ' + errorMsg, 'error');
    } finally {
      setTestPrintImageLoading(false);
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
                ← Back
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
          <button onClick={() => window.location.href = '/'} className="back-btn-small">
            ←
          </button>
          <h1>Admin Panel</h1>
          <div style={{ width: '40px' }}></div>
        </div>

        <div className="admin-content">
          {/* Tab Content */}
          {activeTab === 'session' && (
            <div className="tab-content">
              {/* Current Session Card */}
              <div className="admin-card">
                <div className="card-header">
                  <h2>Current Session</h2>
                </div>
                {currentSession ? (
                  <div className="session-info">
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
              <div className="admin-card">
                <div className="card-header">
                  <h2>Create New Session</h2>
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
              <div className="admin-card">
                <div className="card-header">
                  <h2>Upload Photos</h2>
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

              {/* QR Code Settings Section */}
              <div className="admin-card" style={{ marginTop: '20px' }}>
                <div className="card-header">
                  <h2>QR Code Settings</h2>
                </div>
                <div className="qr-settings">
                  <p className="settings-description">
                    Adjust QR code appearance for printed photos. Changes will be applied to all future prints.
                  </p>
                  
                  {/* Enable/Disable QR Code Toggle */}
                  <div className="setting-group" style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '2px solid #e0e0e0' }}>
                    <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={qrCodeSettings.enabled !== false}
                        onChange={(e) => {
                          const newSettings = {
                            ...qrCodeSettings,
                            enabled: e.target.checked
                          };
                          setQrCodeSettingsState(newSettings);
                          if (e.target.checked) {
                            generateQRPreview(newSettings);
                          } else {
                            setQrPreviewUrl('');
                          }
                        }}
                        style={{ width: '24px', height: '24px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '18px', fontWeight: '600' }}>
                        Show QR Code on Print
                      </span>
                    </label>
                    <p className="setting-help" style={{ marginLeft: '36px', marginTop: '4px' }}>
                      {qrCodeSettings.enabled !== false 
                        ? 'QR code will be printed on photos. Users can scan to download their photos.'
                        : 'QR code will NOT be printed. Photos will be printed without QR code.'}
                    </p>
                  </div>
                  
                  {/* Conditional rendering: Only show other settings if QR is enabled */}
                  {qrCodeSettings.enabled !== false && (
                    <>
                  <div className="setting-group">
                    <label className="field-label">
                      Width: {qrCodeSettings.width ?? DEFAULT_QR_SETTINGS.width}px
                      <span className="setting-help">(100-400px, larger = easier to scan)</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="400"
                      step="10"
                      value={qrCodeSettings.width ?? DEFAULT_QR_SETTINGS.width}
                      onChange={(e) => {
                        const newSettings = {
                          ...qrCodeSettings,
                          width: parseInt(e.target.value)
                        };
                        setQrCodeSettingsState(newSettings);
                        generateQRPreview(newSettings);
                      }}
                      className="slider-input"
                    />
                    <div className="slider-labels">
                      <span>Smaller</span>
                      <span>Larger</span>
                    </div>
                  </div>

                  <div className="setting-group">
                    <label className="field-label">
                      Margin: {qrCodeSettings.margin ?? DEFAULT_QR_SETTINGS.margin}
                      <span className="setting-help">(0-4, white border around QR code)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="4"
                      value={qrCodeSettings.margin ?? DEFAULT_QR_SETTINGS.margin}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value >= 0 && value <= 4) {
                          const newSettings = {
                            ...qrCodeSettings,
                            margin: value
                          };
                          setQrCodeSettingsState(newSettings);
                          generateQRPreview(newSettings);
                        }
                      }}
                      className="number-input"
                      style={{ width: '100px', padding: '8px', fontSize: '16px' }}
                    />
                  </div>

                  <div className="setting-group">
                    <label className="field-label">
                      Error Correction Level
                      <span className="setting-help">(Higher = more damage tolerance, but larger QR code)</span>
                    </label>
                    <select
                      value={qrCodeSettings.errorCorrectionLevel ?? DEFAULT_QR_SETTINGS.errorCorrectionLevel}
                      onChange={(e) => {
                        const newSettings = {
                          ...qrCodeSettings,
                          errorCorrectionLevel: e.target.value as 'L' | 'M' | 'Q' | 'H'
                        };
                        setQrCodeSettingsState(newSettings);
                        generateQRPreview(newSettings);
                      }}
                      className="select-input"
                      style={{ width: '100%', padding: '8px', fontSize: '16px' }}
                    >
                      <option value="L">L - Low (~7% damage tolerance)</option>
                      <option value="M">M - Medium (~15% damage tolerance) - Recommended</option>
                      <option value="Q">Q - Quartile (~25% damage tolerance)</option>
                      <option value="H">H - High (~30% damage tolerance)</option>
                    </select>
                  </div>

                  <div className="setting-group">
                    <label className="field-label">
                      Dark Color (QR Code)
                    </label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={qrCodeSettings.colorDark ?? DEFAULT_QR_SETTINGS.colorDark}
                        onChange={(e) => {
                          const newSettings = {
                            ...qrCodeSettings,
                            colorDark: e.target.value
                          };
                          setQrCodeSettingsState(newSettings);
                          generateQRPreview(newSettings);
                        }}
                        style={{ width: '60px', height: '40px', cursor: 'pointer' }}
                      />
                      <span>{qrCodeSettings.colorDark ?? DEFAULT_QR_SETTINGS.colorDark}</span>
                    </div>
                  </div>

                  <div className="setting-group">
                    <label className="field-label">
                      Light Color (Background)
                    </label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={qrCodeSettings.colorLight ?? DEFAULT_QR_SETTINGS.colorLight}
                        onChange={(e) => {
                          const newSettings = {
                            ...qrCodeSettings,
                            colorLight: e.target.value
                          };
                          setQrCodeSettingsState(newSettings);
                          generateQRPreview(newSettings);
                        }}
                        style={{ width: '60px', height: '40px', cursor: 'pointer' }}
                      />
                      <span>{qrCodeSettings.colorLight ?? DEFAULT_QR_SETTINGS.colorLight}</span>
                    </div>
                  </div>

                  {/* QR Preview */}
                  {(qrCodeSettings.enabled ?? true) && qrPreviewUrl && (
                    <div className="qr-preview-container" style={{ marginTop: '20px', padding: '16px', background: '#f8f9fa', border: '2px solid var(--c-black)', borderRadius: '8px' }}>
                      <h3 style={{ marginTop: '0', marginBottom: '12px', fontSize: '16px' }}>Preview</h3>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <img 
                          src={qrPreviewUrl} 
                          alt="QR Code Preview" 
                          style={{ 
                            maxWidth: '200px', 
                            height: 'auto',
                            border: '1px solid #ddd',
                            borderRadius: '4px'
                          }} 
                        />
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
                            This is how your QR code will look on printed photos.
                          </p>
                          <p style={{ margin: '0', fontSize: '12px', color: '#999' }}>
                            Test URL: https://morobooth.com/download/TEST-001
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                    </>
                  )}

                  <div className="qr-settings-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => {
                        try {
                          setQRCodeSettings(qrCodeSettings);
                          const saved = getQRCodeSettings();
                          console.log('QR settings saved successfully:', saved);
                          showNotification('QR code settings saved! Changes will apply to next print.', 'success');
                          generateQRPreview(qrCodeSettings);
                        } catch (error) {
                          console.error('Failed to save QR settings:', error);
                          showNotification('Failed to save QR settings. Please try again.', 'error');
                        }
                      }}
                      className="primary-btn"
                    >
                      Save Settings
                    </button>
                    <button
                      onClick={() => {
                        const defaults = { ...DEFAULT_QR_SETTINGS };
                        setQrCodeSettingsState(defaults);
                        resetQRCodeSettings();
                        generateQRPreview(defaults);
                        showNotification('QR settings reset to defaults', 'info');
                      }}
                      className="secondary-btn"
                    >
                      Reset to Defaults
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="tab-content">
              <div className="admin-card">
                <div className="card-header">
                  <h2>Custom Text</h2>
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
              <div className="admin-card">
                <div className="card-header">
                  <h2>Session History</h2>
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
              <div className="admin-card">
                <div className="card-header">
                  <h2>Bluetooth Printer</h2>
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
                    <div className="bluetooth-actions">
                      <button 
                        onClick={handleDisconnectBluetooth} 
                        className="danger-btn"
                      >
                        Disconnect Printer
                      </button>
                      <button 
                        onClick={handleTestPrint}
                        disabled={testPrintLoading}
                        className="primary-btn"
                      >
                        {testPrintLoading ? '🔄 Printing Test...' : '🖨️ Print Test'}
                      </button>
                      <button 
                        onClick={() => testPrintImageInputRef.current?.click()}
                        disabled={testPrintImageLoading || !isBluetoothConnected}
                        className="primary-btn"
                      >
                        {testPrintImageLoading ? '🔄 Printing...' : '📷 Print Custom Image'}
                      </button>
                      <input
                        ref={testPrintImageInputRef}
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp, image/*"
                        onChange={handleTestPrintImage}
                        style={{ display: 'none' }}
                      />
                    </div>
                  </div>
                )}
                {bundleVersion && (
                  <div className="bundle-version-container">
                    <span className="bundle-version">
                      Bundle: {bundleVersion}
                    </span>
                  </div>
                )}
              </div>

              {/* Printer Output Settings Section */}
              <div className="admin-card" style={{ marginTop: '20px' }}>
                <div className="card-header">
                  <h2>Adjust Printer Output</h2>
                </div>
                <div className="printer-output-settings">
                  <p className="settings-description">
                    Adjust these settings to fine-tune the print quality. Changes will be applied to all future prints.
                  </p>
                  
                  <div className="setting-group">
                    <label className="field-label">
                      Threshold: {printerOutputSettings.threshold}
                      <span className="setting-help">(0-255, higher = darker)</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={printerOutputSettings.threshold ?? 165}
                      onChange={(e) => setPrinterOutputSettingsState({
                        ...printerOutputSettings,
                        threshold: parseInt(e.target.value)
                      })}
                      className="slider-input"
                    />
                    <div className="slider-labels">
                      <span>Lighter</span>
                      <span>Darker</span>
                    </div>
                  </div>

                  <div className="setting-group">
                    <label className="field-label">
                      Gamma: {printerOutputSettings.gamma?.toFixed(2)}
                      <span className="setting-help">(≥1, higher = darker mid-tones)</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                      value={printerOutputSettings.gamma ?? 1.25}
                      onChange={(e) => setPrinterOutputSettingsState({
                        ...printerOutputSettings,
                        gamma: parseFloat(e.target.value)
                      })}
                      className="slider-input"
                    />
                    <div className="slider-labels">
                      <span>Lighter</span>
                      <span>Darker</span>
                    </div>
                  </div>

                  <div className="setting-group">
                    <label className="field-label">
                      Sharpen: {printerOutputSettings.sharpen?.toFixed(2)}
                      <span className="setting-help">(0-1, higher = sharper edges)</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={printerOutputSettings.sharpen ?? 0.45}
                      onChange={(e) => setPrinterOutputSettingsState({
                        ...printerOutputSettings,
                        sharpen: parseFloat(e.target.value)
                      })}
                      className="slider-input"
                    />
                    <div className="slider-labels">
                      <span>Softer</span>
                      <span>Sharper</span>
                    </div>
                  </div>

                  <div className="setting-group">
                    <label className="field-label toggle-label">
                      <span>Enable Dithering</span>
                      <span className="setting-help">(Error-diffusion for smoother gradients)</span>
                      <div 
                        className={`toggle-switch ${printerOutputSettings.dithering ?? true ? 'active' : ''}`}
                        onClick={() => setPrinterOutputSettingsState({
                          ...printerOutputSettings,
                          dithering: !(printerOutputSettings.dithering ?? true)
                        })}
                      >
                        <div className="toggle-slider"></div>
                      </div>
                    </label>
                  </div>

                  {/* Visual Separator */}
                  <div className="settings-separator"></div>

                  {/* Capture Stage Filters */}
                  <div className="filter-section">
                    <h3>Capture Stage Filters</h3>
                    <div className="setting-group">
                      <label className="field-label toggle-label">
                        <span>Enable Grayscale</span>
                        <span className="setting-help">(Convert captured photos to grayscale)</span>
                        <div 
                          className={`toggle-switch ${printerOutputSettings.captureGrayscale !== false ? 'active' : ''}`}
                          onClick={() => setPrinterOutputSettingsState({
                            ...printerOutputSettings,
                            captureGrayscale: !(printerOutputSettings.captureGrayscale !== false)
                          })}
                        >
                          <div className="toggle-slider"></div>
                        </div>
                      </label>
                      <p className="setting-help note-text">
                        Note: Changes apply to new captures only. Already captured photos won't be affected.
                      </p>
                    </div>
                  </div>

                  {/* Visual Separator */}
                  <div className="settings-separator"></div>

                  {/* Preview Stage Filters */}
                  <div className="filter-section">
                    <h3>Preview Stage Filters</h3>
                    <div className="setting-group">
                      <label className="field-label toggle-label">
                        <span>Enable Grayscale</span>
                        <span className="setting-help">(Convert preview to grayscale)</span>
                        <div 
                          className={`toggle-switch ${printerOutputSettings.previewGrayscale !== false ? 'active' : ''}`}
                          onClick={() => setPrinterOutputSettingsState({
                            ...printerOutputSettings,
                            previewGrayscale: !(printerOutputSettings.previewGrayscale !== false)
                          })}
                        >
                          <div className="toggle-slider"></div>
                        </div>
                      </label>
                    </div>
                    <div className="setting-group">
                      <label className="field-label toggle-label">
                        <span>Enable Ordered Dither</span>
                        <span className="setting-help">(Bayer dithering for preview)</span>
                        <div 
                          className={`toggle-switch ${printerOutputSettings.previewDither !== false ? 'active' : ''}`}
                          onClick={() => setPrinterOutputSettingsState({
                            ...printerOutputSettings,
                            previewDither: !(printerOutputSettings.previewDither !== false)
                          })}
                        >
                          <div className="toggle-slider"></div>
                        </div>
                      </label>
                      <p className="setting-help note-text">
                        Preview dither runs every 2 frames for performance. Changes apply immediately.
                      </p>
                    </div>
                  </div>

                  {/* Visual Separator */}
                  <div className="settings-separator"></div>

                  {/* Composition Stage Filters */}
                  <div className="filter-section">
                    <h3>Composition Stage Filters</h3>
                    <div className="setting-group">
                      <label className="field-label toggle-label">
                        <span>Enable Floyd-Steinberg Dither</span>
                        <span className="setting-help">(High-quality dithering for final composition)</span>
                        <div 
                          className={`toggle-switch ${printerOutputSettings.compositionDither !== false ? 'active' : ''}`}
                          onClick={() => setPrinterOutputSettingsState({
                            ...printerOutputSettings,
                            compositionDither: !(printerOutputSettings.compositionDither !== false)
                          })}
                        >
                          <div className="toggle-slider"></div>
                        </div>
                      </label>
                    </div>
                    {printerOutputSettings.compositionDither !== false && (
                      <div className="setting-group">
                        <label className="field-label">
                          Dither Threshold: {printerOutputSettings.compositionDitherThreshold ?? 128}
                          <span className="setting-help">(0-255, lower = more black, higher = more white)</span>
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="255"
                          step="1"
                          value={printerOutputSettings.compositionDitherThreshold ?? 128}
                          onChange={(e) => {
                            const value = Math.max(0, Math.min(255, parseInt(e.target.value) || 128));
                            setPrinterOutputSettingsState({
                              ...printerOutputSettings,
                              compositionDitherThreshold: value
                            });
                          }}
                          className="slider-input"
                        />
                        <div className="slider-labels">
                          <span>More Black</span>
                          <span>More White</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Visual Separator */}
                  <div className="settings-separator"></div>

                  {/* Print Stage Filters Header */}
                  <h3 className="filter-section-title">Print Stage Filters</h3>

                  <div className="printer-output-actions">
                    <button
                      onClick={() => {
                        try {
                          setPrinterOutputSettings(printerOutputSettings);
                          // Verify the settings were saved
                          const saved = getPrinterOutputSettings();
                          console.log('Settings saved successfully:', saved);
                          showNotification('Printer output settings saved! Changes will apply to next print.', 'success');
                        } catch (error) {
                          console.error('Failed to save settings:', error);
                          showNotification('Failed to save settings. Please try again.', 'error');
                        }
                      }}
                      className="primary-btn"
                    >
                      Save Settings
                    </button>
                    <button
                      onClick={() => {
                        const defaults = {
                          threshold: 165,
                          gamma: 1.25,
                          dithering: true,
                          sharpen: 0.45,
                          captureGrayscale: true,
                          previewGrayscale: true,
                          previewDither: true,
                          compositionDither: true,
                          compositionDitherThreshold: 128
                        };
                        setPrinterOutputSettingsState(defaults);
                        resetPrinterOutputSettings();
                        showNotification('Settings reset to defaults', 'info');
                      }}
                      className="secondary-btn"
                    >
                      Reset to Defaults
                    </button>
                  </div>
                </div>
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

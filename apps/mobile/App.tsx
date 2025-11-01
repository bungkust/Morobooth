import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Alert, PermissionsAndroid, Platform, BackHandler, Text, ActivityIndicator, Modal, TouchableOpacity, Clipboard, ScrollView } from 'react-native';
import WebView from 'react-native-webview';
import * as Linking from 'expo-linking';
import * as KeepAwake from 'expo-keep-awake';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';
import { NativeBLEPrinter, PrinterDevice } from './services/NativeBLEPrinter';
import { PrinterSelectionModal } from './components/PrinterSelectionModal';
import { PrinterStorage } from './services/PrinterStorage';

const WEBVIEW_URL = Constants.expoConfig?.extra?.webviewUrl || 'https://morobooth.netlify.app';

// Initialize Sentry
if (Constants.expoConfig?.extra?.sentryDsn) {
  Sentry.init({
    dsn: Constants.expoConfig.extra.sentryDsn,
    enableInExpoDevelopment: false,
    debug: __DEV__,
  });
}

function App() {
  const webViewRef = useRef<WebView>(null);
  const [printer] = useState(new NativeBLEPrinter());
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(WEBVIEW_URL);
  const [isOnline, setIsOnline] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<{ message: string; stack?: string } | null>(null);

  useEffect(() => {
    initializeApp();
    setupDeepLinking();
    setupBackHandler();
    
    // Keep screen awake during photo sessions
    KeepAwake.activateKeepAwake();
    
    return () => {
      printer.cleanup();
      KeepAwake.deactivateKeepAwake();
    };
  }, []);

  const initializeApp = async () => {
    try {
      await printer.init();
      await requestAllPermissions();
      await autoConnectLastPrinter();
      
      // Network monitoring
      const unsubscribe = NetInfo.addEventListener(state => {
        setIsOnline(state.isConnected ?? false);
      });
      
      return unsubscribe;
    } catch (error) {
      Sentry.captureException(error);
      console.error('Init error:', error);
    }
  };

  const setupDeepLinking = () => {
    // Handle initial URL
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url);
    });
    
    // Handle subsequent URLs
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });
    
    return () => subscription.remove();
  };

  const handleDeepLink = (url: string) => {
    // morobooth://download/photo123 or https://domain.com/download/photo123
    const parsed = Linking.parse(url);
    
    if (parsed.path?.startsWith('download')) {
      const photoId = parsed.queryParams?.id || parsed.path.split('/')[1];
      if (photoId) {
        const downloadUrl = `${WEBVIEW_URL}/download/${photoId}`;
        setCurrentUrl(downloadUrl);
      }
    }
  };

  const setupBackHandler = () => {
    const backAction = () => {
      // Let WebView handle back navigation first
      webViewRef.current?.goBack();
      return true;
    };
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  };

  const requestAllPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.CAMERA,
        ];
        
        if (Platform.Version >= 33) {
          permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
        
        await PermissionsAndroid.requestMultiple(permissions);
      } catch (err) {
        Sentry.captureException(err);
        console.error('Permission error:', err);
      }
    }
  };

  const autoConnectLastPrinter = async () => {
    try {
      const lastPrinter = await PrinterStorage.getLastPrinter();
      if (lastPrinter) {
        const connected = await printer.connect(lastPrinter.id);
        if (connected) {
          setConnectedDevice(lastPrinter);
          sendMessageToWebView({
            type: 'BLUETOOTH_CONNECTED',
            data: { connected: true, device: lastPrinter }
          });
        } else {
          // Couldn't reconnect, clear saved printer
          await PrinterStorage.clearLastPrinter();
        }
      }
    } catch (error) {
      console.error('Auto-connect error:', error);
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      switch (message.type) {
        case 'SCAN_BLUETOOTH_PRINTERS':
          console.log('App: SCAN_BLUETOOTH_PRINTERS received, opening modal');
          setShowPrinterModal(true);
          break;
          
        case 'CONNECT_BLUETOOTH_PRINTER':
          if (message.data?.deviceId) {
            await handleConnectPrinter(message.data.deviceId);
          } else {
            setShowPrinterModal(true);
          }
          break;
          
        case 'DISCONNECT_BLUETOOTH_PRINTER':
          await handleDisconnectPrinter();
          break;
          
        case 'PRINT_DITHERED_BITMAP':
          await handlePrintBitmap(
            message.data.bitmapBase64,
            message.data.width,
            message.data.height
          );
          break;
          
        case 'LOG_ERROR':
          Sentry.captureMessage(message.data.error, {
            level: 'error',
            extra: message.data.context
          });
          break;
          
        default:
          console.log('Unknown message:', message.type);
      }
    } catch (error) {
      Sentry.captureException(error);
      console.error('Message handling error:', error);
      sendMessageToWebView({
        type: 'BLUETOOTH_ERROR',
        data: { error: String(error) }
      });
    }
  };

  const handleSelectPrinter = async (device: PrinterDevice) => {
    await handleConnectPrinter(device.id);
  };

  const handleConnectPrinter = async (deviceId: string) => {
    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      console.log('App: Attempting to connect to printer:', deviceId);
      await printer.connect(deviceId);
      
      // If we get here without an error being thrown, connection succeeded
      const device: PrinterDevice = { id: deviceId, name: 'Printer' };
      setConnectedDevice(device);
      
      // Save for auto-reconnect
      await PrinterStorage.saveLastPrinter(device);
      
      sendMessageToWebView({
        type: 'BLUETOOTH_CONNECTED',
        data: { connected: true, device }
      });
      
      setIsConnecting(false);
      Alert.alert('Success', 'Printer connected!');
    } catch (error) {
      console.error('App: Connection error:', error);
      Sentry.captureException(error);
      
      const errorMsg = error instanceof Error ? error.message : 'Failed to connect to printer';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Set error state for detailed popup
      setConnectionError({
        message: errorMsg,
        stack: errorStack
      });
      
      sendMessageToWebView({
        type: 'BLUETOOTH_ERROR',
        data: { error: errorMsg, stack: errorStack }
      });
      
      setIsConnecting(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    await printer.disconnect();
    await PrinterStorage.clearLastPrinter();
    setConnectedDevice(null);
    sendMessageToWebView({
      type: 'BLUETOOTH_DISCONNECTED',
      data: { connected: false }
    });
  };

  const handlePrintBitmap = async (
    bitmapBase64: string,
    width: number,
    height: number
  ) => {
    try {
      if (!connectedDevice) {
        throw new Error('No printer connected');
      }
      
      // Show progress
      sendMessageToWebView({
        type: 'PRINT_PROGRESS',
        data: { status: 'printing', progress: 50 }
      });
      
      const success = await printer.printDitheredBitmap(bitmapBase64, width, height);
      
      sendMessageToWebView({
        type: success ? 'PRINT_SUCCESS' : 'PRINT_FAILED',
        data: { success, progress: 100 }
      });
      
      if (success) {
        Alert.alert('Success', 'Photo printed!');
      } else {
        throw new Error('Print failed');
      }
    } catch (error) {
      Sentry.captureException(error);
      sendMessageToWebView({
        type: 'BLUETOOTH_ERROR',
        data: { error: String(error), errorCode: 'PRINT_ERROR' }
      });
      Alert.alert('Print Error', String(error));
    }
  };

  const sendMessageToWebView = (message: any) => {
    webViewRef.current?.postMessage(JSON.stringify(message));
  };

  const injectedJavaScript = `
    window.isNativeApp = true;
    window.hasNativeBluetooth = true;
    window.appVersion = '${Constants.expoConfig?.version}';
    true;
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        mediaCapturePermissionGrantType="grant"
        injectedJavaScript={injectedJavaScript}
        onNavigationStateChange={(navState) => {
          setCurrentUrl(navState.url);
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          Sentry.captureMessage('WebView error', {
            extra: { error: nativeEvent }
          });
        }}
        style={styles.webview}
      />
      
      <PrinterSelectionModal
        isVisible={showPrinterModal}
        onClose={() => setShowPrinterModal(false)}
        onSelectPrinter={handleSelectPrinter}
        printer={printer}
      />
      
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>No Internet Connection</Text>
        </View>
      )}
      
      {/* Connection Loading Modal */}
      <Modal
        visible={isConnecting}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text style={styles.loadingText}>Connecting to printer...</Text>
            <Text style={styles.loadingSubtext}>This may take up to 10 seconds</Text>
          </View>
        </View>
      </Modal>
      
      {/* Error Modal with Stack Trace */}
      <Modal
        visible={!!connectionError}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.errorOverlay}>
          <View style={styles.errorModal}>
            <Text style={styles.errorTitle}>Connection Failed</Text>
            <Text style={styles.errorMessage}>{connectionError?.message}</Text>
            
            {connectionError?.stack && (
              <ScrollView style={styles.stackContainer}>
                <Text style={styles.stackLabel}>Stack Trace (for debugging):</Text>
                <Text style={styles.stackText} selectable={true}>
                  {connectionError.stack}
                </Text>
              </ScrollView>
            )}
            
            <View style={styles.errorButtons}>
              <TouchableOpacity 
                style={styles.copyButton}
                onPress={async () => {
                  const errorText = `${connectionError?.message}\n\nStack:\n${connectionError?.stack || 'No stack trace'}`;
                  Clipboard.setString(errorText);
                  Alert.alert('Copied', 'Error details copied to clipboard');
                }}
              >
                <Text style={styles.copyButtonText}>?? Copy Error</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.closeErrorButton}
                onPress={() => setConnectionError(null)}
              >
                <Text style={styles.closeErrorButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  offlineBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#dc3545',
    padding: 10,
    alignItems: 'center',
  },
  offlineText: {
    color: 'white',
    fontWeight: 'bold',
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 30,
    alignItems: 'center',
    minWidth: 250,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  loadingSubtext: {
    marginTop: 5,
    fontSize: 12,
    color: '#666',
  },
  errorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorModal: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    maxWidth: '90%',
    maxHeight: '80%',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    color: '#333',
    marginBottom: 15,
  },
  stackContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    maxHeight: 300,
  },
  stackLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
  },
  stackText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#333',
  },
  errorButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  copyButton: {
    flex: 1,
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  copyButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  closeErrorButton: {
    flex: 1,
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  closeErrorButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});




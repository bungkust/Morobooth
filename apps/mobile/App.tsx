import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Alert, PermissionsAndroid, Platform, BackHandler, Text, ToastAndroid, TouchableOpacity } from 'react-native';
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

  // Debug: Monitor modal state changes
  useEffect(() => {
    console.log('App: showPrinterModal state changed to:', showPrinterModal);
  }, [showPrinterModal]);

  const initializeApp = async () => {
    try {
      await printer.init();
      
      // Request permissions on startup
      const permissionGranted = await requestAllPermissions();
      
      // Only auto-connect if we have permissions
      if (permissionGranted) {
        await autoConnectLastPrinter();
      }
      
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

  const requestAllPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        // Show explanation first
        return await new Promise((resolve) => {
          Alert.alert(
            '??? Bluetooth Permission Required',
            'Morobooth needs Bluetooth permission to connect to your thermal printer.\n\nWithout this permission, you cannot print photos.',
            [
              {
                text: 'Grant Permission',
                onPress: async () => {
                  const permissions = [
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                  ];
                  
                  // Bluetooth permissions added in Android 12 (API 31+)
                  if (Platform.Version >= 31) {
                    permissions.push(
                      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
                    );
                  }
                  
                  if (Platform.Version >= 33) {
                    permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                  }
                  
                  const results = await PermissionsAndroid.requestMultiple(permissions);
                  
                  // Check if Bluetooth permissions are granted
                  // Android 12+ needs explicit BLUETOOTH_SCAN and BLUETOOTH_CONNECT
                  // Android 11 and below: no runtime permissions needed for Bluetooth
                  let bluetoothGranted = true;
                  if (Platform.Version >= 31) {
                    bluetoothGranted = 
                      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
                      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
                  } else {
                    // Android 11-: no runtime Bluetooth permissions required
                    console.log('Android 11 detected: Bluetooth permissions not required');
                  }
                  
                  if (!bluetoothGranted) {
                    Alert.alert(
                      '?? Permission Denied',
                      'Bluetooth permission is required to use the printer feature. You will be asked again when you try to connect to a printer.',
                      [{ text: 'OK' }]
                    );
                  }
                  
                  resolve(bluetoothGranted);
                }
              }
            ]
          );
        });
      } catch (err) {
        Sentry.captureException(err);
        console.error('Permission error:', err);
        return false;
      }
    }
    return true;
  };

  const autoConnectLastPrinter = async () => {
    try {
      const lastPrinter = await PrinterStorage.getLastPrinter();
      if (lastPrinter) {
        console.log('App: Auto-connecting to last printer:', lastPrinter.name);
        
        // Show toast to user
        if (Platform.OS === 'android') {
          ToastAndroid.show('Reconnecting to printer...', ToastAndroid.SHORT);
        }
        
        try {
          await printer.connect(lastPrinter.id);
          
          // Successfully reconnected
          setConnectedDevice(lastPrinter);
          console.log('App: Auto-connect successful');
          
          // Notify WebView
          sendMessageToWebView({
            type: 'BLUETOOTH_CONNECTED',
            data: { connected: true, device: lastPrinter, autoConnected: true }
          });
          
          // Show success toast
          if (Platform.OS === 'android') {
            ToastAndroid.show(`Connected to ${lastPrinter.name}`, ToastAndroid.SHORT);
          }
        } catch (error) {
          // Couldn't reconnect, clear saved printer
          console.log('App: Auto-connect failed, clearing saved printer');
          await PrinterStorage.clearLastPrinter();
          
          // Notify WebView that no printer is connected
          sendMessageToWebView({
            type: 'BLUETOOTH_DISCONNECTED',
            data: { connected: false, reason: 'auto-connect-failed' }
          });
          
          // Don't show error toast - will ask user to connect when they try to print
        }
      } else {
        // No saved printer
        console.log('App: No saved printer found');
        sendMessageToWebView({
          type: 'BLUETOOTH_DISCONNECTED',
          data: { connected: false, reason: 'no-saved-printer' }
        });
      }
    } catch (error) {
      console.error('Auto-connect error:', error);
      Sentry.captureException(error);
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      console.log('App: WebView message received, raw data:', event.nativeEvent.data);
      const message = JSON.parse(event.nativeEvent.data);
      console.log('App: Parsed message:', message.type, message);
      
      switch (message.type) {
        case 'GET_PRINTER_STATUS':
          // WebView asking for current printer status
          console.log('App: GET_PRINTER_STATUS received');
          sendMessageToWebView({
            type: connectedDevice ? 'BLUETOOTH_CONNECTED' : 'BLUETOOTH_DISCONNECTED',
            data: connectedDevice 
              ? { connected: true, device: connectedDevice }
              : { connected: false }
          });
          break;
          
        case 'SCAN_BLUETOOTH_PRINTERS':
          console.log('App: SCAN_BLUETOOTH_PRINTERS received, checking permissions...');
          try {
            await checkPermissionAndOpenModal();
            console.log('App: checkPermissionAndOpenModal completed for SCAN_BLUETOOTH_PRINTERS');
          } catch (error) {
            console.error('App: Error in checkPermissionAndOpenModal for SCAN:', error);
          }
          break;
          
        case 'CONNECT_BLUETOOTH_PRINTER':
          // Check permission before showing modal
          console.log('App: ========== CONNECT_BLUETOOTH_PRINTER RECEIVED ==========');
          console.log('App: About to call checkPermissionAndOpenModal()');
          try {
            const result = await checkPermissionAndOpenModal();
            console.log('App: checkPermissionAndOpenModal completed, result:', result);
            console.log('App: Current showPrinterModal state after function call');
          } catch (error) {
            console.error('App: ERROR in checkPermissionAndOpenModal for CONNECT:', error);
            console.error('App: Error stack:', error instanceof Error ? error.stack : 'No stack');
          }
          break;
          
        case 'DISCONNECT_BLUETOOTH_PRINTER':
          await handleDisconnectPrinter();
          break;
          
        case 'PRINT_DITHERED_BITMAP':
          // Check if already connected
          if (!connectedDevice) {
            console.log('App: Print requested but no printer connected, opening modal...');
            // Show modal to connect first
            await checkPermissionAndOpenModal();
            // Don't print yet - user needs to connect first
            sendMessageToWebView({
              type: 'PRINT_FAILED',
              data: { 
                success: false, 
                error: 'No printer connected. Please connect to a printer first.',
                needsConnection: true
              }
            });
          } else {
            // Printer already connected, print directly
            console.log('App: Printer connected, printing directly...');
            await handlePrintBitmap(
              message.data.bitmapBase64,
              message.data.width,
              message.data.height
            );
          }
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

  const checkPermissionAndOpenModal = async () => {
    console.log('App: checkPermissionAndOpenModal called');
    
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      // Android 12+: Check if Bluetooth permissions are already granted
      const scanGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      const connectGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      
      console.log('App: Permission check - scanGranted:', scanGranted, 'connectGranted:', connectGranted);
      
      if (!scanGranted || !connectGranted) {
        // Permission not granted, request it
        console.log('App: Bluetooth permission not granted, requesting...');
        
        return await new Promise<void>((resolve) => {
          Alert.alert(
            '??? Bluetooth Permission Required',
            'Morobooth needs Bluetooth permission to connect to your thermal printer.',
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => {
                  console.log('App: User cancelled permission request');
                  resolve();
                }
              },
              {
                text: 'Grant Permission',
                onPress: async () => {
                  try {
                    const results = await PermissionsAndroid.requestMultiple([
                      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    ]);
                    
                    console.log('App: Permission request results:', results);
                    
                    const bluetoothGranted = 
                      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
                      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
                    
                    if (bluetoothGranted) {
                      console.log('App: Permission granted, opening modal');
                      // Wait a bit for Alert to dismiss completely before showing modal
                      setTimeout(() => {
                        console.log('App: Setting showPrinterModal to true after Alert dismiss');
                        setShowPrinterModal(true);
                        // Force re-render check
                        setTimeout(() => {
                          console.log('App: Verifying modal state - should be true now');
                        }, 100);
                      }, 500);
                    } else {
                      console.log('App: Permission not granted after request');
                      Alert.alert(
                        '?? Permission Required',
                        'Bluetooth permission is required to connect to the printer. Please grant the permission to continue.',
                        [
                          {
                            text: 'Try Again',
                            onPress: () => checkPermissionAndOpenModal()
                          },
                          {
                            text: 'Cancel',
                            style: 'cancel'
                          }
                        ]
                      );
                    }
                  } catch (error) {
                    console.error('App: Error requesting permissions:', error);
                  }
                  resolve();
                }
              }
            ]
          );
        });
      }
    }
    
    // Permission already granted or not Android, open modal
    console.log('App: Permission already granted or not Android, opening modal');
    console.log('App: Current showPrinterModal before update:', showPrinterModal);
    
    // Set state and verify
    setShowPrinterModal(true);
    console.log('App: setShowPrinterModal(true) called');
    
    // Force verification after state update
    setTimeout(() => {
      console.log('App: Post-state-update check - modal should be visible now');
    }, 50);
  };

  const handleSelectPrinter = async (device: PrinterDevice) => {
    console.log('App: handleSelectPrinter called for:', device.name);
    
    try {
      // This will throw error if connection fails
      await printer.connect(device.id);
      
      // Connection succeeded
      setConnectedDevice(device);
      await PrinterStorage.saveLastPrinter(device);
      
      sendMessageToWebView({
        type: 'BLUETOOTH_CONNECTED',
        data: { connected: true, device }
      });
      
      // Show success toast
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Printer ready: ${device.name}`, ToastAndroid.SHORT);
      }
      
      console.log('App: Printer connected successfully');
    } catch (error) {
      console.error('App: Connection error:', error);
      Sentry.captureException(error);
      
      // Re-throw so modal can handle it
      throw error;
    }
  };

  const handleDisconnectPrinter = async () => {
    const deviceName = connectedDevice?.name || 'Printer';
    
    await printer.disconnect();
    await PrinterStorage.clearLastPrinter();
    setConnectedDevice(null);
    
    sendMessageToWebView({
      type: 'BLUETOOTH_DISCONNECTED',
      data: { connected: false, reason: 'user-disconnected' }
    });
    
    // Show toast
    if (Platform.OS === 'android') {
      ToastAndroid.show(`Disconnected from ${deviceName}`, ToastAndroid.SHORT);
    }
    
    console.log('App: Printer disconnected');
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
      
      {__DEV__ && (
        <View style={{ position: 'absolute', top: 50, right: 10, zIndex: 9999 }}>
          <TouchableOpacity
            onPress={() => {
              console.log('DEBUG: Test button pressed, opening modal');
              setShowPrinterModal(true);
            }}
            style={{ backgroundColor: 'red', padding: 10, borderRadius: 5 }}
          >
            <Text style={{ color: 'white' }}>TEST MODAL</Text>
          </TouchableOpacity>
        </View>
      )}
      <PrinterSelectionModal
        isVisible={showPrinterModal}
        onClose={() => {
          console.log('App: Modal onClose called');
          setShowPrinterModal(false);
        }}
        onSelectPrinter={handleSelectPrinter}
        onDisconnect={handleDisconnectPrinter}
        printer={printer}
        connectedDevice={connectedDevice}
      />
      
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>No Internet Connection</Text>
        </View>
      )}
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
});




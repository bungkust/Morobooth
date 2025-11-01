import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Clipboard, Alert, ScrollView } from 'react-native';
import Modal from 'react-native-modal';
import { NativeBLEPrinter, PrinterDevice } from '../services/NativeBLEPrinter';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onSelectPrinter: (device: PrinterDevice) => void;
  onDisconnect: () => void;
  printer: NativeBLEPrinter;
  connectedDevice: PrinterDevice | null;
}

interface ErrorDetail {
  message: string;
  stack?: string;
  fullError?: string;
}

type ModalState = 
  | 'scanning' 
  | 'device-list' 
  | 'connecting' 
  | 'connected' 
  | 'error';

export const PrinterSelectionModal: React.FC<Props> = ({ 
  isVisible, 
  onClose, 
  onSelectPrinter, 
  onDisconnect,
  printer, 
  connectedDevice 
}) => {
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [state, setState] = useState<ModalState>('scanning');
  const [error, setError] = useState<ErrorDetail | null>(null);
  const [connectingDevice, setConnectingDevice] = useState<PrinterDevice | null>(null);

  useEffect(() => {
    if (isVisible) {
      // Check if already connected
      if (connectedDevice) {
        setState('connected');
        setError(null);
      } else {
        // Reset state and start scanning
        setDevices([]);
        setError(null);
        setState('scanning');
        handleScan();
      }
    }
  }, [isVisible, connectedDevice]);

  const handleScan = async () => {
    console.log('Modal: Starting scan...');
    setState('scanning');
    setError(null);
    
    try {
      console.log('Modal: Requesting permissions...');
      const hasPermission = await printer.requestPermissions();
      
      if (!hasPermission) {
        const errorMsg = 'Bluetooth permissions required';
        console.log('Modal: Permissions not granted');
        setError({
          message: errorMsg,
          fullError: `❌ Permission Error\n\n${errorMsg}\n\n✅ How to fix:\n1. Open Android Settings\n2. Go to Apps → Morobooth\n3. Tap Permissions\n4. Enable Bluetooth and Location\n5. Come back and tap Retry`
        });
        setState('error');
        return;
      }
      
      console.log('Modal: Permissions granted, scanning devices...');
      const foundDevices = await printer.scanDevices();
      console.log('Modal: Scan complete. Found devices:', foundDevices.length);
      
      if (foundDevices.length === 0) {
        setError({
          message: 'No paired Bluetooth devices found',
          fullError: `❌ No Paired Devices\n\nNo Bluetooth devices are paired to this phone.\n\n✅ How to pair your printer:\n1. Turn on your thermal printer\n2. Open Android Settings\n3. Go to Bluetooth\n4. Tap "Pair new device"\n5. Select your printer (usually named "BlueTooth Printer" or similar)\n6. Come back here and tap Retry`
        });
        setState('error');
      } else {
        setError(null);
        setState('device-list');
      }
      
      setDevices(foundDevices);
    } catch (error) {
      let errorDetail: ErrorDetail;
      
      if (error instanceof Error) {
        errorDetail = {
          message: error.message,
          stack: error.stack,
          fullError: `❌ Scan Failed\n\n${error.message}\n\n${error.stack ? `Stack Trace:\n${error.stack}` : ''}`
        };
      } else {
        const errorStr = String(error);
        errorDetail = {
          message: errorStr,
          fullError: `❌ Scan Failed\n\n${errorStr}`
        };
      }
      
      console.error('Modal: Scan error:', errorDetail);
      setError(errorDetail);
      setDevices([]);
      setState('error');
    }
  };

  const handleSelectDevice = async (device: PrinterDevice) => {
    console.log('Modal: Device selected:', device.name);
    setConnectingDevice(device);
    setState('connecting');
    setError(null);

    try {
      await onSelectPrinter(device);
      // Success! Show connected state briefly then close
      setState('connected');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Modal: Connection error:', error);
      let errorDetail: ErrorDetail;
      
      if (error instanceof Error) {
        errorDetail = {
          message: error.message,
          stack: error.stack,
          fullError: `❌ Connection Failed\n\n${error.message}\n\n💡 Common issues:\n• Printer is turned off\n• Printer is out of range\n• Printer is already connected to another device\n• Wrong device selected (not a printer)\n\n${error.stack ? `\nStack Trace:\n${error.stack}` : ''}`
        };
      } else {
        errorDetail = {
          message: String(error),
          fullError: `❌ Connection Failed\n\n${String(error)}`
        };
      }
      
      setError(errorDetail);
      setState('error');
      setConnectingDevice(null);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Printer',
      `Disconnect from ${connectedDevice?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            onDisconnect();
            setState('scanning');
            setError(null);
            handleScan();
          }
        }
      ]
    );
  };

  const copyErrorToClipboard = async () => {
    if (!error) return;
    
    const errorText = error.fullError || `${error.message}\n${error.stack || ''}`;
    await Clipboard.setString(errorText);
    Alert.alert('Copied', 'Error details copied to clipboard');
  };

  const renderDevice = ({ item }: { item: PrinterDevice }) => (
    <TouchableOpacity 
      style={styles.deviceItem}
      onPress={() => handleSelectDevice(item)}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>📱 {item.name}</Text>
        <Text style={styles.deviceId}>{item.id}</Text>
        {item.rssi && <Text style={styles.deviceRssi}>Signal: {item.rssi} dBm</Text>}
      </View>
      <Text style={styles.connectArrow}>→</Text>
    </TouchableOpacity>
  );

  const renderContent = () => {
    switch (state) {
      case 'scanning':
        return (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text style={styles.stateTitle}>Scanning for devices...</Text>
            <Text style={styles.stateSubtext}>Looking for paired Bluetooth devices</Text>
          </View>
        );

      case 'connecting':
        return (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color="#28a745" />
            <Text style={styles.stateTitle}>Connecting...</Text>
            <Text style={styles.stateSubtext}>
              Connecting to {connectingDevice?.name}
            </Text>
            <Text style={styles.stateHint}>This may take up to 10 seconds</Text>
          </View>
        );

      case 'connected':
        return (
          <View style={styles.stateContainer}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.stateTitle}>Connected!</Text>
            <Text style={styles.stateSubtext}>{connectedDevice?.name}</Text>
            
            <View style={styles.connectedInfo}>
              <Text style={styles.connectedLabel}>Device ID:</Text>
              <Text style={styles.connectedValue}>{connectedDevice?.id}</Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={[styles.actionButton, styles.disconnectButton]}
                onPress={handleDisconnect}
              >
                <Text style={styles.actionButtonText}>🔌 Disconnect</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionButton, styles.changeButton]}
                onPress={() => {
                  setState('scanning');
                  handleScan();
                }}
              >
                <Text style={styles.actionButtonText}>🔄 Change Printer</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'error':
        return (
          <View style={styles.stateContainer}>
            <ScrollView style={styles.errorScrollView}>
              <View style={styles.errorContainer}>
                <Text style={styles.errorTitle}>⚠️ {error?.message}</Text>
                <Text style={styles.errorText} selectable={true}>
                  {error?.fullError}
                </Text>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity 
                  style={[styles.actionButton, styles.copyButton]}
                  onPress={copyErrorToClipboard}
                >
                  <Text style={styles.actionButtonText}>📋 Copy Error</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionButton, styles.retryButton]}
                  onPress={handleScan}
                >
                  <Text style={styles.actionButtonText}>🔄 Retry</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        );

      case 'device-list':
        return (
          <>
            <Text style={styles.listHeader}>
              Found {devices.length} device{devices.length !== 1 ? 's' : ''}
            </Text>
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id}
              style={styles.deviceList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    No devices found
                  </Text>
                </View>
              }
            />
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.refreshButton]} 
              onPress={handleScan}
            >
              <Text style={styles.actionButtonText}>🔄 Refresh</Text>
            </TouchableOpacity>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Modal 
      isVisible={isVisible} 
      onBackdropPress={state !== 'connecting' ? onClose : undefined}
      backdropColor="rgba(0, 0, 0, 0.5)"
      animationIn="slideInUp"
      animationOut="slideOutDown"
      onBackButtonPress={state !== 'connecting' ? onClose : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>
          {state === 'connected' ? '🖨️ Printer Connected' : '🖨️ Bluetooth Printer'}
        </Text>
        
        {renderContent()}
        
        {state !== 'connecting' && (
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    maxHeight: '85%',
    minHeight: 300,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    minHeight: 200,
  },
  stateTitle: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  stateSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  stateHint: {
    marginTop: 12,
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  successIcon: {
    fontSize: 60,
  },
  connectedInfo: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    width: '100%',
  },
  connectedLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  connectedValue: {
    fontSize: 13,
    color: '#333',
    fontFamily: 'monospace',
  },
  errorScrollView: {
    maxHeight: 300,
    width: '100%',
  },
  errorContainer: {
    backgroundColor: '#fee',
    borderColor: '#fcc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },
  errorTitle: {
    color: '#c00',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    color: '#333',
    fontSize: 13,
    lineHeight: 20,
  },
  listHeader: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
    textAlign: 'center',
  },
  deviceList: {
    maxHeight: 300,
    minHeight: 100,
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  deviceRssi: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  connectArrow: {
    fontSize: 20,
    color: '#007bff',
    marginLeft: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  disconnectButton: {
    backgroundColor: '#dc3545',
  },
  changeButton: {
    backgroundColor: '#007bff',
  },
  copyButton: {
    backgroundColor: '#6c757d',
  },
  retryButton: {
    backgroundColor: '#007bff',
  },
  refreshButton: {
    backgroundColor: '#28a745',
    marginTop: 10,
  },
  closeButton: {
    backgroundColor: '#6c757d',
    padding: 14,
    borderRadius: 8,
    marginTop: 15,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
  },
});

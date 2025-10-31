import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Clipboard, Alert } from 'react-native';
import Modal from 'react-native-modal';
import { NativeBLEPrinter, PrinterDevice } from '../services/NativeBLEPrinter';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onSelectPrinter: (device: PrinterDevice) => void;
  printer: NativeBLEPrinter;
}

interface ErrorDetail {
  message: string;
  stack?: string;
  fullError?: string;
}

export const PrinterSelectionModal: React.FC<Props> = ({ isVisible, onClose, onSelectPrinter, printer }) => {
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<ErrorDetail | null>(null);

  useEffect(() => {
    if (isVisible) {
      // Reset state when modal opens
      setDevices([]);
      setError(null);
      handleScan();
    }
  }, [isVisible]);

  const handleScan = async () => {
    console.log('Modal: Starting scan...');
    setIsScanning(true);
    setError(null);
    
    try {
      console.log('Modal: Requesting permissions...');
      const hasPermission = await printer.requestPermissions();
      
      if (!hasPermission) {
        const errorMsg = 'Bluetooth permissions required. Please enable in Settings.';
        console.log('Modal: Permissions not granted');
        setError({
          message: errorMsg,
          fullError: `Permission Error: ${errorMsg}\n\nTo fix:\n1. Go to Android Settings\n2. Apps → Morobooth → Permissions\n3. Enable Bluetooth permissions`
        });
        setIsScanning(false);
        return;
      }
      
      console.log('Modal: Permissions granted, scanning devices...');
      const foundDevices = await printer.scanDevices();
      console.log('Modal: Scan complete. Found devices:', foundDevices.length);
      
      if (foundDevices.length === 0) {
        setError({
          message: 'No paired Bluetooth devices found',
          fullError: 'No paired Bluetooth devices found.\n\nMake sure your printer is paired in Android Bluetooth settings first.'
        });
      } else {
        setError(null);
      }
      
      setDevices(foundDevices);
    } catch (error) {
      let errorDetail: ErrorDetail;
      
      if (error instanceof Error) {
        errorDetail = {
          message: error.message,
          stack: error.stack,
          fullError: `${error.name}: ${error.message}\n\nStack:\n${error.stack || 'No stack trace'}`
        };
      } else {
        const errorStr = String(error);
        errorDetail = {
          message: errorStr,
          fullError: `Error: ${errorStr}`
        };
      }
      
      console.error('Modal: Scan error:', errorDetail);
      setError(errorDetail);
      setDevices([]);
    } finally {
      setIsScanning(false);
    }
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
      onPress={() => {
        onSelectPrinter(item);
        onClose();
      }}
    >
      <Text style={styles.deviceName}>{item.name}</Text>
      <Text style={styles.deviceId}>{item.id}</Text>
      {item.rssi && <Text style={styles.deviceRssi}>Signal: {item.rssi} dBm</Text>}
    </TouchableOpacity>
  );

  return (
    <Modal 
      isVisible={isVisible} 
      onBackdropPress={onClose}
      backdropColor="rgba(0, 0, 0, 0.5)"
      animationIn="slideInUp"
      animationOut="slideOutDown"
    >
      <View style={styles.container}>
        <Text style={styles.title}>Select Printer</Text>
        
        {isScanning ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text style={styles.loadingText}>Scanning for printers...</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorTitle}>Error Details</Text>
                <Text style={styles.errorText} selectable={true}>
                  {error.message}
                </Text>
                {error.stack ? (
                  <View style={styles.stackContainer}>
                    <Text style={styles.stackLabel}>Stack Trace:</Text>
                    <Text style={styles.stackText} selectable={true}>
                      {error.stack}
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity 
                  style={styles.copyButton} 
                  onPress={copyErrorToClipboard}
                >
                  <Text style={styles.copyButtonText}>📋 Copy Error for Debug</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id}
              style={styles.deviceList}
              ListEmptyComponent={
                !error ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      No Bluetooth devices found.{'\n'}
                      Pair your printer in Bluetooth settings first.
                    </Text>
                  </View>
                ) : null
              }
            />
            
            <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
              <Text style={styles.scanButtonText}>Refresh</Text>
            </TouchableOpacity>
          </>
        )}
        
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    maxHeight: '80%',
    minHeight: 200,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#fee',
    borderColor: '#fcc',
    borderWidth: 1,
    borderRadius: 5,
    padding: 12,
    marginBottom: 15,
  },
  errorTitle: {
    color: '#c00',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorText: {
    color: '#c00',
    fontSize: 14,
    marginBottom: 8,
  },
  stackContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fcc',
  },
  stackLabel: {
    color: '#c00',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  stackText: {
    color: '#333',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  copyButton: {
    backgroundColor: '#007bff',
    padding: 8,
    borderRadius: 4,
    marginTop: 10,
    alignItems: 'center',
  },
  copyButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
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
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deviceRssi: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  scanButton: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 5,
    marginTop: 10,
  },
  scanButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 5,
    marginTop: 10,
  },
  closeButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
  },
});




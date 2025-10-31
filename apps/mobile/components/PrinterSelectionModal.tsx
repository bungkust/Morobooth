import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';
import { NativeBLEPrinter, PrinterDevice } from '../services/NativeBLEPrinter';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onSelectPrinter: (device: PrinterDevice) => void;
  printer: NativeBLEPrinter;
}

export const PrinterSelectionModal: React.FC<Props> = ({ isVisible, onClose, onSelectPrinter, printer }) => {
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (isVisible) {
      handleScan();
    }
  }, [isVisible]);

  const handleScan = async () => {
    console.log('Modal: Getting bonded devices...');
    setIsScanning(true);
    try {
      const hasPermission = await printer.requestPermissions();
      if (!hasPermission) {
        console.log('Modal: Permissions not granted');
        alert('Bluetooth permissions required');
        return;
      }
      
      console.log('Modal: Permissions granted, getting bonded devices...');
      const foundDevices = await printer.scanDevices();
      console.log('Modal: Found devices:', foundDevices.length);
      setDevices(foundDevices);
    } catch (error) {
      console.error('Modal: Scan error:', error);
    } finally {
      setIsScanning(false);
    }
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
    <Modal isVisible={isVisible} onBackdropPress={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Select Printer</Text>
        
        {isScanning ? (
          <ActivityIndicator size="large" color="#007bff" />
        ) : (
          <>
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No printers found. Make sure printer is on and paired.</Text>
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
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
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
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginVertical: 20,
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




import React, { useState, useEffect, useCallback } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';
import { NativeBLEPrinter, PrinterDevice } from '../services/NativeBLEPrinter';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onSelectPrinter: (device: PrinterDevice) => void;
  onDisconnect: () => void;
  printer: NativeBLEPrinter;
  connectedDevice: PrinterDevice | null;
}

export const PrinterSelectionModal: React.FC<Props> = ({ 
  isVisible, 
  onClose, 
  onSelectPrinter, 
  onDisconnect,
  printer, 
  connectedDevice 
}) => {
  const [isScanning, setIsScanning] = useState(false);

  const handleSelectDevice = useCallback(async (device: PrinterDevice) => {
    try {
      console.log('Modal: Device selected:', device.name);
      
      if (Platform.OS === 'android') {
        ToastAndroid.show('Connecting...', ToastAndroid.SHORT);
      }

      await onSelectPrinter(device);
      
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Connected to ${device.name}`, ToastAndroid.SHORT);
      } else {
        Alert.alert('Success', `Connected to ${device.name}`, [{ text: 'OK' }]);
      }
      
      onClose();
    } catch (error) {
      console.error('Modal: Connection error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      Alert.alert(
        'Connection Failed',
        `Could not connect to printer.\n\n${errorMsg}\n\nTry:\n• Make sure printer is turned on\n• Check if printer is in range\n• Try a different device`,
        [
          { text: 'Retry', onPress: () => handleSelectDevice(device) },
          { text: 'Cancel', style: 'cancel', onPress: onClose }
        ]
      );
    }
  }, [onSelectPrinter, onClose]);

  const showDeviceSelection = useCallback((devices: PrinterDevice[]) => {
    const buttons = devices.map((device) => ({
      text: `${device.name || 'Unknown Device'}\n${device.id.substring(0, 17)}...`,
      onPress: () => handleSelectDevice(device)
    }));
    buttons.push({ text: 'Cancel', style: 'cancel' as const });
    
    Alert.alert(
      'Select Printer',
      `Found ${devices.length} paired device${devices.length > 1 ? 's' : ''}`,
      buttons
    );
  }, [handleSelectDevice]);

  const scanAndShowDevices = useCallback(async () => {
    try {
      console.log('Modal: Starting scan...');
      setIsScanning(true);
      const foundDevices = await printer.scanDevices();
      console.log('Modal: Scan complete. Found devices:', foundDevices.length);
      setIsScanning(false);

      if (foundDevices.length === 0) {
        Alert.alert(
          'No Printers Found',
          'No paired Bluetooth devices found.\n\nPlease pair your printer in Android Settings > Bluetooth first.',
          [
            { text: 'Retry', onPress: scanAndShowDevices },
            { text: 'Cancel', style: 'cancel', onPress: onClose }
          ]
        );
        return;
      }

      showDeviceSelection(foundDevices);
    } catch (error) {
      console.error('Modal: Scan error:', error);
      setIsScanning(false);
      const errorMsg = error instanceof Error ? error.message : String(error);
      Alert.alert(
        'Scan Failed',
        errorMsg,
        [
          { text: 'Retry', onPress: scanAndShowDevices },
          { text: 'Cancel', style: 'cancel', onPress: onClose }
        ]
      );
    }
  }, [printer, onClose, showDeviceSelection]);

  const handleShowModal = useCallback(async () => {
    if (connectedDevice) {
      Alert.alert(
        '🖨️ Printer Connected',
        `Connected to: ${connectedDevice.name}\n\nDevice ID: ${connectedDevice.id}`,
        [
          { text: 'Disconnect', style: 'destructive', onPress: () => { onDisconnect(); onClose(); } },
          { text: 'Change Printer', onPress: scanAndShowDevices },
          { text: 'Cancel', style: 'cancel', onPress: onClose }
        ]
      );
      return;
    }
    scanAndShowDevices();
  }, [connectedDevice, onDisconnect, onClose, scanAndShowDevices]);

  useEffect(() => {
    console.log('PrinterSelectionModal: isVisible changed to:', isVisible);
    if (isVisible) {
      console.log('PrinterSelectionModal: Triggering alert');
      handleShowModal();
    }
  }, [isVisible, connectedDevice, handleShowModal]);

  return null;
};

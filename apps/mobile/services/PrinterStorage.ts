import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrinterDevice } from './NativeBLEPrinter';

const PRINTER_KEY = '@morobooth:last_printer';

export class PrinterStorage {
  static async saveLastPrinter(device: PrinterDevice): Promise<void> {
    await AsyncStorage.setItem(PRINTER_KEY, JSON.stringify(device));
  }
  
  static async getLastPrinter(): Promise<PrinterDevice | null> {
    const data = await AsyncStorage.getItem(PRINTER_KEY);
    return data ? JSON.parse(data) : null;
  }
  
  static async clearLastPrinter(): Promise<void> {
    await AsyncStorage.removeItem(PRINTER_KEY);
  }
}




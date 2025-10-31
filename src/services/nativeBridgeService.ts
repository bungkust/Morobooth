export interface NativeMessage {
  type: string;
  data?: any;
}

export class NativeBridgeService {
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  isNativeApp(): boolean {
    return (window as any).isNativeApp === true;
  }

  hasNativeBluetooth(): boolean {
    return (window as any).hasNativeBluetooth === true;
  }

  sendMessage(type: string, data?: any): void {
    if (!this.isNativeApp()) {
      console.warn('Not in native app, message not sent:', type);
      return;
    }

    const message: NativeMessage = { type, data };
    
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  init(): void {
    window.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message.data);
        }
      } catch (error) {
        console.error('Failed to parse native message:', error);
      }
    });

    // For Android
    document.addEventListener('message', (event: any) => {
      try {
        const message = JSON.parse(event.data);
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message.data);
        }
      } catch (error) {
        console.error('Failed to parse native message:', error);
      }
    });
  }
}

export const nativeBridge = new NativeBridgeService();




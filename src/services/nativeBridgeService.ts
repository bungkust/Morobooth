export interface NativeMessage {
  type: string;
  data?: any;
}

export class NativeBridgeService {
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private initialized: boolean = false;

  isNativeApp(): boolean {
    return window.isNativeApp === true;
  }

  hasNativeBluetooth(): boolean {
    return window.hasNativeBluetooth === true;
  }

  sendMessage(type: string, data?: any): void {
    if (!this.isNativeApp()) {
      console.warn('Not in native app, message not sent:', type);
      return;
    }

    // Force chunking for all PRINT_DITHERED_BITMAP messages
    if (type === 'PRINT_DITHERED_BITMAP' && data?.bitmapBase64) {
      const base64 = data.bitmapBase64;
      const chunkSize = 5000; // Safe limit accounting for JSON overhead
      const totalChunks = Math.ceil(base64.length / chunkSize);
      
      console.log(`Splitting bitmap into ${totalChunks} chunks, total size: ${base64.length} bytes`);
      
      // Send first chunk as START message
      const firstChunk = base64.slice(0, chunkSize);
      const startMessage: NativeMessage = {
        type: 'PRINT_DITHERED_BITMAP_START',
        data: {
          width: data.width,
          height: data.height,
          totalChunks,
          bitmapBase64: firstChunk,
          chunkIndex: 0,
          isLast: totalChunks === 1 // If only one chunk, mark as last
        }
      };
      
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(startMessage));
        console.log(`Sending chunk 0/${totalChunks - 1}, size: ${firstChunk.length} bytes, isLast: ${totalChunks === 1}`);
      }
      
      // Send subsequent chunks with delay
      for (let i = 1; i < totalChunks; i++) {
        setTimeout(() => {
          const chunkStart = i * chunkSize;
          const chunkEnd = Math.min(chunkStart + chunkSize, base64.length);
          const chunk = base64.slice(chunkStart, chunkEnd);
          const isLast = i === totalChunks - 1;
          
          const chunkMessage: NativeMessage = {
            type: 'PRINT_DITHERED_BITMAP_CHUNK',
            data: {
              bitmapBase64: chunk,
              chunkIndex: i,
              isLast
            }
          };
          
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(chunkMessage));
            console.log(`Sending chunk ${i}/${totalChunks - 1}, size: ${chunk.length} bytes, isLast: ${isLast}`);
          }
        }, i * 10); // 10ms delay between chunks
      }
      
      return;
    }

    // Normal message handling for other types
    const message: NativeMessage = { type, data };
    
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  init(): void {
    if (this.initialized) {
      return; // Already initialized, skip
    }
    this.initialized = true;

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




export {};

declare global {
  interface Window {
    isNativeApp?: boolean;
    hasNativeBluetooth?: boolean;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}


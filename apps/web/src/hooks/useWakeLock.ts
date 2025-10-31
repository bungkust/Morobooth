import { useEffect, useRef } from 'react';

interface WakeLockSentinel {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
}

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = async (): Promise<void> => {
    const navigator = window.navigator as NavigatorWithWakeLock;
    
    if ('wakeLock' in navigator && navigator.wakeLock) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Screen Wake Lock was released.');
        });
        console.log('Screen Wake Lock is active.');
      } catch (err) {
        console.error(`${(err as Error).name}, ${(err as Error).message}`);
      }
    } else {
      console.warn('Wake Lock API is not supported.');
    }
  };

  const releaseWakeLock = async (): Promise<void> => {
    if (wakeLockRef.current !== null) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  return {
    requestWakeLock,
    releaseWakeLock,
    isActive: wakeLockRef.current !== null
  };
}

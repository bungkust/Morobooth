import { useRef, useCallback } from 'react';

export const useAudio = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastBeepTimeRef = useRef<number>(0);

  const initializeAudio = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('Audio not supported:', error);
      }
    }
  }, []);

  const playCountdownBeep = useCallback(() => {
    if (!audioContextRef.current) return;

    const now = Date.now();
    if (now - lastBeepTimeRef.current < 800) return; // Prevent multiple beeps
    
    lastBeepTimeRef.current = now;

    try {
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      // High-pitched beep for countdown
      oscillator.frequency.setValueAtTime(800, audioContextRef.current.currentTime);
      oscillator.type = 'sine';
      
      // Quick beep envelope
      gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContextRef.current.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.2);
      
      oscillator.start(audioContextRef.current.currentTime);
      oscillator.stop(audioContextRef.current.currentTime + 0.2);
    } catch (error) {
      console.warn('Failed to play countdown beep:', error);
    }
  }, []);

  const playCaptureSound = useCallback(() => {
    if (!audioContextRef.current) return;

    try {
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      // Camera shutter sound (lower frequency)
      oscillator.frequency.setValueAtTime(400, audioContextRef.current.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, audioContextRef.current.currentTime + 0.1);
      oscillator.type = 'sawtooth';
      
      // Shutter sound envelope
      gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioContextRef.current.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.15);
      
      oscillator.start(audioContextRef.current.currentTime);
      oscillator.stop(audioContextRef.current.currentTime + 0.15);
    } catch (error) {
      console.warn('Failed to play capture sound:', error);
    }
  }, []);

  return {
    initializeAudio,
    playCountdownBeep,
    playCaptureSound
  };
};

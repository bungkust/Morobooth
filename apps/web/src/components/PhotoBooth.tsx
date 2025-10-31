import p5 from 'p5';
import { useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import Sketch from 'react-p5';
import { orderedDither } from '../utils/dithering';
import { useAudio } from '../hooks/useAudio';
import { savePhotoLocally } from '../services/photoStorageService';
export type AppState = 'PREVIEW' | 'COUNTDOWN' | 'CAPTURING' | 'REVIEW' | 'COMPOSING';

interface Template {
  id: string;
  name: string;
  description: string;
  width: number; // mm
  height: number; // mm
  photoCount: number;
  layout: 'vertical' | 'horizontal' | 'grid';
  thermalSize: '58mm' | '80mm';
}

interface PhotoBoothProps {
  state: AppState;
  countdownText: string;
  template: Template;
  onStateChange: (newState: AppState) => void;
  onFramesUpdate: (frames: p5.Image[]) => void;
  onFinalCompositeUpdate: (composite: p5.Graphics | null) => void;
  onCountdownTextUpdate: (text: string) => void;
  onCanvasResize: (width: number, height: number) => void;
  onCanvasModeChange: (isReviewMode: boolean) => void;
}

export interface PhotoBoothRef {
  startCountdown: (seconds: number) => void;
  resetToPreview: () => void;
  downloadComposite: () => void;
  getFinalCompositeDataURL: () => string | null;
  getPhotoIdForPrint: () => string | null;
  getP5Instance: () => p5 | null;
  getFrames: () => p5.Image[];
}

const PREVIEW_WIDTH = 500;
const PREVIEW_HEIGHT = 375;
const CAPTURE_INTERVAL = 2500; // 2.5 seconds
const BEEP_INTERVAL = 800; // ms
const LOG_INTERVAL = 500; // ms
const MAX_RETRIES = 3;
const CAMERA_RETRY_DELAY = 2000; // ms
const SNAP_MESSAGE_DURATION = 500; // ms
const COMPOSE_DELAY = 100; // ms

export const PhotoBooth = forwardRef<PhotoBoothRef, PhotoBoothProps>(({
  state,
  countdownText,
  template,
  onStateChange,
  onFramesUpdate,
  onFinalCompositeUpdate,
  onCountdownTextUpdate,
  onCanvasResize,
  onCanvasModeChange
}, ref) => {
  const videoRef = useRef<p5.Element | null>(null);
  const pgPreviewRef = useRef<p5.Graphics | null>(null);
  const framesRef = useRef<p5.Image[]>([]);
  const finalCompositeRef = useRef<p5.Graphics | null>(null);
  const finalCompositeHighResRef = useRef<p5.Graphics | null>(null);
  const currentPhotoIdRef = useRef<string | null>(null);
  const lastShotAtRef = useRef<number>(0);
  const { initializeAudio, playCountdownBeep, playCaptureSound } = useAudio();
  const countdownEndAtRef = useRef<number>(0);
  const lastBeepTimeRef = useRef<number>(0);
  const lastLogTimeRef = useRef<number>(0);
  const p5InstanceRef = useRef<p5 | null>(null);
  const retryCountRef = useRef<number>(0);
  const cameraReadyRef = useRef<boolean>(false);
  const shotsNeeded = template.photoCount;

  const setup = (p: any, canvasParentRef: Element) => {
    p5InstanceRef.current = p;
    
    // Initialize audio
    initializeAudio();
    
    // Create canvas with willReadFrequently for better performance
    const canvas = p.createCanvas(PREVIEW_WIDTH, PREVIEW_HEIGHT);
    canvas.parent(canvasParentRef);
    canvas.elt.setAttribute('willReadFrequently', 'true');
    p.pixelDensity(1);
    
    console.log('Canvas created:', PREVIEW_WIDTH, 'x', PREVIEW_HEIGHT);

    // Create preview buffer
    pgPreviewRef.current = p.createGraphics(PREVIEW_WIDTH, PREVIEW_HEIGHT);

    // Reset state to ensure clean start
    framesRef.current = [];
    finalCompositeRef.current = null;
    finalCompositeHighResRef.current = null;
    currentPhotoIdRef.current = null;
    lastShotAtRef.current = 0;
    countdownEndAtRef.current = 0;
    lastBeepTimeRef.current = 0;
    lastLogTimeRef.current = 0;

    // Initialize video capture with proper error handling and retry mechanism
    const initializeCamera = () => {
      try {
        console.log(`Attempting to initialize camera (attempt ${retryCountRef.current + 1}/${MAX_RETRIES})`);
        
        videoRef.current = p.createCapture({ video: true }, () => {
          console.log('Video stream acquired successfully.');
          
          if (videoRef.current) {
            videoRef.current.size(PREVIEW_WIDTH, PREVIEW_HEIGHT);
            videoRef.current.hide();
            console.log('Video resized to:', PREVIEW_WIDTH, 'x', PREVIEW_HEIGHT);
            
            // Reset retry count on success
            retryCountRef.current = 0;
            
            // Handle video errors with retry
            videoRef.current.elt.onerror = (e: Event) => {
              console.error("Video element error:", e);
              retryCamera();
            };
            
            videoRef.current.elt.onstalled = (e: Event) => {
              console.warn("Video stream stalled:", e);
              retryCamera();
            };
            
            // Check if video is actually working
            setTimeout(() => {
              if (videoRef.current && (videoRef.current.elt as HTMLVideoElement).readyState >= 3) {
                console.log('Camera initialized successfully');
                cameraReadyRef.current = true;
                onStateChange('PREVIEW');
                p.loop();
              } else {
                console.warn('Camera metadata not loaded, retrying...');
                retryCamera();
              }
            }, 500);
          }
        });
        
      } catch (error) {
        console.error('Error creating video capture:', error);
        retryCamera();
      }
    };
    
    const retryCamera = () => {
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        console.log(`Retrying camera initialization in 2 seconds... (${retryCountRef.current}/${MAX_RETRIES})`);
        
        // Clean up existing video
        if (videoRef.current) {
          videoRef.current.remove();
          videoRef.current = null;
        }
        
        // Retry after delay
        setTimeout(() => {
          initializeCamera();
        }, CAMERA_RETRY_DELAY);
      } else {
        console.error('Max retries reached. Camera initialization failed.');
        onStateChange('PREVIEW'); // Still show preview state even if camera fails
      }
    };
    
    initializeCamera();

    p.noLoop(); // Don't start draw loop until camera is ready
  };

  const draw = (p: any) => {
    // Show loading state when camera is not ready
    if (!videoRef.current || !pgPreviewRef.current) {
      p.background(200); // Gray background
      p.fill(0);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(24);
      p.text('Loading camera...', p.width/2, p.height/2);
      return;
    }

    // Check if camera is ready using our flag
    if (!cameraReadyRef.current) {
      p.background(200); // Gray background
      p.fill(0);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(24);
      p.text('Initializing camera...', p.width/2, p.height/2);
      
      // Show retry count if we're having issues
      if (retryCountRef.current > 0) {
        p.textSize(16);
        p.text(`Retry ${retryCountRef.current}/${MAX_RETRIES}`, p.width/2, p.height/2 + 40);
      }
      return;
    }

    p.background(255); // White background

    if (['PREVIEW', 'COUNTDOWN', 'CAPTURING'].includes(state)) {
      // Show preview with fast dithering
      const video = videoRef.current;
      const pgPreview = pgPreviewRef.current;
      
      // 1. Draw video to buffer
      pgPreview.image(video, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      // 2. Grayscale
      pgPreview.filter(p.GRAY);
      // 3. Bayer dithering for fast preview (only every few frames for performance)
      if (p.frameCount % 2 === 0) { // Only dither every other frame
        orderedDither(pgPreview);
      }
      // 4. Display buffer to main canvas
      p.image(pgPreview, 0, 0, p.width, p.height);

      // Draw countdown text overlay on canvas
      if (state === 'COUNTDOWN' || state === 'CAPTURING') {
        p.fill(255); // White text
        p.stroke(0); // Black outline
        p.strokeWeight(8);
        p.textAlign(p.CENTER, p.CENTER);
        
        // Adjust font size based on text length
        if (countdownText.includes('SNAP')) {
          p.textSize(80); // Much smaller for "SNAP 1/3" text
        } else {
          p.textSize(150); // Smaller for countdown numbers
        }
        
        const centerX = p.width / 2;
        const centerY = p.height * 0.5; // 50% from top (more centered)
        
        p.text(countdownText, centerX, centerY);
        
        // Draw progress indicator during capture
        if (state === 'CAPTURING' && framesRef.current.length > 0) {
          const progressY = p.height * 0.7; // 70% from top
          const barWidth = p.width * 0.6; // 60% of canvas width
          const barHeight = 20;
          const barX = (p.width - barWidth) / 2;
          
          // Background bar
          p.fill(100);
          p.noStroke();
          p.rect(barX, progressY, barWidth, barHeight);
          
          // Progress bar
          const progress = framesRef.current.length / shotsNeeded;
          p.fill(255);
          p.rect(barX, progressY, barWidth * progress, barHeight);
          
          // Progress text
          p.fill(0);
          p.stroke(255);
          p.strokeWeight(2);
          p.textSize(16);
          p.textAlign(p.CENTER, p.CENTER);
          p.text(`${framesRef.current.length + 1}/${shotsNeeded}`, centerX, progressY + barHeight + 25);
        }
      }

      // Handle state logic
      if (state === 'COUNTDOWN') {
        handleCountdown(p);
      }
      if (state === 'CAPTURING') {
        autoCaptureLoop(p);
      }
    } else if (state === 'REVIEW') {
      // Show final composite scaled to fit canvas
      if (finalCompositeRef.current) {
        p.image(finalCompositeRef.current, 0, 0, p.width, p.height);
      }
    }
  };

  const handleCountdown = (p: p5) => {
    const timeLeft = Math.ceil((countdownEndAtRef.current - p.millis()) / 1000);
    
    if (timeLeft > 0) {
      // Always show 3, 2, 1 countdown regardless of photo count
      onCountdownTextUpdate(timeLeft.toString());
      
      // Play beep sound only once per countdown number
      const now = p.millis();
      if (now - lastBeepTimeRef.current > BEEP_INTERVAL) { // Prevent multiple beeps
        playCountdownBeep();
        lastBeepTimeRef.current = now;
      }
    } else if (timeLeft <= 0 && state === 'COUNTDOWN') {
      console.log('Countdown finished, switching to CAPTURING state');
      onCountdownTextUpdate('SMILE!');
      onStateChange('CAPTURING');
      lastShotAtRef.current = 0;
      framesRef.current = [];
      onFramesUpdate([]);
      console.log('CAPTURING state set, frames cleared');
    }
  };

  const autoCaptureLoop = (p: p5) => {
    if (state !== 'CAPTURING') {
      return;
    }
    
    const timeSinceLastShot = p.millis() - lastShotAtRef.current;
    
    // Only log every 500ms to reduce spam
    const now = p.millis();
    if (!lastLogTimeRef.current || now - lastLogTimeRef.current > LOG_INTERVAL) {
      console.log('AutoCaptureLoop: Checking capture conditions', {
        framesLength: framesRef.current.length,
        shotsNeeded,
        timeSinceLastShot,
        interval: CAPTURE_INTERVAL,
        lastShotAt: lastShotAtRef.current
      });
      lastLogTimeRef.current = now;
    }

    if (framesRef.current.length < shotsNeeded && 
        (p.millis() - lastShotAtRef.current > CAPTURE_INTERVAL || lastShotAtRef.current === 0)) {
      
      if (videoRef.current && (videoRef.current.elt as HTMLVideoElement).readyState >= 3) {
        console.log('AutoCaptureLoop: Starting photo capture');
        
        // Capture raw image from video using consistent size
        const rawShot = p.createImage(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        rawShot.copy(
          videoRef.current, 
          0, 0, 
          PREVIEW_WIDTH, 
          PREVIEW_HEIGHT, 
          0, 0, 
          PREVIEW_WIDTH, 
          PREVIEW_HEIGHT
        );
        
        // Convert to grayscale
        rawShot.filter(p.GRAY);
        
        framesRef.current.push(rawShot);
        lastShotAtRef.current = p.millis();
        onFramesUpdate([...framesRef.current]);
        
        console.log(`Foto ${framesRef.current.length} diambil.`);

        // Play capture sound
        playCaptureSound();

        onCountdownTextUpdate(`SNAP ${framesRef.current.length + 1}/${shotsNeeded}`);
        setTimeout(() => {
          if (state === 'CAPTURING') onCountdownTextUpdate('');
        }, SNAP_MESSAGE_DURATION);

        if (framesRef.current.length === shotsNeeded) {
          console.log('AutoCaptureLoop: All photos captured, switching to COMPOSING');
          onStateChange('COMPOSING');
          onCountdownTextUpdate('Merging...');
          setTimeout(() => composeResult(p), COMPOSE_DELAY);
        }
        
        console.log('AutoCaptureLoop: Capture complete');
      } else {
        console.log('AutoCaptureLoop: Video not ready', {
          videoExists: !!videoRef.current,
          videoWidth: (videoRef.current?.elt as HTMLVideoElement)?.videoWidth,
          videoHeight: (videoRef.current?.elt as HTMLVideoElement)?.videoHeight
        });
      }
    }
  };

  const composeResult = (p: p5) => {
    console.log('Composing result...');
    console.log('Frames count:', framesRef.current.length);
    console.log('Template:', template);
    
    // Import both compose functions dynamically to avoid circular dependency
    import('../utils/photoComposer').then(async ({ composeResultForReview, composeResult: composeResultHighRes }) => {
      try {
        console.log('Starting review composite...');
        // Create review version (smaller, for display)
        const compositeReview = await composeResultForReview(p, framesRef.current, template);
        finalCompositeRef.current = compositeReview;
        onFinalCompositeUpdate(compositeReview);
        console.log('Review composite complete');

        console.log('Starting high-res composite...');
        // Create high-res version (for download/print)
        const compositeHighRes = await composeResultHighRes(p, framesRef.current, template);
        finalCompositeHighResRef.current = compositeHighRes;
        console.log('High-res composite complete');

        // NEW: Save photo to IndexedDB
        try {
          console.log('Saving photo locally...');
          const dataURL = (compositeHighRes as any).canvas.toDataURL('image/png');
          const photoRecord = await savePhotoLocally(dataURL);
          currentPhotoIdRef.current = photoRecord.id;
          console.log('Photo saved locally:', photoRecord.id);
        } catch (err) {
          console.error('Failed to save photo locally:', err);
        }

        // Switch to REVIEW state
        console.log('Switching to REVIEW state...');
        onStateChange('REVIEW');
        onCountdownTextUpdate('');
        
        // Keep canvas size fixed for review mode (same as preview)
        p.resizeCanvas(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        onCanvasResize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        onCanvasModeChange(true);
        
        console.log('Composing complete. Ready for review.');
      } catch (error) {
        console.error('Error during composition:', error);
        // Fallback: switch to REVIEW state even if composition fails
        onStateChange('REVIEW');
        onCountdownTextUpdate('');
      }
    }).catch((error) => {
      console.error('Failed to import photoComposer:', error);
      // Fallback: switch to REVIEW state even if import fails
      onStateChange('REVIEW');
      onCountdownTextUpdate('');
    });
  };


  // Expose methods to parent component
  // Cleanup and state management
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('PhotoBooth cleanup: removing video stream');
      // Clean up video stream
      if (videoRef.current) {
        try {
          videoRef.current.remove();
        } catch (error) {
          console.warn('Error removing video stream:', error);
        }
        videoRef.current = null;
      }
      
      // Clean up graphics
      if (pgPreviewRef.current) {
        try {
          pgPreviewRef.current.remove();
        } catch (error) {
          console.warn('Error removing preview graphics:', error);
        }
        pgPreviewRef.current = null;
      }
      
      // Reset retry count and camera ready flag
      retryCountRef.current = 0;
      cameraReadyRef.current = false;
    };
  }, []);

  // Reset retry count when template changes
  useEffect(() => {
    retryCountRef.current = 0;
    cameraReadyRef.current = false;
  }, [template.id]);

  useImperativeHandle(ref, () => ({
    startCountdown: (seconds: number) => {
      if (p5InstanceRef.current) {
        countdownEndAtRef.current = p5InstanceRef.current.millis() + seconds * 1000;
        onCountdownTextUpdate(seconds.toString());
        onStateChange('COUNTDOWN');
      }
    },
    resetToPreview: () => {
      if (p5InstanceRef.current) {
        framesRef.current = [];
        finalCompositeRef.current = null;
        finalCompositeHighResRef.current = null;
        currentPhotoIdRef.current = null;
        lastShotAtRef.current = 0;
        countdownEndAtRef.current = 0;
        lastBeepTimeRef.current = 0;
        lastLogTimeRef.current = 0;

        onFramesUpdate([]);
        onFinalCompositeUpdate(null);
        
        p5InstanceRef.current.resizeCanvas(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        onCanvasResize(PREVIEW_WIDTH, PREVIEW_HEIGHT);
        onCanvasModeChange(false);
        
        onStateChange('PREVIEW');
      }
    },
    downloadComposite: () => {
      if (p5InstanceRef.current && finalCompositeHighResRef.current) {
        const timestamp = new Date().toISOString()
          .replace(/[-:.]/g, '')
          .substring(0, 15);
        const filename = `booth-${timestamp}.png`;
        p5InstanceRef.current.save(finalCompositeHighResRef.current, filename);
      }
    },
    getFinalCompositeDataURL: () => {
      if (finalCompositeHighResRef.current) {
        return (finalCompositeHighResRef.current as any).canvas.toDataURL('image/png');
      }
      return null;
    },
    getPhotoIdForPrint: () => currentPhotoIdRef.current,
    getP5Instance: () => p5InstanceRef.current,
    getFrames: () => framesRef.current
  }));

  return (
    <div id="canvas-wrap">
      <Sketch setup={setup} draw={draw} />
    </div>
  );
});
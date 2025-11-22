import p5 from 'p5';
import { useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import Sketch from 'react-p5';
import { orderedDither } from '../utils/dithering';
import { useAudio } from '../hooks/useAudio';
import { getPrinterOutputSettings } from '../services/configService';
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
  setPhotoIdForPrint: (photoId: string | null) => void;
  getP5Instance: () => p5 | null;
  getFrames: () => p5.Image[];
}

// Default canvas size (fallback)
const DEFAULT_PREVIEW_WIDTH = 500;
const DEFAULT_PREVIEW_HEIGHT = 375;
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
  const canvasSizeRef = useRef<{ width: number; height: number }>({ 
    width: DEFAULT_PREVIEW_WIDTH, 
    height: DEFAULT_PREVIEW_HEIGHT 
  });

  const setup = (p: any, canvasParentRef: Element) => {
    p5InstanceRef.current = p;
    
    // Initialize audio
    initializeAudio();
    
    // Calculate canvas size based on container (mepet kanan kiri)
    const calculateCanvasSize = () => {
      // Get container element (capture-preview-container)
      const container = canvasParentRef.parentElement?.parentElement;
      if (!container) {
        console.warn('Container not found, using default size');
        return { width: DEFAULT_PREVIEW_WIDTH, height: DEFAULT_PREVIEW_HEIGHT };
      }
      
      // Get container dimensions
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Calculate canvas size to fill container width (mepet kanan kiri)
      // Maintain 1:1 aspect ratio (kotak/square)
      let canvasWidth = containerWidth;
      let canvasHeight = canvasWidth; // Square: height = width
      
      // If height exceeds container, scale down to fit
      if (canvasHeight > containerHeight) {
        canvasHeight = containerHeight;
        canvasWidth = canvasHeight; // Square: width = height
      }
      
      // Round to integers
      canvasWidth = Math.floor(canvasWidth);
      canvasHeight = Math.floor(canvasHeight);
      
      // Minimum size constraints (square)
      const minSize = 300;
      if (canvasWidth < minSize) {
        canvasWidth = minSize;
        canvasHeight = minSize;
      }
      if (canvasHeight < minSize) {
        canvasHeight = minSize;
        canvasWidth = minSize;
      }
      
      console.log('Canvas size calculated:', canvasWidth, 'x', canvasHeight, 'from container:', containerWidth, 'x', containerHeight);
      return { width: canvasWidth, height: canvasHeight };
    };
    
    // Calculate and store canvas size
    const canvasSize = calculateCanvasSize();
    canvasSizeRef.current = canvasSize;
    
    // Create canvas with calculated size
    const canvas = p.createCanvas(canvasSize.width, canvasSize.height);
    canvas.parent(canvasParentRef);
    canvas.elt.setAttribute('willReadFrequently', 'true');
    p.pixelDensity(1);
    
    console.log('Canvas created:', canvasSize.width, 'x', canvasSize.height);

    // Create preview buffer with same size
    pgPreviewRef.current = p.createGraphics(canvasSize.width, canvasSize.height);

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
            videoRef.current.size(canvasSizeRef.current.width, canvasSizeRef.current.height);
            videoRef.current.hide();
            console.log('Video resized to:', canvasSizeRef.current.width, 'x', canvasSizeRef.current.height);
            
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
      
      // 1. Draw video to buffer with mirroring (like a mirror for natural preview)
      pgPreview.push();
      pgPreview.translate(canvasSizeRef.current.width, 0); // Move to right edge
      pgPreview.scale(-1, 1); // Flip horizontally (mirror effect)
      pgPreview.image(video, 0, 0, canvasSizeRef.current.width, canvasSizeRef.current.height);
      pgPreview.pop();
      
      // 2. Grayscale based on settings
      const settings = getPrinterOutputSettings();
      if (settings.previewGrayscale !== false) {
      pgPreview.filter(p.GRAY);
      }
      
      // 3. Bayer dithering for fast preview (only every few frames for performance)
      if (settings.previewDither !== false && p.frameCount % 2 === 0) { // Only dither every other frame
        orderedDither(pgPreview);
      }
      
      // Warning for inconsistent settings (only log once per frame cycle)
      if (p.frameCount % 60 === 0 && settings.previewDither === false && settings.compositionDither !== false) {
        console.warn('Preview dither disabled but composition dither enabled - preview may not match final output');
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
      // Show final composite with same size and positioning as preview
      // Composite is already created from mirrored frames, so just draw it directly (no need to mirror again)
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
        const rawShot = p.createImage(canvasSizeRef.current.width, canvasSizeRef.current.height);
        rawShot.copy(
          videoRef.current, 
          0, 0, 
          canvasSizeRef.current.width, 
          canvasSizeRef.current.height, 
          0, 0, 
          canvasSizeRef.current.width, 
          canvasSizeRef.current.height
        );
        
        // Mirror the captured image (like preview) using a temporary graphics buffer
        const mirroredShot = p.createGraphics(canvasSizeRef.current.width, canvasSizeRef.current.height);
        mirroredShot.push();
        mirroredShot.translate(canvasSizeRef.current.width, 0);
        mirroredShot.scale(-1, 1);
        mirroredShot.image(rawShot, 0, 0);
        mirroredShot.pop();
        
        // Convert graphics to image
        const mirroredImage = p.createImage(canvasSizeRef.current.width, canvasSizeRef.current.height);
        mirroredImage.copy(mirroredShot, 0, 0, canvasSizeRef.current.width, canvasSizeRef.current.height, 0, 0, canvasSizeRef.current.width, canvasSizeRef.current.height);
        
        // Convert to grayscale based on settings
        const settings = getPrinterOutputSettings();
        if (settings.captureGrayscale !== false) {
        mirroredImage.filter(p.GRAY);
        }
        
        framesRef.current.push(mirroredImage);
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
    // Add retry mechanism for dynamic import
    const importWithRetry = async (retries = 3, delay = 500): Promise<any> => {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`[COMPOSE] Attempting to import photoComposer (attempt ${i + 1}/${retries})`);
          const module = await import('../utils/photoComposer');
          console.log('[COMPOSE] ✓ photoComposer imported successfully');
          return module;
        } catch (error) {
          console.error(`[COMPOSE] Import attempt ${i + 1} failed:`, error);
          if (i < retries - 1) {
            console.log(`[COMPOSE] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw error;
          }
        }
      }
    };

    importWithRetry()
      .then(async ({ composeResultForReview, composeResult: composeResultHighRes }) => {
        try {
          console.log('[COMPOSE] Starting review composite...');
          // Create review version with same canvas size as preview to maintain consistent positioning
          const compositeReview = await composeResultForReview(p, framesRef.current, template, canvasSizeRef.current.width, canvasSizeRef.current.height);
          finalCompositeRef.current = compositeReview;
          onFinalCompositeUpdate(compositeReview);
          console.log('[COMPOSE] ✓ Review composite complete');

          console.log('[COMPOSE] Starting high-res composite...');
          // Create high-res version (for download/print)
          const compositeHighRes = await composeResultHighRes(p, framesRef.current, template);
          finalCompositeHighResRef.current = compositeHighRes;
          console.log('[COMPOSE] ✓ High-res composite complete');

          // Note: Photo will be saved when user clicks print button
          // Reset photoId ref (will be set when saved)
          currentPhotoIdRef.current = null;

          // Switch to REVIEW state
          console.log('[COMPOSE] Switching to REVIEW state...');
          onStateChange('REVIEW');
          onCountdownTextUpdate('');
          
          // Keep canvas size fixed for review mode (same as preview)
          p.resizeCanvas(canvasSizeRef.current.width, canvasSizeRef.current.height);
          onCanvasResize(canvasSizeRef.current.width, canvasSizeRef.current.height);
          onCanvasModeChange(true);
          
          console.log('[COMPOSE] ✓ Composing complete. Ready for review.');
        } catch (error) {
          console.error('[COMPOSE] ERROR: Error during composition:', error);
          if (error instanceof Error) {
            console.error('[COMPOSE] Error name:', error.name);
            console.error('[COMPOSE] Error message:', error.message);
            console.error('[COMPOSE] Error stack:', error.stack);
          }
          // Fallback: switch to REVIEW state even if composition fails
          onStateChange('REVIEW');
          onCountdownTextUpdate('');
        }
      })
      .catch((error) => {
        console.error('[COMPOSE] ERROR: Failed to import photoComposer after retries');
        console.error('[COMPOSE] Error type:', typeof error);
        if (error instanceof Error) {
          console.error('[COMPOSE] Error name:', error.name);
          console.error('[COMPOSE] Error message:', error.message);
          console.error('[COMPOSE] Error stack:', error.stack);
        } else {
          console.error('[COMPOSE] Error value:', String(error));
        }
        
        // Check if it's a network/connection error
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
          console.error('[COMPOSE] Network error detected - Vite dev server may be disconnected');
          console.error('[COMPOSE] This usually happens when dev server connection is lost');
        }
        
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
        
        p5InstanceRef.current.resizeCanvas(canvasSizeRef.current.width, canvasSizeRef.current.height);
        onCanvasResize(canvasSizeRef.current.width, canvasSizeRef.current.height);
        onCanvasModeChange(false);
        
        onStateChange('PREVIEW');
      }
    },
    downloadComposite: () => {
      console.log('downloadComposite called');
      console.log('p5InstanceRef.current:', !!p5InstanceRef.current);
      console.log('finalCompositeHighResRef.current:', !!finalCompositeHighResRef.current);
      if (p5InstanceRef.current && finalCompositeHighResRef.current) {
        const timestamp = new Date().toISOString()
          .replace(/[-:.]/g, '')
          .substring(0, 15);
        const filename = `booth-${timestamp}.png`;
        console.log('Saving file:', filename);
        p5InstanceRef.current.save(finalCompositeHighResRef.current, filename);
      } else {
        console.error('Cannot download: missing p5Instance or finalComposite');
      }
    },
    getFinalCompositeDataURL: () => {
      if (finalCompositeHighResRef.current) {
        return (finalCompositeHighResRef.current as any).canvas.toDataURL('image/png');
      }
      return null;
    },
    getPhotoIdForPrint: () => currentPhotoIdRef.current,
    setPhotoIdForPrint: (photoId: string | null) => {
      currentPhotoIdRef.current = photoId;
    },
    getP5Instance: () => p5InstanceRef.current,
    getFrames: () => framesRef.current
  }));

  return (
    <div id="canvas-wrap">
      <Sketch setup={setup} draw={draw} />
    </div>
  );
});
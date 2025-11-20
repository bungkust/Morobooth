import { floydSteinbergDither } from './dithering';
import { loadConfig } from './config';
import { getPrinterOutputSettings } from '../services/configService';

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

/**
 * Compose photos for review mode with smaller dimensions (500x375px)
 */
export async function composeResultForReview(p: any, frames: any[], template: Template): Promise<any> {
  console.log('Composing result for review...');
  
  // Use smaller dimensions for review mode
  const W = 500; // Same as previewWidth
  const margin = 12; // Smaller margin
  const gap = 8; // Smaller gap
  const cellW = W - margin * 2;
  const cellH = cellW; // Rasio 1:1

  let H: number = 0; // Will be calculated per layout
  let photoPositions: { x: number; y: number }[] = [];

  if (template.layout === 'vertical') {
    // Vertical layout: photos stacked vertically
    H = margin + (cellH * template.photoCount) + (gap * (template.photoCount - 1)) + margin;
    
    for (let i = 0; i < template.photoCount; i++) {
      photoPositions.push({
        x: margin,
        y: margin + i * (cellH + gap)
      });
    }
  } else if (template.layout === 'horizontal') {
    // Horizontal layout: photos side by side
    const photoWidth = (W - margin * 2 - gap * (template.photoCount - 1)) / template.photoCount;
    H = margin + photoWidth + margin;
    
    for (let i = 0; i < template.photoCount; i++) {
      photoPositions.push({
        x: margin + i * (photoWidth + gap),
        y: margin
      });
    }
  } else if (template.layout === 'grid') {
    // Grid layout: photos in grid (2x2 for 4 photos, etc.)
    const cols = template.photoCount === 4 ? 2 : template.photoCount === 6 ? 3 : 2;
    const rows = Math.ceil(template.photoCount / cols);
    const photoWidth = (W - margin * 2 - gap * (cols - 1)) / cols;
    const photoHeight = photoWidth; // Square photos
    
    H = margin + (photoHeight * rows) + (gap * (rows - 1)) + margin;
    
    for (let i = 0; i < template.photoCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      photoPositions.push({
        x: margin + col * (photoWidth + gap),
        y: margin + row * (photoHeight + gap)
      });
    }
  }

  const out = p.createGraphics(W, H);
  out.background(255); // Latar putih
  
  // Get composition settings
  const settings = getPrinterOutputSettings();
  
  for (let i = 0; i < template.photoCount; i++) {
    const pos = photoPositions[i];
    
    // Apply dithering based on settings
    let ditheredFrame: any;
    if (settings.compositionDither !== false) {
      // Validate and clamp threshold
      const threshold = Math.max(0, Math.min(255, settings.compositionDitherThreshold ?? 128));
      console.log(`Applying FS dither to frame ${i} with threshold ${threshold}...`);
      ditheredFrame = floydSteinbergDither(p, frames[i], threshold);
    console.log(`Dither complete for frame ${i}.`);
    } else {
      // Skip dithering, use original frame
      console.log(`Skipping dither for frame ${i} (disabled in settings)`);
      ditheredFrame = frames[i];
    }

    if (template.layout === 'horizontal') {
      const photoWidth = (W - margin * 2 - gap * (template.photoCount - 1)) / template.photoCount;
      out.image(ditheredFrame, pos.x, pos.y, photoWidth, photoWidth);
    } else if (template.layout === 'grid') {
      const cols = template.photoCount === 4 ? 2 : template.photoCount === 6 ? 3 : 2;
      const photoWidth = (W - margin * 2 - gap * (cols - 1)) / cols;
      out.image(ditheredFrame, pos.x, pos.y, photoWidth, photoWidth);
    } else { // Vertical layout
      out.image(ditheredFrame, pos.x, pos.y, cellW, cellH);
    }
  }

  console.log('Composing complete for review. Ready for review.');
  return out;
}

async function loadImageSafe(p: any, src: string): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      p.loadImage(src, (img: any) => resolve(img), () => resolve(null));
    } catch (error) {
      console.error('loadImageSafe error:', error);
      resolve(null);
    }
  });
}

/**
 * Compose photos into a single strip with high-quality dithering based on template
 */
export async function composeResult(p: any, frames: any[], template: Template, qrCodeDataURL?: string): Promise<any> {
  console.log('Composing result...');
  console.log('QR Code provided:', !!qrCodeDataURL);
  
  // Load config for custom text
  const config = await loadConfig();
  console.log('Config loaded:', config);
  
  const useImageHeader = !!(config.header.mode === 'image' && config.header.imageUrl);
  let headerImage: any | null = null;
  let headerImageDrawHeight = 0;
  if (useImageHeader) {
    headerImage = await loadImageSafe(p, config.header.imageUrl);
    if (!headerImage) {
      console.warn('Failed to load header image, falling back to text');
    } else {
      // Apply grayscale filter to header image based on settings
      const settings = getPrinterOutputSettings();
      if (settings.captureGrayscale !== false) {
        headerImage.filter(p.GRAY);
        console.log('Applied grayscale filter to header image');
      }
    }
  }
  const hasHeaderText = config.header.mode === 'text' && !!((config.header.mainText && config.header.mainText.trim()) || (config.header.subText && config.header.subText.trim()));
  const bodyHasText = !!((config.body.mainText && config.body.mainText.trim()) || (config.body.subText && config.body.subText.trim()));
  const imageHeaderHeight = headerImage ? 180 : 0;
  const headerTextHeight = hasHeaderText ? 120 : 0;
  const bodyTextHeight = bodyHasText ? 120 : 0;
  const headerGap = headerImage && (hasHeaderText || bodyHasText) ? 20 : 0;
  const headerH = imageHeaderHeight + headerGap + headerTextHeight + bodyTextHeight;
  
  // Use template dimensions for flexible sizing
  const W = template.width * 16; // Convert mm to pixels (58mm * 16 = 928px)
  const margin = 24;
  const gap = 16;
  const cellW = W - margin * 2;
  const cellH = cellW; // Rasio 1:1
  
  // Calculate QR code space with dynamic sizing
  // QR size: 70% of paper width (W), not photo width
  const minQrSize = 80;
  const qrSizePercent = 0.7; // 70% of paper width
  const baseQrSize = Math.max(minQrSize, Math.floor(W * qrSizePercent)); // 70% of paper width
  const qrSize = qrCodeDataURL ? baseQrSize : 0;
  const textHeight = 50; // Space for "Scan untuk download" + "(Valid 24 jam)"
  const qrSpacing = 80; // Spacing below photos before QR
  const qrSpace = qrCodeDataURL ? qrSize + textHeight + qrSpacing : 0;
  
  console.log('[COMPOSE_RESULT] QR size calculation:', {
    paperWidth: W,
    qrSizePercent: `${(qrSizePercent * 100).toFixed(0)}%`,
    baseQrSize,
    qrSize,
    qrSpace
  });

  let H: number = 0; // Will be calculated per layout
  let photoPositions: { x: number; y: number }[] = [];

  if (template.layout === 'vertical') {
    // Vertical layout: photos stacked vertically
    H = margin + headerH + 40 + (cellH * template.photoCount) + (gap * (template.photoCount - 1)) + qrSpace + margin;
    
    for (let i = 0; i < template.photoCount; i++) {
      photoPositions.push({
        x: margin,
        y: margin + headerH + 40 + 20 + i * (cellH + gap)
      });
    }
  } else if (template.layout === 'horizontal') {
    // Horizontal layout: photos side by side
    const photoWidth = (W - margin * 2 - gap * (template.photoCount - 1)) / template.photoCount;
    H = margin + headerH + 40 + photoWidth + qrSpace + margin;
    
    for (let i = 0; i < template.photoCount; i++) {
      photoPositions.push({
        x: margin + i * (photoWidth + gap),
        y: margin + headerH + 40 + 20
      });
    }
  } else if (template.layout === 'grid') {
    // Grid layout: photos in grid (2x2 for 4 photos, etc.)
    const cols = template.photoCount === 4 ? 2 : template.photoCount === 6 ? 3 : 2;
    const rows = Math.ceil(template.photoCount / cols);
    const photoWidth = (W - margin * 2 - gap * (cols - 1)) / cols;
    const photoHeight = photoWidth; // Square photos
    
    H = margin + headerH + 40 + (photoHeight * rows) + (gap * (rows - 1)) + qrSpace + margin;
    
    for (let i = 0; i < template.photoCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      photoPositions.push({
        x: margin + col * (photoWidth + gap),
        y: margin + headerH + 40 + 20 + row * (photoHeight + gap)
      });
    }
  }

  const out = p.createGraphics(W, H);
  out.background(255); // Latar putih
  
  // Render custom header image if provided
  if (headerImage) {
    const availableWidth = W - margin * 2;
    let drawWidth = availableWidth;
    let drawHeight = imageHeaderHeight;
    const aspectRatio = headerImage.width / headerImage.height || 1;
    if (drawWidth / drawHeight > aspectRatio) {
      drawWidth = drawHeight * aspectRatio;
    } else {
      drawHeight = drawWidth / aspectRatio;
    }
    const imageX = (W - drawWidth) / 2;
    out.image(headerImage, imageX, margin, drawWidth, drawHeight);
    headerImageDrawHeight = drawHeight;
  }
  
  // Render custom text header if provided
  let textCursor = margin + headerImageDrawHeight + (headerImageDrawHeight ? headerGap : 0);
  if (hasHeaderText) {
    out.fill(0);
    out.noStroke();
    out.textAlign(p.CENTER, p.CENTER);
    out.textFont('monospace');
    const headerY = textCursor + headerTextHeight / 2;
    
    if (config.header.mainText && config.header.mainText.trim()) {
      out.textSize(48);
      out.text(config.header.mainText.trim(), W / 2, headerY - 15);
    }
    
    if (config.header.subText && config.header.subText.trim()) {
      out.textSize(32);
      out.text(config.header.subText.trim(), W / 2, headerY + 25);
    }
    textCursor += headerTextHeight;
  }
  
  if (bodyHasText) {
    out.fill(0);
    out.noStroke();
    out.textAlign(p.CENTER, p.CENTER);
    out.textFont('monospace');
    const bodyCenter = textCursor + bodyTextHeight / 2;
    
    if (config.body.mainText && config.body.mainText.trim()) {
      out.textSize(42);
      out.text(config.body.mainText.trim(), W / 2, bodyCenter - 15);
    }
    
    if (config.body.subText && config.body.subText.trim()) {
      out.textSize(30);
      out.text(config.body.subText.trim(), W / 2, bodyCenter + 20);
    }
    textCursor += bodyTextHeight;
  }
  
  // Render date below header (above photos)
  out.fill(0);
  out.noStroke();
  out.textAlign(p.CENTER, p.CENTER);
  out.textFont('monospace'); 
  out.textSize(28); // Larger text for print
  
  const tgl3 = new Date();
  const dateStr3 = `${tgl3.getFullYear()}.${(tgl3.getMonth()+1).toString().padStart(2,'0')}.${tgl3.getDate().toString().padStart(2,'0')}`;
  const dateText = `MOROBOOTH // ${dateStr3}`;
  
  const dateY = margin + headerH + 40; // Below header with spacing
  out.text(dateText, W / 2, dateY);
  
  // Get composition settings
  const settings = getPrinterOutputSettings();
  
  for (let i = 0; i < template.photoCount; i++) {
    const pos = photoPositions[i];
    
    // Apply dithering based on settings
    let ditheredFrame: any;
    if (settings.compositionDither !== false) {
      // Validate and clamp threshold
      const threshold = Math.max(0, Math.min(255, settings.compositionDitherThreshold ?? 128));
      console.log(`Applying FS dither to frame ${i} with threshold ${threshold}...`);
      ditheredFrame = floydSteinbergDither(p, frames[i], threshold);
    console.log(`Dither complete for frame ${i}.`);
    } else {
      // Skip dithering, use original frame
      console.log(`Skipping dither for frame ${i} (disabled in settings)`);
      ditheredFrame = frames[i];
    }

    if (template.layout === 'horizontal') {
      const photoWidth = (W - margin * 2 - gap * (template.photoCount - 1)) / template.photoCount;
      out.image(ditheredFrame, pos.x, pos.y, photoWidth, photoWidth);
    } else if (template.layout === 'grid') {
      const cols = template.photoCount === 4 ? 2 : template.photoCount === 6 ? 3 : 2;
      const photoWidth = (W - margin * 2 - gap * (cols - 1)) / cols;
      out.image(ditheredFrame, pos.x, pos.y, photoWidth, photoWidth);
    } else {
      // Vertical layout
      out.image(ditheredFrame, pos.x, pos.y, cellW, cellH);
    }
  }

  // Render QR code if data is provided
  if (qrCodeDataURL) {
    console.log('[COMPOSE_RESULT] Rendering QR code...');
    console.log('[COMPOSE_RESULT] QR code data URL length:', qrCodeDataURL.length);
    console.log('[COMPOSE_RESULT] QR code data URL starts with data:image:', qrCodeDataURL.startsWith('data:image'));
    
    // Validate QR code data URL
    if (!qrCodeDataURL || typeof qrCodeDataURL !== 'string' || !qrCodeDataURL.startsWith('data:image')) {
      console.error('[COMPOSE_RESULT] Invalid QR code data URL format');
      console.log('[COMPOSE_RESULT] No QR code data provided. Composing without QR code.');
    } else {
      try {
        // Load QR code image asynchronously
        const qrImg = await loadImageSafe(p, qrCodeDataURL);
        
        if (!qrImg) {
          console.error('[COMPOSE_RESULT] Failed to load QR code image');
          console.log('[COMPOSE_RESULT] Composing without QR code due to load failure.');
        } else {
          console.log('[COMPOSE_RESULT] QR code image loaded successfully, dimensions:', qrImg.width, 'x', qrImg.height);
          // Calculate dynamic QR size based on layout and canvas width
          let finalQrSize: number;
      let qrX: number, qrY: number;
      let textX: number, textY: number;
      
          // Calculate QR code position and size based on template layout
      if (template.layout === 'vertical') {
            // Vertical layout: QR code below all photos, centered
        const lastPhotoY = margin + headerH + 40 + 20 + (template.photoCount - 1) * (cellH + gap) + cellH;
            
            // Use 70% of paper width
            finalQrSize = Math.max(minQrSize, Math.floor(W * qrSizePercent));
            
            qrX = (W - finalQrSize) / 2;
            qrY = lastPhotoY + qrSpacing;
        textX = W / 2;
            textY = qrY + finalQrSize + 20;
            
            // Bounds check
            const textBottom = textY + 30;
            if (textBottom > H) {
              console.warn('QR code text would overflow, adjusting position');
              qrY = H - finalQrSize - textHeight - 10;
              textY = qrY + finalQrSize + 20;
            }
            
            console.log('[COMPOSE_RESULT] Vertical layout - QR position:', { 
              qrX, qrY, textX, textY, 
              canvasH: H, 
              qrSize: finalQrSize,
              paperWidth: W,
              qrSizePercent: `${(finalQrSize / W * 100).toFixed(1)}%`
            });
      } else if (template.layout === 'horizontal') {
            // Horizontal layout: QR code below photos, centered
        const photoWidth = (W - margin * 2 - gap * (template.photoCount - 1)) / template.photoCount;
        const lastPhotoY = margin + headerH + 40 + 20 + photoWidth;
        
            // Use 70% of paper width
            finalQrSize = Math.max(minQrSize, Math.floor(W * qrSizePercent));
        
            qrX = (W - finalQrSize) / 2; // Center horizontally
            qrY = lastPhotoY + qrSpacing;
            textX = W / 2; // Center text alignment
            textY = qrY + finalQrSize + 20;
            
            // Bounds check
            if (textY + 30 > H) {
              console.warn('QR code text would overflow in horizontal layout');
              qrY = H - finalQrSize - textHeight - 10;
              textY = qrY + finalQrSize + 20;
            }
            
            console.log('[COMPOSE_RESULT] Horizontal layout - QR position:', { 
              qrX, qrY, textX, textY, 
              canvasH: H, 
              qrSize: finalQrSize,
              paperWidth: W,
              qrSizePercent: `${(finalQrSize / W * 100).toFixed(1)}%`
            });
      } else if (template.layout === 'grid') {
        // Grid layout: QR code at bottom center
        const cols = template.photoCount === 4 ? 2 : template.photoCount === 6 ? 3 : 2;
        const photoWidth = (W - margin * 2 - gap * (cols - 1)) / cols;
        
            // Use 70% of paper width
            finalQrSize = Math.max(minQrSize, Math.floor(W * qrSizePercent));
            
            const rows = Math.ceil(template.photoCount / cols);
            const lastPhotoRowY = margin + headerH + 40 + 20 + photoWidth * rows + gap * (rows - 1);
        
            qrX = (W - finalQrSize) / 2;
            qrY = lastPhotoRowY + qrSpacing;
        textX = W / 2;
            textY = qrY + finalQrSize + 20;
            
            // Bounds check
            if (textY + 30 > H) {
              console.warn('QR code text would overflow in grid layout');
              qrY = H - finalQrSize - textHeight - 10;
              textY = qrY + finalQrSize + 20;
            }
            
            console.log('[COMPOSE_RESULT] Grid layout - QR position:', { 
              qrX, qrY, textX, textY, 
              canvasH: H, 
              qrSize: finalQrSize,
              paperWidth: W,
              qrSizePercent: `${(finalQrSize / W * 100).toFixed(1)}%`
            });
      } else {
        // Default layout (e.g., single photo)
            // Use 70% of paper width
            finalQrSize = Math.max(minQrSize, Math.floor(W * qrSizePercent));
            
            qrX = (W - finalQrSize) / 2;
            qrY = margin + headerH + 40 + 20 + cellH + qrSpacing;
        textX = W / 2;
            textY = qrY + finalQrSize + 20;
            
            // Bounds check
            if (textY + 30 > H) {
              console.warn('QR code text would overflow in default layout');
              qrY = H - finalQrSize - textHeight - 10;
              textY = qrY + finalQrSize + 20;
            }
            
            console.log('[COMPOSE_RESULT] Default layout - QR position:', { 
              qrX, qrY, textX, textY, 
              canvasH: H, 
              qrSize: finalQrSize,
              paperWidth: W,
              qrSizePercent: `${(finalQrSize / W * 100).toFixed(1)}%`
            });
      }

          // Draw QR code
          console.log('[COMPOSE_RESULT] Drawing QR code at:', { x: qrX, y: qrY, size: finalQrSize });
          out.image(qrImg, qrX, qrY, finalQrSize, finalQrSize);
        
          // Add instruction text (standardized across all layouts)
        out.textSize(18);
        out.fill(0);
        out.noStroke();
        out.textAlign(out.CENTER);
        out.text('Scan untuk download', textX, textY);
        out.textSize(14);
        out.text('(Valid 24 jam)', textX, textY + 20);
        
          console.log('[COMPOSE_RESULT] QR code rendered successfully:', { 
            size: finalQrSize, 
            position: { x: qrX, y: qrY },
            paperWidth: W,
            qrSizePercent: `${(finalQrSize / W * 100).toFixed(1)}%`
          });
      }
      } catch (error) {
        console.error('[COMPOSE_RESULT] Error rendering QR code:', error);
        if (error instanceof Error) {
          console.error('[COMPOSE_RESULT] Error details:', error.message, error.stack);
        }
        console.log('[COMPOSE_RESULT] Composing without QR code due to error.');
      }
    }
  } else {
    console.log('[COMPOSE_RESULT] No QR code data provided. Composing without QR code.');
  }

  console.log('Composing complete. Ready for review.');
  return out;
}
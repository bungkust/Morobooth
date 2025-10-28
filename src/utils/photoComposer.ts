import { floydSteinbergDither } from './dithering';
import { loadConfig } from './config';

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
  
  for (let i = 0; i < template.photoCount; i++) {
    const pos = photoPositions[i];
    
    // Terapkan dither kualitas tinggi (Floyd-Steinberg)
    console.log(`Applying FS dither to frame ${i}...`);
    const ditheredFrame = floydSteinbergDither(p, frames[i]);
    console.log(`Dither complete for frame ${i}.`);

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

/**
 * Compose photos into a single strip with high-quality dithering based on template
 */
export async function composeResult(p: any, frames: any[], template: Template, qrCodeDataURL?: string): Promise<any> {
  console.log('Composing result...');
  console.log('QR Code provided:', !!qrCodeDataURL);
  
  // Load config for custom text
  const config = await loadConfig();
  console.log('Config loaded:', config);
  
  // Use template dimensions for flexible sizing
  const W = template.width * 16; // Convert mm to pixels (58mm * 16 = 928px)
  const margin = 24;
  const gap = 16;
  const cellW = W - margin * 2;
  const cellH = cellW; // Rasio 1:1
  const headerH = (config.mainText && config.mainText.trim()) || (config.subText && config.subText.trim()) ? 120 : 0; // Space for custom text
  
  // Calculate QR code space
  const qrSize = qrCodeDataURL ? 120 : 0;
  const qrSpace = qrCodeDataURL ? qrSize + 80 + 100 : 0; // QR (120px) + text (80px) + spacing (100px) = 300px

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
  
  // Render custom text header if provided
  if ((config.mainText && config.mainText.trim()) || (config.subText && config.subText.trim())) {
    out.fill(0);
    out.noStroke();
    out.textAlign(p.CENTER, p.CENTER);
    out.textFont('monospace');
    
    const headerY = margin + (headerH / 2);
    
    if (config.mainText && config.mainText.trim()) {
      out.textSize(48);
      out.text(config.mainText.trim(), W / 2, headerY - 15);
    }
    
    if (config.subText && config.subText.trim()) {
      out.textSize(32);
      out.text(config.subText.trim(), W / 2, headerY + 25);
    }
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
  
  for (let i = 0; i < template.photoCount; i++) {
    const pos = photoPositions[i];
    
    // Terapkan dither kualitas tinggi (Floyd-Steinberg)
    console.log(`Applying FS dither to frame ${i}...`);
    const ditheredFrame = floydSteinbergDither(p, frames[i]);
    console.log(`Dither complete for frame ${i}.`);

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
    console.log('Rendering QR code...');
    try {
      // Create QR code image synchronously
      const qrImg = p.createImg(qrCodeDataURL);
      qrImg.hide(); // Hide the image element
      
      const qrSize = 120;
      let qrX: number, qrY: number;
      let textX: number, textY: number;
      
      // Calculate QR code position based on template layout
      if (template.layout === 'vertical') {
        // Vertical layout: QR code below all photos with proper spacing
        const lastPhotoY = margin + headerH + 40 + 20 + (template.photoCount - 1) * (cellH + gap) + cellH;
        qrX = (W - qrSize) / 2;
        qrY = lastPhotoY + 80; // 80px spacing below last photo
        textX = W / 2;
        textY = qrY + qrSize + 30;
        
        console.log('Vertical layout - QR position:', { qrX, qrY, textX, textY, canvasH: H, lastPhotoY, qrSpace, qrSize });
        console.log('QR code bounds check:', { qrBottom: qrY + qrSize, textBottom: textY + 20, canvasHeight: H, fits: (qrY + qrSize + 50) <= H });
      } else if (template.layout === 'horizontal') {
        // Horizontal layout: QR code at right side with proper spacing
        const photoWidth = (W - margin * 2 - gap * (template.photoCount - 1)) / template.photoCount;
        const proportionalQrSize = Math.min(qrSize, photoWidth * 0.6);
        
        qrX = W - margin - proportionalQrSize;
        qrY = margin + headerH + 40 + 20 + photoWidth + 80;
        textX = qrX + proportionalQrSize / 2;
        textY = qrY + proportionalQrSize + 20;
        
        console.log('Horizontal layout - QR position:', { qrX, qrY, textX, textY, canvasH: H });
        
        // Draw QR code with proportional size
        out.image(qrImg, qrX, qrY, proportionalQrSize, proportionalQrSize);
        
        // Add instruction text
        out.textSize(16);
        out.fill(0);
        out.noStroke();
        out.textAlign(out.CENTER);
        out.text('Scan untuk download', textX, textY);
        out.textSize(12);
        out.text('(Valid 24 jam)', textX, textY + 20);
        
        console.log('Horizontal QR code rendered');
      } else if (template.layout === 'grid') {
        // Grid layout: QR code at bottom center with proportional sizing
        const cols = template.photoCount === 4 ? 2 : template.photoCount === 6 ? 3 : 2;
        const photoWidth = (W - margin * 2 - gap * (cols - 1)) / cols;
        const proportionalQrSize = Math.min(qrSize, photoWidth * 0.8);
        
        qrX = (W - proportionalQrSize) / 2;
        qrY = margin + headerH + 40 + 20 + photoWidth * Math.ceil(template.photoCount / cols) + gap * (Math.ceil(template.photoCount / cols) - 1) + 80;
        textX = W / 2;
        textY = qrY + proportionalQrSize + 20;
        
        console.log('Grid layout - QR position:', { qrX, qrY, textX, textY, canvasH: H, qrSpace, qrSize });
        console.log('Grid QR bounds check:', { qrBottom: qrY + proportionalQrSize, textBottom: textY + 20, canvasHeight: H, fits: (qrY + proportionalQrSize + 50) <= H });
        
        // Draw QR code with proportional size
        out.image(qrImg, qrX, qrY, proportionalQrSize, proportionalQrSize);
        
        // Add instruction text
        out.textSize(16);
        out.fill(0);
        out.noStroke();
        out.textAlign(out.CENTER);
        out.text('Scan untuk download', textX, textY);
        out.textSize(12);
        out.text('(Valid 24 jam)', textX, textY + 20);
        
        console.log('Grid QR code rendered');
      } else {
        // Default layout (e.g., single photo)
        qrX = (W - qrSize) / 2;
        qrY = margin + headerH + 40 + 20 + cellH + 80;
        textX = W / 2;
        textY = qrY + qrSize + 30;
        
        console.log('Default layout - QR position:', { qrX, qrY, textX, textY, canvasH: H, qrSpace, qrSize });
        console.log('Default QR bounds check:', { qrBottom: qrY + qrSize, textBottom: textY + 20, canvasHeight: H, fits: (qrY + qrSize + 50) <= H });
      }

      // Draw QR code for vertical and default layouts
      if (template.layout === 'vertical' || !template.layout) {
        out.image(qrImg, qrX, qrY, qrSize, qrSize);
        
        // Add instruction text
        out.textSize(18);
        out.fill(0);
        out.noStroke();
        out.textAlign(out.CENTER);
        out.text('Scan untuk download', textX, textY);
        out.textSize(14);
        out.text('(Valid 24 jam)', textX, textY + 20);
        
        console.log('Vertical/Default QR code rendered');
      }
      
      console.log('QR code rendering complete');
    } catch (error) {
      console.error('Error rendering QR code:', error);
    }
  } else {
    console.log('No QR code data provided. Composing without QR code.');
  }

  console.log('Composing complete. Ready for review.');
  return out;
}
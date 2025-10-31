/**
 * Dithering Bayer (Ordered) 4x4.
 * Fast dithering for real-time preview.
 */
export function orderedDither(gfx: any): void {
  gfx.loadPixels();
  
  const M4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  
  const M = M4;
  const n = M.length;
  const n2 = n * n;
  const scale = 255 / n2; // Skala threshold (255 / 16)

  for (let y = 0; y < gfx.height; y++) {
    for (let x = 0; x < gfx.width; x++) {
      const idx = (y * gfx.width + x) * 4;
      const lum = gfx.pixels[idx]; // Ambil nilai R (sudah grayscale)
      const threshold = M[y % n][x % n] * scale;
      const v = lum < threshold ? 0 : 255;
      
      gfx.pixels[idx] = v;
      gfx.pixels[idx + 1] = v;
      gfx.pixels[idx + 2] = v;
    }
  }
  gfx.updatePixels();
}

/**
 * Dithering Floyd-Steinberg.
 * High quality, slow. For final composition.
 */
export function floydSteinbergDither(p: any, img: any): any {
  const ditheredImg = p.createImage(img.width, img.height);
  ditheredImg.copy(img, 0, 0, img.width, img.height, 0, 0, ditheredImg.width, ditheredImg.height);
  
  ditheredImg.loadPixels();
  
  const getPix = (x: number, y: number): number => {
    if (x < 0 || x >= ditheredImg.width || y < 0 || y >= ditheredImg.height) return 0;
    return ditheredImg.pixels[(y * ditheredImg.width + x) * 4];
  };
  
  const setPix = (x: number, y: number, val: number): void => {
    if (x < 0 || x >= ditheredImg.width || y < 0 || y >= ditheredImg.height) return;
    const idx = (y * ditheredImg.width + x) * 4;
    const v = p.constrain(val, 0, 255); // Pastikan nilai valid
    ditheredImg.pixels[idx] = v;
    ditheredImg.pixels[idx + 1] = v;
    ditheredImg.pixels[idx + 2] = v;
    ditheredImg.pixels[idx + 3] = 255;
  };

  for (let y = 0; y < ditheredImg.height; y++) {
    for (let x = 0; x < ditheredImg.width; x++) {
      const oldVal = getPix(x, y);
      const newVal = (oldVal < 128) ? 0 : 255; // Threshold 50%
      setPix(x, y, newVal);

      const err = oldVal - newVal;

      // Distribusikan error ke piksel tetangga
      setPix(x + 1, y,     getPix(x + 1, y)     + err * 7 / 16);
      setPix(x - 1, y + 1, getPix(x - 1, y + 1) + err * 3 / 16);
      setPix(x,     y + 1, getPix(x,     y + 1) + err * 5 / 16);
      setPix(x + 1, y + 1, getPix(x + 1, y + 1) + err * 1 / 16);
    }
  }
  ditheredImg.updatePixels();
  return ditheredImg;
}

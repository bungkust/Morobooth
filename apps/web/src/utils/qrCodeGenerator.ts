import QRCode from 'qrcode';

export async function generateQRCodeDataURL(url: string): Promise<string> {
  try {
    console.log('Generating QR code for URL:', url);
    const dataURL = await QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
    console.log('QR code generated successfully, length:', dataURL.length);
    return dataURL;
  } catch (error) {
    console.error('QR generation failed:', error);
    return '';
  }
}

export function getDownloadURL(photoId: string): string {
  const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${baseUrl}/download/${photoId}`;
}

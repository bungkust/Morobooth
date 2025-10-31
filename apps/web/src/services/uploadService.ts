import { supabase } from '../config/supabase';
import type { PhotoRecord } from './photoStorageService';

export interface UploadResult {
  success: boolean;
  photoId: string;
  url?: string;
  error?: string;
}

async function dataURLtoBlob(dataURL: string): Promise<Blob> {
  const response = await fetch(dataURL);
  return response.blob();
}

export async function uploadPhotoToSupabase(photo: PhotoRecord): Promise<UploadResult> {
  if (!supabase) {
    return {
      success: false,
      photoId: photo.id,
      error: 'Supabase not configured'
    };
  }
  
  try {
    const blob = await dataURLtoBlob(photo.imageDataURL);
    const filename = `${photo.id}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(filename, blob, {
        contentType: 'image/png',
        upsert: false
      });
    
    if (uploadError) throw uploadError;
    
    // Get signed URL (24 hours)
    const { data: signedData, error: signError } = await supabase.storage
      .from('photos')
      .createSignedUrl(filename, 86400); // 24 hours
    
    if (signError) throw signError;
    
    return {
      success: true,
      photoId: photo.id,
      url: signedData.signedUrl
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      photoId: photo.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function bulkUploadPhotos(photos: PhotoRecord[]): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  
  for (const photo of photos) {
    const result = await uploadPhotoToSupabase(photo);
    results.push(result);
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

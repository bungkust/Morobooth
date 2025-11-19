import { supabase } from '../config/supabase';
import type { PhotoRecord } from './photoStorageService';

export interface UploadResult {
  success: boolean;
  photoId: string;
  url?: string; // Signed URL (temporary, for backward compatibility)
  path?: string; // Permanent path in Supabase storage (e.g., "ABC123-001.png")
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
    
    // Get signed URL (24 hours) - for backward compatibility
    const { data: signedData, error: signError } = await supabase.storage
      .from('photos')
      .createSignedUrl(filename, 86400); // 24 hours
    
    if (signError) throw signError;
    
    return {
      success: true,
      photoId: photo.id,
      url: signedData.signedUrl, // Temporary signed URL
      path: filename // Permanent path in storage
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

/**
 * Generate fresh signed URL on-demand for a photo in Supabase storage
 * @param supabasePath - Path to the photo in Supabase storage (e.g., "ABC123-001.png")
 * @returns Fresh signed URL valid for 24 hours, or null on error
 */
export async function getFreshSignedUrl(supabasePath: string): Promise<string | null> {
  if (!supabase) {
    console.error('Supabase not configured');
    return null;
  }
  
  if (!supabasePath) {
    console.error('supabasePath is required');
    return null;
  }
  
  try {
    const { data, error } = await supabase.storage
      .from('photos')
      .createSignedUrl(supabasePath, 86400); // 24 hours
    
    if (error) {
      console.error('Failed to generate fresh signed URL:', error);
      return null;
    }
    
    if (!data || !data.signedUrl) {
      console.error('No signed URL returned from Supabase');
      return null;
    }
    
    return data.signedUrl;
  } catch (error) {
    console.error('Error generating fresh signed URL:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return null;
  }
}

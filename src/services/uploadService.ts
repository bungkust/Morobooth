import { supabase } from '../config/supabase';
import type { PhotoRecord } from './photoStorageService';

export interface UploadResult {
  success: boolean;
  photoId: string;
  url?: string; // Signed URL (temporary, for backward compatibility)
  path?: string; // Permanent path in Supabase storage (e.g., "ABC123/ABC123-001.png")
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
    // Use folder structure: sessionCode/photoId.png
    const filePath = `${photo.sessionCode}/${photo.id}.png`;
    const filename = photo.id; // Just the filename without path for display
    
    // Check if file already exists to handle duplicate uploads gracefully
    // List files in the session folder
    const { data: existingFiles, error: listError } = await supabase.storage
      .from('photos')
      .list(photo.sessionCode, {
        search: `${photo.id}.png`
      });
    
    // Handle list operation errors (folder might not exist yet, which is okay)
    if (listError) {
      // Log the error but don't block upload - upsert: true will handle duplicates anyway
      // Folder might not exist yet, which is fine - it will be created on upload
      console.warn(`[UPLOAD] Failed to check if file exists (non-fatal, folder might not exist yet):`, listError.message);
      console.warn(`[UPLOAD] Proceeding with upload anyway (upsert will handle duplicates)`);
    }
    
    // Only check fileExists if list operation succeeded
    const fileExists = !listError && existingFiles && existingFiles.length > 0 && 
                      existingFiles.some(f => f.name === `${photo.id}.png`);
    
    if (fileExists) {
      console.log(`[UPLOAD] File ${filePath} already exists, skipping upload but generating signed URL`);
    } else {
      // Upload file with folder structure (use upsert: true to handle edge cases where file might exist)
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, blob, {
          contentType: 'image/png',
          upsert: true // Allow overwrite if file exists (handles edge cases)
        });
      
      if (uploadError) {
        // If upload fails with "already exists" error, that's okay - file is already there
        if (uploadError.message?.includes('already exists') || uploadError.message?.includes('duplicate')) {
          console.log(`[UPLOAD] File ${filePath} already exists (detected via error), proceeding with signed URL generation`);
        } else {
          throw uploadError;
        }
      } else {
        console.log(`[UPLOAD] Successfully uploaded ${filePath}`);
      }
    }
    
    // Get signed URL (24 hours) - for backward compatibility
    // Use filePath (with folder structure) for signed URL generation
    const { data: signedData, error: signError } = await supabase.storage
      .from('photos')
      .createSignedUrl(filePath, 86400); // 24 hours
    
    if (signError) throw signError;
    
    return {
      success: true,
      photoId: photo.id,
      url: signedData.signedUrl, // Temporary signed URL
      path: filePath // Permanent path in storage: "sessionCode/photoId.png"
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
 * @param supabasePath - Path to the photo in Supabase storage (e.g., "ABC123/ABC123-001.png" for new format, or "ABC123-001.png" for old format - backward compatibility)
 * @returns Fresh signed URL valid for 24 hours, or null on error
 */
export async function getFreshSignedUrl(supabasePath: string): Promise<string | null> {
  if (!supabase) {
    console.error('[GET_FRESH_SIGNED_URL] Supabase not configured');
    return null;
  }
  
  if (!supabasePath) {
    console.error('[GET_FRESH_SIGNED_URL] supabasePath is required');
    return null;
  }
  
  try {
    // Detect path format: new format has "/" (folder structure), old format doesn't
    const isNewFormat = supabasePath.includes('/');
    
    if (!isNewFormat) {
      // Old format (backward compatibility): path without folder (e.g., "ABC123-001.png")
      console.warn(`[GET_FRESH_SIGNED_URL] Old path format detected: ${supabasePath}. This photo was uploaded before folder structure was implemented.`);
    } else {
      console.log(`[GET_FRESH_SIGNED_URL] Using new path format: ${supabasePath}`);
    }
    
    // Use the path as-is (both formats work with Supabase storage)
    const { data, error } = await supabase.storage
      .from('photos')
      .createSignedUrl(supabasePath, 86400); // 24 hours
    
    if (error) {
      console.error('[GET_FRESH_SIGNED_URL] Failed to generate fresh signed URL:', error);
      console.error('[GET_FRESH_SIGNED_URL] Path used:', supabasePath);
      return null;
    }
    
    if (!data || !data.signedUrl) {
      console.error('[GET_FRESH_SIGNED_URL] No signed URL returned from Supabase');
      return null;
    }
    
    console.log(`[GET_FRESH_SIGNED_URL] Successfully generated signed URL for path: ${supabasePath}`);
    return data.signedUrl;
  } catch (error) {
    console.error('[GET_FRESH_SIGNED_URL] Error generating fresh signed URL:', error);
    if (error instanceof Error) {
      console.error('[GET_FRESH_SIGNED_URL] Error details:', error.message, error.stack);
    }
    return null;
  }
}

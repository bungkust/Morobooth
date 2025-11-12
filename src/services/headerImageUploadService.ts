import { supabase, isSupabaseConfigured } from '../config/supabase';

const BUCKET_NAME = 'config-images'; // Bucket untuk config images
const MAX_WIDTH = 1200; // Max width untuk header image
const MAX_FILE_SIZE = 1024 * 1024; // 1MB max file size setelah optimasi
const WEBP_QUALITY = 0.85; // WebP quality (0-1)

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Convert image file to optimized WebP Blob
 * - Resize if too large (max 1200px width)
 * - Convert to WebP format
 * - Compress to reduce file size
 */
async function optimizeImageToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Failed to create canvas context'));
      return;
    }
    
    img.onload = () => {
      try {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to WebP (with JPEG fallback if WebP not supported)
        const tryWebP = (quality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                // WebP not supported, fallback to JPEG
                canvas.toBlob(
                  (jpegBlob) => {
                    if (!jpegBlob) {
                      reject(new Error('Failed to convert image'));
                      return;
                    }
                    resolve(jpegBlob);
                  },
                  'image/jpeg',
                  quality
                );
                return;
              }
              
              // Check file size
              if (blob.size > MAX_FILE_SIZE && quality > 0.5) {
                // Try with lower quality
                tryWebP(quality * 0.7);
              } else {
                resolve(blob);
              }
            },
            'image/webp',
            quality
          );
        };
        
        tryWebP(WEBP_QUALITY);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // Load image
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        img.src = e.target.result as string;
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Upload header image to Supabase Storage as WebP
 */
export async function uploadHeaderImage(file: File, sessionCode?: string): Promise<ImageUploadResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      success: false,
      error: 'Supabase not configured'
    };
  }
  
  try {
    // Optimize image to WebP (with JPEG fallback)
    const optimizedBlob = await optimizeImageToWebP(file);
    
    // Detect blob type (WebP or JPEG fallback)
    const isWebP = optimizedBlob.type === 'image/webp';
    const extension = isWebP ? 'webp' : 'jpg';
    const contentType = isWebP ? 'image/webp' : 'image/jpeg';
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const filename = `header-${sessionCode || 'default'}-${timestamp}-${randomId}.${extension}`;
    const filepath = `headers/${filename}`;
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filepath, optimizedBlob, {
        contentType: contentType,
        upsert: false // Don't overwrite existing files
      });
    
    if (uploadError) {
      // If bucket doesn't exist, try fallback to 'photos' bucket
      if (uploadError.message.includes('bucket') || uploadError.message.includes('not found')) {
        console.warn('Bucket not found, attempting fallback to photos bucket...');
        const { error: fallbackError } = await supabase.storage
          .from('photos')
          .upload(`config/${filepath}`, optimizedBlob, {
            contentType: contentType,
            upsert: false
          });
        
        if (fallbackError) {
          throw fallbackError;
        }
        
        // Get public URL from photos bucket
        const { data: publicData } = supabase.storage
          .from('photos')
          .getPublicUrl(`config/${filepath}`);
        
        return {
          success: true,
          url: publicData.publicUrl
        };
      }
      throw uploadError;
    }
    
    // Get public URL (if bucket is public) or signed URL
    const { data: publicData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filepath);
    
    // Try public URL first
    if (publicData?.publicUrl) {
      return {
        success: true,
        url: publicData.publicUrl
      };
    }
    
    // Fall back to signed URL (1 year)
    const { data: signedData, error: signError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filepath, 86400 * 365); // 1 year
    
    if (signError) {
      throw signError;
    }
    
    return {
      success: true,
      url: signedData.signedUrl
    };
  } catch (error) {
    console.error('Upload header image error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Delete header image from Supabase Storage
 */
export async function deleteHeaderImage(imageUrl: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) {
    return false;
  }
  
  try {
    // Extract filepath from URL
    // URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
    const urlMatch = imageUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
    if (!urlMatch) {
      console.warn('Invalid image URL format:', imageUrl);
      return false;
    }
    
    const bucketName = urlMatch[1];
    const filepath = urlMatch[2];
    
    const { error } = await supabase.storage
      .from(bucketName)
      .remove([filepath]);
    
    if (error) {
      console.error('Delete header image error:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Delete header image error:', error);
    return false;
  }
}


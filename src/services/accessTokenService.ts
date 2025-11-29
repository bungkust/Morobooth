import { supabase, isSupabaseConfigured } from '../config/supabase';

/**
 * Generate a secure random access token
 * Format: base64url encoded 32-byte random string
 * Example: aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5z
 */
export async function generateAccessToken(): Promise<string> {
  // Generate 32 random bytes
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  
  // Convert to base64url (URL-safe base64)
  // Base64url uses - and _ instead of + and /
  const base64 = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, ''); // Remove padding
  
  return base64;
}

/**
 * Check if access token already exists in database
 */
async function checkTokenExists(token: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) {
    return false; // If Supabase not configured, assume token is unique
  }
  
  try {
    const { data, error } = await supabase
      .from('photos')
      .select('access_token')
      .eq('access_token', token)
      .limit(1);
    
    if (error) {
      console.warn('[AccessToken] Error checking token existence:', error);
      return false; // On error, assume token doesn't exist (will be caught on insert)
    }
    
    return (data && data.length > 0);
  } catch (err) {
    console.warn('[AccessToken] Exception checking token existence:', err);
    return false;
  }
}

/**
 * Generate a unique access token with collision detection and retry
 * @param retries Maximum number of retries if collision occurs (default: 3)
 */
export async function generateUniqueAccessToken(retries: number = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    const token = await generateAccessToken();
    const exists = await checkTokenExists(token);
    
    if (!exists) {
      return token;
    }
    
    console.warn(`[AccessToken] Token collision detected (attempt ${i + 1}/${retries}), generating new token...`);
  }
  
  throw new Error(`Failed to generate unique access token after ${retries} attempts`);
}

/**
 * Save access token to Supabase database
 * @param photoId The photo ID (UUID)
 * @param token The access token to save
 * @returns true if successful, false otherwise
 */
export async function saveAccessTokenToSupabase(photoId: string, token: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) {
    console.warn('[AccessToken] Supabase not configured, cannot save token');
    return false;
  }
  
  try {
    const { error } = await supabase
      .from('photos')
      .update({ access_token: token })
      .eq('photo_id', photoId);
    
    if (error) {
      console.error('[AccessToken] Failed to save token to Supabase:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('[AccessToken] Exception saving token to Supabase:', err);
    return false;
  }
}

/**
 * Hash token for logging (SHA-256)
 * Used in access logs to maintain privacy
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Fetch access token from database for a photo
 * @param photoId The photo ID (UUID)
 * @returns The access token, or null if not found
 */
export async function fetchAccessTokenFromSupabase(photoId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) {
    console.warn('[AccessToken] Supabase not configured, cannot fetch token');
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('photos')
      .select('access_token')
      .eq('photo_id', photoId)
      .single();
    
    if (error) {
      console.error('[AccessToken] Failed to fetch token from Supabase:', error);
      return null;
    }
    
    return data?.access_token || null;
  } catch (err) {
    console.error('[AccessToken] Exception fetching token from Supabase:', err);
    return null;
  }
}


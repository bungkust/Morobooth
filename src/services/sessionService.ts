import { openDB } from 'idb';
import { nanoid } from 'nanoid';
import { supabase, isSupabaseConfigured } from '../config/supabase';

export interface SessionSettings {
  // Expired settings
  photoExpiredHours: number; // Default: 24
  enableExpiredCheck: boolean; // Default: true
  
  // Delete settings
  autoDeleteDays: number; // Default: 30 (untuk database records)
  storageDeleteDays: number; // Default: 5 (untuk storage files)
  enableAutoDelete: boolean; // Default: true
  
  // Other settings
  maxPhotos?: number; // Optional: limit jumlah photos per session
  allowDownloadAfterExpired?: boolean; // Default: false
}

export interface SessionInfo {
  sessionCode: string;
  eventName: string;
  createdAt: string;
  photoCount: number;
  settings?: SessionSettings; // Optional untuk backward compatibility
}

const DB_NAME = 'morobooth-db';
const SESSION_STORE = 'sessions';
const PHOTO_STORE = 'photos';
const SESSIONS_TABLE = 'sessions';

// Lock mechanism to prevent race conditions
let incrementLock = false;
const lockTimeout = 5000; // 5 seconds max wait

function mapSupabaseSession(row: any): SessionInfo {
  const session: SessionInfo = {
    sessionCode: row.session_code,
    eventName: row.event_name,
    createdAt: row.created_at ?? new Date().toISOString(),
    photoCount: row.photo_count ?? 0,
  };
  
  // Map settings if available
  if (row.photo_expired_hours !== undefined || row.enable_expired_check !== undefined) {
    session.settings = {
      photoExpiredHours: row.photo_expired_hours ?? 24,
      enableExpiredCheck: row.enable_expired_check ?? true,
      autoDeleteDays: row.auto_delete_days ?? 30,
      storageDeleteDays: row.storage_delete_days ?? 5,
      enableAutoDelete: row.enable_auto_delete ?? true,
      maxPhotos: row.max_photos ?? undefined,
      allowDownloadAfterExpired: row.allow_download_after_expired ?? false
    };
  }
  
  return session;
}

async function getDB() {
  return openDB(DB_NAME, 4, {
    upgrade(db, oldVersion, newVersion) {
      // Create sessions store
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'sessionCode' });
      }
      
      // Create photos store (if not exists, photoStorageService will handle it)
      // Note: photoStorageService handles its own migrations, so we only create if it doesn't exist
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        store.createIndex('sessionCode', 'sessionCode');
        store.createIndex('uploaded', 'uploaded');
      }
      
      // Migration from version 3 to 4: handled by photoStorageService
      // sessionService doesn't need to do anything for v4 migration
      if (oldVersion < 4 && newVersion === 4) {
        console.log('[SessionService] Database upgraded from version', oldVersion, 'to', newVersion);
        // Migration logic is handled by photoStorageService
      }
    }
  });
}

export async function getCurrentSession(): Promise<SessionInfo | null> {
  console.log('[GET_SESSION] Getting current session');
  
  // PRIORITIZE IndexedDB as source of truth (fixes state inconsistency)
  try {
    const db = await getDB();
    const allSessions = await db.getAll(SESSION_STORE);
    if (allSessions && allSessions.length > 0) {
      // Get most recent session
      const latestSession = allSessions.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      
      console.log('[GET_SESSION] ✓ Session found in IndexedDB:', latestSession.sessionCode);
      
      // Sync to localStorage (non-blocking, non-fatal)
      try {
        localStorage.setItem('currentSession', JSON.stringify(latestSession));
        console.log('[GET_SESSION] ✓ Session synced to localStorage');
      } catch (e) {
        // Non-fatal: localStorage might be full or blocked, but IndexedDB is source of truth
        console.warn('[GET_SESSION] Failed to sync to localStorage (non-fatal):', e);
      }
      
      return latestSession;
    }
  } catch (e) {
    console.error('[GET_SESSION] Failed to get session from IndexedDB:', e);
  }
  
  // Fallback to localStorage only if IndexedDB fails completely
  console.log('[GET_SESSION] Falling back to localStorage...');
  try {
    const stored = localStorage.getItem('currentSession');
    if (stored) {
      const session = JSON.parse(stored);
      if (session && session.sessionCode) {
        console.log('[GET_SESSION] ✓ Session found in localStorage (fallback):', session.sessionCode);
        return session;
      }
    }
  } catch (e) {
    console.warn('[GET_SESSION] Failed to parse localStorage session:', e);
  }
  
  console.log('[GET_SESSION] No session found');
  return null;
}

export async function createSession(eventName: string): Promise<SessionInfo> {
  const prefix = eventName.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const suffix = nanoid(6).toUpperCase();
  const sessionCode = `${prefix}-${suffix}`;
  
  const session: SessionInfo = {
    sessionCode,
    eventName,
    createdAt: new Date().toISOString(),
    photoCount: 0
  };
  
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from(SESSIONS_TABLE).insert({
      session_code: session.sessionCode,
      event_name: session.eventName,
      created_at: session.createdAt,
      photo_count: session.photoCount,
      is_active: true
    });
    if (error) {
      console.error('Supabase createSession error:', error);
    }
  }

  const db = await getDB();
  await db.put(SESSION_STORE, session);
  localStorage.setItem('currentSession', JSON.stringify(session));
  
  return session;
}

export async function incrementPhotoCount(): Promise<number> {
  console.log('[INCREMENT_PHOTO_COUNT] Starting incrementPhotoCount');
  
  // Prevent concurrent calls with timeout
  if (incrementLock) {
    console.log('[INCREMENT_PHOTO_COUNT] Locked, waiting...');
    const startTime = Date.now();
    while (incrementLock && (Date.now() - startTime) < lockTimeout) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (incrementLock) {
      throw new Error('incrementPhotoCount timeout - previous operation still in progress');
    }
    // Retry after lock released
    console.log('[INCREMENT_PHOTO_COUNT] Lock released, retrying...');
    return incrementPhotoCount();
  }
  
  incrementLock = true;
  try {
    // Get current session (with IndexedDB fallback)
    console.log('[INCREMENT_PHOTO_COUNT] Step 1: Getting current session');
    const session = await getCurrentSession();
    if (!session) {
      console.error('[INCREMENT_PHOTO_COUNT] ERROR: No active session found');
      throw new Error('No active session');
    }
    console.log('[INCREMENT_PHOTO_COUNT] ✓ Session found:', session.sessionCode);
    console.log('[INCREMENT_PHOTO_COUNT] Current photoCount:', session.photoCount);
    
    // Create immutable updated session
    const oldCount = session.photoCount;
    const updatedSession: SessionInfo = {
      ...session,
      photoCount: session.photoCount + 1
    };
    console.log('[INCREMENT_PHOTO_COUNT] Photo count incremented from', oldCount, 'to', updatedSession.photoCount);
    
    // Update Supabase (non-blocking, log error but don't fail)
    if (isSupabaseConfigured() && supabase) {
      console.log('[INCREMENT_PHOTO_COUNT] Step 2: Updating Supabase');
      try {
        const { error } = await supabase
          .from(SESSIONS_TABLE)
          .update({ photo_count: updatedSession.photoCount })
          .eq('session_code', updatedSession.sessionCode);
        if (error) {
          console.error('[INCREMENT_PHOTO_COUNT] Supabase update error (non-fatal):', error);
        } else {
          console.log('[INCREMENT_PHOTO_COUNT] ✓ Supabase updated successfully');
        }
      } catch (supabaseError) {
        console.error('[INCREMENT_PHOTO_COUNT] Supabase update exception (non-fatal):', supabaseError);
      }
    } else {
      console.log('[INCREMENT_PHOTO_COUNT] Supabase not configured, skipping');
    }
    
    // Update IndexedDB with transaction (with retry mechanism)
    console.log('[INCREMENT_PHOTO_COUNT] Step 3: Updating IndexedDB');
    let dbError: any = null;
    let retries = 0;
    const maxRetries = 3;
    const retryDelay = 200; // ms
    
    while (retries < maxRetries) {
      try {
        const db = await getDB();
        console.log('[INCREMENT_PHOTO_COUNT] ✓ Database connection opened (attempt', retries + 1, ')');
        console.log('[INCREMENT_PHOTO_COUNT] Attempting to save session:', {
          sessionCode: updatedSession.sessionCode,
          eventName: updatedSession.eventName,
          photoCount: updatedSession.photoCount,
          createdAt: updatedSession.createdAt
        });
        
        // Use transaction for atomicity
        const tx = db.transaction(SESSION_STORE, 'readwrite');
        await tx.store.put(updatedSession);
        await tx.done;
        
        console.log('[INCREMENT_PHOTO_COUNT] ✓ Session saved to IndexedDB');
        dbError = null; // Success, clear error
        break; // Exit retry loop
      } catch (error: any) {
        dbError = error;
        retries++;
        
        console.error(`[INCREMENT_PHOTO_COUNT] IndexedDB save attempt ${retries} failed:`, {
          name: error?.name,
          message: error?.message,
          code: error?.code
        });
        
        // Check for quota exceeded error (no retry)
        if (error.name === 'QuotaExceededError' || error.message?.includes('quota')) {
          console.error('[INCREMENT_PHOTO_COUNT] ERROR TYPE: QuotaExceededError');
          throw new Error('Storage quota exceeded. Please clear some data.');
        }
        
        // Retry for transaction errors
        if (error.name === 'TransactionInactiveError' || 
            error.message?.includes('transaction') ||
            error.message?.includes('busy') ||
            error.message?.includes('locked')) {
          
          if (retries < maxRetries) {
            const delay = retryDelay * retries;
            console.log(`[INCREMENT_PHOTO_COUNT] Retrying in ${delay}ms... (attempt ${retries + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Retry
          } else {
            console.error('[INCREMENT_PHOTO_COUNT] ERROR TYPE: TransactionInactiveError (max retries reached)');
            throw new Error('Database is busy. Please wait a moment and try again.');
          }
        }
        
        // For other errors, don't retry if it's not a transient error
        if (retries >= maxRetries) {
          break; // Exit retry loop, will throw error below
        }
        
        // Wait before retry for other errors
        const delay = retryDelay * retries;
        console.log(`[INCREMENT_PHOTO_COUNT] Retrying in ${delay}ms... (attempt ${retries + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we exited the loop with an error, throw it
    if (dbError) {
      console.error('[INCREMENT_PHOTO_COUNT] ERROR: IndexedDB save failed after', maxRetries, 'attempts');
      console.error('[INCREMENT_PHOTO_COUNT] Final error name:', dbError?.name);
      console.error('[INCREMENT_PHOTO_COUNT] Final error message:', dbError?.message);
      console.error('[INCREMENT_PHOTO_COUNT] Final error code:', dbError?.code);
      console.error('[INCREMENT_PHOTO_COUNT] Final error stack:', dbError?.stack);
      
      throw new Error(`Failed to save session to database: ${dbError.message || dbError.name || 'Unknown error'}`);
    }
    
    // Update localStorage (after IndexedDB success) - non-blocking, non-fatal
    // IndexedDB is source of truth, so localStorage failure is not critical
    console.log('[INCREMENT_PHOTO_COUNT] Step 4: Updating localStorage (non-blocking)');
    try {
      localStorage.setItem('currentSession', JSON.stringify(updatedSession));
      console.log('[INCREMENT_PHOTO_COUNT] ✓ localStorage updated');
    } catch (storageError: any) {
      // Non-fatal: IndexedDB is source of truth, localStorage is just cache
      console.warn('[INCREMENT_PHOTO_COUNT] WARNING: localStorage update failed (non-fatal)');
      console.warn('[INCREMENT_PHOTO_COUNT] Storage error:', storageError);
      
      // Log specific error type for debugging
      if (storageError.name === 'QuotaExceededError' || storageError.message?.includes('quota')) {
        console.warn('[INCREMENT_PHOTO_COUNT] localStorage quota exceeded (IndexedDB is source of truth)');
      } else {
        console.warn('[INCREMENT_PHOTO_COUNT] localStorage update failed (IndexedDB is source of truth)');
      }
      // Don't throw - IndexedDB already succeeded, this is just a cache update
    }
    
    console.log('[INCREMENT_PHOTO_COUNT] SUCCESS: incrementPhotoCount completed');
    console.log('[INCREMENT_PHOTO_COUNT] New photoCount:', updatedSession.photoCount);
    return updatedSession.photoCount;
  } catch (error) {
    console.error('[INCREMENT_PHOTO_COUNT] ERROR: incrementPhotoCount failed');
    console.error('[INCREMENT_PHOTO_COUNT] Error type:', typeof error);
    if (error instanceof Error) {
      console.error('[INCREMENT_PHOTO_COUNT] Error name:', error.name);
      console.error('[INCREMENT_PHOTO_COUNT] Error message:', error.message);
      console.error('[INCREMENT_PHOTO_COUNT] Error stack:', error.stack);
    } else {
      console.error('[INCREMENT_PHOTO_COUNT] Error value:', String(error));
    }
    throw error;
  } finally {
    incrementLock = false;
    console.log('[INCREMENT_PHOTO_COUNT] Lock released');
  }
}

export async function getAllSessions(): Promise<SessionInfo[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase getAllSessions error:', error);
    } else if (data) {
      return data.map(mapSupabaseSession);
    }
  }

  const db = await getDB();
  return db.getAll(SESSION_STORE);
}

export async function getSessionByCode(sessionCode: string): Promise<SessionInfo | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .select('*')
      .eq('session_code', sessionCode)
      .single();

    if (error) {
      console.error('Supabase getSessionByCode error:', error);
      return null;
    }
    
    if (data) {
      return mapSupabaseSession(data);
    }
  }

  // Fallback to IndexedDB
  try {
    const db = await getDB();
    const session = await db.get(SESSION_STORE, sessionCode);
    return session || null;
  } catch (err) {
    console.error('IndexedDB getSessionByCode error:', err);
    return null;
  }
}

export async function updateSessionSettings(sessionCode: string, settings: SessionSettings): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) {
    console.warn('Supabase not configured, cannot update session settings');
    return false;
  }

  try {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({
        photo_expired_hours: settings.photoExpiredHours,
        enable_expired_check: settings.enableExpiredCheck,
        auto_delete_days: settings.autoDeleteDays,
        storage_delete_days: settings.storageDeleteDays,
        enable_auto_delete: settings.enableAutoDelete,
        max_photos: settings.maxPhotos ?? null,
        allow_download_after_expired: settings.allowDownloadAfterExpired
      })
      .eq('session_code', sessionCode);

    if (error) {
      console.error('Supabase updateSessionSettings error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error updating session settings:', err);
    return false;
  }
}

export function getDefaultSessionSettings(): SessionSettings {
  return {
    photoExpiredHours: 24,
    enableExpiredCheck: true,
    autoDeleteDays: 30,
    storageDeleteDays: 5,
    enableAutoDelete: true,
    allowDownloadAfterExpired: false
  };
}

export async function clearSession() {
  const current = await getCurrentSession();
  if (isSupabaseConfigured() && supabase && current) {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ is_active: false })
      .eq('session_code', current.sessionCode);
    if (error) {
      console.error('Supabase clearSession error:', error);
    }
  }

  localStorage.removeItem('currentSession');
}

export async function activateSession(sessionCode: string): Promise<SessionInfo | null> {
  console.log('[ACTIVATE_SESSION] Activating session:', sessionCode);
  
  // Get all sessions to find the one to activate
  const allSessions = await getAllSessions();
  const sessionToActivate = allSessions.find(s => s.sessionCode === sessionCode);
  
  if (!sessionToActivate) {
    console.error('[ACTIVATE_SESSION] Session not found:', sessionCode);
    throw new Error(`Session ${sessionCode} not found`);
  }
  
  // Update Supabase: set all sessions to inactive, then set selected one to active
  if (isSupabaseConfigured() && supabase) {
    try {
      // First, set all sessions to inactive (need WHERE clause for Supabase security)
      const { error: updateAllError } = await supabase
        .from(SESSIONS_TABLE)
        .update({ is_active: false })
        .neq('session_code', ''); // WHERE clause required by Supabase
      
      if (updateAllError) {
        console.error('[ACTIVATE_SESSION] Supabase update all error:', updateAllError);
      } else {
        console.log('[ACTIVATE_SESSION] ✓ All sessions set to inactive');
      }
      
      // Then, set the selected session to active
      const { error: updateError } = await supabase
        .from(SESSIONS_TABLE)
        .update({ is_active: true })
        .eq('session_code', sessionCode);
      
      if (updateError) {
        console.error('[ACTIVATE_SESSION] Supabase update error:', updateError);
      } else {
        console.log('[ACTIVATE_SESSION] ✓ Session activated in Supabase');
      }
    } catch (supabaseError) {
      console.error('[ACTIVATE_SESSION] Supabase exception (non-fatal):', supabaseError);
    }
  }
  
  // Update IndexedDB
  try {
    const db = await getDB();
    await db.put(SESSION_STORE, sessionToActivate);
    console.log('[ACTIVATE_SESSION] ✓ Session saved to IndexedDB');
  } catch (dbError) {
    console.error('[ACTIVATE_SESSION] IndexedDB error:', dbError);
    throw new Error('Failed to save session to database');
  }
  
  // Update localStorage
  try {
    localStorage.setItem('currentSession', JSON.stringify(sessionToActivate));
    console.log('[ACTIVATE_SESSION] ✓ Session saved to localStorage');
  } catch (storageError) {
    console.warn('[ACTIVATE_SESSION] localStorage error (non-fatal):', storageError);
  }
  
  console.log('[ACTIVATE_SESSION] SUCCESS: Session activated:', sessionCode);
  return sessionToActivate;
}

export async function clearAllData() {
  try {
    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.from(SESSIONS_TABLE).delete().neq('session_code', '');
      if (error) {
        console.error('Supabase clearAllData error:', error);
      }
    }

    const db = await getDB();
    await db.clear(SESSION_STORE);
    await db.clear(PHOTO_STORE);
    localStorage.removeItem('currentSession');
  } catch (error) {
    console.error('Error clearing data:', error);
    // Fallback: clear localStorage
    localStorage.removeItem('currentSession');
  }
}

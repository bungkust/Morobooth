import { openDB } from 'idb';
import { nanoid } from 'nanoid';
import { supabase, isSupabaseConfigured } from '../config/supabase';

export interface SessionInfo {
  sessionCode: string;
  eventName: string;
  createdAt: string;
  photoCount: number;
}

const DB_NAME = 'morobooth-db';
const SESSION_STORE = 'sessions';
const PHOTO_STORE = 'photos';
const SESSIONS_TABLE = 'sessions';

// Lock mechanism to prevent race conditions
let incrementLock = false;
const lockTimeout = 5000; // 5 seconds max wait

function mapSupabaseSession(row: any): SessionInfo {
  return {
    sessionCode: row.session_code,
    eventName: row.event_name,
    createdAt: row.created_at ?? new Date().toISOString(),
    photoCount: row.photo_count ?? 0,
  };
}

async function getDB() {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      // Create sessions store
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'sessionCode' });
      }
      
      // Create photos store
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        store.createIndex('sessionCode', 'sessionCode');
        store.createIndex('uploaded', 'uploaded');
      }
    }
  });
}

export async function getCurrentSession(): Promise<SessionInfo | null> {
  console.log('[GET_SESSION] Getting current session');
  
  // Try localStorage first
  try {
    const stored = localStorage.getItem('currentSession');
    if (stored) {
      const session = JSON.parse(stored);
      if (session && session.sessionCode) {
        console.log('[GET_SESSION] ✓ Session found in localStorage:', session.sessionCode);
        return session;
      }
    }
  } catch (e) {
    console.warn('[GET_SESSION] Failed to parse localStorage session:', e);
  }
  
  // Fallback to IndexedDB
  console.log('[GET_SESSION] Falling back to IndexedDB...');
  try {
    const db = await getDB();
    const allSessions = await db.getAll(SESSION_STORE);
    if (allSessions && allSessions.length > 0) {
      // Get most recent session
      const latestSession = allSessions.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      
      console.log('[GET_SESSION] ✓ Session found in IndexedDB:', latestSession.sessionCode);
      
      // Sync back to localStorage
      try {
        localStorage.setItem('currentSession', JSON.stringify(latestSession));
        console.log('[GET_SESSION] ✓ Session synced to localStorage');
      } catch (e) {
        console.warn('[GET_SESSION] Failed to sync to localStorage (non-fatal):', e);
      }
      
      return latestSession;
    }
  } catch (e) {
    console.error('[GET_SESSION] Failed to get session from IndexedDB:', e);
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
    
    // Update IndexedDB with transaction
    console.log('[INCREMENT_PHOTO_COUNT] Step 3: Updating IndexedDB');
    try {
      const db = await getDB();
      console.log('[INCREMENT_PHOTO_COUNT] ✓ Database connection opened');
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
    } catch (dbError: any) {
      console.error('[INCREMENT_PHOTO_COUNT] ERROR: IndexedDB save failed');
      console.error('[INCREMENT_PHOTO_COUNT] Error name:', dbError?.name);
      console.error('[INCREMENT_PHOTO_COUNT] Error message:', dbError?.message);
      console.error('[INCREMENT_PHOTO_COUNT] Error code:', dbError?.code);
      console.error('[INCREMENT_PHOTO_COUNT] Error stack:', dbError?.stack);
      
      // Check for quota exceeded error
      if (dbError.name === 'QuotaExceededError' || dbError.message?.includes('quota')) {
        console.error('[INCREMENT_PHOTO_COUNT] ERROR TYPE: QuotaExceededError');
        throw new Error('Storage quota exceeded. Please clear some data.');
      }
      
      // Check for database locked error
      if (dbError.name === 'TransactionInactiveError' || dbError.message?.includes('transaction')) {
        console.error('[INCREMENT_PHOTO_COUNT] ERROR TYPE: TransactionInactiveError');
        throw new Error('Database is busy. Please wait a moment and try again.');
      }
      
      throw new Error(`Failed to save session to database: ${dbError.message || dbError.name || 'Unknown error'}`);
    }
    
    // Update localStorage (after IndexedDB success)
    console.log('[INCREMENT_PHOTO_COUNT] Step 4: Updating localStorage');
    try {
      localStorage.setItem('currentSession', JSON.stringify(updatedSession));
      console.log('[INCREMENT_PHOTO_COUNT] ✓ localStorage updated');
    } catch (storageError: any) {
      console.error('[INCREMENT_PHOTO_COUNT] ERROR: localStorage update failed');
      console.error('[INCREMENT_PHOTO_COUNT] Storage error:', storageError);
      
      // Check for quota exceeded
      if (storageError.name === 'QuotaExceededError' || storageError.message?.includes('quota')) {
        console.error('[INCREMENT_PHOTO_COUNT] ERROR TYPE: localStorage QuotaExceededError');
        // IndexedDB already succeeded, so this is non-fatal but log it
        console.warn('[INCREMENT_PHOTO_COUNT] WARNING: localStorage quota exceeded but IndexedDB succeeded');
      } else {
        // Other localStorage errors are non-fatal if IndexedDB succeeded
        console.warn('[INCREMENT_PHOTO_COUNT] WARNING: localStorage update failed but IndexedDB succeeded');
      }
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

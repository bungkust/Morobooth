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
  const stored = localStorage.getItem('currentSession');
  return stored ? JSON.parse(stored) : null;
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
  const session = await getCurrentSession();
  if (!session) throw new Error('No active session');
  
  session.photoCount += 1;
  
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ photo_count: session.photoCount })
      .eq('session_code', session.sessionCode);
    if (error) {
      console.error('Supabase incrementPhotoCount error:', error);
    }
  }
  
  const db = await getDB();
  await db.put(SESSION_STORE, session);
  localStorage.setItem('currentSession', JSON.stringify(session));
  
  return session.photoCount;
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

import { openDB } from 'idb';
import { nanoid } from 'nanoid';

export interface SessionInfo {
  sessionCode: string;
  eventName: string;
  createdAt: string;
  photoCount: number;
}

const DB_NAME = 'morobooth-db';
const SESSION_STORE = 'sessions';
const PHOTO_STORE = 'photos';

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
  
  const db = await getDB();
  await db.put(SESSION_STORE, session);
  localStorage.setItem('currentSession', JSON.stringify(session));
  
  return session;
}

export async function incrementPhotoCount(): Promise<number> {
  const session = await getCurrentSession();
  if (!session) throw new Error('No active session');
  
  session.photoCount += 1;
  
  const db = await getDB();
  await db.put(SESSION_STORE, session);
  localStorage.setItem('currentSession', JSON.stringify(session));
  
  return session.photoCount;
}

export async function getAllSessions(): Promise<SessionInfo[]> {
  const db = await getDB();
  return db.getAll(SESSION_STORE);
}

export async function clearSession() {
  localStorage.removeItem('currentSession');
}

export async function clearAllData() {
  try {
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

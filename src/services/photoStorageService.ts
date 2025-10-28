import { openDB } from 'idb';
import { getCurrentSession, incrementPhotoCount } from './sessionService';

export interface PhotoRecord {
  id: string;
  sessionCode: string;
  photoNumber: number;
  imageDataURL: string;
  timestamp: string;
  uploaded: boolean;
  supabaseUrl?: string;
}

const DB_NAME = 'morobooth-db';
const PHOTO_STORE = 'photos';

async function getDB() {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      // Create photos store
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        store.createIndex('sessionCode', 'sessionCode');
        store.createIndex('uploaded', 'uploaded');
      }
    }
  });
}

export async function savePhotoLocally(imageDataURL: string): Promise<PhotoRecord> {
  const session = await getCurrentSession();
  if (!session) throw new Error('No active session');
  
  const photoNumber = await incrementPhotoCount();
  const paddedNumber = String(photoNumber).padStart(3, '0');
  const photoId = `${session.sessionCode}-${paddedNumber}`;
  
  const record: PhotoRecord = {
    id: photoId,
    sessionCode: session.sessionCode,
    photoNumber,
    imageDataURL,
    timestamp: new Date().toISOString(),
    uploaded: false
  };
  
  const db = await getDB();
  await db.put(PHOTO_STORE, record);
  
  return record;
}

export async function getPhotoById(id: string): Promise<PhotoRecord | undefined> {
  const db = await getDB();
  return db.get(PHOTO_STORE, id);
}

export async function getUnuploadedPhotos(): Promise<PhotoRecord[]> {
  const db = await getDB();
  const allPhotos = await db.getAll(PHOTO_STORE);
  return allPhotos.filter(p => !p.uploaded);
}

export async function markPhotoAsUploaded(id: string, supabaseUrl: string) {
  const db = await getDB();
  const photo = await db.get(PHOTO_STORE, id);
  if (photo) {
    photo.uploaded = true;
    photo.supabaseUrl = supabaseUrl;
    await db.put(PHOTO_STORE, photo);
  }
}

export async function getPhotosBySession(sessionCode: string): Promise<PhotoRecord[]> {
  const db = await getDB();
  const index = (await db.transaction(PHOTO_STORE).objectStore(PHOTO_STORE)).index('sessionCode');
  return index.getAll(sessionCode);
}

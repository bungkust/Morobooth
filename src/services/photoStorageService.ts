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
  supabasePath?: string; // Permanent path in Supabase storage (e.g., "ABC123-001.png")
}

const DB_NAME = 'morobooth-db';
const PHOTO_STORE = 'photos';

async function getDB() {
  return openDB(DB_NAME, 3, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Create photos store if it doesn't exist
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        store.createIndex('sessionCode', 'sessionCode');
        store.createIndex('uploaded', 'uploaded');
      } else if (oldVersion < 3) {
        // Migration from version 2 to 3: add supabasePath field to existing records
        console.log('Migrating database from version', oldVersion, 'to', newVersion);
        const store = transaction.objectStore(PHOTO_STORE);
        
        // Get all existing photos and add supabasePath field
        // Use native IDB API within upgrade transaction
        const nativeStore = store as unknown as IDBObjectStore;
        const request = nativeStore.openCursor();
        const updatePromises: Promise<void>[] = [];
        
        request.onsuccess = (event: Event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor) {
            const photo = cursor.value;
            // Add supabasePath field if it doesn't exist
            if (photo && !('supabasePath' in photo)) {
              photo.supabasePath = undefined;
              const updateRequest = cursor.update(photo);
              updatePromises.push(
                new Promise<void>((resolve, reject) => {
                  updateRequest.onsuccess = () => {
                    console.log('Migrated photo:', photo.id);
                    resolve();
                  };
                  updateRequest.onerror = (err: Event) => {
                    console.error('Failed to migrate photo:', photo.id, err);
                    reject(err);
                  };
                })
              );
            }
            cursor.continue();
          } else {
            // All records processed
            Promise.all(updatePromises).then(() => {
              console.log('Database migration completed');
            }).catch((err: unknown) => {
              console.error('Migration error:', err);
            });
          }
        };
        
        request.onerror = (event: Event) => {
          console.error('Migration cursor error:', event);
        };
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

export async function markPhotoAsUploaded(
  id: string,
  supabaseUrl: string,
  supabasePath?: string
) {
  const db = await getDB();
  const photo = await db.get(PHOTO_STORE, id);
  if (photo) {
    photo.uploaded = true;
    photo.supabaseUrl = supabaseUrl;
    if (supabasePath !== undefined) {
      photo.supabasePath = supabasePath;
    }
    await db.put(PHOTO_STORE, photo);
  }
}

export async function updatePhotoSupabasePath(id: string, path: string) {
  const db = await getDB();
  const photo = await db.get(PHOTO_STORE, id);
  if (photo) {
    photo.supabasePath = path;
    await db.put(PHOTO_STORE, photo);
  }
}

export async function getPhotosBySession(sessionCode: string): Promise<PhotoRecord[]> {
  const db = await getDB();
  const index = (await db.transaction(PHOTO_STORE).objectStore(PHOTO_STORE)).index('sessionCode');
  return index.getAll(sessionCode);
}

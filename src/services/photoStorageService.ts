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
  console.log('[SAVE_PHOTO] Starting savePhotoLocally');
  console.log('[SAVE_PHOTO] imageDataURL type:', typeof imageDataURL);
  console.log('[SAVE_PHOTO] imageDataURL length:', imageDataURL?.length || 0);
  
  try {
    // Validate imageDataURL
    console.log('[SAVE_PHOTO] Step 1: Validating imageDataURL');
    if (!imageDataURL || typeof imageDataURL !== 'string') {
      console.error('[SAVE_PHOTO] ERROR: imageDataURL is missing or invalid');
      throw new Error('Invalid image data: imageDataURL is missing or invalid');
    }
    
    if (!imageDataURL.startsWith('data:image/')) {
      console.error('[SAVE_PHOTO] ERROR: imageDataURL does not start with data:image/');
      console.log('[SAVE_PHOTO] imageDataURL prefix:', imageDataURL.substring(0, 20));
      throw new Error('Invalid image data: imageDataURL must be a valid data URL');
    }
    console.log('[SAVE_PHOTO] ✓ imageDataURL validation passed');

    // Check for active session
    console.log('[SAVE_PHOTO] Step 2: Getting current session');
    const session = await getCurrentSession();
    if (!session) {
      console.error('[SAVE_PHOTO] ERROR: No active session found');
      throw new Error('No active session. Please create a session in Admin Panel first.');
    }
    console.log('[SAVE_PHOTO] ✓ Session found:', session.sessionCode);
    console.log('[SAVE_PHOTO] Session details:', JSON.stringify({
      sessionCode: session.sessionCode,
      eventName: session.eventName,
      photoCount: session.photoCount
    }));
    
    // Increment photo count
    console.log('[SAVE_PHOTO] Step 3: Incrementing photo count');
    let photoNumber: number;
    try {
      photoNumber = await incrementPhotoCount();
      console.log('[SAVE_PHOTO] ✓ Photo count incremented to:', photoNumber);
    } catch (error) {
      console.error('[SAVE_PHOTO] ERROR: Failed to increment photo count');
      console.error('[SAVE_PHOTO] incrementPhotoCount error:', error);
      if (error instanceof Error) {
        console.error('[SAVE_PHOTO] Error name:', error.name);
        console.error('[SAVE_PHOTO] Error message:', error.message);
        console.error('[SAVE_PHOTO] Error stack:', error.stack);
      }
      throw new Error('Failed to increment photo count. Please try again.');
    }
    
    const paddedNumber = String(photoNumber).padStart(3, '0');
    const photoId = `${session.sessionCode}-${paddedNumber}`;
    console.log('[SAVE_PHOTO] Step 4: Creating photo record');
    console.log('[SAVE_PHOTO] Photo ID:', photoId);
    console.log('[SAVE_PHOTO] Photo number:', photoNumber);
    console.log('[SAVE_PHOTO] Session code:', session.sessionCode);
    
    const record: PhotoRecord = {
      id: photoId,
      sessionCode: session.sessionCode,
      photoNumber,
      imageDataURL,
      timestamp: new Date().toISOString(),
      uploaded: false
    };
    
    // Check data size (approximate)
    const dataSize = imageDataURL.length;
    const dataSizeKB = Math.round(dataSize / 1024);
    console.log('[SAVE_PHOTO] Photo data size:', dataSize, 'bytes (~' + dataSizeKB + ' KB)');
    
    // Save to IndexedDB
    console.log('[SAVE_PHOTO] Step 5: Saving to IndexedDB');
    console.log('[SAVE_PHOTO] Database name:', DB_NAME);
    console.log('[SAVE_PHOTO] Store name:', PHOTO_STORE);
    try {
      const db = await getDB();
      console.log('[SAVE_PHOTO] ✓ Database connection opened');
      console.log('[SAVE_PHOTO] Attempting to save record:', {
        id: record.id,
        sessionCode: record.sessionCode,
        photoNumber: record.photoNumber,
        timestamp: record.timestamp,
        uploaded: record.uploaded,
        imageDataSize: record.imageDataURL.length
      });
      
      await db.put(PHOTO_STORE, record);
      console.log('[SAVE_PHOTO] ✓ Photo saved successfully to IndexedDB');
      console.log('[SAVE_PHOTO] Photo ID:', photoId);
      console.log('[SAVE_PHOTO] SUCCESS: savePhotoLocally completed');
    } catch (dbError: any) {
      console.error('[SAVE_PHOTO] ERROR: IndexedDB save failed');
      console.error('[SAVE_PHOTO] Error name:', dbError?.name);
      console.error('[SAVE_PHOTO] Error message:', dbError?.message);
      console.error('[SAVE_PHOTO] Error code:', dbError?.code);
      console.error('[SAVE_PHOTO] Error stack:', dbError?.stack);
      console.error('[SAVE_PHOTO] Full error object:', JSON.stringify(dbError, Object.getOwnPropertyNames(dbError)));
      
      // Check for quota exceeded error
      if (dbError.name === 'QuotaExceededError' || dbError.message?.includes('quota')) {
        console.error('[SAVE_PHOTO] ERROR TYPE: QuotaExceededError');
        throw new Error('Storage quota exceeded. Please clear some photos or use a device with more storage.');
      }
      
      // Check for database locked error
      if (dbError.name === 'TransactionInactiveError' || dbError.message?.includes('transaction')) {
        console.error('[SAVE_PHOTO] ERROR TYPE: TransactionInactiveError');
        throw new Error('Database is busy. Please wait a moment and try again.');
      }
      
      // Check for constraint error
      if (dbError.name === 'ConstraintError' || dbError.message?.includes('constraint')) {
        console.error('[SAVE_PHOTO] ERROR TYPE: ConstraintError');
        throw new Error('Photo ID already exists. Please try again.');
      }
      
      throw new Error(`Failed to save to database: ${dbError.message || dbError.name || 'Unknown error'}`);
    }
    
    return record;
  } catch (error) {
    console.error('[SAVE_PHOTO] ERROR: savePhotoLocally failed');
    console.error('[SAVE_PHOTO] Error type:', typeof error);
    if (error instanceof Error) {
      console.error('[SAVE_PHOTO] Error name:', error.name);
      console.error('[SAVE_PHOTO] Error message:', error.message);
      console.error('[SAVE_PHOTO] Error stack:', error.stack);
    } else {
      console.error('[SAVE_PHOTO] Error value:', String(error));
    }
    // Re-throw with more context
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error saving photo: ${String(error)}`);
  }
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

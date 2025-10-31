# Supabase Database Setup

## 1. Create Tables

Run these SQL commands in your Supabase SQL Editor:

### Sessions Table
```sql
-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_code TEXT UNIQUE NOT NULL,
  event_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  photo_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);
```

### Photos Table
```sql
-- Create photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id TEXT UNIQUE NOT NULL,
  session_code TEXT NOT NULL,
  photo_number INTEGER NOT NULL,
  image_data_url TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded BOOLEAN DEFAULT false,
  supabase_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_code);
CREATE INDEX IF NOT EXISTS idx_photos_uploaded ON photos(uploaded);
CREATE INDEX IF NOT EXISTS idx_photos_id ON photos(photo_id);
```

### Storage Bucket Setup
```sql
-- Create storage bucket for photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false, -- Private bucket
  10485760, -- 10MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;
```

## 2. Set Up RLS Policies

### Sessions Table Policies
```sql
-- Enable RLS on sessions table
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Allow public read access to sessions
CREATE POLICY "Allow public read sessions" ON sessions
  FOR SELECT USING (true);

-- Allow public insert for new sessions
CREATE POLICY "Allow public insert sessions" ON sessions
  FOR INSERT WITH CHECK (true);

-- Allow public update for session photo counts
CREATE POLICY "Allow public update sessions" ON sessions
  FOR UPDATE USING (true);
```

### Photos Table Policies
```sql
-- Enable RLS on photos table
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Allow public read access to photos
CREATE POLICY "Allow public read photos" ON photos
  FOR SELECT USING (true);

-- Allow public insert for new photos
CREATE POLICY "Allow public insert photos" ON photos
  FOR INSERT WITH CHECK (true);

-- Allow public update for photo upload status
CREATE POLICY "Allow public update photos" ON photos
  FOR UPDATE USING (true);
```

### Storage Bucket Policies
```sql
-- Allow public uploads to photos bucket
CREATE POLICY "Allow public uploads" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'photos');

-- Allow public read via signed URLs only
CREATE POLICY "Allow signed URL reads" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'photos');
```

## 3. Auto-Delete Functions

### Storage Auto-Delete (5 days)
```sql
-- Create function to delete old photos from storage
CREATE OR REPLACE FUNCTION delete_old_storage_photos()
RETURNS void AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'photos'
  AND created_at < NOW() - INTERVAL '5 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule daily cleanup (requires pg_cron extension)
SELECT cron.schedule(
  'delete-old-storage-photos',
  '0 2 * * *', -- Run at 2 AM daily
  'SELECT delete_old_storage_photos();'
);
```

### Database Auto-Delete (30 days)
```sql
-- Create function to delete old photo records from database
CREATE OR REPLACE FUNCTION delete_old_photo_records()
RETURNS void AS $$
BEGIN
  DELETE FROM photos
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule weekly cleanup
SELECT cron.schedule(
  'delete-old-photo-records',
  '0 3 * * 0', -- Run at 3 AM every Sunday
  'SELECT delete_old_photo_records();'
);
```

## 4. Test Data (Optional)

```sql
-- Insert a test session
INSERT INTO sessions (session_code, event_name, photo_count)
VALUES ('TEST-ABC123', 'Test Event', 0);

-- Insert a test photo record
INSERT INTO photos (photo_id, session_code, photo_number, image_data_url, uploaded)
VALUES ('TEST-ABC123-001', 'TEST-ABC123', 1, 'data:image/png;base64,test', false);
```

## 5. Verify Setup

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('sessions', 'photos');

-- Check if storage bucket exists
SELECT * FROM storage.buckets WHERE id = 'photos';

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('sessions', 'photos');
```

## Usage Notes

1. **Sessions Table**: Stores session information with unique codes
2. **Photos Table**: Stores photo metadata and upload status
3. **Storage Bucket**: Stores actual image files (private)
4. **Auto-cleanup**: Storage files deleted after 5 days, DB records after 30 days
5. **RLS Policies**: Allow public access for photo booth functionality

Run these SQL commands in your Supabase SQL Editor to set up the complete database structure.

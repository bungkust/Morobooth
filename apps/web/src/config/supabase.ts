import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://aoxxjvnwwnedlxikyzds.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFveHhqdm53d25lZGx4aWt5emRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNjcxNDIsImV4cCI6MjA3Njk0MzE0Mn0.GdpiLGx9sPYsSYAKO-VVBbs4S62OWJnWHq4WkefZ0d8';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export const isSupabaseConfigured = () => !!supabase;

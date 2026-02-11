import 'react-native-url-polyfill/auto';
import {createClient} from '@supabase/supabase-js';
import * as Keychain from 'react-native-keychain';

const SUPABASE_URL = 'https://pkkeaxvmakzdhqdbuosq.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBra2VheHZtYWt6ZGhxZGJ1b3NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQzNzksImV4cCI6MjA4MzkxMDM3OX0.JeOw8ZiKTceNiidXEIrGbkLzVTXlrKEKPwzp8JBeBSo';

// Custom storage using react-native-keychain for secure token storage
const SecureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const credentials = await Keychain.getGenericPassword({service: key});
      return credentials ? credentials.password : null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await Keychain.setGenericPassword(key, value, {service: key});
  },
  removeItem: async (key: string): Promise<void> => {
    await Keychain.resetGenericPassword({service: key});
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

// Pull values securely from your local environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Expo Public Supabase Environment Variables!');
}

// SSR-safe storage wrapper to prevent Node.js / Expo Router build crashes
const ssrSafeStorage = {
  getItem: async (key: string) => {
    if (typeof window === 'undefined') return null; // Safely returns null during SSR build
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window === 'undefined') return;
    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ssrSafeStorage, // <-- Swapped standard AsyncStorage for the SSR safe version
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
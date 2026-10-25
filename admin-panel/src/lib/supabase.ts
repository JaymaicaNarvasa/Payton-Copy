import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (see .env)");
}

// sessionStorage: the admin is signed out when the browser tab is closed.
export const supabase = createClient(url, anonKey, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true },
});

export function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

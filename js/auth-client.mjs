import { config } from "../auth-test/config.js";
import { AUTH_STORAGE_KEY, validateConfig } from "../auth-test/auth-core.mjs";

let client;
// One client per document, shared by the account page and the global header.
export function getAuthClient() {
  if (client) return client;
  validateConfig(config);
  if (!window.supabase?.createClient) throw new Error("SDK unavailable");
  client = window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
    auth: { storage: window.localStorage, storageKey: AUTH_STORAGE_KEY,
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

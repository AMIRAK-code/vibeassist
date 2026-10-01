import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// When .env.local is missing, App shows setup instructions instead of crashing
export const supabase = url && publishableKey ? createClient(url, publishableKey) : null;
export const supabaseUrl = url;
export const supabasePublishableKey = publishableKey;

// Supabase errors carry a message meant for developers; keep the UI wording friendly
export function friendlyError(error, fallback = 'Something went wrong. Try again.') {
  if (!error) return fallback;
  if (error.name === 'FunctionsHttpError' || error.name === 'FunctionsRelayError') return fallback;
  return error.message || fallback;
}

// Calls an Edge Function and returns its JSON body, even for error statuses
export async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { data, status: 200 };
  const response = error.context;
  if (response && typeof response.json === 'function') {
    try {
      return { data: await response.json(), status: response.status };
    } catch {
      // not JSON; fall through
    }
  }
  return { data: { error: friendlyError(error) }, status: response?.status ?? 500 };
}

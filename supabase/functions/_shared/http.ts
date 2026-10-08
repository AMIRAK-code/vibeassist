// Shared plumbing for VibeAssist's Edge Functions: CORS, JSON replies and the project keys.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// New-style keys come as a JSON dictionary; fall back to the legacy variables
export function projectKey(newVar: string, legacyVar: string): string {
  try {
    const keys = JSON.parse(Deno.env.get(newVar) ?? '{}');
    if (keys.default) return keys.default;
  } catch {
    // fall through to the legacy key
  }
  return Deno.env.get(legacyVar) ?? '';
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

// Service-role client — bypasses RLS. Only used server-side.
// Auth middleware extracts the user ID from the JWT and passes it explicitly.
export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

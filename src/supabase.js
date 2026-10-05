import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

// One shared client. PKCE is the safer OAuth flow for browser apps: the page keeps a secret
// "verifier" and proves it after Google sends the person back, so a stolen redirect URL is useless.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

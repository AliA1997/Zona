import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.'
  );
}

// Supabase brokers OAuth and stores nothing: its session is read once, right after
// the redirect, and Zona then holds its own 14-day backend token. Persisting both
// would mean two sessions to keep in sync, and no AsyncStorage dependency is needed.
//
// flowType: 'pkce' is required — auth-js otherwise defaults to the implicit flow,
// which returns the session in the redirect URL's fragment instead of a `?code=`
// query param that oauth.ts's startOAuth expects. Because persistSession is false,
// the PKCE code verifier lives in memory only; if the OS kills the app mid-consent
// the user sees a "try again" error rather than a crash — expected, not a bug.
export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

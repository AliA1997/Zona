import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { OAuthProvider, SupabaseUser } from '@/models/session';
import { supabase } from '@/utils/infrastructure/supabase';

// Returns zona:// in a dev or release build and exp://… under Expo Go. Both must be
// allowlisted in the Supabase project's redirect URLs.
export function redirectUrl(): string {
  return Linking.createURL('/');
}

export async function startOAuth(provider: OAuthProvider): Promise<SupabaseUser | null> {
  const redirectTo = redirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Supabase returned no authorization URL.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  // 'cancel' (user backed out) and 'dismiss' (app backgrounded) are both ordinary
  // outcomes, not failures.
  if (result.type !== 'success') return null;

  // Linking.parse rather than the URL constructor: React Native's URL is incomplete
  // without a polyfill, and expo-linking is already a dependency.
  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) throw new Error('No authorization code in the redirect.');

  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;

  const user = sessionData.session?.user;
  if (!user) throw new Error('No user in the exchanged session.');

  return user;
}

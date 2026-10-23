import type { SignInResponse, SupabaseUser } from '@/models/session';
import { agent } from '@/utils/api/agent';

// OAuthUserProfile on the server mirrors the Supabase user object in snake_case, so
// this passes the object through rather than mapping field names. Sending the whole
// object (not just the email) is what gives a first-time user their real provider
// avatar and display name instead of a robohash fallback.
export function toSignInPayload(user: SupabaseUser): { values: Record<string, unknown> } {
  return { values: user as unknown as Record<string, unknown> };
}

export async function signIn(user: SupabaseUser): Promise<SignInResponse> {
  const response = await agent.post<SignInResponse>('/api/Auth/signin', toSignInPayload(user));
  const { success, accessToken } = response.data;

  if (!success || !accessToken) {
    throw new Error('Sign-in returned no access token.');
  }

  return response.data;
}

import * as SecureStore from 'expo-secure-store';

import type { StoredIdentity } from '@/models/session';

const TOKEN_KEY = 'zona.jwt';
const IDENTITY_KEY = 'zona.identity';

function isStoredIdentity(value: unknown): value is StoredIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (['id', 'username', 'email', 'avatar'] as const).every(
    (key) => typeof v[key] === 'string' && v[key] !== ''
  );
}

export class Auth {
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }

  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }

  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  async getIdentity(): Promise<StoredIdentity | null> {
    const raw = await SecureStore.getItemAsync(IDENTITY_KEY);
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (isStoredIdentity(parsed)) return parsed;

    // Corrupt or old-shape data: clear the whole session, not just the identity,
    // so no token is left behind without an identity to go with it.
    await Promise.all([
      SecureStore.deleteItemAsync(IDENTITY_KEY),
      SecureStore.deleteItemAsync(TOKEN_KEY),
    ]);
    return null;
  }

  async setIdentity(identity: StoredIdentity): Promise<void> {
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
  }

  async clearIdentity(): Promise<void> {
    await SecureStore.deleteItemAsync(IDENTITY_KEY);
  }
}

export const auth = new Auth();

import * as SecureStore from 'expo-secure-store';

import type { StoredIdentity } from '@/models/session';

const TOKEN_KEY = 'zona.jwt';
const IDENTITY_KEY = 'zona.identity';

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

    try {
      return JSON.parse(raw) as StoredIdentity;
    } catch {
      await SecureStore.deleteItemAsync(IDENTITY_KEY);
      return null;
    }
  }

  async setIdentity(identity: StoredIdentity): Promise<void> {
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
  }

  async clearIdentity(): Promise<void> {
    await SecureStore.deleteItemAsync(IDENTITY_KEY);
  }
}

export const auth = new Auth();

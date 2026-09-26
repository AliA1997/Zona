import { Auth } from '@/utils/auth';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

const secureStore = jest.requireMock('expo-secure-store') as {
  __store: Map<string, string>;
};

const identity = {
  id: 'a1',
  username: 'atlas',
  email: 'atlas@example.com',
  avatar: 'https://example.com/a.png',
};

describe('Auth', () => {
  let auth: Auth;

  beforeEach(() => {
    secureStore.__store.clear();
    auth = new Auth();
  });

  it('returns null for a token that was never stored', async () => {
    await expect(auth.getToken()).resolves.toBeNull();
  });

  it('round-trips a token and clears it', async () => {
    await auth.setToken('jwt-123');
    await expect(auth.getToken()).resolves.toBe('jwt-123');

    await auth.clearToken();
    await expect(auth.getToken()).resolves.toBeNull();
  });

  it('round-trips an identity record and clears it', async () => {
    await auth.setIdentity(identity);
    await expect(auth.getIdentity()).resolves.toEqual(identity);

    await auth.clearIdentity();
    await expect(auth.getIdentity()).resolves.toBeNull();
  });

  it('stores the token and identity under the documented keys', async () => {
    await auth.setToken('jwt-123');
    await auth.setIdentity(identity);

    expect([...secureStore.__store.keys()].sort()).toEqual(['zona.identity', 'zona.jwt']);
  });

  it('discards a corrupted identity instead of throwing', async () => {
    secureStore.__store.set('zona.identity', '{not json');

    await expect(auth.getIdentity()).resolves.toBeNull();
    expect(secureStore.__store.has('zona.identity')).toBe(false);
  });
});

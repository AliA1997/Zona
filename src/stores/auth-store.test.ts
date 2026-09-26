import { AuthStore, messageForError } from '@/stores/auth-store';
import { signIn } from '@/utils/api/auth-api-client';
import { sessionCheck } from '@/utils/api/user-api-client';
import { auth } from '@/utils/auth';
import { startOAuth } from '@/utils/oauth';

jest.mock('@/utils/oauth', () => ({ startOAuth: jest.fn() }));
jest.mock('@/utils/api/auth-api-client', () => ({ signIn: jest.fn() }));
jest.mock('@/utils/api/user-api-client', () => ({ sessionCheck: jest.fn() }));
jest.mock('@/utils/auth', () => ({
  auth: {
    getToken: jest.fn(),
    setToken: jest.fn(),
    clearToken: jest.fn(),
    getIdentity: jest.fn(),
    setIdentity: jest.fn(),
    clearIdentity: jest.fn(),
  },
}));

const mockedStartOAuth = startOAuth as jest.Mock;
const mockedSignIn = signIn as jest.Mock;
const mockedSessionCheck = sessionCheck as jest.Mock;
const mockedAuth = auth as jest.Mocked<typeof auth>;

const supabaseUser = { id: 'sb-1', email: 'atlas@example.com' };
const sessionUser = {
  id: 'u-1',
  username: 'atlas',
  email: 'atlas@example.com',
  avatar: 'https://example.com/a.png',
};
const identity = {
  id: 'u-1',
  username: 'atlas',
  email: 'atlas@example.com',
  avatar: 'https://example.com/a.png',
};

describe('AuthStore', () => {
  let store: AuthStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedStartOAuth.mockResolvedValue(supabaseUser);
    mockedSignIn.mockResolvedValue({ success: true, accessToken: 'jwt-123' });
    mockedSessionCheck.mockResolvedValue(sessionUser);
    mockedAuth.getToken.mockResolvedValue(null);
    mockedAuth.getIdentity.mockResolvedValue(null);
    store = new AuthStore();
  });

  describe('initializeFromStorage', () => {
    it('signs the user in from storage and stops restoring', async () => {
      mockedAuth.getToken.mockResolvedValue('jwt-123');
      mockedAuth.getIdentity.mockResolvedValue(identity);

      await store.initializeFromStorage();

      expect(store.isAuthenticated).toBe(true);
      expect(store.identity).toEqual(identity);
      expect(store.restoring).toBe(false);
    });

    it('clears both keys when the token is missing', async () => {
      mockedAuth.getIdentity.mockResolvedValue(identity);

      await store.initializeFromStorage();

      expect(store.isAuthenticated).toBe(false);
      expect(mockedAuth.clearToken).toHaveBeenCalled();
      expect(mockedAuth.clearIdentity).toHaveBeenCalled();
      expect(store.restoring).toBe(false);
    });

    it('clears both keys when the identity is missing', async () => {
      mockedAuth.getToken.mockResolvedValue('jwt-123');

      await store.initializeFromStorage();

      expect(store.isAuthenticated).toBe(false);
      expect(mockedAuth.clearToken).toHaveBeenCalled();
      expect(mockedAuth.clearIdentity).toHaveBeenCalled();
    });

    it('stays signed in when the background refresh fails', async () => {
      mockedAuth.getToken.mockResolvedValue('jwt-123');
      mockedAuth.getIdentity.mockResolvedValue(identity);
      mockedSessionCheck.mockRejectedValue(new Error('offline'));

      await store.initializeFromStorage();
      await Promise.resolve();

      expect(store.isAuthenticated).toBe(true);
    });
  });

  describe('signInWithProvider', () => {
    it('persists the token and identity, then exposes the session user', async () => {
      await store.signInWithProvider('discord');

      expect(mockedAuth.setToken).toHaveBeenCalledWith('jwt-123');
      expect(mockedAuth.setIdentity).toHaveBeenCalledWith(identity);
      expect(store.sessionUser).toEqual(sessionUser);
      expect(store.isAuthenticated).toBe(true);
      expect(store.signingIn).toBe(false);
    });

    it('persists nothing and shows no error when the user cancels', async () => {
      mockedStartOAuth.mockResolvedValue(null);

      await store.signInWithProvider('discord');

      expect(mockedAuth.setToken).not.toHaveBeenCalled();
      expect(mockedAuth.setIdentity).not.toHaveBeenCalled();
      expect(store.authError).toBeUndefined();
      expect(store.isAuthenticated).toBe(false);
    });

    // Review Focus #1: Discord does not guarantee an email, and Discord is the only
    // registered provider — so this is the likeliest real-world failure.
    it('names the provider when the account has no email', async () => {
      mockedStartOAuth.mockResolvedValue({ id: 'sb-1', email: undefined });

      await store.signInWithProvider('discord');

      expect(store.authError).toContain('Discord');
      expect(mockedSignIn).not.toHaveBeenCalled();
      expect(store.isAuthenticated).toBe(false);
    });

    // Review Focus #4: two concurrent flows would race to write storage.
    it('ignores a second call while one is in flight', async () => {
      let release: (value: unknown) => void = () => {};
      mockedStartOAuth.mockReturnValue(new Promise((resolve) => {
        release = resolve;
      }));

      const first = store.signInWithProvider('discord');
      const second = store.signInWithProvider('discord');
      release(supabaseUser);
      await Promise.all([first, second]);

      expect(mockedStartOAuth).toHaveBeenCalledTimes(1);
    });

    it('discards the token when the session check fails', async () => {
      mockedSessionCheck.mockRejectedValue(new Error('no user'));

      await store.signInWithProvider('discord');

      expect(mockedAuth.clearToken).toHaveBeenCalled();
      expect(mockedAuth.setIdentity).not.toHaveBeenCalled();
      expect(store.isAuthenticated).toBe(false);
      expect(store.authError).toBeDefined();
    });
  });

  describe('resetAuthState', () => {
    it('clears storage and observables', async () => {
      mockedAuth.getToken.mockResolvedValue('jwt-123');
      mockedAuth.getIdentity.mockResolvedValue(identity);
      await store.initializeFromStorage();

      await store.resetAuthState();

      expect(mockedAuth.clearToken).toHaveBeenCalled();
      expect(mockedAuth.clearIdentity).toHaveBeenCalled();
      expect(store.isAuthenticated).toBe(false);
      expect(store.sessionUser).toBeUndefined();
    });
  });
});

describe('messageForError', () => {
  it('explains a 400 as a missing email address', () => {
    const error = { isAxiosError: true, response: { status: 400 } };
    expect(messageForError(error, 'discord')).toContain('email address');
  });

  it('reports a connection problem for a 500', () => {
    const error = { isAxiosError: true, response: { status: 500 } };
    expect(messageForError(error, 'discord')).toContain('Check your connection');
  });

  it('falls back to naming the provider for a non-HTTP failure', () => {
    expect(messageForError(new Error('boom'), 'discord')).toContain('Discord');
  });
});

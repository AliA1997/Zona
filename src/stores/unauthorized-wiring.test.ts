import { AuthStore } from '@/stores/auth-store';
import { handleResponseError, setUnauthorizedHandler } from '@/utils/api/agent';
import { auth } from '@/utils/auth';

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

const mockedAuth = auth as jest.Mocked<typeof auth>;

const identity = {
  id: 'u-1',
  username: 'atlas',
  email: 'atlas@example.com',
  avatar: 'https://example.com/a.png',
};

// Review Focus #3: a 14-day-expired token still looks valid in storage, so the app
// renders signed in. The first 401 has to be what ends the session.
describe('unauthorized wiring', () => {
  it('clears a restored session when a request comes back 401', async () => {
    mockedAuth.getToken.mockResolvedValue('expired-jwt');
    mockedAuth.getIdentity.mockResolvedValue(identity);

    const authStore = new AuthStore();
    await authStore.initializeFromStorage();
    expect(authStore.isAuthenticated).toBe(true);

    setUnauthorizedHandler(() => {
      void authStore.resetAuthState();
    });

    await expect(
      handleResponseError({ response: { status: 401 } } as never)
    ).rejects.toBeDefined();
    await Promise.resolve();

    expect(mockedAuth.clearToken).toHaveBeenCalled();
    expect(authStore.isAuthenticated).toBe(false);
  });

  it('leaves the session alone on a 500', async () => {
    mockedAuth.getToken.mockResolvedValue('jwt-123');
    mockedAuth.getIdentity.mockResolvedValue(identity);

    const authStore = new AuthStore();
    await authStore.initializeFromStorage();

    setUnauthorizedHandler(() => {
      void authStore.resetAuthState();
    });

    await expect(
      handleResponseError({ response: { status: 500 } } as never)
    ).rejects.toBeDefined();
    await Promise.resolve();

    expect(authStore.isAuthenticated).toBe(true);
  });
});

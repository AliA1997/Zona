import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { API_BASE_URL, attachBearer, handleResponseError, setUnauthorizedHandler } from '@/utils/api/agent';
import { auth } from '@/utils/auth';

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

const secureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };

const configWith = (): InternalAxiosRequestConfig =>
  ({ headers: {} } as unknown as InternalAxiosRequestConfig);

const errorWithStatus = (status: number): AxiosError =>
  ({ response: { status } } as unknown as AxiosError);

describe('agent', () => {
  beforeEach(() => {
    secureStore.__store.clear();
    setUnauthorizedHandler(() => {});
  });

  it('defaults the base URL to the production API', () => {
    // EXPO_PUBLIC_API_BASE_URL is unset under Jest, so the fallback applies.
    expect(API_BASE_URL).toBe('https://api.alsaqr.app');
  });

  it('attaches a bearer header when a token is stored', async () => {
    await auth.setToken('jwt-123');

    const config = await attachBearer(configWith());

    expect(config.headers.Authorization).toBe('Bearer jwt-123');
  });

  it('leaves the header off when no token is stored', async () => {
    const config = await attachBearer(configWith());

    expect(config.headers.Authorization).toBeUndefined();
  });

  it('invokes the unauthorized handler on 401', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(handleResponseError(errorWithStatus(401))).rejects.toBeDefined();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the handler on 500', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(handleResponseError(errorWithStatus(500))).rejects.toBeDefined();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('rejects rather than throwing when no handler is registered', async () => {
    setUnauthorizedHandler(undefined as unknown as () => void);

    await expect(handleResponseError(errorWithStatus(401))).rejects.toBeDefined();
  });
});

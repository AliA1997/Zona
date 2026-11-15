import { create as createAxios, AxiosError, InternalAxiosRequestConfig } from 'axios';

import { auth } from '@/utils/auth';

// No production fallback: a build missing this variable must not quietly talk to
// production. The root layout blocks the app with an "app not configured" screen
// when it is unset, so the empty string is never used for a real request.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

let unauthorizedHandler: (() => void) | null = null;

// agent.ts must not import the store — the store imports these api clients, so the
// reverse import would be a cycle. stores/index.tsx registers the handler at startup.
// Returns an unregister function; it only clears the handler if it is still `fn`,
// so a stale cleanup cannot remove a newer registration.
export function setUnauthorizedHandler(fn: () => void): () => void {
  unauthorizedHandler = fn;
  return () => {
    if (unauthorizedHandler === fn) unauthorizedHandler = null;
  };
}

export async function attachBearer(
  config: InternalAxiosRequestConfig
): Promise<InternalAxiosRequestConfig> {
  const token = await auth.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}

export function handleResponseError(error: AxiosError): Promise<never> {
  // The backend gate checks only presence and expiry, so a 401 provably means the
  // token is missing or expired — authoritative enough to end the session.
  if (error.response?.status === 401) {
    unauthorizedHandler?.();
  }
  return Promise.reject(error);
}

export const agent = createAxios({ baseURL: API_BASE_URL });

agent.interceptors.request.use(attachBearer);
agent.interceptors.response.use((response) => response, handleResponseError);

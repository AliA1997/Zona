import { create as createAxios, AxiosError, InternalAxiosRequestConfig } from 'axios';

import { auth } from '@/utils/auth';

// Unset in tests and in any environment missing .env.local; the production API is
// the only sensible default and beats failing against a relative URL.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.alsaqr.app';

let unauthorizedHandler: (() => void) | null = null;

// agent.ts must not import the store — the store imports these api clients, so the
// reverse import would be a cycle. stores/index.ts registers the handler at startup.
export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn ?? null;
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

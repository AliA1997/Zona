# Auth / Session Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Zona a real signed-in user — OAuth sign-in through Supabase, exchanged for the ALSaqr backend's own bearer token — so later sub-projects can call `https://api.alsaqr.app` as that user.

**Architecture:** Supabase brokers the OAuth browser round-trip and stores nothing; its session is read once to get the user object, posted to `/api/Auth/signin` for a 14-day backend JWT, then `/api/Session/check` returns the full user. The token and a small identity record persist in SecureStore; a MobX `AuthStore` owns the state machine and the root layout redirects on it. Four `utils` modules each do one job — storage, HTTP, Supabase, OAuth — and the store is the only thing that composes them.

**Tech Stack:** Expo SDK 57, Expo Router, TypeScript, `@supabase/supabase-js`, `expo-secure-store`, `expo-web-browser`, `expo-linking`, `axios`, `mobx` + `mobx-react-lite`, `jest-expo`.

**Spec:** [docs/superpowers/specs/2026-09-25-auth-session-foundation-design.md](../specs/2026-09-25-auth-session-foundation-design.md)

## Global Constraints

- Add every dependency with `npx expo install <pkg>`, never `npm install <pkg>` — this keeps native versions matched to SDK 57 (`CLAUDE.md`). Dev-only test packages are the exception and use `npm install -D`.
- **Installs in this environment are unusually slow** (minutes per package). Never delete `node_modules` as a troubleshooting step; an install killed mid-extraction can corrupt a nested package.
- **No provider client secret ever enters this repo.** Discord's client id and secret live only in the Supabase dashboard. `EXPO_PUBLIC_*` values are inlined into the shipped bundle and are therefore never secret.
- Zona never relies on server-cached identity. The locally stored `user.id` is the source of truth and is passed explicitly by any call that needs it (spec D1).
- Supabase client is constructed with `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false` (spec D2).
- SecureStore keys are exactly `zona.jwt` and `zona.identity`. The identity record holds only `{ id, username, email, avatar }` — never the full session user (spec D3).
- API routes are `POST /api/Auth/signin` and `POST /api/Session/check`. Both bodies are wrapped in a `{ values: … }` envelope, with snake_case field names.
- The backend token lives 14 days and **no refresh endpoint exists** — do not build refresh plumbing.
- File names are kebab-case; import through the `@/*` → `src/*` alias, never deep relative paths.
- Actions are pill-shaped (`Radius.pill`). Colors come from `useTheme()` keys, never raw hex.
- Unit tests only. Component and end-to-end tests are out of scope (spec D7).
- `npx tsc --noEmit` and `npm run lint` must pass before each commit.

## Review Focus

Five conditions the spec implies that no task's happy path would exercise. Each has a test in the task that owns the code.

1. **A Discord account with no email address.** Discord does not guarantee a verified email, and Discord is the only provider registered — so this is the most likely real failure. The backend 400s without an email; the user must see a specific message, not a generic network error. *(Task 5)*
2. **`EXPO_PUBLIC_API_BASE_URL` unset.** Without a default, axios gets `undefined` and every request fails against a relative URL with a confusing error. Must fall back to `https://api.alsaqr.app`. *(Task 2)*
3. **A 14-day-expired token at cold start.** Storage looks valid, so the app renders signed in; the first real request 401s and must clear the session rather than leaving the user stuck. *(Task 6)*
4. **Double-tapping a provider button.** Two concurrent OAuth flows would race to write storage. The `signingIn` flag must make the second call a no-op. *(Task 5)*
5. **`/api/Session/check` returning a result with no `id`.** A token would otherwise be persisted with no identity — a half session that renders as signed-in forever. *(Task 4)*

---

### Task 1: Session types, SecureStore wrapper, and the test runner

**Files:**
- Create: `src/models/session.ts`
- Create: `src/utils/auth.ts`
- Create: `src/utils/auth.test.ts`
- Modify: `package.json` (add `test` script and `jest` config)

**Interfaces:**
- Consumes: nothing.
- Produces: `OAuthProvider`, `StoredIdentity`, `SessionUser`, `SignInResponse` types from `@/models/session`; `Auth` class and the `auth` singleton from `@/utils/auth` with `getToken(): Promise<string | null>`, `setToken(token: string): Promise<void>`, `clearToken(): Promise<void>`, `getIdentity(): Promise<StoredIdentity | null>`, `setIdentity(identity: StoredIdentity): Promise<void>`, `clearIdentity(): Promise<void>`.

- [ ] **Step 1: Install the runtime and test dependencies**

```bash
npx expo install expo-secure-store
npm install -D jest jest-expo @types/jest
```

Expect this to take several minutes. Do not interrupt it.

- [ ] **Step 2: Configure Jest in `package.json`**

Add a `test` script and a `jest` block as top-level keys:

```json
"scripts": {
  "start": "expo start",
  "reset-project": "node ./scripts/reset-project.js",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "lint": "expo lint",
  "test": "jest"
},
"jest": {
  "preset": "jest-expo",
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg)"
  ]
}
```

- [ ] **Step 3: Create the session types**

Create `src/models/session.ts`:

```ts
// Wire and storage types for the auth/session layer. The full record returned by
// /api/Session/check carries follower/bookmark/repost/liked-post arrays; only the
// fields this app reads are modelled, and only the four in StoredIdentity persist.

export type OAuthProvider = 'google' | 'discord' | 'facebook';

export type StoredIdentity = {
  id: string;
  username: string;
  email: string;
  avatar: string;
};

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  avatar: string;
  bio?: string;
  isCompleted?: boolean;
};

export type SignInResponse = {
  success: boolean;
  accessToken: string;
};
```

- [ ] **Step 4: Write the failing tests**

Create `src/utils/auth.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- src/utils/auth.test.ts`
Expected: FAIL — `Cannot find module '@/utils/auth'`.

- [ ] **Step 6: Implement the storage wrapper**

Create `src/utils/auth.ts`:

```ts
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- src/utils/auth.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add package.json src/models/session.ts src/utils/auth.ts src/utils/auth.test.ts
git commit -m "feat: add session types and SecureStore-backed auth storage"
```

---

### Task 2: Axios client, env configuration, and the 401 seam

**Files:**
- Create: `src/utils/api/agent.ts`
- Create: `src/utils/api/agent.test.ts`
- Create: `.env.example`
- Create: `.env.local`
- Modify: `.gitignore` (add `.env`)

**Interfaces:**
- Consumes: `auth` from `@/utils/auth` (Task 1).
- Produces: from `@/utils/api/agent` — `agent` (the axios instance), `API_BASE_URL: string`, `setUnauthorizedHandler(fn: () => void): void`, `attachBearer(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig>`, `handleResponseError(error: AxiosError): Promise<never>`.

`attachBearer` and `handleResponseError` are exported so they can be tested without a live HTTP layer; they are also the functions registered as interceptors.

- [ ] **Step 1: Install axios**

```bash
npx expo install axios
```

- [ ] **Step 2: Close the `.env` gap in `.gitignore`**

`.gitignore` currently ignores only `.env*.local`, so a plain `.env` would be committed. Change the `# local env files` block to:

```
# local env files
.env
.env*.local
```

- [ ] **Step 3: Create the env template and the local env file**

Create `.env.example` (committed — placeholders only, never real values):

```
# Copy to .env.local and fill in. EXPO_PUBLIC_* values are inlined into the app
# bundle and are NOT secret — never put a service-role key or client secret here.
EXPO_PUBLIC_API_BASE_URL=https://api.alsaqr.app
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Create `.env.local` (gitignored) with the real project values supplied by the user: the Supabase project URL and anon key, and `EXPO_PUBLIC_API_BASE_URL=https://api.alsaqr.app`. If those values are not at hand, stop and ask for them rather than inventing placeholders — sign-in cannot work without them.

- [ ] **Step 4: Write the failing tests**

Create `src/utils/api/agent.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- src/utils/api/agent.test.ts`
Expected: FAIL — `Cannot find module '@/utils/api/agent'`.

- [ ] **Step 6: Implement the axios client**

Create `src/utils/api/agent.ts`:

```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

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

export const agent = axios.create({ baseURL: API_BASE_URL });

agent.interceptors.request.use(attachBearer);
agent.interceptors.response.use((response) => response, handleResponseError);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- src/utils/api/agent.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 9: Commit**

`.env.local` is gitignored and must not appear in the commit. Verify with `git status` before staging.

```bash
git add .gitignore .env.example src/utils/api/agent.ts src/utils/api/agent.test.ts
git commit -m "feat: add axios api client with bearer auth and 401 handling"
```

---

### Task 3: Supabase client and the OAuth browser flow

**Files:**
- Create: `src/utils/infrastructure/supabase.ts`
- Create: `src/utils/oauth.ts`
- Create: `src/utils/oauth.test.ts`
- Modify: `src/models/session.ts` (re-export the SDK's `User` type)

**Interfaces:**
- Consumes: `OAuthProvider` from `@/models/session` (Task 1).
- Produces: `supabase` from `@/utils/infrastructure/supabase`; `redirectUrl(): string` and `startOAuth(provider: OAuthProvider): Promise<SupabaseUser | null>` from `@/utils/oauth`; `SupabaseUser` type re-exported from `@/models/session`.

`startOAuth` resolves to the Supabase user on success, `null` when the user cancels or dismisses the browser, and throws on any real failure.

- [ ] **Step 1: Install the Supabase SDK**

```bash
npx expo install @supabase/supabase-js
```

`expo-web-browser` and `expo-linking` are already dependencies — do not reinstall them.

- [ ] **Step 2: Re-export the SDK user type**

Append to `src/models/session.ts`:

```ts
// Re-exported so no other module imports the Supabase SDK's types directly.
export type { User as SupabaseUser } from '@supabase/supabase-js';
```

- [ ] **Step 3: Create the Supabase client**

Create `src/utils/infrastructure/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.'
  );
}

// Supabase brokers OAuth and stores nothing: its session is read once, right after
// the redirect, and Zona then holds its own 14-day backend token. Persisting both
// would mean two sessions to keep in sync, and no AsyncStorage dependency is needed.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 4: Write the failing tests**

Create `src/utils/oauth.test.ts`:

```ts
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { startOAuth } from '@/utils/oauth';
import { supabase } from '@/utils/infrastructure/supabase';

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'exp://127.0.0.1:8081/--/'),
  parse: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('@/utils/infrastructure/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    },
  },
}));

const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;
const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;
const parseUrl = Linking.parse as jest.Mock;

const user = { id: 'sb-1', email: 'atlas@example.com' };

describe('startOAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedAuth.signInWithOAuth as jest.Mock).mockResolvedValue({
      data: { url: 'https://supabase.example/authorize' },
      error: null,
    });
    openAuthSession.mockResolvedValue({ type: 'success', url: 'exp://redirect?code=abc' });
    parseUrl.mockReturnValue({ queryParams: { code: 'abc' } });
    (mockedAuth.exchangeCodeForSession as jest.Mock).mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
  });

  it('requests the provider with a redirect and no automatic browser redirect', async () => {
    await startOAuth('discord');

    expect(mockedAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'discord',
      options: { redirectTo: 'exp://127.0.0.1:8081/--/', skipBrowserRedirect: true },
    });
  });

  it('returns the exchanged user on success', async () => {
    await expect(startOAuth('discord')).resolves.toEqual(user);
    expect(mockedAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('returns null when the user cancels', async () => {
    openAuthSession.mockResolvedValue({ type: 'cancel' });

    await expect(startOAuth('discord')).resolves.toBeNull();
    expect(mockedAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('returns null when the browser is dismissed', async () => {
    openAuthSession.mockResolvedValue({ type: 'dismiss' });

    await expect(startOAuth('discord')).resolves.toBeNull();
  });

  it('throws when the redirect carries no authorization code', async () => {
    parseUrl.mockReturnValue({ queryParams: {} });

    await expect(startOAuth('discord')).rejects.toThrow('No authorization code');
  });

  it('throws when the code exchange fails', async () => {
    (mockedAuth.exchangeCodeForSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: new Error('bad code'),
    });

    await expect(startOAuth('discord')).rejects.toThrow('bad code');
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- src/utils/oauth.test.ts`
Expected: FAIL — `Cannot find module '@/utils/oauth'`.

- [ ] **Step 6: Implement the OAuth flow**

Create `src/utils/oauth.ts`:

```ts
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- src/utils/oauth.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add src/models/session.ts src/utils/infrastructure/supabase.ts src/utils/oauth.ts src/utils/oauth.test.ts
git commit -m "feat: add Supabase client and OAuth browser flow"
```

---

### Task 4: Auth and session API clients

**Files:**
- Create: `src/utils/api/auth-api-client.ts`
- Create: `src/utils/api/auth-api-client.test.ts`
- Create: `src/utils/api/user-api-client.ts`
- Create: `src/utils/api/user-api-client.test.ts`

**Interfaces:**
- Consumes: `agent` from `@/utils/api/agent` (Task 2); `SessionUser`, `SignInResponse`, `SupabaseUser` from `@/models/session` (Tasks 1, 3).
- Produces: `toSignInPayload(user: SupabaseUser): { values: Record<string, unknown> }` and `signIn(user: SupabaseUser): Promise<SignInResponse>` from `@/utils/api/auth-api-client`; `sessionCheck(email: string): Promise<SessionUser>` from `@/utils/api/user-api-client`.

**Covers Review Focus #5** — `sessionCheck` throws rather than returning an id-less user.

- [ ] **Step 1: Write the failing tests for the auth client**

Create `src/utils/api/auth-api-client.test.ts`:

```ts
import { signIn, toSignInPayload } from '@/utils/api/auth-api-client';
import { agent } from '@/utils/api/agent';

jest.mock('@/utils/api/agent', () => ({
  agent: { post: jest.fn() },
}));

const post = agent.post as jest.Mock;

// The backend's OAuthUserProfile mirrors the Supabase user object field-for-field in
// snake_case, so the payload is a pass-through under a `values` envelope.
const user = {
  id: 'sb-1',
  email: 'atlas@example.com',
  user_metadata: { full_name: 'Atlas Core', picture: 'https://example.com/a.png' },
} as never;

describe('auth api client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({ data: { success: true, accessToken: 'jwt-123' } });
  });

  it('wraps the Supabase user in a values envelope without renaming fields', () => {
    expect(toSignInPayload(user)).toEqual({
      values: {
        id: 'sb-1',
        email: 'atlas@example.com',
        user_metadata: { full_name: 'Atlas Core', picture: 'https://example.com/a.png' },
      },
    });
  });

  it('posts to the signin route and returns the access token', async () => {
    await expect(signIn(user)).resolves.toEqual({ success: true, accessToken: 'jwt-123' });
    expect(post).toHaveBeenCalledWith('/api/Auth/signin', toSignInPayload(user));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/utils/api/auth-api-client.test.ts`
Expected: FAIL — `Cannot find module '@/utils/api/auth-api-client'`.

- [ ] **Step 3: Implement the auth client**

Create `src/utils/api/auth-api-client.ts`:

```ts
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
  return response.data;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/utils/api/auth-api-client.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing tests for the session client**

Create `src/utils/api/user-api-client.test.ts`:

```ts
import { sessionCheck } from '@/utils/api/user-api-client';
import { agent } from '@/utils/api/agent';

jest.mock('@/utils/api/agent', () => ({
  agent: { post: jest.fn() },
}));

const post = agent.post as jest.Mock;

const sessionUser = {
  id: 'u-1',
  username: 'atlas',
  email: 'atlas@example.com',
  avatar: 'https://example.com/a.png',
};

describe('sessionCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({ data: { result: sessionUser } });
  });

  it('posts the email under a values envelope and unwraps the result', async () => {
    await expect(sessionCheck('atlas@example.com')).resolves.toEqual(sessionUser);
    expect(post).toHaveBeenCalledWith('/api/Session/check', {
      values: { email: 'atlas@example.com' },
    });
  });

  // Review Focus #5: a result with no id would otherwise persist a token with no
  // identity — a half session that renders as signed in forever.
  it('throws when the result carries no id', async () => {
    post.mockResolvedValue({ data: { result: { username: 'atlas' } } });

    await expect(sessionCheck('atlas@example.com')).rejects.toThrow('no user');
  });

  it('throws when the response has no result at all', async () => {
    post.mockResolvedValue({ data: {} });

    await expect(sessionCheck('atlas@example.com')).rejects.toThrow('no user');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test -- src/utils/api/user-api-client.test.ts`
Expected: FAIL — `Cannot find module '@/utils/api/user-api-client'`.

- [ ] **Step 7: Implement the session client**

Create `src/utils/api/user-api-client.ts`:

```ts
import type { SessionUser } from '@/models/session';
import { agent } from '@/utils/api/agent';

// Note the route has no trailing space, unlike the web client's template literal.
export async function sessionCheck(email: string): Promise<SessionUser> {
  const response = await agent.post<{ result: SessionUser }>('/api/Session/check', {
    values: { email },
  });

  const user = response.data?.result;
  if (!user?.id) {
    throw new Error('Session check returned no user.');
  }

  return user;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- src/utils/api/user-api-client.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 10: Commit**

```bash
git add src/utils/api/auth-api-client.ts src/utils/api/auth-api-client.test.ts src/utils/api/user-api-client.ts src/utils/api/user-api-client.test.ts
git commit -m "feat: add auth and session api clients"
```

---

### Task 5: The AuthStore

**Files:**
- Create: `src/stores/auth-store.ts`
- Create: `src/stores/auth-store.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/utils/auth` (Task 1); `startOAuth` from `@/utils/oauth` (Task 3); `signIn` from `@/utils/api/auth-api-client` and `sessionCheck` from `@/utils/api/user-api-client` (Task 4).
- Produces: `AuthStore` class from `@/stores/auth-store` with observables `identity?: StoredIdentity`, `sessionUser?: SessionUser`, `restoring: boolean`, `signingIn: boolean`, `authError?: string`; getter `isAuthenticated: boolean`; actions `initializeFromStorage()`, `signInWithProvider(provider)`, `refreshSessionUser()`, `resetAuthState()`. Also exports `messageForError(error: unknown, provider: OAuthProvider): string`.

**Covers Review Focus #1** (Discord account with no email) and **#4** (double-tapped provider button).

- [ ] **Step 1: Install MobX**

```bash
npx expo install mobx mobx-react-lite
```

- [ ] **Step 2: Write the failing tests**

Create `src/stores/auth-store.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/stores/auth-store.test.ts`
Expected: FAIL — `Cannot find module '@/stores/auth-store'`.

- [ ] **Step 4: Implement the store**

Create `src/stores/auth-store.ts`:

```ts
import axios from 'axios';
import { makeAutoObservable, runInAction } from 'mobx';

import type { OAuthProvider, SessionUser, StoredIdentity } from '@/models/session';
import { signIn } from '@/utils/api/auth-api-client';
import { sessionCheck } from '@/utils/api/user-api-client';
import { auth } from '@/utils/auth';
import { startOAuth } from '@/utils/oauth';

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  discord: 'Discord',
  facebook: 'Facebook',
};

export function messageForError(error: unknown, provider: OAuthProvider): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;

  if (status === 400) return 'That account is missing an email address.';
  if (status !== undefined || axios.isAxiosError(error)) {
    return "Couldn't reach Zona. Check your connection and try again.";
  }
  return `Couldn't sign in with ${PROVIDER_LABELS[provider]}. Try again.`;
}

export class AuthStore {
  identity?: StoredIdentity = undefined;
  sessionUser?: SessionUser = undefined;
  restoring = true;
  signingIn = false;
  authError?: string = undefined;

  constructor() {
    makeAutoObservable(this);
  }

  get isAuthenticated(): boolean {
    return !!this.identity;
  }

  initializeFromStorage = async (): Promise<void> => {
    const [token, identity] = await Promise.all([auth.getToken(), auth.getIdentity()]);

    // A token without an identity (or the reverse) is a half-written session — most
    // likely the app died mid sign-in. Neither half is usable on its own.
    if (!token || !identity) {
      await this.clearStoredSession();
      runInAction(() => {
        this.identity = undefined;
        this.sessionUser = undefined;
        this.restoring = false;
      });
      return;
    }

    runInAction(() => {
      this.identity = identity;
      this.restoring = false;
    });

    void this.refreshSessionUser();
  };

  signInWithProvider = async (provider: OAuthProvider): Promise<void> => {
    if (this.signingIn) return;

    runInAction(() => {
      this.signingIn = true;
      this.authError = undefined;
    });

    try {
      const user = await startOAuth(provider);
      if (!user) return;

      if (!user.email) {
        runInAction(() => {
          this.authError = `Your ${PROVIDER_LABELS[provider]} account has no email address, which Zona needs to sign you in.`;
        });
        return;
      }

      const { accessToken } = await signIn(user);
      await auth.setToken(accessToken);

      let sessionUser: SessionUser;
      try {
        sessionUser = await sessionCheck(user.email);
      } catch (error) {
        // Never leave a token behind without an identity to go with it.
        await auth.clearToken();
        throw error;
      }

      const identity: StoredIdentity = {
        id: sessionUser.id,
        username: sessionUser.username,
        email: sessionUser.email,
        avatar: sessionUser.avatar,
      };
      await auth.setIdentity(identity);

      runInAction(() => {
        this.identity = identity;
        this.sessionUser = sessionUser;
      });
    } catch (error) {
      runInAction(() => {
        this.authError = messageForError(error, provider);
      });
    } finally {
      runInAction(() => {
        this.signingIn = false;
      });
    }
  };

  refreshSessionUser = async (): Promise<void> => {
    const email = this.identity?.email;
    if (!email) return;

    try {
      const sessionUser = await sessionCheck(email);
      runInAction(() => {
        this.sessionUser = sessionUser;
      });
    } catch {
      // A failed refresh is not proof of a signed-out user (offline, 500, rate
      // limit). Keep the cached identity rather than bouncing them to sign-in.
    }
  };

  resetAuthState = async (): Promise<void> => {
    await this.clearStoredSession();
    runInAction(() => {
      this.identity = undefined;
      this.sessionUser = undefined;
      this.authError = undefined;
    });
  };

  private clearStoredSession = async (): Promise<void> => {
    await Promise.all([auth.clearToken(), auth.clearIdentity()]);
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/stores/auth-store.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/stores/auth-store.ts src/stores/auth-store.test.ts
git commit -m "feat: add AuthStore session state machine"
```

---

### Task 6: Store provider and the 401 wiring

**Files:**
- Create: `src/stores/index.tsx`
- Create: `src/stores/unauthorized-wiring.test.ts`

**Interfaces:**
- Consumes: `AuthStore` from `@/stores/auth-store` (Task 5); `setUnauthorizedHandler` from `@/utils/api/agent` (Task 2).
- Produces: `Store` type (`{ authStore: AuthStore }`), `StoreProvider` component, and `useStore(): Store` from `@/stores`.

The file is `.tsx` because it renders a provider. **Covers Review Focus #3** — the expired-token path, tested as the interceptor-to-store contract rather than by rendering the provider (component tests are out of scope per spec D7).

- [ ] **Step 1: Write the failing test**

Create `src/stores/unauthorized-wiring.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/stores/unauthorized-wiring.test.ts`
Expected: FAIL — the 401 case fails because nothing clears the session until a handler is registered against a real store; confirm the failure is in the assertions, not an import error.

- [ ] **Step 3: Implement the provider**

Create `src/stores/index.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useMemo } from 'react';

import { AuthStore } from '@/stores/auth-store';
import { setUnauthorizedHandler } from '@/utils/api/agent';

export type Store = {
  authStore: AuthStore;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo<Store>(() => ({ authStore: new AuthStore() }), []);

  useEffect(() => {
    // agent.ts cannot import the store (the store imports the api clients), so the
    // 401 path is wired in from this side exactly once.
    setUnauthorizedHandler(() => {
      void store.authStore.resetAuthState();
    });

    void store.authStore.initializeFromStorage();
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useStore must be used inside a StoreProvider.');
  }
  return store;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/stores/unauthorized-wiring.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — every test from Tasks 1–6.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/stores/index.tsx src/stores/unauthorized-wiring.test.ts
git commit -m "feat: add store provider and wire 401 handling to session reset"
```

---

### Task 7: The sign-in screen

**Files:**
- Create: `src/app/sign-in.tsx`

**Interfaces:**
- Consumes: `useStore` from `@/stores` (Task 6); `OAuthProvider` from `@/models/session` (Task 1); `ThemedText`, `ThemedView`, `useTheme`, `Colors`/`Spacing`/`Radius`/`Fonts` tokens (existing).
- Produces: the `/sign-in` route.

Component tests are out of scope (spec D7), so this task's gate is typecheck, lint, and a visual check. Three provider buttons render, but only Discord completes end-to-end until Google and Facebook are registered.

- [ ] **Step 1: Implement the screen**

Create `src/app/sign-in.tsx`:

```tsx
import { observer } from 'mobx-react-lite';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { OAuthProvider } from '@/models/session';
import { useStore } from '@/stores';

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'discord', label: 'Continue with Discord' },
  { id: 'facebook', label: 'Continue with Facebook' },
];

export default observer(function SignInScreen() {
  const theme = useTheme();
  const { authStore } = useStore();
  const { signingIn, authError } = authStore;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={[styles.wordmark, { color: theme.text }]}>Zona</ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.tagline}>
            The social network for AI agents.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          {PROVIDERS.map((provider) => (
            <Pressable
              key={provider.id}
              accessibilityRole="button"
              disabled={signingIn}
              onPress={() => {
                void authStore.signInWithProvider(provider.id);
              }}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                pressed && styles.buttonPressed,
                signingIn && styles.buttonDisabled,
              ]}>
              <ThemedText type="body" themeColor="text">
                {provider.label}
              </ThemedText>
            </Pressable>
          ))}

          {signingIn ? (
            <ActivityIndicator color={theme.accent} style={styles.spinner} />
          ) : null}

          {authError ? (
            <ThemedText type="body" style={[styles.error, { color: theme.red }]}>
              {authError}
            </ThemedText>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: 48,
  },
  tagline: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.sm2,
  },
  button: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  spinner: {
    marginTop: Spacing.sm,
  },
  error: {
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/sign-in.tsx
git commit -m "feat: add sign-in screen with three OAuth providers"
```

---

### Task 8: Root layout session gate and full validation

**Files:**
- Modify: `src/app/_layout.tsx:1-60` (wrap in `StoreProvider`, add the `sign-in` screen, gate on session state)

**Interfaces:**
- Consumes: `StoreProvider`, `useStore` from `@/stores` (Task 6); the `/sign-in` route (Task 7).
- Produces: nothing new. This is the last task; it makes sign-in reachable and is the end-to-end gate.

- [ ] **Step 1: Rewrite the root layout**

Replace the contents of `src/app/_layout.tsx` with the following. The existing font loading, theme provider, and screen options are preserved verbatim; what is new is `StoreProvider`, the `sign-in` screen, the redirect effect, and holding the splash until the session has been restored.

```tsx
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { DarkTheme, DefaultTheme, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { SplashOverlay } from '@/components/splash-overlay';
import { Colors } from '@/constants/theme';
import { StoreProvider, useStore } from '@/stores';

SplashScreen.preventAutoHideAsync();

// Declarative redirects can't live alongside the Stack's children, so the gate is an
// effect: it runs after every auth-state or route change and corrects the location.
function useSessionRedirect(isAuthenticated: boolean, restoring: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (restoring) return;

    const onSignIn = segments[0] === 'sign-in';

    if (!isAuthenticated && !onSignIn) {
      router.replace('/sign-in');
    } else if (isAuthenticated && onSignIn) {
      router.replace('/');
    }
  }, [isAuthenticated, restoring, segments, router]);
}

const RootNavigator = observer(function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Colors.dark : Colors.light;
  const { authStore } = useStore();

  useSessionRedirect(authStore.isAuthenticated, authStore.restoring);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="personalize"
          options={{
            headerShown: true,
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
      </Stack>
      {/* Holding the splash through `restoring` is what stops a returning user from
          seeing the sign-in screen flash before their session is read. */}
      <SplashOverlay ready={fontsLoaded && !authStore.restoring} />
    </ThemeProvider>
  );
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  return (
    <StoreProvider>
      <RootNavigator fontsLoaded={fontsLoaded} />
    </StoreProvider>
  );
}
```

- [ ] **Step 2: Run the whole suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all clean.

- [ ] **Step 3: Confirm the Supabase dashboard prerequisites**

These are browser steps and cannot be done from the repo. Sign-in will fail without them:

- Discord provider enabled in Supabase → Auth → Providers, with the client id and secret entered there (**never in this repo**).
- Both redirect URLs allowlisted in Supabase: `zona://` and the Expo Go `exp://…` URL.
- To find the exact Expo Go URL, start the app and log `Linking.createURL('/')`, or read it off the Metro output; allowlist that value verbatim.

- [ ] **Step 4: Manual validation in Expo Go**

Run `npm start` and work through each case, on a device or simulator:

1. **Cold start, signed out** → the sign-in screen appears; no tab bar.
2. **Sign in with Discord** → browser opens, consent completes, app returns and lands on the Feed tab.
3. **Force-quit and relaunch** → lands on Feed directly, with no sign-in flash.
4. **Cancel the OAuth browser** (back out before consenting) → returns to sign-in, no error message, buttons re-enabled.
5. **Airplane mode, then tap Continue with Discord** → inline connection error; still signed out afterwards.
6. **Double-tap a provider button** → only one browser session opens.
7. **Sign out** — no UI button exists yet (that belongs to the Profile-screen work), so add this temporarily inside the root view of `src/app/(tabs)/profile.tsx`, exercise it, then **revert the file before committing**:

   ```tsx
   // TEMPORARY — validation only, revert before committing.
   import { Pressable } from 'react-native';
   import { ThemedText } from '@/components/themed-text';
   import { useStore } from '@/stores';

   // ...inside the component:
   const { authStore } = useStore();

   // ...inside the returned view:
   <Pressable onPress={() => { void authStore.resetAuthState(); }}>
     <ThemedText type="body">Sign out (temp)</ThemedText>
   </Pressable>
   ```

   Tapping it must return to sign-in, and a relaunch must stay signed out. Confirm `git status` shows `profile.tsx` unmodified before the commit in Step 5.
8. **Google and Facebook buttons** → tapping either reaches the provider's own "app not configured" error rather than crashing. Their end-to-end paths stay unvalidated until those OAuth apps are registered.

- [ ] **Step 5: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: gate the app on an authenticated session"
```

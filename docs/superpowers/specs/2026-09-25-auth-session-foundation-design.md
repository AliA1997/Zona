# Auth / Session Foundation — Design Spec

**Date:** 2026-09-25
**Status:** Awaiting review
**Sub-project:** 1 of a decomposed roadmap (see [Scope](#scope-and-context))

---

## Intent

**Goal.** Give Zona a real signed-in user, so that any screen can call
`https://api.alsaqr.app` as that user. Today Zona has no networking and no auth code
whatsoever; every screen renders from `src/data/mock-agents.ts`.

**Why now.** The request that started this was "the Messages screen isn't connected to the
backend." Every message endpoint on that backend is reachable only as an identified user, and
the write endpoints are token-gated. So a session layer is the prerequisite for the Messages
work, and for every other screen ported later.

**Success criteria.**

1. A first-time user can sign in with Google, Discord, or Facebook and land in the app.
2. A returning user re-opens the app and is already signed in, with no network round-trip
   needed before the UI renders.
3. The app holds a user id it can pass to API calls, and a bearer token accepted by the
   backend's write endpoints.
4. Signing out clears everything and returns to the sign-in screen.
5. `npx tsc --noEmit` and `npm run lint` pass.

**Stated by the user (not inferred):** use the existing backend at `https://api.alsaqr.app`;
keep Supabase as the auth broker; support Google + Discord + Facebook; free or open-source
options only; defer Sign in with Apple; auth is the first sub-project.

**Assumed by this spec (correct me if wrong):** Zona's users are people who own agents, and
they share the same account namespace as ALSaqr's web users — signing in with the same Google
account on web and in Zona yields the same backend user. This follows from reusing
`/api/Auth/signin`, which looks users up by email.

---

## Scope and context

The original request bundled three things of very different sizes. They were decomposed into
sequential sub-projects, each getting its own spec, plan, and implementation cycle:

1. **Auth / session foundation** — this spec.
2. **Navigation shell** — replace the 3-tab bottom bar with an app-wide side nav mirroring
   alsaqr's `layout/Sidebar.tsx`. Overrides a documented "hard rule" in `CLAUDE.md` and
   `.claude/references/design-system.md`; both need updating when it lands.
3. **Messages** — API wiring plus layout/formatting fixes.
4. **Remaining ported screens** — Explore, Communities, Lists, Notifications, Bookmarks,
   YumnaAI, Profile collection tabs, Settings, Status, legal pages — one sub-project each.

This spec covers **only** item 1.

---

## Verified backend contract

All facts below were read from `~/projects/alsaqr-backend-api-v2` rather than assumed. Line
references are to that checkout.

### Routes

A global prefix is configured in `AlSaqr.API/Program.cs:131`
(`AddControllers(o => o.UseRoutePrefix("api"))`), so controller routes resolve as:

| Endpoint | Controller |
| --- | --- |
| `POST /api/Auth/signin` | `AuthController.SignInWithSupabase` |
| `POST /api/Session/check` | `SessionController.Check` |

ASP.NET route matching is case-insensitive, so the web client's lowercase `/api/auth/signin`
also works. Note the web client's `userApiClient.ts:12` has a stray trailing space in
`` `/api/Session/check ` `` — **do not replicate that.**

### `POST /api/Auth/signin`

Request body is `{ "values": <OAuthUserProfile> }`. `OAuthUserProfile`
(`AlSaqr.Domain/SocialMedia/Session.cs:22+`) mirrors the **raw Supabase user object in
snake_case**: `id`, `aud`, `role`, `email`, `phone`, `app_metadata`, `user_metadata`
(`avatar_url`, `picture`, `full_name`, `name`, `custom_claims.global_name`, …), `identities`,
`created_at`, `updated_at`, `is_anonymous`, `web3_address`. Every field is nullable.

Behavior (`AuthController.cs`):

- Requires `email` or `web3_address`; otherwise `400 "Email or web3 address is required"`
  (`:48-51`).
- Looks the user up by web3 address, then by email (`:61-84`).
- **Creates the user if not found** (`:86-135`), deriving username from Discord `global_name`
  / `display_name` / the email local-part, and avatar from `profile_avatar` /
  `user_metadata.picture` / `user_metadata.avatar_url`, falling back to
  `https://robohash.org/{username}`. Several ALSaqr-specific fields are hardcoded on creation
  (`CountryOfOrigin = "United States"`, `Religion = "Muslim"`, `PreferredMadhab = "Hanafi"`).
- Success: `200 { "success": true, "accessToken": "<jwt>" }` (`:143`).
- Failure: `500 { "message": "Fetch User Signin error!", "success": false }` (`:148-151`).

**A refresh token is generated and then discarded.** `TokenService.GenerateTokens` returns
both `AccessToken` and `RefreshToken` (`TokenService.cs:27-34`), but the controller returns
only `accessToken`. **There is therefore no refresh path available to any client.**

### The access token

`TokenService.cs:36-51`: HMAC-SHA256, one claim (`ClaimTypes.NameIdentifier` = user id),
`Expires = DateTime.UtcNow.AddDays(14)` (`:45` — a 15-minute variant is commented out
directly above).

`AuthorizedControllerBase.ValidateAccessToken()` delegates to
`AlSaqr.Domain/Utils/Auth.cs` → `AccessTokenValidator.IsValid`, which base64-decodes the JWT
payload and rejects only when the token is **missing, malformed, or past `exp`**. The
signature is deliberately not verified (`Auth.cs:8-14`; `specs/access-token.md:53` lists
signature verification under "Out of scope"). Per `specs/access-token.md:52`, read-only GET
endpoints are not gated at all — only upserts (POST/PUT/PATCH/DELETE) require the token.

**Consequence for this design:** the token is an opaque "not expired" ticket. It carries no
identity the server acts on.

### `POST /api/Session/check`

Request body is `{ "values": { "email": "…", "web3_address": "…" } }`
(`Session.cs:11-16`, snake_case). Requires one of the two, else `400`. Returns
`200 { "result": <SessionUser> }` (`SessionController.cs:86`), or
`400 "Invalid user retrieved"` when the resolved id is empty.

**Side effect:** `_userCacheService.SetLoggedInUser(sessionUserResult)` (`:84`).

### Server-side identity is a process-wide singleton

`UserCacheService` (`AlSaqr.Infrastructure/UserCacheService.cs`) is a static `Lazy<>`
singleton (`:24-30`) that caches the session under the **literal key `"loggedInUser"`**
(`:52-58`) — not keyed per user — with a 30-minute sliding / 14-day absolute expiry
(`:38-42`). Whoever most recently called `/api/Session/check` is "the logged-in user" for the
entire server process.

Combined with the unverified signature, **the backend cannot identify a caller** unless the
request passes ids explicitly. alsaqr's message calls do exactly that —
`MessageFormDto` carries `senderId`/`recipientId` (`features/Messages.tsx:92-101`) and
`loadDirectMessages(senderId, receiverId)` passes both. It works *in spite of* the cache.

This is recorded as a finding below; it is not fixed here.

---

## Architecture decisions

### D1 — Zona never trusts server-cached identity

The locally stored user id is the single source of truth for "who am I," and is passed
explicitly in every request that needs it. No feature may depend on
`GetLoggedInUser()` being correct.

*Why:* the global `"loggedInUser"` slot is re-pointed by any other client's session check.

### D2 — Supabase brokers OAuth and stores nothing

The Supabase client is constructed with `persistSession: false`, `autoRefreshToken: false`,
`detectSessionInUrl: false`. Its session is consumed once, immediately after the OAuth
redirect, to read the user object; after that Zona holds its own 14-day token.

*Why:* two independently-persisted sessions is a bug factory, and dropping Supabase
persistence removes the AsyncStorage dependency entirely. The cost — no silent re-mint after
14 days — is acceptable because the backend exposes no refresh path anyway (see above).

### D3 — Storage split: token and a *small* identity record

`expo-secure-store` holds two keys:

- `zona.jwt` — the access token.
- `zona.identity` — a deliberately small record: `{ id, username, email, avatar }`.

The full `SessionUser` is **not** persisted. It re-hydrates from `/api/Session/check` in the
background on each launch.

*Why:* SecureStore's practical per-item limit is ~2KB on iOS, and the session record embeds
`following` / `followers` / `bookmarks` / `reposts` / `likedPosts` arrays — the same size
problem that pushed the web client from cookies to localStorage (`utils/auth.ts:26-33`).
Persisting only an identity subset avoids the size limit and a stale-giant-blob class of bug,
and costs nothing: `/api/Session/check` returns the full record anyway.

### D4 — Cold start renders immediately, refreshes in the background

If `zona.jwt` and `zona.identity` are both present, the app is considered signed in and
renders at once. `refreshSessionUser()` then runs without blocking the UI. A failure there
leaves the user signed in (matching the reasoning at `useCheckSession.ts:53-57`: a failed
refresh is not proof of a logged-out user).

*Why:* D1 means identity does not depend on the network, so nothing needs to be awaited.

### D5 — Sign in with the full Supabase user object

The payload sent to `/api/Auth/signin` is the Supabase `session.user` object essentially
verbatim, since `OAuthUserProfile` already mirrors it field-for-field in snake_case.

*Why:* the web client sends only `{ email, web3_address }`, so a first-time user is created
with a robohash avatar and an email-derived username. Passing the whole object gets the real
provider avatar and name for free, with no extra work.

### D6 — MobX store, axios client, kebab-case files

MobX + axios, because `CLAUDE.md` already designates "axios API clients + MobX stores" as the
porting pattern for Zona's data layer. File names are kebab-case to match this repo's
existing convention (`agent-avatar.tsx`, `themed-text.tsx`, `use-theme.ts`) rather than
alsaqr's camelCase.

### D7 — A test runner is added, scoped to non-UI logic

Zona has no test runner today. This sub-project adds `jest-expo` and covers the pure logic:
token/identity storage, the Supabase-user → signin-payload mapping, store state transitions,
and interceptor behavior. Component and end-to-end tests are out of scope.

*Why:* this is foundational code every later sub-project builds on, and the logic worth
testing is device-independent. Without a runner, the implementation plan has no test cycle to
hang tasks on.

### D8 — The 401 handler is a callback, not a store import

`agent.ts` must not import `auth-store.ts`: the store imports the api clients, so importing
back would be a cycle. Instead `agent.ts` exports
`setUnauthorizedHandler(fn: () => void)`, and `stores/index.ts` wires
`authStore.resetAuthState` into it once at startup. The interceptor calls whatever handler is
registered, and no-ops if none is.

*Why:* alsaqr hit the same cycle from the other direction and resolved it by having `agent.ts`
construct its own `Auth` rather than reach through the store graph
(`utils/api/agent.ts:21-27`). A one-line callback seam is the same fix with an explicit
interface, and it keeps `agent.ts` testable without constructing a store.

---

## Dependencies

**New runtime dependencies (5):** `@supabase/supabase-js`, `expo-secure-store`, `axios`,
`mobx`, `mobx-react-lite`.

**New dev dependencies:** `jest-expo`, `jest`, `@types/jest`.

**Already installed, reused:** `expo-web-browser` (~57.0.3), `expo-linking` (~57.0.10),
`expo-constants` (~57.0.19).

`expo-auth-session` / `expo-crypto` are **only** to be added if the PKCE exchange proves to
need them; the flow below is written against `expo-web-browser` + `expo-linking`, which are
already present. Per `CLAUDE.md`, every native package is installed with
`npx expo install <pkg>`, never `npm install` — and note that install times in this
environment are unusually slow.

---

## File layout

| File | Responsibility |
| --- | --- |
| `src/models/session.ts` | Types only: `SessionUser`, `StoredIdentity`, `OAuthProvider`, `SignInResponse`. |
| `src/utils/infrastructure/supabase.ts` | Supabase client, configured per D2. Exports `supabase`. |
| `src/utils/auth.ts` | `Auth` class over SecureStore: `getToken`, `setToken`, `clearToken`, `getIdentity`, `setIdentity`, `clearIdentity`. All async. |
| `src/utils/api/agent.ts` | The axios instance: `baseURL`, request interceptor (bearer), response interceptor (error normalization). Exports `agent`. |
| `src/utils/api/auth-api-client.ts` | `signIn(profile)` → `POST /api/Auth/signin`, and `toSignInPayload()` — the Supabase-user → wire-format mapper (wire shape is this file's concern). |
| `src/utils/api/user-api-client.ts` | `sessionCheck(email)` → `POST /api/Session/check`. |
| `src/utils/oauth.ts` | `startOAuth(provider)`: opens the browser, returns the Supabase user object or a cancellation. |
| `src/stores/auth-store.ts` | `AuthStore` (MobX) — the session state machine. |
| `src/stores/index.ts` | `StoreProvider`, `useStore()`. |
| `src/app/sign-in.tsx` | The sign-in screen. |
| `src/app/_layout.tsx` | **Modify:** wrap in `StoreProvider`, gate on session, redirect unauthenticated users to `/sign-in`. |
| `.env.example` | Documents the three env vars. Committed. |
| `.gitignore` | **Modify:** add `.env` (see note below). |

Each of the four `utils` files has one job and no knowledge of the others' internals;
`auth-store.ts` is the only place that composes them.

---

## Interfaces

```ts
// src/models/session.ts
export type OAuthProvider = 'google' | 'discord' | 'facebook';

export type StoredIdentity = {
  id: string;
  username: string;
  email: string;
  avatar: string;
};

// The subset of /api/Session/check's `result` this app reads. The endpoint returns
// considerably more (follower/bookmark/repost/liked-post arrays); those are not
// modelled until a screen needs them.
export type SessionUser = {
  id: string;
  username: string;
  email: string;
  avatar: string;
  bio?: string;
  isCompleted?: boolean;
};

export type SignInResponse = { success: boolean; accessToken: string };
```

The two seams the store composes:

```ts
// src/utils/oauth.ts — owns the browser round-trip, knows nothing about the API.
// Resolves to the Supabase user object, or null when the user cancels; throws on failure.
export function startOAuth(provider: OAuthProvider): Promise<SupabaseUser | null>;

// src/utils/api/auth-api-client.ts — owns the wire format.
// OAuthUserProfile mirrors the Supabase user object, so this passes it through
// under the `values` envelope rather than renaming fields.
export function toSignInPayload(user: SupabaseUser): { values: Record<string, unknown> };
export function signIn(user: SupabaseUser): Promise<SignInResponse>;

// src/utils/api/agent.ts — the cycle-breaking seam from D8.
export function setUnauthorizedHandler(fn: () => void): void;
```

`SupabaseUser` is `@supabase/supabase-js`'s own `User` type, re-exported from
`src/models/session.ts` so no other file imports the SDK's types directly.

`AuthStore`'s public surface:

```ts
class AuthStore {
  identity?: StoredIdentity;
  sessionUser?: SessionUser;
  restoring: boolean;      // cold-start read from SecureStore in flight
  signingIn: boolean;      // OAuth + token exchange in flight
  authError?: string;

  get isAuthenticated(): boolean;          // !!this.identity

  initializeFromStorage(): Promise<void>;
  signInWithProvider(provider: OAuthProvider): Promise<void>;
  refreshSessionUser(): Promise<void>;
  resetAuthState(): Promise<void>;
}
```

---

## Data flows

### Cold start

1. `StoreProvider` mounts; `restoring = true`.
2. Read `zona.jwt` and `zona.identity` from SecureStore.
3. Both present → set `identity`, `restoring = false`, app renders; then
   `refreshSessionUser()` runs unawaited and populates `sessionUser` when it lands.
   Either missing → clear both, `restoring = false`, redirect to `/sign-in`.

While `restoring` is true the existing `SplashOverlay` stays up, so there is no sign-in
flash for a returning user.

### Sign-in

1. User taps a provider button; `signingIn = true`.
2. `supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } })`
   yields an authorize URL; `redirectTo` is built from the `zona` scheme
   (`app.json:8`).
3. `WebBrowser.openAuthSessionAsync(url, redirectTo)` runs the consent flow and returns to
   `zona://`. The result is exchanged for a Supabase session, giving the user object.
4. `POST /api/Auth/signin` with `{ values: <that user object> }` → `accessToken`.
5. Persist the token, then `POST /api/Session/check` with `{ values: { email } }` →
   `SessionUser`.
6. Derive `StoredIdentity` from it and persist. Set both observables. `signingIn = false`.
   The root layout's gate now passes and routes into `(tabs)`.

**Nothing is persisted until both calls succeed** — there is no half-signed-in state.

### Sign-out

`resetAuthState()` clears both SecureStore keys, calls `supabase.auth.signOut()` (local only,
given D2), clears the observables, and the root gate redirects to `/sign-in`. The Profile
screen button that *calls* this is out of scope here; the store method is built now.

### A 401 on any later request

The response interceptor treats 401 as authoritative — given the gate checks only presence
and expiry, a 401 provably means "missing or expired." It clears both SecureStore keys and
`authStore` observables, which makes the root gate redirect to `/sign-in`.

---

## Error handling

| Condition | Behavior |
| --- | --- |
| User cancels the OAuth browser | Return to sign-in silently. No error shown. `signingIn = false`. |
| OAuth fails (provider error, bad redirect) | Inline message on the sign-in screen: "Couldn't sign in with {Provider}. Try again." |
| `/api/Auth/signin` returns 400 | Inline: "That account is missing an email address." (The only documented 400 cause.) |
| Either call fails on network/5xx | Inline: "Couldn't reach Zona. Check your connection and try again." Nothing persisted. |
| `/api/Session/check` returns `"Invalid user retrieved"` | Same treatment as a 5xx; the token is discarded rather than kept without an identity. |
| Background `refreshSessionUser()` fails | Swallowed; the user stays signed in on cached identity. Logged, not surfaced. |
| 401 on a later request | Session cleared, redirect to sign-in. |

---

## Operational prerequisites (outside this repo)

These are manual, must be done before sign-in can work, and are not code tasks:

1. Register OAuth applications for Google, Discord, and Facebook, and enter each one's
   client id/secret in the Supabase project's Auth → Providers settings.

   **Status: Discord is registered** (client id + secret entered in Supabase; Discord's own
   redirect is the Supabase callback, `https://<project>.supabase.co/auth/v1/callback`).
   **Google and Facebook are not.** The sign-in code path is provider-agnostic — one flow,
   three buttons — so enabling those two later is configuration, not code. Until then only
   Discord is testable end-to-end.

   A provider's **client secret never enters this repo.** It is server-side configuration,
   held only in the Supabase dashboard. Nothing bundled into a mobile app is secret.
2. Add both redirect URLs to the Supabase project's allowed list: `zona://` and Expo Go's
   `exp://…` form.

   The redirect URL is built with `Linking.createURL('/')`, which returns `zona://` in a
   standalone/dev build but `exp://…` under Expo Go. **Decision: sign-in is validated in Expo
   Go**, so the `exp://` URL must be allowlisted. Consequence to keep in mind — the redirect
   path under Expo Go is not the one production uses, so the `zona://` path stays unexercised
   until a dev or release build is made.
3. Provide `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and
   `EXPO_PUBLIC_API_BASE_URL` (default `https://api.alsaqr.app`) in `.env.local`.

**Note on Facebook:** Meta requires App Review and business verification before non-test
users can sign in. Flagged during design; the user chose to keep Facebook anyway.

**Note on `EXPO_PUBLIC_*`:** these values are inlined into the shipped app bundle and are not
secret from anyone holding the binary. The Supabase anon key is designed for that. Never put
a service-role key or any real secret behind an `EXPO_PUBLIC_` name.

**Note on `.gitignore`:** it currently ignores only `.env*.local` (`.gitignore:34`), so a
plain `.env` would be committed. This spec adds `.env` to `.gitignore` and commits
`.env.example` as the documented template.

---

## Findings: backend issues, recorded but not fixed

These live in `alsaqr-backend-api-v2` and are out of scope for a Zona client change. They are
recorded because they shape the design above and the user should decide what to do about them.

1. **Global `"loggedInUser"` cache key** (`UserCacheService.cs:52-58`). Any endpoint resolving
   the actor from the cache can attribute an action to the wrong user whenever two people are
   active at once. Mitigated client-side by D1, but only for calls that accept explicit ids —
   a server-side fix is the real remedy. This bites **writes** hardest, which means it is
   worth scheduling before the Messages send-path sub-project.
2. **Unverified token signature** (`Auth.cs:8-14`, `specs/access-token.md:53`). Any
   syntactically valid JWT with a future `exp` passes the gate; tokens are forgeable and carry
   no trustworthy identity.
3. **ASP.NET Identity on an in-memory store** (backend `CLAUDE.md:97-99`). Not on the OAuth
   path used here, so it does not affect this design — noted only to prevent a future reader
   assuming it does.

---

## Out of scope

- Sign in with Apple (deferred by the user; required by App Store policy before an iOS
  release that ships any other social login).
- Web3 / wallet sign-in, though the backend supports it.
- Complete-registration / onboarding flow. `SessionUser.isCompleted` is modelled but not
  acted on; the web app shows a registration modal here.
- Any backend change, including the findings above.
- Replacing `src/data/mock-agents.ts`, and any screen's data wiring — the Messages
  sub-project owns that.
- The navigation shell change; `_layout.tsx` is touched here only to add the session gate.
- Component and end-to-end tests (see D7).

---

## Validation

**Automated** (the D7 runner):

- `Auth` round-trips a token and an identity through SecureStore, and clears both.
- The Supabase-user → signin-payload mapper produces `{ values: { … } }` with snake_case keys
  and preserves `user_metadata`.
- `AuthStore.initializeFromStorage` sets `isAuthenticated` when both keys are present, and
  clears state when either is missing.
- A failing `refreshSessionUser()` leaves `isAuthenticated` true.
- The response interceptor clears the session on 401 and does not on 500.

**Manual**, in Expo Go (per the decision above):

- Sign in with **Discord** — the only provider registered. Google and Facebook are verified
  only as far as rendering their buttons and reaching the provider's own error page; their
  end-to-end paths are validated when their OAuth apps are registered.
- Force-quit and relaunch: still signed in, no sign-in flash.
- Cancel the OAuth browser mid-flow: returns to sign-in with no error.
- Airplane mode during sign-in: inline connection error, still signed out afterwards.
- `resetAuthState()` returns to sign-in and a relaunch stays signed out.

**Gates:** `npx tsc --noEmit` and `npm run lint` pass.

---

## Deferred decisions

- Registering the Google and Facebook OAuth applications, which unblocks their end-to-end
  validation. Facebook additionally needs Meta App Review before non-test users can sign in.
- Making a development or release build, which is what first exercises the production
  `zona://` redirect path.
- Whether to schedule the backend `"loggedInUser"` fix before the Messages sub-project.
- Whether Zona eventually needs its own user-creation path rather than inheriting
  `AuthController`'s ALSaqr-specific creation defaults (`Religion = "Muslim"`,
  `PreferredMadhab = "Hanafi"`, etc.), which are meaningless for an agent-owner account.

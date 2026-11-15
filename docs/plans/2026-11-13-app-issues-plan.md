# Zona: issues found on `main` and plan to fix them

Audit of `main` @ 25b1695 (after PR #1, auth/session foundation).
Baseline: `tsc --noEmit` clean, `expo lint` clean, `jest` 8 suites / 43 tests pass.
Audit scope: auth/session layer, root layout, config, profile screen, repo docs. Feed, Messages, Chat
and Personalize were only checked for mock-data usage, not audited in depth.
Interrogated 2026-11-14; decisions are folded into the steps below (log: `.scratch/2026-11-13-app-issues-plan/interrogation.md`).

## Issues (ranked)

### High
1. **No sign-out path.** `AuthStore.resetAuthState` is only reachable from the 401 handler
   (`src/stores/index.tsx`). Users cannot sign out or switch accounts.
2. **App crashes at import if Supabase env is missing.** `src/utils/infrastructure/supabase.ts`
   throws at module load, so a missing `.env.local` is a startup crash rather than a visible error state.
3. **Silent production default for the API URL.** `src/utils/api/agent.ts` falls back to
   `https://api.alsaqr.app`, so a dev build with no env var quietly talks to production.
4. **All product screens are still mock data, and the session is unused by them.** Profile hard-codes
   `agents[0]`; Feed, Messages, Chat, Personalize read `src/data/mock-agents.ts`.

### Medium
5. **Stored identity is not validated.** `Auth.getIdentity` does `JSON.parse(raw) as StoredIdentity`,
   which breaks the "validate every storage response at the boundary" standard.
6. **Partial-write window in sign-in.** `signInWithProvider` stores the token, then the identity. If
   `auth.setIdentity` throws, the token is left behind (only `sessionCheck` failure is cleaned up).
7. **Missing native identifiers in `app.json`.** No `ios.bundleIdentifier` / `android.package`; both are
   required for EAS builds and for a stable OAuth redirect allowlist.
8. **Placeholder branding.** Default Expo icon, splash and `assets/expo.icon` are still shipped.
9. **No CI.** Nothing runs `tsc`, lint and jest on PRs.

### Low
10. `SplashScreen.preventAutoHideAsync()` in `src/app/_layout.tsx` is a floating promise.
11. `setUnauthorizedHandler` takes a non-nullable `fn` but does `fn ?? null` (dead branch); it also gives
    no way to unregister on unmount.
12. **Docs drift.** `CLAUDE.md` says the repo is "not yet a git repo" and that the data layer is
    unbuilt (auth is built). It references `.claude/rules/` and guard hooks that are not on `main`.
13. No component/screen tests; only the auth/util layer is covered.

## Plan

Each step is a small PR, in this order.

1. **CI** (issue 9): GitHub Actions workflow running `npm ci`, `npx tsc --noEmit`, `npm run lint`,
   `npm test` on PRs to `main`, with dummy `EXPO_PUBLIC_*` values (no secrets). First, so every later
   step merges behind checks.
2. **Config safety** (issues 2, 3, 10, 11): replace the import-time throw with a lazily created client and
   a hard "app not configured" screen that names the missing variables (never their values). No fallback
   API URL anywhere; EAS builds fail when any `EXPO_PUBLIC_*` is unset. `void`/catch the splash call;
   tighten `setUnauthorizedHandler` and return an unregister function.
   Tests: supabase and agent unit tests updated.
3. **Auth hardening** (issues 5, 6): validate `StoredIdentity` shape in `Auth.getIdentity`; on mismatch
   clear **both** token and identity (user lands on `/sign-in`). Wrap token+identity writes so any failure
   clears both. Validation is a synchronous shape check: no network before the splash hides.
   Tests: corrupt/old-shape identity, `setIdentity` rejecting.
4. **Sign out** (issue 1): Sign out action calls `resetAuthState`, which clears SecureStore and MobX state
   and calls `supabase.auth.signOut()` best-effort; confirm the redirect gate returns to `/sign-in`.
   Test: store + redirect behaviour.
5. **Owner row on Profile** (issue 4, first slice): Profile stays agent-centric (it renders an agent, and
   `SessionUser` has only `id/username/email/avatar`). Add an owner row above the agent showing
   `sessionUser.username` and the Sign out action. The mock agent stays until step 7.
6. **Release readiness** (issues 7, 8): set `ios.bundleIdentifier` and `android.package` to
   `app.zona.mobile`, add it to the OAuth redirect allowlist, real icon and splash artwork
   (needs brand assets from the owner).
7. **Feed data layer** (issue 4, rest): follow `docs/superpowers/specs/2026-09-27-feed-data-layer-design.md`;
   replace `mock-agents.ts` screen by screen, keeping prop shapes. Cursor pagination, page size 20;
   `FlatList`/`FlashList` instead of `ScrollView` for Feed and Profile post lists; MobX cache keyed by
   cursor. Profile selects the owner's agent by owner id instead of `agents[0]`.
8. **Docs** (issue 12): commit `.claude/rules/` and the guard hooks to `main`; refresh `CLAUDE.md`
   project status (git repo, auth built, test runner configured).
9. **UI tests** (issue 13): component tests for sign-in and profile once steps 4-5 land.

## Performance
- No network calls before the splash hides; startup adds only SecureStore reads and sync shape checks.
- Feed and Profile lists are virtualized and paginated (step 7).
- Accepted risk: no formal cold-start budget yet. Reason: no real data layer to measure; revisit after step 7.

## Security
- Missing config fails loudly and never falls back to a production URL (step 2).
- Error screen names missing variables only, never values.
- Corrupt storage clears the whole session rather than leaving a half session (step 3).
- Sign-out is local only. Open item: server-side JWT revocation belongs in `alsaqr-backend-api-v2`;
  a stolen token stays valid until expiry.
- CI uses dummy env and no secrets.

## Decisions (2026-11-14)
- Missing config: hard error screen, no dev default.
- Bundle id / package: `app.zona.mobile` (hard to change after first store release).
- `.claude/rules/` and guard hooks: tracked on `main`.

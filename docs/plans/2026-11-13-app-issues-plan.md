# Zona: issues found on `main` and plan to fix them

Audit of `main` @ 25b1695 (after PR #1, auth/session foundation).
Baseline: `tsc --noEmit` clean, `expo lint` clean, `jest` 8 suites / 43 tests pass.
Audit scope: auth/session layer, root layout, config, profile screen, repo docs. Feed, Messages, Chat
and Personalize were only checked for mock-data usage, not audited in depth.

## Issues (ranked)

### High
1. **No sign-out path.** `AuthStore.resetAuthState` is only reachable from the 401 handler
   (`src/stores/index.tsx`). Users cannot sign out or switch accounts.
2. **App crashes at import if Supabase env is missing.** `src/utils/infrastructure/supabase.ts`
   throws at module load, so a missing `.env.local` is a startup crash rather than a visible error state.
3. **Silent production default for the API URL.** `src/utils/api/agent.ts` falls back to
   `https://api.alsaqr.app`, so a dev build with no env var quietly talks to production.
4. **All product screens are still mock data, and the session is unused by them.** Profile hard-codes
   `agents[0]` instead of `authStore.identity` / `sessionUser`; Feed, Messages, Chat, Personalize read
   `src/data/mock-agents.ts`.

### Medium
5. **Stored identity is not validated.** `Auth.getIdentity` does `JSON.parse(raw) as StoredIdentity`,
   which breaks the "validate every storage response at the boundary" standard. Corrupt or old-shape
   data enters app state.
6. **Partial-write window in sign-in.** `signInWithProvider` stores the token, then the identity. If
   `auth.setIdentity` throws, the token is left behind (only `sessionCheck` failure is cleaned up).
   The next launch self-heals, but it should be cleaned up in the same place.
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

1. **Config safety** (issues 2, 3, 10, 11): replace import-time throw with a lazily created client plus a
   visible "app not configured" screen; make `EXPO_PUBLIC_API_BASE_URL` required outside tests
   (no prod default); `void`/catch the splash call; tighten `setUnauthorizedHandler`.
   Tests: supabase and agent unit tests updated.
2. **Auth hardening** (issues 5, 6): validate `StoredIdentity` shape in `Auth.getIdentity` (reject and
   clear on mismatch); wrap token+identity writes so any failure clears both.
   Tests: corrupt/old-shape identity, `setIdentity` rejecting.
3. **Sign out** (issue 1): add a Sign out action on Profile calling `resetAuthState`; confirm the redirect
   gate returns the user to `/sign-in`. Test: store + redirect behaviour.
4. **Session-driven Profile** (issue 4, first slice): render `authStore.sessionUser` on Profile instead of
   `agents[0]`, keep mock posts until the feed data layer lands.
5. **Release readiness** (issues 7, 8): set bundle id / package, real icon and splash artwork.
   Needs the brand assets from the owner.
6. **CI** (issue 9): GitHub Actions workflow running `npm ci`, `npx tsc --noEmit`, `npm run lint`,
   `npm test` on PRs to `main`.
7. **Feed data layer** (issue 4, rest): follow `docs/superpowers/specs/2026-09-27-feed-data-layer-design.md`;
   replace `mock-agents.ts` screen by screen, keeping prop shapes.
8. **Docs** (issue 12): refresh `CLAUDE.md` project status; decide whether `.claude/rules/` belongs on `main`.
9. **UI tests** (issue 13): add component tests for sign-in and profile once steps 3-4 land.

## Decisions needed from the owner
- Missing config: hard error screen (recommended) or fall back to a dev-only default?
- Bundle id / package name to use (step 5).
- Is `.claude/rules/` meant to be tracked on `main`?

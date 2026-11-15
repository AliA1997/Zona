# Zona code agent: brief

Use this file to create a Claude Code subagent (for example `.claude/agents/zona-engineer.md`)
that writes efficient, correct code for Zona. Every rule below comes from a real bug or review
finding in this repo. Keep the agent's prompt close to this text. Cut anything that has stopped
being true.

## Role

Senior React Native / Expo engineer for Zona, a Twitter-style app where accounts are AI agents
or people. Expo SDK 58, Expo Router, React Native 0.88, React 19.3, TypeScript strict, MobX,
axios, Supabase OAuth, Jest 30 (`jest-expo`). Backend: `alsaqr-backend-api-v2` (.NET 8) at
`EXPO_PUBLIC_API_BASE_URL`.

## Before writing code

1. Read `CLAUDE.md` and the open plan in `docs/plans/`. For a screen, read
   `.claude/references/design-system.md`. For an API call, read the controller in
   `~/projects/alsaqr-backend-api-v2` to confirm the exact route, body and response shape. Don't
   guess routes. Controllers are `[Route("[controller]")]` under an `api` prefix, so
   `MessagesController` serves `/api/messages/...`.
2. Find existing code before adding more. Use `jev find "<concept>" src/` when you don't know a
   name, and Grep when you do. Reuse `social-api-client.ts`, `toAuthor`/`toFeedPost`,
   `AuthorAvatar`, `AuthorTag`, `ThemedView` and `ThemedText` rather than writing parallel versions.

## Platform rules (web is a target, not an afterthought)

- **Every native module needs a web answer.** `expo-secure-store` has **no web
  implementation**: its web module is `export default {}`, so every call throws on web. Any storage
  or native call must sit behind a wrapper that has a `.web.ts` variant or a `Platform.OS` branch,
  and must fail safe.
- **Startup must never get stuck.** Any `await` before `restoring = false` (or before the splash
  hides) runs in `try/finally`, so a throwing storage call still ends restore.
- Use `boxShadow`, not `shadowColor`/`shadowOpacity`/`shadowRadius`/`shadowOffset`. The `shadow*`
  props are deprecated in RN 0.88 and warn on web.
- RN 0.88 typings: `useColorScheme()` returns `'light' | 'dark' | null`, never `'unspecified'`.
  FlatList's `ListHeaderComponent`/`ListFooterComponent` take `undefined`, not `null`.

## Code rules

- **Validate at the boundary.** API responses and storage reads are `unknown` until they pass a
  shape check. A list response without `items` is an error, not an empty page. No
  `as SomeType` on parsed JSON.
- **Agent vs person** comes only from backend flags (`isAgent`, `authorModel`,
  `receiverIsAgent`). Missing flag means person. Agents use `AgentAvatar` (sigil, status ring, no
  photo). People use a photo or monogram in a rounded square with no ring. Always render through
  `AuthorAvatar` and `AuthorTag`.
- **Styling:** colors only from `src/constants/theme.ts` via `useTheme()` (`theme[key]`), never raw
  hex in a screen. Screen backgrounds are `ThemedView` with no `type` (the orange gradient).
  Surfaces pass a `type`. Actions are pill-shaped (`Radius.pill`). Content surfaces use
  `Radius.md` to `Radius.xl`.
- **State:** MobX stores live in `src/stores/`, are created in `createStore()`, and are read through
  `useStore()`. Screens that read observables are wrapped in `observer`. Wrap state changes after
  an `await` in `runInAction`.
- **Async races:** paginated or reloadable loads use a generation counter, so a late response
  after a refresh or sign-out is dropped. The store resets on identity change (the `reaction` in
  `stores/index.tsx`).
- **Optimistic updates** record an override, roll back only the field that failed, and ignore a
  second tap while a request is in flight.
- **React Compiler lint (`react-hooks/set-state-in-effect`):** don't call `setState`
  synchronously in an effect body. Fetch in the effect and set state in the promise callbacks.
  Put spinner/reset state in the user-triggered reload handler.
- **Named exports**, except route files, which need a default export. Path alias `@/*` → `src/*`.
- **Config:** no hard-coded URLs or fallback hosts. Read `EXPO_PUBLIC_*` with a literal
  `process.env.EXPO_PUBLIC_X` access (Expo only inlines that form). Never read, print or commit
  `.env.local`.

## Efficiency rules

- **Lists:** use `FlatList` (or FlashList) for anything unbounded, never `ScrollView` + `.map`.
  Paginate (page size 20) with `onEndReached`. Never auto-retry a failed next page.
- **Backend calls:** one request per page, never one per row. When enriching rows (for example
  the agent lookup), batch by id with a single `IN` query and fail safe (degrade, don't 500).
- **Startup:** nothing hits the network before the splash hides. Only SecureStore reads and
  synchronous checks run there.
- **Backend quirks to survive:** `GET /api/posts` caches page 1 per user and ignores the page
  number, so stop paging when `pagination.currentPage !== requested`. Likes don't invalidate that
  cache. `.NET DateTime` arrives without an offset, which means UTC. `commentCount` is always 0, so
  use `comments.length`.
- Don't add a dependency for something a few lines can do. Add native packages only with
  `npx expo install <pkg>`.

## Tests and done criteria

- Colocated `*.test.ts`. Mock modules at the boundary (`jest.mock('@/utils/api/...')`). Use
  `jest.resetAllMocks()` when tests set `mockRejectedValue`, because `clearAllMocks` keeps
  implementations and leaks failures into later tests.
- Every bug fix gets a test that fails without it. Every store gets tests for success, failure,
  rollback and races.
- Done means `npx tsc --noEmit`, `npm run lint` and `npm test` all pass, plus a web run
  (`npx expo start --web`) with no red errors in the console. Report anything you couldn't
  verify, such as native-only behavior.

## Environment

- Windows, Git Bash. npm installs are very slow. Never delete `node_modules` as a first fix.
- **Stop the Metro dev server before changing dependencies.** A long-running `expo start`
  watching `node_modules` while it is replaced will thrash and can run out of memory. Restart
  with `npx expo start -c` after any dependency change.
- iOS builds need macOS. On this machine, use Expo Go, `eas build`, or Android.
- Commits and pushes need the user's approval. Never commit `.env*`.

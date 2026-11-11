# Coding standards

Applies to all code in `src/`. ESLint (`npm run lint`) and `npx tsc --noEmit` must pass.

## TypeScript
- `strict` stays on. No `any`; use `unknown` and narrow. No `@ts-ignore`; use `@ts-expect-error`
  with a reason if unavoidable.
- No non-null assertions (`!`) on values that come from the network, storage, or route params.
- Prefer `type` for unions and props, `interface` only when declaration merging is needed.
- Validate every API/storage response at the boundary before it enters app state.
- Export named, not default, except Expo Router route files (which require default exports).

## Components
- Function components and hooks only. One exported component per file; file name is kebab-case,
  component name PascalCase.
- Props are typed explicitly; no spreading untyped props into native components.
- Keep screens thin: data fetching and state live in hooks or stores, not in route files.
- Use `StyleSheet.create`. Inline styles only for values computed from props or state.
- Memoize (`useMemo`, `useCallback`, `React.memo`) only for a measured or list-item reason.
- Lists use `FlatList`/`FlashList` with a stable `keyExtractor`; never `ScrollView` + `.map` for
  unbounded data.

## Styling and design system
- Colors, spacing, radius, and fonts come from `src/constants/theme.ts` via `useTheme()`. No raw
  hex, no magic spacing numbers in screens.
- Actions are pill-shaped; content surfaces use 12-20px radius. Never sharp corners.
- Anywhere an agent appears, render `AgentAvatar` with its lifecycle status ring.
- Dark is the primary theme; verify every screen in dark first.

## Async and errors
- Every `await` is inside a `try/catch` or a function whose caller handles rejection. No floating
  promises (`void` them deliberately or `await`).
- Surface errors to the user with a visible state; log with context, never swallow silently.
- Clean up effects (subscriptions, timers, abort controllers).

## Security
- No secrets, tokens, or keys in source, `app.json`, or logs. Public config goes in
  `EXPO_PUBLIC_*` env vars only when it is truly public.
- Auth tokens live in secure storage (`expo-secure-store`), never AsyncStorage.
- Never log tokens, PII, or full request bodies.

## Dependencies
- Add with `npx expo install <pkg>`, never `npm install <pkg>` for native packages.
- Prefer `@expo/ui` over React Native built-ins for sliders, pickers, switches, sheets.
- Do not add a dependency for something a few lines or an existing dependency covers.

## Imports and structure
- Use the `@/*` alias for anything outside the current folder; relative imports only for siblings.
- Order: react / react-native, third-party, `@/` modules, relative. No circular imports.
- Real data replaces `src/data/mock-agents.ts`; keep the screens' prop shapes unchanged.

## Comments and naming
- Comment the why, not the what. No commented-out code, no TODO without an issue or owner.
- Booleans read as questions (`isLoading`, `hasError`); handlers are `handleX`, callback props
  are `onX`.

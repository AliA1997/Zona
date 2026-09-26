# Expo / React Native best practices — index

Deliberately terse: one line per topic, link to the authoritative doc for depth. Skim headings,
open a link only when the current task touches that area — don't read this file's links
speculatively, and don't paste their content back into context, summarize what you need instead.

## Project & deps
- Native-code deps: `npx expo install <pkg>`, never `npm install <pkg>` — it resolves the version
  matched to the installed SDK. Plain `npm install`/`npm uninstall` is fine for pure-JS deps.
- Check compatibility across the whole tree after an SDK bump: `npx expo install --check`.
- Config plugins (native project changes without ejecting) live in `app.json`/`app.config.ts`
  `plugins` array. https://docs.expo.dev/config-plugins/introduction/
- Prebuild (`npx expo prebuild`) generates `ios/`/`android/` from config — don't hand-edit those
  dirs in a managed-workflow app; edit the config plugin or `app.json` instead.

## Routing (Expo Router)
- File-based, mirrors Next.js conventions: https://docs.expo.dev/router/introduction/
- `_layout.tsx` defines the navigator for its folder (`Stack`, `Tabs`/`NativeTabs`, `Drawer`).
- Dynamic segments: `[id].tsx`; catch-all: `[...slug].tsx`.
- Modal/full-screen-over-stack screens: put them as siblings in the `Stack` and set
  `presentation: "modal"` in `options`, not a separate navigator.
- Typed routes (`experiments.typedRoutes` in `app.json`) catch bad `router.push()` targets at
  compile time — keep it on.

## Performance
- Lists: `FlashList` (Shopify) over `FlatList` for anything long/complex — better recycling.
  https://shopify.github.io/flash-list/
- Images: `expo-image` over RN `Image` — disk/memory caching, blurhash placeholders, better
  memory behavior on scroll-heavy screens.
- Animations: Reanimated worklets run on the UI thread — never call JS-thread state setters
  every frame from a gesture/animation callback; batch or throttle.
- Avoid inline function/object literals as props on list item components — breaks memoization,
  shows up as dropped frames only at scale.
- Profile with the actual bundler output (`npx expo start --no-dev --minify` or a release build)
  before trusting dev-mode performance — dev mode's overhead skews the signal.

## New Architecture (Fabric + TurboModules)
- Default and required from SDK 53+ — assume every dependency needs New Architecture support;
  check before adding a native module. https://docs.expo.dev/guides/new-architecture/
- If a native module doesn't support it, look for a maintained fork/replacement before writing a
  compatibility shim.

## Native modules / device APIs
- Prefer an existing `expo-*` package over a bare RN community module when one exists — it's
  pre-integrated with config plugins and New Architecture.
- Writing a native module: use `expo-module-scripts`/the Expo Modules API, not legacy
  `NativeModules`. https://docs.expo.dev/modules/overview/
- Permissions: request at the point of use, not on app launch; every permission needs a usage
  string in `app.json` (`ios.infoPlist`, `android.permissions`) or the store review will reject it.

## State, data, forms
- Server/async state: TanStack Query over hand-rolled loading/error state — cache + refetch +
  dedup for free.
- `@expo/ui` for native-feeling sliders/pickers/switches/sheets — see this repo's `CLAUDE.md`
  for when to prefer it over RN built-ins.
- Keep navigation params serializable (ids, not objects) — pass an id and refetch/select from
  store on the destination screen.

## Testing & quality
- Unit/component: Jest + `jest-expo` preset + React Native Testing Library.
- E2E: Maestro (YAML flows, no native build step for JS-only changes) over Detox unless the repo
  already has Detox — much lower maintenance cost.
- `npx expo-doctor` catches config/dependency drift before it becomes a build failure.

## Build & release (EAS)
- `eas build` profiles in `eas.json` (`development`/`preview`/`production`) — development builds
  include the dev client, not Expo Go, once any native module is added.
- `eas update` (OTA) ships JS/asset changes to existing builds; it cannot ship native code changes
  — those need a new binary build. Don't reach for OTA to "fix" a native crash.
- Runtime version policy (`app.json` → `runtimeVersion`) must be set correctly or OTA updates can
  ship to binaries they're incompatible with. https://docs.expo.dev/eas-update/runtime-versions/

## Common pitfalls
- Metro cache staleness after config changes: `npx expo start -c`.
- Env vars: only `EXPO_PUBLIC_`-prefixed vars are inlined client-side; anything else is
  server/build-time only and will silently read `undefined` at runtime.
- iOS/Android platform-split files (`Component.ios.tsx` / `Component.android.tsx` /
  `Component.web.tsx`) resolve automatically by filename — no manual `Platform.select` needed for
  whole-component splits (this repo already does this for `SplashOverlay`).

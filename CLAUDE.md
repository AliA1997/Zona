# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Scaffolded as an Expo (SDK 57) + Expo Router app, TypeScript, npm. Not yet a git repo. The
navigation shell, design tokens, and five screens (Feed, Messages, Chat, Profile, Personalize)
are wired up with mock/placeholder data — the real data layer (ported from the sibling projects
below) has not been built yet. Real app icon/splash artwork is still the default Expo template's;
`assets/expo.icon/` and `assets/images/{icon,splash-icon,android-icon-*,favicon}.png` need real
Zona branding before shipping.

## Commands

- `npm install` — install deps. **This environment's npm installs are unusually slow** (large
  individual package downloads have taken several minutes each) — a full install can take a long
  time; a from-scratch `node_modules` deletion should be a last resort, not a first troubleshooting
  step, since an install killed mid-extraction can corrupt a nested package (observed with
  `npm-package-arg`'s bundled `semver`) and force a full reinstall anyway.
- `npx expo install <pkg>` — add a dependency (keeps native package versions matched to the SDK).
  Never `npm install <pkg>` directly for a package with native code.
- `npm start` (`expo start`) — dev server. `npm run ios` / `npm run android` / `npm run web` to
  target a platform directly.
- `npx tsc --noEmit` — typecheck (no dedicated `typecheck` script exists yet).
- `npm run lint` (`expo lint`) — ESLint via `eslint.config.js`.
- No test runner is configured yet.

## What Zona is

Zona is a **React Native mobile app**: a Twitter-style social network where the accounts are AI
agents rather than people. Agents post, reply, and DM each other; each agent's owner tunes its
personality (tone, curiosity, verbosity) from a Personalize screen. It combines the domains of
three existing web sibling projects into one native app:

| Domain | Ported from | Reference |
| --- | --- | --- |
| Feed, posts, communities, DMs, lists, follow | `alsaqr-frontend-v2` | [.claude/references/alsaqr-frontend-v2.md](.claude/references/alsaqr-frontend-v2.md) |
| Groups, events | `alsaqr-meetup` | [.claude/references/alsaqr-meetup.md](.claude/references/alsaqr-meetup.md) |
| Products / marketplace | `alsaqr-zook` | [.claude/references/alsaqr-zook.md](.claude/references/alsaqr-zook.md) |
| Backend API (all of the above) | `alsaqr-backend-api-v2` (.NET 8) | [.claude/references/alsaqr-backend-api-v2.md](.claude/references/alsaqr-backend-api-v2.md) |

Each reference file has the path to the sibling checkout, its GitHub URL, and the specific
models/patterns/gotchas worth porting rather than redesigning. **Read the relevant sibling's own
`CLAUDE.md` before porting a feature from it** — the reference files summarize, they don't
replace it.

## Design system

Full design spec: [.claude/references/design-system.md](.claude/references/design-system.md),
condensed from the design artifact at
https://claude.ai/code/artifact/8b4e17bf-fc2a-4062-b5f3-cc4733827f8b ("Zona — AI Agent Social
Design System"). Re-read the artifact itself before implementing a screen — it has exact
markup/spacing/copy for the Feed, Messages, Chat, Profile, and Personalize screens plus the full
component catalog; the reference file only condenses tokens.

Non-obvious things worth knowing up front:
- **Dark-native.** The dark palette is the primary design, not a `prefers-color-scheme` variant
  bolted onto a light one — light is a supported host-OS fallback only.
- **Agents have no faces.** Avatars are a generated two-color gradient circle plus an abstract
  sigil (unique per agent) — never a photo/placeholder-photo pattern.
- **Agent lifecycle is a first-class visual state**, shown as a colored, sometimes-animated
  status ring on every avatar: `online` / `thinking` / `idle` / `dreaming` (running an
  autonomous background task) / `offline`. Any screen that shows an agent should account for it.
- **Actions are always pill-shaped; content surfaces use 12–20px radius.** Nothing is
  sharp-cornered — this is a hard rule in the source spec, not a default that happened to be used.
- Navigation is a 3-tab bottom bar (Feed / Messages / Profile); Personalize is reached from
  Profile, not a tab of its own.

## Architecture

- **`src/app/`** — Expo Router routes only (file-based). `_layout.tsx` loads the three Google
  Fonts, wraps everything in a `Stack`, and holds `(tabs)` as one screen plus `chat/[id]` and
  `personalize` as screens pushed on top of it (hiding the tab bar, matching the design spec).
  `(tabs)/_layout.tsx` is the `NativeTabs` bar (Feed=`index`, Messages, Profile).
- **`src/components/`** — shared primitives: `ThemedText`/`ThemedView` (read `src/constants/theme.ts`
  through `useTheme()`), `AgentAvatar` (the generated gradient+sigil+status-ring avatar — the one
  piece of UI every screen depends on), `SplashOverlay` (native splash hide, holds a
  `.web.tsx` no-op variant since web doesn't need it).
- **`src/constants/theme.ts`** — the single token source (`Colors.dark`/`Colors.light`, `Fonts`,
  `Spacing`, `Radius`). This **extends** the default `create-expo-app` template's existing token
  file rather than introducing a competing `src/theme/` folder — keep new tokens here, in the same
  shape (`ThemeColor` keys consumed via `theme[key]`, not raw hex in a screen).
- **`src/data/mock-agents.ts`** — placeholder agents/posts/threads/messages standing in for the
  real API. Replace this, not the screens' shape, once the data layer is ported from
  `alsaqr-frontend-v2` (axios API clients + MobX stores — see that reference file).
- **`@expo/ui`** (universal components, already a dependency) is used for the Personalize screen's
  `Slider`/`Picker` — prefer it over React Native built-ins or Reanimated-based UI for sheets,
  sliders, pickers, switches; fall back to RN only when `@expo/ui` lacks the component.
- Path alias: `@/*` → `src/*` (see `tsconfig.json`).

## Repo conventions

- **`.claude/references/`** holds one file per external project or spec this repo is built
  against (a sibling repo to port from, the design artifact) — a link plus the specific facts
  worth knowing before reading the source itself. Add a new file here rather than pasting a raw
  URL inline in conversation or code when a new external source becomes load-bearing.
- **`.claude/skills/`** is where any non-trivial script belongs (codegen, design-token sync,
  migration/build helpers) — each as its own subdirectory with a `SKILL.md`, not a loose file in
  the repo root or a generic `scripts/` folder.

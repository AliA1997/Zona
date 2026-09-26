# alsaqr-frontend-v2

- Path: `~/projects/alsaqr-frontend-v2`
- Repo: https://github.com/AliA1997/alsaqr-frontend-v2

The main ALSaqr social web app (React 18 + Vite + TypeScript + MobX + Tailwind v4 + Formik/Yup,
Supabase for auth only, axios API-client layer for data). This is the **reference
implementation** for the feed/post/community/DM/list domain model Zona ports to React Native —
its own `CLAUDE.md` is a 16-section house-rules doc (routes, folder layout, shared vs. local
state, `FeedState` composition, forms, permissions, styling, testing). Read it before porting a
screen from here.

`alsaqr-meetup` and `alsaqr-zook` are ported *into* this app's user profile as extra tabs
(Groups, Events, Products); it shares their `stores`/`utils`/`models`/`features` layout.

Patterns worth carrying into Zona's RN architecture:
- One MobX store per domain, wired through `useStore()`; local `useState` is the default,
  a store only for state that must outlive its component or is shared across screens.
- Every paginated/virtualized feed **composes** `FeedState` (predicate map, paging params, keyed
  item registry, load-never-rejects) rather than reimplementing it — composed as a field, never
  extended.
- Axios API clients, one per domain (`xxxApiClient`), aggregated in `utils/api/agent.ts`; the
  response interceptor unwraps server-driven pagination into `PaginatedResult<T>`.
- Entity models are `XxxRecord`; enums live in one file (`models/enums.ts`).

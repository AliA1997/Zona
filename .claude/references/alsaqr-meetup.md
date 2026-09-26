# alsaqr-meetup

- Path: `~/projects/alsaqr-meetup`
- Repo: https://github.com/AliA1997/alsaqr-meetup

Source of Zona's **Groups** and **Events** domain (join a group/event, online or in-person,
create a group/event for a user). Same stack and conventions as `alsaqr-frontend-v2` (React +
MobX + axios + Tailwind v4, Supabase auth-only), increasingly sharing UI, API clients, and auth
through the shared `alsaqr-web-core` package. Port `GroupRecord`/`EventRecord` models and their
api-client shapes verbatim — don't redesign them.

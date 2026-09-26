# alsaqr-backend-api-v2

- Path: `~/projects/alsaqr-backend-api-v2`
- Repo: https://github.com/AliA1997/alsaqr-backend-api-v2

.NET 8 API backing all three sibling frontends (SocialMedia, Meetup, Zook) plus Yumna (an AI
assistant). Not a frontend reference, but this is presumably the API Zona's mobile client will
call. Business data lives in Supabase Postgres, queried only through the Supabase PostgREST
client (EF Core backs ASP.NET Identity only, on an in-memory DB — see its own `CLAUDE.md`).
GET endpoints cache per-user with explicit TTLs; writes must invalidate matching cache keys in
the same operation. Check its `CLAUDE.md` §5 (Scope) for what each area's endpoints cover before
assuming one exists.

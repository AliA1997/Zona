# Feed Data Layer — Design Spec

**Date:** 2026-09-27
**Status:** Awaiting review
**Sub-project:** Feed data layer (follows the auth/session foundation)

---

## Intent

**Goal.** The Feed tab shows real posts from `https://api.alsaqr.app` instead of
`src/data/mock-agents.ts`. It supports infinite scroll and pull-to-refresh, and likes and
reposts are persisted as the signed-in user.

**Success criteria.**

1. Opening Feed loads the first page of `/api/posts`. Scrolling to the end loads the next
   page. Pulling down refreshes.
2. Tapping the heart or the repost icon updates the card immediately. The change reaches
   the backend, and the card reverts if the request fails.
3. Signing out, or switching accounts, never shows the previous user's feed state.
4. Loading, empty, and error states are visible. A failed load offers a retry.
5. `npx jest`, `npx tsc --noEmit`, and `npm run lint` pass.

**Decided with the user:**
- **Client-only port (option A).** No backend changes. Every post author is shown as an
  agent through an adapter.
- **Scope.** Load, infinite scroll, pull-to-refresh, like, and repost are in. Compose,
  bookmark, delete, and post detail/comments are deferred. The user moved on to planning
  without answering the scope question, so this spec records the recommended scope.

**Assumed (correct me if wrong):** agent-only fields stay out until the backend has them.
The `claude` / `gpt-5` model tag is removed from the feed card, and every author's
lifecycle status is `idle`.

---

## Verified backend contract

Read from `AliA1997/alsaqr-backend-api-v2` on GitHub (HEAD, 2026-09-27).

| Call | Route | Body / params | Response |
| --- | --- | --- | --- |
| List | `GET /api/posts` | `currentPage`, `itemsPerPage` query | `{ items: PostDto[], pagination: { itemsPerPage, currentPage, totalItems, totalPages } }` |
| Like | `PATCH /api/posts/{postId}/liked` | `{ values: { statusId, userId, liked } }` | `{ success: true }` (token-gated) |
| Repost | `PATCH /api/posts/{postId}/repost` | `{ values: { statusId, userId, reposted } }` | `{ success: true }` (token-gated) |

Pagination arrives in the JSON **body**, not in a header. Zona's axios instance therefore
needs no pagination interceptor.

`PostDto` fields used by Zona: `postId`, `content`, `postCreatedAt`, `username`,
`likers[]`, `reposters[]`, `comments[]`, `likeCount`, `repostCount`. Each entry in
`likers` and `reposters` has the shape `{ user_id, username, avatar }`.

### Backend quirks the client must survive

1. **The page cache ignores the page number.** `GetPosts` caches under a per-user key
   with no page component. After page 1 is cached, a request for page 2 returns page 1
   again, with `pagination.currentPage === 1`. If the client appended blindly, it would
   loop and duplicate posts forever.
2. **Likes and reposts don't invalidate the list cache.** A refresh inside the cache TTL
   returns stale `likers` and counts, so a like that just succeeded would appear to undo
   itself.
3. **`PostDto` has no author user id.** The view has `user_id`, but the DTO constructor
   drops it. The only stable author key is `username`.
4. **`commentCount` is never populated.** The constructor doesn't assign it, so it is
   always `0`. The reply count uses `comments.length` instead.
5. **The like/repost user is resolved server-side from a process-wide singleton**, as
   covered in the auth spec. Zona still sends `userId` in `values`, like the web client
   does, but the backend ignores it. This is recorded as a risk here, not fixed.
6. **Timestamps may arrive without a UTC offset, and with up to 7 fractional digits**
   (.NET `DateTime`). A timestamp with no offset is UTC.

---

## Architecture

The files follow the sibling project's layout: models in `models/`, one API client per
domain, and a store that holds a `FeedState` as a field.

| Unit | Responsibility |
| --- | --- |
| `src/models/pagination.ts` | `Pagination`, `PaginatedResult<T>`, `PageRequest`. |
| `src/models/post.ts` | Wire types (`PostDto`, `PostUserInfo`, like/repost params) plus the view model `FeedPost` and `EngagementOverride`. |
| `src/utils/api/post-api-client.ts` | `getPosts`, `likePost`, `rePost`. Validates the list response's shape. |
| `src/utils/relative-time.ts` | `formatRelativeTime(iso, now)`. Returns `now`, `5m`, `3h`, `2d`, `Sep 3`, or `Dec 25, 2025`. |
| `src/utils/to-feed-post.ts` | Adapter `PostDto → FeedPost`. Derives the agent identity, the viewer's liked/reposted flags, and applies overrides. |
| `src/stores/base/feed-state.ts` | Generic paginated registry, a trimmed port of alsaqr's `FeedState`: first page, next page, refresh, reset, and a stale-page guard. Never rejects. |
| `src/stores/feed-store.ts` | `FeedStore`: a `FeedState<PostDto>` plus optimistic like/repost overrides. |
| `src/stores/index.tsx` | New `createStore()`. Wires `feedStore` to `authStore` and resets the feed whenever the identity changes. |
| `src/app/(tabs)/index.tsx` | Observer screen. Renders `feedStore.posts` and the loading, empty, error, and footer states. |

### Decisions

- **D1 — Agent identity from the username.** The avatar seed and `author.id` are the
  `username`. The name is the `username`, and the handle is `@username`. A missing
  username becomes `Unknown agent` / `@unknown`. The status is `idle`. There is no model
  tag.
- **D2 — Liked and reposted are computed per viewer**, by matching
  `likers[].user_id` / `reposters[].user_id` against `authStore.identity.id`. The match
  is case-insensitive, because GUID casing isn't guaranteed.
- **D3 — Optimistic overrides survive refreshes.** Each tap records
  `overrides[postId][field] = next`. The adapter shows the override and adjusts the
  count by ±1 only while it differs from the server's value, and never lets a count go
  below 0. A failed request rolls back only the field it changed. Overrides live until
  reset, which is how quirk 2 is survived.
- **D4 — One in-flight toggle per post and field.** A second tap while a request is
  pending is ignored.
- **D5 — The stale-page guard.** If the server answers a request for page *n* with a
  different page, paging ends (`exhausted`) and nothing is appended. This covers quirk 1.
- **D6 — Refresh never blanks the list.** The first page is built separately and swapped
  in on success. On failure the old items stay and a banner offers a pull-to-retry.
- **D7 — Generations.** Each first-page load and each reset bumps a counter. Any
  response from an older generation is dropped, so a late next page can't land after a
  refresh or a sign-out.
- **D8 — A failed next page doesn't auto-retry.** Otherwise `onEndReached` would hammer
  the backend while offline. The footer shows a *Try again* pill instead.
- **D9 — Reset on identity change** uses a MobX `reaction` in `createStore()`. The screen
  reloads when `viewerId` changes.

### Out of scope

Compose, bookmark, delete, post detail and comments, search, agent model and status from
the backend, and the backend cache bugs themselves. The Messages, Chat, Profile, and
Personalize screens keep using `mock-agents.ts`.

---

## Testing

Unit tests with `jest-expo`, colocated as `*.test.ts`, the same as the auth work. This
covers the API client, relative time, the adapter, `FeedState`, `FeedStore`, and
`createStore`. The screen is verified manually on a device or simulator, because no
component-testing library is installed.

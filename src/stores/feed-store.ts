import { makeAutoObservable, runInAction } from 'mobx';

import type { FeedPost, PostDto } from '@/models/social';
import { createPost, getPosts, likePost } from '@/utils/api/social-api-client';
import { toFeedPost } from '@/utils/to-feed-post';

export const PAGE_SIZE = 20;

type LikeOverride = { liked: boolean };

// Paginated feed from GET /api/posts with optimistic likes and compose.
// Backend quirks handled here (see docs/superpowers/specs/2026-09-27-feed-data-layer-design.md):
//  - the list cache ignores the page number, so a reply for a different page ends paging;
//  - likes don't invalidate that cache, so like overrides survive refreshes until reset.
export class FeedStore {
  private dtos: PostDto[] = [];
  private page = 0;
  private generation = 0;
  private likeOverrides: Record<string, LikeOverride> = {};
  private likesInFlight = new Set<string>();

  loading = false;
  refreshing = false;
  loadingMore = false;
  posting = false;
  exhausted = false;
  error?: string = undefined;
  nextPageError = false;

  constructor(private readonly getViewerId: () => string | undefined) {
    makeAutoObservable<FeedStore, 'likesInFlight'>(this, { likesInFlight: false });
  }

  get posts(): FeedPost[] {
    const viewerId = this.getViewerId();
    return this.dtos.map((dto) => {
      const post = toFeedPost(dto, viewerId);
      const override = this.likeOverrides[post.id];
      if (!override || override.liked === post.likedByMe) return post;
      return {
        ...post,
        likedByMe: override.liked,
        likeCount: Math.max(0, post.likeCount + (override.liked ? 1 : -1)),
      };
    });
  }

  loadFirstPage = async (mode: 'initial' | 'refresh' = 'initial'): Promise<void> => {
    const generation = ++this.generation;
    runInAction(() => {
      if (mode === 'refresh') this.refreshing = true;
      else this.loading = true;
      this.error = undefined;
      this.nextPageError = false;
    });

    try {
      const result = await getPosts(1, PAGE_SIZE);
      if (generation !== this.generation) return;
      runInAction(() => {
        // Swap in only on success, so a failed refresh never blanks the list.
        this.dtos = result.items;
        this.page = 1;
        this.exhausted = result.items.length < PAGE_SIZE || result.pagination.totalPages <= 1;
      });
    } catch {
      if (generation !== this.generation) return;
      runInAction(() => {
        this.error = "Couldn't load the feed.";
      });
    } finally {
      if (generation === this.generation) {
        runInAction(() => {
          this.loading = false;
          this.refreshing = false;
        });
      }
    }
  };

  loadNextPage = async (): Promise<void> => {
    if (this.loading || this.loadingMore || this.exhausted || this.nextPageError || this.page === 0) return;
    const generation = this.generation;
    const requested = this.page + 1;
    runInAction(() => {
      this.loadingMore = true;
    });

    try {
      const result = await getPosts(requested, PAGE_SIZE);
      if (generation !== this.generation) return;
      runInAction(() => {
        if (result.pagination.currentPage !== requested) {
          // Stale cached page: appending would duplicate posts forever.
          this.exhausted = true;
          return;
        }
        const seen = new Set(this.dtos.map((d) => d.postId));
        this.dtos = [...this.dtos, ...result.items.filter((d) => !seen.has(d.postId))];
        this.page = requested;
        this.exhausted = requested >= result.pagination.totalPages || result.items.length === 0;
      });
    } catch {
      if (generation !== this.generation) return;
      // No auto-retry: onEndReached would hammer the backend while offline.
      runInAction(() => {
        this.nextPageError = true;
      });
    } finally {
      runInAction(() => {
        this.loadingMore = false;
      });
    }
  };

  retryNextPage = (): Promise<void> => {
    this.nextPageError = false;
    return this.loadNextPage();
  };

  toggleLike = async (postId: string): Promise<void> => {
    if (this.likesInFlight.has(postId)) return;
    const post = this.posts.find((p) => p.id === postId);
    if (!post) return;

    const previous = this.likeOverrides[postId];
    const next = !post.likedByMe;
    this.likesInFlight.add(postId);
    runInAction(() => {
      this.likeOverrides = { ...this.likeOverrides, [postId]: { liked: next } };
    });

    try {
      await likePost(postId, next);
    } catch {
      runInAction(() => {
        const overrides = { ...this.likeOverrides };
        if (previous) overrides[postId] = previous;
        else delete overrides[postId];
        this.likeOverrides = overrides;
      });
    } finally {
      this.likesInFlight.delete(postId);
    }
  };

  /** Returns true when the post was created; the feed then reloads from page 1. */
  submitPost = async (text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed || this.posting) return false;
    runInAction(() => {
      this.posting = true;
    });
    try {
      await createPost(trimmed);
      void this.loadFirstPage('refresh');
      return true;
    } catch {
      return false;
    } finally {
      runInAction(() => {
        this.posting = false;
      });
    }
  };

  reset = (): void => {
    this.generation++;
    this.dtos = [];
    this.page = 0;
    this.likeOverrides = {};
    this.likesInFlight.clear();
    this.loading = false;
    this.refreshing = false;
    this.loadingMore = false;
    this.exhausted = false;
    this.error = undefined;
    this.nextPageError = false;
  };
}

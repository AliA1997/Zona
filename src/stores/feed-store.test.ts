import { FeedStore, PAGE_SIZE } from '@/stores/feed-store';
import { createPost, getPosts, likePost } from '@/utils/api/social-api-client';

jest.mock('@/utils/api/social-api-client', () => ({
  getPosts: jest.fn(),
  likePost: jest.fn(),
  createPost: jest.fn(),
}));

const mockedGetPosts = getPosts as jest.Mock;
const mockedLikePost = likePost as jest.Mock;
const mockedCreatePost = createPost as jest.Mock;

const dto = (id: string) => ({
  postId: id,
  content: `post ${id}`,
  postCreatedAt: '2026-11-14T10:00:00Z',
  username: 'atlas',
  likers: [],
  likeCount: 0,
});

const page = (ids: string[], currentPage: number, totalPages: number) => ({
  items: ids.map(dto),
  pagination: { itemsPerPage: PAGE_SIZE, currentPage, totalItems: totalPages * PAGE_SIZE, totalPages },
});

const fullPage = (prefix: string, currentPage: number, totalPages: number) =>
  page(
    Array.from({ length: PAGE_SIZE }, (_, i) => `${prefix}${i}`),
    currentPage,
    totalPages
  );

describe('FeedStore', () => {
  let store: FeedStore;

  beforeEach(() => {
    jest.resetAllMocks();
    store = new FeedStore(() => 'viewer-1');
  });

  it('loads the first page from the backend', async () => {
    mockedGetPosts.mockResolvedValue(page(['a', 'b'], 1, 1));

    await store.loadFirstPage();

    expect(mockedGetPosts).toHaveBeenCalledWith(1, PAGE_SIZE);
    expect(store.posts.map((p) => p.id)).toEqual(['a', 'b']);
    expect(store.exhausted).toBe(true);
    expect(store.loading).toBe(false);
  });

  it('appends the next page and skips duplicates', async () => {
    mockedGetPosts.mockResolvedValueOnce(fullPage('a', 1, 3));
    await store.loadFirstPage();
    mockedGetPosts.mockResolvedValueOnce(page(['a0', 'z'], 2, 3));

    await store.loadNextPage();

    expect(store.posts).toHaveLength(PAGE_SIZE + 1);
    expect(store.exhausted).toBe(false);
  });

  it('stops paging when the backend returns a stale cached page', async () => {
    mockedGetPosts.mockResolvedValueOnce(fullPage('a', 1, 3));
    await store.loadFirstPage();
    mockedGetPosts.mockResolvedValueOnce(fullPage('a', 1, 3));

    await store.loadNextPage();

    expect(store.posts).toHaveLength(PAGE_SIZE);
    expect(store.exhausted).toBe(true);
  });

  it('keeps the old list when a refresh fails', async () => {
    mockedGetPosts.mockResolvedValueOnce(page(['a'], 1, 1));
    await store.loadFirstPage();
    mockedGetPosts.mockRejectedValueOnce(new Error('offline'));

    await store.loadFirstPage('refresh');

    expect(store.posts.map((p) => p.id)).toEqual(['a']);
    expect(store.error).toBeDefined();
    expect(store.refreshing).toBe(false);
  });

  it('likes optimistically and rolls back on failure', async () => {
    mockedGetPosts.mockResolvedValue(page(['a'], 1, 1));
    await store.loadFirstPage();
    let fail: (e: Error) => void = () => {};
    mockedLikePost.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      })
    );

    const pending = store.toggleLike('a');
    expect(store.posts[0]).toMatchObject({ likedByMe: true, likeCount: 1 });

    fail(new Error('500'));
    await pending;
    expect(store.posts[0]).toMatchObject({ likedByMe: false, likeCount: 0 });
  });

  it('ignores a second like tap while one is in flight', async () => {
    mockedGetPosts.mockResolvedValue(page(['a'], 1, 1));
    await store.loadFirstPage();
    mockedLikePost.mockResolvedValue(undefined);

    await Promise.all([store.toggleLike('a'), store.toggleLike('a')]);

    expect(mockedLikePost).toHaveBeenCalledTimes(1);
    expect(mockedLikePost).toHaveBeenCalledWith('a', true);
  });

  it('creates a post and reloads the feed', async () => {
    mockedCreatePost.mockResolvedValue(undefined);
    mockedGetPosts.mockResolvedValue(page(['new'], 1, 1));

    await expect(store.submitPost('  hello  ')).resolves.toBe(true);

    expect(mockedCreatePost).toHaveBeenCalledWith('hello');
    expect(mockedGetPosts).toHaveBeenCalled();
  });

  it('does not post empty text', async () => {
    await expect(store.submitPost('   ')).resolves.toBe(false);
    expect(mockedCreatePost).not.toHaveBeenCalled();
  });

  it('reports failure when the post request fails', async () => {
    mockedCreatePost.mockRejectedValue(new Error('500'));

    await expect(store.submitPost('hi')).resolves.toBe(false);
    expect(store.posting).toBe(false);
  });

  it('drops a response that lands after a reset', async () => {
    let finish: (value: unknown) => void = () => {};
    mockedGetPosts.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );

    const pending = store.loadFirstPage();
    store.reset();
    finish(page(['old-user-post'], 1, 1));
    await pending;

    expect(store.posts).toEqual([]);
  });
});
